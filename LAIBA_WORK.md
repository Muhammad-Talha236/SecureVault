# SecureVault — Technical Implementation Guide: Laiba
**Module Ownership:** Auditing, Accountability, and Security Forensics  
**System:** SecureVault (MERN Stack Information Security Semester Project)  
**Target Environment:** Node.js / Express.js, MongoDB (Mongoose), React (JSX)  

---

## 1. Module Overview

Laiba is responsible for the **Auditing and Accountability** module of SecureVault.

In any secure document management system, authentication and encryption are incomplete without non-repudiable accountability. If a security incident occurs—such as a data breach, unauthorized access attempt, or data corruption—the audit subsystem provides the authoritative, forensic timeline of:
- **Who** performed the action (`actor`).
- **What** action was attempted (`action`).
- **Which** entity was targeted (`resourceType`, `resourceId`).
- **When** the event transpired (`createdAt`).
- **Where** the request originated (`ipAddress`, `userAgent`).
- **Whether** the action succeeded or was denied (`outcome`).

Laiba designs, implements, and maintains:
1. The centralized **Audit Logging Service** consumed by Talha's and Faiza's modules.
2. The **Append-Only Protection Architecture** defending audit records from tampering and unauthorized deletion.
3. The **Admin Audit Dashboard**: A forensic interface offering filtering, sorting, pagination, and drill-down analysis for security administrators.
4. The **Audit Security Testing Suite**: Verifying append-only enforcement, zero secret leakage, and forensic investigation capabilities.

---

## 2. Objectives and Purpose

- **Accountability & Non-Repudiation:** Establish undeniable attribution for all security-critical operations across the platform.
- **Append-Only Integrity:** Guarantee that audit records can only be created—never updated, modified, or deleted through application APIs.
- **Data Minimization & Leak Prevention:** Strictly prevent the accidental logging of sensitive credentials (passwords, JWTs, encryption keys, plaintext document bytes).
- **Incident Investigation & Forensic Readiness:** Empower security administrators to rapidly filter, trace, and reconstruct breach attempts or operational anomalies.
- **Clean Inter-Module Integration:** Expose an asynchronous, fault-tolerant logging interface for Talha and Faiza that never halts core document workflows if logging is delayed.

---

## 3. Detailed Feature Explanations

### 3.1 Comprehensive Audit Event Scope
The audit service captures 13 distinct security-relevant events defined in the `AuditLog` schema:

| Action Event | Triggering Activity | Recorded Context & Metadata |
| :--- | :--- | :--- |
| **`LOGIN_SUCCESS`** | Successful credential verification | `actor: userId`, `resourceType: "USER"`, `outcome: "SUCCESS"`, IP, User-Agent. |
| **`LOGIN_FAILURE`** | Invalid password or unknown email | `actor: null`, `resourceType: "USER"`, `resourceId: email`, `outcome: "FAILURE"`, reason. |
| **`LOGOUT`** | User explicitly terminates session | `actor: userId`, `resourceType: "USER"`, `outcome: "SUCCESS"`. |
| **`DOCUMENT_UPLOAD`** | New encrypted document persisted | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS"`, file size, MIME type. |
| **`DOCUMENT_VIEW`** | Decrypted preview rendered | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS"`. |
| **`DOCUMENT_DOWNLOAD`**| Decrypted file stream downloaded | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS"`. |
| **`DOCUMENT_UPDATE`** | File content or metadata updated | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS"`, new size. |
| **`DOCUMENT_DELETE`** | Document marked as deleted | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS"`. |
| **`DOCUMENT_SHARE`**  | Permission granted to another user | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `metadata: { recipientEmail, permission, expiresAt }`. |
| **`PERMISSION_REVOKE`**| Collaborator access revoked | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `metadata: { revokedUserId }`. |
| **`ACCESS_DENIED`**   | Unauthorized access or IDOR attempt| `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: targetDocId`, `outcome: "DENIED"`, violated level. |
| **`INTEGRITY_CHECK`** | GCM tag or SHA-256 validation | `actor: userId`, `resourceType: "DOCUMENT"`, `resourceId: docId`, `outcome: "SUCCESS" \| "FAILURE"`. |
| **`ADMIN_ACTION`**    | Administrator role modification | `actor: adminId`, `resourceType: "USER"`, `resourceId: targetUserId`, `metadata: { roleChange }`. |

