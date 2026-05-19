import axios from "axios";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let serverStarted = false;

function findApiEntryInCwd(): string | null {
  const candidate = path.join(process.cwd(), "api-entry.js");
  if (existsSync(candidate)) return candidate;
  return null;
}

function getStandaloneApiPath(): string {
  const execDir = path.dirname(process.execPath);
  const apiExeName = process.platform === "win32" ? "api-server.exe" : "api-server";
  return path.join(execDir, apiExeName);
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
  if (serverStarted) {
    const ok = await waitReady(baseUrl, 15000);
    if (ok) return;
  }

  const port = parsePort(baseUrl);
  const env = { ...process.env, PORT: port, NCM_LOG_LEVEL: "error" };
  const apiStandalonePath = getStandaloneApiPath();

  if (existsSync(apiStandalonePath)) {
    const apiProcess = spawn(apiStandalonePath, [], {
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    apiProcess.unref();
  } else {
    const apiEntryPath = findApiEntryInCwd();
    if (apiEntryPath) {
      try {
        const apiProcess = spawn(process.execPath, ["run", apiEntryPath], {
          env,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        apiProcess.unref();
      } catch {
        process.env.PORT = port;
        process.env.NCM_LOG_LEVEL = "error";
        require(apiEntryPath);
      }
    } else {
      process.env.PORT = port;
      process.env.NCM_LOG_LEVEL = "error";
      require("@neteasecloudmusicapienhanced/api/app.js");
    }
  }

  serverStarted = true;

  const ready = await waitReady(baseUrl, 60000);
  if (ready) return;

  throw new Error(
    `自动启动网易云 API 失败，请按文档手动启动，或确保 API 可执行文件与主程序位于同一目录。`
  );
}
