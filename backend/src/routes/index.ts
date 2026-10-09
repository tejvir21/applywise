/** API routes index. */

import { Router } from "express";
import authRoutes from "./auth.js";
import healthRoutes from "./health.js";
import profileRoutes from "./profile.js";
import resumeRoutes from "./resume.js";
import jobRoutes from "./jobs.js";
import applicationRoutes from "./applications.js";
import platformRoutes from "./platforms.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/", healthRoutes);
router.use("/profile", profileRoutes);
router.use("/resumes", resumeRoutes);
router.use("/jobs", jobRoutes);
router.use("/applications", applicationRoutes);
router.use("/platforms", platformRoutes);

export default router;
