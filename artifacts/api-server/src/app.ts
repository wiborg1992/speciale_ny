import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

/** Skal matche store transskripter + HTML i previousHtml (JSON bliver ofte > standards 100kb). */
const JSON_BODY_LIMIT = "2mb";

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
app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

app.use("/api", router);

app.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const log = (req as Request & { log?: { error: (o: unknown, m: string) => void } }).log;
    log?.error({ err }, "Unhandled API error");

    if (res.headersSent) return;

    const e = err as { status?: number; statusCode?: number; type?: string; message?: string };
    if (e.type === "entity.too.large") {
      res.status(413).json({
        error: "Anmodningen er for stor. Prøv en kortere transskript-tekst eller slå Start over til og generér uden tidligere HTML.",
      });
      return;
    }

    const status = e.status ?? e.statusCode;
    const code =
      typeof status === "number" && status >= 400 && status < 600 ? status : 500;
    const msg = e.message || "Ukendt serverfejl.";
    let hint: string | undefined;
    if (/ECONNREFUSED|database|postgres|relation .* does not exist|password authentication|DATABASE_URL/i.test(msg)) {
      hint =
        "Database: sørg for at PostgreSQL kører, DATABASE_URL i .env matcher, og kør: pnpm --filter @workspace/db push";
    }
    res.status(code).json({
      error: msg,
      ...(hint ? { hint } : {}),
    });
  },
);

export default app;
