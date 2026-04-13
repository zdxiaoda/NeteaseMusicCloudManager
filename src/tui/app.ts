import blessed from "blessed";
import { createApp } from "../bootstrap.js";

export async function startTui(baseUrl: string): Promise<void> {
  const app = createApp(baseUrl);
  const screen = blessed.screen({
    smartCSR: true,
    title: "NCM Cloud Manager"
  });

  const title = blessed.box({
    top: 0,
    left: "center",
    width: "100%",
    height: 3,
    content: " 网易云音乐云盘管理器 ",
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
    items: [
      "1. 检查登录状态",
      "2. 刷新云盘缓存",
      "3. 查看云盘歌曲数",
      "4. 扫描本地音乐库",
      "5. 比对本地/云盘差异",
      "6. 同步云盘端",
      "7. 同步本地端（删除本地独有）",
      "q. 退出"
    ]
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
    label: "输出"
  });

  const runAction = async (index: number): Promise<void> => {
    try {
      if (index === 0) {
        const ok = await app.authService.ensureLogin();
        output.log(ok ? "登录状态有效" : "未登录或会话失效，请先通过命令行 login 登录");
      } else if (index === 1) {
        const songs = await app.cloudService.getCloudSongs(true);
        output.log(`缓存已刷新，云盘歌曲: ${songs.length}`);
      } else if (index === 2) {
        const songs = await app.cloudService.getCloudSongs(false);
        output.log(`当前云盘缓存歌曲数: ${songs.length}`);
      } else if (index === 3) {
        const scanPath = app.sessionStore.getLocalScanPath();
        if (!scanPath) {
          output.log("未设置本地扫描目录，请先通过 scan 命令指定");
        } else {
          const songs = await app.localScanner.scan(scanPath);
          output.log(`扫描完成: ${songs.length} 首`);
        }
      } else if (index === 4) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        output.log(
          `差异：本地独有 ${diff.localOnly.length}，云盘独有 ${diff.cloudOnly.length}，精准匹配 ${diff.matchedExact.length}，模糊匹配 ${diff.matchedFuzzy.length}`
        );
      } else if (index === 5) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        await app.diffSyncService.syncCloudSide(diff);
        output.log("已执行云盘端同步（删除云盘独有 + 上传本地独有）");
      } else if (index === 6) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        const result = app.diffSyncService.syncLocalSide(diff, true);
        output.log(`已执行本地端同步，删除本地独有 ${result.deletedLocal}，云盘独有待处理 ${result.cloudOnlyPending}`);
      }
    } catch (error) {
      output.log(`执行失败: ${(error as Error).message}`);
    }
    screen.render();
  };

  menu.on("select", async (_item, idx) => {
    if (idx === 7) {
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
