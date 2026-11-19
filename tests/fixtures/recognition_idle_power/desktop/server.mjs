import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpError,
  readBody,
  Sessions,
  staticPath,
  validateHost,
} from "./security.mjs";
import { Lifecycle } from "./lifecycle.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

export function makeServer(config, lifecycle = new Lifecycle(config)) {
  const sessions = new Sessions();
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self' http://127.0.0.1:4322 http://localhost:4322; base-uri 'none'",
    );
    try {
      validateHost(req, config.port);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      if (path === "/health" && req.method === "GET")
        return json(res, 200, {
          app: "decimer-workbench",
          version: config.version,
        });
      if (path === "/api/session" && req.method === "GET") {
        const token = sessions.issue();
        return json(
          res,
          200,
          { csrf: token, ...lifecycle.state() },
          {
            "set-cookie": `dw-session=${token}; HttpOnly; SameSite=Strict; Path=/`,
          },
        );
      }
      if (path === "/api/state" && req.method === "GET")
        return json(res, 200, lifecycle.state());
      if (path.startsWith("/api/")) {
        sessions.verify(req);
        if (path === "/api/power" && req.method === "POST") {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            throw new HttpError(415, "JSON required");
          let body;
          try {
            body = JSON.parse((await readBody(req, 2048)).toString("utf8"));
          } catch (error) {
            if (error instanceof HttpError) throw error;
            throw new HttpError(400, "Invalid JSON");
          }
          if (typeof body.enabled !== "boolean")
            throw new HttpError(422, "enabled must be boolean");
          return json(res, 202, lifecycle.setEnabled(body.enabled));
        }
        if (path === "/api/jobs" && req.method === "POST") {
          if (lifecycle.phase !== "ready")
            throw new HttpError(409, "识别服务尚未就绪或正在处理其他图片。");
          if (!req.headers["content-type"]?.startsWith("multipart/form-data;"))
            throw new HttpError(415, "Image form required");
          const body = await readBody(req);
          const generation = lifecycle.generation;
          const response = await lifecycle.worker("/api/jobs", {
            method: "POST",
            headers: { "content-type": req.headers["content-type"] },
            body,
          });
          const data = await response.json();
          if (generation !== lifecycle.generation || !lifecycle.desired)
            throw new HttpError(409, "识别任务已取消，后端正在关闭。");
          if (response.ok) {
            lifecycle.job = data;
            lifecycle.phase = "busy";
            lifecycle.lastActivity = Date.now();
          }
          return json(res, response.status, data);
        }
        if (
          /^\/api\/jobs\/[a-f0-9-]{36}$/.test(path) &&
          req.method === "GET" &&
          lifecycle.desired
        ) {
          const response = await lifecycle.worker(path);
          return json(res, response.status, await response.json());
        }
        throw new HttpError(404, "Not found");
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new HttpError(405, "Method not allowed");
      let target = staticPath(
        config.publicDir,
        path === "/" ? "/index.html" : path,
      );
      let info;
      try {
        info = await stat(target);
      } catch {
        throw new HttpError(404, "Not found");
      }
      if (!info.isFile()) throw new HttpError(404, "Not found");
      const data = await readFile(target);
      res.writeHead(200, {
        "content-type": types[extname(target)] || "application/octet-stream",
        "cache-control":
          extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      if (!res.headersSent)
        json(res, error.status || 502, {
          error: error.status ? error.message : "本地服务请求失败。",
        });
      else res.end();
      if (!error.status) console.error(error.message);
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.on("close", () => lifecycle.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const configPath = process.argv[process.argv.indexOf("--config") + 1];
  if (!configPath || !process.argv.includes("--config"))
    throw new Error("Private config is required");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.workerToken = (await readFile(config.workerTokenFile, "utf8")).trim();
  if (
    config.distro !== "WSL" ||
    config.port !== 8940 ||
    config.workerPort !== 8941 ||
    !config.workerToken
  )
    throw new Error("Unexpected deployment configuration");
  const server = makeServer(config);
  server.listen(config.port, "127.0.0.1", () =>
    console.log(`DECIMER frontend http://localhost:${config.port}`),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
}
