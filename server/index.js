import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { getLatestDigest, initDb, listDigests, upsertDigest } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const landingDir = path.resolve(__dirname, "../landing");
const sharedDir = path.resolve(__dirname, "../shared");

initDb();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname, searchParams } = requestUrl;

  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, service: "daily-ai-market-briefing" });
    return;
  }

  if (pathname === "/api/digests/latest" && req.method === "GET") {
    const digest = getLatestDigest();
    if (!digest) {
      sendJson(res, 404, { message: "暂无日报数据" });
      return;
    }

    sendJson(res, 200, digest);
    return;
  }

  if (pathname === "/api/digests" && req.method === "GET") {
    const limit = Number.parseInt(searchParams.get("limit") ?? "30", 10);
    sendJson(res, 200, listDigests(Number.isNaN(limit) ? 30 : limit));
    return;
  }

  if (pathname === "/api/digests" && req.method === "POST") {
    try {
      const digest = await readJsonBody(req);
      const missingFields = [
        "digestDate",
        "title",
        "marketSentiment",
        "aiSentiment",
        "summary",
        "marketItems",
        "aiItems",
        "chart"
      ].filter((field) => digest[field] === undefined);

      if (missingFields.length > 0) {
        sendJson(res, 400, { message: `缺少字段: ${missingFields.join(", ")}` });
        return;
      }

      upsertDigest(digest);
      sendJson(res, 201, { ok: true });
    } catch (error) {
      sendJson(res, 400, {
        message: error instanceof Error ? error.message : "请求体无效"
      });
    }
    return;
  }

  if (req.method === "GET") {
    serveStaticFile(res, pathname);
    return;
  }

  sendJson(res, 404, { message: "Not Found" });
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, pathname) {
  // 路由：
  //   /shared/*  -> sharedDir
  //   /landing   -> landingDir/index.html
  //   /landing/* -> landingDir/*
  //   其他       -> publicDir
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];

  let baseDir;
  let safePath;

  if (first === "shared") {
    baseDir = sharedDir;
    safePath = "/" + segments.slice(1).join("/");
  } else if (first === "landing") {
    // /landing              -> landingDir/index.html
    // /landing/styles.css   -> landingDir/styles.css
    // /landing/app.js       -> landingDir/app.js
    baseDir = landingDir;
    safePath = segments.length === 1 ? "/index.html" : "/" + segments.slice(1).join("/");
  } else {
    baseDir = publicDir;
    safePath = pathname === "/" ? "/index.html" : pathname;
  }

  const filePath = path.normalize(path.join(baseDir, safePath));

  if (!filePath.startsWith(baseDir)) {
    sendJson(res, 403, { message: "Forbidden" });
    return;
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    sendFile(res, filePath, getContentType(filePath));
    return;
  }

  // 尝试补 .html (扩展名省略)
  if (!path.extname(safePath)) {
    const htmlPath = filePath + ".html";
    if (fs.existsSync(htmlPath) && !fs.statSync(htmlPath).isDirectory()) {
      sendFile(res, htmlPath, getContentType(htmlPath));
      return;
    }
  }

  // 缺省回退
  const fallback = baseDir === landingDir
    ? path.join(landingDir, "index.html")
    : path.join(publicDir, "index.html");
  sendFile(res, fallback, "text/html; charset=utf-8");
}

function sendFile(res, filePath, contentType) {
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}
