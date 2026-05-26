import { Router, type IRouter } from "express";
import healthRouter from "./health";
import codezRouter from "./codez";

const router: IRouter = Router();

router.use(healthRouter);
router.use(codezRouter);

export default router;