### 3.2 Audit Record Protection (Append-Only Enforcement)
- **API Prohibition:** The Express routing tier exposes **zero** `PUT`, `PATCH`, or `DELETE` endpoints for the `/api/audit-logs` route. Audit logs can only be read by authorized administrators (`GET`).
- **Mongoose Layer Protection:** The `AuditLog` model schema does not export update or remove helpers. Application code only invokes `.create()`.
- **Database-Level Protection:** In production deployments, the application connects to MongoDB using a dedicated database role granted `readWrite` on data collections, but strictly restricted to `insert` and `find` (no `update` or `delete`) on the `auditlogs` collection.
- **Detection of Unauthorized Modifications:** If a database administrator directly tampers with records, discrepancies can be detected via external replica stream monitoring or cryptographic log chaining.

### 3.3 Admin Audit Dashboard
- **Live Activity Feed:** Chronological stream of recent system security events with color-coded outcome badges (Green for `SUCCESS`, Red for `FAILURE`, Orange for `DENIED`).
- **Multi-Vector Filtering:**
  - **By Actor:** Filter actions performed by a specific user ID or email.
  - **By Action Type:** Filter by specific categories (e.g. show only `ACCESS_DENIED` and `LOGIN_FAILURE` events).
  - **By Outcome:** View all denied or failed requests.
  - **By Date Range:** Query events between `startDate` and `endDate`.
  - **By Resource:** Trace the complete audit history of a specific document ID.
- **Pagination & Sorting:** Server-side cursor/skip pagination supporting scalable browsing across millions of log records.
- **Forensic Detail Modal:** Clicking a log entry reveals detailed IP address, user-agent string, exact timestamp, and non-sensitive metadata JSON.

---

## 4. Frontend Responsibilities (React / JSX)

Laiba develops the security administration interface in `client/src/pages/AuditLogs.jsx` (accessible via `/admin/audit-logs` in the dashboard):

1. **Dashboard Overview Cards:**
   - Summary metric cards: Total Events Today, Failed Logins, Access Denials, Integrity Failures.
2. **Filter & Search Toolbar:**
   - Action type dropdown selector (e.g. `LOGIN_FAILURE`, `DOCUMENT_SHARE`, etc.).
   - Outcome selector (`ALL`, `SUCCESS`, `FAILURE`, `DENIED`).
   - Date range selector (`Today`, `Last 7 Days`, `Last 30 Days`, `Custom`).
   - Search input for Document ID or User ID.
3. **Audit Log Table:**
   - Columns: Timestamp (formatted local time), Actor (name/email or "Anonymous"), Action Badge, Resource, Outcome Badge, IP Address, Actions ("View Details").
   - Responsive design with icon-only indicators on small screens.
4. **Pagination Controls:**
   - Page navigation (`Previous`, `Page X of Y`, `Next`) with configurable page size (10, 25, 50).
5. **Audit Detail Drawer / Modal:**
   - Clean JSON viewer for `metadata` ensuring no secrets are rendered.
   - User-Agent parser displaying Browser, OS, and Device.

---

## 5. Backend Responsibilities

1. **Audit Controller (`server/src/controllers/audit.controller.js`):**
   - `getAuditLogs`: Administrative query endpoint with filtering, pagination, and sorting.
   - `getAuditStats`: Aggregated metrics for dashboard cards (failures, denials, daily totals).
   - `getAuditLogById`: Retrieves single record details for forensic inspection.
2. **Audit Routes (`server/src/routes/audit.routes.js`):**
   - Protected with `authenticate` and `requireRole("ADMIN")`.
3. **Audit Service (`server/src/services/audit.service.js`):**
   - `logAuditEvent(eventData)`: Centralized logging function consumed across the backend.
   - Enforces strict input validation and background execution so logging never blocks API request latency.
   - Applies automated sanitization against sensitive parameters.

---

## 6. Database Responsibilities

