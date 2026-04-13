#!/usr/bin/env node
import { startTui } from "./app.js";
import { ensureApiServer } from "../infra/api/api-server-manager.js";

const baseUrl = process.env.NCM_API_BASE_URL || "http://localhost:3000";
const ascii = process.argv.includes("--ascii");

async function main(): Promise<void> {
  if (process.env.NCM_AUTO_START_API !== "0") {
    await ensureApiServer(baseUrl);
  }
  await startTui(baseUrl, { ascii });
}

main().catch((error) => {
  console.error(`启动 TUI 失败: ${(error as Error).message}`);
  process.exit(1);
});
