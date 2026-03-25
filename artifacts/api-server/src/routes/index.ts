import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import visualizeRouter from "./visualize.js";
import sseRouter from "./sse.js";
import segmentRouter from "./segment.js";
import deepgramRouter from "./deepgram.js";
import historyRouter from "./history.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visualizeRouter);
router.use(sseRouter);
router.use(segmentRouter);
router.use(deepgramRouter);
router.use(historyRouter);

export default router;
