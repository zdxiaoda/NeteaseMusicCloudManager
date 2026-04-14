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
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const { image2sixel } = require("sixel") as {
  image2sixel: (
    data: Uint8Array,
    width: number,
    height: number,
    maxColors?: number,
    backgroundSelect?: number
  ) => string;
};
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

/** 终端内联位图（Sixel）；不支持时多数终端会忽略或略乱码，可设 NCM_QR_SIXEL=0 跳过。 */
const SIXEL_MAX_QR_PX = 200;

const maxDimensionClamp = (sw: number, sh: number, maxDim: number): { w: number; h: number } => {
  if (sw <= maxDim && sh <= maxDim) return { w: sw, h: sh };
  if (sw >= sh) {
    const w = maxDim;
    const h = Math.max(1, Math.round((sh * maxDim) / sw));
    return { w, h };
  }
  const h = maxDim;
  const w = Math.max(1, Math.round((sw * maxDim) / sh));
  return { w, h };
};

const scaleRgbaNearest = (src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array => {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(Math.floor((y * sh) / dh), sh - 1);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(Math.floor((x * sw) / dw), sw - 1);
      const si = (sy * sw + sx) * 4;
      const oi = (y * dw + x) * 4;
      out[oi] = src[si]!;
      out[oi + 1] = src[si + 1]!;
      out[oi + 2] = src[si + 2]!;
      out[oi + 3] = src[si + 3]!;
    }
  }
  return out;
};

const tryRenderQrSixel = (pngBuffer: Buffer): boolean => {
  if (!process.stdout.isTTY) return false;
  if (process.env.NCM_QR_SIXEL === "0") return false;
  try {
    const png = PNG.sync.read(pngBuffer);
    const w = png.width;
    const h = png.height;
    const { w: tw, h: th } = maxDimensionClamp(w, h, SIXEL_MAX_QR_PX);
    const src = new Uint8Array(png.data);
    const rgba = tw !== w || th !== h ? scaleRgbaNearest(src, w, h, tw, th) : src;
    const seq = image2sixel(rgba, tw, th, 256, 0);
    console.log(seq);
    return true;
  } catch {
    return false;
  }
};

/** 将二维码 PNG 写入临时文件并用系统默认应用打开（Windows / macOS / Linux）。 */
const openQrImageWithSystemDefault = (dataUri: string): boolean => {
  const prefix = "data:image/png;base64,";
  if (!dataUri.startsWith(prefix)) return false;
  const tmpFile = path.join(os.tmpdir(), `ncm-qr-open-${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(dataUri.slice(prefix.length), "base64"));
    if (process.platform === "win32") {
      const shell = process.env.ComSpec || "cmd.exe";
      const res = spawnSync(shell, ["/c", "start", "", tmpFile], {
        stdio: "ignore",
        windowsHide: true
      });
      return res.status === 0;
    }
    if (process.platform === "darwin") {
      const res = spawnSync("open", [tmpFile], { stdio: "ignore" });
      return res.status === 0;
    }
    if (process.platform === "linux") {
      if (!commandExists("xdg-open")) return false;
      const res = spawnSync("xdg-open", [tmpFile], { stdio: "ignore" });
      return res.status === 0;
    }
    return false;
  } catch {
    return false;
  }
};

/** 登录二维码展示：默认 Sixel → 系统打开图片 → 最后输出 data URL。 */
const showLoginQr = (dataUri: string): "sixel" | "external" | "data" => {
  const prefix = "data:image/png;base64,";
  if (!dataUri.startsWith(prefix)) {
    console.log(chalk.yellow("无效的二维码 data URI，原始内容："));
    console.log(dataUri);
    return "data";
  }
  const pngBuffer = Buffer.from(dataUri.slice(prefix.length), "base64");

  if (tryRenderQrSixel(pngBuffer)) {
    return "sixel";
  }

  if (openQrImageWithSystemDefault(dataUri)) {
    return "external";
  }

  console.log(chalk.yellow("无法在终端显示（Sixel）或系统打开图片，请手动复制以下 data URL 到浏览器："));
  console.log(dataUri);
  return "data";
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
      const mode = showLoginQr(qr.qrimg);
      if (mode === "sixel") {
        console.log(chalk.gray("已在终端内显示二维码（Sixel）。"));
      } else if (mode === "external") {
        console.log(chalk.gray("已使用系统默认应用打开二维码图片。"));
      }
      const qrFallbackAction = (await input({
        message: "若未看到二维码：输入 o 打开图片，输入 p 打印 data URL，直接回车继续等待扫码"
      }))
        .trim()
        .toLowerCase();
      if (qrFallbackAction === "o") {
        const opened = openQrImageWithSystemDefault(qr.qrimg);
        if (opened) {
          console.log(chalk.gray("已使用系统默认应用打开二维码图片。"));
        } else {
          console.log(chalk.yellow("打开图片失败，可输入 p 查看 data URL。"));
        }
      } else if (qrFallbackAction === "p") {
        console.log(chalk.yellow("请手动复制以下 data URL 到浏览器："));
        console.log(qr.qrimg);
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
  .option("--target <target>", "同步目标: cloud / local / quality-update", "cloud")
  .option("--quality-threshold-mb <n>", "音质更新阈值（MB，默认 3）", "3")
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
    } else if (opts.target === "local") {
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
    } else if (opts.target === "quality-update") {
      const thresholdMb = Math.max(0, Number(opts.qualityThresholdMb) || 3);
      const candidates = app.diffSyncService.collectQualityUpdateCandidates(diff, thresholdMb);
      const ok = await confirm({
        message: `将检查匹配歌曲并更新 ${candidates.length} 首（文件大小差异 > ${thresholdMb}MB），继续？`
      });
      if (!ok) return;
      const summary = await app.diffSyncService.syncQualityUpdateWithReport(diff, thresholdMb, (phase, s, message) => {
        updateBar(phase, s.total, s.success + s.failed, message || "");
      });
      bars.stop();
      console.log(chalk.green(`音质更新完成：成功 ${summary.success}，失败 ${summary.failed}`));
      if (summary.failures.length) {
        const failureTable = new Table({ head: ["任务", "名称", "原因", "重试次数"] });
        for (const f of summary.failures) {
          failureTable.push([f.id, f.name, f.reason, f.attempts]);
        }
        console.log(chalk.red("失败重试面板："));
        console.log(failureTable.toString());
      }
    } else {
      bars.stop();
      throw new Error(`未知同步目标: ${opts.target}`);
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
