import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import * as controller from "../controllers/sharing.controller.js";

const router = Router();
router.use(authenticate);
router.get("/shared-with-me", controller.getSharedWithMe);
router.post("/:id/share", controller.shareDocument);
router.get("/:id/collaborators", controller.getDocumentCollaborators);
router.patch("/:id/permissions/:permissionId", controller.updatePermission);
router.delete("/:id/permissions/:permissionId", controller.revokePermission);

export default router;
