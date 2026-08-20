import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { initSocketServer } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3001);

const app = next({ dev, hostname, port, webpack: true });
const handle = app.getRequestHandler();

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
});

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "", true);
    handle(req, res, parsedUrl);
  });

  initSocketServer(server);

  server.on("error", (error) => {
    console.error("server error", error);
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`> SAP BETA pronto em http://0.0.0.0:${port}`);
  });
});
