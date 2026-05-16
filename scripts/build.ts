#!/usr/bin/env bun
import { $ } from "bun"
import { existsSync } from "node:fs"
import pkg from "../package.json"

const platform = process.argv[2] || ""
const target = platform ? `--target=bun-${platform}` : ""

const outfile = platform 
  ? `artifacts/ncm-cloud-${platform === "windows-x64" ? "win.exe" : platform.replace("-x64", "")}`
  : "artifacts/ncm-cloud"

// Windows 图标参数
const iconPath = "assets/icons/icon.ico"
const iconArgs = platform === "windows-x64" && existsSync(iconPath) 
  ? `--windows-icon=${iconPath}` 
  : ""

await $`bun run generate:api`
await $`bun build src/cli/index.ts --compile ${target} ${iconArgs} --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
