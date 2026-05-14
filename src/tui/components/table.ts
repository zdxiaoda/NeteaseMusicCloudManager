import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../styles/theme.js";

export interface Column {
  key: string;
  title: string;
  width: number;
  align?: "left" | "center" | "right";
  minWidth?: number;
}

export interface TableOptions {
  columns: Column[];
  data: Record<string, any>[];
  title?: string;
  maxHeight?: number;
}

function padText(text: string, width: number, align: "left" | "center" | "right" = "left"): string {
  if (text.length >= width) return text.slice(0, width);
  const padding = width - text.length;
  if (align === "center") {
    const leftPad = Math.floor(padding / 2);
    return " ".repeat(leftPad) + text + " ".repeat(padding - leftPad);
  }
  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  return text + " ".repeat(padding);
}

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 2) + "..";
}

export function createTableRenderer(renderer: CliRenderer, options: TableOptions): BoxRenderable {
  const { columns, data, title, maxHeight = 20 } = options;

  // 计算表格总宽度
  const tableWidth = columns.reduce((sum, col) => sum + col.width + 1, 0) + 2;

  const container = new BoxRenderable(renderer, {
    id: "table-container",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: THEME.bg,
  });

  // 表头 - 使用 ScrollBox 支持水平滚动
  const headerScroll = new ScrollBoxRenderable(renderer, {
    id: "table-header-scroll",
    width: "100%",
    height: 1,
    scrollX: true,
    scrollY: false,
    backgroundColor: THEME.bgElevated,
  });

  const headerContent = new BoxRenderable(renderer, {
    id: "table-header-content",
    width: tableWidth,
    height: 1,
    flexDirection: "row",
    paddingX: 1,
  });

  for (const col of columns) {
    const cell = new TextRenderable(renderer, {
      id: `header-${col.key}`,
      content: padText(col.title, col.width, "center"),
      width: col.width + 1,
      fg: THEME.primaryBright,
      attributes: 1, // BOLD
    });
    headerContent.add(cell);
  }
  headerScroll.add(headerContent);
  container.add(headerScroll);

  // 分隔线
  const separatorScroll = new ScrollBoxRenderable(renderer, {
    id: "table-separator-scroll",
    width: "100%",
    height: 1,
    scrollX: true,
    scrollY: false,
    backgroundColor: "transparent",
  });

  const separatorContent = new TextRenderable(renderer, {
    id: "table-separator",
    content: columns.map((col) => "─".repeat(col.width)).join("─"),
    width: tableWidth,
    fg: THEME.border,
  });
  separatorScroll.add(separatorContent);
  container.add(separatorScroll);

  // 数据行 - 支持双向滚动
  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "table-scroll",
    width: "100%",
    flexGrow: 1,
    maxHeight,
    scrollX: true,
    scrollY: true,
    backgroundColor: "transparent",
  });

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const isEven = i % 2 === 0;

    const rowBox = new BoxRenderable(renderer, {
      id: `table-row-${i}`,
      width: tableWidth,
      height: 1,
      flexDirection: "row",
      backgroundColor: isEven ? "transparent" : "#1a1a2e",
      paddingX: 1,
    });

    for (const col of columns) {
      const value = row[col.key] ?? "";
      const cell = new TextRenderable(renderer, {
        id: `cell-${i}-${col.key}`,
        content: padText(truncateText(String(value), col.width), col.width, col.align || "left"),
        width: col.width + 1,
        fg: THEME.text,
      });
      rowBox.add(cell);
    }

    scrollBox.add(rowBox);
  }

  container.add(scrollBox);

  // 底部统计和滚动提示
  const footer = new BoxRenderable(renderer, {
    id: "table-footer",
    width: "100%",
    height: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingX: 1,
    backgroundColor: THEME.bgPanel,
  });

  const countText = new TextRenderable(renderer, {
    id: "table-count",
    content: `共 ${data.length} 条`,
    fg: THEME.textDim,
  });

  const scrollHint = new TextRenderable(renderer, {
    id: "table-scroll-hint",
    content: "← → 左右滚动  ↑ ↓ 上下滚动",
    fg: THEME.textMuted,
  });

  footer.add(countText);
  footer.add(scrollHint);
  container.add(footer);

  return container;
}

// 快捷函数：创建歌曲列表
export function createSongList(renderer: CliRenderer, songs: any[], title?: string): BoxRenderable {
  const columns: Column[] = [
    { key: "index", title: "#", width: 4, align: "right" },
    { key: "name", title: "歌曲名", width: 28 },
    { key: "artist", title: "歌手", width: 18 },
    { key: "album", title: "专辑", width: 22 },
    { key: "duration", title: "时长", width: 8, align: "right" },
  ];

  const data = songs.map((song, i) => ({
    index: String(i + 1),
    name: song.simpleSongName || song.name || "-",
    artist: song.artist || "-",
    album: song.album || "-",
    duration: song.durationMs ? `${Math.round(song.durationMs / 1000)}s` : "-",
  }));

  return createTableRenderer(renderer, { columns, data, title });
}

// 快捷函数：创建差异列表
export function createDiffList(
  renderer: CliRenderer,
  items: any[],
  type: "local" | "cloud",
  title?: string
): BoxRenderable {
  const columns: Column[] = type === "local"
    ? [
        { key: "index", title: "#", width: 4, align: "right" },
        { key: "fileName", title: "文件名", width: 34 },
        { key: "title", title: "标题", width: 24 },
        { key: "artist", title: "歌手", width: 18 },
        { key: "duration", title: "时长", width: 8, align: "right" },
      ]
    : [
        { key: "index", title: "#", width: 4, align: "right" },
        { key: "cloudId", title: "CloudID", width: 10, align: "right" },
        { key: "fileName", title: "文件名", width: 28 },
        { key: "name", title: "歌曲名", width: 22 },
        { key: "artist", title: "歌手", width: 16 },
      ];

  const data = items.map((item, i) => {
    if (type === "local") {
      return {
        index: String(i + 1),
        fileName: item.fileName || "-",
        title: item.title || "-",
        artist: item.artist || "-",
        duration: item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : "-",
      };
    }
    return {
      index: String(i + 1),
      cloudId: String(item.cloudId || "-"),
      fileName: item.fileName || "-",
      name: item.simpleSongName || "-",
      artist: item.artist || "-",
    };
  });

  return createTableRenderer(renderer, { columns, data, title });
}
