const http = require("http");
const net = require("net");

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3001;
const LISTEN_PORT = 3080;
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function forwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
  headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers.host;
  headers["x-forwarded-for"] = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  return headers;
}

const server = http.createServer((req, res) => {
  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: forwardHeaders(req),
      timeout: 120000,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  proxyReq.on("timeout", () => proxyReq.destroy(new Error("timeout")));
  proxyReq.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(String(err));
  });
  req.pipe(proxyReq);
});

server.on("upgrade", (req, socket, head) => {
  const up = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    const headers = forwardHeaders(req);
    if (req.headers.connection) headers.connection = req.headers.connection;
    if (req.headers.upgrade) headers.upgrade = req.headers.upgrade;
    if (req.headers["sec-websocket-key"]) {
      headers["sec-websocket-key"] = req.headers["sec-websocket-key"];
    }
    if (req.headers["sec-websocket-version"]) {
      headers["sec-websocket-version"] = req.headers["sec-websocket-version"];
    }
    if (req.headers["sec-websocket-protocol"]) {
      headers["sec-websocket-protocol"] = req.headers["sec-websocket-protocol"];
    }
    if (req.headers["sec-websocket-extensions"]) {
      headers["sec-websocket-extensions"] = req.headers["sec-websocket-extensions"];
    }
    for (const [key, value] of Object.entries(headers)) {
      if (value == null) continue;
      lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
    up.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.setTimeout(120000);
  up.on("timeout", () => up.destroy());
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(`proxy listening on 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
