import { Router } from "express";
const router = Router();
router.get("/", (_req, res) => res.status(200).json({ success: true, message: "SecureVault backend is healthy" }));
export default router;
