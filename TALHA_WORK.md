# SecureVault — Technical Implementation Guide: Talha
**Module Ownership:** Core Identity & Authentication, Cryptographic Document Protection, Storage Engine, and Core Access Control  
**System:** SecureVault (MERN Stack Information Security Semester Project)  
**Target Environment:** Node.js / Express.js, MongoDB (Mongoose), React (JSX), Node.js `crypto` & `bcrypt`  

---

## 1. Module Overview

Talha is responsible for building the foundation of SecureVault: user authentication, session security, secure document storage, cryptographic protection, integrity verification, and core access control enforcement.

SecureVault implements a **hybrid protected storage architecture**:
1. **Database Tier (MongoDB Atlas):** Stores structured user identities, document metadata, cryptographic metadata (initialization vectors, authentication tags, key versions), and integrity hashes. Plaintext document contents, raw passwords, raw refresh tokens, and master encryption keys are **never** stored in MongoDB.
2. **Encrypted Blob Storage (Server Filesystem):** Encrypted document bytes are stored in an isolated storage directory (`server/storage/vault/`) referenced solely by an opaque, randomized `storageKey` UUID. Raw or unencrypted files never touch disk storage.

---

## 2. Objectives and Purpose

- **Identity & Authentication:** Provide user registration, credential validation, stateless access token authorization (JWT), and stateful refresh token rotation with replay detection.
- **Confidentiality:** Protect document contents at rest using authenticated symmetric encryption (**AES-256-GCM**) so that compromised storage media or database dumps reveal zero plaintext information.
- **Integrity:** Detect any unauthorized modification, bit-rot, or disk-level tampering using **SHA-256** digests and GCM authentication tags.
- **Authorization & Least Privilege:** Enforce role-based access (`USER`, `ADMIN`) and document-level ownership checks (`OWNER`) to eliminate Insecure Direct Object References (IDOR).
- **Separation of Concerns:** Expose clean, standardized integration interfaces for Document Sharing (Faiza) and Audit Logging (Laiba).

---

## 3. Detailed Feature Explanations

### 3.1 User Registration & Login
- **Registration:** Accepts `name`, `email`, and `password`. Validates email format and password strength (min 8 chars, uppercase, lowercase, number, symbol). Hashes the password using `hashPassword()` from `password.utils.js` (bcrypt, 12 rounds) and creates a `User` document.
- **Login:** Looks up user by email, explicitly selects `+passwordHash`, and validates credentials using `comparePassword()`. Upon success, issues an **Access Token** (short-lived JWT) and a **Refresh Token** (cryptographically random string).

### 3.2 Token Lifecycle & Refresh Token Rotation
- **Access Token:** Signed JWT containing `{ id, email, role }`. Expire time: **15 minutes**. Sent in the `Authorization: Bearer <token>` header or `httpOnly` secure cookie.
- **Refresh Token:** 64-character cryptographically random hex string (`crypto.randomBytes(32).toString('hex')`).
- **Token Hashing before Storage:** The raw refresh token is returned to the client (stored in an `httpOnly`, `SameSite=Strict`, `Secure` cookie). A SHA-256 hash of this token (`tokenHash`) is stored in the `RefreshToken` collection.
- **Family Rotation & Replay Attack Mitigation:**
  - Tokens are grouped by a `familyId` (UUID).
  - When refreshing, the incoming token is hashed and looked up. If found and active, it is marked as `revokedAt = new Date()`, replaced by a new token, and a new token is issued with the same `familyId`.
  - **Reuse Detection:** If an already-revoked refresh token is presented, SecureVault immediately revokes **all** tokens sharing that `familyId` and logs a security event (`ACCESS_DENIED`), preventing stolen session re-use.

