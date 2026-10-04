import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import crypto from "crypto";
import { client } from "./db";
import { recordRequest, renderMetrics } from "./metrics";

const app = express();

// Behind Render/Nginx: trust the first proxy so req.ip is the real client address
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

// Same-origin in production unless CORS_ORIGIN lists extra origins; open only in development
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
if (corsOrigins?.length) {
  app.use(cors({ origin: corsOrigins }));
} else if (process.env.NODE_ENV !== "production") {
  app.use(cors());
}

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

// Liveness + dependency check (no details are exposed)
app.get("/health", async (_req, res) => {
  try {
    await client`select 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});

// Prometheus metrics: disabled unless METRICS_TOKEN is set, then requires "Authorization: Bearer <token>"
app.get("/metrics", (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (!token) return res.status(404).end();
  const given = Buffer.from((req.headers.authorization || "").replace(/^Bearer /, ""));
  const wanted = Buffer.from(token);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return res.status(401).end();
  res.type("text/plain; version=0.0.4").send(renderMetrics());
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      recordRequest(req.method, res.statusCode, duration);
      if (process.env.NODE_ENV === "production") {
        // One JSON object per line: easy to ship to any log platform
        console.log(JSON.stringify({ level: "info", msg: "http", method: req.method, path, status: res.statusCode, ms: duration, ip: req.ip }));
      } else {
        log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
      }
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // Never leak internal error details on server errors
    const message = status >= 500 ? "Internal Server Error" : err.message || "Bad Request";

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "production") {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5501 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5501', 10);
  server.listen({
    port,
    host: process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost"),
  }, () => {
    log(`serving on port ${port}`);
  });

  // Keep the process alive; allow graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    log('SIGINT received - initiating shutdown sequence...');
    try {
      // diagnostic info
      console.error('SIGINT stack:', new Error().stack);
      console.error('Process uptime (s):', process.uptime());
    } catch (e) {
      // ignore
    }
    log('Shutting down server...');
    server.close(() => {
      log('Server closed after SIGINT');
      // exit after server closes to ensure resources are cleaned up
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    log('SIGTERM received - initiating shutdown sequence...');
    try {
      console.error('SIGTERM stack:', new Error().stack);
      console.error('Process uptime (s):', process.uptime());
    } catch (e) {
      // ignore
    }
    server.close(() => {
      log('Server closed after SIGTERM');
      process.exit(0);
    });
  });

  // Log uncaught exceptions and keep the process running when possible.
  // Exiting the process here causes dev servers to terminate on transient
  // errors (for example a Redis connection error). Prefer logging so the
  // app can use in-memory fallbacks and continue operating.
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Do not call process.exit here; allow the process to continue.
  });

  // Log unhandled promise rejections and continue. If you want to crash on
  // specific critical errors, implement a case-by-case check here.
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // No process.exit to keep the server alive during transient failures.
  });
})();
