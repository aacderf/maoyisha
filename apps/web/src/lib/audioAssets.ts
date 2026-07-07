import type { CardKey } from "@cardgame/shared";
import { resolveAssetUrl } from "./hotUpdate.js";

const assetUrl = (path: string) => resolveAssetUrl(`assets/audio/${path}`);

const AUDIO_CONFIG_URL = "assets/config/audio.json";

export type LoopMode = "one" | "all";

export type AudioSettings = {
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  announcerVolume: number;
  muted: boolean;
  currentBgmId: string;
  loopMode: LoopMode;
  autoResume: boolean;
};

export type AudioTrack = {
  id: string;
  label: string;
  scene: "lobby" | "battle" | "any";
  src: string;
};

export type CardVoiceSet = {
  label: string;
  male: string;
  female: string;
};

export const DEFAULT_BGM_TRACKS: AudioTrack[] = [
  { id: "lobby", label: "大厅", scene: "lobby", src: assetUrl("bgm/lobby.mp3") },
  { id: "battle", label: "战斗", scene: "battle", src: assetUrl("bgm/battle.mp3") },
  { id: "qixi", label: "七夕", scene: "any", src: assetUrl("bgm/qixi.mp3") },
  { id: "sgs-1", label: "三国杀 1", scene: "any", src: assetUrl("bgm/sgs-1.mp3") },
  { id: "sgs-2", label: "三国杀 2", scene: "any", src: assetUrl("bgm/sgs-2.mp3") },
  { id: "sgs-3", label: "三国杀 3", scene: "any", src: assetUrl("bgm/sgs-3.mp3") },
  { id: "sgs-4", label: "三国杀 4", scene: "any", src: assetUrl("bgm/sgs-4.mp3") },
  { id: "happy-poker-1", label: "欢乐斗地主 1", scene: "any", src: assetUrl("bgm/happy-poker-1.mp3") },
  { id: "happy-poker-2", label: "欢乐斗地主 2", scene: "any", src: assetUrl("bgm/happy-poker-2.mp3") },
  { id: "happy-poker-3", label: "欢乐斗地主 3", scene: "any", src: assetUrl("bgm/happy-poker-3.mp3") },
  { id: "happy-poker-4", label: "欢乐斗地主 4", scene: "any", src: assetUrl("bgm/happy-poker-4.mp3") },
  { id: "pvz-1", label: "植物大战僵尸 1", scene: "any", src: assetUrl("bgm/pvz-1.mp3") },
  { id: "pvz-2", label: "植物大战僵尸 2", scene: "any", src: assetUrl("bgm/pvz-2.mp3") },
  { id: "pvz-3", label: "植物大战僵尸 3", scene: "any", src: assetUrl("bgm/pvz-3.mp3") },
  { id: "ski", label: "滑雪大冒险", scene: "any", src: assetUrl("bgm/ski.mp3") },
  { id: "ski-umamusume", label: "滑雪大冒险 赛马娘版", scene: "any", src: assetUrl("bgm/ski-umamusume.mp3") },
  { id: "asphalt", label: "狂野飙车", scene: "any", src: assetUrl("bgm/asphalt.mp3") },
  { id: "gta", label: "GTA", scene: "any", src: assetUrl("bgm/gta.mp3") },
  { id: "ryukyu", label: "RYUKYUVANIA", scene: "any", src: assetUrl("bgm/ryukyu.mp3") },
];

export let BGM_TRACKS: AudioTrack[] = DEFAULT_BGM_TRACKS;

