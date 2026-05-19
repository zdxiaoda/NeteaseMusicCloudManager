import { parentPort } from "node:worker_threads";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpPath = os.tmpdir();

async function start() {
  const anonymousTokenPath = path.resolve(tmpPath, "anonymous_token");
  if (!existsSync(anonymousTokenPath)) {
    writeFileSync(anonymousTokenPath, "", "utf-8");
  }

  const generateConfig = require("./generateConfig");
  await generateConfig();

  require("./server").serveNcmApi({
    checkVersion: true,
  });

  parentPort?.postMessage("started");
}

start().catch((err) => {
  parentPort?.postMessage({ error: err.message });
});
