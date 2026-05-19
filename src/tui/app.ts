import {
  createCliRenderer,
  BoxRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { createApp } from "../bootstrap.js";
import { THEME, LAYOUT } from "./styles/theme.js";
import { createSidebar, MENU_ITEMS } from "./components/sidebar.js";
import { createLogPanel } from "./components/log-panel.js";
import { createStatusBar } from "./components/status-bar.js";
import { createCatWidget } from "./components/cat.js";
import { createModalManager } from "./modals/modal-manager.js";
import { createActionHandlers } from "./actions/index.js";
import { SessionStore } from "../infra/config/session-store.js";
import axios from "axios";

async function checkApiAvailable(url: string): Promise<boolean> {
  try {
    await axios.get(`${url.replace(/\/$/, "")}/login/status`, {
      timeout: 2000,
      validateStatus: () => true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function startTui(baseUrl: string): Promise<void> {
  const sessionStore = new SessionStore();
  let apiUrl = baseUrl;

  // 检查是否有保存的API URL
  const savedUrl = sessionStore.getApiUrl();
  if (savedUrl) {
    apiUrl = savedUrl;
  }

  // 检测API是否可用
  const apiAvailable = await checkApiAvailable(apiUrl);

  // 如果API可用，创建app实例
  let app: ReturnType<typeof createApp> | null = null;
  if (apiAvailable) {
    app = createApp(apiUrl);
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    consoleMode: "console-overlay",
    useMouse: true,
    autoFocus: true,
    enableMouseMovement: true,
  });

  const keyHandler = renderer.keyInput;

  // 创建组件
  const logPanel = createLogPanel(renderer);
  const statusBar = createStatusBar(renderer);
  const modalManager = createModalManager(renderer, keyHandler);
  const catWidget = createCatWidget(renderer);

  // 设置焦点恢复函数
  const menuEl = () => renderer.root.findDescendantById("menu-select") as any;
  modalManager.setRestoreFocus(() => {
    const menu = menuEl();
    if (menu) menu.focus();
  });

  // 创建操作处理器
  if (!app) {
    // 如果app未初始化，创建一个临时的app实例用于操作处理器
    app = createApp(apiUrl);
  }
  const actions = createActionHandlers(app, renderer, logPanel, modalManager, statusBar, catWidget);

  // 创建侧边栏
  const sidebar = createSidebar(renderer, {
    onSelect: (index: number) => {
      if (index === 12) {
        renderer.destroy();
        process.exit(0);
        return;
      }
      actions.runAction(index);
    },
  });

  // 主布局
  const mainLayout = new BoxRenderable(renderer, {
    id: "main-layout",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: THEME.bg,
  });

  // 内容区域
  const contentArea = new BoxRenderable(renderer, {
    id: "content-area",
    width: "100%",
    flexGrow: 1,
    flexDirection: "row",
  });

  contentArea.add(sidebar);
  contentArea.add(logPanel.container);

  mainLayout.add(contentArea);
  mainLayout.add(statusBar.container);

  renderer.root.add(mainLayout);
  renderer.root.add(catWidget.container);

  // 全局快捷键
  keyHandler.on("keypress", (key: KeyEvent) => {
    if (modalManager.isActive()) return;

    if (key.name === "q" && !key.ctrl) {
      renderer.destroy();
      process.exit(0);
    } else if (key.name === "escape") {
      const menu = menuEl();
      if (menu) menu.focus();
    }
  });

  // 初始消息
  if (apiAvailable) {
    logPanel.append("已检测到 API", "success");
  } else {
    logPanel.append("未检测到 API，正在配置...", "warn");
    
    // 弹窗提示用户输入API URL
    const choice = await modalManager.askChoice("未检测到 API 服务器", [
      { label: "输入 API URL", value: "input" },
      { label: "部署本地 API", value: "deploy" },
      { label: "跳过", value: "skip" },
    ]);

    if (choice === "input") {
      const url = await modalManager.askInput("请输入 API URL（如 http://localhost:3000）", {
        initialValue: apiUrl,
      });
      if (url) {
        apiUrl = url;
        sessionStore.setApiUrl(url);
        logPanel.append(`已保存 API URL: ${url}`, "success");
        
        // 重新检测API
        const available = await checkApiAvailable(url);
        if (available) {
          logPanel.append("API 连接成功", "success");
        } else {
          logPanel.append("API 连接失败，请检查 URL 或部署 API", "warn");
        }
      }
    } else if (choice === "deploy") {
      logPanel.append("请参考文档部署 API 服务器", "info");
      logPanel.append("部署后使用 '设置 API URL' 功能配置连接", "info");
    } else {
      logPanel.append("已跳过 API 配置，部分功能可能不可用", "warn");
    }
  }

  // 聚焦菜单
  const menu = menuEl();
  if (menu) menu.focus();

  renderer.start();
}
