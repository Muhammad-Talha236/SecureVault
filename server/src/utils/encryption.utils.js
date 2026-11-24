import crypto from "node:crypto";
import {
  getMasterEncryptionKey,
  getActiveKeyVersion,
  EXPECTED_KEY_BYTES,
} from "./keyManager.utils.js";

export const ALGORITHM = "AES-256-GCM";
export const IV_LENGTH_BYTES = 12; // NIST SP 800-38D recommended standard for GCM
export const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag

/**
 * Parses a Buffer or hex/base64 encoded string into a Buffer.
 *
 * @param {Buffer|string} input - The input value.
 * @param {string} fieldName - Descriptive name for error messages.
 * @returns {Buffer} Parsed Buffer.
 */
const parseBuffer = (input, fieldName) => {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (typeof input === "string" && input.trim().length > 0) {
    const trimmed = input.trim();
    // Check if valid hex (even number of hex characters)
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      return Buffer.from(trimmed, "hex");
    }
    // Fallback to base64 if not pure hex
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
      return Buffer.from(trimmed, "base64");
    }
  }
  throw new Error(`[Encryption] Invalid format for ${fieldName}: expected Buffer or valid hex/base64 string.`);
};

/**
 * Computes a SHA-256 digest of a Buffer for document integrity verification.
 *
 * @param {Buffer} buffer - Plaintext buffer.
 * @returns {string} SHA-256 hex digest.
 */
export const computeSha256 = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("[Encryption] computeSha256 requires a valid Buffer input.");
  }
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

/**
 * Encrypts a plaintext Buffer using AES-256-GCM.
 * Generates a fresh cryptographically secure 12-byte IV for every operation.
 *
 * @param {Buffer} buffer - Plaintext data buffer to encrypt (can be empty buffer).
 * @param {Object} [options] - Optional custom key and keyVersion.
 * @param {Buffer} [options.key] - Optional 32-byte AES key buffer (defaults to master key).
 * @param {string} [options.keyVersion] - Optional key version string (defaults to active version).
 * @returns {{ ciphertext: Buffer, iv: string, authTag: string, algorithm: string, keyVersion: string, integrityHash: string }}
 */
export const encryptBuffer = (buffer, options = {}) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("[Encryption] Plaintext input to encryptBuffer must be a Buffer.");
  }

  const key = options.key || getMasterEncryptionKey();
  if (!Buffer.isBuffer(key) || key.length !== EXPECTED_KEY_BYTES) {
    throw new Error(
      `[Encryption] Encryption key must be a 32-byte Buffer. Received length: ${key?.length}.`
    );
  }

  const keyVersion = options.keyVersion || getActiveKeyVersion();

  // Generate fresh, cryptographically secure 12-byte IV (96 bits)
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);

  // Initialize AES-256-GCM cipher
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  // Encrypt data
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);

  // Extract 16-byte authentication tag
  const authTag = cipher.getAuthTag();

  // Compute SHA-256 integrity hash of original plaintext
  const integrityHash = computeSha256(buffer);

  return {
    ciphertext,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    algorithm: ALGORITHM,
    keyVersion: String(keyVersion),
    integrityHash,
  };
};

/**
 * Decrypts an encrypted Buffer using AES-256-GCM and verifies its authentication tag.
 * Throws and rejects immediately if ciphertext, IV, authTag, or key has been modified.
 * Never returns partially decrypted data upon authentication failure.
 *
 * @param {Buffer} encryptedData - Ciphertext Buffer to decrypt.
 * @param {Object} metadata - Encryption metadata { iv, authTag, algorithm, keyVersion }.
 * @param {string|Buffer} metadata.iv - 12-byte IV (hex string or Buffer).
 * @param {string|Buffer} metadata.authTag - 16-byte authentication tag (hex string or Buffer).
 * @param {string} [metadata.algorithm] - Must be "AES-256-GCM".
 * @param {string} [metadata.keyVersion] - Key version used for encryption.
 * @param {Object} [options] - Optional custom key and keyVersion.
 * @param {Buffer} [options.key] - Optional 32-byte AES key buffer.
 * @returns {Buffer} Decrypted plaintext Buffer.
 * @throws {Error} If authentication tag verification fails or data is invalid.
 */
export const decryptBuffer = (encryptedData, metadata, options = {}) => {
  if (!Buffer.isBuffer(encryptedData)) {
    throw new Error("[Encryption] Encrypted data input to decryptBuffer must be a Buffer.");
  }

  if (!metadata || typeof metadata !== "object") {
    throw new Error("[Encryption] Decryption metadata object is required.");
  }

  if (metadata.algorithm && metadata.algorithm !== ALGORITHM) {
    throw new Error(
      `[Encryption] Unsupported encryption algorithm: "${metadata.algorithm}". Expected "${ALGORITHM}".`
    );
  }

  if (!metadata.iv) {
    throw new Error("[Encryption] Decryption metadata is missing required 'iv' field.");
  }

  if (!metadata.authTag) {
    throw new Error("[Encryption] Decryption metadata is missing required 'authTag' field.");
  }

  const ivBuffer = parseBuffer(metadata.iv, "IV");
  if (ivBuffer.length !== IV_LENGTH_BYTES) {
    throw new Error(
      `[Encryption] Invalid IV length: expected ${IV_LENGTH_BYTES} bytes, got ${ivBuffer.length} bytes.`
    );
  }

  const authTagBuffer = parseBuffer(metadata.authTag, "authTag");
  if (authTagBuffer.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(
      `[Encryption] Invalid authTag length: expected ${AUTH_TAG_LENGTH_BYTES} bytes, got ${authTagBuffer.length} bytes.`
    );
  }

  const key = options.key || getMasterEncryptionKey();
  if (!Buffer.isBuffer(key) || key.length !== EXPECTED_KEY_BYTES) {
    throw new Error(
      `[Encryption] Decryption key must be a 32-byte Buffer. Received length: ${key?.length}.`
    );
  }

  // Initialize AES-256-GCM decipher
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  // Set expected authentication tag before final() verification
  decipher.setAuthTag(authTagBuffer);

  let decryptedChunk;
  try {
    decryptedChunk = decipher.update(encryptedData);
    const finalChunk = decipher.final();
    return Buffer.concat([decryptedChunk, finalChunk]);
  } catch (_authError) {
    // Explicitly zero out any intermediate decrypted chunk in memory
    if (decryptedChunk && Buffer.isBuffer(decryptedChunk)) {
      decryptedChunk.fill(0);
    }
    throw new Error(
      "[Encryption] Decryption failed: authentication tag verification failed. The ciphertext or metadata has been tampered with or an incorrect key was used."
    );
  }
};
