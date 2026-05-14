import {
  BoxRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { THEME } from "../styles/theme.js";
import { createSongList, createDiffList, type Column } from "../components/table.js";

export interface ModalManager {
  askInput: (label: string, options?: { initialValue?: string }) => Promise<string | undefined>;
  askChoice: <T extends string>(label: string, choices: Array<{ label: string; value: T }>) => Promise<T | undefined>;
  showViewer: (title: string, content: string) => Promise<void>;
  showTable: (title: string, table: BoxRenderable) => Promise<void>;
  askYesNo: (label: string) => Promise<boolean>;
  isActive: () => boolean;
}

interface ActiveModal {
  overlay: BoxRenderable;
  box: BoxRenderable;
  cleanup: () => void;
}

export function createModalManager(renderer: CliRenderer, keyHandler: any): ModalManager {
  let activeModal: ActiveModal | null = null;

  const isActive = () => activeModal !== null;

  const showModal = (content: BoxRenderable, title: string): ActiveModal => {
    const overlay = new BoxRenderable(renderer, {
      id: "modal-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 90,
      backgroundColor: "#000000",
      opacity: 0.6,
    });

    const box = new BoxRenderable(renderer, {
      id: "modal-box",
      position: "absolute",
      top: "20%",
      left: "20%",
      width: "60%",
      height: "60%",
      borderStyle: "rounded",
      borderColor: THEME.primary,
      backgroundColor: THEME.bgPanel,
      title: ` ${title} `,
      titleAlignment: "center",
      flexDirection: "column",
      padding: 1,
      zIndex: 100,
    });

    box.add(content);
    renderer.root.add(overlay);
    renderer.root.add(box);
    renderer.requestRender();

    return {
      overlay,
      box,
      cleanup: () => {
        overlay.destroy();
        box.destroy();
        renderer.requestRender();
      },
    };
  };

  const hideModal = () => {
    if (activeModal) {
      activeModal.cleanup();
      activeModal = null;
    }
  };

  const askInput = (label: string, options: { initialValue?: string } = {}): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const content = new BoxRenderable(renderer, {
        id: "input-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
      });

      const msg = new TextRenderable(renderer, {
        id: "input-msg",
        content: label,
        fg: THEME.textBright,
      });

      const inputField = new (InputRenderable as any)(renderer, {
        id: "modal-input",
        placeholder: "请输入...",
        width: "100%",
        height: 3,
        backgroundColor: THEME.bg,
        focusedBackgroundColor: THEME.bgElevated,
        textColor: THEME.textBright,
        cursorColor: THEME.primary,
        value: options.initialValue || "",
      });

      const hint = new TextRenderable(renderer, {
        id: "input-hint",
        content: "Enter 确认  Esc 取消",
        fg: THEME.textMuted,
      });

      content.add(msg);
      content.add(inputField);
      content.add(hint);

      activeModal = showModal(content, "输入");
      (inputField as any).focus();

      const onFinish = (value: string | undefined) => {
        keyHandler.removeListener("keypress", onKey);
        hideModal();
        resolve(value?.trim());
      };

      const onKey = (key: KeyEvent) => {
        if (key.name === "escape") onFinish(undefined);
        else if (key.name === "return") onFinish((inputField as any).value || "");
      };

      keyHandler.on("keypress", onKey);
    });
  };

  const askChoice = <T extends string>(label: string, choices: Array<{ label: string; value: T }>): Promise<T | undefined> => {
    return new Promise((resolve) => {
      const content = new BoxRenderable(renderer, {
        id: "choice-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
      });

      const msg = new TextRenderable(renderer, {
        id: "choice-msg",
        content: label,
        fg: THEME.textBright,
      });

      const selectEl = new SelectRenderable(renderer, {
        id: "modal-select",
        width: "100%",
        flexGrow: 1,
        options: choices.map((c) => ({ name: c.label, description: "" })),
        backgroundColor: THEME.bg,
        selectedBackgroundColor: THEME.selected,
        selectedTextColor: THEME.selectedText,
        textColor: THEME.text,
        showDescription: false,
      });

      const hint = new TextRenderable(renderer, {
        id: "choice-hint",
        content: "↑↓ 选择  Enter 确认  Esc 取消",
        fg: THEME.textMuted,
      });

      content.add(msg);
      content.add(selectEl);
      content.add(hint);

      activeModal = showModal(content, "选择");
      selectEl.focus();

      const onFinish = (value: T | undefined) => {
        selectEl.removeAllListeners(SelectRenderableEvents.ITEM_SELECTED);
        keyHandler.removeListener("keypress", onKey);
        hideModal();
        resolve(value);
      };

      selectEl.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
        onFinish(choices[index]?.value);
      });

      const onKey = (key: KeyEvent) => {
        if (key.name === "escape") onFinish(undefined);
      };

      keyHandler.on("keypress", onKey);
    });
  };

  const showViewer = (title: string, content: string): Promise<void> => {
    return new Promise((resolve) => {
      const viewerContent = new BoxRenderable(renderer, {
        id: "viewer-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
      });

      const scrollBox = new ScrollBoxRenderable(renderer, {
        id: "viewer-scroll",
        width: "100%",
        flexGrow: 1,
        backgroundColor: THEME.bg,
        borderStyle: "single",
        borderColor: THEME.border,
      });

      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        scrollBox.add(
          new TextRenderable(renderer, {
            id: `viewer-line-${i}`,
            content: lines[i],
            width: "100%",
            fg: THEME.text,
          })
        );
      }

      const hint = new TextRenderable(renderer, {
        id: "viewer-hint",
        content: "↑↓/PgUp/PgDn 滚动  Esc 关闭",
        fg: THEME.textMuted,
      });

      viewerContent.add(scrollBox);
      viewerContent.add(hint);

      activeModal = showModal(viewerContent, title);
      scrollBox.focus();

      const onFinish = () => {
        keyHandler.removeListener("keypress", onKey);
        hideModal();
        resolve();
      };

      const onKey = (key: KeyEvent) => {
        if (key.name === "escape" || key.name === "return") onFinish();
      };

      keyHandler.on("keypress", onKey);
    });
  };

  const askYesNo = (label: string): Promise<boolean> => {
    return askChoice(label, [
      { label: "✓ 是", value: "yes" },
      { label: "✗ 否", value: "no" },
    ]).then((value) => value === "yes");
  };

  const showTable = (title: string, table: BoxRenderable): Promise<void> => {
    return new Promise((resolve) => {
      const content = new BoxRenderable(renderer, {
        id: "table-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
      });

      content.add(table);

      const hint = new TextRenderable(renderer, {
        id: "table-hint",
        content: "↑↓/PgUp/PgDn 滚动  Esc 关闭",
        fg: THEME.textMuted,
      });
      content.add(hint);

      activeModal = showModal(content, title);

      const onFinish = () => {
        keyHandler.removeListener("keypress", onKey);
        hideModal();
        resolve();
      };

      const onKey = (key: KeyEvent) => {
        if (key.name === "escape" || key.name === "return") onFinish();
      };

      keyHandler.on("keypress", onKey);
    });
  };

  return { askInput, askChoice, showViewer, showTable, askYesNo, isActive };
}
