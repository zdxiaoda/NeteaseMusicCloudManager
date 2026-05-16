import axios from "axios";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getEmbeddedFiles, getApiFileName } from "./embedded-api.js";

let serverProcess: ChildProcess | undefined;
let extractedApiDir: string | undefined;

const API_TEMP_DIR_NAME = "ncm-cloud-api";

function getTempApiDir(): string {
  return path.join(os.tmpdir(), API_TEMP_DIR_NAME);
}

function ensureApiExtracted(): string {
  if (extractedApiDir && existsSync(extractedApiDir)) {
    return extractedApiDir;
  }

  const tempDir = getTempApiDir();
  const markerFile = path.join(tempDir, ".extracted");

  // 检查是否已解压且版本匹配
  if (existsSync(markerFile)) {
    extractedApiDir = tempDir;
    return tempDir;
  }

  // 清理并重新创建
  if (existsSync(tempDir)) {
    try {
      // 使用系统命令删除，更可靠
      const { execSync } = require("child_process");
      execSync(`rm -rf "${tempDir}"`, { timeout: 5000 });
    } catch {
      // 如果删除失败，使用新目录名
      const newTempDir = path.join(os.tmpdir(), `${API_TEMP_DIR_NAME}-${Date.now()}`);
      mkdirSync(newTempDir, { recursive: true });
      extractedApiDir = newTempDir;
      return extractFiles(newTempDir);
    }
  }

  mkdirSync(tempDir, { recursive: true });
  extractedApiDir = tempDir;
  return extractFiles(tempDir);
}

function extractFiles(targetDir: string): string {
  const files = getEmbeddedFiles();

  for (const file of files) {
    const filePath = path.join(targetDir, file.path);
    const dir = path.dirname(filePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, file.content);
  }

  // 写入标记文件
  writeFileSync(path.join(targetDir, ".extracted"), Date.now().toString());

  return targetDir;
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

  // 解压嵌入的 API 文件
  const apiDir = ensureApiExtracted();
  const apiAppPath = path.join(apiDir, getApiFileName());

  if (!existsSync(apiAppPath)) {
    throw new Error(
      "未找到内置 API 启动模块，请先手动启动 @neteasecloudmusicapienhanced/api，或设置 NCM_AUTO_START_API=0 关闭自动拉起。"
    );
  }

  const proc = spawn("node", [apiAppPath], {
    env: { ...process.env, PORT: port, NCM_LOG_LEVEL: "error" },
    cwd: apiDir,
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
