#!/usr/bin/env node
import { Command } from "commander";
import Table from "cli-table3";
import cliProgress from "cli-progress";
import { input, password, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { createApp } from "../bootstrap.js";
import { startTui } from "../tui/app.js";
const program = new Command();
const defaultBaseUrl = process.env.NCM_API_BASE_URL || "http://localhost:3000";
program.name("ncm-cloud").description("网易云音乐云盘歌曲管理 CLI").version("0.1.0");
const withApp = (baseUrl) => createApp(baseUrl || defaultBaseUrl);
program
    .command("login")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("账号登录（手机号/邮箱/二维码）")
    .action(async (opts) => {
    const app = withApp(opts.baseUrl);
    const already = await app.authService.ensureLogin();
    if (already) {
        console.log(chalk.green("当前已登录，无需重复登录。"));
        return;
    }
    const method = await select({
        message: "选择登录方式",
        choices: [
            { name: "手机号", value: "phone" },
            { name: "邮箱", value: "email" },
            { name: "二维码", value: "qr" }
        ]
    });
    if (method === "phone") {
        const phone = await input({ message: "手机号" });
        const pwd = await password({ message: "密码" });
        await app.authService.loginByPhone(phone, pwd);
    }
    else if (method === "email") {
        const email = await input({ message: "邮箱" });
        const pwd = await password({ message: "密码" });
        await app.authService.loginByEmail(email, pwd);
    }
    else {
        const qr = await app.authService.createQr();
        console.log(chalk.cyan("请扫码登录（复制链接到浏览器查看二维码图片）："));
        console.log(qr.qrimg);
        const ok = await app.authService.waitQrLogin(qr.key);
        if (!ok)
            throw new Error("二维码登录超时");
    }
    console.log(chalk.green("登录成功"));
});
program
    .command("status")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("检查登录状态")
    .action(async (opts) => {
    const app = withApp(opts.baseUrl);
    const ok = await app.authService.ensureLogin();
    console.log(ok ? chalk.green("登录状态有效") : chalk.yellow("未登录或登录已过期"));
});
program
    .command("cloud:list")
    .option("--refresh", "强制刷新云盘缓存")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("列出云盘歌曲")
    .action(async (opts) => {
    const app = withApp(opts.baseUrl);
    const spinner = ora("加载云盘歌曲...").start();
    const songs = await app.cloudService.getCloudSongs(Boolean(opts.refresh));
    spinner.succeed(`共 ${songs.length} 首`);
    const table = new Table({
        head: ["CloudID", "歌曲名", "歌手", "专辑", "时长(s)"],
        colWidths: [12, 30, 20, 20, 12]
    });
    for (const song of songs.slice(0, 100)) {
        table.push([song.cloudId, song.simpleSongName, song.artist, song.album, Math.round(song.durationMs / 1000)]);
    }
    console.log(table.toString());
    if (songs.length > 100) {
        console.log(chalk.gray(`仅展示前 100 首，实际 ${songs.length} 首。`));
    }
});
program
    .command("cloud:delete")
    .argument("<ids...>", "云盘歌曲 cloudId 列表")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("删除云盘歌曲")
    .action(async (ids, opts) => {
    const app = withApp(opts.baseUrl);
    const values = ids.map((x) => Number(x)).filter((x) => !Number.isNaN(x));
    await app.cloudService.deleteCloudSongs(values);
    console.log(chalk.green(`已请求删除 ${values.length} 首云盘歌曲`));
});
program
    .command("cloud:upload")
    .argument("<file>", "本地歌曲路径")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("上传歌曲到云盘")
    .action(async (file, opts) => {
    const app = withApp(opts.baseUrl);
    await app.cloudService.uploadSong(file);
    console.log(chalk.green(`上传完成: ${file}`));
});
program
    .command("cloud:download")
    .argument("<cloudId>", "云盘歌曲 cloudId")
    .argument("<targetDir>", "下载目标目录")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("下载云盘歌曲到本地")
    .action(async (cloudId, targetDir, opts) => {
    const app = withApp(opts.baseUrl);
    const songs = await app.cloudService.getCloudSongs(false);
    const target = songs.find((x) => x.cloudId === Number(cloudId));
    if (!target)
        throw new Error(`未找到 cloudId=${cloudId} 的歌曲`);
    const output = await app.cloudService.downloadCloudSong(target, targetDir);
    console.log(chalk.green(`下载完成: ${output}`));
});
program
    .command("cloud:match")
    .argument("<cloudId>", "云盘歌曲 cloudId")
    .argument("<songId>", "目标歌曲 songId")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("执行云盘歌曲匹配")
    .action(async (cloudId, songId, opts) => {
    const app = withApp(opts.baseUrl);
    await app.cloudService.matchSong(Number(cloudId), Number(songId));
    console.log(chalk.green("匹配请求已提交"));
});
program
    .command("scan")
    .argument("<folder>", "本地音乐目录")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("扫描本地音乐并建立缓存")
    .action(async (folder, opts) => {
    const app = withApp(opts.baseUrl);
    const spinner = ora("扫描本地音乐...").start();
    const songs = await app.localScanner.scan(folder);
    app.sessionStore.setLocalScanPath(folder);
    spinner.succeed(`扫描完成，共 ${songs.length} 首`);
});
program
    .command("diff")
    .option("--refresh-cloud", "强制刷新云盘缓存")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("比对本地与云盘差异")
    .action(async (opts) => {
    const app = withApp(opts.baseUrl);
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(Boolean(opts.refreshCloud));
    const diff = app.diffSyncService.buildDiff(local, cloud);
    console.log(chalk.cyan(`本地独有: ${diff.localOnly.length}`));
    console.log(chalk.cyan(`云盘独有: ${diff.cloudOnly.length}`));
    console.log(chalk.cyan(`精准匹配: ${diff.matchedExact.length}`));
    console.log(chalk.cyan(`模糊匹配: ${diff.matchedFuzzy.length}`));
});
program
    .command("sync")
    .option("--target <target>", "同步目标: cloud 或 local", "cloud")
    .option("--delete-local-only", "同步本地端时删除本地独有歌曲")
    .option("--download-cloud-only", "同步本地端时下载云盘独有歌曲到本地")
    .option("--download-dir <dir>", "下载目录，默认当前目录")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .description("执行双向同步")
    .action(async (opts) => {
    const app = withApp(opts.baseUrl);
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    const bars = new cliProgress.MultiBar({
        format: "{phase} |{bar}| {value}/{total} | {status}",
        hideCursor: true,
        clearOnComplete: false
    }, cliProgress.Presets.shades_classic);
    const phaseBars = new Map();
    const updateBar = (phase, total, value, status) => {
        if (!phaseBars.has(phase)) {
            phaseBars.set(phase, bars.create(Math.max(total, 1), 0, { phase, status: "starting" }));
        }
        const bar = phaseBars.get(phase);
        bar.setTotal(Math.max(total, 1));
        bar.update(Math.min(value, Math.max(total, 1)), { status: status.slice(0, 60) });
    };
    if (opts.target === "cloud") {
        const ok = await confirm({ message: `将删除云盘独有 ${diff.cloudOnly.length} 首并上传本地独有 ${diff.localOnly.length} 首，继续？` });
        if (!ok)
            return;
        const summary = await app.diffSyncService.syncCloudSideWithReport(diff, (phase, s, message) => {
            updateBar(phase, s.total, s.success + s.failed, message || "");
        });
        bars.stop();
        console.log(chalk.green(`云盘端同步完成：成功 ${summary.success}，失败 ${summary.failed}`));
        if (summary.failures.length) {
            const failureTable = new Table({ head: ["任务", "名称", "原因", "重试次数"] });
            for (const f of summary.failures) {
                failureTable.push([f.id, f.name, f.reason, f.attempts]);
            }
            console.log(chalk.red("失败重试面板："));
            console.log(failureTable.toString());
        }
    }
    else {
        const result = await app.diffSyncService.syncLocalSide(diff, {
            deleteLocalOnly: Boolean(opts.deleteLocalOnly),
            downloadCloudOnly: Boolean(opts.downloadCloudOnly),
            downloadDir: opts.downloadDir
        }, (phase, s, message) => {
            updateBar(phase, s.total, s.success + s.failed, message || "");
        });
        bars.stop();
        console.log(chalk.green(`本地端同步完成，删除本地独有 ${result.deletedLocal} 首`));
        if (result.downloadSummary) {
            console.log(chalk.green(`云盘独有下载：成功 ${result.downloadSummary.success}，失败 ${result.downloadSummary.failed}`));
        }
        else {
            console.log(chalk.yellow(`云盘独有 ${result.cloudOnlyPending} 首暂存待下载队列`));
        }
        const failures = result.downloadSummary?.failures || [];
        if (failures.length) {
            const failureTable = new Table({ head: ["任务", "名称", "原因", "重试次数"] });
            for (const f of failures) {
                failureTable.push([f.id, f.name, f.reason, f.attempts]);
            }
            console.log(chalk.red("失败重试面板："));
            console.log(failureTable.toString());
        }
    }
});
program
    .command("tui")
    .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
    .option("--ascii", "ASCII 降级模式（终端乱码时使用）")
    .description("启动全屏 TUI")
    .action(async (opts) => {
    await startTui(opts.baseUrl || defaultBaseUrl, { ascii: Boolean(opts.ascii) });
});
program.parseAsync(process.argv).catch((error) => {
    console.error(chalk.red(`执行失败: ${error.message}`));
    process.exit(1);
});
//# sourceMappingURL=index.js.map