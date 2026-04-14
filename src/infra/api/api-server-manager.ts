import axios from "axios";
import { spawn, ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const apiAppPath = require.resolve("@neteasecloudmusicapienhanced/api/app.js");

let serverProcess: ChildProcess | undefined;

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
      validateStatus: () => true
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
  if (serverProcess && !serverProcess.killed) {
    const ok = await waitReady(baseUrl, 15000);
    if (ok) return;
  }

  const port = parsePort(baseUrl);
  const readyTimeoutMs = 60000;

  const proc = spawn(process.execPath, [apiAppPath], {
    env: { ...process.env, PORT: port, NCM_LOG_LEVEL: "error" },
    stdio: "ignore",
    detached: true
  });
  proc.unref();
  serverProcess = proc;

  const ready = await waitReady(baseUrl, readyTimeoutMs);
  if (ready) {
    return;
  }

  if (!proc.killed && proc.pid) {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      // ignore kill failures for already-exited process
    }
  }
  serverProcess = undefined;

  throw new Error(
    `自动启动网易云 API 失败，请按文档手动启动: PORT=${port} node "${apiAppPath}"`
  );
}
