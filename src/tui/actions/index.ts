import type { LogPanel } from "../components/log-panel.js";
import type { StatusBar } from "../components/status-bar.js";
import type { CatWidget } from "../components/cat.js";
import type { ModalManager } from "../modals/modal-manager.js";
import type { SearchSong, DiffResult } from "../../core/types.js";
import { openQrImageWithSystemDefault } from "../../infra/qr-display.js";
import { MENU_ITEMS } from "../components/sidebar.js";
import { createSongList, createDiffList } from "../components/table.js";
import { BoxRenderable, type CliRenderer } from "@opentui/core";

type App = ReturnType<typeof import("../../bootstrap.js").createApp>;

export interface ActionHandlers {
  runAction: (index: number) => Promise<void>;
}

export function createActionHandlers(
  app: App,
  renderer: CliRenderer,
  logPanel: LogPanel,
  modalManager: ModalManager,
  statusBar: StatusBar,
  catWidget: CatWidget
): ActionHandlers {
  let actionRunning = false;

  const runAction = async (index: number): Promise<void> => {
    if (actionRunning) {
      logPanel.append("任务正在执行，请稍候...", "warning");
      return;
    }
    actionRunning = true;
    const menuItem = MENU_ITEMS[index];
    if (menuItem) statusBar.setLoading(menuItem.name);
    catWidget.setMood("curious");

    try {
      await executeAction(index);
      catWidget.setMood("happy");
    } catch (error) {
      logPanel.append(`执行失败: ${(error as Error).message}`, "error");
      catWidget.setMood("grumpy");
    } finally {
      actionRunning = false;
      statusBar.clearLoading();
      // 3秒后恢复空闲状态
      setTimeout(() => catWidget.setMood("idle"), 3000);
    }
  };

  const executeAction = async (index: number): Promise<void> => {
    if (index === 0) await handleLogin();
    else if (index === 1) await handleCheckStatus();
    else if (index === 2) await handleSetScanDir();
    else if (index === 3) await handleScanMusic();
    else if (index === 4) await handleRefreshCache();
    else if (index === 5) await handleListCloud();
    else if (index === 6) await handleDiff();
    else if (index === 7) await handleSyncCloud();
    else if (index === 8) await handleDeleteLocal();
    else if (index === 9) await handleDownload();
    else if (index === 10) await handleQualityUpdate();
    else if (index === 11) await handleMatchSongs();
  };

  const handleLogin = async () => {
    const method = await modalManager.askChoice("选择登录方式", [
      { label: "📱 手机号登录", value: "phone" },
      { label: "📧 邮箱登录", value: "email" },
      { label: "📷 二维码登录", value: "qr" },
    ]);
    if (!method) { logPanel.append("已取消", "info"); return; }

    if (method === "phone") {
      const phone = await modalManager.askInput("手机号:");
      if (phone === undefined) { logPanel.append("已取消", "info"); return; }
      const pwd = await modalManager.askInput("密码:");
      if (pwd === undefined) { logPanel.append("已取消", "info"); return; }
      statusBar.setLoading("正在登录...");
      await app.authService.loginByPhone(phone, pwd);
      logPanel.append("手机号登录成功", "success");
    } else if (method === "email") {
      const email = await modalManager.askInput("邮箱:");
      if (email === undefined) { logPanel.append("已取消", "info"); return; }
      const pwd = await modalManager.askInput("密码:");
      if (pwd === undefined) { logPanel.append("已取消", "info"); return; }
      statusBar.setLoading("正在登录...");
      await app.authService.loginByEmail(email, pwd);
      logPanel.append("邮箱登录成功", "success");
    } else {
      statusBar.setLoading("生成二维码...");
      const qr = await app.authService.createQr();
      logPanel.append("请使用二维码扫码登录", "info");
      
      // 尝试渲染二维码文本
      let qrDisplayText: string | undefined;
      try {
        const { renderUtf8 } = await import("@vincentkoc/qrcode-tui");
        qrDisplayText = await renderUtf8(qr.qrurl);
      } catch (err) {
        logPanel.append("二维码渲染失败", "error");
      }
      
      if (qrDisplayText) {
        // 显示二维码弹窗
        const action = await modalManager.showQrCode(qrDisplayText);
        if (action === "open") {
          const opened = openQrImageWithSystemDefault(qr.qrimg);
          logPanel.append(opened ? "已打开二维码图片" : "打开二维码图片失败", opened ? "success" : "error");
        }
      } else {
        // 降级：显示选项
        const action = await modalManager.askChoice("二维码选项", [
          { label: "使用系统图片查看器打开", value: "open" },
          { label: "继续等待扫码", value: "wait" },
          { label: "取消本次登录", value: "cancel" },
        ]);
        if (action === "cancel" || action === undefined) { logPanel.append("已取消", "info"); return; }
        if (action === "open") {
          const opened = openQrImageWithSystemDefault(qr.qrimg);
          logPanel.append(opened ? "已打开二维码图片" : "打开二维码图片失败", opened ? "success" : "error");
        }
      }
      
      statusBar.setLoading("等待扫码...");
      logPanel.append("等待扫码登录...", "info");
      const ok = await app.authService.waitQrLogin(qr.key);
      logPanel.append(ok ? "二维码登录成功" : "二维码登录超时", ok ? "success" : "error");
    }
  };

  const handleCheckStatus = async () => {
    statusBar.setLoading("检查登录状态...");
    const ok = await app.authService.ensureLogin();
    logPanel.append(ok ? "登录状态有效" : "未登录或会话失效，请先登录", ok ? "success" : "warning");
  };

  const handleSetScanDir = async () => {
    const folder = await modalManager.askInput("本地扫描目录路径：", {
      initialValue: app.sessionStore.getLocalScanPath() || "",
    });
    if (folder === undefined) { logPanel.append("已取消", "info"); }
    else if (!folder) { logPanel.append("空路径已忽略", "warning"); }
    else {
      app.sessionStore.setLocalScanPath(folder);
      logPanel.append(`已保存扫描目录: ${folder}`, "success");
    }
  };

  const handleScanMusic = async () => {
    let scanPath = app.sessionStore.getLocalScanPath();
    if (!scanPath) {
      const entered = await modalManager.askInput("本地扫描目录路径：", { initialValue: process.cwd() });
      if (entered === undefined) { logPanel.append("已取消", "info"); return; }
      if (!entered) { logPanel.append("空路径已忽略", "warning"); return; }
      scanPath = entered;
    }
    app.sessionStore.setLocalScanPath(scanPath);
    statusBar.setLoading("扫描本地音乐...");
    logPanel.append("开始扫描本地音乐...", "info");
    let lastUiUpdate = 0;
    const songs = await app.localScanner.scan(scanPath, (p: any) => {
      const now = Date.now();
      if (now - lastUiUpdate < 300 && p.current !== p.total) return;
      lastUiUpdate = now;
      statusBar.setLoading(`扫描中 ${p.current}/${p.total}`);
      logPanel.append(`扫描进度 ${p.current}/${p.total}，成功 ${p.scanned}，跳过 ${p.skipped}`);
    });
    logPanel.append(`扫描完成: ${songs.length} 首`, "success");
  };

  const handleRefreshCache = async () => {
    statusBar.setLoading("刷新云盘缓存...");
    const songs = await app.cloudService.getCloudSongs(true);
    logPanel.append(`缓存已刷新，云盘歌曲: ${songs.length}`, "success");
  };

  const handleListCloud = async () => {
    statusBar.setLoading("加载云盘列表...");
    const songs = await app.cloudService.getCloudSongs(false);
    logPanel.append(`云盘歌曲总数: ${songs.length}`, "info");

    if (songs.length === 0) {
      logPanel.append("暂无云盘歌曲", "info");
      return;
    }

    // 使用表格显示歌曲列表
    const table = createSongList(renderer, songs.slice(0, 50), "云盘歌曲列表");
    await modalManager.showTable("云盘歌曲", table);
  };

  const handleDiff = async () => {
    statusBar.setLoading("比对差异...");
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);

    logPanel.append(
      `差异：本地独有 ${diff.localOnly.length}，云盘独有 ${diff.cloudOnly.length}，精准匹配 ${diff.matchedExact.length}，模糊匹配 ${diff.matchedFuzzy.length}`,
      "info"
    );

    // 显示本地独有
    if (diff.localOnly.length > 0) {
      const localTable = createDiffList(renderer, diff.localOnly.slice(0, 50), "local", "本地独有歌曲");
      await modalManager.showTable("本地独有", localTable);
    }

    // 显示云盘独有
    if (diff.cloudOnly.length > 0) {
      const cloudTable = createDiffList(renderer, diff.cloudOnly.slice(0, 50), "cloud", "云盘独有歌曲");
      await modalManager.showTable("云盘独有", cloudTable);
    }
  };

  const handleSyncCloud = async () => {
    statusBar.setLoading("计算差异...");
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    const ok = await modalManager.askYesNo(
      `确认删除云盘独有 ${diff.cloudOnly.length} 并上传本地独有 ${diff.localOnly.length} 吗？`
    );
    if (!ok) { logPanel.append("已取消", "info"); return; }
    statusBar.setLoading("同步云盘...");
    const summary = await app.diffSyncService.syncCloudSideWithReport(diff, (_phase: any, s: any, msg: any) => {
      if (msg) logPanel.append(msg);
      statusBar.setLoading(`同步中 ${s.success + s.failed}/${s.total}`);
      logPanel.append(`[${_phase}] ${s.success + s.failed}/${s.total}（成功 ${s.success}，失败 ${s.failed}）`);
    });
    logPanel.append(`云盘端同步完成：成功 ${summary.success}，失败 ${summary.failed}`, summary.failed > 0 ? "warning" : "success");
  };

  const handleDeleteLocal = async () => {
    statusBar.setLoading("计算差异...");
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    statusBar.setLoading("同步本地...");
    const result = await app.diffSyncService.syncLocalSide(diff, { deleteLocalOnly: true });
    logPanel.append(`已执行本地端同步，删除本地独有 ${result.deletedLocal}，云盘独有待处理 ${result.cloudOnlyPending}`, "success");
  };

  const handleDownload = async () => {
    statusBar.setLoading("计算差异...");
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    const downloadDir = await modalManager.askInput("下载目录：", {
      initialValue: app.sessionStore.getLocalScanPath() || process.cwd(),
    });
    if (downloadDir === undefined) { logPanel.append("已取消", "info"); return; }
    if (!downloadDir) { logPanel.append("空路径已忽略", "warning"); return; }
    statusBar.setLoading("下载歌曲...");
    const result = await app.diffSyncService.syncLocalSide(
      diff,
      { downloadCloudOnly: true, downloadDir },
      (_phase: any, summary: any, message: any) => {
        if (message) logPanel.append(message);
        statusBar.setLoading(`下载中 ${summary.success + summary.failed}/${summary.total}`);
        if (summary.failed > 0) {
          logPanel.append(`失败重试面板：失败 ${summary.failed} / ${summary.total}`, "error");
        }
      }
    );
    if (result.downloadSummary) {
      logPanel.append(`下载汇总：成功 ${result.downloadSummary.success}，失败 ${result.downloadSummary.failed}`, result.downloadSummary.failed > 0 ? "warning" : "success");
      for (const item of result.downloadSummary.failures.slice(0, 5)) {
        logPanel.append(`失败：${item.name}（${item.reason}）`, "error");
      }
    }
  };

  const handleQualityUpdate = async () => {
    statusBar.setLoading("计算差异...");
    const local = app.cacheRepo.getLocalSongs();
    const cloud = await app.cloudService.getCloudSongs(false);
    const diff = app.diffSyncService.buildDiff(local, cloud);
    const thresholdMb = 3;
    const candidates = app.diffSyncService.collectQualityUpdateCandidates(diff, thresholdMb);
    const ok = await modalManager.askYesNo(
      `确认对 ${candidates.length} 首可匹配歌曲执行音质更新（大小差异 > ${thresholdMb}MB）吗？`
    );
    if (!ok) { logPanel.append("已取消", "info"); return; }
    statusBar.setLoading("音质更新...");
    const summary = await app.diffSyncService.syncQualityUpdateWithReport(diff, thresholdMb, (_phase: any, _s: any, msg: any) => {
      if (msg) logPanel.append(msg);
    });
    logPanel.append(`音质更新完成：成功 ${summary.success}，失败 ${summary.failed}`, summary.failed > 0 ? "warning" : "success");
  };

  const handleMatchSongs = async () => {
    statusBar.setLoading("加载未匹配歌曲...");
    const unmatched = await app.cloudService.getUnmatchedCloudSongs(false);
    if (!unmatched.length) {
      logPanel.append("当前没有未匹配云盘歌曲", "info");
      return;
    }
    logPanel.append(`发现未匹配云盘歌曲 ${unmatched.length} 首`, "info");

    // 使用表格显示未匹配歌曲
    const table = createDiffList(renderer, unmatched.slice(0, 50), "cloud", "未匹配云盘歌曲");
    await modalManager.showTable("未匹配歌曲", table);

    const start = await modalManager.askYesNo("现在开始逐首人工匹配吗？");
    if (!start) { logPanel.append("已取消", "info"); return; }

    const searchLimit = 10;
    for (const [i, target] of unmatched.entries()) {
      const defaultKeywords = `${target.simpleSongName} ${target.artist}`.trim();
      logPanel.append(`[${i + 1}/${unmatched.length}] CloudID=${target.cloudId} ${target.simpleSongName} - ${target.artist}`);
      const inputKeywords = await modalManager.askInput("搜索关键词（可编辑）：", { initialValue: defaultKeywords });
      if (inputKeywords === undefined) { logPanel.append("已取消当前歌曲匹配", "info"); continue; }
      const query = (inputKeywords || defaultKeywords).trim();
      if (!query) { logPanel.append("关键词为空，已跳过", "warning"); continue; }
      statusBar.setLoading(`搜索: ${query}`);
      logPanel.append(`搜索：${query}`);
      const results = await app.cloudService.searchCloudSongs(query, searchLimit);
      if (!results.length) { logPanel.append("搜索无结果，已跳过", "warning"); continue; }

      // 直接让用户选择，不需要先显示表格
      const choose = await modalManager.askChoice(`选择匹配结果 (${results.length}条)`, [
        ...results.map((row: any) => ({
          label: `${row.name} - ${row.artist} (#${row.songId})`,
          value: `pick:${row.songId}` as const,
        })),
        { label: "手动输入 SongID 匹配", value: "manual" as const },
        { label: "跳过这首", value: "skip" as const },
        { label: "结束匹配", value: "stop" as const },
      ]);
      if (!choose || choose === "skip") continue;
      if (choose === "stop") break;

      let selectedSong: SearchSong | undefined;
      if (choose === "manual") {
        const manualIdStr = await modalManager.askInput("请输入目标 SongID：");
        if (!manualIdStr) { logPanel.append("未输入 ID，已跳过", "warning"); continue; }
        const manualId = Number(manualIdStr.trim());
        if (!Number.isFinite(manualId) || manualId <= 0) { logPanel.append("无效的 SongID，已跳过", "error"); continue; }
        statusBar.setLoading(`获取歌曲 ${manualId}...`);
        logPanel.append(`获取目标歌曲：${manualId}`);
        selectedSong = (await app.cloudService.getSongDetail(manualId)) || undefined;
        if (!selectedSong) { logPanel.append("未找到目标歌曲，已跳过", "error"); continue; }
        logPanel.append(`找到歌曲：${selectedSong.name} - ${selectedSong.artist}`, "success");
      } else {
        const pickedSongId = Number(choose.replace("pick:", ""));
        if (!Number.isFinite(pickedSongId) || pickedSongId <= 0) { logPanel.append("选择无效，已跳过", "error"); continue; }
        selectedSong = results.find((row: any) => row.songId === pickedSongId);
        if (!selectedSong) { logPanel.append("未找到所选歌曲信息，已跳过", "error"); continue; }
      }

      if (!target.songId || target.songId <= 0) {
        logPanel.append(`已跳过：CloudID=${target.cloudId} 缺少云盘歌曲 sid`, "warning");
        continue;
      }
      statusBar.setLoading("获取对比信息...");
      const durationDiffMs = Math.abs((target.durationMs || 0) - (selectedSong.durationMs || 0));
      const remoteSize = await app.cloudService.getSongRemoteFileSize(selectedSong.songId);
      const sizeDiffBytes = remoteSize ? Math.abs(target.fileSize - remoteSize) : undefined;
      await modalManager.showViewer(
        "匹配前对比",
        `时长: ${Math.round(target.durationMs / 1000)}s vs ${Math.round(selectedSong.durationMs / 1000)}s (差异: ${(durationDiffMs / 1000).toFixed(1)}s)\n` +
        `大小: ${(target.fileSize / 1024 / 1024).toFixed(2)}MB vs ${remoteSize ? (remoteSize / 1024 / 1024).toFixed(2) : '未知'}MB`
      );
      const shouldMatch = await modalManager.askYesNo("确认按此候选提交匹配吗？");
      if (!shouldMatch) { logPanel.append("你取消了本次匹配", "info"); continue; }
      statusBar.setLoading("提交匹配...");
      await app.cloudService.matchSong(target.songId, selectedSong.songId);
      logPanel.append(`匹配成功：sid=${target.songId} (CloudID=${target.cloudId}) -> SongID=${selectedSong.songId}`, "success");
    }
    logPanel.append("人工匹配流程结束", "success");
  };

  return { runAction };
}
