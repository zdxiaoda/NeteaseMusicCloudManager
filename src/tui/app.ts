import blessed from "blessed";
import { createApp } from "../bootstrap.js";

interface TuiOptions {
  ascii?: boolean;
}

export async function startTui(baseUrl: string, options: TuiOptions = {}): Promise<void> {
  const app = createApp(baseUrl);
  const preferAscii = Boolean(options.ascii || process.env.NCM_TUI_ASCII === "1");
  const menuItems = preferAscii
    ? [
        "1. Login (phone/email/qr)",
        "2. Check login status",
        "3. Set local scan folder",
        "4. Scan local music library",
        "5. Refresh cloud cache",
        "6. Show cloud songs (top 30)",
        "7. Diff local/cloud songs",
        "8. Sync cloud side",
        "9. Sync local side (delete local-only)",
        "10. Sync local side (download cloud-only)",
        "q. Quit"
      ]
    : [
        "1. 登录（手机号/邮箱/二维码）",
        "2. 检查登录状态",
        "3. 设置本地扫描目录",
        "4. 扫描本地音乐库",
        "5. 刷新云盘缓存",
        "6. 查看云盘歌曲（前30）",
        "7. 比对本地/云盘差异",
        "8. 同步云盘端",
        "9. 同步本地端（删除本地独有）",
        "10. 同步本地端（下载云盘独有）",
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
    height: "100%-6",
    border: "line",
    keys: true,
    mouse: true,
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
    height: "100%-6",
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    tags: false,
    label: preferAscii ? "Output" : "输出"
  });

  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    border: "line",
    inputOnFocus: true,
    keys: true,
    mouse: true,
    label: preferAscii ? "Input (path/arg), press Enter to save" : "输入区（路径/参数），输入后回车保存",
    value: app.sessionStore.getLocalScanPath() || ""
  });

  const prompt = blessed.prompt({
    parent: screen,
    border: "line",
    height: 9,
    width: "70%",
    top: "center",
    left: "center",
    label: preferAscii ? "Input" : "输入",
    keys: true,
    vi: true
  });

  const question = blessed.question({
    parent: screen,
    border: "line",
    height: 9,
    width: "70%",
    top: "center",
    left: "center",
    label: preferAscii ? "Confirm" : "确认",
    keys: true,
    vi: true
  });

  const askInput = (label: string): Promise<string> =>
    new Promise((resolve) => {
      prompt.input(label, "", (_err, value) => resolve((value || "").trim()));
    });

  const askYesNo = (label: string): Promise<boolean> =>
    new Promise((resolve) => {
      question.ask(label, (ok) => resolve(Boolean(ok)));
    });

  const getInputValue = (): string => {
    const v = (inputBox.getValue() || "").trim();
    return v;
  };
  let actionRunning = false;

  const exitTui = (): void => {
    screen.destroy();
    process.exit(0);
  };

  const runAction = async (index: number): Promise<void> => {
    if (actionRunning) {
      output.log(preferAscii ? "Task is running, please wait..." : "任务正在执行，请稍候...");
      screen.render();
      return;
    }
    actionRunning = true;
    menu.setLabel(preferAscii ? "Menu (running)" : "菜单（执行中）");
    screen.render();
    try {
      if (index === 0) {
        const method = await askInput(
          preferAscii ? "Input login method: phone/email/qr" : "输入登录方式: phone/email/qr"
        );
        if (method === "phone") {
          const phone = await askInput(preferAscii ? "Phone:" : "手机号:");
          const pwd = await askInput(preferAscii ? "Password:" : "密码:");
          await app.authService.loginByPhone(phone, pwd);
          output.log(preferAscii ? "Phone login success" : "手机号登录成功");
        } else if (method === "email") {
          const email = await askInput(preferAscii ? "Email:" : "邮箱:");
          const pwd = await askInput(preferAscii ? "Password:" : "密码:");
          await app.authService.loginByEmail(email, pwd);
          output.log(preferAscii ? "Email login success" : "邮箱登录成功");
        } else {
          const qr = await app.authService.createQr();
          output.log(preferAscii ? "Open this QR data url in browser:" : "请用浏览器打开以下二维码 data url：");
          output.log(qr.qrimg);
          output.log(preferAscii ? "Waiting for QR login..." : "等待扫码登录...");
          const ok = await app.authService.waitQrLogin(qr.key);
          output.log(ok ? (preferAscii ? "QR login success" : "二维码登录成功") : preferAscii ? "QR login timeout" : "二维码登录超时");
        }
      } else if (index === 1) {
        const ok = await app.authService.ensureLogin();
        output.log(ok ? (preferAscii ? "Login is valid" : "登录状态有效") : preferAscii ? "Session expired, use menu 1 to login" : "未登录或会话失效，请先使用菜单 1 登录");
      } else if (index === 2) {
        let folder = getInputValue();
        if (!folder) {
          folder = await askInput(preferAscii ? "Local scan folder path:" : "本地扫描目录路径：");
        }
        if (!folder) {
          output.log(preferAscii ? "Empty path ignored" : "空路径已忽略");
        } else {
          app.sessionStore.setLocalScanPath(folder);
          inputBox.setValue(folder);
          output.log(preferAscii ? `Saved scan path: ${folder}` : `已保存扫描目录: ${folder}`);
        }
      } else if (index === 3) {
        const scanPath = getInputValue() || app.sessionStore.getLocalScanPath();
        if (!scanPath) {
          output.log(preferAscii ? "Set scan path first (menu 3)" : "请先设置扫描目录（菜单 3）");
        } else {
          app.sessionStore.setLocalScanPath(scanPath);
          output.log(preferAscii ? "Scan started..." : "开始扫描本地音乐...");
          let lastUiUpdate = 0;
          const songs = await app.localScanner.scan(scanPath, (p) => {
            const now = Date.now();
            if (now - lastUiUpdate < 300 && p.current !== p.total) return;
            lastUiUpdate = now;
            const message = preferAscii
              ? `Scanning ${p.current}/${p.total}, ok ${p.scanned}, skipped ${p.skipped}`
              : `扫描进度 ${p.current}/${p.total}，成功 ${p.scanned}，跳过 ${p.skipped}`;
            output.log(message);
            screen.render();
          });
          output.log(preferAscii ? `Scan done: ${songs.length}` : `扫描完成: ${songs.length} 首`);
        }
      } else if (index === 4) {
        const songs = await app.cloudService.getCloudSongs(true);
        output.log(preferAscii ? `Cache refreshed, cloud songs: ${songs.length}` : `缓存已刷新，云盘歌曲: ${songs.length}`);
      } else if (index === 5) {
        const songs = await app.cloudService.getCloudSongs(false);
        output.log(preferAscii ? `Cached cloud songs: ${songs.length}` : `当前云盘缓存歌曲数: ${songs.length}`);
        for (const song of songs.slice(0, 30)) {
          output.log(`${song.cloudId} | ${song.simpleSongName} | ${song.artist}`);
        }
      } else if (index === 6) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        output.log(
          preferAscii
            ? `Diff: local-only ${diff.localOnly.length}, cloud-only ${diff.cloudOnly.length}, exact ${diff.matchedExact.length}, fuzzy ${diff.matchedFuzzy.length}`
            : `差异：本地独有 ${diff.localOnly.length}，云盘独有 ${diff.cloudOnly.length}，精准匹配 ${diff.matchedExact.length}，模糊匹配 ${diff.matchedFuzzy.length}`
        );
      } else if (index === 7) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        const ok = await askYesNo(
          preferAscii
            ? `Delete cloud-only ${diff.cloudOnly.length} and upload local-only ${diff.localOnly.length}?`
            : `确认删除云盘独有 ${diff.cloudOnly.length} 并上传本地独有 ${diff.localOnly.length} 吗？`
        );
        if (!ok) {
          output.log(preferAscii ? "Cancelled" : "已取消");
        } else {
          const summary = await app.diffSyncService.syncCloudSideWithReport(diff, (phase, s, msg) => {
            if (msg) output.log(msg);
            const phaseLabel = preferAscii ? phase : `阶段 ${phase}`;
            output.log(
              preferAscii
                ? `[${phaseLabel}] ${s.success + s.failed}/${s.total} (ok ${s.success}, fail ${s.failed})`
                : `[${phaseLabel}] ${s.success + s.failed}/${s.total}（成功 ${s.success}，失败 ${s.failed}）`
            );
            screen.render();
          });
          output.log(
            preferAscii
              ? `Cloud sync done: success ${summary.success}, failed ${summary.failed}`
              : `云盘端同步完成：成功 ${summary.success}，失败 ${summary.failed}`
          );
        }
      } else if (index === 8) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        const result = await app.diffSyncService.syncLocalSide(diff, { deleteLocalOnly: true });
        output.log(
          preferAscii
            ? `Local-side sync done, deleted local-only ${result.deletedLocal}, cloud-only pending ${result.cloudOnlyPending}`
            : `已执行本地端同步，删除本地独有 ${result.deletedLocal}，云盘独有待处理 ${result.cloudOnlyPending}`
        );
      } else if (index === 9) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        const downloadDir = getInputValue() || app.sessionStore.getLocalScanPath() || process.cwd();
        const result = await app.diffSyncService.syncLocalSide(
          diff,
          { downloadCloudOnly: true, downloadDir },
          (_phase, summary, message) => {
            if (message) output.log(message);
            if (summary.failed > 0) {
              output.log(
                preferAscii
                  ? `Retry panel: failed ${summary.failed} / ${summary.total}`
                  : `失败重试面板：失败 ${summary.failed} / ${summary.total}`
              );
            }
          }
        );
        if (result.downloadSummary) {
          output.log(
            preferAscii
              ? `Download summary: success ${result.downloadSummary.success}, failed ${result.downloadSummary.failed}`
              : `下载汇总：成功 ${result.downloadSummary.success}，失败 ${result.downloadSummary.failed}`
          );
          for (const item of result.downloadSummary.failures.slice(0, 5)) {
            output.log(
              preferAscii
                ? `Fail: ${item.name} (${item.reason})`
                : `失败：${item.name}（${item.reason}）`
            );
          }
        }
      }
    } catch (error) {
      output.log(preferAscii ? `Failed: ${(error as Error).message}` : `执行失败: ${(error as Error).message}`);
    } finally {
      actionRunning = false;
      menu.setLabel(preferAscii ? "Menu" : "菜单");
      menu.focus();
      screen.render();
    }
  };

  menu.on("select", async (_item, idx) => {
    if (idx === 10) {
      screen.destroy();
      return;
    }
    await runAction(idx);
  });

  inputBox.on("submit", () => {
    const val = getInputValue();
    if (val) {
      app.sessionStore.setLocalScanPath(val);
      output.log(preferAscii ? `Input saved: ${val}` : `输入已保存: ${val}`);
    }
    menu.focus();
    screen.render();
  });

  screen.key(["tab"], () => {
    if (screen.focused === menu) {
      inputBox.focus();
    } else {
      menu.focus();
    }
    screen.render();
  });

  // Restore menu focus quickly when user clicks non-input regions.
  title.on("click", () => {
    menu.focus();
    screen.render();
  });
  output.on("click", () => {
    menu.focus();
    screen.render();
  });
  screen.key(["escape"], () => {
    menu.focus();
    screen.render();
  });

  screen.key(["q", "C-c"], () => {
    exitTui();
  });

  menu.key(["C-c"], () => exitTui());
  inputBox.key(["C-c"], () => exitTui());
  prompt.key(["C-c"], () => exitTui());
  question.key(["C-c"], () => exitTui());

  screen.append(title);
  screen.append(menu);
  screen.append(output);
  screen.append(inputBox);
  menu.focus();
  screen.render();
}
