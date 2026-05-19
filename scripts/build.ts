#!/usr/bin/env bun
import { $ } from "bun"
import { existsSync, rmSync } from "node:fs"
import pkg from "../package.json"

const platform = process.argv[2] || ""
const target = platform ? `--target=bun-${platform}` : ""

const binName = platform 
  ? `ncm-cloud-${platform === "windows-x64" ? "win.exe" : platform.replace("-x64", "")}`
  : "ncm-cloud"

const outfile = `artifacts/${binName}`

// 清理旧产物
if (existsSync("artifacts")) {
  rmSync("artifacts", { recursive: true })
}

if (platform === "windows-x64" && existsSync("assets/icons/icon.ico")) {
  await $`bun build src/cli/index.ts --compile --target=bun-windows-x64 --windows-icon=assets/icons/icon.ico --define __APP_VERSION__="'${pkg.version}'" --define __COMPILED__="true" --outfile ${outfile}`
} else if (target) {
  await $`bun build src/cli/index.ts --compile ${target} --define __APP_VERSION__="'${pkg.version}'" --define __COMPILED__="true" --outfile ${outfile}`
} else {
  await $`bun build src/cli/index.ts --compile --define __APP_VERSION__="'${pkg.version}'" --define __COMPILED__="true" --outfile ${outfile}`
}

console.log(`完成: ${outfile}`)
