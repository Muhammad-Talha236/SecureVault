import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../src/models/user.model.js";
import Document from "../src/models/document.model.js";
import DocumentPermission from "../src/models/documentPermission.model.js";
import AuditLog from "../src/models/auditLog.model.js";
import {
  shareDocument,
  revokePermission,
  updatePermission,
  getSharedWithMe,
  verifyUserAccess,
} from "../src/services/sharing.service.js";

const testContext = {
  ip: "127.0.0.1",
  headers: { "user-agent": "sharing-security-test" },
  get: (header) => header.toLowerCase() === "user-agent" ? "sharing-security-test" : undefined,
};

describe("Document sharing and permission security", { skip: !process.env.MONGODB_URI }, () => {
  let owner, viewer, outsider;
  let document;
  let grant;

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const unique = Date.now();
    owner = await User.create({
      name: "Share Owner", email: `owner_${unique}@securevault.test`,
      passwordHash: "test-only-password-hash", role: "USER",
    });
    viewer = await User.create({
      name: "Shared Viewer", email: `viewer_${unique}@securevault.test`,
      passwordHash: "test-only-password-hash", role: "USER",
    });
    outsider = await User.create({
      name: "Outsider User", email: `outsider_${unique}@securevault.test`,
      passwordHash: "test-only-password-hash", role: "USER",
    });
    document = await Document.create({
      owner: owner._id, originalName: "sharing-test.txt", storageKey: `test/${unique}.enc`,
      mimeType: "text/plain", sizeBytes: 12,
      encryption: { algorithm: "AES-256-GCM", iv: "00".repeat(12), authTag: "00".repeat(16), keyVersion: "v1" },
      integrity: { algorithm: "SHA-256", hash: "00".repeat(32) }, status: "ACTIVE",
    });
  });

  after(async () => {
    if (document) await DocumentPermission.deleteMany({ document: document._id });
    await Document.deleteMany({ owner: { $in: [owner?._id, viewer?._id, outsider?._id].filter(Boolean) } });
    await AuditLog.collection.deleteMany({ actor: { $in: [owner?._id, viewer?._id, outsider?._id].filter(Boolean) } });
    await User.deleteMany({ _id: { $in: [owner?._id, viewer?._id, outsider?._id].filter(Boolean) } });
    await mongoose.disconnect();
  });

  it("rejects nonexistent recipients and unsupported roles", async () => {
    await assert.rejects(
      () => shareDocument(document._id, owner._id, "missing@securevault.test", "VIEWER", null, testContext),
      (error) => error.statusCode === 404
    );
    await assert.rejects(
      () => shareDocument(document._id, owner._id, viewer.email, "OWNER", null, testContext),
      (error) => error.statusCode === 400
    );
  });

  it("rejects unauthorized sharing and owner self-sharing", async () => {
    await assert.rejects(
      () => shareDocument(document._id, outsider._id, viewer.email, "VIEWER", null, testContext),
      (error) => error.statusCode === 403
    );
    await assert.rejects(
      () => shareDocument(document._id, owner._id, owner.email, "VIEWER", null, testContext),
      (error) => error.statusCode === 400
    );
  });

  it("creates one grant and reactivates it after revocation", async () => {
    const shared = await shareDocument(document._id, owner._id, viewer.email, "VIEWER", null, testContext);
    grant = await DocumentPermission.findById(shared.id);
    assert.equal(grant.permission, "VIEWER");
    assert.equal(await DocumentPermission.countDocuments({ document: document._id, user: viewer._id }), 1);

    await revokePermission(document._id, grant._id, owner._id, testContext);
    grant = await DocumentPermission.findById(grant._id);
    assert.equal(grant.status, "REVOKED");

    const reShared = await shareDocument(document._id, owner._id, viewer.email, "EDITOR", null, testContext);
    grant = await DocumentPermission.findById(reShared.id);
    assert.equal(grant.status, "ACTIVE");
    assert.equal(grant.permission, "EDITOR");
    assert.equal(await DocumentPermission.countDocuments({ document: document._id, user: viewer._id }), 1);
  });

  it("rejects expired and revoked grants during authorization", async () => {
    await revokePermission(document._id, grant._id, owner._id, testContext);
    let result = await verifyUserAccess(document._id, viewer._id, "VIEWER");
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "PERMISSION_REVOKED");

    grant.status = "ACTIVE";
    grant.permission = "VIEWER";
    grant.expiresAt = new Date(Date.now() - 1000);
    await grant.save();
    result = await verifyUserAccess(document._id, viewer._id, "VIEWER");
    assert.equal(result.authorized, false);
    assert.equal(result.reason, "PERMISSION_EXPIRED");
  });

  it("validates future expiration updates and supports removing expiration", async () => {
    grant.status = "ACTIVE";
    grant.permission = "VIEWER";
    grant.expiresAt = null;
    await grant.save();

    await assert.rejects(
      () => updatePermission(document._id, grant._id, owner._id, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }, testContext),
      (error) => error.statusCode === 400
    );

    const future = new Date(Date.now() + 60_000);
    const updated = await updatePermission(document._id, grant._id, owner._id, {
      expiresAt: future.toISOString(),
    }, testContext);
    assert.equal(updated.expiresAt.getTime(), future.getTime());

    const removed = await updatePermission(document._id, grant._id, owner._id, {
      expiresAt: null,
    }, testContext);
    assert.equal(removed.expiresAt, null);
  });

  it("preserves owner access and enforces viewer versus editor privilege", async () => {
    assert.equal((await verifyUserAccess(document._id, owner._id, "EDITOR")).authorized, true);
    grant.status = "ACTIVE";
    grant.permission = "VIEWER";
    grant.expiresAt = null;
    await grant.save();
    assert.equal((await verifyUserAccess(document._id, viewer._id, "VIEWER")).authorized, true);
    assert.equal((await verifyUserAccess(document._id, viewer._id, "EDITOR")).reason, "INSUFFICIENT_PRIVILEGE");
  });

  it("excludes expired and revoked grants from Shared With Me", async () => {
    grant.status = "ACTIVE";
    grant.permission = "VIEWER";
    grant.expiresAt = new Date(Date.now() - 1000);
    await grant.save();
    const expiredDocuments = await getSharedWithMe(viewer._id);
    assert.equal(expiredDocuments.some((item) => item.id.toString() === document._id.toString()), false);

    grant.status = "REVOKED";
    grant.expiresAt = null;
    await grant.save();
    const revokedDocuments = await getSharedWithMe(viewer._id);
    assert.equal(revokedDocuments.some((item) => item.id.toString() === document._id.toString()), false);
  });
});
