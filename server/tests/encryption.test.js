import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  encryptBuffer,
  decryptBuffer,
  computeSha256,
  ALGORITHM,
  IV_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
} from "../src/utils/encryption.utils.js";
import {
  decodeAndValidateKey,
  getMasterEncryptionKey,
  getActiveKeyVersion,
  validateKeyConfiguration,
} from "../src/utils/keyManager.utils.js";

// Generate isolated temporary test keys (never logs or exposes actual env keys)
const testKey1 = crypto.randomBytes(32);
const testKey2 = crypto.randomBytes(32);
const testKeyBase64 = testKey1.toString("base64");

describe("Key Management Utilities", () => {
  it("should successfully decode and validate a 32-byte Base64 key", () => {
    const decoded = decodeAndValidateKey(testKeyBase64);
    assert.equal(Buffer.isBuffer(decoded), true);
    assert.equal(decoded.length, 32);
    assert.deepEqual(decoded, testKey1);
  });

  it("should reject missing or empty encryption key configuration", () => {
    assert.throws(
      () => decodeAndValidateKey(""),
      /DOCUMENT_ENCRYPTION_KEY is missing or empty/
    );
    assert.throws(
      () => decodeAndValidateKey(null),
      /DOCUMENT_ENCRYPTION_KEY is missing or empty/
    );
    assert.throws(
      () => decodeAndValidateKey(undefined),
      /DOCUMENT_ENCRYPTION_KEY is missing or empty/
    );
  });

  it("should reject keys with invalid Base64 encoding", () => {
    assert.throws(
      () => decodeAndValidateKey("This is not base64!@#$%^&*()"),
      /DOCUMENT_ENCRYPTION_KEY contains invalid Base64 characters/
    );
  });

  it("should reject keys of incorrect byte lengths (not 32 bytes)", () => {
    // 16 bytes (128 bits) - too short for AES-256
    const shortKey = crypto.randomBytes(16).toString("base64");
    assert.throws(
      () => decodeAndValidateKey(shortKey),
      /expected 32 bytes \(256 bits\), got 16 bytes/
    );

    // 24 bytes (192 bits)
    const midKey = crypto.randomBytes(24).toString("base64");
    assert.throws(
      () => decodeAndValidateKey(midKey),
      /expected 32 bytes \(256 bits\), got 24 bytes/
    );

    // 64 bytes - too long
    const longKey = crypto.randomBytes(64).toString("base64");
    assert.throws(
      () => decodeAndValidateKey(longKey),
      /expected 32 bytes \(256 bits\), got 64 bytes/
    );
  });

  it("should load and validate the configured environment master key", () => {
    const masterKey = getMasterEncryptionKey();
    assert.equal(Buffer.isBuffer(masterKey), true);
    assert.equal(masterKey.length, 32);

    const version = getActiveKeyVersion();
    assert.equal(typeof version, "string");
    assert.equal(version.length > 0, true);

    const config = validateKeyConfiguration();
    assert.equal(config.valid, true);
  });
});

