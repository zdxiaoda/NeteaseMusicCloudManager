#!/usr/bin/env node
import { Command } from "commander";
import Table from "cli-table3";
import cliProgress from "cli-progress";
import { input, password, select, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { createApp } from "../bootstrap.js";
import { ensureApiServer } from "../infra/api/api-server-manager.js";
import { openQrImageWithSystemDefault, showLoginQr } from "../infra/qr-display.js";

const program = new Command();
const defaultBaseUrl = process.env.NCM_API_BASE_URL || "http://localhost:3000";
// Keep query length bounded to avoid overly long prompt input and noisy search requests.
const SEARCH_KEYWORD_MAX_LENGTH = 200;
const bytesToMb = (bytes: number) => bytes / (1024 * 1024);

program.name("ncm-cloud").description("网易云音乐云盘歌曲管理 CLI").version("0.1.0");

const withAppReady = async (baseUrl?: string) => {
  const url = baseUrl || defaultBaseUrl;
  if (process.env.NCM_AUTO_START_API !== "0") {
    await ensureApiServer(url);
  }
  return createApp(url);
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
      const mode = showLoginQr(qr.qrimg, { allowSixel: true, writeRaw: (text) => console.log(text) });
      if (mode === "sixel") {
        console.log(chalk.gray("已在终端内显示二维码（Sixel）。"));
      } else if (mode === "external") {
        console.log(chalk.gray("已使用系统默认应用打开二维码图片。"));
      } else {
        console.log(chalk.yellow("无法在终端显示（Sixel）或系统打开图片，请手动复制以下 data URL 到浏览器："));
        console.log(qr.qrimg);
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
  .argument("<cloudSongId>", "云盘歌曲 songId（/cloud/match 的 sid）")
  .argument("<songId>", "目标歌曲 songId")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("执行云盘歌曲匹配")
  .action(async (cloudSongId: string, songId: string, opts) => {
    const app = await withAppReady(opts.baseUrl);
    await app.cloudService.matchSong(Number(cloudSongId), Number(songId));
    console.log(chalk.green("匹配请求已提交"));
  });

program
  .command("cloud:match:unmatched")
  .option("--refresh", "执行前刷新云盘列表")
  .option("--search-limit <n>", "每首歌展示的搜索结果数（默认 10）", "10")
  .option("--base-url <url>", "NeteaseCloudMusicApiEnhanced 地址")
  .description("筛选云盘未匹配歌曲并逐首人工匹配")
  .action(async (opts) => {
    const app = await withAppReady(opts.baseUrl);
    const spinner = ora("加载未匹配云盘歌曲...").start();
    const unmatched = await app.cloudService.getUnmatchedCloudSongs(Boolean(opts.refresh));
    spinner.stop();
    if (!unmatched.length) {
      console.log(chalk.green("当前云盘中没有未匹配歌曲。"));
      return;
    }

    console.log(chalk.yellow(`发现未匹配歌曲 ${unmatched.length} 首。`));
    const previewTable = new Table({
      head: ["CloudID", "文件名", "歌曲名", "歌手"],
      colWidths: [12, 30, 30, 24]
    });
    for (const song of unmatched.slice(0, 100)) {
      previewTable.push([song.cloudId, song.fileName, song.simpleSongName, song.artist]);
    }
    console.log(previewTable.toString());
    if (unmatched.length > 100) {
      console.log(chalk.gray(`仅展示前 100 首，实际 ${unmatched.length} 首。`));
    }

    const proceed = await confirm({ message: "开始逐首匹配？" });
    if (!proceed) return;

    const parsedLimit = Number(opts.searchLimit);
    const searchLimit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 10;
    for (const [i, target] of unmatched.entries()) {
      const defaultKeywords = `${target.simpleSongName} ${target.artist}`.trim();
      console.log(chalk.cyan(`\n[${i + 1}/${unmatched.length}] CloudID=${target.cloudId} ${target.simpleSongName} - ${target.artist}`));
      const action = await select({
        message: "操作",
        choices: [
          { name: "搜索并选择匹配", value: "search" },
          { name: "跳过这首", value: "skip" },
          { name: "结束本次匹配", value: "quit" }
        ]
      });
      if (action === "quit") break;
      if (action === "skip") continue;

      console.log(chalk.gray(`建议关键词：${defaultKeywords || "(空)"}`));
      const rawKeywords = (
        await input({
          message: "搜索关键词（可删减/重写，直接回车使用建议关键词）"
        })
      ).trim();
      const keywords = rawKeywords.slice(0, SEARCH_KEYWORD_MAX_LENGTH);
      if (rawKeywords.length > SEARCH_KEYWORD_MAX_LENGTH) {
        console.log(chalk.yellow(`关键词过长，已截断到 ${SEARCH_KEYWORD_MAX_LENGTH} 字符。`));
      }
      const query = keywords || defaultKeywords;
      if (!query) {
        console.log(chalk.yellow("关键词为空，已跳过。"));
        continue;
      }

      const searchSpinner = ora(`搜索：${query}`).start();
      const results = await app.cloudService.searchCloudSongs(query, searchLimit);
      searchSpinner.stop();
      if (!results.length) {
        console.log(chalk.yellow("无搜索结果，已跳过。"));
        continue;
      }

      const resultTable = new Table({
        head: ["序号", "SongID", "歌曲名", "歌手", "专辑", "时长(s)"],
        colWidths: [8, 10, 24, 18, 20, 10]
      });
      for (const [idx, row] of results.entries()) {
        resultTable.push([idx + 1, row.songId, row.name, row.artist, row.album, Math.round(row.durationMs / 1000)]);
      }
      console.log(resultTable.toString());

      const selected = await select({
        message: "选择对应歌曲（可不选）",
        choices: [
          ...results.map((row) => ({
            name: `${row.name} - ${row.artist} (#${row.songId})`,
            value: row.songId
          })),
          { name: "不选择（跳过）", value: 0 }
        ]
      });
      if (selected === 0) {
        console.log(chalk.gray("已跳过。"));
        continue;
      }
      const selectedSong = results.find((row) => row.songId === Number(selected));
      if (!selectedSong) {
        console.log(chalk.yellow("未找到所选歌曲详情，已跳过。"));
        continue;
      }
      if (!target.songId || target.songId <= 0) {
        console.log(chalk.yellow(`跳过：CloudID=${target.cloudId} 缺少云盘歌曲 songId(sid)，无法调用 /cloud/match`));
        continue;
      }
      const durationDiffMs = Math.abs((target.durationMs || 0) - (selectedSong.durationMs || 0));
      const remoteSize = await app.cloudService.getSongRemoteFileSize(selectedSong.songId);
      const sizeDiffBytes = remoteSize ? Math.abs(target.fileSize - remoteSize) : undefined;
      const compareTable = new Table({
        head: ["字段", "云盘歌曲", "候选歌曲", "差异"],
        colWidths: [10, 18, 18, 18]
      });
      compareTable.push([
        "时长(s)",
        Math.round(target.durationMs / 1000),
        Math.round(selectedSong.durationMs / 1000),
        (durationDiffMs / 1000).toFixed(1)
      ]);
      compareTable.push([
        "大小(MB)",
        bytesToMb(target.fileSize).toFixed(2),
        remoteSize ? bytesToMb(remoteSize).toFixed(2) : "未知",
        sizeDiffBytes ? bytesToMb(sizeDiffBytes).toFixed(2) : "未知"
      ]);
      console.log(compareTable.toString());
      const shouldMatch = await confirm({
        message: "确认以上对比后提交匹配？",
        default: durationDiffMs <= 3000 && (sizeDiffBytes === undefined || sizeDiffBytes <= 1024 * 1024)
      });
      if (!shouldMatch) {
        console.log(chalk.gray("你已取消本次匹配。"));
        continue;
      }
      await app.cloudService.matchSong(target.songId, selectedSong.songId);
      console.log(chalk.green(`匹配成功：sid=${target.songId} (CloudID=${target.cloudId}) -> SongID=${selectedSong.songId}`));
    }

    console.log(chalk.green("未匹配歌曲人工匹配流程结束。"));
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
    const { startTui } = await import("../tui/app.js");
    await startTui(baseUrl, { ascii: Boolean(opts.ascii) });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red(`执行失败: ${error.message}`));
  process.exit(1);
});
