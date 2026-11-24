import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import RefreshToken from "../src/models/refreshToken.model.js";
import Document from "../src/models/document.model.js";
import { hashPassword } from "../src/utils/password.utils.js";
import { signAccessToken } from "../src/utils/token.utils.js";

describe("Authentication Integration & Session Cookie Suite", () => {
  let server;
  let baseUrl;
  let regularUser;
  let adminUser;
  const passwordPlain = "SecurePass123!";

  before(async () => {
    // Connect to MongoDB Atlas
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const unique = Date.now();
    const passwordHash = await hashPassword(passwordPlain);

    // Create a regular user
    regularUser = await User.create({
      name: "Standard User",
      email: `regular_${unique}@securevault.test`,
      passwordHash,
      role: "USER",
    });

    // Create an admin user
    adminUser = await User.create({
      name: "Admin User",
      email: `admin_${unique}@securevault.test`,
      passwordHash,
      role: "ADMIN",
    });
  });

  after(async () => {
    const userIds = [regularUser?._id, adminUser?._id].filter(Boolean);
    await Document.deleteMany({ owner: { $in: userIds } });
    await RefreshToken.deleteMany({ user: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });

    server.close();
    await mongoose.connection.close();
  });

  // Helper to extract cookies from response
  const extractCookies = (res) => {
    const rawCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);

    const parsed = {};
    for (const c of rawCookies) {
      const parts = c.split(";")[0].split("=");
      if (parts[0] && parts[1]) {
        parsed[parts[0].trim()] = parts[1].trim();
      }
    }

    const cookieString = Object.entries(parsed)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    return { parsed, cookieString, rawCookies };
  };

  it("1. should successfully login as USER and receive HttpOnly accessToken and refreshToken cookies", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.email, regularUser.email);

    const { parsed, rawCookies } = extractCookies(res);
    assert.ok(parsed.accessToken, "Response must include accessToken cookie");
    assert.ok(parsed.refreshToken, "Response must include refreshToken cookie");

    // Verify HttpOnly security flag on cookies
    assert.ok(
      rawCookies.some((c) => c.includes("accessToken=") && c.toLowerCase().includes("httponly")),
      "accessToken must be HttpOnly"
    );
    assert.ok(
      rawCookies.some((c) => c.includes("refreshToken=") && c.toLowerCase().includes("httponly")),
      "refreshToken must be HttpOnly"
    );
  });

  it("2. should allow logged-in user to access GET /api/documents via session cookie without 401", async () => {
    // 1. Login to get cookies
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });
    assert.strictEqual(loginRes.status, 200);
    const { cookieString } = extractCookies(loginRes);

    // 2. Fetch documents with the session cookie
    const docRes = await fetch(`${baseUrl}/api/documents`, {
      method: "GET",
      headers: { Cookie: cookieString },
    });

    assert.strictEqual(docRes.status, 200, "Documents request with session cookie must return 200 OK");
    const docBody = await docRes.json();
    assert.strictEqual(docBody.success, true);
    assert.ok(Array.isArray(docBody.documents));
  });

  it("3. should keep session valid across page refresh via GET /api/auth/me", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });
    const { cookieString } = extractCookies(loginRes);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      headers: { Cookie: cookieString },
    });

    assert.strictEqual(meRes.status, 200);
    const meBody = await meRes.json();
    assert.strictEqual(meBody.success, true);
    assert.strictEqual(meBody.user.id, regularUser._id.toString());
  });

  it("4. should successfully rotate session via POST /api/auth/refresh when access token expires", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });
    const { parsed } = extractCookies(loginRes);

    // Call refresh with the refreshToken cookie
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refreshToken=${parsed.refreshToken}` },
    });

    assert.strictEqual(refreshRes.status, 200);
    const refreshBody = await refreshRes.json();
    assert.strictEqual(refreshBody.success, true);

    const newCookies = extractCookies(refreshRes);
    assert.ok(newCookies.parsed.accessToken, "Rotated response must include fresh accessToken");
    assert.ok(newCookies.parsed.refreshToken, "Rotated response must include fresh refreshToken");
    assert.notStrictEqual(newCookies.parsed.refreshToken, parsed.refreshToken, "Refresh token must rotate");
  });

  it("5. should handle concurrent refresh requests safely within grace period without token rotation conflicts", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });
    const { parsed } = extractCookies(loginRes);
    const initialRefreshToken = parsed.refreshToken;

    // Simulate 3 simultaneous requests to /api/auth/refresh using the same refresh token
    const [res1, res2, res3] = await Promise.all([
      fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${initialRefreshToken}` },
      }),
      fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${initialRefreshToken}` },
      }),
      fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${initialRefreshToken}` },
      }),
    ]);

    // All concurrent requests within the leeway grace period must succeed with 200 OK
    assert.strictEqual(res1.status, 200, "First concurrent refresh must succeed");
    assert.strictEqual(res2.status, 200, "Second concurrent refresh must be tolerated within grace period");
    assert.strictEqual(res3.status, 200, "Third concurrent refresh must be tolerated within grace period");

    // The session must NOT be terminated
    const latestCookie = extractCookies(res1).cookieString || extractCookies(res2).cookieString;
    const testDocRes = await fetch(`${baseUrl}/api/documents`, {
      headers: { Cookie: latestCookie },
    });
    assert.strictEqual(testDocRes.status, 200, "Session must remain valid after concurrent refresh calls");
  });

  it("6. should properly clear cookies and reject access after logout", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regularUser.email, password: passwordPlain }),
    });
    const { parsed, cookieString } = extractCookies(loginRes);

    // Call logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookieString },
    });
    assert.strictEqual(logoutRes.status, 200);

    // Verify refresh token in DB is revoked
    const dbToken = await RefreshToken.findOne({ user: regularUser._id }).sort({ createdAt: -1 });
    assert.ok(dbToken.revokedAt, "Refresh token must be marked revoked upon logout");

    // Attempt to access documents without session should fail with 401
    const unauthRes = await fetch(`${baseUrl}/api/documents`);
    assert.strictEqual(unauthRes.status, 401);
    const unauthBody = await unauthRes.json();
    assert.strictEqual(unauthBody.message, "Authentication required. Please log in.");
  });

  it("7. should support ADMIN login and session access to documents", async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminUser.email, password: passwordPlain }),
    });
    assert.strictEqual(loginRes.status, 200);
    const { cookieString } = extractCookies(loginRes);

    const docRes = await fetch(`${baseUrl}/api/documents`, {
      headers: { Cookie: cookieString },
    });
    assert.strictEqual(docRes.status, 200);
  });

  it("8. should permit CORS requests with credentials from both localhost and 127.0.0.1", async () => {
    const resLocalhost = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.strictEqual(resLocalhost.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.strictEqual(resLocalhost.headers.get("access-control-allow-credentials"), "true");

    const resIp = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "http://127.0.0.1:5173" },
    });
    assert.strictEqual(resIp.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
    assert.strictEqual(resIp.headers.get("access-control-allow-credentials"), "true");
  });
});
