#!/usr/bin/env bun
import { $ } from "bun"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import pkg from "../package.json"

const platform = process.argv[2] || ""
const target = platform ? `--target=bun-${platform}` : ""

const currentPlatform =
  process.platform === "win32"
    ? `windows-${process.arch}`
    : `${process.platform}-${process.arch}`
const resolvedPlatform = platform || currentPlatform

const pkgTargetMap: Record<string, string> = {
  "windows-x64": "node18-win-x64",
  "linux-x64": "node18-linux-x64",
  "darwin-arm64": "node18-macos-arm64",
  "darwin-x64": "node18-macos-x64",
}

const pkgTarget = pkgTargetMap[resolvedPlatform]
if (!pkgTarget) {
  throw new Error(`不支持的打包平台: ${resolvedPlatform}`)
}

const binName = platform 
  ? `ncm-cloud-${platform === "windows-x64" ? "win.exe" : platform.replace("-x64", "")}`
  : "ncm-cloud"
const apiExeName = resolvedPlatform.startsWith("windows-") ? "api-server.exe" : "api-server"

const outfile = `artifacts/${binName}`
const zipName = binName.replace(/\.exe$/, "")
const zipFile = `artifacts/${zipName}.zip`

// 清理旧产物
if (existsSync("artifacts")) {
  rmSync("artifacts", { recursive: true })
}
mkdirSync("artifacts", { recursive: true })

if (platform === "windows-x64" && existsSync("assets/icons/icon.ico")) {
  await $`bun build src/cli/index.ts --compile --target=bun-windows-x64 --windows-icon=assets/icons/icon.ico --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
} else if (target) {
  await $`bun build src/cli/index.ts --compile ${target} --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
} else {
  await $`bun build src/cli/index.ts --compile --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
}

await $`bunx pkg api-package.json --target ${pkgTarget} --output artifacts/${apiExeName}`

// 打包 zip：主二进制 + API 独立二进制
console.log(`打包 ${zipFile}...`)
if (process.platform === "win32") {
  await $`powershell -Command "Compress-Archive -Path 'artifacts/${binName}', 'artifacts/${apiExeName}' -DestinationPath '${zipFile}' -Force"`
} else {
  await $`cd artifacts && zip -j ${zipName}.zip ${binName} ${apiExeName}`
}
console.log(`完成: ${zipFile}`)
