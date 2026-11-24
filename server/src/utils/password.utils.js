import bcrypt from "bcrypt";

const DEFAULT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt with a configurable work factor.
 *
 * @param {string} password - The plaintext password to hash.
 * @param {number} [saltRounds] - Optional number of salt rounds (defaults to BCRYPT_SALT_ROUNDS env or 12).
 * @returns {Promise<string>} The resulting bcrypt hash.
 */
export const hashPassword = async (password, saltRounds) => {
  if (typeof password !== "string" || password.trim().length === 0) {
    throw new Error("Password must be a non-empty string");
  }

  const rounds = Number(saltRounds) || Number(process.env.BCRYPT_SALT_ROUNDS) || DEFAULT_SALT_ROUNDS;

  if (isNaN(rounds) || rounds < 4 || rounds > 31) {
    throw new Error("Salt rounds must be a valid number between 4 and 31");
  }

  const salt = await bcrypt.genSalt(rounds);
  const hash = await bcrypt.hash(password, salt);
  return hash;
};

/**
 * Compares a plaintext password against an existing bcrypt hash.
 *
 * @param {string} password - The plaintext password to verify.
 * @param {string} passwordHash - The existing bcrypt hash.
 * @returns {Promise<boolean>} True if match, false otherwise.
 */
export const comparePassword = async (password, passwordHash) => {
  if (
    typeof password !== "string" ||
    password.trim().length === 0 ||
    typeof passwordHash !== "string" ||
    passwordHash.trim().length === 0
  ) {
    return false;
  }

  try {
    const isMatch = await bcrypt.compare(password, passwordHash);
    return isMatch;
  } catch (_error) {
    return false;
  }
};
