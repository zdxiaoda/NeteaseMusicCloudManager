#!/usr/bin/env node
import { Command } from "commander";
import Table from "cli-table3";
import cliProgress from "cli-progress";
import { input, password, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import QRCode from "qrcode";
import { createApp } from "../bootstrap.js";
import { startTui } from "../tui/app.js";
import { ensureApiServer } from "../infra/api/api-server-manager.js";

const program = new Command();
const defaultBaseUrl = process.env.NCM_API_BASE_URL || "http://localhost:3000";

program.name("ncm-cloud").description("网易云音乐云盘歌曲管理 CLI").version("0.1.0");

const withAppReady = async (baseUrl?: string) => {
  const url = baseUrl || defaultBaseUrl;
  if (process.env.NCM_AUTO_START_API !== "0") {
    await ensureApiServer(url);
  }
  return createApp(url);
};

const commandExists = (name: string): boolean => {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [name], { stdio: "ignore" });
  return result.status === 0;
};

const renderQrInTerminal = async (dataUri: string): Promise<"image" | "text" | "none"> => {
  const prefix = "data:image/png;base64,";
  if (!dataUri.startsWith(prefix)) return "none";
  const tmpFile = path.join(os.tmpdir(), `ncm-qr-${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(dataUri.slice(prefix.length), "base64"));
    if (commandExists("kitten")) {
      const res = spawnSync("kitten", ["icat", tmpFile], { stdio: "inherit" });
      if (res.status === 0) return "image";
    }
    if (commandExists("imgcat")) {
      const res = spawnSync("imgcat", [tmpFile], { stdio: "inherit" });
      if (res.status === 0) return "image";
    }
    const textQr = await QRCode.toString(dataUri, {
      type: "terminal",
      errorCorrectionLevel: "M",
      small: true
    });
    console.log(textQr);
    return "text";
  } catch {
    return "none";
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore temp file cleanup errors
    }
  }
};

const openQrWithXdgOpen = (dataUri: string): boolean => {
  const prefix = "data:image/png;base64,";
  if (!dataUri.startsWith(prefix)) return false;
  if (process.platform !== "linux") return false;
  if (!commandExists("xdg-open")) return false;
  const tmpFile = path.join(os.tmpdir(), `ncm-qr-open-${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(dataUri.slice(prefix.length), "base64"));
    const res = spawnSync("xdg-open", [tmpFile], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
};

program
  .command("login")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("账号登录（手机号/邮箱/二维码）")
  .action(async (opts) => {
    const app = await withAppReady(opts.baseUrl);
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
    } else if (method === "email") {
      const email = await input({ message: "邮箱" });
      const pwd = await password({ message: "密码" });
      await app.authService.loginByEmail(email, pwd);
    } else {
      const qr = await app.authService.createQr();
      console.log(chalk.cyan("请扫码登录："));
      const rendered = await renderQrInTerminal(qr.qrimg);
      if (rendered === "text") {
        console.log(chalk.gray("已使用终端文本二维码渲染。"));
      } else if (rendered === "none") {
        const opened = openQrWithXdgOpen(qr.qrimg);
        if (opened) {
          console.log(chalk.gray("终端渲染失败，已使用 xdg-open 打开二维码图片。"));
        } else {
          console.log(chalk.yellow("终端渲染和 xdg-open 均失败，回退为 data URL："));
          console.log(qr.qrimg);
        }
      }
      const ok = await app.authService.waitQrLogin(qr.key);
      if (!ok) throw new Error("二维码登录超时");
    }
    console.log(chalk.green("登录成功"));
  });

program
  .command("status")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("检查登录状态")
  .action(async (opts) => {
    const app = await withAppReady(opts.baseUrl);
    const ok = await app.authService.ensureLogin();
    console.log(ok ? chalk.green("登录状态有效") : chalk.yellow("未登录或登录已过期"));
  });

program
  .command("cloud:list")
  .option("--refresh", "强制刷新云盘缓存")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("列出云盘歌曲")
  .action(async (opts) => {
    const app = await withAppReady(opts.baseUrl);
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
  .action(async (ids: string[], opts) => {
    const app = await withAppReady(opts.baseUrl);
    const values = ids.map((x) => Number(x)).filter((x) => !Number.isNaN(x));
    await app.cloudService.deleteCloudSongs(values);
    console.log(chalk.green(`已请求删除 ${values.length} 首云盘歌曲`));
  });

program
  .command("cloud:upload")
  .argument("<file>", "本地歌曲路径")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("上传歌曲到云盘")
  .action(async (file: string, opts) => {
    const app = await withAppReady(opts.baseUrl);
    await app.cloudService.uploadSong(file);
    console.log(chalk.green(`上传完成: ${file}`));
  });

program
  .command("cloud:download")
  .argument("<cloudId>", "云盘歌曲 cloudId")
  .argument("<targetDir>", "下载目标目录")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("下载云盘歌曲到本地")
  .action(async (cloudId: string, targetDir: string, opts) => {
    const app = await withAppReady(opts.baseUrl);
    const songs = await app.cloudService.getCloudSongs(false);
    const target = songs.find((x) => x.cloudId === Number(cloudId));
    if (!target) throw new Error(`未找到 cloudId=${cloudId} 的歌曲`);
    const output = await app.cloudService.downloadCloudSong(target, targetDir);
    console.log(chalk.green(`下载完成: ${output}`));
  });

program
  .command("cloud:match")
  .argument("<cloudId>", "云盘歌曲 cloudId")
  .argument("<songId>", "目标歌曲 songId")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("执行云盘歌曲匹配")
  .action(async (cloudId: string, songId: string, opts) => {
    const app = await withAppReady(opts.baseUrl);
    await app.cloudService.matchSong(Number(cloudId), Number(songId));
    console.log(chalk.green("匹配请求已提交"));
  });

program
  .command("scan")
  .argument("<folder>", "本地音乐目录")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("扫描本地音乐并建立缓存")
  .action(async (folder: string, opts) => {
    const app = await withAppReady(opts.baseUrl);
    const spinner = ora("扫描本地音乐...").start();
    const songs = await app.localScanner.scan(folder);
    app.sessionStore.setLocalScanPath(folder);
    spinner.succeed(`扫描完成，共 ${songs.length} 首`);
  });

program
  .command("diff")
  .option("--refresh-cloud", "强制刷新云盘缓存")
  .option("--all", "显示全量明细")
  .option("--limit <n>", "每类最多显示条数（默认 100）", "100")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("比对本地与云盘差异")
  .action(async (opts) => {
    const app = await withAppReady(opts.baseUrl);
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(Boolean(opts.refreshCloud));
    const diff = app.diffSyncService.buildDiff(local, cloud);
    console.log(chalk.cyan(`本地独有: ${diff.localOnly.length}`));
    console.log(chalk.cyan(`云盘独有: ${diff.cloudOnly.length}`));
    console.log(chalk.cyan(`精准匹配: ${diff.matchedExact.length}`));
    console.log(chalk.cyan(`模糊匹配: ${diff.matchedFuzzy.length}`));

    const parsedLimit = Number(opts.limit);
    const limit = opts.all ? Number.MAX_SAFE_INTEGER : Number.isNaN(parsedLimit) ? 100 : Math.max(parsedLimit, 0);
    const take = <T>(arr: T[]) => arr.slice(0, limit);

    const localOnlyTable = new Table({
      head: ["本地文件", "标题", "歌手", "时长(s)"],
      colWidths: [40, 26, 20, 10]
    });
    for (const row of take(diff.localOnly)) {
      localOnlyTable.push([row.fileName, row.title, row.artist, Math.round(row.durationMs / 1000)]);
    }
    console.log(chalk.yellow("\n=== 本地独有明细 ==="));
    console.log(localOnlyTable.toString());

    const cloudOnlyTable = new Table({
      head: ["CloudID", "文件名", "歌曲名", "歌手"],
      colWidths: [12, 30, 26, 20]
    });
    for (const row of take(diff.cloudOnly)) {
      cloudOnlyTable.push([row.cloudId, row.fileName, row.simpleSongName, row.artist]);
    }
    console.log(chalk.yellow("\n=== 云盘独有明细 ==="));
    console.log(cloudOnlyTable.toString());

    const exactTable = new Table({
      head: ["本地文件", "云盘文件", "歌曲名", "歌手"],
      colWidths: [28, 28, 24, 20]
    });
    for (const row of take(diff.matchedExact)) {
      exactTable.push([row.local.fileName, row.cloud.fileName, row.cloud.simpleSongName, row.cloud.artist]);
    }
    console.log(chalk.yellow("\n=== 精准匹配明细 ==="));
    console.log(exactTable.toString());

    const fuzzyTable = new Table({
      head: ["本地文件", "云盘文件", "歌曲名", "歌手", "相似度"],
      colWidths: [24, 24, 20, 16, 10]
    });
    for (const row of take(diff.matchedFuzzy)) {
      fuzzyTable.push([
        row.local.fileName,
        row.cloud.fileName,
        row.cloud.simpleSongName,
        row.cloud.artist,
        row.score.toFixed(3)
      ]);
    }
    console.log(chalk.yellow("\n=== 模糊匹配明细 ==="));
    console.log(fuzzyTable.toString());

    if (!opts.all) {
      console.log(chalk.gray(`\n已按每类最多 ${limit} 条展示；使用 --all 可看全量。`));
    }
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
    const app = await withAppReady(opts.baseUrl);
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    const bars = new cliProgress.MultiBar(
      {
        format: "{phase} |{bar}| {value}/{total} | {status}",
        hideCursor: true,
        clearOnComplete: false
      },
      cliProgress.Presets.shades_classic
    );
    const phaseBars = new Map<string, cliProgress.SingleBar>();
    const updateBar = (phase: string, total: number, value: number, status: string) => {
      if (!phaseBars.has(phase)) {
        phaseBars.set(phase, bars.create(Math.max(total, 1), 0, { phase, status: "starting" }));
      }
      const bar = phaseBars.get(phase)!;
      bar.setTotal(Math.max(total, 1));
      bar.update(Math.min(value, Math.max(total, 1)), { status: status.slice(0, 60) });
    };

    if (opts.target === "cloud") {
      const ok = await confirm({ message: `将删除云盘独有 ${diff.cloudOnly.length} 首并上传本地独有 ${diff.localOnly.length} 首，继续？` });
      if (!ok) return;
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
    } else {
      const result = await app.diffSyncService.syncLocalSide(
        diff,
        {
          deleteLocalOnly: Boolean(opts.deleteLocalOnly),
          downloadCloudOnly: Boolean(opts.downloadCloudOnly),
          downloadDir: opts.downloadDir
        },
        (phase, s, message) => {
          updateBar(phase, s.total, s.success + s.failed, message || "");
        }
      );
      bars.stop();
      console.log(chalk.green(`本地端同步完成，删除本地独有 ${result.deletedLocal} 首`));
      if (result.downloadSummary) {
        console.log(chalk.green(`云盘独有下载：成功 ${result.downloadSummary.success}，失败 ${result.downloadSummary.failed}`));
      } else {
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
    const baseUrl = opts.baseUrl || defaultBaseUrl;
    if (process.env.NCM_AUTO_START_API !== "0") {
      await ensureApiServer(baseUrl);
    }
    await startTui(baseUrl, { ascii: Boolean(opts.ascii) });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(`执行失败: ${error.message}`));
  process.exit(1);
});
