import "dotenv/config";
import { existsSync, readFileSync } from "fs";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import next from "next";
import { parse } from "url";
import { initSocketServer } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3001);
const certPath = process.env.SSL_CERT ?? "";
const keyPath = process.env.SSL_KEY ?? "";
const useHttps = Boolean(
  certPath && keyPath && existsSync(certPath) && existsSync(keyPath),
);

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

app.prepare().then(() => {
  const onRequest = (
    req: import("http").IncomingMessage,
    res: import("http").ServerResponse,
  ) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Permissions-Policy",
      "microphone=(self), camera=(self), display-capture=(self)",
    );
    const parsedUrl = parse(req.url ?? "", true);
    handle(req, res, parsedUrl);
  };

  const server = useHttps
    ? createHttpsServer(
        { cert: readFileSync(certPath), key: readFileSync(keyPath) },
        onRequest,
      )
    : createHttpServer(onRequest);

  initSocketServer(server);

  server.on("error", (error) => {
    console.error("server error", error);
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", () => {
    const protocol = useHttps ? "https" : "http";
    console.log(`> SAP BETA pronto em ${protocol}://0.0.0.0:${port}`);
  });
});
