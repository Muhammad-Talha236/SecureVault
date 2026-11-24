# SecureVault — Technical Implementation Guide: Faiza
**Module Ownership:** Secure Document Sharing and Permission Management  
**System:** SecureVault (MERN Stack Information Security Semester Project)  
**Target Environment:** Node.js / Express.js, MongoDB (Mongoose), React (JSX)  

---

## 1. Module Overview

Faiza is responsible for the **Secure Document Sharing and Permission Management** subsystem of SecureVault.

In SecureVault, document ownership is established at upload time (`Document.owner`). However, modern enterprise collaboration requires documents to be securely shared with specific registered colleagues under well-defined, enforceable, and revocable permissions.

Faiza designs, implements, and secures:
1. The **Document Sharing Workflow**: Delegating access rights to registered users via email identity.
2. The **Granular Permission Engine**: Enforcing `VIEWER` and `EDITOR` access tiers according to Discretionary Access Control (DAC) principles.
3. The **Temporal Expiry Mechanism**: Automatically invalidating permissions once an optional expiration timestamp passes.
4. The **Revocation & Lifecycle Manager**: Enabling document owners to instantly revoke delegated access.
5. The **Sharing & Collaborator UI**: Intuitive, responsive React interfaces for managing permissions.

---

## 2. Objectives and Purpose

- **Discretionary Access Control (DAC):** Allow document owners to grant, alter, and revoke access to their documents at their discretion.
- **Principle of Least Privilege:** Ensure non-owners receive only the minimum capabilities (`VIEWER` or `EDITOR`) needed for their task.
- **Server-Side Authorization Enforcement:** Guarantee that all permission checks are strictly validated on the Express backend, never relying on client-side button hiding or route disabling.
- **Temporal Access Limitation:** Eliminate perpetual access creep by supporting self-expiring document permissions.
- **Audit Integration:** Report every sharing attempt, permission change, and revocation to Laiba's audit subsystem.

---

## 3. Detailed Feature Explanations

### 3.1 Secure Document Sharing
- **Registered Recipient Verification:** When an owner shares a document, the backend verifies that the recipient email exists in the `User` collection. Sharing with non-existent users is rejected with a clean validation error.
- **Ownership Verification:** Only the document owner (`Document.owner`) or an administrative user may grant permissions on a document. Non-owners or users with `VIEWER`/`EDITOR` permissions cannot re-share documents unless elevated by policy.
- **Preventing Self-Sharing:** Attempting to share a document with oneself (the owner) is rejected as redundant.
- **Atomic Permission Record Creation:** Checks if a permission already exists between `(document, user)`. If a revoked permission exists, it is updated to `ACTIVE` with new settings; otherwise, a new `DocumentPermission` document is created.

### 3.2 Permission Tiers: VIEWER vs. EDITOR Policy Matrix

| Operation | OWNER | EDITOR | VIEWER | Unshared User |
| :--- | :---: | :---: | :---: | :---: |
| **View Metadata** | Yes | Yes | Yes | No (403) |
| **Download / View Decrypted File** | Yes | Yes | Yes | No (403) |
| **Update Document Content** | Yes | Yes | No (403) | No (403) |
| **Share Document with Others** | Yes | No (403) | No (403) | No (403) |
| **Revoke Access from Users** | Yes | No (403) | No (403) | No (403) |
| **Delete Document** | Yes | No (403) | No (403) | No (403) |

- **`VIEWER` (Read-Only):**
  - Allowed: Read document metadata, download decrypted file bytes, view document previews.
  - Denied: Modifying document contents, deleting, changing metadata, or sharing with third parties.
- **`EDITOR` (Read + Write):**
  - Allowed: All VIEWER permissions, plus uploading updated versions or overwriting file contents.
  - Denied: Deleting the document, transferring ownership, or altering permission grants.
- **Design Enforcement:** The document owner is **never** assigned a `DocumentPermission` record. The owner is identified solely by `Document.owner`, granting implicit top-tier administrative control over the document lifecycle.

