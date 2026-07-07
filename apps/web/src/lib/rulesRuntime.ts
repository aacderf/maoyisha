import * as fallbackRules from "@cardgame/shared";
import type {
  CharacterDefinition,
  GameAction,
  GameState,
  GameTimerSettings,
  WerewolfAction,
  WerewolfModeratorState,
  WerewolfPlayerInput,
  WerewolfPrivateState,
  WerewolfPublicState,
  WerewolfPreset,
  WerewolfRoleDefinition,
  WerewolfTimerSettings,
} from "@cardgame/shared";
import { APP_VERSION, PROTOCOL_VERSION } from "../config/appConfig.js";
import { resolveAssetUrl } from "./hotUpdate.js";

export type RulesRuntime = {
  BUILT_IN_CHARACTERS: CharacterDefinition[];
  WEREWOLF_PRESETS: WerewolfPreset[];
  WEREWOLF_ROLE_DEFINITIONS: WerewolfRoleDefinition[];
  createGame: (input: {
    roomId: string;
    players: Array<{ playerId: string; playerName: string; characterId?: string }>;
    characters: CharacterDefinition[];
    seed?: string;
    timerSettings?: Partial<GameTimerSettings>;
  }) => GameState;
  applyGameAction: (state: GameState, action: GameAction) => { state: GameState; events: string[] };
  getGameCardCatalog: () => ReturnType<typeof fallbackRules.getGameCardCatalog>;
  getHandLimit: typeof fallbackRules.getHandLimit;
  createWerewolfGame: (input: {
    roomId: string;
    players: WerewolfPlayerInput[];
    seed?: string;
    timerSettings?: Partial<WerewolfTimerSettings>;
  }) => WerewolfModeratorState;
  applyWerewolfAction: (
    state: WerewolfModeratorState,
    action: WerewolfAction
  ) => { state: WerewolfModeratorState; events: string[] };
  getWerewolfPrivateState: (
    state: WerewolfModeratorState,
    seatId: string
  ) => WerewolfPrivateState;
  getWerewolfPublicState: (
    state: WerewolfModeratorState
  ) => WerewolfPublicState;
  setWerewolfPlayerConnected: (
    state: WerewolfModeratorState,
    playerId: string,
    connected: boolean
  ) => WerewolfModeratorState;
};

export type RulesRuntimeInfo = {
  source: "builtin" | "hotfix";
  appVersion: string;
  protocolVersion: string;
  logicVersion: string;
  logicMd5: string;
  error?: string;
};

type VersionManifest = {
  appVersion?: string;
  protocolVersion?: string;
  logicVersion?: string;
  logicMd5?: string;
};

let runtime: RulesRuntime = fallbackRules as unknown as RulesRuntime;
let info: RulesRuntimeInfo = {
  source: "builtin",
  appVersion: APP_VERSION,
  protocolVersion: PROTOCOL_VERSION,
  logicVersion: APP_VERSION,
  logicMd5: "builtin",
};

export function getRulesRuntime(): RulesRuntime {
  return runtime;
}

export function getRulesRuntimeInfo(): RulesRuntimeInfo {
  return info;
}

export async function loadHotRulesRuntime(): Promise<RulesRuntimeInfo> {
  try {
    const manifest = await loadLocalManifest();
    const moduleUrl = `${resolveAssetUrl("assets/logic/rules.bundle.js")}?v=${encodeURIComponent(manifest.logicMd5 || Date.now().toString())}`;
    const module = await importRulesModule(moduleUrl);
    assertRuntime(module);
    runtime = await withConfigOverrides(module as RulesRuntime);
    info = {
      source: "hotfix",
      appVersion: manifest.appVersion ?? info.appVersion,
      protocolVersion: manifest.protocolVersion ?? info.protocolVersion,
      logicVersion: manifest.logicVersion ?? info.logicVersion,
      logicMd5: manifest.logicMd5 || "external",
    };
  } catch (error) {
    runtime = await withConfigOverrides(fallbackRules as unknown as RulesRuntime).catch(
      () => fallbackRules as unknown as RulesRuntime
    );
    info = {
      ...info,
      source: "builtin",
      error: error instanceof Error ? error.message : "规则热更包加载失败，已使用内置规则。",
    };
  }
  return info;
}

