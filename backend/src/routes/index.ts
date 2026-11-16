/** API routes index. */

import { Router } from "express";
import authRoutes from "./auth.js";
import healthRoutes from "./health.js";
import profileRoutes from "./profile.js";
import resumeRoutes from "./resume.js";
import jobRoutes from "./jobs.js";
import applicationRoutes from "./applications.js";
import automationRoutes from "./automation.js";
import platformRoutes from "./platforms.js";
import applicationPreparationRoutes from "./application-preparations.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/", healthRoutes);
router.use("/profile", profileRoutes);
router.use("/resumes", resumeRoutes);
router.use("/jobs", jobRoutes);
router.use("/applications", applicationRoutes);
router.use("/application-preparations", applicationPreparationRoutes);
router.use("/automation", automationRoutes);
router.use("/platforms", platformRoutes);

export default router;
