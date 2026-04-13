import axios from "axios";
import { spawn } from "node:child_process";
let serverProcess;
function isLocalAddress(baseUrl) {
    try {
        const url = new URL(baseUrl);
        return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    }
    catch {
        return false;
    }
}
function parsePort(baseUrl) {
    const url = new URL(baseUrl);
    if (url.port)
        return url.port;
    return url.protocol === "https:" ? "443" : "80";
}
async function isApiReady(baseUrl) {
    try {
        await axios.get(`${baseUrl.replace(/\/$/, "")}/login/status`, {
            timeout: 1500,
            validateStatus: () => true
        });
        return true;
    }
    catch {
        return false;
    }
}
async function waitReady(baseUrl, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isApiReady(baseUrl))
            return true;
        await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return false;
}
export async function ensureApiServer(baseUrl) {
    if (!isLocalAddress(baseUrl))
        return;
    if (await isApiReady(baseUrl))
        return;
    if (serverProcess && !serverProcess.killed) {
        const ok = await waitReady(baseUrl, 15000);
        if (ok)
            return;
    }
    const port = parsePort(baseUrl);
    const commands = [
        // Prefer local cached/global npx first.
        { cmd: "npx", args: ["@neteasecloudmusicapienhanced/api"], readyTimeoutMs: 45000 },
        // Fallback for first run without cache.
        { cmd: "npx", args: ["-y", "@neteasecloudmusicapienhanced/api"], readyTimeoutMs: 90000 }
    ];
    for (const item of commands) {
        const proc = spawn(item.cmd, item.args, {
            env: { ...process.env, PORT: port, NCM_LOG_LEVEL: "error" },
            stdio: "ignore",
            detached: true
        });
        proc.unref();
        serverProcess = proc;
        const ready = await waitReady(baseUrl, item.readyTimeoutMs);
        if (ready) {
            return;
        }
        if (!proc.killed && proc.pid) {
            try {
                process.kill(-proc.pid, "SIGTERM");
            }
            catch {
                // ignore kill failures for already-exited process
            }
        }
        serverProcess = undefined;
    }
    throw new Error(`自动启动网易云 API 失败，请按文档手动启动: PORT=${port} npx @neteasecloudmusicapienhanced/api`);
}
//# sourceMappingURL=api-server-manager.js.map