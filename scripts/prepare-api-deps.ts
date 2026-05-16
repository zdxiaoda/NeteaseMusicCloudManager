#!/usr/bin/env bun
/**
 * 构建后脚本：复制 @neteasecloudmusicapienhanced/api 包及其依赖到 artifacts/api 目录
 * 这样编译后的可执行文件可以找到并启动 API 服务器
 */

import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const artifactsDir = join(projectRoot, "artifacts");
const apiTargetDir = join(artifactsDir, "api");
const nodeModulesDir = join(projectRoot, "node_modules");

// API 包需要的所有依赖（从其 package.json 中提取）
const apiDependencies = [
  "@neteasecloudmusicapienhanced/unblockmusic-utils",
  "axios",
  "crypto-js",
  "dotenv",
  "express",
  "express-fileupload",
  "gzip",
  "music-metadata",
  "node-forge",
  "pac-proxy-agent",
  "qrcode",
  "safe-decode-uri-component",
  "tunnel",
  "xml2js",
  "yargs",
];

function copyDirSync(src: string, dest: string) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  cpSync(src, dest, { recursive: true });
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

console.log("准备 API 依赖...");

// 创建 artifacts 目录
ensureDir(artifactsDir);
ensureDir(apiTargetDir);

// 复制 API 包主文件
const apiSourceDir = join(nodeModulesDir, "@neteasecloudmusicapienhanced", "api");
if (!existsSync(apiSourceDir)) {
  console.error(`错误：未找到 API 包: ${apiSourceDir}`);
  console.error("请先运行 bun install 安装依赖");
  process.exit(1);
}

// 复制 API 包的核心文件
const apiFiles = [
  "app.js",
  "server.js",
  "main.js",
  "generateConfig.js",
  "package.json",
  "module",
  "plugins",
  "data",
  "public",
  "util",
];

for (const file of apiFiles) {
  const srcPath = join(apiSourceDir, file);
  const destPath = join(apiTargetDir, file);

  if (!existsSync(srcPath)) {
    if (file === "util") {
      // util 目录可能不存在，跳过
      continue;
    }
    console.warn(`警告：跳过不存在的文件/目录: ${file}`);
    continue;
  }

  const stat = statSync(srcPath);
  if (stat.isDirectory()) {
    copyDirSync(srcPath, destPath);
  } else {
    ensureDir(dirname(destPath));
    cpSync(srcPath, destPath);
  }
}

// 复制 API 依赖到 api/node_modules
const apiNodeModulesDir = join(apiTargetDir, "node_modules");
ensureDir(apiNodeModulesDir);

// 复制直接依赖
for (const dep of apiDependencies) {
  const srcPath = join(nodeModulesDir, dep);
  const destPath = join(apiNodeModulesDir, dep);

  if (!existsSync(srcPath)) {
    console.warn(`警告：跳过不存在的依赖: ${dep}`);
    continue;
  }

  ensureDir(dirname(destPath));
  cpSync(srcPath, destPath, { recursive: true });
}

// 复制 @neteasecloudmusicapienhanced 作用域下的所有包
const scopeDir = join(nodeModulesDir, "@neteasecloudmusicapienhanced");
const scopeTargetDir = join(apiNodeModulesDir, "@neteasecloudmusicapienhanced");
if (existsSync(scopeDir)) {
  ensureDir(scopeTargetDir);
  const packages = readdirSync(scopeDir);
  for (const pkg of packages) {
    const srcPath = join(scopeDir, pkg);
    const destPath = join(scopeTargetDir, pkg);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    }
  }
}

// 复制重要的传递依赖
const transitiveDeps = [
  "follow-redirects",
  "proxy-from-env",
  "form-data",
  "mime-types",
  "mime-db",
  "combined-stream",
  "delayed-stream",
  "asynckit",
  "ms",
  "debug",
  "depd",
  "destroy",
  "encodeurl",
  "escape-html",
  "etag",
  "fresh",
  "http-errors",
  "inherits",
  "setprototypeof",
  "statuses",
  "toidentifier",
  "on-finished",
  "ee-first",
  "parseurl",
  "proxy-addr",
  "forwarded",
  "ipaddr.js",
  "qs",
  "raw-body",
  "bytes",
  "iconv-lite",
  "safer-buffer",
  "unpipe",
  "send",
  "mime",
  "range-parser",
  "serve-static",
  "content-disposition",
  "safe-buffer",
  "cookie",
  "cookie-signature",
  "body-parser",
  "content-type",
  "type-is",
  "media-typer",
  "methods",
  "path-to-regexp",
  "cors",
  "uuid",
  "busboy",
  "streamsearch",
  "fs-extra",
  "graceful-fs",
  "jsonfile",
  "universalify",
  "node-abort-controller",
];

// 复制这些传递依赖（如果存在）
for (const dep of transitiveDeps) {
  const srcPath = join(nodeModulesDir, dep);
  const destPath = join(apiNodeModulesDir, dep);

  if (existsSync(srcPath) && statSync(srcPath).isDirectory()) {
    ensureDir(dirname(destPath));
    copyDirSync(srcPath, destPath);
  }
}

console.log(`API 依赖已复制到: ${apiTargetDir}`);
console.log("完成！");