describe("AES-256-GCM Encryption and Decryption Utilities", () => {
  const samplePlaintext = Buffer.from(
    "SecureVault Confidential Document Content: AES-256-GCM Verification Payload",
    "utf8"
  );

  it("1. should encrypt and decrypt a sample Buffer successfully (round-trip integrity)", () => {
    const encrypted = encryptBuffer(samplePlaintext, { key: testKey1 });

    assert.equal(Buffer.isBuffer(encrypted.ciphertext), true);
    assert.notDeepEqual(encrypted.ciphertext, samplePlaintext);
    assert.equal(encrypted.algorithm, ALGORITHM);
    assert.equal(encrypted.iv.length, IV_LENGTH_BYTES * 2); // 12 bytes hex = 24 chars
    assert.equal(encrypted.authTag.length, AUTH_TAG_LENGTH_BYTES * 2); // 16 bytes hex = 32 chars
    assert.equal(encrypted.keyVersion, "1");

    const decrypted = decryptBuffer(encrypted.ciphertext, {
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      algorithm: encrypted.algorithm,
      keyVersion: encrypted.keyVersion,
    }, { key: testKey1 });

    assert.equal(Buffer.isBuffer(decrypted), true);
    assert.deepEqual(decrypted, samplePlaintext);
    assert.equal(decrypted.toString("utf8"), samplePlaintext.toString("utf8"));
  });

  it("2. should generate different, unique IVs for separate encryptions of identical data", () => {
    const enc1 = encryptBuffer(samplePlaintext, { key: testKey1 });
    const enc2 = encryptBuffer(samplePlaintext, { key: testKey1 });
    const enc3 = encryptBuffer(samplePlaintext, { key: testKey1 });

    // IVs must all be strictly distinct (never reused)
    assert.notEqual(enc1.iv, enc2.iv);
    assert.notEqual(enc2.iv, enc3.iv);
    assert.notEqual(enc1.iv, enc3.iv);

    // Consequently, ciphertexts must differ completely even for identical plaintext
    assert.notDeepEqual(enc1.ciphertext, enc2.ciphertext);
    assert.notDeepEqual(enc2.ciphertext, enc3.ciphertext);

    // Each decrypts back to the exact same plaintext
    const dec1 = decryptBuffer(enc1.ciphertext, enc1, { key: testKey1 });
    const dec2 = decryptBuffer(enc2.ciphertext, enc2, { key: testKey1 });
    assert.deepEqual(dec1, samplePlaintext);
    assert.deepEqual(dec2, samplePlaintext);
  });

  it("3. should reject decryption with an incorrect key", () => {
    const encrypted = encryptBuffer(samplePlaintext, { key: testKey1 });

    // Attempting decryption with testKey2 instead of testKey1
    assert.throws(
      () => decryptBuffer(encrypted.ciphertext, encrypted, { key: testKey2 }),
      /Decryption failed: authentication tag verification failed/
    );
  });

  it("4. should reject modified/tampered ciphertext", () => {
    const encrypted = encryptBuffer(samplePlaintext, { key: testKey1 });

    // Flip a byte in the ciphertext
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
    tamperedCiphertext[0] ^= 0xff; // Invert first byte

    assert.throws(
      () => decryptBuffer(tamperedCiphertext, encrypted, { key: testKey1 }),
      /Decryption failed: authentication tag verification failed/
    );
  });

  it("5. should reject an incorrect or tampered authentication tag", () => {
    const encrypted = encryptBuffer(samplePlaintext, { key: testKey1 });

    // Corrupt the authTag
    const authTagBuf = Buffer.from(encrypted.authTag, "hex");
    authTagBuf[0] ^= 0x01; // Invert one bit
    const tamperedAuthTag = authTagBuf.toString("hex");

    assert.throws(
      () => decryptBuffer(encrypted.ciphertext, {
        ...encrypted,
        authTag: tamperedAuthTag,
      }, { key: testKey1 }),
      /Decryption failed: authentication tag verification failed/
    );
  });

  it("6. should reject a tampered or corrupted IV", () => {
    const encrypted = encryptBuffer(samplePlaintext, { key: testKey1 });

    const ivBuf = Buffer.from(encrypted.iv, "hex");
    ivBuf[0] ^= 0x01;
    const tamperedIv = ivBuf.toString("hex");

    assert.throws(
      () => decryptBuffer(encrypted.ciphertext, {
        ...encrypted,
        iv: tamperedIv,
      }, { key: testKey1 }),
      /Decryption failed: authentication tag verification failed/
    );
  });

  it("7. should correctly handle an empty Buffer (0 bytes)", () => {
    const emptyBuffer = Buffer.alloc(0);
    const encrypted = encryptBuffer(emptyBuffer, { key: testKey1 });

    assert.equal(encrypted.ciphertext.length, 0);
    assert.equal(encrypted.iv.length, 24);
    assert.equal(encrypted.authTag.length, 32);

    const decrypted = decryptBuffer(encrypted.ciphertext, encrypted, { key: testKey1 });
    assert.equal(decrypted.length, 0);
    assert.deepEqual(decrypted, emptyBuffer);

    // Even for an empty buffer, tampering with the tag must be rejected
    const badTag = crypto.randomBytes(16).toString("hex");
    assert.throws(
      () => decryptBuffer(encrypted.ciphertext, { ...encrypted, authTag: badTag }, { key: testKey1 }),
      /Decryption failed: authentication tag verification failed/
    );
  });

  it("8. should validate input types strictly", () => {
    // Non-buffer to encryptBuffer
    assert.throws(
      () => encryptBuffer("Not a buffer string"),
      /Plaintext input to encryptBuffer must be a Buffer/
    );
    assert.throws(
      () => encryptBuffer(null),
      /Plaintext input to encryptBuffer must be a Buffer/
    );

    // Non-buffer to decryptBuffer
    assert.throws(
      () => decryptBuffer("Not a buffer", { iv: "a".repeat(24), authTag: "b".repeat(32) }),
      /Encrypted data input to decryptBuffer must be a Buffer/
    );

    // Missing metadata
    assert.throws(
      () => decryptBuffer(Buffer.from("abc"), null),
      /Decryption metadata object is required/
    );

    // Invalid algorithm in metadata
    assert.throws(
      () => decryptBuffer(Buffer.from("abc"), {
        iv: "a".repeat(24),
        authTag: "b".repeat(32),
        algorithm: "AES-128-CBC",
      }),
      /Unsupported encryption algorithm: "AES-128-CBC"/
    );
  });

  it("9. should correctly compute SHA-256 integrity hash", () => {
    const data = Buffer.from("SecureVault Integrity Test Document", "utf8");
    const expectedHash = crypto.createHash("sha256").update(data).digest("hex");
    const actualHash = computeSha256(data);

    assert.equal(actualHash, expectedHash);
    assert.equal(actualHash.length, 64);
  });
});
