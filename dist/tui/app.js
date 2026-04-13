import blessed from "blessed";
import { createApp } from "../bootstrap.js";
export async function startTui(baseUrl, options = {}) {
    const app = createApp(baseUrl);
    const preferAscii = Boolean(options.ascii || process.env.NCM_TUI_ASCII === "1");
    const menuItems = preferAscii
        ? [
            "1. Check login status",
            "2. Refresh cloud cache",
            "3. Show cloud song count",
            "4. Scan local music library",
            "5. Diff local/cloud songs",
            "6. Sync cloud side",
            "7. Sync local side (delete local-only)",
            "8. Sync local side (download cloud-only)",
            "q. Quit"
        ]
        : [
            "1. 检查登录状态",
            "2. 刷新云盘缓存",
            "3. 查看云盘歌曲数",
            "4. 扫描本地音乐库",
            "5. 比对本地/云盘差异",
            "6. 同步云盘端",
            "7. 同步本地端（删除本地独有）",
            "8. 同步本地端（下载云盘独有）",
            "q. 退出"
        ];
    const screen = blessed.screen({
        smartCSR: true,
        autoPadding: true,
        fullUnicode: !preferAscii,
        dockBorders: true,
        title: "NCM Cloud Manager"
    });
    const title = blessed.box({
        top: 0,
        left: "center",
        width: "100%",
        height: 3,
        content: preferAscii ? " NCM Cloud Manager " : " 网易云音乐云盘管理器 ",
        tags: false,
        border: "line",
        align: "center"
    });
    const menu = blessed.list({
        top: 3,
        left: 0,
        width: "35%",
        height: "100%-3",
        border: "line",
        keys: true,
        vi: true,
        style: {
            selected: {
                bg: "blue"
            }
        },
        items: menuItems
    });
    const output = blessed.log({
        top: 3,
        left: "35%",
        width: "65%",
        height: "100%-3",
        border: "line",
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        mouse: true,
        tags: false,
        label: preferAscii ? "Output" : "输出"
    });
    const runAction = async (index) => {
        try {
            if (index === 0) {
                const ok = await app.authService.ensureLogin();
                output.log(ok ? (preferAscii ? "Login is valid" : "登录状态有效") : preferAscii ? "Session expired, run login command first" : "未登录或会话失效，请先通过命令行 login 登录");
            }
            else if (index === 1) {
                const songs = await app.cloudService.getCloudSongs(true);
                output.log(preferAscii ? `Cache refreshed, cloud songs: ${songs.length}` : `缓存已刷新，云盘歌曲: ${songs.length}`);
            }
            else if (index === 2) {
                const songs = await app.cloudService.getCloudSongs(false);
                output.log(preferAscii ? `Cached cloud songs: ${songs.length}` : `当前云盘缓存歌曲数: ${songs.length}`);
            }
            else if (index === 3) {
                const scanPath = app.sessionStore.getLocalScanPath();
                if (!scanPath) {
                    output.log(preferAscii ? "Local scan path is not set, run scan first" : "未设置本地扫描目录，请先通过 scan 命令指定");
                }
                else {
                    const songs = await app.localScanner.scan(scanPath);
                    output.log(preferAscii ? `Scan done: ${songs.length}` : `扫描完成: ${songs.length} 首`);
                }
            }
            else if (index === 4) {
                const local = app.cacheRepo.getLocalSongs();
                const cloud = await app.cloudService.getCloudSongs(false);
                const diff = app.diffSyncService.buildDiff(local, cloud);
                output.log(preferAscii
                    ? `Diff: local-only ${diff.localOnly.length}, cloud-only ${diff.cloudOnly.length}, exact ${diff.matchedExact.length}, fuzzy ${diff.matchedFuzzy.length}`
                    : `差异：本地独有 ${diff.localOnly.length}，云盘独有 ${diff.cloudOnly.length}，精准匹配 ${diff.matchedExact.length}，模糊匹配 ${diff.matchedFuzzy.length}`);
            }
            else if (index === 5) {
                const local = app.cacheRepo.getLocalSongs();
                const cloud = await app.cloudService.getCloudSongs(false);
                const diff = app.diffSyncService.buildDiff(local, cloud);
                await app.diffSyncService.syncCloudSide(diff);
                output.log(preferAscii ? "Cloud-side sync done" : "已执行云盘端同步（删除云盘独有 + 上传本地独有）");
            }
            else if (index === 6) {
                const local = app.cacheRepo.getLocalSongs();
                const cloud = await app.cloudService.getCloudSongs(false);
                const diff = app.diffSyncService.buildDiff(local, cloud);
                const result = await app.diffSyncService.syncLocalSide(diff, { deleteLocalOnly: true });
                output.log(preferAscii
                    ? `Local-side sync done, deleted local-only ${result.deletedLocal}, cloud-only pending ${result.cloudOnlyPending}`
                    : `已执行本地端同步，删除本地独有 ${result.deletedLocal}，云盘独有待处理 ${result.cloudOnlyPending}`);
            }
            else if (index === 7) {
                const local = app.cacheRepo.getLocalSongs();
                const cloud = await app.cloudService.getCloudSongs(false);
                const diff = app.diffSyncService.buildDiff(local, cloud);
                const downloadDir = app.sessionStore.getLocalScanPath() || process.cwd();
                const result = await app.diffSyncService.syncLocalSide(diff, { downloadCloudOnly: true, downloadDir }, (_phase, summary, message) => {
                    if (message)
                        output.log(message);
                    if (summary.failed > 0) {
                        output.log(preferAscii
                            ? `Retry panel: failed ${summary.failed} / ${summary.total}`
                            : `失败重试面板：失败 ${summary.failed} / ${summary.total}`);
                    }
                });
                if (result.downloadSummary) {
                    output.log(preferAscii
                        ? `Download summary: success ${result.downloadSummary.success}, failed ${result.downloadSummary.failed}`
                        : `下载汇总：成功 ${result.downloadSummary.success}，失败 ${result.downloadSummary.failed}`);
                    for (const item of result.downloadSummary.failures.slice(0, 5)) {
                        output.log(preferAscii
                            ? `Fail: ${item.name} (${item.reason})`
                            : `失败：${item.name}（${item.reason}）`);
                    }
                }
            }
        }
        catch (error) {
            output.log(preferAscii ? `Failed: ${error.message}` : `执行失败: ${error.message}`);
        }
        screen.render();
    };
    menu.on("select", async (_item, idx) => {
        if (idx === 8) {
            screen.destroy();
            return;
        }
        await runAction(idx);
    });
    screen.key(["q", "C-c"], () => {
        screen.destroy();
    });
    screen.append(title);
    screen.append(menu);
    screen.append(output);
    menu.focus();
    screen.render();
}
//# sourceMappingURL=app.js.map