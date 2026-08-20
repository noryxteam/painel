import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3001";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${PORT}`;

function start() {
  const child = spawn("npx", ["tsx", "server.ts"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      PORT,
      NEXT_PUBLIC_APP_URL: APP_URL,
    },
  });

  child.on("exit", (code, signal) => {
    if (signal === "SIGINT" || signal === "SIGTERM") {
      process.exit(0);
    }
    console.log(`\n> Servidor parou (${code ?? signal}). Reiniciando...`);
    setTimeout(start, 800);
  });
}

start();