Laiba owns and manages:
- **`AuditLog`** ([`server/src/models/auditLog.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/auditLog.model.js)):
  - Enforces schema types, enums, and timestamps.
  - Maintains indexes for query optimization:
    - `{ actor: 1 }`
    - `{ action: 1 }`
    - `{ resourceId: 1 }`
    - `{ createdAt: -1 }` (Chronological ordering)
    - `{ action: 1, createdAt: -1 }` (Composite filtering)

---

## 7. Security Techniques & Logging Concepts

### 7.1 Audit Trails & Accountability
- **Definition:** An unbroken, chronological record of system activities sufficient to reconstruct, review, and examine the sequence of environments and activities surrounding each transaction.
- **Accountability:** Each audit entry ties an action to an authenticated `actor`. Even failed actions are recorded with IP and User-Agent to detect credential stuffing or brute-force attempts.

### 7.2 Zero Secret Leakage (Data Minimization)
- **Golden Rule of Audit Security:** **Never log sensitive data.**
- **Strictly Excluded Items:**
  - Plaintext passwords or candidate passwords from failed logins.
  - Password hashes (bcrypt strings).
  - JWT tokens or Bearer tokens.
  - Refresh tokens (raw or hashed).
  - Encryption keys (AES-256 keys or IVs).
  - Plaintext document content or file buffer bytes.
- **Automated Guardrail:** The `audit.service.js` passes all metadata through a sanitization sanitizer that strips keys matching `/(password|token|key|secret|auth)/i` before persisting.

### 7.3 Log Integrity & Tamper-Resistance Techniques
- **Application Level:** Strictly append-only. No HTTP mutation routes exist.
- **Proposed Enhancement: Cryptographic Hash Chaining (Future Architecture):**
  - *Concept:* Each log entry stores `previousLogHash` and `currentHash = SHA256(previousLogHash + logData)`.
  - *Benefit:* Modifying or deleting an entry in the middle of the database breaks the hash chain, making tampering mathematically evident.
  - *Distinction:* Documented as a proposed cryptographic enhancement; not implemented in the current prototype phase.
- **Limitations Against Privileged Database Administrators:**
  - An attacker with root/DBA access to MongoDB can directly bypass Mongoose schemas and delete documents via `mongosh`.
  - To mitigate this in enterprise environments, audit logs are forwarded in real-time to an immutable, external Write-Once-Read-Many (WORM) storage system or remote SIEM (e.g. Splunk, AWS CloudWatch).

---

## 8. Relevant Existing Files to Reuse

- Model: [`server/src/models/auditLog.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/auditLog.model.js)
- Middleware: [`server/src/middleware/error.middleware.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/middleware/error.middleware.js) (`sanitizeMessage`, `asyncHandler`, `AppError`)
- Auth Middleware: `server/src/middleware/auth.middleware.js` (`authenticate`, `requireRole`)

---

## 9. Suggested Folder Structure & Files to Create

```text
server/
├── src/
│   ├── controllers/
│   │   └── audit.controller.js    # getLogs, getStats, getLogById (Admin only)
│   ├── routes/
│   │   └── audit.routes.js        # /api/audit-logs routes
│   └── services/
│       └── audit.service.js       # Centralized logAuditEvent engine
client/
└── src/
    ├── pages/
    │   └── AuditLogs.jsx          # Admin audit dashboard page
    └── components/
        ├── AuditFilterBar.jsx     # Filtering by action, outcome, date
        └── AuditDetailModal.jsx   # Detailed view of individual audit events
```

---

## 10. API Endpoints Specification

### 1. Query Audit Logs (Admin Only)
`GET /api/audit-logs?page=1&limit=25&action=LOGIN_FAILURE&outcome=FAILURE&startDate=2026-11-01&endDate=2026-11-25`
- **Headers:** `Authorization: Bearer <Admin_JWT>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "pagination": {
      "totalRecords": 142,
      "currentPage": 1,
      "totalPages": 6,
      "limit": 25
    },
    "logs": [
      {
        "id": "6742a0001111...",
        "actor": null,
        "action": "LOGIN_FAILURE",
        "resourceType": "USER",
        "resourceId": "target_user@securevault.com",
        "outcome": "FAILURE",
        "ipAddress": "192.168.1.55",
        "userAgent": "Mozilla/5.0 ... Chrome/120.0",
        "metadata": { "reason": "Invalid credentials" },
        "createdAt": "2026-11-24T10:15:30.000Z"
      }
    ]
  }
  ```

### 2. Get Audit Statistics (Admin Only)
`GET /api/audit-logs/stats`
- **Headers:** `Authorization: Bearer <Admin_JWT>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "stats": {
      "totalEvents": 1284,
      "successfulLogins": 356,
      "failedLogins": 12,
      "accessDenials": 5,
      "integrityFailures": 0
    }
  }
  ```

### 3. Get Single Audit Log Details
`GET /api/audit-logs/:id`
- **Headers:** `Authorization: Bearer <Admin_JWT>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "log": {
      "id": "6742a0001111...",
      "actor": { "id": "6742111...", "name": "John Doe", "email": "john@securevault.com" },
      "action": "DOCUMENT_DOWNLOAD",
      "resourceType": "DOCUMENT",
      "resourceId": "doc_998877",
      "outcome": "SUCCESS",
      "ipAddress": "10.0.0.12",
      "userAgent": "Mozilla/5.0 ...",
      "metadata": { "fileName": "Project_Proposal.pdf", "sizeBytes": 2516582 },
      "createdAt": "2026-11-24T11:22:00.000Z"
    }
  }
  ```

---

## 11. Communication & Integration Interfaces

### The Common Audit Service Interface (Consumed by Talha & Faiza)
Laiba creates and exports `logAuditEvent()` in `server/src/services/audit.service.js`.

```javascript
// server/src/services/audit.service.js
import AuditLog from "../models/auditLog.model.js";

