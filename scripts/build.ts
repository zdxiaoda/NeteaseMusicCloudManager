#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"

const platform = process.argv[2] || ""
const target = platform ? `--target=bun-${platform}` : ""

const outfile = platform 
  ? `artifacts/ncm-cloud-${platform === "windows-x64" ? "win.exe" : platform.replace("-x64", "")}`
  : "artifacts/ncm-cloud"

await $`bun run generate:api`

if (target) {
  await $`bun build src/cli/index.ts --compile ${target} --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
} else {
  await $`bun build src/cli/index.ts --compile --define __APP_VERSION__="'${pkg.version}'" --outfile ${outfile}`
}
