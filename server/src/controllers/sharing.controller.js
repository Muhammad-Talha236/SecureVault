import { asyncHandler } from "../middleware/error.middleware.js";
import * as sharing from "../services/sharing.service.js";

export const shareDocument = asyncHandler(async (req, res) => {
  const permission = await sharing.shareDocument(
    req.params.id, req.user._id, req.body?.recipientEmail,
    req.body?.permission, req.body?.expiresAt, req
  );
  res.status(201).json({ success: true, message: "Document shared successfully", permission });
});

export const getDocumentCollaborators = asyncHandler(async (req, res) => {
  const collaborators = await sharing.getDocumentCollaborators(req.params.id, req.user._id);
  res.status(200).json({ success: true, collaborators });
});

export const updatePermission = asyncHandler(async (req, res) => {
  const permission = await sharing.updatePermission(
    req.params.id, req.params.permissionId, req.user._id, req.body || {}, req
  );
  res.status(200).json({
    success: true, message: "Permission updated successfully",
    permission: { id: permission._id, permission: permission.permission, status: permission.status, expiresAt: permission.expiresAt },
  });
});

export const revokePermission = asyncHandler(async (req, res) => {
  await sharing.revokePermission(req.params.id, req.params.permissionId, req.user._id, req);
  res.status(200).json({ success: true, message: "Permission revoked successfully" });
});

export const getSharedWithMe = asyncHandler(async (req, res) => {
  const documents = await sharing.getSharedWithMe(req.user._id);
  res.status(200).json({ success: true, documents });
});
