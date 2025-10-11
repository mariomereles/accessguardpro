import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

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
    host: "localhost",
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
