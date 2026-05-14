import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { THEME } from "../styles/theme.js";
import pkg from "../../../package.json" with { type: "json" };

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const VERSION = pkg.version || "dev";

export interface StatusBar {
  container: BoxRenderable;
  setLoading: (message: string) => void;
  clearLoading: () => void;
  setInfo: (message: string) => void;
  setError: (message: string) => void;
}

export function createStatusBar(renderer: CliRenderer): StatusBar {
  const container = new BoxRenderable(renderer, {
    id: "status-bar",
    width: "100%",
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingX: 1,
    backgroundColor: THEME.bgPanel,
    borderStyle: "single",
    borderColor: THEME.border,
  });

  const leftStatus = new TextRenderable(renderer, {
    id: "status-left",
    content: "就绪",
    fg: THEME.textDim,
  });

  const middleStatus = new TextRenderable(renderer, {
    id: "status-middle",
    content: "",
    fg: THEME.textMuted,
  });

  const rightStatus = new TextRenderable(renderer, {
    id: "status-right",
    content: `v${VERSION}`,
    fg: THEME.textMuted,
  });

  container.add(leftStatus);
  container.add(middleStatus);
  container.add(rightStatus);

  let loadingMessage = "";
  let spinnerIndex = 0;
  let animationTimer: ReturnType<typeof setInterval> | null = null;

  const startAnimation = () => {
    if (animationTimer) return;
    animationTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
      if (loadingMessage) {
        leftStatus.content = `${SPINNER_FRAMES[spinnerIndex]} ${loadingMessage}`;
        leftStatus.fg = THEME.primaryBright;
        renderer.requestRender();
      }
    }, 80);
  };

  const stopAnimation = () => {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
    spinnerIndex = 0;
  };

  const setLoading = (message: string) => {
    loadingMessage = message;
    leftStatus.content = `${SPINNER_FRAMES[0]} ${message}`;
    leftStatus.fg = THEME.primaryBright;
    startAnimation();
    renderer.requestRender();
  };

  const clearLoading = () => {
    loadingMessage = "";
    stopAnimation();
    leftStatus.content = "就绪";
    leftStatus.fg = THEME.textDim;
    renderer.requestRender();
  };

  const setInfo = (message: string) => {
    middleStatus.content = `ℹ ${message}`;
    middleStatus.fg = THEME.info;
    renderer.requestRender();
    setTimeout(() => {
      middleStatus.content = "";
      renderer.requestRender();
    }, 3000);
  };

  const setError = (message: string) => {
    middleStatus.content = `✗ ${message}`;
    middleStatus.fg = THEME.error;
    renderer.requestRender();
    setTimeout(() => {
      middleStatus.content = "";
      renderer.requestRender();
    }, 5000);
  };

  return { container, setLoading, clearLoading, setInfo, setError };
}
