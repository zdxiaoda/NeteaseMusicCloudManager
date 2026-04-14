import blessed from "blessed";
import { createApp } from "../bootstrap.js";
import { openQrImageWithSystemDefault, showLoginQr } from "../infra/qr-display.js";
import type { DiffResult } from "../core/types.js";

interface TuiOptions {
  ascii?: boolean;
}

function installConsoleBridge(
  output: blessed.Widgets.Log,
  screen: blessed.Widgets.Screen,
  preferAscii: boolean
): () => void {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };
  let forwarding = false;

  const stringifyArgs = (args: unknown[]): string =>
    args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

  const toOutput = (level: "log" | "info" | "warn" | "error" | "debug", args: unknown[]): void => {
    if (forwarding) return;
    forwarding = true;
    try {
      const text = stringifyArgs(args);
      if (!text.trim()) return;
      const prefix =
        level === "error"
          ? preferAscii
            ? "[ERR]"
            : "[错误]"
          : level === "warn"
            ? preferAscii
              ? "[WARN]"
              : "[警告]"
            : level === "debug"
              ? "[DEBUG]"
              : "";
      output.log(prefix ? `${prefix} ${text}` : text);
      screen.render();
    } finally {
      forwarding = false;
    }
  };

  console.log = (...args: unknown[]) => toOutput("log", args);
  console.info = (...args: unknown[]) => toOutput("info", args);
  console.warn = (...args: unknown[]) => toOutput("warn", args);
  console.error = (...args: unknown[]) => toOutput("error", args);
  console.debug = (...args: unknown[]) => toOutput("debug", args);

  const onUnhandledRejection = (reason: unknown): void => {
    toOutput("error", [preferAscii ? "Unhandled rejection:" : "未处理的 Promise 拒绝:", reason]);
  };
  const onUncaughtException = (error: Error): void => {
    toOutput("error", [preferAscii ? "Uncaught exception:" : "未捕获异常:", error]);
  };

  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);

  return () => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
  };
}

function formatLongLine(text: string, width = 96): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.length <= width) return line;
      const chunks: string[] = [];
      for (let i = 0; i < line.length; i += width) {
        chunks.push(line.slice(i, i + width));
      }
      return chunks.join("\n");
    })
    .join("\n");
}

