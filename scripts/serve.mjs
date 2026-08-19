import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

const host = "127.0.0.1";
const port = 4173;
const root = resolve("dist");
const entry = join(root, "index.html");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
]);

/** @param {string} relativePath @returns {string} */
function cacheControlFor(relativePath) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  if (normalizedPath === "index.html") return "no-cache";
  if (/^assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/u.test(normalizedPath)) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

if (!existsSync(entry)) {
  console.error("Pulsebox production build is missing. Run npm run build first.");
  process.exit(1);
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let requestPath;
  try {
    requestPath = decodeURIComponent(
      new URL(request.url ?? "/", `http://${host}:${String(port)}`).pathname,
    );
  } catch {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }
  const relativePath = normalize(requestPath).replace(/^[/\\]+/, "");
  let filePath = resolve(root, relativePath || "index.html");
  const rootedPath = relative(root, filePath);
  if (rootedPath === ".." || rootedPath.startsWith(`..${sep}`) || isAbsolute(rootedPath)) {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }

  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    const size = statSync(filePath).size;
    response.writeHead(200, {
      "Cache-Control": cacheControlFor(relative(root, filePath)),
      "Content-Length": size,
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Pulsebox cannot start because http://${host}:${String(port)} is already in use.`,
    );
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Pulsebox production build: http://${host}:${String(port)}`);
});
