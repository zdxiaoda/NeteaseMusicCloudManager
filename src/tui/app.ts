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
import { createModalManager } from "./modals/modal-manager.js";
import { createActionHandlers } from "./actions/index.js";

export async function startTui(baseUrl: string): Promise<void> {
  const app = createApp(baseUrl);

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

  // 创建操作处理器
  const actions = createActionHandlers(app, renderer, logPanel, modalManager, statusBar);

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

  // 全局快捷键
  keyHandler.on("keypress", (key: KeyEvent) => {
    if (modalManager.isActive()) return;

    if (key.name === "q" && !key.ctrl) {
      renderer.destroy();
      process.exit(0);
    } else if (key.name === "escape") {
      const menuEl = renderer.root.findDescendantById("menu-select") as any;
      if (menuEl) menuEl.focus();
    }
  });

  // 初始消息
  logPanel.append("NCM API 已拉起", "success");

  // 聚焦菜单
  const menuEl = renderer.root.findDescendantById("menu-select") as any;
  if (menuEl) menuEl.focus();

  renderer.start();
}
