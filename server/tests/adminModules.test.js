import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Document from "../src/models/document.model.js";
import AuditLog from "../src/models/auditLog.model.js";
import DocumentPermission from "../src/models/documentPermission.model.js";
import { signAccessToken } from "../src/utils/token.utils.js";

describe("Talha's Admin Modules Test Suite", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;
  let standardUser;
  let standardToken;
  let targetUser;
  let testDocument;

  const testUserIds = [];
  const testDocIds = [];

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const unique = Date.now();

    // 1. Create Administrator Account
    adminUser = await User.create({
      name: "Admin Talha",
      email: `admin_talha_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingAdmin12345678901234567890",
      role: "ADMIN",
    });
    testUserIds.push(adminUser._id);
    adminToken = signAccessToken({ id: adminUser._id.toString(), role: adminUser.role });

    // 2. Create Standard User Account
    standardUser = await User.create({
      name: "Standard Client",
      email: `user_standard_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingUser12345678901234567890",
      role: "USER",
    });
    testUserIds.push(standardUser._id);
    standardToken = signAccessToken({ id: standardUser._id.toString(), role: standardUser.role });

    // 3. Create Target User for Role Update
    targetUser = await User.create({
      name: "Target Promotion User",
      email: `target_promo_${unique}@securevault.test`,
      passwordHash: "$2b$12$eXampleHashForTestingPromo12345678901234567890",
      role: "USER",
    });
    testUserIds.push(targetUser._id);

    // 4. Create Test Document owned by standardUser
    testDocument = await Document.create({
      owner: standardUser._id,
      originalName: `confidential-audit-${unique}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1048576,
      storageKey: `${standardUser._id}/doc-${unique}.enc`,
      encryption: {
        algorithm: "AES-256-GCM",
        keyVersion: "1",
        iv: "secretIVStringNotToExpose==",
        authTag: "secretAuthTagNotToExpose==",
      },
      integrity: {
        algorithm: "SHA-256",
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      status: "ACTIVE",
    });
    testDocIds.push(testDocument._id);
  });

  after(async () => {
    // Cleanup created test documents & users
    if (testDocIds.length > 0) {
      await Document.deleteMany({ _id: { $in: testDocIds } });
      await DocumentPermission.deleteMany({ document: { $in: testDocIds } });
    }
    if (testUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: testUserIds } });
      await AuditLog.deleteMany({ actor: { $in: testUserIds } });
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ========================================================
  // 1. Authorization & Role Isolation
  // ========================================================
  describe("Authorization & Access Control", () => {
    it("rejects unauthenticated requests to /api/admin/users with 401", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`);
      assert.equal(res.status, 401);
    });

    it("rejects standard USER role requests to /api/admin/users with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Cookie: `accessToken=${standardToken}`,
        },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /access denied|insufficient permissions|forbidden/i);
    });

    it("allows ADMIN role requests to /api/admin/users", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });
  });

  // ========================================================
  // 2. User Management (GET /api/admin/users)
  // ========================================================
  describe("User Management API", () => {
    it("returns paginated user list with aggregated document counts and no sensitive fields", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.users));
      assert.ok(data.pagination);
      assert.ok(data.pagination.total >= 3);

      const foundStandard = data.users.find((u) => u.id === standardUser._id.toString());
      assert.ok(foundStandard, "Standard test user should be present in results");
      assert.equal(foundStandard.name, standardUser.name);
      assert.equal(foundStandard.email, standardUser.email);
      assert.equal(foundStandard.role, "USER");
      assert.equal(foundStandard.activeDocuments, 1, "Aggregated active document count should be 1");

      // Verify no sensitive fields leak
      for (const u of data.users) {
        assert.equal(u.passwordHash, undefined);
        assert.equal(u.refreshTokenHash, undefined);
        assert.equal(u.currentSessionTokenHash, undefined);
      }
    });

    it("supports search by name or email", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users?search=${encodeURIComponent(standardUser.email)}`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.users.length, 1);
      assert.equal(data.users[0].email, standardUser.email);
    });

    it("supports filtering by role", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users?role=ADMIN`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      for (const u of data.users) {
        assert.equal(u.role, "ADMIN");
      }
    });
  });

  // ========================================================
  // 3. Role Modification & Self-Demotion Prevention (PATCH)
  // ========================================================
  describe("Role Modification & Self-Demotion Guard", () => {
    it("allows administrator to promote a USER to ADMIN", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${targetUser._id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${adminToken}`,
        },
        body: JSON.stringify({ role: "ADMIN" }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.user.role, "ADMIN");

      // Verify persistence in database
      const updatedInDb = await User.findById(targetUser._id);
      assert.equal(updatedInDb.role, "ADMIN");

      // Verify Audit Log entry was recorded
      const log = await AuditLog.findOne({
        actor: adminUser._id,
        action: "ADMIN_ACTION",
        resourceId: targetUser._id.toString(),
      });
      assert.ok(log, "AuditLog should record ADMIN_ACTION");
      assert.equal(log.metadata.newRole, "ADMIN");
    });

    it("strictly BLOCKS administrator from demoting their own account", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${adminUser._id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${adminToken}`,
        },
        body: JSON.stringify({ role: "USER" }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /cannot revoke their own/i);

      // Verify role remains ADMIN in database
      const adminInDb = await User.findById(adminUser._id);
      assert.equal(adminInDb.role, "ADMIN");
    });

    it("rejects invalid roles with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${targetUser._id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${adminToken}`,
        },
        body: JSON.stringify({ role: "SUPER_ROOT" }),
      });

      assert.equal(res.status, 400);
    });
  });

  // ========================================================
  // 4. Document Records API (GET /api/admin/documents)
  // ========================================================
  describe("Document Records & Cryptographic Metadata API", () => {
    it("returns platform-wide document records with owner and cryptographic metadata", async () => {
      const res = await fetch(`${baseUrl}/api/admin/documents`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.documents));
      assert.ok(data.pagination);

      const foundDoc = data.documents.find((d) => d.id === testDocument._id.toString());
      assert.ok(foundDoc, "Test document record should be listed");
      assert.equal(foundDoc.originalName, testDocument.originalName);
      assert.equal(foundDoc.mimeType, "application/pdf");
      assert.equal(foundDoc.status, "ACTIVE");
      assert.equal(foundDoc.encryption.algorithm, "AES-256-GCM");
      assert.equal(foundDoc.encryption.keyVersion, "1");
      assert.equal(foundDoc.integrity.algorithm, "SHA-256");
      assert.equal(foundDoc.owner.name, standardUser.name);
      assert.equal(foundDoc.owner.email, standardUser.email);

      // CRITICAL SECURITY ASSERTION: Internal IV, authTag, and storageKey MUST NOT leak
      for (const d of data.documents) {
        assert.equal(d.encryption.iv, undefined);
        assert.equal(d.encryption.authTag, undefined);
        assert.equal(d.storageKey, undefined);
      }
    });

    it("supports search by filename or owner name/email", async () => {
      const res = await fetch(
        `${baseUrl}/api/admin/documents?search=${encodeURIComponent(testDocument.originalName)}`,
        {
          headers: {
            Cookie: `accessToken=${adminToken}`,
          },
        }
      );

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.documents.length, 1);
      assert.equal(data.documents[0].id, testDocument._id.toString());
    });

    it("supports filter by file format", async () => {
      const res = await fetch(`${baseUrl}/api/admin/documents?type=pdf`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      for (const d of data.documents) {
        assert.equal(d.mimeType, "application/pdf");
      }
    });
  });

  // ========================================================
  // 5. Zero-Knowledge Protection: Zero Admin Download Bypass
  // ========================================================
  describe("Zero-Knowledge Security Boundary", () => {
    it("ensures administrator CANNOT bypass ownership to download another user's document", async () => {
      const res = await fetch(`${baseUrl}/api/documents/${testDocument._id}/download`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      // Admin has no automatic download bypass — must be 403 Forbidden
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /forbidden|access denied/i);
    });
  });

  // ========================================================
  // 6. Roles Overview API (GET /api/admin/roles/overview)
  // ========================================================
  describe("Roles Overview API", () => {
    it("returns active role counts and permissions distribution", async () => {
      const res = await fetch(`${baseUrl}/api/admin/roles/overview`, {
        headers: {
          Cookie: `accessToken=${adminToken}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.overview.totalUsers >= 3);
      assert.ok(data.overview.adminCount >= 1);
      assert.ok(data.overview.userCount >= 1);
      assert.ok(typeof data.overview.activePermissionsCount === "number");
    });
  });

  // ========================================================
  // 7. Public Registration Role Injection Guard
  // ========================================================
  describe("Public Registration Role Tampering Guard", () => {
    it("ignores attempted role injection and registers account as USER", async () => {
      const uniqueReg = Date.now();
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Attacker Trying Admin",
          email: `attacker_admin_${uniqueReg}@securevault.test`,
          password: "SuperSecretPassword123!",
          role: "ADMIN", // Malicious injection attempt
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.user.role, "USER", "Public registration must always assign role USER");

      const createdUser = await User.findById(data.user.id);
      testUserIds.push(createdUser._id);
      assert.equal(createdUser.role, "USER");
    });
  });
});