### 3.3 Document Upload, Storage, Retrieval & Deletion
- **Upload Flow:**
  1. Client sends multipart form-data (file + metadata) to `POST /api/documents/upload`.
  2. Multer buffers or streams file to memory (restricted to 25 MB max, MIME-type validated against whitelist).
  3. Pre-encryption: Computes SHA-256 digest on plaintext file buffer $\to$ `integrity.hash`.
  4. Encryption: Generates 12-byte random IV $\to$ encrypts buffer using AES-256-GCM $\to$ extracts 16-byte `authTag`.
  5. Disk Write: Generates opaque `storageKey` (`vault/<uuid>.enc`). Writes ciphertext bytes to `server/storage/vault/<uuid>.enc`.
  6. DB Record: Persists metadata, `encryption` envelope (`algorithm`, `iv`, `authTag`, `keyVersion`), and `integrity` envelope in `Document` model.
- **Retrieval & Download Flow:**
  1. Client requests `GET /api/documents/:id/download`.
  2. Verifies ownership (`doc.owner.equals(req.user._id)`) or active delegation (Faiza's module).
  3. Reads ciphertext from disk using `doc.storageKey`.
  4. Decrypts buffer using AES-256-GCM using `doc.encryption.iv` and `doc.encryption.authTag`.
  5. Post-decryption: Computes SHA-256 on decrypted plaintext and verifies matching `doc.integrity.hash`.
  6. Streams decrypted file with original MIME type and sanitized `Content-Disposition`.
- **Soft Deletion:**
  - `DELETE /api/documents/:id` marks `status: "DELETED"`. Only document owners can initiate deletion.

---

## 4. Frontend Responsibilities (React / JSX)

Talha owns the core authentication UI and primary document dashboard:

1. **Authentication Views:**
   - `client/src/pages/Login.jsx`: Login form (email, password), loading states, and error alerts.
   - `client/src/pages/Register.jsx`: Registration form with live password policy meter.
2. **Auth Context & State (`client/src/context/AuthContext.jsx`):**
   - Stores current `user` object (`name`, `email`, `role`).
   - Handles token storage, periodic silent refresh, and logout triggers.
   - `useAuth()` hook providing `{ user, login, register, logout, isAuthenticated, isAdmin }`.
3. **Route Protectors (`client/src/components/ProtectedRoute.jsx`):**
   - Redirects unauthenticated users to `/login`.
   - `AdminRoute`: Verifies `user.role === 'ADMIN'`.
4. **Document Dashboard (`client/src/pages/Dashboard.jsx` & Document List):**
   - Document listing table (name, size, MIME type, upload date, owner badge).
   - Upload modal with drag-and-drop file picker, size restriction feedback, and progress bar.
   - Action triggers: Download (decrypts and saves to client), View/Preview (for images/PDFs), and Delete with confirmation modal.

---

## 5. Backend Responsibilities

1. **Auth Controller & Service (`server/src/controllers/auth.controller.js`, `auth.service.js`):**
   - `registerUser(name, email, password)`
   - `loginUser(email, password, ip, userAgent)`
   - `refreshUserSession(rawRefreshToken)`
   - `logoutUser(rawRefreshToken)`
2. **Auth Middleware (`server/src/middleware/auth.middleware.js`):**
   - `authenticateUser(req, res, next)`: Extracts JWT from `Authorization` header, verifies signature, loads `req.user`.
   - `requireRole(...roles)`: Verifies `req.user.role`.
3. **Document Controller & Service (`server/src/controllers/document.controller.js`, `document.service.js`):**
   - `uploadDocument(file, ownerId)`
   - `listDocuments(userId, userRole, query)`
   - `getDocumentById(documentId, userId)`
   - `downloadDocument(documentId, userId)`
   - `deleteDocument(documentId, userId)`
4. **Upload Middleware (`server/src/middleware/upload.middleware.js`):**
   - Configures `multer` memory storage with `limits: { fileSize: 25 * 1024 * 1024 }` (25 MB) and file extension/MIME filtering.

---

## 6. Database Responsibilities

Talha utilizes and manages operations on:
- **`User`** (`server/src/models/user.model.js`): User credentials, role assignments, timestamps.
- **`Document`** (`server/src/models/document.model.js`): Document records, encryption subdocument, integrity subdocument, storage keys.
- **`RefreshToken`** (`server/src/models/refreshToken.model.js`): Session persistence, rotation tracking, TTL cleanup.

---

## 7. Security Techniques & Cryptographic Algorithms

### 7.1 bcrypt (Password Hashing)
- **What it does:** Slow, adaptive one-way key derivation function based on Blowfish.
- **Why we need it:** Defends against offline dictionary and rainbow-table attacks if user records are exposed.
- **Where used:** User registration and login credential verification.
- **How it works:** Generates a 128-bit random salt, executes $2^{12} = 4,096$ expansion rounds, and outputs a 60-character self-contained hash (`$2b$12$...`).
- **Trusted Library:** `bcrypt` npm package.

### 7.2 JSON Web Tokens (JWT)
- **What it does:** Compact, URL-safe stateless claim container signed with a server secret.
- **Why we need it:** Scalable, stateless API authorization without querying database sessions on every micro-request.
- **Where used:** Authenticating requests to all `/api/*` endpoints (except login/register).
- **How it works:** Header + Payload (`sub`, `email`, `role`, `exp`) + HMAC-SHA256 signature (`crypto` or `jsonwebtoken`).
- **Token Expiry:** 15 minutes.

### 7.3 AES-256-GCM (Authenticated Document Encryption)
- **What it does:** High-performance symmetric cipher operating in Galois/Counter Mode with 256-bit keys.
- **Why selected:** Provides **both** confidentiality (CTR mode) and authenticity/integrity (Galois Message Authentication Code - GMAC) in a single pass.
- **Why unique IV/Nonce is vital:** GCM uses counter mode. Reusing an IV with the same key destroys authenticity and allows mathematical recovery of plaintext XOR relationships. SecureVault generates a fresh 12-byte cryptographically secure pseudorandom IV (`crypto.randomBytes(12)`) on **every single encryption call**.
- **How Authentication Tag Works:** GCM produces a 16-byte `authTag`. During decryption, GCM recomputes the tag over the ciphertext. If even one bit of ciphertext or IV is altered, decryption throws `Unsupported state or unable to authenticate data`, rejecting the corrupted data immediately.
- **Key Management:** Master Key (256-bit hex) loaded from `process.env.DOCUMENT_ENCRYPTION_KEY`. Stored outside database. Supports `keyVersion` tag (e.g. `v1`) for future key rotation.
- **Limitations:** Server-side encryption protects data-at-rest against storage disk theft; it does not protect against a compromised host memory state during runtime execution.
- **Trusted Library:** Node.js built-in `crypto` module (`crypto.createCipheriv('aes-256-gcm', key, iv)`).

### 7.4 SHA-256 (Document Integrity & Token Hashing)
- **What it does:** Cryptographic hash producing an immutable 256-bit (64-character hex) fingerprint.
- **Why needed:**
  1. **Document Integrity:** Pre-computed on plaintext file before encryption and verified after decryption to guarantee end-to-end file consistency.
  2. **Refresh Token Storage:** Hashes raw client refresh tokens before saving to database so database exposure does not yield active session tokens.
- **How AES-GCM and SHA-256 Complement Each Other:**
  - AES-GCM `authTag` verifies that the **ciphertext** was not modified on disk while encrypted.
  - SHA-256 verifies that the **plaintext payload** delivered to the user is identical to the exact file uploaded by the author before processing.
- **Hashing vs Encryption Distinction:**
  - *Hashing:* One-way mathematical transformation (irreversible). Used for integrity checks and fingerprinting.
  - *Encryption:* Two-way mathematical transformation with a secret key (reversible only with key). Used for confidentiality.

### 7.5 Asymmetric Cryptography (RSA / ECC) Clarification
- **Architectural Status:** RSA is **not** currently implemented or required for SecureVault's server-side storage architecture.
- **Proposed Enhancement (Future Work):** In an end-to-end (E2E) zero-knowledge client model, each user would hold an RSA/ECC keypair. The document key would be encrypted with recipient public keys (digital envelope) in browser JS. In our current server-mediated model, AES-256-GCM server-side encryption fulfills all course project security criteria with higher throughput and lower complexity.

---

## 8. Relevant Existing Files to Reuse

- Model: [`server/src/models/user.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/user.model.js)
- Model: [`server/src/models/document.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/document.model.js)
- Model: [`server/src/models/refreshToken.model.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/models/refreshToken.model.js)
- Utility: [`server/src/utils/password.utils.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/utils/password.utils.js)
- Error Handler: [`server/src/middleware/error.middleware.js`](file:///d:/sem%207/IS/final%20project/SecureVault-MERN-Starter/SecureVault/server/src/middleware/error.middleware.js)

---

## 9. Suggested Folder Structure & Files to Create

```text
server/
├── storage/
│   └── vault/                     # Encrypted file blobs (.enc)
├── src/
│   ├── config/
│   │   ├── crypto.config.js       # Master key loader & validation
│   ├── controllers/
│   │   ├── auth.controller.js     # Register, Login, Refresh, Logout, Me
│   │   └── document.controller.js # Upload, List, Get, Download, Delete
│   ├── middleware/
│   │   ├── auth.middleware.js     # authenticate, requireRole
│   │   └── upload.middleware.js   # Multer file filter and 25MB limits
│   ├── routes/
│   │   ├── auth.routes.js         # /api/auth endpoints
│   │   └── document.routes.js     # /api/documents endpoints
│   ├── services/
│   │   ├── auth.service.js        # Token generation, rotation, session logic
│   │   └── document.service.js    # Encryption, disk I/O, integrity checks
│   └── utils/
│       ├── crypto.utils.js        # encryptBuffer, decryptBuffer, sha256Digest
│       └── jwt.utils.js           # signToken, verifyToken
client/
└── src/
    ├── context/
    │   └── AuthContext.jsx        # Auth state provider & useAuth hook
    ├── pages/
    │   ├── Login.jsx              # Login interface
    │   └── Register.jsx           # Registration interface
    └── components/
        └── ProtectedRoute.jsx     # Route guard component
```

---

## 10. API Endpoints Specification

### Auth Routes (`/api/auth`)
- `POST /api/auth/register` $\to$ Body: `{ name, email, password }` $\to$ Returns: `{ success: true, user: { id, name, email, role } }`
- `POST /api/auth/login` $\to$ Body: `{ email, password }` $\to$ Returns: `{ success: true, accessToken, user }` + Sets `httpOnly` Refresh Cookie.
- `POST /api/auth/refresh` $\to$ Reads Refresh Cookie $\to$ Returns: `{ success: true, accessToken }`.
- `POST /api/auth/logout` $\to$ Revokes Refresh Token family $\to$ Clears cookie.
- `GET /api/auth/me` $\to$ Headers: `Authorization: Bearer <token>` $\to$ Returns: `{ success: true, user }`.

### Document Routes (`/api/documents`)
- `POST /api/documents/upload` $\to$ Multipart form (`file`, `title`) $\to$ Returns: `{ success: true, document: { id, originalName, sizeBytes, status } }`.
- `GET /api/documents` $\to$ Returns: `{ success: true, documents: [...] }`.
- `GET /api/documents/:id` $\to$ Returns document metadata.
- `GET /api/documents/:id/download` $\to$ Decrypts on the fly $\to$ Streams raw file bytes.
- `DELETE /api/documents/:id` $\to$ Soft deletes document (`status: "DELETED"`).

---

## 11. Communication & Integration Interfaces

### Interface A: Exported Authentication Middleware (Consumed by Faiza & Laiba)
```javascript
// server/src/middleware/auth.middleware.js
export const authenticate = async (req, res, next) => {
  // Attaches decoded user to req.user: { id, email, role }
};

export const requireRole = (...roles) => (req, res, next) => {
  // Enforces req.user.role in allowed roles
};
```

### Interface B: Core Document Access Checker (Calling Faiza's Module)
```javascript
// server/src/services/accessControl.service.js
import DocumentPermission from "../models/documentPermission.model.js";

export const canAccessDocument = async (userId, userRole, document, requiredLevel = "VIEWER") => {
  // 1. Admin or Owner has implicit full access
  if (userRole === "ADMIN" || document.owner.equals(userId)) {
    return { allowed: true, role: "OWNER" };
  }
  // 2. Query Faiza's DocumentPermission model
  const perm = await DocumentPermission.findOne({
    document: document._id,
    user: userId,
    status: "ACTIVE",
  });
  if (!perm) return { allowed: false };
  if (perm.expiresAt && new Date(perm.expiresAt) < new Date()) {
    return { allowed: false, reason: "EXPIRED" };
  }
  if (requiredLevel === "EDITOR" && perm.permission !== "EDITOR") {
    return { allowed: false, reason: "INSUFFICIENT_PERMISSION" };
  }
  return { allowed: true, role: perm.permission };
};
```

### Interface C: Logging Events (Calling Laiba's Module)
Whenever document operations or auth events succeed or fail, call Laiba's audit interface:
```javascript
import { logAuditEvent } from "./audit.service.js"; // Defined by Laiba

await logAuditEvent({
  actor: req.user?._id || null,
  action: "DOCUMENT_DOWNLOAD",
  resourceType: "DOCUMENT",
  resourceId: doc._id.toString(),
  outcome: "SUCCESS",
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
});
```

---

## 12. Independent Development Strategy (Mocking Interfaces)

Talha can develop and test the entire core application before Faiza and Laiba complete their modules:
1. **Mocking Sharing Permissions:** In `canAccessDocument()`, temporarily return `{ allowed: true, role: "OWNER" }` for the document owner, and fallback to empty array for shared users.
2. **Mocking Audit Logging:** In `server/src/services/audit.service.js`, supply a temporary fallback:
   ```javascript
   export const logAuditEvent = async (event) => {
     console.log("[MOCK AUDIT LOG]:", event.action, event.outcome);
   };
   ```
3. **Mock Storage Testing:** Store encrypted files in a local test directory (`server/storage/test_vault/`).

---

## 13. What is Outside Talha's Responsibility

- **Document Sharing UI & Logic:** Implementing share modals, collaborator selection, and permission update endpoints (Owned by Faiza).
- **Permission Revocation API:** Revoking access grants and expiry scheduler (Owned by Faiza).
- **Audit Logging Engine & Dashboard:** Admin activity viewer, filtering logs, and audit persistence service (Owned by Laiba).

---

## 14. Expected Deliverables

1. Complete Authentication API (`/api/auth/*`) with JWT & refresh token rotation.
2. Cryptographic utility module (`crypto.utils.js`) implementing AES-256-GCM and SHA-256.
3. Storage subsystem creating `.enc` files in `server/storage/vault/`.
4. Document controller, routes, and services (`/api/documents/*`).
5. Auth Context and login/register views in frontend.
6. Automated security test script executing Talha's 5 assigned test scenarios.

---

## 15. Unit & Integration Testing Requirements

- Unit test `hashPassword()` and `comparePassword()`.
- Unit test `encryptBuffer()` and `decryptBuffer()` (verify ciphertext matches plaintext upon round-trip).
- Integration test for registration, login, refresh token issuance, and expired token rejection.
- Integration test for document upload $\to$ file on disk is encrypted $\to$ metadata in DB $\to$ download decrypts correctly.

---

## 16. Security Testing Scenarios (Adversarial Demonstrations)

Talha owns 5 of the 7 project security testing demonstrations:

### Scenario 1: Unauthorized Document Access (IDOR Prevention)
- **Threat:** Malicious authenticated user changes the document ID in URL to view or download another user's private document.
- **Target Asset:** Private document confidentiality.
- **Procedure:** Log in as User B. Attempt `GET /api/documents/<User_A_Doc_ID>/download`.
- **Expected Result:** HTTP 403 Forbidden with `{ success: false, message: "Access denied" }`.
- **Evidence:** Terminal curl output or Postman response showing 403 status.
- **Limitations:** Does not test revoked collaborative permissions (covered by Faiza).

### Scenario 2: Identifier Manipulation & Path Traversal
- **Threat:** Attacker attempts path traversal (`../../etc/passwd` or `..\..\config.env`) in `storageKey`.
- **Target Asset:** Server host filesystem integrity.
- **Procedure:** Manually craft a malicious `storageKey` containing traversal sequences.
- **Expected Result:** Storage service strictly resolves filenames within `server/storage/vault/` using base UUIDs and rejects path separators.
- **Evidence:** HTTP 400 Bad Request error log demonstrating path containment.

### Scenario 3: Storage Exposure (Ciphertext Inspection)
- **Threat:** Rogue sysadmin or disk thief directly inspects the `server/storage/vault/` files.
- **Target Asset:** Plaintext document confidentiality at rest.
- **Procedure:** Open an uploaded `.enc` file in hex editor or raw text viewer.
- **Expected Result:** Content is entirely high-entropy binary ciphertext; zero plaintext strings or headers visible.
- **Evidence:** Screenshot of file opened in VS Code / Hex editor showing raw ciphertext.

### Scenario 4: Document Tampering & Integrity Verification
- **Threat:** Attacker modifies bits in the encrypted file on disk to alter content.
- **Target Asset:** Document authenticity and integrity.
- **Procedure:** Upload a document. Manually flip 1 byte inside `server/storage/vault/<uuid>.enc`. Attempt to download document via API.
- **Expected Result:** Decryption fails at GCM authentication tag verification (`Unsupported state or unable to authenticate data`). Download aborted with HTTP 400 / 500 error; audit log `INTEGRITY_CHECK` marked as `FAILURE`.
- **Evidence:** Console error trace showing GCM authTag mismatch.

### Scenario 5: Privilege Misuse (Role Enforcement)
- **Threat:** Standard user (`role: "USER"`) sends requests to administrative routes.
- **Target Asset:** Administrative configurations and global user records.
- **Procedure:** Send request with User JWT to an admin endpoint (e.g. `/api/admin/users`).
- **Expected Result:** HTTP 403 Forbidden (`Insufficient permissions`).
- **Evidence:** Postman test demonstrating role-check rejection.

---

## 17. Expected Evidence & Screenshots

1. **Authentication Evidence:** Successful registration, login, and refresh cookie issuance in browser DevTools.
2. **Encrypted Storage Evidence:** Side-by-side screenshot showing plaintext original vs `.enc` file in hex viewer.
3. **Integrity Rejection Evidence:** Console screenshot when a modified file fails AES-GCM tag verification.
4. **IDOR Rejection Screenshot:** Postman response showing 403 Forbidden when requesting another user's document ID.

---

## 18. Completion Checklist

- [ ] `User` registration and login working with bcrypt password hashing.
- [ ] JWT access token and refresh token rotation in place.
- [ ] Refresh token family reuse detection implemented.
- [ ] AES-256-GCM encryption and decryption verified.
- [ ] Random 12-byte IV generated on every encryption call.
- [ ] 16-byte AuthTag stored and checked on decryption.
- [ ] SHA-256 integrity hash calculated and verified.
- [ ] Multer upload middleware active with 25 MB limit and MIME validation.
- [ ] Document listing, downloading, and soft deletion functioning.
- [ ] AuthContext and protected route guards functional in React.
- [ ] All 5 security test scenarios executed with documented evidence.
