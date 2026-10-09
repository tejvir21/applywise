/** API routes index. */

import { Router } from "express";
import authRoutes from "./auth.js";
import healthRoutes from "./health.js";
import profileRoutes from "./profile.js";
import resumeRoutes from "./resume.js";
import jobRoutes from "./jobs.js";
import applicationRoutes from "./applications.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/", healthRoutes);
router.use("/profile", profileRoutes);
router.use("/resumes", resumeRoutes);
router.use("/jobs", jobRoutes);
router.use("/applications", applicationRoutes);

export default router;
