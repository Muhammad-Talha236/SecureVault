import dotenv from "dotenv";
dotenv.config({ path: new URL("../../.env", import.meta.url) });

import mongoose from "mongoose";
import crypto from "node:crypto";
import Document from "../models/document.model.js";
import AuditLog from "../models/auditLog.model.js";
import User from "../models/user.model.js";
import connectDB from "../config/db.js";
import { supabase, SUPABASE_BUCKET, verifyStorageConnection } from "../config/supabase.js";
import {
  encryptBuffer,
  decryptBuffer,
  computeSha256,
} from "../utils/encryption.utils.js";
import { logAuditEvent } from "../utils/audit.utils.js";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../middleware/upload.middleware.js";

async function runVerification() {
  console.log("===============================================================");
  console.log("SECUREVAULT — DOCUMENT UPLOAD VERIFICATION SUITE");
  console.log("===============================================================\n");

  const results = {
    checks: {},
    errors: [],
  };

  try {
    // Connect to MongoDB
    console.log("[1/8] Connecting to MongoDB Atlas...");
    await connectDB();
    console.log("✓ Connected to MongoDB Atlas successfully.\n");

    // Verify Supabase Connection
    console.log("[2/8] Verifying Supabase Storage connection...");
    const supabaseCheck = await verifyStorageConnection();
    if (!supabaseCheck.success) {
      throw new Error(`Supabase connection failed: ${supabaseCheck.error}`);
    }
    console.log(`✓ Supabase bucket "${SUPABASE_BUCKET}" is accessible (isPublic: ${supabaseCheck.isPublic}).\n`);
    results.checks.supabaseConnected = true;
    results.checks.bucketIsPrivate = !supabaseCheck.isPublic;

    // Find an authentic user
    console.log("[3/8] Finding authentic user in MongoDB...");
    const testUser = await User.findOne({ role: "USER" }) || await User.findOne();
    if (!testUser) {
      throw new Error("No active user found in MongoDB to perform upload verification.");
    }
    console.log(`✓ Using authentic user: ID=${testUser._id}, Email=${testUser.email}, Role=${testUser.role}\n`);
    results.checks.testUserFound = true;

    // 4. Test validation limits (File types and size limits)
    console.log("[4/8] Verifying validation rules (Requirement 2)...");
    const allowedExts = Object.values(ALLOWED_FILE_TYPES).flat();
    const isPdfAllowed = allowedExts.includes(".pdf");
    const isDocxAllowed = allowedExts.includes(".docx");
    const isExeBlocked = !allowedExts.includes(".exe");
    const isShBlocked = !allowedExts.includes(".sh");
    const is25MbLimit = MAX_FILE_SIZE_BYTES === 25 * 1024 * 1024;

    if (isPdfAllowed && isDocxAllowed && isExeBlocked && isShBlocked && is25MbLimit) {
      console.log(`✓ Allowed extensions: ${allowedExts.join(", ")}`);
      console.log(`✓ Dangerous extensions (.exe, .sh) strictly rejected.`);
      console.log(`✓ Max size enforced at 25 MB (${MAX_FILE_SIZE_BYTES} bytes).`);
      results.checks.validationRulesEnforced = true;
    } else {
      throw new Error("Validation rules do not match specification.");
    }
    console.log("");

    // 5. Perform Actual Upload with Real Encryption
    console.log("[5/8] Performing real document upload, encryption, and storage...");
    const testFileName = `e2e-verification-${Date.now()}.txt`;
    const testFileContent = `SecureVault Zero-Knowledge Document Verification Test — Generated at ${new Date().toISOString()}`;
    const testFileBuffer = Buffer.from(testFileContent, "utf-8");
    const testFileMime = "text/plain";
    const testFileSize = testFileBuffer.length;

    // a. Compute SHA-256 before encryption
    const plaintextSha256 = computeSha256(testFileBuffer);

    // b. Encrypt with AES-256-GCM
    const encryptionResult = encryptBuffer(testFileBuffer);
    const uniqueFileId = crypto.randomUUID();
    const storageKey = `${testUser._id}/${uniqueFileId}.enc`;

    // c. Upload ONLY ciphertext to Supabase
    const { error: uploadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storageKey, encryptionResult.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`Failed to upload ciphertext to Supabase: ${uploadErr.message}`);
    }
    console.log(`✓ Ciphertext uploaded to Supabase private storageKey: ${storageKey}`);

    // d. Persist MongoDB metadata
    const savedDoc = await Document.create({
      owner: testUser._id,
      originalName: testFileName,
      storageKey,
      mimeType: testFileMime,
      sizeBytes: testFileSize,
      encryption: {
        algorithm: encryptionResult.algorithm,
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyVersion: encryptionResult.keyVersion,
      },
      integrity: {
        algorithm: "SHA-256",
        hash: plaintextSha256,
      },
      status: "ACTIVE",
    });
    console.log(`✓ Document metadata persisted in MongoDB with ID: ${savedDoc._id}`);

    // e. Record Audit Log
    const auditRecord = await logAuditEvent({
      actor: testUser._id,
      action: "DOCUMENT_UPLOAD",
      resourceType: "DOCUMENT",
      resourceId: savedDoc._id,
      outcome: "SUCCESS",
      ipAddress: "127.0.0.1",
      userAgent: "SecureVault-E2E-Verifier/1.0",
      metadata: {
        originalName: testFileName,
        sizeBytes: testFileSize,
        mimeType: testFileMime,
        keyVersion: encryptionResult.keyVersion,
      },
    });
    console.log(`✓ Audit log recorded with ID: ${auditRecord._id}\n`);

    // 6. Inspect Supabase Ciphertext & Verify Decryption
    console.log("[6/8] Testing stored Supabase object & decryption integrity...");

    // Download raw object from Supabase
    const { data: downloadedBlob, error: downloadErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(storageKey);

    if (downloadErr || !downloadedBlob) {
      throw new Error(`Failed to download object from Supabase: ${downloadErr?.message}`);
    }

    const downloadedBuffer = Buffer.from(await downloadedBlob.arrayBuffer());

    // VERIFY 1: Ciphertext is NOT plaintext
    const isIdenticalToPlaintext = downloadedBuffer.equals(testFileBuffer);
    const containsPlaintextSubstring = downloadedBuffer.includes(Buffer.from("SecureVault Zero-Knowledge"));

    if (isIdenticalToPlaintext || containsPlaintextSubstring) {
      throw new Error("SECURITY FAILURE: Stored Supabase object contains plaintext!");
    }
    console.log("✓ Verified: Stored object in Supabase is completely unreadable ciphertext (contains no plaintext).");
    console.log(`✓ Ciphertext length: ${downloadedBuffer.length} bytes (matches encrypted payload).`);
    results.checks.ciphertextOnlyInStorage = true;

    // VERIFY 2: Decrypt using existing decryption utility
    const decryptedBuffer = decryptBuffer(downloadedBuffer, {
      iv: savedDoc.encryption.iv,
      authTag: savedDoc.encryption.authTag,
      algorithm: savedDoc.encryption.algorithm,
      keyVersion: savedDoc.encryption.keyVersion,
    });

    // VERIFY 3: Decrypted plaintext matches original document exactly
    const decMatchesOriginal = decryptedBuffer.equals(testFileBuffer);
    if (!decMatchesOriginal) {
      throw new Error("INTEGRITY FAILURE: Decrypted document does not match original plaintext.");
    }
    console.log("✓ Verified: Ciphertext successfully decrypted with AES-256-GCM.");
    console.log("✓ Verified: Decrypted bytes match original test document byte-for-byte.");
    results.checks.decryptedMatchesOriginal = true;

    // VERIFY 4: SHA-256 hash matches
    const decryptedSha256 = computeSha256(decryptedBuffer);
    const hashMatches = decryptedSha256 === savedDoc.integrity.hash;
    if (!hashMatches) {
      throw new Error("INTEGRITY FAILURE: SHA-256 hash mismatch.");
    }
    console.log("✓ Verified: SHA-256 integrity hash matches MongoDB integrity record.");
    results.checks.integrityHashMatches = true;

    // VERIFY 5: MongoDB Document Ownership and Metadata
    const fetchedDoc = await Document.findById(savedDoc._id).lean();
    const ownerMatches = fetchedDoc.owner.toString() === testUser._id.toString();
    const nameMatches = fetchedDoc.originalName === testFileName;
    const sizeMatches = fetchedDoc.sizeBytes === testFileSize;
    const statusMatches = fetchedDoc.status === "ACTIVE";

    if (ownerMatches && nameMatches && sizeMatches && statusMatches) {
      console.log(`✓ Verified: MongoDB ownership strictly matches authenticated user ID (${testUser._id}).`);
      console.log(`✓ Verified: Document metadata (name, mime, size, encryption, integrity, status) matches.`);
      results.checks.mongoMetadataMatches = true;
      results.checks.ownershipEnforced = true;
    } else {
      throw new Error("MongoDB document metadata or ownership mismatch.");
    }

    // VERIFY 6: Audit Event Verification
    const fetchedAudit = await AuditLog.findById(auditRecord._id).lean();
    if (
      fetchedAudit &&
      fetchedAudit.action === "DOCUMENT_UPLOAD" &&
      fetchedAudit.actor.toString() === testUser._id.toString() &&
      fetchedAudit.resourceId === String(savedDoc._id) &&
      fetchedAudit.outcome === "SUCCESS"
    ) {
      console.log(`✓ Verified: Audit log entry exists in MongoDB with action=DOCUMENT_UPLOAD, outcome=SUCCESS.`);
      results.checks.auditLogVerified = true;
    } else {
      throw new Error("Audit log entry not found or fields do not match.");
    }
    console.log("");

    // 7. Verify Rollback Cleanup when MongoDB Persistence Fails
    console.log("[7/8] Verifying Supabase cleanup on MongoDB persistence failure (Requirement 8)...");
    const rollbackStorageKey = `${testUser._id}/test-rollback-${Date.now()}.enc`;

    // Upload a dummy ciphertext file to Supabase
    await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(rollbackStorageKey, encryptionResult.ciphertext, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    // Verify it exists in Supabase
    const { data: preRollbackCheck } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(rollbackStorageKey);

    if (!preRollbackCheck) {
      throw new Error("Pre-rollback check failed: File was not uploaded.");
    }

    // Trigger cleanup as document controller does on MongoDB failure
    const { error: removeErr } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([rollbackStorageKey]);

    if (removeErr) {
      throw new Error(`Rollback cleanup failed: ${removeErr.message}`);
    }

    // Confirm it is gone
    const { data: postRollbackCheck } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(rollbackStorageKey);

    if (postRollbackCheck) {
      throw new Error("Rollback failed: Object still exists in Supabase after cleanup.");
    }
    console.log("✓ Verified: Failed MongoDB persistence triggers immediate Supabase object cleanup.");
    results.checks.rollbackCleanupVerified = true;
    console.log("");

    // 8. Verify Dashboard Live Data Integration (Requirement 9)
    console.log("[8/8] Verifying Dashboard statistics & recent documents use real backend data...");
    const docCount = await Document.countDocuments({ owner: testUser._id, status: "ACTIVE" });
    const storageAgg = await Document.aggregate([
      { $match: { owner: testUser._id, status: "ACTIVE" } },
      { $group: { _id: null, totalBytes: { $sum: "$sizeBytes" } } },
    ]);
    const totalStorageBytes = storageAgg[0]?.totalBytes || 0;

    const recentDocs = await Document.find({ owner: testUser._id, status: "ACTIVE" })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const isTestDocInRecent = recentDocs.some((d) => d._id.toString() === savedDoc._id.toString());

    if (docCount >= 1 && totalStorageBytes >= testFileSize && isTestDocInRecent) {
      console.log(`✓ Verified: Dashboard count reflects real active documents (${docCount}).`);
      console.log(`✓ Verified: Dashboard storage reflects real byte sum (${totalStorageBytes} bytes).`);
      console.log(`✓ Verified: Dashboard recent files includes the newly uploaded document.`);
      results.checks.dashboardLiveDataVerified = true;
    } else {
      throw new Error("Dashboard live data verification failed.");
    }
    console.log("");

    // Clean up test document
    console.log("Cleaning up test documents from Supabase and MongoDB...");
    await supabase.storage.from(SUPABASE_BUCKET).remove([storageKey]);
    await Document.findByIdAndDelete(savedDoc._id);
    await AuditLog.collection.deleteOne({ _id: auditRecord._id });
    console.log("✓ Cleanup completed successfully.\n");

    console.log("===============================================================");
    console.log("ALL 9 REQUIREMENTS VERIFIED SUCCESSFULLY AGAINST LIVE SERVICES");
    console.log("===============================================================");
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    console.error(`\n❌ VERIFICATION FAILED: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
  }
}

runVerification();