function truncateCell(value: string, width: number): string {
  if (width <= 0) return "";
  if (value.length <= width) return value.padEnd(width, " ");
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}~`;
}

function formatTextTable(headers: string[], rows: string[][], widths: number[]): string {
  const sep = `+-${widths.map((width) => "-".repeat(width)).join("-+-")}-+`;
  const renderRow = (cols: string[]) =>
    `| ${cols.map((col, idx) => truncateCell(col, widths[idx] || 0)).join(" | ")} |`;
  return [sep, renderRow(headers), sep, ...rows.map(renderRow), sep].join("\n");
}

function buildDiffDetailReport(diff: DiffResult, preferAscii: boolean, limit = 100): string {
  const sections: string[] = [];
  const take = <T,>(arr: T[]) => arr.slice(0, limit);

  sections.push(
    preferAscii
      ? `Summary: local-only ${diff.localOnly.length}, cloud-only ${diff.cloudOnly.length}, exact ${diff.matchedExact.length}, fuzzy ${diff.matchedFuzzy.length}`
      : `汇总：本地独有 ${diff.localOnly.length}，云盘独有 ${diff.cloudOnly.length}，精准匹配 ${diff.matchedExact.length}，模糊匹配 ${diff.matchedFuzzy.length}`
  );

  const localOnlyRows = take(diff.localOnly).map((row) => [
    row.fileName,
    row.title,
    row.artist,
    Math.round(row.durationMs / 1000).toString()
  ]);
  sections.push(
    preferAscii ? "== Local Only ==" : "== 本地独有 ==",
    formatTextTable(
      preferAscii ? ["File", "Title", "Artist", "Sec"] : ["文件名", "标题", "歌手", "秒数"],
      localOnlyRows.length ? localOnlyRows : [[preferAscii ? "(empty)" : "（空）", "", "", ""]],
      [34, 24, 18, 6]
    )
  );

  const cloudOnlyRows = take(diff.cloudOnly).map((row) => [
    String(row.cloudId),
    row.fileName,
    row.simpleSongName,
    row.artist
  ]);
  sections.push(
    preferAscii ? "== Cloud Only ==" : "== 云盘独有 ==",
    formatTextTable(
      preferAscii ? ["CloudID", "File", "Song", "Artist"] : ["CloudID", "文件名", "歌曲名", "歌手"],
      cloudOnlyRows.length ? cloudOnlyRows : [[preferAscii ? "(empty)" : "（空）", "", "", ""]],
      [10, 28, 22, 16]
    )
  );

  const exactRows = take(diff.matchedExact).map((row) => [
    row.local.fileName,
    row.cloud.fileName,
    row.cloud.simpleSongName,
    row.cloud.artist
  ]);
  sections.push(
    preferAscii ? "== Exact Matches ==" : "== 精准匹配 ==",
    formatTextTable(
      preferAscii ? ["Local File", "Cloud File", "Song", "Artist"] : ["本地文件", "云盘文件", "歌曲名", "歌手"],
      exactRows.length ? exactRows : [[preferAscii ? "(empty)" : "（空）", "", "", ""]],
      [24, 24, 22, 16]
    )
  );

  const fuzzyRows = take(diff.matchedFuzzy).map((row) => [
    row.local.fileName,
    row.cloud.fileName,
    row.cloud.simpleSongName,
    row.score.toFixed(3)
  ]);
  sections.push(
    preferAscii ? "== Fuzzy Matches ==" : "== 模糊匹配 ==",
    formatTextTable(
      preferAscii ? ["Local File", "Cloud File", "Song", "Score"] : ["本地文件", "云盘文件", "歌曲名", "相似度"],
      fuzzyRows.length ? fuzzyRows : [[preferAscii ? "(empty)" : "（空）", "", "", ""]],
      [24, 24, 24, 8]
    )
  );

  if (
    diff.localOnly.length > limit ||
    diff.cloudOnly.length > limit ||
    diff.matchedExact.length > limit ||
    diff.matchedFuzzy.length > limit
  ) {
    sections.push(
      preferAscii
        ? `Only the first ${limit} rows of each section are shown.`
        : `每个分组仅展示前 ${limit} 条明细。`
    );
  }

  return sections.join("\n\n");
}

export async function startTui(baseUrl: string, options: TuiOptions = {}): Promise<void> {
  const app = createApp(baseUrl);
  const preferAscii = Boolean(options.ascii || process.env.NCM_TUI_ASCII === "1");
  const accentColor = preferAscii ? "blue" : "cyan";
  const focusedBorderColor = "yellow";
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
        "11. Sync quality update (>3MB)",
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
        "11. 音质更新（>3MB）",
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
    mouse: true,
    vi: true,
    style: {
      border: {
        fg: accentColor
      },
      focus: {
        border: {
          fg: focusedBorderColor
        }
      },
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
    label: preferAscii ? "Output (Tab focus, PgUp/PgDn scroll)" : "输出（Tab 聚焦，PgUp/PgDn 滚动）",
    style: {
      border: {
        fg: accentColor
      },
      focus: {
        border: {
          fg: focusedBorderColor
        }
      }
    },
    scrollbar: {
      ch: " "
    }
  });

  const modalBackdrop = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    hidden: true,
    mouse: true,
    style: {
      bg: "black",
      transparent: false
    }
  });

  const inputModal = blessed.box({
    parent: screen,
    border: "line",
    height: 13,
    width: "70%",
    top: "center",
    left: "center",
    label: preferAscii ? " Input " : " 输入 ",
    hidden: true,
    mouse: true,
    keys: true,
    style: {
      border: {
        fg: focusedBorderColor
      }
    }
  });

  const inputModalMessage = blessed.box({
    parent: inputModal,
    top: 1,
    left: 2,
    width: "100%-4",
    height: 2,
    tags: false
  });

  const inputModalField = blessed.textbox({
    parent: inputModal,
    top: 4,
    left: 2,
    width: "100%-4",
    height: 3,
    border: "line",
    inputOnFocus: true,
    mouse: true,
    keys: true,
    style: {
      border: {
        fg: accentColor
      },
      focus: {
        border: {
          fg: focusedBorderColor
        }
      }
    }
  });
  const inputModalFieldRuntime = inputModalField as blessed.Widgets.TextboxElement & {
    secret?: boolean;
    censor?: boolean;
  };

  const inputModalHint = blessed.box({
    parent: inputModal,
    bottom: 1,
    left: 2,
    width: "100%-4",
    height: 2,
    tags: false,
    content: preferAscii
      ? "Enter: submit   Esc: cancel   Click input box to focus"
      : "Enter: 提交   Esc: 取消   可用鼠标点击输入框聚焦"
  });

  const choiceModal = blessed.box({
    parent: screen,
    border: "line",
    height: 14,
    width: "70%",
    top: "center",
    left: "center",
    label: preferAscii ? " Select " : " 选择 ",
    hidden: true,
    mouse: true,
    keys: true,
    style: {
      border: {
        fg: focusedBorderColor
      }
    }
  });

  const choiceModalMessage = blessed.box({
    parent: choiceModal,
    top: 1,
    left: 2,
    width: "100%-4",
    height: 2,
    tags: false
  });

  const choiceModalList = blessed.list({
    parent: choiceModal,
    top: 4,
    left: 2,
    width: "100%-4",
    height: 5,
    border: "line",
    mouse: true,
    keys: true,
    vi: true,
    style: {
      border: {
        fg: accentColor
      },
      focus: {
        border: {
          fg: focusedBorderColor
        }
      },
      selected: {
        bg: "blue",
        fg: "white",
        bold: true
      },
      item: {
        hover: {
          bg: "blue"
        }
      }
    }
  });

  const choiceModalHint = blessed.box({
    parent: choiceModal,
    bottom: 1,
    left: 2,
    width: "100%-4",
    height: 2,
    tags: false,
    content: preferAscii
      ? "Arrow/Mouse: select   Enter: confirm   Esc: cancel"
      : "方向键/鼠标: 选择   Enter: 确认   Esc: 取消"
  });

  const viewerModal = blessed.box({
    parent: screen,
    border: "line",
    height: "80%",
    width: "80%",
    top: "center",
    left: "center",
    label: preferAscii ? " Viewer " : " 查看内容 ",
    hidden: true,
    mouse: true,
    keys: true,
    style: {
      border: {
        fg: focusedBorderColor
      }
    }
  });

  const viewerBody = blessed.box({
    parent: viewerModal,
    top: 1,
    left: 2,
    width: "100%-4",
    height: "100%-4",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    tags: false,
    scrollbar: {
      ch: " "
    },
    style: {
      border: {
        fg: accentColor
      },
      focus: {
        border: {
          fg: focusedBorderColor
        }
      }
    }
  });
  const viewerBodyRuntime = viewerBody as blessed.Widgets.BoxElement & {
    wrap?: boolean;
  };

  const viewerHint = blessed.box({
    parent: viewerModal,
    bottom: 0,
    left: 2,
    width: "100%-4",
    height: 1,
    tags: false,
    content: preferAscii
      ? "Esc/Enter close   Up/Down/PgUp/PgDn scroll"
      : "Esc/Enter 关闭   上下/PgUp/PgDn 滚动"
  });

  let modalActive = false;

  const withModal = async <T,>(fn: (restoreFocus: () => void) => Promise<T>): Promise<T> => {
    const prevFocused = screen.focused;
    modalActive = true;
    let restored = false;
    const restoreFocus = () => {
      if (restored) return;
      restored = true;
      modalActive = false;
      modalBackdrop.hide();
      inputModal.hide();
      choiceModal.hide();
      viewerModal.hide();
      if (prevFocused) prevFocused.focus();
      else menu.focus();
      screen.render();
    };
    try {
      return await fn(restoreFocus);
    } finally {
      restoreFocus();
    }
  };

  const askInput = (
    label: string,
    options: {
      initialValue?: string;
      censor?: boolean;
    } = {}
  ): Promise<string | undefined> =>
    withModal(
      (restoreFocus) =>
        new Promise((resolve) => {
          output.log(preferAscii ? `Waiting input: ${label}` : `等待输入：${label}`);
          inputModalMessage.setContent(label);
          inputModalField.setValue(options.initialValue || "");
          inputModalFieldRuntime.secret = false;
          inputModalFieldRuntime.censor = Boolean(options.censor);
          modalBackdrop.show();
          inputModal.show();
          modalBackdrop.setFront();
          inputModal.setFront();
          inputModalField.focus();
          screen.render();

          let settled = false;
          const finish = (value: string | undefined) => {
            if (settled) return;
            settled = true;
            inputModalField.removeListener("submit", onSubmit);
            inputModalField.removeListener("cancel", onCancel);
            inputModalField.removeListener("click", onFieldClick);
            inputModal.removeListener("click", onModalClick);
            modalBackdrop.removeListener("click", onBackdropClick);
            inputModalField.unkey("escape", onEscape);
            inputModal.unkey("escape", onEscape);
            inputModalFieldRuntime.secret = false;
            inputModalFieldRuntime.censor = false;
            restoreFocus();
            resolve(value === undefined ? undefined : value.trim());
          };
          const onSubmit = () => finish(inputModalField.getValue() || "");
          const onCancel = () => finish(undefined);
          const onEscape = () => {
            // 主动停止输入态，确保 Esc 一定生效
            (inputModalField as blessed.Widgets.TextboxElement & { done?: (err?: unknown, value?: string) => void }).done?.(
              null,
              ""
            );
            finish(undefined);
          };
          const onFieldClick = () => {
            inputModalField.focus();
            screen.render();
          };
          const onModalClick = () => {
            inputModalField.focus();
            screen.render();
          };
          const onBackdropClick = () => onEscape();

          inputModalField.on("submit", onSubmit);
          inputModalField.on("cancel", onCancel);
          inputModalField.on("click", onFieldClick);
          inputModal.on("click", onModalClick);
          modalBackdrop.on("click", onBackdropClick);
          inputModalField.key("escape", onEscape);
          inputModal.key("escape", onEscape);
          inputModalField.readInput();
        })
    );

  const showViewer = (
    label: string,
    content: string,
    options: {
      preserveFormatting?: boolean;
    } = {}
  ): Promise<void> =>
    withModal(
      (restoreFocus) =>
        new Promise((resolve) => {
          viewerModal.setLabel(` ${label} `);
          viewerBodyRuntime.wrap = !options.preserveFormatting;
          viewerBody.setContent(options.preserveFormatting ? content : formatLongLine(content));
          viewerBody.setScroll(0);
          modalBackdrop.show();
          viewerModal.show();
          modalBackdrop.setFront();
          viewerModal.setFront();
          viewerBody.focus();
          screen.render();

          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            viewerBody.unkey("escape", onClose);
            viewerBody.unkey("enter", onClose);
            viewerModal.unkey("escape", onClose);
            viewerModal.unkey("enter", onClose);
            viewerBody.removeListener("click", onFocusViewer);
            viewerModal.removeListener("click", onFocusViewer);
            modalBackdrop.removeListener("click", onClose);
            viewerBodyRuntime.wrap = true;
            restoreFocus();
            resolve();
          };
          const onClose = () => finish();
          const onFocusViewer = () => {
            viewerBody.focus();
            screen.render();
          };

          viewerBody.key(["escape", "enter"], onClose);
          viewerModal.key(["escape", "enter"], onClose);
          viewerBody.on("click", onFocusViewer);
          viewerModal.on("click", onFocusViewer);
          modalBackdrop.on("click", onClose);
        })
    );

  const askChoice = <T extends string>(label: string, choices: Array<{ label: string; value: T }>): Promise<T | undefined> =>
    withModal(
      (restoreFocus) =>
        new Promise((resolve) => {
          output.log(preferAscii ? `Waiting selection: ${label}` : `等待选择：${label}`);
          choiceModalMessage.setContent(label);
          choiceModalList.setItems(choices.map((item) => item.label));
          choiceModalList.select(0);
          modalBackdrop.show();
          choiceModal.show();
          modalBackdrop.setFront();
          choiceModal.setFront();
          choiceModalList.focus();
          screen.render();

          let settled = false;
          const finish = (value: T | undefined) => {
            if (settled) return;
            settled = true;
            choiceModalList.removeListener("select", onSelect);
            choiceModalList.removeListener("cancel", onCancel);
            choiceModalList.unkey("escape", onEscape);
            restoreFocus();
            resolve(value);
          };
          const onSelect = (_item: blessed.Widgets.BlessedElement, idx: number) => finish(choices[idx]?.value);
          const onCancel = () => finish(undefined);
          const onEscape = () => finish(undefined);

          choiceModalList.once("select", onSelect);
          choiceModalList.once("cancel", onCancel);
          choiceModalList.key("escape", onEscape);
        })
    );

  const askYesNo = (label: string): Promise<boolean> =>
    askChoice(label, [
      { label: preferAscii ? "Yes" : "是", value: "yes" },
      { label: preferAscii ? "No" : "否", value: "no" }
    ]).then((value) => value === "yes");
  let actionRunning = false;
  const restoreConsole = installConsoleBridge(output, screen, preferAscii);

  const exitTui = (): void => {
    restoreConsole();
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
        const method = await askChoice(preferAscii ? "Select login method" : "选择登录方式", [
          { label: preferAscii ? "Phone login" : "手机号登录", value: "phone" },
          { label: preferAscii ? "Email login" : "邮箱登录", value: "email" },
          { label: preferAscii ? "QR login" : "二维码登录", value: "qr" }
        ]);
        if (!method) {
          output.log(preferAscii ? "Cancelled" : "已取消");
          return;
        }
        if (method === "phone") {
          const phone = await askInput(preferAscii ? "Phone:" : "手机号:");
          if (phone === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          const pwd = await askInput(preferAscii ? "Password:" : "密码:", { censor: true });
          if (pwd === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          await app.authService.loginByPhone(phone, pwd);
          output.log(preferAscii ? "Phone login success" : "手机号登录成功");
        } else if (method === "email") {
          const email = await askInput(preferAscii ? "Email:" : "邮箱:");
          if (email === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          const pwd = await askInput(preferAscii ? "Password:" : "密码:", { censor: true });
          if (pwd === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          await app.authService.loginByEmail(email, pwd);
          output.log(preferAscii ? "Email login success" : "邮箱登录成功");
        } else {
          const qr = await app.authService.createQr();
          output.log(preferAscii ? "Please scan the QR code to login." : "请使用二维码扫码登录。");
          const mode = showLoginQr(qr.qrimg, { allowSixel: false });
          if (mode === "external") {
            output.log(preferAscii ? "Opened QR image with system app." : "已使用系统默认应用打开二维码图片。");
          } else {
            output.log(preferAscii ? "Unable to auto-open QR image, fallback available." : "自动打开二维码失败，可使用弹窗查看 data URL。");
          }
          const qrFallbackAction = await askChoice(
            preferAscii ? "QR options" : "二维码选项",
            [
              { label: preferAscii ? "Continue waiting" : "继续等待扫码", value: "wait" },
              { label: preferAscii ? "Open image again" : "重新打开二维码图片", value: "open" },
              { label: preferAscii ? "View data URL" : "查看二维码 data URL", value: "data" },
              { label: preferAscii ? "Cancel login" : "取消本次登录", value: "cancel" }
            ]
          );
          if (qrFallbackAction === "cancel" || qrFallbackAction === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          if (qrFallbackAction === "open") {
            const opened = openQrImageWithSystemDefault(qr.qrimg);
            output.log(
              opened
                ? preferAscii
                  ? "Opened QR image with system app."
                  : "已使用系统默认应用打开二维码图片。"
                : preferAscii
                  ? "Open QR image failed."
                  : "打开二维码图片失败。"
            );
          } else if (qrFallbackAction === "data" || mode === "data") {
            await showViewer(preferAscii ? "QR data URL" : "二维码 data URL", qr.qrimg);
          }
          output.log(preferAscii ? "Waiting for QR login..." : "等待扫码登录...");
          const ok = await app.authService.waitQrLogin(qr.key);
          output.log(ok ? (preferAscii ? "QR login success" : "二维码登录成功") : preferAscii ? "QR login timeout" : "二维码登录超时");
        }
      } else if (index === 1) {
        const ok = await app.authService.ensureLogin();
        output.log(ok ? (preferAscii ? "Login is valid" : "登录状态有效") : preferAscii ? "Session expired, use menu 1 to login" : "未登录或会话失效，请先使用菜单 1 登录");
      } else if (index === 2) {
        const folder = await askInput(preferAscii ? "Local scan folder path:" : "本地扫描目录路径：", {
          initialValue: app.sessionStore.getLocalScanPath() || ""
        });
        if (folder === undefined) {
          output.log(preferAscii ? "Cancelled" : "已取消");
        } else if (!folder) {
          output.log(preferAscii ? "Empty path ignored" : "空路径已忽略");
        } else {
          app.sessionStore.setLocalScanPath(folder);
          output.log(preferAscii ? `Saved scan path: ${folder}` : `已保存扫描目录: ${folder}`);
        }
      } else if (index === 3) {
        let scanPath = app.sessionStore.getLocalScanPath();
        if (!scanPath) {
          const entered = await askInput(preferAscii ? "Local scan folder path:" : "本地扫描目录路径：", {
            initialValue: process.cwd()
          });
          if (entered === undefined) {
            output.log(preferAscii ? "Cancelled" : "已取消");
            return;
          }
          if (!entered) {
            output.log(preferAscii ? "Empty path ignored" : "空路径已忽略");
            return;
          }
          scanPath = entered;
        }
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
        await showViewer(preferAscii ? "Diff details" : "差异详情", buildDiffDetailReport(diff, preferAscii), {
          preserveFormatting: true
        });
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
        const downloadDir = await askInput(preferAscii ? "Download directory:" : "下载目录：", {
          initialValue: app.sessionStore.getLocalScanPath() || process.cwd()
        });
        if (downloadDir === undefined) {
          output.log(preferAscii ? "Cancelled" : "已取消");
          return;
        }
        if (!downloadDir) {
          output.log(preferAscii ? "Empty path ignored" : "空路径已忽略");
          return;
        }
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
      } else if (index === 10) {
        const local = app.cacheRepo.getLocalSongs();
        const cloud = await app.cloudService.getCloudSongs(false);
        const diff = app.diffSyncService.buildDiff(local, cloud);
        const thresholdMb = 3;
        const candidates = app.diffSyncService.collectQualityUpdateCandidates(diff, thresholdMb);
        const ok = await askYesNo(
          preferAscii
            ? `Update quality for ${candidates.length} matched songs with size diff > ${thresholdMb}MB?`
            : `确认对 ${candidates.length} 首可匹配歌曲执行音质更新（大小差异 > ${thresholdMb}MB）吗？`
        );
        if (!ok) {
          output.log(preferAscii ? "Cancelled" : "已取消");
        } else {
          const summary = await app.diffSyncService.syncQualityUpdateWithReport(diff, thresholdMb, (_phase, _s, msg) => {
            if (msg) output.log(msg);
            screen.render();
          });
          output.log(
            preferAscii
              ? `Quality update done: success ${summary.success}, failed ${summary.failed}`
              : `音质更新完成：成功 ${summary.success}，失败 ${summary.failed}`
          );
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
    if (idx === 11) {
      restoreConsole();
      screen.destroy();
      return;
    }
    await runAction(idx);
  });

  screen.key(["tab"], () => {
    if (modalActive) return;
    if (screen.focused === menu) {
      output.focus();
    } else {
      menu.focus();
    }
    screen.render();
  });

  // Restore menu focus quickly when user clicks non-input regions.
  title.on("click", () => {
    if (modalActive) return;
    screen.render();
  });
  output.on("click", () => {
    if (modalActive) return;
    output.focus();
    screen.render();
  });
  output.key(["up", "k"], () => {
    output.scroll(-1);
    screen.render();
  });
  output.key(["down", "j"], () => {
    output.scroll(1);
    screen.render();
  });
  output.key(["pageup"], () => {
    output.scroll(-10);
    screen.render();
  });
  output.key(["pagedown"], () => {
    output.scroll(10);
    screen.render();
  });
  output.key(["home"], () => {
    output.setScroll(0);
    screen.render();
  });
  output.key(["end"], () => {
    output.setScrollPerc(100);
    screen.render();
  });
  output.on("wheelup", () => {
    output.scroll(-3);
    screen.render();
  });
  output.on("wheeldown", () => {
    output.scroll(3);
    screen.render();
  });
  viewerBody.key(["up", "k"], () => {
    viewerBody.scroll(-1);
    screen.render();
  });
  viewerBody.key(["down", "j"], () => {
    viewerBody.scroll(1);
    screen.render();
  });
  viewerBody.key(["pageup"], () => {
    viewerBody.scroll(-10);
    screen.render();
  });
  viewerBody.key(["pagedown"], () => {
    viewerBody.scroll(10);
    screen.render();
  });
  viewerBody.key(["home"], () => {
    viewerBody.setScroll(0);
    screen.render();
  });
  viewerBody.key(["end"], () => {
    viewerBody.setScrollPerc(100);
    screen.render();
  });
  viewerBody.on("wheelup", () => {
    viewerBody.scroll(-3);
    screen.render();
  });
  viewerBody.on("wheeldown", () => {
    viewerBody.scroll(3);
    screen.render();
  });
  screen.key(["escape"], () => {
    if (modalActive) return;
    menu.focus();
    screen.render();
  });

  screen.key(["q"], () => {
    if (modalActive || screen.focused === inputModalField) return;
    exitTui();
  });
  screen.key(["C-c"], () => {
    exitTui();
  });

  menu.key(["C-c"], () => exitTui());
  inputModal.key(["C-c"], () => exitTui());
  choiceModal.key(["C-c"], () => exitTui());
  viewerModal.key(["C-c"], () => exitTui());

  screen.append(title);
  screen.append(menu);
  screen.append(output);
  menu.focus();
  screen.render();
}
