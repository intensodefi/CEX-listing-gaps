import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureProfiles, getState, loadFreshCache, refreshSnapshot } from "./cmc.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

const PORT = Number(process.env.PORT || 4173);
const publicDir = path.join(root, "public");
const sharedDir = path.join(root, "shared");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function safeFile(rootDir, requestPath) {
  const relative = requestPath.replace(/^\/+/, "");
  const file = path.resolve(rootDir, relative);
  if (!file.startsWith(rootDir + path.sep) && file !== rootDir) return null;
  return file;
}

function serveStatic(response, file) {
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/snapshot") {
    sendJson(response, 200, getState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refresh") {
    const force = url.searchParams.get("force") === "1";
    refreshSnapshot({ force }).catch((error) => {
      console.error("Refresh failed:", error.message);
    });
    sendJson(response, 202, getState());
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    serveStatic(response, path.join(publicDir, "index.html"));
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/shared/")) {
    const file = safeFile(sharedDir, url.pathname.slice("/shared/".length));
    if (!file) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    serveStatic(response, file);
    return;
  }

  if (request.method === "GET") {
    const file = safeFile(publicDir, url.pathname);
    if (!file) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    serveStatic(response, file);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Listing dashboard listening on http://127.0.0.1:${PORT}`);
  if (!process.env.CMC_API_KEY) {
    console.error("CMC_API_KEY is missing. Add it to .env before refreshing data.");
    return;
  }
  if (loadFreshCache()) {
    console.log(`Loaded cached snapshot from ${getState().updatedAt}`);
    ensureProfiles().catch((error) => {
      console.error("Asset info failed:", error.message);
    });
    return;
  }
  refreshSnapshot()
    .then((snapshot) => {
      const feeds = Object.values(snapshot.books).reduce((sum, book) => sum + Object.keys(book).length, 0);
      console.log(`Snapshot ready: ${feeds} exchange markets, ${snapshot.failures.length} failed`);
    })
    .catch((error) => {
      console.error("Initial refresh failed:", error.message);
    });
});
