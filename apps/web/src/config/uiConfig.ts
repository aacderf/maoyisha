import type { AudioSettings } from "../lib/audioAssets.js";

export const REMEMBER_KEY = "maoyisha.rememberCredentials";
export const SETTINGS_KEY = "maoyisha.settings";

export const CORE_CARD_NAMES = [
  "杀",
  "火杀",
  "雷杀",
  "闪",
  "桃",
  "酒",
  "无中生有",
  "过河拆桥",
  "顺手牵羊",
  "决斗",
  "借刀杀人",
  "南蛮入侵",
  "万箭齐发",
  "桃园结义",
  "五谷丰登",
  "无懈可击",
  "乐不思蜀",
  "闪电",
  "火攻",
  "铁索连环",
  "兵粮寸断",
];

export const QUICK_CHAT_MESSAGES = [
  "贵神速点",
  "快点吧，花都谢了",
  "救救我",
  "杀杀杀",
  "我是忠臣",
  "我就是太阳",
];

export const RECENT_CHARACTER_IDS = [
  "builtin-gay-guan",
  "builtin-haijie-dashen",
  "builtin-hong-xiliang",
  "builtin-ju-hui",
  "builtin-yangzhi-tao",
] as const;

export const TABLE_BACKGROUNDS = [
  { id: "classic", label: "经典牌桌", path: "assets/ui/table-bg.png" },
  { id: "dark-school", label: "深色校园牌桌", path: "assets/ui/table-bg-dark-school.png" },
  { id: "jade-arena", label: "青玉竞技牌桌", path: "assets/ui/table-bg-jade-arena.png" },
] as const;

export type KeyBindingAction =
  | "previousCard"
  | "nextCard"
  | "previousTarget"
  | "nextTarget"
  | "confirmAction"
  | "alternateConfirm"
  | "cancelAction"
  | "endTurn"
  | "manualReconnect"
  | "openBattleMenu";

export type KeyBindings = Record<KeyBindingAction, string>;

export const KEY_BINDING_LABELS: Record<KeyBindingAction, string> = {
  previousCard: "上一张手牌",
  nextCard: "下一张手牌",
  previousTarget: "上一个目标",
  nextTarget: "下一个目标",
  confirmAction: "确认出牌/响应",
  alternateConfirm: "备用确认",
  cancelAction: "取消/跳过",
  endTurn: "结束出牌",
  manualReconnect: "手动重连",
  openBattleMenu: "打开菜单",
};

export const KEY_BINDING_ORDER: KeyBindingAction[] = [
  "previousCard",
  "nextCard",
  "previousTarget",
  "nextTarget",
  "confirmAction",
  "alternateConfirm",
  "cancelAction",
  "endTurn",
  "manualReconnect",
  "openBattleMenu",
];

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  previousCard: "KeyQ",
  nextCard: "KeyE",
  previousTarget: "KeyA",
  nextTarget: "KeyD",
  confirmAction: "Enter",
  alternateConfirm: "Space",
  cancelAction: "Escape",
  endTurn: "KeyF",
  manualReconnect: "KeyR",
  openBattleMenu: "KeyM",
};

export function normalizeKeyBindings(value: unknown): KeyBindings {
  const raw = typeof value === "object" && value ? value as Partial<KeyBindings> : {};
  const next = { ...DEFAULT_KEY_BINDINGS };
  const used = new Set<string>();
  for (const action of KEY_BINDING_ORDER) {
    const code = String(raw[action] || DEFAULT_KEY_BINDINGS[action] || "").trim();
    const fallback = DEFAULT_KEY_BINDINGS[action];
    let candidate = code && !used.has(code) ? code : fallback;
    if (used.has(candidate)) {
      candidate = KEY_BINDING_ORDER
        .map((item) => DEFAULT_KEY_BINDINGS[item])
        .find((item) => !used.has(item)) ?? fallback;
    }
    next[action] = candidate;
    used.add(next[action]);
  }
  return next;
}

export function formatKeyCode(code: string): string {
  if (!code) return "未设置";
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.replace("Arrow", "方向");
  return code;
}

