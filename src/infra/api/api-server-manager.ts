import axios from "axios";
import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

let serverWorker: Worker | undefined;

function findApiDir(): string {
  try {
    const pkgPath = require.resolve("@neteasecloudmusicapienhanced/api/package.json");
    return path.dirname(pkgPath);
  } catch {}

  const execDir = path.dirname(process.execPath);
  for (const relPath of [
    path.join("node_modules", "@neteasecloudmusicapienhanced", "api"),
    "api",
  ]) {
    const candidate = path.join(execDir, relPath);
    if (existsSync(path.join(candidate, "app.js"))) return candidate;
  }

  const cwdCandidate = path.join(
    process.cwd(),
    "node_modules",
    "@neteasecloudmusicapienhanced",
    "api"
  );
  if (existsSync(path.join(cwdCandidate, "app.js"))) return cwdCandidate;

  throw new Error(
    "找不到 @neteasecloudmusicapienhanced/api，请先运行 bun install。\n" +
      "或设置 NCM_AUTO_START_API=0 关闭自动拉起。"
  );
}

function isLocalAddress(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parsePort(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

async function isApiReady(baseUrl: string): Promise<boolean> {
  try {
    await axios.get(`${baseUrl.replace(/\/$/, "")}/login/status`, {
      timeout: 1500,
      validateStatus: () => true,
    });
    return true;
  } catch {
    return false;
  }
}

async function waitReady(baseUrl: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isApiReady(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return false;
}

export async function ensureApiServer(baseUrl: string): Promise<void> {
  if (!isLocalAddress(baseUrl)) return;
  if (await isApiReady(baseUrl)) return;
  if (serverWorker) {
    const ok = await waitReady(baseUrl, 15000);
    if (ok) return;
  }

  const port = parsePort(baseUrl);
  const apiDir = findApiDir();
  const appJsPath = path.join(apiDir, "app.js");

  if (!existsSync(appJsPath)) {
    throw new Error(
      `未找到 API 入口: ${appJsPath}\n` +
        "请先手动启动 @neteasecloudmusicapienhanced/api，或设置 NCM_AUTO_START_API=0 关闭自动拉起。"
    );
  }

  process.env.PORT = port;
  process.env.NCM_LOG_LEVEL = "error";

  const worker = new Worker(appJsPath, {
    execArgv: [],
  });

  worker.on("error", (err) => {
    console.error("API worker error:", err);
    serverWorker = undefined;
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      console.error(`API worker exited with code ${code}`);
    }
    serverWorker = undefined;
  });

  serverWorker = worker;

  const ready = await waitReady(baseUrl, 60000);
  if (ready) return;

  worker.terminate();
  serverWorker = undefined;

  throw new Error(
    `自动启动网易云 API 失败，请按文档手动启动: PORT=${port} node "${appJsPath}"`
  );
}
