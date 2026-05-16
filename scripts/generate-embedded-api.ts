#!/usr/bin/env bun
/**
 * 构建脚本：将 @neteasecloudmusicapienhanced/api 包打包成可嵌入的 TypeScript 模块
 * 这样可以将 API 服务器嵌入到单个可执行文件中
 */

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const nodeModulesDir = join(projectRoot, "node_modules");
const apiSourceDir = join(nodeModulesDir, "@neteasecloudmusicapienhanced", "api");
const outputDir = join(projectRoot, "src", "infra", "api");

// API 包需要的所有依赖
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
  // 传递依赖
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
  "p-queue",
  "eventemitter3",
];

interface FileEntry {
  path: string;
  content: string; // base64 encoded
}

function collectFiles(dir: string, baseDir: string, files: FileEntry[] = []): FileEntry[] {
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = relative(baseDir, fullPath);

    if (statSync(fullPath).isDirectory()) {
      collectFiles(fullPath, baseDir, files);
    } else {
      const content = readFileSync(fullPath);
      files.push({
        path: relativePath,
        content: content.toString("base64"),
      });
    }
  }

  return files;
}

console.log("收集 API 包文件...");

const allFiles: FileEntry[] = [];

// 收集 API 包主文件
const apiFiles = [
  "app.js",
  "server.js",
  "main.js",
  "generateConfig.js",
  "package.json",
];

for (const file of apiFiles) {
  const filePath = join(apiSourceDir, file);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath);
    allFiles.push({
      path: file,
      content: content.toString("base64"),
    });
  }
}

// 收集目录
const apiDirs = ["module", "plugins", "data", "public", "util"];
for (const dir of apiDirs) {
  const dirPath = join(apiSourceDir, dir);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    collectFiles(dirPath, apiSourceDir, allFiles);
  }
}

// 收集依赖
for (const dep of apiDependencies) {
  const depPath = join(nodeModulesDir, dep);
  if (existsSync(depPath) && statSync(depPath).isDirectory()) {
    collectFiles(depPath, nodeModulesDir, allFiles);
  }
}

// 收集 @neteasecloudmusicapienhanced 作用域
const scopeDir = join(nodeModulesDir, "@neteasecloudmusicapienhanced");
if (existsSync(scopeDir)) {
  const packages = readdirSync(scopeDir);
  for (const pkg of packages) {
    const pkgPath = join(scopeDir, pkg);
    if (statSync(pkgPath).isDirectory()) {
      collectFiles(pkgPath, nodeModulesDir, allFiles);
    }
  }
}

console.log(`共收集 ${allFiles.length} 个文件`);

// 生成嵌入模块
const outputFile = join(outputDir, "embedded-api.ts");

const lines: string[] = [
  '// 此文件由 scripts/generate-embedded-api.ts 自动生成，请勿手动修改',
  '',
  'export interface EmbeddedFile {',
  '  path: string;',
  '  content: Uint8Array;',
  '}',
  '',
  'export function getEmbeddedFiles(): EmbeddedFile[] {',
  '  return [',
];

// 使用更高效的方式：将所有文件打包成一个大的 base64 字符串，然后在运行时解码
// 但为了简单起见，我们直接生成代码

for (const file of allFiles) {
  // 将 base64 转换为字节数组的代码
  lines.push(`    { path: ${JSON.stringify(file.path)}, content: Uint8Array.from(atob("${file.content}"), c => c.charCodeAt(0)) },`);
}

lines.push('  ];');
lines.push('}');
lines.push('');
lines.push('export function getApiFileName(): string {');
lines.push('  return "app.js";');
lines.push('}');

writeFileSync(outputFile, lines.join("\n"));

console.log(`生成嵌入模块: ${outputFile}`);
console.log(`文件大小: ${(statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
console.log("完成！");
