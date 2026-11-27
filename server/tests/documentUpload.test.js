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
import { decryptBuffer } from "../src/utils/encryption.utils.js";

describe("Document Upload API & Security Verification", () => {
  let server;
  let baseUrl;
  let testUser;
  let testUserToken;
  let otherUser;

  before(async () => {
    // Connect to MongoDB Atlas test db
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Create unique test users
    const unique = Date.now();
    testUser = await User.create({
      name: "Upload Test User",
      email: `upload_test_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPurposesOnly12345678901234567890",
      role: "USER",
    });

    otherUser = await User.create({
      name: "Other User",
      email: `other_test_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPurposesOnly12345678901234567890",
      role: "USER",
    });

    testUserToken = signAccessToken({ id: testUser._id.toString(), role: testUser.role });
  });

  after(async () => {
    // Cleanup created test records
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (otherUser) await User.deleteOne({ _id: otherUser._id });
    await Document.deleteMany({ owner: { $in: [testUser?._id, otherUser?._id] } });
    await AuditLog.collection.deleteMany({ actor: { $in: [testUser?._id, otherUser?._id] } });

    server.close();
    await mongoose.connection.close();
  });

  it("1. should reject unauthenticated upload with 401 Unauthorized", async () => {
    const formData = new FormData();
    const blob = new Blob(["Confidential Report Content"], { type: "application/pdf" });
    formData.append("file", blob, "report.pdf");

    const res = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Authentication required/i);
  });

  it("2. should reject unsupported file types with 400 Bad Request", async () => {
    const formData = new FormData();
    const blob = new Blob(["malicious script"], { type: "application/x-msdownload" });
    formData.append("file", blob, "malware.exe");

    const res = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Unsupported file extension/i);
  });

  it("3. should reject an empty file (0 bytes) with 400 Bad Request", async () => {
    const formData = new FormData();
    const blob = new Blob([], { type: "application/pdf" });
    formData.append("file", blob, "empty.pdf");

    const res = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /empty or corrupt/i);
  });

  it("4. should reject a file exceeding the 25 MB size limit with 413 Payload Too Large", async () => {
    const formData = new FormData();
    // Simulate oversized buffer (26 MB)
    const largeBuffer = Buffer.alloc(26 * 1024 * 1024, "a");
    const blob = new Blob([largeBuffer], { type: "application/pdf" });
    formData.append("file", blob, "oversized.pdf");

    const res = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /exceeds the allowed size limit of 25 MB|exceeds the maximum upload limit/i);
  });

  it("5. should successfully upload, encrypt, and persist a valid authenticated document", async () => {
    const plaintext = "This is a highly confidential document for SecureVault test verification.";
    const formData = new FormData();
    const blob = new Blob([plaintext], { type: "application/pdf" });
    formData.append("file", blob, "financial_audit.pdf");

    // Attempt to pass spoofed owner in body to test ownership enforcement
    formData.append("owner", otherUser._id.toString());

    const res = await fetch(`${baseUrl}/api/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
      body: formData,
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.document.originalName, "financial_audit.pdf");
    assert.equal(data.document.mimeType, "application/pdf");
    assert.equal(data.document.sizeBytes, Buffer.byteLength(plaintext));

    // 8. User ownership enforcement: check document in MongoDB
    const docInDb = await Document.findById(data.document.id);
    assert.ok(docInDb);
    assert.equal(docInDb.owner.toString(), testUser._id.toString()); // Must equal testUser, NOT otherUser
    assert.notEqual(docInDb.owner.toString(), otherUser._id.toString());
    assert.equal(docInDb.status, "ACTIVE");
    assert.equal(docInDb.encryption.algorithm, "AES-256-GCM");
    assert.ok(docInDb.encryption.iv);
    assert.ok(docInDb.encryption.authTag);
    assert.ok(docInDb.integrity.hash);

    // 9. Verify stored content in Supabase is ciphertext (not plaintext) and decrypts properly
    const { data: downloadedBlob, error: downloadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(docInDb.storageKey);

    assert.equal(downloadError, null);
    const downloadedBuffer = Buffer.from(await downloadedBlob.arrayBuffer());

    // Ciphertext must NOT match plaintext
    assert.notEqual(downloadedBuffer.toString("utf8"), plaintext);

    // Decryption using metadata must reproduce exact plaintext
    const decrypted = decryptBuffer(downloadedBuffer, {
      iv: docInDb.encryption.iv,
      authTag: docInDb.encryption.authTag,
      algorithm: docInDb.encryption.algorithm,
      keyVersion: docInDb.encryption.keyVersion,
    });
    assert.equal(decrypted.toString("utf8"), plaintext);

    // 10. Audit event creation verification
    const auditLog = await AuditLog.findOne({
      actor: testUser._id,
      action: "DOCUMENT_UPLOAD",
      resourceId: docInDb._id.toString(),
    });
    assert.ok(auditLog);
    assert.equal(auditLog.outcome, "SUCCESS");
    assert.equal(auditLog.metadata?.originalName, "financial_audit.pdf");

    // Clean up Supabase storage object
    await supabase.storage.from(SUPABASE_BUCKET).remove([docInDb.storageKey]);
  });

  it("6. should handle Supabase upload failure gracefully without persisting MongoDB record", async () => {
    // Temporarily mock supabase.storage.from to simulate upload error
    const originalFrom = supabase.storage.from;
    supabase.storage.from = () => ({
      upload: async () => ({ error: { message: "Simulated Supabase storage cluster outage" } }),
      remove: async () => ({ error: null }),
    });

    try {
      const formData = new FormData();
      const blob = new Blob(["Failure test content"], { type: "text/plain" });
      formData.append("file", blob, "test_failure.txt");

      const res = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUserToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 502);
      const data = await res.json();
      assert.equal(data.success, false);

      // Verify no document was saved in MongoDB
      const doc = await Document.findOne({ originalName: "test_failure.txt" });
      assert.equal(doc, null);

      // Verify audit log recorded the failure
      const failureAudit = await AuditLog.findOne({
        actor: testUser._id,
        action: "DOCUMENT_UPLOAD",
        outcome: "FAILURE",
        "metadata.originalName": "test_failure.txt",
      });
      assert.ok(failureAudit);
    } finally {
      supabase.storage.from = originalFrom;
    }
  });

  it("7. should cleanup uploaded ciphertext in Supabase if MongoDB persistence fails", async () => {
    let cleanedUpKey = null;
    const originalFrom = supabase.storage.from;
    const originalDocCreate = Document.create;

    // Spy on remove
    supabase.storage.from = (bucket) => {
      const instance = originalFrom.call(supabase.storage, bucket);
      return {
        ...instance,
        upload: instance.upload.bind(instance),
        remove: async (keys) => {
          cleanedUpKey = keys[0];
          return instance.remove(keys);
        },
      };
    };

    // Force Document.create to fail
    Document.create = async () => {
      throw new Error("Simulated MongoDB write collision / validation error");
    };

    try {
      const formData = new FormData();
      const blob = new Blob(["Rollback test content"], { type: "text/plain" });
      formData.append("file", blob, "rollback_test.txt");

      const res = await fetch(`${baseUrl}/api/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUserToken}`,
        },
        body: formData,
      });

      assert.equal(res.status, 500);

      // Verify rollback cleanup was executed on Supabase
      assert.ok(cleanedUpKey);
      assert.match(cleanedUpKey, new RegExp(`^${testUser._id}/`));
    } finally {
      supabase.storage.from = originalFrom;
      Document.create = originalDocCreate;
    }
  });
});
