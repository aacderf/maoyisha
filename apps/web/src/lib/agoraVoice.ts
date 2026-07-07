import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type IRemoteAudioTrack,
  type IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";
import { cloudbaseApp } from "./cloudbaseAuth.js";
import { ensureMicrophonePermission } from "./platform.js";

// Voice credentials come from CloudBase at runtime. Never place the Agora certificate in this client module.

export type AgoraVoiceStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

export type AgoraVoiceSnapshot = {
  status: AgoraVoiceStatus;
  microphoneOn: boolean;
  remoteUserCount: number;
  autoplayBlocked?: boolean;
  error?: string;
};

type AgoraTokenResult = {
  appId: string;
  token: string;
  channel: string;
  rtcUid: string;
  expiresAt: number;
};

type CloudFunctionClient = typeof cloudbaseApp & {
  callFunction(options: { name: string; data?: Record<string, unknown> }): Promise<{ result?: unknown }>;
};

export class AgoraVoiceManager {
  private client: IAgoraRTCClient;
  private localTrack?: ILocalAudioTrack;
  private remoteTracks = new Map<string, IRemoteAudioTrack>();
  private roomCode = "";
  private voiceScope: "public" | "wolves" = "public";
  private volume = 0.8;
  private joined = false;
  private disposed = false;
  private desiredMicrophoneOn = false;
  private operation: Promise<unknown> = Promise.resolve();
  private tokenRefresh?: Promise<AgoraTokenResult>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private generation = 0;
  private snapshot: AgoraVoiceSnapshot = { status: "idle", microphoneOn: false, remoteUserCount: 0 };
  private readonly listeners = new Set<(snapshot: AgoraVoiceSnapshot) => void>();

  constructor() {
    this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    this.client.on("user-published", this.handleUserPublished);
    this.client.on("user-unpublished", this.handleUserUnpublished);
    this.client.on("user-left", this.handleUserLeft);
    this.client.on("connection-state-change", this.handleConnectionStateChange);
    this.client.on("token-privilege-will-expire", this.handleTokenWillExpire);
    this.client.on("token-privilege-did-expire", this.handleTokenDidExpire);
    AgoraRTC.on("autoplay-failed", this.handleAutoplayFailed);
    document.addEventListener("maoyi:app-pause", this.handleAppPause);
    document.addEventListener("maoyi:app-resume", this.handleAppResume);
  }

  subscribe(listener: (snapshot: AgoraVoiceSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async join(roomCode: string, voiceScope: "public" | "wolves" = "public"): Promise<void> {
    const normalized = normalizeRoomCode(roomCode);
    if (!normalized) throw new Error("语音房间号无效。");
    return this.runExclusive(async () => {
      if (this.joined && this.roomCode === normalized && this.voiceScope === voiceScope) return;
      if (this.joined) await this.leaveCurrentChannel();
      this.roomCode = normalized;
      this.voiceScope = voiceScope;
      this.disposed = false;
      this.generation += 1;
      this.update({ status: "connecting", error: undefined });
      await this.joinChannel(false);
    });
  }

  async toggleMicrophone(): Promise<boolean> {
    return this.runExclusive(async () => {
      if (!this.joined) throw new Error("语音频道尚未连接。");
      if (!this.localTrack) {
        await ensureMicrophonePermission();
        const track = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: "speech_standard" });
        try {
          await this.client.publish(track);
          this.localTrack = track;
        } catch (error) {
          track.stop();
          track.close();
          throw error;
        }
        this.update({ microphoneOn: true, error: undefined });
        this.desiredMicrophoneOn = true;
        return true;
      }
      const microphoneOn = !this.snapshot.microphoneOn;
      await this.localTrack.setMuted(!microphoneOn);
      this.desiredMicrophoneOn = microphoneOn;
      this.update({ microphoneOn, error: undefined });
      return microphoneOn;
    });
  }

  resumePlayback(): void {
    AgoraRTC.resumeAudioContext();
    for (const track of this.remoteTracks.values()) track.play();
    this.update({ autoplayBlocked: false, error: undefined });
  }

  setRemoteVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    const sdkVolume = Math.round(this.volume * 100);
    for (const track of this.remoteTracks.values()) track.setVolume(sdkVolume);
  }

  async leave(): Promise<void> {
    this.disposed = true;
    this.generation += 1;
    this.clearReconnectTimer();
    return this.runExclusive(async () => {
      await this.leaveCurrentChannel();
      this.update({ status: "idle", microphoneOn: false, remoteUserCount: 0, autoplayBlocked: false, error: undefined });
    });
  }

  dispose(): void {
    void this.leave().finally(() => this.listeners.clear());
    AgoraRTC.off("autoplay-failed", this.handleAutoplayFailed);
    document.removeEventListener("maoyi:app-pause", this.handleAppPause);
    document.removeEventListener("maoyi:app-resume", this.handleAppResume);
    this.client.removeAllListeners();
  }

  private update(patch: Partial<AgoraVoiceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video" | "datachannel") => {
    if (mediaType !== "audio" || this.disposed) return;
    try {
      await this.client.subscribe(user, "audio");
      if (!user.audioTrack) return;
      user.audioTrack.setVolume(Math.round(this.volume * 100));
      user.audioTrack.play();
      this.remoteTracks.set(String(user.uid), user.audioTrack);
      this.update({ remoteUserCount: this.remoteTracks.size });
    } catch (error) {
      this.update({ error: normalizeVoiceError(error) });
    }
  };

  private handleUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video" | "datachannel") => {
    if (mediaType !== "audio") return;
    this.removeRemoteTrack(user);
  };

  private handleUserLeft = (user: IAgoraRTCRemoteUser) => this.removeRemoteTrack(user);

  private removeRemoteTrack(user: IAgoraRTCRemoteUser): void {
    const key = String(user.uid);
    this.remoteTracks.get(key)?.stop();
    this.remoteTracks.delete(key);
    this.update({ remoteUserCount: this.remoteTracks.size });
  }

  private handleConnectionStateChange = (current: string) => {
    if (this.disposed) return;
    if (current === "CONNECTED") {
      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
      this.update({ status: "connected", error: undefined });
    }
    else if (current === "RECONNECTING" || current === "CONNECTING") this.update({ status: "reconnecting" });
    else if (current === "DISCONNECTED") {
      this.joined = false;
      this.update({ status: "reconnecting", microphoneOn: false, error: "语音连接已断开，正在重连。" });
      this.scheduleReconnect();
    }
  };

  private handleTokenWillExpire = async () => {
    try {
      const credentials = await this.refreshToken();
      await this.client.renewToken(credentials.token);
    } catch (error) {
      this.update({ error: normalizeVoiceError(error) });
    }
  };

  private handleTokenDidExpire = async () => {
    if (!this.roomCode || this.disposed) return;
    this.scheduleReconnect(0);
  };

  private handleAutoplayFailed = () => {
    if (!this.disposed) this.update({ autoplayBlocked: true, error: "系统阻止了语音自动播放，请点击恢复声音。" });
  };

  private handleAppPause = () => {
    this.desiredMicrophoneOn = false;
    void this.runExclusive(async () => {
      if (!this.joined) return;
      await this.leaveCurrentChannel();
      this.update({ status: "idle", microphoneOn: false, error: undefined });
    });
  };

  private handleAppResume = () => {
    if (this.disposed || !this.roomCode || this.joined) return;
    this.scheduleReconnect(0);
  };

  private async joinChannel(restoreMicrophone: boolean): Promise<void> {
    const generation = this.generation;
    const credentials = await this.refreshToken();
    if (this.disposed || generation !== this.generation) return;
    await this.client.join(credentials.appId, credentials.channel, credentials.token, credentials.rtcUid);
    if (this.disposed || generation !== this.generation) {
      await this.client.leave().catch(() => undefined);
      return;
    }
    this.joined = true;
    if (restoreMicrophone && this.localTrack) {
      await this.localTrack.setMuted(false);
      await this.client.publish(this.localTrack);
    }
    this.update({ status: "connected", microphoneOn: restoreMicrophone && Boolean(this.localTrack), error: undefined });
  }

  private refreshToken(): Promise<AgoraTokenResult> {
    if (!this.tokenRefresh) {
      this.tokenRefresh = requestAgoraToken(this.roomCode, this.voiceScope).finally(() => {
        this.tokenRefresh = undefined;
      });
    }
    return this.tokenRefresh;
  }

  private scheduleReconnect(delay?: number): void {
    if (this.disposed || !this.roomCode || this.reconnectTimer) return;
    const delays = [0, 1000, 2000, 5000, 10000];
    const wait = delay ?? delays[Math.min(this.reconnectAttempt, delays.length - 1)]!;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      const restoreMicrophone = this.desiredMicrophoneOn;
      this.reconnectAttempt += 1;
      void this.runExclusive(async () => {
        if (this.disposed || this.joined) return;
        await this.client.leave().catch(() => undefined);
        try {
          await this.joinChannel(restoreMicrophone);
        } catch (error) {
          this.update({ status: "reconnecting", microphoneOn: false, error: normalizeVoiceError(error) });
          this.scheduleReconnect();
        }
      });
    }, wait);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operation.then(operation, operation);
    this.operation = queued.catch(() => undefined);
    return queued;
  }

  private async leaveCurrentChannel(): Promise<void> {
    this.joined = false;
    this.desiredMicrophoneOn = false;
    if (this.localTrack) {
      this.localTrack.stop();
      this.localTrack.close();
      this.localTrack = undefined;
    }
    for (const track of this.remoteTracks.values()) track.stop();
    this.remoteTracks.clear();
    await this.client.leave().catch(() => undefined);
  }
}

async function requestAgoraToken(
  roomCode: string,
  voiceScope: "public" | "wolves"
): Promise<AgoraTokenResult> {
  const response = await (cloudbaseApp as CloudFunctionClient).callFunction({
    name: "getAgoraRtcToken",
    data: { roomCode, voiceScope },
  });
  const source = (response.result ?? {}) as Partial<AgoraTokenResult> & { data?: Partial<AgoraTokenResult> };
  const result = source.data ?? source;
  if (!result.appId || !result.token || !result.channel || !result.rtcUid) {
    throw new Error("语音 Token 云函数返回数据不完整。");
  }
  return result as AgoraTokenResult;
}

function normalizeRoomCode(value: string): string {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

function normalizeVoiceError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (lower.includes("not exist") || lower.includes("not found") || lower.includes("function")) {
    return "语音 Token 云函数未部署或不可访问。";
  }
  if (lower.includes("permission") || lower.includes("notallowed") || lower.includes("denied")) {
    return "麦克风权限被拒绝，请在系统设置中允许茂一杀使用麦克风。";
  }
  if (lower.includes("token") || lower.includes("certificate") || lower.includes("appid")) {
    return "声网语音鉴权失败，请检查云函数环境变量。";
  }
  return raw || "语音连接失败。";
}
