import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
type Image2Sixel = (
  data: Uint8Array,
  width: number,
  height: number,
  maxColors?: number,
  backgroundSelect?: number
) => string;
let image2sixel: Image2Sixel | undefined;

function getImage2Sixel(): Image2Sixel | undefined {
  if (image2sixel) return image2sixel;
  try {
    image2sixel = (require("sixel") as { image2sixel: Image2Sixel }).image2sixel;
    return image2sixel;
  } catch {
    return undefined;
  }
}

const SIXEL_MAX_QR_PX = 200;
const DATA_URI_PREFIX = "data:image/png;base64,";

function commandExists(name: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [name], { stdio: "ignore" });
  return result.status === 0;
}

function maxDimensionClamp(sw: number, sh: number, maxDim: number): { w: number; h: number } {
  if (sw <= maxDim && sh <= maxDim) return { w: sw, h: sh };
  if (sw >= sh) {
    const w = maxDim;
    const h = Math.max(1, Math.round((sh * maxDim) / sw));
    return { w, h };
  }
  const h = maxDim;
  const w = Math.max(1, Math.round((sw * maxDim) / sh));
  return { w, h };
}

function scaleRgbaNearest(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(Math.floor((y * sh) / dh), sh - 1);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(Math.floor((x * sw) / dw), sw - 1);
      const si = (sy * sw + sx) * 4;
      const oi = (y * dw + x) * 4;
      out[oi] = src[si]!;
      out[oi + 1] = src[si + 1]!;
      out[oi + 2] = src[si + 2]!;
      out[oi + 3] = src[si + 3]!;
    }
  }
  return out;
}

function toPngBuffer(dataUri: string): Buffer | undefined {
  if (!dataUri.startsWith(DATA_URI_PREFIX)) return undefined;
  return Buffer.from(dataUri.slice(DATA_URI_PREFIX.length), "base64");
}

export function renderQrAsSixel(dataUri: string, writeRaw: (text: string) => void): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env.NCM_QR_SIXEL === "0") return false;
  const toSixel = getImage2Sixel();
  if (!toSixel) return false;
  try {
    const pngBuffer = toPngBuffer(dataUri);
    if (!pngBuffer) return false;
    const png = PNG.sync.read(pngBuffer);
    const w = png.width;
    const h = png.height;
    const { w: tw, h: th } = maxDimensionClamp(w, h, SIXEL_MAX_QR_PX);
    const src = new Uint8Array(png.data);
    const rgba = tw !== w || th !== h ? scaleRgbaNearest(src, w, h, tw, th) : src;
    const seq = toSixel(rgba, tw, th, 256, 0);
    writeRaw(seq);
    return true;
  } catch {
    return false;
  }
}

export function openQrImageWithSystemDefault(dataUri: string): boolean {
  const pngBuffer = toPngBuffer(dataUri);
  if (!pngBuffer) return false;

  const tmpFile = path.join(os.tmpdir(), `ncm-qr-open-${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpFile, pngBuffer);
    if (process.platform === "win32") {
      const shell = process.env.ComSpec || "cmd.exe";
      const res = spawnSync(shell, ["/c", "start", "", tmpFile], {
        stdio: "ignore",
        windowsHide: true
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
        windowsHide: true
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

export function showLoginQr(
  dataUri: string,
  options: {
    allowSixel?: boolean;
    writeRaw?: (text: string) => void;
  } = {}
): "sixel" | "external" | "data" {
  if (!toPngBuffer(dataUri)) return "data";
  if (options.allowSixel !== false && options.writeRaw && renderQrAsSixel(dataUri, options.writeRaw)) {
    return "sixel";
  }
  if (openQrImageWithSystemDefault(dataUri)) {
    return "external";
  }
  return "data";
}
