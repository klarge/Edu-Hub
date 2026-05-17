import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import path from "path";

const UPLOAD_DIR = process.env["UPLOAD_DIR"] ?? "/tmp/training-uploads";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded SCORM packages and PPTX files
app.use(
  "/api/uploads/scorm",
  express.static(path.join(UPLOAD_DIR, "scorm"), { dotfiles: "deny" }),
);
app.use(
  "/api/uploads/pptx",
  express.static(path.join(UPLOAD_DIR, "pptx"), { dotfiles: "deny" }),
);

app.use("/api", router);

export default app;