export type GameSettings = AudioSettings & {
  defaultMaxPlayers: number;
  roomPrefix: string;
  tableBackgroundId: string;
  compactUi: boolean;
  tableCompact: boolean;
  battleHudCompact: boolean;
  compactHandZone: boolean;
  transparentHandZone: boolean;
  eventLogCollapsed: boolean;
  compactLobbyTools: boolean;
  showLobbyVideo: boolean;
  handScale: number;
  handCardScale: number;
  effectIntensity: "off" | "low" | "normal" | "high";
  battleVfxStyle: "anime" | "guofeng";
  reduceMotion: boolean;
  customCursorEnabled: boolean;
  cursorTheme: "silksong" | "luoxiaohei" | "silverwolf" | "firefly" | "classicPointer";
  cursorSize: number;
  cursorTrail: "off" | "particle" | "sakura";
  clickEffectsEnabled: boolean;
  highContrastText: boolean;
  enableDragPlay: boolean;
  enableHandSort: boolean;
  autoRefreshLobby: boolean;
  showRuleTips: boolean;
  showFullErrors: boolean;
  turnTimerSeconds: number;
  responseTimerSeconds: number;
  characterRefreshCount: number;
  rtcVoiceVolume: number;
  keyBindings: KeyBindings;
};

export const DEFAULT_SETTINGS: GameSettings = {
  defaultMaxPlayers: 4,
  roomPrefix: "ROOM",
  tableBackgroundId: "classic",
  compactUi: false,
  tableCompact: false,
  battleHudCompact: true,
  compactHandZone: true,
  transparentHandZone: true,
  eventLogCollapsed: true,
  compactLobbyTools: true,
  showLobbyVideo: true,
  handScale: 1,
  handCardScale: 1,
  effectIntensity: "normal",
  battleVfxStyle: "guofeng",
  reduceMotion: false,
  customCursorEnabled: true,
  cursorTheme: "silksong",
  cursorSize: 1,
  cursorTrail: "particle",
  clickEffectsEnabled: true,
  highContrastText: false,
  enableDragPlay: true,
  enableHandSort: false,
  autoRefreshLobby: true,
  showRuleTips: true,
  showFullErrors: false,
  turnTimerSeconds: 60,
  responseTimerSeconds: 15,
  characterRefreshCount: 2,
  rtcVoiceVolume: 0.8,
  keyBindings: DEFAULT_KEY_BINDINGS,
  masterVolume: 0.85,
  bgmVolume: 0.55,
  sfxVolume: 0.82,
  voiceVolume: 0.86,
  announcerVolume: 0.9,
  muted: false,
  currentBgmId: "lobby",
  loopMode: "all",
  autoResume: false,
};

export function normalizeCursorSettings(value: Partial<GameSettings>): Pick<
  GameSettings,
  "cursorTheme" | "cursorSize" | "cursorTrail"
> {
  const cursorThemes: GameSettings["cursorTheme"][] = [
    "silksong",
    "luoxiaohei",
    "silverwolf",
    "firefly",
    "classicPointer",
  ];
  const cursorTheme = cursorThemes.includes(value.cursorTheme as GameSettings["cursorTheme"])
    ? value.cursorTheme as GameSettings["cursorTheme"]
    : DEFAULT_SETTINGS.cursorTheme;
  const rawSize = Number(value.cursorSize);
  const cursorSize = Number.isFinite(rawSize)
    ? Math.min(1.6, Math.max(0.6, rawSize))
    : DEFAULT_SETTINGS.cursorSize;
  const cursorTrail: GameSettings["cursorTrail"] =
    value.cursorTrail === "off" || value.cursorTrail === "sakura"
      ? value.cursorTrail
      : "particle";
  return { cursorTheme, cursorSize, cursorTrail };
}

export function normalizeBattleVfxStyle(value: unknown): GameSettings["battleVfxStyle"] {
  return value === "anime" ? "anime" : DEFAULT_SETTINGS.battleVfxStyle;
}