export async function loadAudioConfig(): Promise<AudioTrack[]> {
  const response = await fetch(`${resolveAssetUrl(AUDIO_CONFIG_URL)}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`audio.json 加载失败：HTTP ${response.status}`);
  const data = await response.json() as { bgm?: unknown };
  const tracks = Array.isArray(data.bgm) ? data.bgm.map(normalizeAudioTrack).filter(Boolean) as AudioTrack[] : [];
  if (tracks.length === 0) throw new Error("audio.json 没有可用 bgm 列表");
  BGM_TRACKS = dedupeTracks(tracks);
  return BGM_TRACKS;
}

export function getBgmTracks(): AudioTrack[] {
  return BGM_TRACKS.length > 0 ? BGM_TRACKS : DEFAULT_BGM_TRACKS;
}

export function getBgmTrack(id: string): AudioTrack {
  const tracks = getBgmTracks();
  return tracks.find((track) => track.id === id) ?? tracks[0] ?? DEFAULT_BGM_TRACKS[0]!;
}

export const CARD_VOICES: Partial<Record<CardKey, CardVoiceSet>> = {
  sha: voice("杀", "sha"),
  fire_sha: voice("火杀", "fire-sha"),
  thunder_sha: voice("雷杀", "thunder-sha"),
  shan: voice("闪", "shan"),
  juedou: voice("决斗", "juedou"),
  jiu: voice("酒", "jiu"),
  huogong: voice("火攻", "huogong"),
  shandian: voice("闪电", "shandian"),
  wuxie: voice("无懈可击", "wuxie"),
  shunshou: voice("顺手牵羊", "shunshou"),
  guohe: voice("过河拆桥", "guohe"),
  lebu: voice("乐不思蜀", "lebu"),
  bingliang: voice("兵粮寸断", "bingliang"),
  nanman: voice("南蛮入侵", "nanman"),
  wanjian: voice("万箭齐发", "wanjian"),
  taoyuan: voice("桃园结义", "taoyuan"),
  jiedao: voice("借刀杀人", "jiedao"),
  tiesuo: voice("铁索连环", "tiesuo"),
  wuzhong: voice("无中生有", "wuzhong"),
  wugu: voice("五谷丰登", "wugu"),
};

export const SFX = {
  sha: [assetUrl("sfx/sha-1.mp3"), assetUrl("sfx/sha-2.mp3")],
  fire: [assetUrl("sfx/fire-1.mp3"), assetUrl("sfx/fire-2.mp3")],
  thunder: [assetUrl("sfx/thunder-1.mp3"), assetUrl("sfx/thunder-2.mp3")],
  heal: [assetUrl("sfx/heal.mp3")],
  damage: [assetUrl("sfx/damage.mp3")],
  lightning: [assetUrl("sfx/lightning.mp3")],
  equip: [assetUrl("sfx/equip.mp3")],
};

export const ANNOUNCERS = {
  kill1: assetUrl("announcer/kill-1.mp3"),
  kill2: assetUrl("announcer/kill-2.mp3"),
  kill3: assetUrl("announcer/kill-3.mp3"),
  kill4: assetUrl("announcer/kill-4.mp3"),
  kill5: assetUrl("announcer/kill-5.mp3"),
  kill6: assetUrl("announcer/kill-6.mp3"),
  kill7: assetUrl("announcer/kill-7.mp3"),
  kill8: assetUrl("announcer/kill-8.mp3"),
  healMaster: assetUrl("announcer/heal-master.mp3"),
  healExpert: assetUrl("announcer/heal-expert.mp3"),
};

export function getCardVoice(cardKey: CardKey, gender?: string): string | undefined {
  const voiceSet = CARD_VOICES[cardKey];
  if (!voiceSet) return undefined;
  return gender === "female" || gender === "女" ? voiceSet.female : voiceSet.male;
}

export function getCardSfx(cardKey: CardKey): string | undefined {
  if (cardKey === "sha") return pick(SFX.sha);
  if (cardKey === "fire_sha" || cardKey === "huogong") return pick(SFX.fire);
  if (cardKey === "thunder_sha") return pick(SFX.thunder);
  if (cardKey === "tao" || cardKey === "taoyuan") return pick(SFX.heal);
  if (cardKey === "shandian") return pick(SFX.lightning);
  if (cardKey === "weapon" || cardKey === "armor" || cardKey === "attack_horse" || cardKey === "defense_horse") return pick(SFX.equip);
  return undefined;
}

function normalizeAudioTrack(raw: unknown): AudioTrack | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Partial<AudioTrack>;
  const id = String(item.id || "").trim();
  const src = String(item.src || "").trim();
  if (!id || !src) return undefined;
  const scene = item.scene === "lobby" || item.scene === "battle" || item.scene === "any" ? item.scene : "any";
  return {
    id,
    label: String(item.label || id).trim() || id,
    scene,
    src: normalizeAudioSrc(src),
  };
}

function normalizeAudioSrc(src: string): string {
  if (/^(https?:)?\/\//i.test(src)) return src;
  if (src.startsWith("./") || src.startsWith("/") || src.startsWith("../") || src.startsWith("assets/")) {
    return resolveAssetUrl(src);
  }
  return assetUrl(src.replace(/^assets\/audio\//, ""));
}

function dedupeTracks(tracks: AudioTrack[]): AudioTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function voice(label: string, fileKey: string): CardVoiceSet {
  return {
    label,
    male: assetUrl(`voice/${fileKey}-male.mp3`),
    female: assetUrl(`voice/${fileKey}-female.mp3`),
  };
}

function pick<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}
