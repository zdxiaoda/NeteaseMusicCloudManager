export const THEME = {
  // 主色调
  primary: "#7c3aed",      // 紫色
  primaryDim: "#6d28d9",
  primaryBright: "#a78bfa",
  
  // 背景色
  bg: "#0f0f14",
  bgPanel: "#1a1a24",
  bgElevated: "#252532",
  bgHover: "#2d2d3d",
  
  // 边框
  border: "#2d2d3d",
  borderFocus: "#7c3aed",
  borderSubtle: "#1f1f2e",
  
  // 文本
  text: "#e4e4ef",
  textDim: "#8888a4",
  textMuted: "#5c5c78",
  textBright: "#f8f8ff",
  
  // 语义色
  success: "#10b981",
  successDim: "#059669",
  warning: "#f59e0b",
  warningDim: "#d97706",
  error: "#ef4444",
  errorDim: "#dc2626",
  info: "#3b82f6",
  infoDim: "#2563eb",
  
  // 选中状态
  selected: "#7c3aed",
  selectedText: "#ffffff",
  selectedDim: "#6d28d9",
  
  // 特殊
  accent: "#06b6d4",
  accentDim: "#0891b2",
  muted: "#374151",
} as const;

export const LAYOUT = {
  headerHeight: 6,
  sidebarWidth: 32,
  statusBarHeight: 1,
  modalWidth: "60%",
  modalHeight: "60%",
} as const;
