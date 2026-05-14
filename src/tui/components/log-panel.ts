import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../styles/theme.js";

export interface LogPanelOptions {
  title?: string;
}

export interface LogPanel {
  container: BoxRenderable;
  append: (text: string, level?: "info" | "success" | "warning" | "error") => void;
  clear: () => void;
}

export function createLogPanel(renderer: CliRenderer, options: LogPanelOptions = {}): LogPanel {
  const { title = "日志" } = options;

  const container = new BoxRenderable(renderer, {
    id: "log-panel",
    flexGrow: 1,
    flexDirection: "column",
    backgroundColor: THEME.bg,
    borderStyle: "single",
    borderColor: THEME.border,
    title: ` ${title} `,
    titleAlignment: "center",
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "log-scroll",
    width: "100%",
    flexGrow: 1,
    stickyScroll: true,
    stickyStart: "bottom",
    backgroundColor: "transparent",
  });

  container.add(scrollBox);

  const levelColors: Record<string, string> = {
    info: THEME.text,
    success: THEME.success,
    warning: THEME.warning,
    error: THEME.error,
  };

  const levelPrefixes: Record<string, string> = {
    info: "  ",
    success: "✓ ",
    warning: "⚠ ",
    error: "✗ ",
  };

  let lineCount = 0;

  const append = (text: string, level: "info" | "success" | "warning" | "error" = "info") => {
    const lines = text.split("\n");
    for (const line of lines) {
      const prefix = levelPrefixes[level] || "";
      const color = levelColors[level] || THEME.text;

      scrollBox.add(
        new TextRenderable(renderer, {
          id: `log-${lineCount++}`,
          content: `${prefix}${line}`,
          width: "100%",
          fg: color,
        })
      );
    }
    scrollBox.scrollTo(scrollBox.scrollHeight);
    renderer.requestRender();
  };

  const clear = () => {
    const children = scrollBox.getChildren();
    for (const child of children) {
      scrollBox.remove(child.id);
    }
    lineCount = 0;
    renderer.requestRender();
  };

  return { container, append, clear };
}
