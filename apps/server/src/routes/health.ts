import { Router } from "express";
import { pingDatabase } from "../db/mysql";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "error", database: "unreachable", error: (error as Error).message });
  }
});
