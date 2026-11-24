import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url) });

import { verifyStorageConnection, SUPABASE_BUCKET } from "../config/supabase.js";

async function main() {
  console.log("=== VERIFYING SUPABASE STORAGE CONNECTION ===");
  console.log(`Target Bucket: ${SUPABASE_BUCKET}`);

  const result = await verifyStorageConnection();

  if (result.success) {
    console.log(`[PASS] Storage bucket "${result.bucket}" is successfully accessible.`);
    console.log(`[PASS] Bucket visibility: ${result.isPublic ? "PUBLIC (Warning: Expected Private)" : "PRIVATE (Secure)"}`);
    console.log(`[PASS] Bucket created at: ${result.created_at || "N/A"}`);
    console.log("[PASS] Safe check passed - zero files were uploaded, modified, or deleted.");
    process.exitCode = 0;
  } else {
    console.error(`[FAIL] Storage connection failed: ${result.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[FAIL] Unexpected verification error: ${err.message}`);
  process.exitCode = 1;
});
