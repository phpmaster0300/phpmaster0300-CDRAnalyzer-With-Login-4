import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist", "public");

  // Log the path for debugging
  log(`Looking for static files in: ${distPath}`, "serveStatic");

  if (!fs.existsSync(distPath)) {
    log(`Build directory not found: ${distPath}`, "serveStatic");
    log("Make sure to build the client first with 'npm run build'", "serveStatic");
    
    // Provide a more informative error page
    app.use("*", (_req, res) => {
      res.status(500).send(`
        <html>
          <head><title>Application Error</title></head>
          <body>
            <h1>Application Build Error</h1>
            <p>The frontend application has not been built properly.</p>
            <p>Expected to find static files in: ${distPath}</p>
            <p>Please check the build logs to ensure 'npm run build' completed successfully.</p>
            <p>If you're seeing this on Railway, the deployment may have failed during the build phase.</p>
          </body>
        </html>
      `);
    });
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    log(`index.html not found in: ${distPath}`, "serveStatic");
    app.use("*", (_req, res) => {
      res.status(500).send(`
        <html>
          <head><title>Application Error</title></head>
          <body>
            <h1>Application Build Error</h1>
            <p>The frontend build is incomplete - index.html is missing.</p>
            <p>Path checked: ${indexPath}</p>
          </body>
        </html>
      `);
    });
    return;
  }

  log(`Serving static files from: ${distPath}`, "serveStatic");
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(indexPath);
  });
}