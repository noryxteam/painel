import "dotenv/config";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import path from "path";
import next from "next";
import { parse } from "url";
import { initSocketServer } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3001);
const httpsPort = Number(process.env.HTTPS_PORT ?? 3443);

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
  if (existsSync(cert) && existsSync(key)) return { cert, key };

  mkdirSync(dir, { recursive: true });
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
    execFileSync("openssl", [...args, "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], {
      stdio: "ignore",
    });
  } catch {
    execFileSync("openssl", args, { stdio: "ignore" });
  }
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

  httpServer.on("error", (error) => {
    console.error("server error", error);
    process.exit(1);
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`> HTTP  em http://0.0.0.0:${port}`);
  });

  if (httpsServer) {
    const ports = [httpsPort, 443].filter(
      (value, index, list) => value !== port && list.indexOf(value) === index,
    );
    const listenHttps = (index: number) => {
      if (!httpsServer || index >= ports.length) {
        console.error("> HTTPS não conseguiu abrir porta 443 nem 3443");
        return;
      }
      const chosen = ports[index];
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          httpsServer.off("error", onError);
          listenHttps(index + 1);
          return;
        }
        console.error("https error", error);
      };
      httpsServer.once("error", onError);
      httpsServer.listen(chosen, "0.0.0.0", () => {
        httpsServer.off("error", onError);
        console.log(`> HTTPS em https://0.0.0.0:${chosen}`);
      });
    };
    listenHttps(0);
  }
});
