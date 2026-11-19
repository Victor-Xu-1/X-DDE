import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolve, sep } from "node:path";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validateHost(req, port) {
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host))
    throw new HttpError(403, "Invalid local host");
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`)
    throw new HttpError(403, "Cross-origin request rejected");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new HttpError(403, "Cross-site request rejected");
}

export class Sessions {
  constructor() {
    this.tokens = new Map();
  }
  issue() {
    const token = randomBytes(32).toString("hex");
    this.tokens.set(token, Date.now());
    while (this.tokens.size > 64)
      this.tokens.delete(this.tokens.keys().next().value);
    return token;
  }
  verify(req) {
    const cookie = /(?:^|;\s*)dw-session=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    const header = req.headers["x-csrf-token"];
    if (
      !cookie ||
      typeof header !== "string" ||
      header.length !== 64 ||
      !this.tokens.has(cookie) ||
      Date.now() - this.tokens.get(cookie) > 8 * 3600_000 ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
    )
      throw new HttpError(403, "Invalid session nonce");
  }
}

export function staticPath(root, pathname) {
  const path = resolve(root, "." + decodeURIComponent(pathname));
  if (path !== resolve(root) && !path.startsWith(resolve(root) + sep))
    throw new HttpError(403, "Invalid resource path");
  return path;
}

export async function readBody(req, limit = 11 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  if (Number(req.headers["content-length"] || 0) > limit)
    throw new HttpError(413, "图片超过大小限制。");
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, "图片超过大小限制。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
