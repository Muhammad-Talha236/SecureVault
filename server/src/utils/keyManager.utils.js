import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url) });

export const EXPECTED_KEY_BYTES = 32; // 256-bit AES key

/**
 * Validates a base64-encoded AES-256 encryption key.
 *
 * @param {string} keyBase64 - Base64 encoded key candidate.
 * @returns {Buffer} 32-byte decoded Buffer.
 * @throws {Error} Clear, safe error message without exposing key content.
 */
export const decodeAndValidateKey = (keyBase64) => {
  if (typeof keyBase64 !== "string" || keyBase64.trim().length === 0) {
    throw new Error(
      "[Key Management] DOCUMENT_ENCRYPTION_KEY is missing or empty. A Base64-encoded 32-byte AES key is required."
    );
  }

  const trimmed = keyBase64.trim();
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (!base64Regex.test(trimmed)) {
    throw new Error(
      "[Key Management] DOCUMENT_ENCRYPTION_KEY contains invalid Base64 characters."
    );
  }

  const keyBuffer = Buffer.from(trimmed, "base64");

  if (keyBuffer.length !== EXPECTED_KEY_BYTES) {
    throw new Error(
      `[Key Management] Invalid DOCUMENT_ENCRYPTION_KEY length: expected ${EXPECTED_KEY_BYTES} bytes (256 bits), got ${keyBuffer.length} bytes.`
    );
  }

  return keyBuffer;
};

/**
 * Retrieves the validated 32-byte master encryption key buffer from process.env.
 *
 * @returns {Buffer} 32-byte AES key buffer.
 */
export const getMasterEncryptionKey = () => {
  return decodeAndValidateKey(process.env.DOCUMENT_ENCRYPTION_KEY);
};

/**
 * Retrieves the configured active key version.
 *
 * @returns {string} Key version identifier (e.g. "1").
 */
export const getActiveKeyVersion = () => {
  const version = process.env.DOCUMENT_ENCRYPTION_KEY_VERSION?.trim();
  if (!version) {
    return "1";
  }
  return String(version);
};

/**
 * Validates the full key management environment configuration.
 *
 * @returns {{ valid: boolean, keyVersion: string }}
 */
export const validateKeyConfiguration = () => {
  getMasterEncryptionKey();
  const keyVersion = getActiveKeyVersion();
  return { valid: true, keyVersion };
};