### 3.3 Permission Expiry (Temporal Access Control)
- Owners can specify an optional `expiresAt` timestamp (ISO 8601 Date).
- **Validation:** `expiresAt` must be a future timestamp (`expiresAt > Date.now()`). Past dates are rejected immediately.
- **Enforcement:** During authorization checks, the backend evaluates:
  $$\text{Is Expired} \iff (\text{expiresAt} \neq \text{null}) \land (\text{expiresAt} < \text{Date.now}())$$
  If expired, the backend treats the permission as invalid, returns HTTP 403 (`"Access grant has expired"`), and signals an audit alert.
- **Frontend Display:** Expired permissions are clearly marked with an "Expired" status badge and disabled access indicators.

### 3.4 Permission Revocation & Re-sharing
- **Instant Revocation:** The owner can revoke access at any time. The backend sets `status: "REVOKED"` on the `DocumentPermission` record.
- **Post-Revocation Enforcement:** Any subsequent API call (download, view, update) by that collaborator is rejected with HTTP 403 Forbidden.
- **Re-sharing:** If the owner decides to share with the same user again, the existing permission record is reactivated with updated role and expiration parameters, preserving the compound unique index on `{ document, user }`.
- **Limitation of Server-Side Revocation:** Revoking access prevents all future application-mediated access (downloading, viewing, streaming). However, if the user previously downloaded a local offline copy of the decrypted file to their personal machine, server-side revocation cannot reach into the user's local operating system to delete the local file copy.

---

## 4. Frontend Responsibilities (React / JSX)

Faiza implements the document collaboration and permissions UI:

1. **Share Document Modal (`client/src/components/ShareModal.jsx`):**
   - Recipient lookup input (email autocomplete or input).
   - Permission selector (`VIEWER` or `EDITOR` dropdown).
   - Expiration date-time picker (optional).
   - "Grant Access" submit button with loading and success indicators.
2. **Collaborators List Component (`client/src/components/CollaboratorsList.jsx`):**
   - Displays all active and expired collaborators for a specific document.
   - Shows user avatar, name, email, granted permission level, and expiration date.
   - Inline permission editor: Change `VIEWER` $\leftrightarrow$ `EDITOR`.
   - "Revoke Access" button with confirmation prompt (`"Are you sure you want to revoke access from Sarah?"`).
3. **Shared With Me View (`client/src/pages/SharedWithMe.jsx`):**
   - Implements the dedicated `/user/shared` route in the existing dashboard shell.
   - Displays a grid/table of documents shared with the logged-in user.
   - Badges showing `Shared by: <Owner Name>` and assigned permission tier (`VIEWER` / `EDITOR`).
   - Action buttons: View/Download enabled; Delete disabled or omitted.

---

## 5. Backend Responsibilities

1. **Sharing Controller (`server/src/controllers/sharing.controller.js`):**
   - `shareDocument`: Handles recipient lookup, owner validation, permission creation.
   - `getDocumentCollaborators`: Lists all users with permission grants on a document.
   - `updatePermission`: Changes role between `VIEWER` and `EDITOR`, or extends/sets expiry.
   - `revokePermission`: Sets `status: "REVOKED"`.
   - `getSharedWithMe`: Queries all documents shared with `req.user._id`.
2. **Sharing Routes (`server/src/routes/sharing.routes.js`):**
   - Defines and protects `/api/documents/:id/share` and related endpoints using `authenticate`.
3. **Sharing Service (`server/src/services/sharing.service.js`):**
   - Implements business validation, database lookups, and audit log event triggering.

---

## 6. Database Responsibilities

