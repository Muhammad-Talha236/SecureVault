import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logAuditEvent, sanitizeAuditMetadata } from "../src/services/audit.service.js";

describe("Audit metadata protection", () => {
  it("rejects invalid actions before attempting a database write", async () => {
    await assert.rejects(() => logAuditEvent({ action: "PASSWORD_EXFILTRATION" }), /Invalid audit action/);
  });

  it("strips credential-like keys recursively and leaves safe context", () => {
    const safe = sanitizeAuditMetadata({
      reason: "Invalid credentials",
      user: { email: "person@example.test", accessToken: "jwt-value", password: "guess" },
      apiKey: "secret-key",
      ciphertext: Buffer.from("private bytes"),
      diagnostic: "Bearer abc123 password=plaintext eyJabcdefghijk.abcdefghijk.abcdefghijk",
      count: 2,
    });
    assert.deepEqual(safe, {
      reason: "Invalid credentials",
      user: { email: "person@example.test" },
      diagnostic: "Bearer [REDACTED] password=[REDACTED] [REDACTED_JWT]",
      count: 2,
    });
  });

  it("bounds metadata recursion and array size", () => {
    const values = Array.from({ length: 150 }, (_, index) => index);
    const safe = sanitizeAuditMetadata({ values });
    assert.equal(safe.values.length, 100);
    assert.equal(safe.values[0], 0);
  });
});