/**
 * Records a security event to the audit trail.
 * Designed to be fire-and-forget or awaited without crashing caller workflows.
 *
 * @param {Object} event
 * @param {string|null} [event.actor] - User ObjectId or null for unauthenticated
 * @param {string} event.action - Must match AUDIT_ACTIONS enum
 * @param {string} event.resourceType - "USER" | "DOCUMENT" | "SYSTEM"
 * @param {string|null} [event.resourceId] - ID of affected entity
 * @param {string} event.outcome - "SUCCESS" | "FAILURE" | "DENIED"
 * @param {string} [event.ipAddress] - Request IP
 * @param {string} [event.userAgent] - Request User-Agent
 * @param {Object} [event.metadata] - Non-sensitive context dictionary
 */
export const logAuditEvent = async ({
  actor = null,
  action,
  resourceType,
  resourceId = null,
  outcome,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) => {
  try {
    // Sanitize metadata to strip any accidental sensitive keys
    const safeMetadata = sanitizeAuditMetadata(metadata);

    await AuditLog.create({
      actor,
      action,
      resourceType,
      resourceId,
      outcome,
      ipAddress,
      userAgent,
      metadata: safeMetadata,
    });
  } catch (error) {
    // Logging errors must never leak credentials or crash user business workflows
    console.error(`[AUDIT SERVICE WARNING] Failed to record audit event: ${error.message}`);
  }
};

const sanitizeAuditMetadata = (data) => {
  if (!data || typeof data !== "object") return null;
  const sanitized = { ...data };
  const blockedKeys = ["password", "token", "secret", "key", "auth", "hash", "jwt"];
  for (const k of Object.keys(sanitized)) {
    if (blockedKeys.some((b) => k.toLowerCase().includes(b))) {
      delete sanitized[k];
    }
  }
  return sanitized;
};
```

---

## 12. Independent Development Strategy (Mocking Interfaces)

Laiba can build and test the entire auditing module independently before other modules are finished:
1. **Mock Event Generator:** Write a small seeder script (`server/src/seeds/audit.seed.js`) that populates MongoDB Atlas with 50 diverse historical audit events across all 13 action types and outcomes.
2. **Mock Authentication for Admin Dashboard:** Use a mock admin token or bypass header in local tests to view and interact with the React audit log UI.
3. **Simulating Other Modules:** Trigger synthetic calls to `logAuditEvent()` mimicking document uploads, failed logins, and permission revocations.

---

## 13. What is Outside Laiba's Responsibility

- **User Authentication, Login, and Password Hashing:** (Owned by Talha).
- **Document Encryption, Storage, and Download Streams:** (Owned by Talha).
- **Document Sharing Modal and Collaborator Permissions:** (Owned by Faiza).

---

## 14. Expected Deliverables

1. Centralized Audit Service (`audit.service.js`) with metadata sanitization.
2. Admin Audit API controller and routes (`/api/audit-logs/*`) with RBAC enforcement (`ADMIN` only).
3. Admin Audit Dashboard in React with live filters, pagination, and detail modal.
4. Automated security test script executing Laiba's 5 assigned test scenarios.

---

## 15. Unit & Integration Testing Requirements

- Unit test `logAuditEvent()`: Validates that invalid actions throw validation errors.
- Unit test `sanitizeAuditMetadata()`: Confirms keys like `password` or `accessToken` are stripped from metadata.
- Integration test: Querying logs with filter `action=LOGIN_FAILURE` returns only matching records.
- Integration test: Non-admin user requesting `/api/audit-logs` receives HTTP 403 Forbidden.
- Integration test: Unauthenticated user requesting `/api/audit-logs` receives HTTP 401 Unauthorized.

---

## 16. Security Testing Scenarios (Adversarial Demonstrations)

Laiba owns the following security demonstration scenarios:

### Scenario 1: Audit Record Modification Attempt (Append-Only Verification)
- **Threat:** Malicious user or rogue employee attempts to edit or alter an audit record to conceal unauthorized behavior.
- **Target Asset:** Audit trail integrity and non-repudiation.
- **Procedure:** Send `PUT` or `PATCH` request to `/api/audit-logs/<log_id>` with altered outcome or actor.
- **Expected Result:** HTTP 404 / 405 Method Not Allowed (No update route exists in Express routing table).
- **Evidence:** Terminal output showing HTTP 404 response.

### Scenario 2: Audit Record Deletion Attempt
- **Threat:** Attacker attempts to delete incriminating audit logs via API.
- **Target Asset:** Historical log preservation.
- **Procedure:** Send `DELETE /api/audit-logs/<log_id>`.
- **Expected Result:** HTTP 404 Not Found (Delete route does not exist).
- **Evidence:** Terminal output showing route rejection.

### Scenario 3: Unauthorized Audit Access (Privilege Enforcement)
- **Threat:** Standard user (`role: "USER"`) attempts to inspect enterprise audit logs.
- **Target Asset:** Audit confidentiality and operational privacy.
- **Procedure:** Request `GET /api/audit-logs` using a standard user JWT.
- **Expected Result:** HTTP 403 Forbidden (`"Access denied: Admin role required"`).
- **Evidence:** Postman screenshot verifying 403 response.

### Scenario 4: Sensitive Information Leakage Prevention
- **Threat:** Sensitive user secrets (passwords, JWTs, keys) are accidentally logged during failed login or encrypted operations.
- **Target Asset:** Confidential credentials.
- **Procedure:** Trigger failed login and document upload with mock metadata containing `password` and `apiKey`. Inspect persisted record in MongoDB Atlas.
- **Expected Result:** Record contains only metadata with sensitive keys purged; zero credentials present.
- **Evidence:** MongoDB document printout confirming absence of forbidden keys.

### Scenario 5: Audit Forensic Investigation & Reconstruction
- **Threat:** Security incident occurs (simulated series of 5 failed logins followed by an unauthorized document access attempt).
- **Target Asset:** Incident response efficacy.
- **Procedure:** Execute the simulated attack sequence. Open the Admin Audit Dashboard. Apply filters for `outcome: DENIED` and `outcome: FAILURE`.
- **Expected Result:** Dashboard surfaces the exact sequence, displaying the attacker's IP, target user, timestamps, and rejected actions in order.
- **Evidence:** Screenshot of the filtered Audit Dashboard showing the reconstructed attack timeline.

---

## 17. Expected Evidence & Screenshots

1. **Admin Audit Dashboard Screenshot:** Filtered table displaying recent security events with color-coded outcome badges.
2. **Forensic Modal Screenshot:** Pop-up showing complete request details (IP, User-Agent, event metadata).
3. **Modification Rejection Evidence:** Curl command showing HTTP 404 when attempting `PATCH /api/audit-logs/:id`.
4. **RBAC Rejection Evidence:** Postman screenshot showing standard user blocked from accessing audit endpoints.

---

## 18. Completion Checklist

- [ ] `logAuditEvent()` centralized service implemented and exported.
- [ ] Automated metadata sanitization stripping credentials verified.
- [ ] All 13 audit actions supported with schema validation.
- [ ] Admin audit API (`/api/audit-logs`) implemented with filtering and pagination.
- [ ] Zero update or delete routes exposed (append-only enforcement).
- [ ] RBAC guard (`requireRole("ADMIN")`) protecting audit routes active.
- [ ] Admin Audit Dashboard page (`AuditLogs.jsx`) fully rendered in React.
- [ ] All 5 security test scenarios executed and documented with evidence.
