import dns from "node:dns";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Ensure server/.env is loaded even if this module is statically imported
dotenv.config({ path: new URL("../../.env", import.meta.url) });

// Prioritize IPv4 resolution to prevent dual-stack DNS connection timeouts
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_e) {
  // Ignored if not supported by the runtime environment
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "securevault-documents";

/**
 * Validates the required Supabase environment variables.
 * Fails safely with a clear configuration message without exposing secrets.
 */
export const validateSupabaseConfig = () => {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY");
  if (!process.env.SUPABASE_BUCKET) missing.push("SUPABASE_BUCKET");

  if (missing.length > 0) {
    throw new Error(
      `[Supabase Config Error] Missing required environment variable(s): ${missing.join(", ")}.`
    );
  }

  try {
    new URL(supabaseUrl);
  } catch (_e) {
    throw new Error("[Supabase Config Error] SUPABASE_URL must be a valid URL string.");
  }
};

// Validate configuration when the module is initialized
validateSupabaseConfig();

/**
 * Initialized Supabase Client using the backend secret key.
 * Session persistence is disabled for server-side operations.
 */
export const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Verifies that the configured Supabase Storage bucket exists and is accessible
 * using the backend secret credentials.
 * Safe check: only queries bucket metadata; does not upload, modify, or delete any files.
 *
 * @returns {Promise<{ success: boolean, bucket: string, isPublic: boolean, created_at?: string, error?: string }>}
 */
export const verifyStorageConnection = async () => {
  try {
    const { data, error } = await supabase.storage.getBucket(SUPABASE_BUCKET);

    if (error) {
      return {
        success: false,
        bucket: SUPABASE_BUCKET,
        error: error.message || "Failed to access storage bucket.",
      };
    }

    if (!data) {
      return {
        success: false,
        bucket: SUPABASE_BUCKET,
        error: `Bucket "${SUPABASE_BUCKET}" was not found in the Supabase project.`,
      };
    }

    return {
      success: true,
      bucket: data.name,
      isPublic: data.public,
      created_at: data.created_at,
    };
  } catch (err) {
    return {
      success: false,
      bucket: SUPABASE_BUCKET,
      error: err.message || "Unexpected error connecting to Supabase Storage.",
    };
  }
};

export default supabase;
