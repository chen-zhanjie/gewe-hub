import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request } from "node:http";
import { extname, join, normalize } from "node:path";

const root = "/app/dist";
const upstream = process.env.API_UPSTREAM ?? "http://server:3000";
const port = Number(process.env.PORT ?? 80);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
    proxy(req, res);
    return;
  }
  serveStatic(url.pathname, res);
}).listen(port, "0.0.0.0");

function proxy(req, res) {
  const target = new URL(req.url ?? "/", upstream);
  const upstreamReq = request(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host
      }
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstreamReq.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { code: "BAD_GATEWAY", message: error.message } }));
  });
  req.pipe(upstreamReq);
}

function serveStatic(pathname, res) {
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const requested = join(root, normalized === "/" ? "index.html" : normalized);
  const filePath = existsSync(requested) && statSync(requested).isFile() ? requested : join(root, "index.html");
  const ext = extname(filePath);
  res.writeHead(200, { "content-type": mimeTypes[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}
