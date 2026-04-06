import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import visualizeRouter from "./visualize.js";
import classifyRouter from "./classify.js";
import sseRouter from "./sse.js";
import segmentRouter from "./segment.js";
import deepgramRouter from "./deepgram.js";
import historyRouter from "./history.js";
import meetingsRouter from "./meetings.js";
import sketchRouter from "./sketch.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visualizeRouter);
router.use(classifyRouter);
router.use(sseRouter);
router.use(segmentRouter);
router.use(deepgramRouter);
router.use(historyRouter);
router.use(meetingsRouter);
router.use(sketchRouter);

export default router;
