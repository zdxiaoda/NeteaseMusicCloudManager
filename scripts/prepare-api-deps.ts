#!/usr/bin/env bun
/**
 * 构建后脚本：复制 @neteasecloudmusicapienhanced/api 包及其所有传递依赖到 artifacts/api 目录
 * 这样编译后的可执行文件可以找到并启动 API 服务器
 */

import { existsSync, mkdirSync, cpSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const artifactsDir = join(projectRoot, "artifacts");
const apiTargetDir = join(artifactsDir, "api");
const nodeModulesDir = join(projectRoot, "node_modules");

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

function readPackageJson(pkgDir: string): Record<string, string> | null {
  const pkgPath = join(pkgDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const content = readFileSync(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 递归收集包的所有依赖（包括传递依赖）
 */
function collectAllDeps(
  entryPkgDir: string,
  collected: Set<string> = new Set()
): Set<string> {
  const pkg = readPackageJson(entryPkgDir);
  if (!pkg) return collected;

  const deps = { ...pkg.dependencies };
  for (const depName of Object.keys(deps)) {
    if (collected.has(depName)) continue;
    collected.add(depName);

    // 找到这个依赖的实际目录
    let depDir: string | null = null;

    // 先从 entryPkgDir 的 node_modules 找（嵌套依赖）
    const nestedPath = join(entryPkgDir, "node_modules", depName);
    if (existsSync(nestedPath)) {
      depDir = nestedPath;
    } else {
      // 从项目根 node_modules 找
      const rootPath = join(nodeModulesDir, depName);
      if (existsSync(rootPath)) {
        depDir = rootPath;
      }
    }

    if (depDir) {
      collectAllDeps(depDir, collected);
    }
  }

  return collected;
}

/**
 * 收集所有依赖（包括scoped包）
 */
function collectAllDepsWithScopes(
  entryPkgDir: string,
  collected: Set<string> = new Set()
): Set<string> {
  collectAllDeps(entryPkgDir, collected);
  
  // 也收集scoped包的依赖
  const pkg = readPackageJson(entryPkgDir);
  if (pkg) {
    const deps = { ...pkg.dependencies };
    for (const depName of Object.keys(deps)) {
      if (depName.startsWith("@")) {
        const scopedDir = join(nodeModulesDir, depName);
        if (existsSync(scopedDir)) {
          collectAllDeps(scopedDir, collected);
        }
      }
    }
  }
  
  return collected;
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
    if (file === "util") continue;
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

// 递归收集所有依赖
console.log("递归收集依赖...");
const allDeps = collectAllDepsWithScopes(apiSourceDir);
console.log(`共发现 ${allDeps.size} 个依赖`);

// 复制所有依赖到 api/node_modules
const apiNodeModulesDir = join(apiTargetDir, "node_modules");
ensureDir(apiNodeModulesDir);

for (const depName of allDeps) {
  const srcPath = join(nodeModulesDir, depName);
  const destPath = join(apiNodeModulesDir, depName);

  if (!existsSync(srcPath)) {
    console.warn(`警告：跳过不存在的依赖: ${depName}`);
    continue;
  }

  if (!statSync(srcPath).isDirectory()) continue;

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

console.log(`API 依赖已复制到: ${apiTargetDir}`);
console.log("完成！");