function assertRuntime(module: Partial<RulesRuntime>): asserts module is RulesRuntime {
  if (!Array.isArray(module.BUILT_IN_CHARACTERS)) throw new Error("规则包缺少角色表。");
  if (!Array.isArray(module.WEREWOLF_PRESETS)) throw new Error("规则包缺少狼人杀板型。");
  if (!Array.isArray(module.WEREWOLF_ROLE_DEFINITIONS)) throw new Error("规则包缺少狼人杀角色表。");
  if (typeof module.createGame !== "function") throw new Error("规则包缺少 createGame。");
  if (typeof module.applyGameAction !== "function") throw new Error("规则包缺少 applyGameAction。");
  if (typeof module.getGameCardCatalog !== "function") throw new Error("规则包缺少 getGameCardCatalog。");
  if (typeof module.getHandLimit !== "function") throw new Error("规则包缺少 getHandLimit。");
  if (typeof module.createWerewolfGame !== "function") throw new Error("规则包缺少 createWerewolfGame。");
  if (typeof module.applyWerewolfAction !== "function") throw new Error("规则包缺少 applyWerewolfAction。");
  if (typeof module.getWerewolfPrivateState !== "function") throw new Error("规则包缺少 getWerewolfPrivateState。");
  if (typeof module.getWerewolfPublicState !== "function") throw new Error("规则包缺少 getWerewolfPublicState。");
  if (typeof module.setWerewolfPlayerConnected !== "function") throw new Error("规则包缺少 setWerewolfPlayerConnected。");
}

async function loadLocalManifest(): Promise<VersionManifest> {
  const response = await fetch(`${resolveAssetUrl("version.json")}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("本地 version.json 不可用。");
  return (await response.json()) as VersionManifest;
}

async function withConfigOverrides(base: RulesRuntime): Promise<RulesRuntime> {
  const [characters, cards, werewolfRoles, werewolfPresets] = await Promise.all([
    loadJson<CharacterDefinition[]>("assets/config/characters.json").catch(() => undefined),
    loadJson<ReturnType<typeof fallbackRules.getGameCardCatalog>>("assets/config/cards.json").catch(() => undefined),
    loadJson<WerewolfRoleDefinition[]>("assets/config/werewolf-roles.json").catch(() => undefined),
    loadJson<WerewolfPreset[]>("assets/config/werewolf-presets.json").catch(() => undefined),
  ]);
  if (Array.isArray(werewolfRoles)) {
    base.WEREWOLF_ROLE_DEFINITIONS.splice(
      0,
      base.WEREWOLF_ROLE_DEFINITIONS.length,
      ...werewolfRoles
    );
  }
  if (Array.isArray(werewolfPresets)) {
    base.WEREWOLF_PRESETS.splice(
      0,
      base.WEREWOLF_PRESETS.length,
      ...werewolfPresets
    );
  }
  return {
    ...base,
    BUILT_IN_CHARACTERS: Array.isArray(characters) ? characters : base.BUILT_IN_CHARACTERS,
    WEREWOLF_ROLE_DEFINITIONS: base.WEREWOLF_ROLE_DEFINITIONS,
    WEREWOLF_PRESETS: base.WEREWOLF_PRESETS,
    getGameCardCatalog: Array.isArray(cards) ? () => cards : base.getGameCardCatalog,
  };
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(`${resolveAssetUrl(url)}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} 不可用。`);
  return (await response.json()) as T;
}

async function importRulesModule(url: string): Promise<Partial<RulesRuntime>> {
  return (await import(/* @vite-ignore */ url)) as Partial<RulesRuntime>;
}
