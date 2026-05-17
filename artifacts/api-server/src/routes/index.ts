import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import groupsRouter from "./groups.js";
import roleGroupsRouter from "./roleGroups.js";
import settingsRouter from "./settings.js";
import trainingsRouter from "./trainings.js";
import quizzesRouter from "./quizzes.js";
import eventsRouter from "./events.js";
import completionsRouter from "./completions.js";
import uploadsRouter from "./uploads.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(completionsRouter);
router.use(roleGroupsRouter);
router.use(groupsRouter);
router.use(settingsRouter);
// Training routes before quiz routes (quiz routes are nested under /trainings/:id)
router.use(trainingsRouter);
router.use(quizzesRouter);
router.use(eventsRouter);
// Authenticated file download routes — must come after auth middleware is wired
router.use(uploadsRouter);

export default router;