Faiza owns and manages operations on:
- **`DocumentPermission`** ([`server/src/models/documentPermission.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/documentPermission.model.js)):
  - Enforces compound unique index `{ document: 1, user: 1 }`.
  - Indexes `{ user: 1, status: 1 }` for fast `/user/shared` queries.
  - Indexes `{ document: 1, status: 1 }` for fast collaborator list queries.
- Reads from:
  - **`Document`** (`server/src/models/document.model.js`): Validates `owner` and status.
  - **`User`** (`server/src/models/user.model.js`): Resolves recipient emails and grantor details.

---

## 7. Security Techniques & Access Control Concepts

### 7.1 Discretionary Access Control (DAC)
- **Concept:** The owner of an object has total discretion over who can access it and what rights they possess.
- **Implementation in SecureVault:** The user matching `Document.owner` can grant, alter, or terminate permissions for other users.
- **Distinction from RBAC:** System roles (`ADMIN`, `USER`) are Role-Based Access Control (RBAC). Document sharing is Discretionary Access Control (DAC) operating at the object level.

### 7.2 Principle of Least Privilege
- Users are granted only the minimum permissions necessary:
  - If a user only needs to read a financial statement, they are granted `VIEWER`.
  - `VIEWER` cannot modify, re-share, or delete the file.
  - `EDITOR` cannot delete the file or revoke the owner's access.

### 7.3 Server-Side Authorization vs. Frontend Button Hiding
- **Critical Vulnerability:** Hiding an "Edit" or "Download" button in the React UI is **not** security; it is merely user experience (UX).
- **The Attack Vector:** Any user can inspect API network calls, open browser DevTools, or send direct HTTP requests via Postman/curl to `PUT /api/documents/:id` or `GET /api/documents/:id/download`.
- **Enforcement Rule:** Every incoming request **must** pass through server-side authorization middleware that queries database permissions before reading or writing data.

### 7.4 Insecure Direct Object Reference (IDOR) Mitigation
- **Threat:** An attacker modifies the document ID in an API URL (e.g. `GET /api/documents/605c72ef...`) to an unauthorized document.
- **Mitigation:** The server never assumes that knowing an ID grants access. Every endpoint verifies:
  $$\text{Authorized} \iff (\text{User is Owner}) \lor (\text{User is Admin}) \lor (\text{User holds Active, Non-Expired Permission})$$

### 7.5 Asymmetric Encryption & Key Sharing Clarification
- **Current Architecture:** SecureVault uses server-side symmetric encryption (AES-256-GCM). The server securely manages master keys and authorizes shared access via DAC permission records in MongoDB.
- **Proposed Enhancement (Future E2EE):** Under client-side End-to-End Encryption (E2EE), sharing would require asymmetric cryptography (RSA-OAEP or ECIES). The document owner would fetch the recipient's RSA Public Key, encrypt the document symmetric key with that public key, and store the encrypted key envelope. Since SecureVault currently implements server-mediated hybrid storage, asymmetric key exchange is **not** implemented in this phase and is documented strictly as a future architectural enhancement.

---

## 8. Relevant Existing Files to Reuse

- Model: [`server/src/models/documentPermission.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/documentPermission.model.js)
- Model: [`server/src/models/document.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/document.model.js)
- Model: [`server/src/models/user.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/user.model.js)
- Middleware: [`server/src/middleware/error.middleware.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/middleware/error.middleware.js) (`asyncHandler`, `AppError`)

---

## 9. Suggested Folder Structure & Files to Create

```text
server/
├── src/
│   ├── controllers/
│   │   └── sharing.controller.js  # Share, List Collaborators, Update, Revoke
│   ├── routes/
│   │   └── sharing.routes.js      # /api/documents/:id/share routes
│   └── services/
│       └── sharing.service.js     # Permission checks, expiry validation, updates
client/
└── src/
    ├── components/
    │   ├── ShareModal.jsx         # Share dialog with user search & expiry
    │   └── CollaboratorsList.jsx  # Active collaborator list & revoke action
    └── pages/
        └── SharedWithMe.jsx       # Dedicated dashboard view for shared documents
```

---

## 10. API Endpoints Specification

### 1. Share Document
`POST /api/documents/:id/share`
- **Headers:** `Authorization: Bearer <token>`
- **Request Body:**
  ```json
  {
    "recipientEmail": "colleague@securevault.com",
    "permission": "VIEWER",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Document shared successfully",
    "permission": {
      "id": "674289abcdef...",
      "documentId": "6742801234...",
      "recipient": { "name": "Sarah Connor", "email": "colleague@securevault.com" },
      "permission": "VIEWER",
      "status": "ACTIVE",
      "expiresAt": "2026-12-31T23:59:59.000Z"
    }
  }
  ```

### 2. List Document Collaborators
`GET /api/documents/:id/collaborators`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "collaborators": [
      {
        "id": "674289abcdef...",
        "user": { "id": "6742111...", "name": "Sarah Connor", "email": "colleague@securevault.com" },
        "permission": "VIEWER",
        "status": "ACTIVE",
        "expiresAt": "2026-12-31T23:59:59.000Z"
      }
    ]
  }
  ```

### 3. Update Existing Permission
`PATCH /api/documents/:id/permissions/:permissionId`
- **Request Body:**
  ```json
  {
    "permission": "EDITOR",
    "expiresAt": "2027-01-15T00:00:00.000Z"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Permission updated successfully"
  }
  ```

### 4. Revoke Permission
`DELETE /api/documents/:id/permissions/:permissionId`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Permission revoked successfully"
  }
  ```

### 5. List Documents Shared With Logged-in User
`GET /api/documents/shared-with-me`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "documents": [
      {
        "id": "6742801234...",
        "originalName": "Quarterly_Budget.xlsx",
        "sizeBytes": 54200,
        "owner": { "name": "John Doe", "email": "john@securevault.com" },
        "myPermission": "VIEWER",
        "expiresAt": "2026-12-31T23:59:59.000Z"
      }
    ]
  }
  ```

---

## 11. Communication & Integration Interfaces

### Interface A: Exported Permission Verifier (Consumed by Talha's Document Operations)
Faiza exports a clean helper for Talha's core download, view, and update operations:
```javascript
// server/src/services/sharing.service.js
import DocumentPermission from "../models/documentPermission.model.js";

export const verifyUserAccess = async (documentId, userId, requiredLevel = "VIEWER") => {
  const perm = await DocumentPermission.findOne({
    document: documentId,
    user: userId,
    status: "ACTIVE",
  });

  if (!perm) return { authorized: false, reason: "NO_PERMISSION" };

  if (perm.expiresAt && new Date(perm.expiresAt) < new Date()) {
    return { authorized: false, reason: "PERMISSION_EXPIRED" };
  }

  if (requiredLevel === "EDITOR" && perm.permission !== "EDITOR") {
    return { authorized: false, reason: "INSUFFICIENT_PRIVILEGE" };
  }

  return { authorized: true, permission: perm.permission };
};
```

### Interface B: Audit Event Dispatcher (Consumed by Faiza $\to$ Calling Laiba's Module)
Whenever permissions are granted or revoked, call Laiba's logger:
```javascript
import { logAuditEvent } from "./audit.service.js"; // Defined by Laiba

// Log document share event
await logAuditEvent({
  actor: req.user._id,
  action: "DOCUMENT_SHARE",
  resourceType: "DOCUMENT",
  resourceId: doc._id.toString(),
  outcome: "SUCCESS",
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
  metadata: { recipientEmail, permission: "VIEWER", expiresAt },
});

// Log revocation event
await logAuditEvent({
  actor: req.user._id,
  action: "PERMISSION_REVOKE",
  resourceType: "DOCUMENT",
  resourceId: doc._id.toString(),
  outcome: "SUCCESS",
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
  metadata: { revokedUserId },
});
```

---

## 12. Independent Development Strategy (Mocking Interfaces)

Faiza can develop and test her entire sharing subsystem independently before Talha and Laiba finish:
1. **Mock Authentication:** Use a lightweight Express middleware in development tests:
   ```javascript
   req.user = { _id: new mongoose.Types.ObjectId("674200000000000000000001"), role: "USER", email: "owner@test.com" };
   ```
2. **Mock Audit Service:** Provide a stub function in `audit.service.js`:
   ```javascript
   export const logAuditEvent = async (event) => console.log("[MOCK AUDIT]:", event.action, event.outcome);
   ```
3. **Mock Document Ownership:** Create test documents in MongoDB Atlas using the existing `Document` model without waiting for Talha's file upload pipeline.

---

## 13. What is Outside Faiza's Responsibility

- **User Authentication & Session Management:** Registration, login, token rotation (Owned by Talha).
- **Physical Encryption & Filesystem Decryption:** Writing `.enc` files and computing AES-256-GCM auth tags (Owned by Talha).
- **Admin Audit Trail Dashboard:** Building audit tables, filters, and forensic viewers (Owned by Laiba).

---

## 14. Expected Deliverables

1. Complete Sharing API (`/api/documents/:id/share`, collaborators, updates, and revocation).
2. Permission verification helper (`verifyUserAccess`) integrated with Talha's download endpoint.
3. Share Modal and Collaborator management components in React.
4. "Shared With Me" page rendered inside the user dashboard shell.
5. Automated test script executing Faiza's 4 assigned security test demonstrations.

---

## 15. Unit & Integration Testing Requirements

- Unit test: Reject sharing when recipient email does not exist.
- Unit test: Reject sharing when requester is not document owner.
- Integration test: Share document $\to$ collaborator receives access $\to$ download allowed.
- Integration test: Expire timestamp $\to$ download rejected with HTTP 403.
- Integration test: Revoke permission $\to$ subsequent download rejected with HTTP 403.
- Integration test: Attempt to create duplicate permission record $\to$ compound unique index prevents duplicate.

---

## 16. Security Testing Scenarios (Adversarial Demonstrations)

Faiza owns the following security demonstration scenarios:

### Scenario 1: Permission Revocation Verification
- **Threat:** Revoked user attempts to access or download a document after permissions were withdrawn by owner.
- **Target Asset:** Document confidentiality post-collaboration.
- **Procedure:**
  1. Owner shares document with User B (`VIEWER`).
  2. Verify User B can access `GET /api/documents/:id/download`.
  3. Owner executes `DELETE /api/documents/:id/permissions/:permId`.
  4. User B immediately attempts `GET /api/documents/:id/download`.
- **Expected Result:** HTTP 403 Forbidden with `{ success: false, message: "Access denied: permission revoked" }`.
- **Evidence:** Terminal curl output showing transition from HTTP 200 to HTTP 403 after revocation call.
- **Limitations:** Cannot revoke local offline copies downloaded prior to revocation.

### Scenario 2: Unauthorized Sharing Attempt (Privilege Escalation)
- **Threat:** User B (granted `VIEWER` access) attempts to share the document with User C.
- **Target Asset:** Ownership integrity and access distribution control.
- **Procedure:** User B sends `POST /api/documents/:id/share` with recipient User C.
- **Expected Result:** HTTP 403 Forbidden (`"Only the document owner can manage permissions"`).
- **Evidence:** Postman screenshot showing 403 response.

### Scenario 3: Expired Permission Access Denial
- **Threat:** Collaborator attempts to access document after agreed expiry date.
- **Target Asset:** Time-bound document confidentiality.
- **Procedure:**
  1. Owner shares document with `expiresAt` set to 5 seconds in the future.
  2. Wait 6 seconds.
  3. Recipient attempts `GET /api/documents/:id/download`.
- **Expected Result:** HTTP 403 Forbidden (`"Access grant has expired"`).
- **Evidence:** Test execution log showing rejection timestamp > expiresAt timestamp.

### Scenario 4: Invalid Permission Update & Tampering
- **Threat:** Attacker crafts payload to assign invalid permissions (e.g. `permission: "OWNER"` or `status: "SUPERUSER"`).
- **Target Asset:** Schema integrity and role boundary enforcement.
- **Procedure:** Send `PATCH /api/documents/:id/permissions/:permId` with `{ "permission": "OWNER" }`.
- **Expected Result:** HTTP 400 Bad Request (`"Permission must be either EDITOR or VIEWER"`).
- **Evidence:** Mongoose validation error response log.

---

## 17. Expected Evidence & Screenshots

1. **Share Modal Screenshot:** React UI modal displaying recipient input, role selection, and expiry picker.
2. **Collaborators Management Screenshot:** Active collaborators list with inline revoke buttons.
3. **Revocation Enforcement Log:** Terminal output showing HTTP 403 rejection immediately following revocation.
4. **Shared With Me Table:** User dashboard populated with shared documents and role badges.

---

## 18. Completion Checklist

- [ ] Share document endpoint implemented with recipient validation.
- [ ] Non-owner sharing attempts strictly rejected (HTTP 403).
- [ ] `VIEWER` vs `EDITOR` permissions enforced across all actions.
- [ ] Expiry timestamp validation active; expired grants denied.
- [ ] Instant revocation functional; status updated to `REVOKED`.
- [ ] Compound unique index `{ document: 1, user: 1 }` active and tested.
- [ ] Share Modal, Collaborators List, and Shared With Me React views complete.
- [ ] Audit events dispatched for all share, update, and revoke actions.
- [ ] All 4 security test scenarios executed and documented with evidence.
