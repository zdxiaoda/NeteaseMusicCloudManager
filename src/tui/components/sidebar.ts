import {
  BoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  ASCIIFontRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../styles/theme.js";

export interface MenuItem {
  icon: string;
  name: string;
  desc: string;
  shortcut?: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { icon: "🔐", name: "登录", desc: "手机号 / 邮箱 / 二维码", shortcut: "1" },
  { icon: "🔍", name: "状态", desc: "检查登录状态", shortcut: "2" },
  { icon: "📂", name: "目录", desc: "设置扫描路径", shortcut: "3" },
  { icon: "🎵", name: "扫描", desc: "扫描本地音乐", shortcut: "4" },
  { icon: "☁️", name: "刷新", desc: "刷新云盘缓存", shortcut: "5" },
  { icon: "📋", name: "列表", desc: "查看云盘歌曲", shortcut: "6" },
  { icon: "⚖️", name: "比对", desc: "差异分析", shortcut: "7" },
  { icon: "⬆️", name: "上传", desc: "同步到云盘", shortcut: "8" },
  { icon: "🗑️", name: "删除", desc: "删除本地独有", shortcut: "9" },
  { icon: "⬇️", name: "下载", desc: "下载云盘独有", shortcut: "0" },
  { icon: "🎧", name: "音质", desc: "更新低音质", shortcut: "q" },
  { icon: "🔗", name: "匹配", desc: "手动匹配歌曲", shortcut: "w" },
  { icon: "🚪", name: "退出", desc: "", shortcut: "Esc" },
];

export interface SidebarOptions {
  onSelect: (index: number) => void;
}

export function createSidebar(renderer: CliRenderer, options: SidebarOptions): BoxRenderable {
  const sidebar = new BoxRenderable(renderer, {
    id: "sidebar",
    width: LAYOUT.sidebarWidth,
    height: "100%",
    flexDirection: "column",
    backgroundColor: THEME.bgPanel,
    borderStyle: "single",
    borderColor: THEME.border,
  });

  // Logo 区域 - 使用 ASCIIFont
  const logoArea = new BoxRenderable(renderer, {
    id: "logo-area",
    width: "100%",
    height: 6,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingY: 0,
    border: true,
    borderColor: THEME.border,
  });

  // ASCII 艺术字 LOGO
  const asciiLogo = new ASCIIFontRenderable(renderer, {
    id: "ascii-logo",
    text: "NCM",
    font: "tiny",
    color: THEME.primaryBright,
  });

  // 副标题
  const logoSub = new TextRenderable(renderer, {
    id: "logo-sub",
    content: "Cloud Manager",
    fg: THEME.textDim,
  });

  logoArea.add(asciiLogo);
  logoArea.add(logoSub);
  sidebar.add(logoArea);

  // 菜单列表
  const selectEl = new SelectRenderable(renderer, {
    id: "menu-select",
    width: "100%",
    flexGrow: 1,
    options: MENU_ITEMS.map((item) => ({
      name: `${item.icon} ${item.name}`,
      description: item.desc,
    })),
    backgroundColor: "transparent",
    selectedBackgroundColor: THEME.selected,
    selectedTextColor: THEME.selectedText,
    textColor: THEME.text,
    descriptionColor: THEME.textDim,
    selectedDescriptionColor: THEME.textBright,
    showDescription: true,
    itemSpacing: 0,
  });

  selectEl.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    options.onSelect(index);
  });

  sidebar.add(selectEl);

  // 快捷键提示
  const shortcutArea = new BoxRenderable(renderer, {
    id: "shortcut-area",
    width: "100%",
    height: 3,
    flexDirection: "column",
    paddingX: 1,
    border: true,
    borderColor: THEME.border,
  });

  const shortcuts = new TextRenderable(renderer, {
    id: "shortcuts",
    content: "↑↓/鼠标 选择\nEnter/点击 确认",
    fg: THEME.textMuted,
  });

  shortcutArea.add(shortcuts);
  sidebar.add(shortcutArea);

  return sidebar;
}

import { LAYOUT } from "../styles/theme.js";
