import "dotenv/config";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { createServer as createNetServer } from "net";
import path from "path";
import next from "next";
import { parse } from "url";
import { initSocketServer } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3001);

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

function applyHeaders(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Permissions-Policy",
    "microphone=(self), camera=(self), display-capture=(self)",
  );
}

function sanList() {
  const names = new Set(["DNS:localhost", "IP:127.0.0.1"]);
  for (const raw of [process.env.NEXT_PUBLIC_APP_URL, process.env.PUBLIC_HOST]) {
    if (!raw) continue;
    try {
      const host = raw.includes("://") ? new URL(raw).hostname : raw.split(":")[0];
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) names.add(`IP:${host}`);
      else if (host) names.add(`DNS:${host}`);
    } catch {
      // ignora valor inválido
    }
  }
  return [...names];
}

function ensureCerts() {
  const fromEnv =
    process.env.SSL_CERT &&
    process.env.SSL_KEY &&
    existsSync(process.env.SSL_CERT) &&
    existsSync(process.env.SSL_KEY);
  if (fromEnv) {
    return { cert: process.env.SSL_CERT as string, key: process.env.SSL_KEY as string };
  }

  const dir = path.join(process.cwd(), "certs");
  const cert = path.join(dir, "cert.pem");
  const key = path.join(dir, "key.pem");
  const stamp = path.join(dir, "san.txt");
  const san = sanList().join(",");
  mkdirSync(dir, { recursive: true });

  if (!existsSync(stamp) || readFileSync(stamp, "utf8").trim() !== san) {
    rmSync(cert, { force: true });
    rmSync(key, { force: true });
  }

  if (existsSync(cert) && existsSync(key)) return { cert, key };

  const args = [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "825",
    "-subj",
    "/CN=painel",
  ];
  try {
    execFileSync("openssl", [...args, "-addext", `subjectAltName=${san}`], {
      stdio: "ignore",
    });
  } catch {
    execFileSync("openssl", args, { stdio: "ignore" });
  }
  writeFileSync(stamp, san);
  return { cert, key };
}

app.prepare().then(() => {
  const onRequest = (
    req: import("http").IncomingMessage,
    res: import("http").ServerResponse,
  ) => {
    applyHeaders(req, res);
    handle(req, res, parse(req.url ?? "", true));
  };

  const httpServer = createHttpServer(onRequest);

  let httpsServer: ReturnType<typeof createHttpsServer> | undefined;
  try {
    const files = ensureCerts();
    httpsServer = createHttpsServer(
      { cert: readFileSync(files.cert), key: readFileSync(files.key) },
      onRequest,
    );
  } catch (error) {
    console.error("HTTPS não iniciado (openssl/certificados)", error);
  }

  initSocketServer(httpServer, httpsServer);

  const mux = createNetServer((socket) => {
    socket.once("error", () => socket.destroy());
    socket.once("data", (buffer) => {
      socket.pause();
      socket.unshift(buffer);
      const isTls = buffer.length > 0 && buffer[0] === 22;
      if (isTls && httpsServer) httpsServer.emit("connection", socket);
      else httpServer.emit("connection", socket);
      process.nextTick(() => {
        if (!socket.destroyed) socket.resume();
      });
    });
  });

  mux.on("error", (error) => {
    console.error("server error", error);
    process.exit(1);
  });

  mux.listen(port, "0.0.0.0", () => {
    console.log(`> HTTP  em http://0.0.0.0:${port}`);
    if (httpsServer) console.log(`> HTTPS em https://0.0.0.0:${port}`);
  });
});
