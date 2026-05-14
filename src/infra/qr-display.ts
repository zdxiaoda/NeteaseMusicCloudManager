import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function commandExists(name: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [name], { stdio: "ignore" });
  return result.status === 0;
}

function extractUrlFromDataUri(dataUri: string): string | undefined {
  // 如果是 URL，直接返回
  if (dataUri.startsWith("http://") || dataUri.startsWith("https://")) {
    return dataUri;
  }
  // 如果是 data URI，无法直接用于终端显示
  return undefined;
}

export async function renderQrAsText(text: string): Promise<string | undefined> {
  try {
    // 动态导入避免打包问题
    const { renderTerminal } = await import("@vincentkoc/qrcode-tui");
    const result = await renderTerminal(text, { small: true });
    return result;
  } catch (err) {
    console.error("QR render failed:", err);
    return undefined;
  }
}

export async function renderQrAsUtf8(text: string): Promise<string | undefined> {
  try {
    const { renderUtf8 } = await import("@vincentkoc/qrcode-tui");
    const result = await renderUtf8(text);
    return result;
  } catch (err) {
    console.error("QR UTF8 render failed:", err);
    return undefined;
  }
}

export function openQrImageWithSystemDefault(dataUri: string): boolean {
  const DATA_URI_PREFIX = "data:image/png;base64,";
  if (!dataUri.startsWith(DATA_URI_PREFIX)) return false;

  const pngBuffer = Buffer.from(dataUri.slice(DATA_URI_PREFIX.length), "base64");
  const tmpFile = path.join(os.tmpdir(), `ncm-qr-open-${Date.now()}.png`);

  try {
    fs.writeFileSync(tmpFile, pngBuffer);
    if (process.platform === "win32") {
      const shell = process.env.ComSpec || "cmd.exe";
      const res = spawnSync(shell, ["/c", "start", "", tmpFile], {
        stdio: "ignore",
        windowsHide: true,
      });
      return res.status === 0;
    }
    if (process.platform === "darwin") {
      const res = spawnSync("open", [tmpFile], { stdio: "ignore" });
      return res.status === 0;
    }
    if (process.platform === "linux") {
      if (!commandExists("xdg-open")) return false;
      const res = spawnSync("xdg-open", [tmpFile], { stdio: "ignore" });
      return res.status === 0;
    }
    return false;
  } catch {
    return false;
  }
}

export function openUrl(url: string): boolean {
  try {
    if (process.platform === "win32") {
      const shell = process.env.ComSpec || "cmd.exe";
      const res = spawnSync(shell, ["/c", "start", "", url], {
        stdio: "ignore",
        windowsHide: true,
      });
      return res.status === 0;
    }
    if (process.platform === "darwin") {
      const res = spawnSync("open", [url], { stdio: "ignore" });
      return res.status === 0;
    }
    if (process.platform === "linux") {
      if (!commandExists("xdg-open")) return false;
      const res = spawnSync("xdg-open", [url], { stdio: "ignore" });
      return res.status === 0;
    }
    return false;
  } catch {
    return false;
  }
}

export async function showLoginQr(
  qrData: string,
  options: {
    writeRaw?: (text: string) => void;
  } = {}
): Promise<"terminal" | "utf8" | "external" | "data"> {
  if (!qrData) return "data";

  // 提取可显示的内容
  const displayText = extractUrlFromDataUri(qrData) || qrData;

  if (options.writeRaw) {
    // 尝试终端渲染
    const terminalQr = await renderQrAsText(displayText);
    if (terminalQr) {
      options.writeRaw(terminalQr);
      return "terminal";
    }

    // 尝试 UTF8 渲染
    const utf8Qr = await renderQrAsUtf8(displayText);
    if (utf8Qr) {
      options.writeRaw(utf8Qr);
      return "utf8";
    }
  }

  return "data";
}

// 新增：直接显示 data URI 的简化版本
export function getDataUriPreview(dataUri: string): string {
  if (!dataUri) return "(空)";
  if (dataUri.length <= 100) return dataUri;
  return dataUri.slice(0, 50) + "..." + dataUri.slice(-20);
}
