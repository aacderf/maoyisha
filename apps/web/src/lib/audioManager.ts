import type { CardKey } from "@cardgame/shared";
import {
  ANNOUNCERS,
  getBgmTrack,
  getBgmTracks,
  getCardSfx,
  getCardVoice,
  type AudioSettings,
} from "./audioAssets.js";
import { resolveAssetUrl } from "./hotUpdate.js";

export class AudioManager {
  private settings: AudioSettings;
  private bgm?: HTMLAudioElement;
  private currentTrackId = "";

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  updateSettings(settings: AudioSettings) {
    this.settings = settings;
    this.applyBgmVolume();
    if (this.bgm) this.bgm.loop = settings.loopMode === "one";
  }

  isPlaying(): boolean {
    return Boolean(this.bgm && !this.bgm.paused);
  }

  trackId(): string {
    return this.currentTrackId || this.settings.currentBgmId;
  }

  async playBgm(trackId = this.settings.currentBgmId): Promise<boolean> {
    const track = getBgmTrack(trackId);
    if (!this.bgm || this.currentTrackId !== track.id) {
      this.bgm?.pause();
      this.bgm = new Audio(track.src);
      this.bgm.preload = "auto";
      this.bgm.loop = this.settings.loopMode === "one";
      this.bgm.addEventListener("ended", () => {
        if (this.settings.loopMode === "all") void this.playBgm(this.nextTrackId());
      });
      this.currentTrackId = track.id;
    }
    this.applyBgmVolume();
    try {
      await this.bgm.play();
      return true;
    } catch (error) {
      console.warn("BGM playback blocked or failed", error);
      return false;
    }
  }

  pauseBgm() {
    this.bgm?.pause();
  }

  async toggleBgm(trackId = this.settings.currentBgmId): Promise<boolean> {
    if (this.isPlaying() && this.currentTrackId === trackId) {
      this.pauseBgm();
      return false;
    }
    return this.playBgm(trackId);
  }

  async nextBgm(): Promise<boolean> {
    return this.playBgm(this.nextTrackId());
  }

  async previousBgm(): Promise<boolean> {
    const tracks = getBgmTracks();
    const index = Math.max(0, tracks.findIndex((track) => track.id === this.trackId()));
    const previous = tracks[(index - 1 + tracks.length) % tracks.length] ?? tracks[0];
    return this.playBgm(previous.id);
  }

  playCard(cardKey: CardKey, gender?: string) {
    const voice = getCardVoice(cardKey, gender);
    if (voice) this.playOneShot(voice, this.settings.voiceVolume);
    const sfx = getCardSfx(cardKey);
    if (sfx) window.setTimeout(() => this.playOneShot(sfx, this.settings.sfxVolume), 120);
  }

  playSfx(kind: "damage" | "heal" | "equip" | "lightning" | "sha" | "fire" | "thunder") {
    const src = {
      damage: undefined,
      heal: undefined,
      equip: undefined,
      lightning: undefined,
      sha: getCardSfx("sha"),
      fire: getCardSfx("fire_sha"),
      thunder: getCardSfx("thunder_sha"),
    }[kind];
    if (src) {
      this.playOneShot(src, this.settings.sfxVolume);
      return;
    }
    const fallback = kind === "heal" ? "healMaster" : undefined;
    if (fallback) this.playAnnouncer(fallback);
  }

  playDamage() {
    this.playOneShot(resolveAssetUrl("assets/audio/sfx/damage.mp3"), this.settings.sfxVolume);
  }

  playHeal() {
    this.playOneShot(resolveAssetUrl("assets/audio/sfx/heal.mp3"), this.settings.sfxVolume);
  }

  playEquip() {
    this.playOneShot(resolveAssetUrl("assets/audio/sfx/equip.mp3"), this.settings.sfxVolume);
  }

  playAnnouncer(kind: keyof typeof ANNOUNCERS) {
    this.playOneShot(ANNOUNCERS[kind], this.settings.announcerVolume);
  }

  private nextTrackId(): string {
    const tracks = getBgmTracks();
    const index = Math.max(0, tracks.findIndex((track) => track.id === this.trackId()));
    return (tracks[(index + 1) % tracks.length] ?? tracks[0]).id;
  }

  private applyBgmVolume() {
    if (!this.bgm) return;
    this.bgm.volume = this.effectiveVolume(this.settings.bgmVolume);
    this.bgm.muted = this.settings.muted;
  }

  private playOneShot(src: string, categoryVolume: number) {
    if (this.settings.muted) return;
    const audio = new Audio(src);
    audio.volume = this.effectiveVolume(categoryVolume);
    void audio.play().catch((error) => console.warn("Audio playback failed", error));
  }

  private effectiveVolume(categoryVolume: number): number {
    if (this.settings.muted) return 0;
    return clampVolume(this.settings.masterVolume) * clampVolume(categoryVolume);
  }
}

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.8));
}
