import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Document from "../src/models/document.model.js";
import AuditLog from "../src/models/auditLog.model.js";
import { signAccessToken } from "../src/utils/token.utils.js";
import { supabase, SUPABASE_BUCKET } from "../src/config/supabase.js";
import { encryptBuffer, computeSha256 } from "../src/utils/encryption.utils.js";

describe("My Documents Listing & Secure Download API Suite", () => {
  let server;
  let baseUrl;
  let userA;
  let userAToken;
  let userB;
  let userBToken;
  let adminUser;
  let adminUserToken;

  let docA;
  let docB;
  let tamperedTagDoc;
  let integrityMismatchDoc;

  const originalPlaintextContent = "Top Secret Confidential Payload for User A - AES-256-GCM Verification";
  const originalPlaintextBuffer = Buffer.from(originalPlaintextContent, "utf-8");
  const testStorageKeys = [];

  before(async () => {
    // Connect to MongoDB Atlas
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const unique = Date.now();

    // Create User A
    userA = await User.create({
      name: "Alice Owner",
      email: `alice_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPurposesOnly12345678901234567890",
      role: "USER",
    });
    userAToken = signAccessToken({ id: userA._id.toString(), role: userA.role });

    // Create User B (Attacker / Unauthorized user)
    userB = await User.create({
      name: "Bob Attacker",
      email: `bob_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPurposesOnly12345678901234567890",
      role: "USER",
    });
    userBToken = signAccessToken({ id: userB._id.toString(), role: userB.role });

    // Create Admin User
    adminUser = await User.create({
      name: "Admin Superuser",
      email: `admin_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPurposesOnly12345678901234567890",
      role: "ADMIN",
    });
    adminUserToken = signAccessToken({ id: adminUser._id.toString(), role: adminUser.role });

    // 1. Upload Document A to Supabase
    const encResultA = encryptBuffer(originalPlaintextBuffer);
    const storageKeyA = `${userA._id}/docA-${unique}.enc`;
    testStorageKeys.push(storageKeyA);

    await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKeyA, encResultA.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    // Save Document A in MongoDB
    docA = await Document.create({
      owner: userA._id,
      originalName: "alice-classified-report.pdf",
      storageKey: storageKeyA,
      mimeType: "application/pdf",
      sizeBytes: originalPlaintextBuffer.length,
      encryption: {
        algorithm: encResultA.algorithm,
        iv: encResultA.iv,
        authTag: encResultA.authTag,
        keyVersion: encResultA.keyVersion,
      },
      integrity: {
        algorithm: "SHA-256",
        hash: computeSha256(originalPlaintextBuffer),
      },
      status: "ACTIVE",
    });

    // 2. Upload Document B to Supabase
    const plaintextB = Buffer.from("Bob's personal notes", "utf-8");
    const encResultB = encryptBuffer(plaintextB);
    const storageKeyB = `${userB._id}/docB-${unique}.enc`;
    testStorageKeys.push(storageKeyB);

    await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKeyB, encResultB.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    // Save Document B in MongoDB
    docB = await Document.create({
      owner: userB._id,
      originalName: "bobs-personal-notes.txt",
      storageKey: storageKeyB,
      mimeType: "text/plain",
      sizeBytes: plaintextB.length,
      encryption: {
        algorithm: encResultB.algorithm,
        iv: encResultB.iv,
        authTag: encResultB.authTag,
        keyVersion: encResultB.keyVersion,
      },
      integrity: {
        algorithm: "SHA-256",
        hash: computeSha256(plaintextB),
      },
      status: "ACTIVE",
    });

    // 3. Upload ciphertext for Tampered Tag Test
    const storageKeyTamperedTag = `${userA._id}/docTamperedTag-${unique}.enc`;
    testStorageKeys.push(storageKeyTamperedTag);
    await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKeyTamperedTag, encResultA.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    tamperedTagDoc = await Document.create({
      owner: userA._id,
      originalName: "tampered-tag.pdf",
      storageKey: storageKeyTamperedTag,
      mimeType: "application/pdf",
      sizeBytes: originalPlaintextBuffer.length,
      encryption: {
        algorithm: encResultA.algorithm,
        iv: encResultA.iv,
        authTag: "00112233445566778899aabbccddeeff", // Corrupted auth tag
        keyVersion: encResultA.keyVersion,
      },
      integrity: {
        algorithm: "SHA-256",
        hash: computeSha256(originalPlaintextBuffer),
      },
      status: "ACTIVE",
    });

    // 4. Upload ciphertext for Hash Mismatch Test
    const storageKeyHashMismatch = `${userA._id}/docHashMismatch-${unique}.enc`;
    testStorageKeys.push(storageKeyHashMismatch);
    await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKeyHashMismatch, encResultA.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    integrityMismatchDoc = await Document.create({
      owner: userA._id,
      originalName: "hash-mismatch.pdf",
      storageKey: storageKeyHashMismatch,
      mimeType: "application/pdf",
      sizeBytes: originalPlaintextBuffer.length,
      encryption: {
        algorithm: encResultA.algorithm,
        iv: encResultA.iv,
        authTag: encResultA.authTag,
        keyVersion: encResultA.keyVersion,
      },
      integrity: {
        algorithm: "SHA-256",
        hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // Mismatched hash
      },
      status: "ACTIVE",
    });
  });

  after(async () => {
    // Prune test storage objects from Supabase
    if (testStorageKeys.length > 0) {
      await supabase.storage.from(SUPABASE_BUCKET).remove(testStorageKeys);
    }

    // Prune test records from MongoDB
    const testUserIds = [userA?._id, userB?._id, adminUser?._id].filter(Boolean);
    await Document.deleteMany({ owner: { $in: testUserIds } });
    await AuditLog.collection.deleteMany({ actor: { $in: testUserIds } });
    await User.deleteMany({ _id: { $in: testUserIds } });

    server.close();
    await mongoose.connection.close();
  });

  /* =========================================================
     PART 1: LISTING & ISOLATION TESTS
     ========================================================= */

  it("1. should reject unauthenticated document listing with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/documents`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  it("2. should allow authenticated user to list their own documents", async () => {
    const res = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.documents));
    assert.ok(body.documents.length >= 1);

    const found = body.documents.find((d) => d.id === docA._id.toString());
    assert.ok(found, "Document A should be in User A's listing");
    assert.strictEqual(found.originalName, "alice-classified-report.pdf");
    assert.strictEqual(found.mimeType, "application/pdf");
  });

  it("3. should NOT list another user's documents (multi-tenant boundary enforcement)", async () => {
    // User A queries their documents
    const resA = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const bodyA = await resA.json();
    assert.strictEqual(resA.status, 200);
    const hasDocB = bodyA.documents.some((d) => d.id === docB._id.toString());
    assert.strictEqual(hasDocB, false, "User A must never see User B's document");

    // User B queries their documents
    const resB = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    const bodyB = await resB.json();
    assert.strictEqual(resB.status, 200);
    const hasDocA = bodyB.documents.some((d) => d.id === docA._id.toString());
    assert.strictEqual(hasDocA, false, "User B must never see User A's document");
  });

  it("4. should NOT expose sensitive encryption metadata in listing response", async () => {
    const res = await fetch(`${baseUrl}/api/documents`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200);

    const doc = body.documents.find((d) => d.id === docA._id.toString());
    assert.ok(doc);
    assert.strictEqual(doc.encryption, undefined, "encryption object must not be exposed");
    assert.strictEqual(doc.iv, undefined, "IV must not be exposed");
    assert.strictEqual(doc.authTag, undefined, "authTag must not be exposed");
    assert.strictEqual(doc.storageKey, undefined, "storageKey must not be exposed");
    assert.strictEqual(doc.integrity?.hash, undefined, "raw integrity hash must not be exposed");
  });

  it("5. should support search and file-type filtering in listing", async () => {
    // Search for 'classified'
    const resSearch = await fetch(`${baseUrl}/api/documents?search=classified`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const bodySearch = await resSearch.json();
    assert.strictEqual(resSearch.status, 200);
    assert.ok(bodySearch.documents.some((d) => d.originalName.includes("classified")));

    // Filter by type 'pdf'
    const resType = await fetch(`${baseUrl}/api/documents?type=pdf`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const bodyType = await resType.json();
    assert.strictEqual(resType.status, 200);
    assert.ok(bodyType.documents.every((d) => d.mimeType === "application/pdf"));
  });

  /* =========================================================
     PART 2: SECURE DOWNLOAD & DECRYPTION TESTS
     ========================================================= */

  it("6. should reject unauthenticated download with 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docA._id}/download`);
    assert.strictEqual(res.status, 401);
  });

  it("7. should reject unauthorized user downloading another user's document with 403 Forbidden", async () => {
    // User B attempts to download User A's document
    const res = await fetch(`${baseUrl}/api/documents/${docA._id}/download`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("permission") || body.message.includes("Access denied"));

    // Verify audit log captured the denied attempt
    const deniedLog = await AuditLog.findOne({
      actor: userB._id,
      action: "DOCUMENT_DOWNLOAD",
      outcome: "DENIED",
      resourceId: docA._id.toString(),
    });
    assert.ok(deniedLog, "Access denial must be audited in MongoDB");
  });

  it("8. should deny admin download without explicit ownership or granted permission (No Admin Bypass)", async () => {
    // Admin attempts to download User A's confidential document
    const res = await fetch(`${baseUrl}/api/documents/${docA._id}/download`, {
      headers: { Authorization: `Bearer ${adminUserToken}` },
    });
    assert.strictEqual(res.status, 403, "Admin must NOT bypass document authorization");
  });

  it("9. should successfully download, decrypt, and verify document byte-for-byte for authorized owner", async () => {
    const res = await fetch(`${baseUrl}/api/documents/${docA._id}/download`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(res.headers.get("content-type"), "application/pdf");
    assert.ok(res.headers.get("content-disposition")?.includes("alice-classified-report.pdf"));

    const downloadedBytes = Buffer.from(await res.arrayBuffer());

    // Verify downloaded buffer strictly matches original plaintext byte-for-byte
    assert.strictEqual(downloadedBytes.length, originalPlaintextBuffer.length);
    assert.ok(downloadedBytes.equals(originalPlaintextBuffer));

    // Verify audit log recorded the successful download
    const successLog = await AuditLog.findOne({
      actor: userA._id,
      action: "DOCUMENT_DOWNLOAD",
      outcome: "SUCCESS",
      resourceId: docA._id.toString(),
    });
    assert.ok(successLog, "Successful download must be audited in MongoDB");
  });

  it("10. should safely return 502 if storage object is missing from Supabase", async () => {
    // Create doc with missing storage object
    const missingStorageDoc = await Document.create({
      owner: userA._id,
      originalName: "missing-file.txt",
      storageKey: `${userA._id}/non-existent-file-${Date.now()}.enc`,
      mimeType: "text/plain",
      sizeBytes: 100,
      encryption: {
        algorithm: "AES-256-GCM",
        iv: crypto.randomBytes(12).toString("hex"),
        authTag: crypto.randomBytes(16).toString("hex"),
        keyVersion: "1",
      },
      integrity: {
        algorithm: "SHA-256",
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      status: "ACTIVE",
    });

    const res = await fetch(`${baseUrl}/api/documents/${missingStorageDoc._id}/download`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.status, 502);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("storage"));

    await Document.findByIdAndDelete(missingStorageDoc._id);
  });

  it("11. should reject download if GCM authentication tag is incorrect/tampered", async () => {
    const res = await fetch(`${baseUrl}/api/documents/${tamperedTagDoc._id}/download`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("Authentication tag verification failed"));
  });

  it("12. should reject download if SHA-256 integrity hash does not match decrypted content", async () => {
    const res = await fetch(`${baseUrl}/api/documents/${integrityMismatchDoc._id}/download`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });

    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("Cryptographic integrity verification failed"));
  });
});
