import PhotonModule from "photon-realtime";

// Network recovery boundary: intentional leave suppresses late snapshots; disconnect keeps the seat record for rejoin.
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type CharacterDefinition,
  type GameAction,
  type GameTimerSettings,
  type GameState,
  type PlayerIdentity,
  type RoomSeat,
  type RoomSnapshot,
  type WerewolfAction,
  type WerewolfModeratorState,
  type WerewolfPrivateState,
  type WerewolfPublicState,
} from "@cardgame/shared";
import {
  LAST_ROOM_KEY,
  PHOTON_APP_ID,
  PHOTON_APP_VERSION,
  PHOTON_CHINA_NAME_SERVER,
  PHOTON_REGION,
  PROTOCOL_VERSION,
} from "../config/appConfig.js";
import { getRulesRuntime, getRulesRuntimeInfo } from "./rulesRuntime.js";
import {
  PHOTON_JOIN_GAME_OPERATION,
  PLAYER_TTL_MS,
  PhotonJoinError,
  RECONNECT_DELAYS_MS,
  RECONNECT_WATCHDOG_MS,
  ROOM_TTL_MS,
  canStartReconnect,
  decideJoinFailure,
  isReconnectCallbackCurrent,
  shouldReconnectAfterPhotonError,
  type RecoveryJoinMode,
} from "./reconnectPolicy.js";
import {
  RECOVERY_RECORD_VERSION,
  parseLastRoomRecoveryRecord,
  type LastRoomRecoveryRecord,
} from "./recoveryRecord.js";
import { persistentStorage } from "./persistentStorage.js";

const localStorage = persistentStorage;

const Photon = PhotonModule as any;
installNativeWebSocket();
const LBC = Photon.LoadBalancing.LoadBalancingClient;

export { PLAYER_TTL_MS, ROOM_TTL_MS };
const GAME_STATE_PROP = "cg_game_state";
const GAME_KIND_PROP = "cg_game_kind";
const WEREWOLF_PUBLIC_PROP = "cg_werewolf_public";
const ROOM_STATUS_PROP = "cg_status";
const ROOM_PROTOCOL_PROP = "cg_protocol_version";
const ROOM_LOGIC_VERSION_PROP = "cg_logic_version";
const ROOM_LOGIC_MD5_PROP = "cg_logic_md5";
const ROOM_SEATS_PROP = "cg_seat_registry";
const LOBBY_PROPS = [
  ROOM_STATUS_PROP,
  ROOM_PROTOCOL_PROP,
  ROOM_LOGIC_VERSION_PROP,
  ROOM_LOGIC_MD5_PROP,
  GAME_KIND_PROP,
  ROOM_SEATS_PROP,
];
const OP_TIMEOUT_MS = 12_000;

const EventCode = {
  RoomReady: 11,
  GameStart: 21,
  GameAction: 22,
  GameSnapshot: 23,
  ChatMessage: 31,
  TableGift: 32,
  WerewolfActionSubmit: 41,
  WerewolfPublicSnapshot: 42,
  WerewolfPrivateSnapshot: 43,
  WerewolfRoleAssignment: 44,
  WerewolfPhaseChanged: 45,
  WerewolfSystemMessage: 46,
  WerewolfModeratorBackup: 47,
  WerewolfWolfChat: 48,
  WerewolfPrivateRequest: 49,
} as const;

export type PhotonStatus = {
  ready: boolean;
  message: string;
  connection?: ReconnectState;
  attempt?: number;
  roomCode?: string;
};

export type NetworkDiagnostic = {
  timestamp: number;
  event: string;
  state: ReconnectState;
  attempt: number;
  roomCode?: string;
  errorCode?: number;
  operationCode?: number;
  detail?: string;
};

export type PhotonChatMessage = {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
};

export type PhotonTableGift = {
  id: string;
  roomId: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toSeatId: string;
  giftType: "egg" | "flower";
  sentAt: number;
};

export type PhotonWerewolfWolfMessage = {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
};

type PhotonCallbacks = {
  onStatus: (status: PhotonStatus) => void;
  onRooms: (rooms: RoomSnapshot[]) => void;
  onRoom: (room: RoomSnapshot) => void;
  onGame: (game: GameState) => void;
  onEventLog: (events: string[]) => void;
  onChatMessage: (message: PhotonChatMessage) => void;
  onTableGift: (gift: PhotonTableGift) => void;
  onWerewolfPublic: (state: WerewolfPublicState) => void;
  onWerewolfPrivate: (state: WerewolfPrivateState) => void;
  onWerewolfWolfMessage: (message: PhotonWerewolfWolfMessage) => void;
  onError: (message: string) => void;
  onDiagnostic?: (entry: NetworkDiagnostic) => void;
};

type PendingOperation<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: number;
};

type PendingLeave = {
  promise: Promise<RoomSnapshot>;
  resolve: (snapshot: RoomSnapshot) => void;
  snapshot: RoomSnapshot;
  timeout: number;
};

type PhotonEnvelope<T> = {
  roomCode: string;
  userId: string;
  actorNr: number;
  sessionId?: string;
  seq: number;
  payload: T;
};

export type ReconnectState = "connected" | "reconnecting" | "rejoining" | "leaving" | "failed";
type ReconnectSignal =
  | { type: "request"; preserveRoom: boolean; immediate?: boolean; delayMs?: number; reason?: string }
  | { type: "join-failure"; errorCode: number; errorMessage: string; operationCode: number }
  | { type: "joined" }
  | { type: "cancel" };
type ManagedRoomTransition = "leaving" | "joining" | "recovering" | "";

export class PhotonGameClient {
  private readonly client: any;
  private readonly seenSeqByUser = new Map<string, number>();
  private readonly sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  private seq = 0;
  private room?: RoomSnapshot;
  private game?: GameState;
  private werewolfModerator?: WerewolfModeratorState;
  private werewolfPublic?: WerewolfPublicState;
  private werewolfPrivate?: WerewolfPrivateState;
  private werewolfBackup?: WerewolfModeratorState;
  private pendingJoin?: PendingOperation<RoomSnapshot>;
  private pendingAction?: PendingOperation<GameState>;
  private attemptedRejoin = false;
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: number;
  private reconnectWatchdogTimer?: number;
  private pendingLeave?: PendingLeave;
  private suppressRoomCallbacks = false;
  private rejoinRoomCode = "";
  private rejoinFallbackAttempted = false;
  private forceNormalJoin = false;
  private reconnectInFlight = false;
  private reconnectGeneration = 0;
  private reconnectState: ReconnectState = "connected";
  private autoRejoinRequested = false;
  private recoveryJoinMode: RecoveryJoinMode = "rejoin";
  private activeActorRetryCount = 0;
  private pendingRecovery?: PendingOperation<RoomSnapshot>;
  private recoveryCancelled = false;
  private joinTargetRoomCode = "";
  private roomSwitchInProgress = false;

  constructor(
    private identity: PlayerIdentity,
    private readonly callbacks: PhotonCallbacks
  ) {
    installNativeWebSocket();
    this.client = new LBC(Photon.ConnectionProtocol.Wss, PHOTON_APP_ID, PHOTON_APP_VERSION);
    this.client.setNameServerAddress?.(PHOTON_CHINA_NAME_SERVER);
    this.client.setLogLevel?.(Photon.Logger?.Level?.ERROR ?? 1);
    this.client.setUserId(identity.id);
    this.bindClientCallbacks();
  }

  connect() {
    this.intentionalDisconnect = false;
    this.autoRejoinRequested = false;
    this.reconnectInFlight = false;
    this.reconnectState = "reconnecting";
    this.clearReconnectTimer();
    this.clearReconnectWatchdog();
    this.callbacks.onStatus({ ready: false, message: "正在连接 Photon 中国区..." });
    installNativeWebSocket();
    Photon.setOnLoad(() => {
      try {
        this.client.connectToRegionMaster(PHOTON_REGION);
      } catch (error) {
        const message = normalizePhotonError(error, "Photon WebSocket 初始化失败，请重试连接。");
        console.error("[Photon] connect failed", error);
        this.callbacks.onError(message);
      }
    });
  }

  disconnect(options: { intentional?: boolean } = {}) {
    this.intentionalDisconnect = Boolean(options.intentional);
    if (this.intentionalDisconnect) {
      this.clearReconnectTimer();
      this.reconnectInFlight = false;
      this.autoRejoinRequested = false;
      this.reconnectState = "connected";
    }
    this.rejectPendingJoin("Photon 连接已断开。");
    this.rejectPendingAction("Photon 连接已断开。");
    this.client.disconnect?.();
  }

  manualReconnect(options: { preserveRoom?: boolean } = {}) {
    this.intentionalDisconnect = false;
    this.recoveryCancelled = false;
    this.handleReconnectSignal({
      type: "request",
      preserveRoom: Boolean(options.preserveRoom),
      immediate: true,
      reason: options.preserveRoom ? "手动恢复房间" : "手动重连",
    });
  }

  recoverLastRoom(): Promise<RoomSnapshot> {
    const record = readLastRoom();
    if (!record || record.userId !== this.identity.id) {
      return Promise.reject(new Error("没有可恢复的最近房间。"));
    }
    this.rejectPendingRecovery("新的恢复操作已开始。");
    const promise = new Promise<RoomSnapshot>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRecovery = undefined;
        reject(new Error(`恢复房间 ${record.roomCode} 超时，请手动重试。`));
      }, 45_000);
      this.pendingRecovery = { resolve, reject, timeout };
    });
    this.recoveryJoinMode = "rejoin";
    this.recoveryCancelled = false;
    this.forceNormalJoin = false;
    this.activeActorRetryCount = 0;
    this.handleReconnectSignal({
      type: "request",
      preserveRoom: true,
      immediate: true,
      reason: `恢复房间 ${record.roomCode}`,
    });
    return promise;
  }

  cancelReconnect() {
    this.handleReconnectSignal({ type: "cancel" });
  }

  updateIdentity(identity: PlayerIdentity) {
    this.identity = identity;
    try {
      this.client.setUserId(identity.id);
      if (this.client.myActor?.()) this.prepareLocalActor();
    } catch {
      // Actor properties can only be updated after Photon creates the local actor.
    }
  }

  isReady(): boolean {
    return this.client.isInLobby?.() || this.client.isJoinedToRoom?.();
  }

  canModerateWerewolf(): boolean {
    return this.isLocalMasterClient();
  }

  refreshRooms() {
    this.callbacks.onRooms(this.buildLobbyRooms());
  }

  async createOrJoinRoom(
    inputRoomCode: string,
    maxPlayers: number,
    gameKind: "card" | "werewolf" = "card"
  ): Promise<RoomSnapshot> {
    this.ensureLobbyReady();
    this.recoveryCancelled = false;
    const roomCode = normalizeRoomCode(inputRoomCode || generateRoomCode());
    const playerLimit =
      gameKind === "werewolf"
        ? Math.max(5, clampPlayerCount(maxPlayers))
        : clampPlayerCount(maxPlayers);
    this.prepareLocalActor(false);
    this.joinTargetRoomCode = roomCode;
    this.roomSwitchInProgress = true;
    this.recoveryJoinMode = "normal";
    const roomOptions = {
      isVisible: true,
      isOpen: true,
      maxPlayers: playerLimit,
      playerTTL: PLAYER_TTL_MS,
      roomTTL: ROOM_TTL_MS,
      customGameProperties: {
        [ROOM_STATUS_PROP]: "waiting",
        [ROOM_PROTOCOL_PROP]: currentProtocolVersion(),
        [ROOM_LOGIC_VERSION_PROP]: getRulesRuntimeInfo().logicVersion,
        [ROOM_LOGIC_MD5_PROP]: getRulesRuntimeInfo().logicMd5,
        [GAME_KIND_PROP]: gameKind,
        [ROOM_SEATS_PROP]: "[]",
      },
      propsListedInLobby: LOBBY_PROPS,
    };
    this.client.joinRoom(roomCode, { createIfNotExists: true }, roomOptions);
    const snapshot = await this.waitForJoin(roomCode);
    if (snapshot.gameKind !== gameKind) {
      await this.leaveRoom({ intentional: true });
      throw new Error(snapshot.gameKind === "werewolf" ? "该房间号已用于狼人杀。" : "该房间号已用于卡牌局。");
    }
    return snapshot;
  }

  async joinRoom(inputRoomCode: string): Promise<RoomSnapshot> {
    this.ensureLobbyReady();
    this.recoveryCancelled = false;
    const roomCode = normalizeRoomCode(inputRoomCode);
    this.prepareLocalActor(false);
    this.joinTargetRoomCode = roomCode;
    this.roomSwitchInProgress = true;
    this.recoveryJoinMode = "normal";
    this.client.joinRoom(roomCode, { createIfNotExists: false });
    return this.waitForJoin(roomCode);
  }

  async setReady(ready: boolean, characterId?: string): Promise<RoomSnapshot> {
    this.ensureInRoom();
    this.prepareLocalActor(ready, characterId);
    const snapshot = this.emitRoomSnapshot();
    this.raise(EventCode.RoomReady, { ready, characterId });
    return snapshot;
  }

  async startGame(characters: CharacterDefinition[], timerSettings?: Partial<GameTimerSettings>): Promise<GameState> {
    this.ensureInRoom();
    const snapshot = this.buildRoomSnapshot();
    if (snapshot.gameKind === "werewolf") throw new Error("当前房间是狼人杀模式。");
    if (snapshot.seats.length < MIN_PLAYERS) {
      throw new Error(`至少需要 ${MIN_PLAYERS} 名玩家。`);
    }
    if (snapshot.seats.length > MAX_PLAYERS) {
      throw new Error(`最多支持 ${MAX_PLAYERS} 名玩家。`);
    }
    if (snapshot.seats.some((seat) => !seat.ready)) {
      throw new Error("还有玩家未准备。");
    }

    const game = getRulesRuntime().createGame({
      roomId: snapshot.id,
      players: snapshot.seats.map((seat) => ({
        playerId: seat.playerId,
        playerName: seat.playerName,
        characterId: seat.characterId,
      })),
      characters,
      seed: `${snapshot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timerSettings,
    });

    this.game = game;
    this.persistGame("playing");
    this.raise(EventCode.GameStart, { game });
    this.emitGame(game, ["对局开始。"]);
    return game;
  }

  startWerewolfGame(): WerewolfPublicState {
    this.ensureInRoom();
    const snapshot = this.buildRoomSnapshot();
    if (snapshot.gameKind !== "werewolf") throw new Error("当前房间不是狼人杀模式。");
    if (!this.isLocalMasterClient()) throw new Error("只有房间主控可以开始狼人杀。");
    if (snapshot.seats.length < 5 || snapshot.seats.length > 8) {
      throw new Error("狼人杀仅支持 5-8 人。");
    }
    if (snapshot.seats.some((seat) => !seat.ready || !seat.connected)) {
      throw new Error("所有玩家在线并准备后才能开始。");
    }
    this.werewolfModerator = getRulesRuntime().createWerewolfGame({
      roomId: snapshot.id,
      players: snapshot.seats.map((seat) => ({
        seatId: seat.seatId,
        playerId: seat.playerId,
        playerName: seat.playerName,
      })),
      seed: `${snapshot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    this.client.myRoom().setIsOpen(false);
    this.publishWerewolfState(["狼人杀对局开始，请私下查看身份。"], true);
    return getRulesRuntime().getWerewolfPublicState(this.werewolfModerator);
  }

  sendWerewolfAction(action: WerewolfAction): WerewolfPublicState | undefined {
    this.ensureInRoom();
    if (this.buildRoomSnapshot().gameKind !== "werewolf") throw new Error("当前房间不是狼人杀模式。");
    if (action.type !== "AUTO_TIMEOUT" && "playerId" in action && action.playerId !== this.identity.id) {
      throw new Error("只能提交自己的狼人杀操作。");
    }
    if (this.isLocalMasterClient()) {
      this.applyWerewolfActionAsModerator(action, this.identity.id);
    } else {
      this.raise(
        EventCode.WerewolfActionSubmit,
        { action },
        Photon.LoadBalancing.Constants.ReceiverGroup.MasterClient
      );
    }
    return this.werewolfPublic;
  }

  sendWerewolfWolfMessage(text: string): PhotonWerewolfWolfMessage {
    this.ensureInRoom();
    if (!this.werewolfPrivate || this.werewolfPrivate.role !== "werewolf") {
      throw new Error("只有狼人能使用狼队私聊。");
    }
    const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!cleanText) throw new Error("请输入狼队消息。");
    const message: PhotonWerewolfWolfMessage = {
      id: `${this.identity.id}-wolf-${Date.now()}-${++this.seq}`,
      roomId: this.client.myRoom().name,
      playerId: this.identity.id,
      playerName: this.identity.name,
      text: cleanText,
      sentAt: Date.now(),
    };
    const wolfSeatIds = new Set([
      this.werewolfPrivate.seatId,
      ...this.werewolfPrivate.wolfTeammateSeatIds,
    ]);
    const wolfPlayerIds = new Set(
      this.werewolfPublic?.players
        .filter((player) => wolfSeatIds.has(player.seatId))
        .map((player) => player.playerId) ?? []
    );
    const targetActors = (this.client.myRoomActorsArray?.() ?? [])
      .filter((actor: any) => wolfPlayerIds.has(actorPlayerId(actor)))
      .filter((actor: any) => actorPlayerId(actor) !== this.identity.id)
      .map((actor: any) => Number(actor.actorNr));
    this.callbacks.onWerewolfWolfMessage(message);
    if (targetActors.length) {
      this.raiseToActors(EventCode.WerewolfWolfChat, { message }, targetActors);
    }
    return message;
  }

  async sendAction(action: GameAction): Promise<GameState> {
    this.ensureInRoom();
    if (action.type === "AUTO_TIMEOUT" && action.playerId !== this.identity.id) {
      if (!this.game) throw new Error("对局还未开始。");
      getRulesRuntime().applyGameAction(this.game, action);
      this.raise(EventCode.GameAction, { action });
      return this.waitForAction();
    }
    if (!this.game) throw new Error("对局还未开始。");
    if (action.playerId !== this.identity.id) throw new Error("只能提交自己的操作。");
    getRulesRuntime().applyGameAction(this.game, action);

    this.raise(EventCode.GameAction, { action });
    return this.waitForAction();
  }

  sendChatMessage(text: string): PhotonChatMessage {
    this.ensureInRoom();
    const cleanText = text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!cleanText) throw new Error("请输入聊天内容。");
    const message: PhotonChatMessage = {
      id: `${this.identity.id}-${Date.now()}-${++this.seq}`,
      roomId: this.client.myRoom().name,
      playerId: this.identity.id,
      playerName: this.identity.name,
      text: cleanText,
      sentAt: Date.now(),
    };
    this.callbacks.onChatMessage(message);
    this.raise(EventCode.ChatMessage, { message }, Photon.LoadBalancing.Constants.ReceiverGroup.Others);
    return message;
  }

  private emitSystemChat(text: string) {
    if (!this.client.isJoinedToRoom?.()) return;
    const message: PhotonChatMessage = {
      id: `system-${Date.now()}-${++this.seq}`,
      roomId: this.client.myRoom().name,
      playerId: "system",
      playerName: "系统",
      text,
      sentAt: Date.now(),
    };
    this.callbacks.onChatMessage(message);
    this.callbacks.onEventLog([text]);
    this.raise(EventCode.ChatMessage, { message }, Photon.LoadBalancing.Constants.ReceiverGroup.Others);
  }

  sendTableGift(toSeatId: string, giftType: "egg" | "flower"): PhotonTableGift {
    this.ensureInRoom();
    const gift: PhotonTableGift = {
      id: `${this.identity.id}-gift-${Date.now()}-${++this.seq}`,
      roomId: this.client.myRoom().name,
      fromPlayerId: this.identity.id,
      fromPlayerName: this.identity.name,
      toSeatId,
      giftType,
      sentAt: Date.now(),
    };
    this.callbacks.onTableGift(gift);
    this.raise(EventCode.TableGift, { gift }, Photon.LoadBalancing.Constants.ReceiverGroup.Others);
    return gift;
  }

  leaveRoom(options: { intentional?: boolean } = { intentional: true }): Promise<RoomSnapshot> {
    if (this.pendingLeave) return this.pendingLeave.promise;
    this.reconnectState = "leaving";
    this.reconnectInFlight = false;
    this.autoRejoinRequested = false;
    this.rejoinRoomCode = "";
    this.joinTargetRoomCode = "";
    this.roomSwitchInProgress = false;
    this.attemptedRejoin = false;
    this.forceNormalJoin = false;
    this.clearReconnectTimer();
    this.clearReconnectWatchdog();
    this.callbacks.onStatus({ ready: true, message: "正在返回 Photon 大厅...", connection: "connected" });
    if (options.intentional) {
      this.hideWerewolfWaitingRoomBeforeLeave();
      this.emitSystemChat(`${this.identity.name} 退出房间。`);
      this.clearLastRoom();
    }
    const snapshot = this.room ?? this.buildRoomSnapshot();
    this.suppressRoomCallbacks = true;
    let resolveLeave!: (value: RoomSnapshot) => void;
    const promise = new Promise<RoomSnapshot>((resolve) => {
      resolveLeave = resolve;
    });
    const timeout = window.setTimeout(() => this.completeLeave(), 3_000);
    this.pendingLeave = { promise, resolve: resolveLeave, snapshot, timeout };
    this.game = undefined;
    this.werewolfModerator = undefined;
    this.werewolfPublic = undefined;
    this.werewolfPrivate = undefined;
    this.werewolfBackup = undefined;
    this.room = undefined;
    try {
      if (this.client.isJoinedToRoom?.()) this.client.leaveRoom?.();
      else this.completeLeave();
    } catch {
      this.completeLeave();
    }
    return promise;
  }

  private bindClientCallbacks() {
    this.client.onStateChange = (state: number) => {
      const stateName = LBC.StateToName?.(state) ?? String(state);
      this.emitDiagnostic("state-change", { detail: stateName });
      if (state === LBC.State.JoinedLobby) {
        this.roomSwitchInProgress = false;
        const completedLeave = Boolean(this.pendingLeave);
        if (completedLeave) this.completeLeave();
        this.callbacks.onRooms(this.buildLobbyRooms());
        if (completedLeave) return;
        if (this.autoRejoinRequested) {
          this.callbacks.onStatus({
            ready: false,
            message: `Photon 大厅已连接，正在恢复房间 ${readLastRoom()?.roomCode ?? ""}...`,
            connection: "rejoining",
            attempt: this.reconnectAttempt,
            roomCode: readLastRoom()?.roomCode,
          });
          this.tryRejoinLastRoom();
        } else {
          this.handleReconnectSignal({ type: "joined" });
          this.callbacks.onStatus({ ready: true, message: "Photon 中国区大厅已连接", connection: "connected" });
        }
      } else if (state === LBC.State.Joined) {
        this.roomSwitchInProgress = false;
        this.handleReconnectSignal({ type: "joined" });
        this.callbacks.onStatus({
          ready: true,
          message: `已进入 Photon 房间 ${this.client.myRoom().name}`,
          connection: "connected",
          roomCode: this.client.myRoom().name,
        });
      } else if (state === LBC.State.Error) {
        if (this.getManagedRoomTransition()) {
          this.emitDiagnostic("managed-transition-state-error-ignored", { detail: stateName });
          this.callbacks.onStatus(this.buildManagedTransitionStatus(stateName));
          return;
        }
        this.callbacks.onStatus({ ready: false, message: "Photon 连接异常。" });
        this.handleReconnectSignal({
          type: "request",
          preserveRoom: Boolean(this.room || readLastRoom()),
          reason: "Photon 状态异常",
        });
      } else {
        if (this.isExpectedRoomSwitchState(stateName)) {
          this.emitDiagnostic("room-switch-state", {
            detail: stateName,
            roomCode: this.joinTargetRoomCode || this.rejoinRoomCode,
          });
          this.callbacks.onStatus(this.buildManagedTransitionStatus(stateName));
          return;
        }
        this.callbacks.onStatus({ ready: false, message: `Photon：${stateName}` });
        if (/disconnect|error|closed|timeout/i.test(stateName)) {
          this.touchLastRoom();
          this.handleReconnectSignal({
            type: "request",
            preserveRoom: Boolean(this.room || readLastRoom()),
            reason: "Photon 连接中断",
          });
        }
      }
    };

    this.client.onError = (_code: number, message: string) => {
      const safeMessage = normalizePhotonError(message, "Photon 网络错误，请重试连接。");
      if (message && safeMessage !== message) console.error("[Photon] raw error", message);
      if (this.getManagedRoomTransition() === "leaving") {
        this.emitDiagnostic("leave-photon-error-ignored", { errorCode: _code, detail: safeMessage });
        this.callbacks.onStatus(this.buildManagedTransitionStatus("leave-error"));
        return;
      }
      this.callbacks.onError(safeMessage);
      this.rejectPendingJoin(safeMessage);
      this.rejectPendingAction(safeMessage);
      if (
        !shouldReconnectAfterPhotonError({
          errorCode: _code,
          message: safeMessage,
          preserveRoom: Boolean(this.room || readLastRoom()),
        }) ||
        this.intentionalDisconnect ||
        Boolean(this.pendingLeave)
      ) {
        this.emitDiagnostic("photon-error-no-reconnect", { errorCode: _code, detail: safeMessage });
        return;
      }
      this.handleReconnectSignal({
        type: "request",
        preserveRoom: Boolean(this.room || readLastRoom()),
        reason: "Photon 网络错误",
      });
    };

    this.client.onOperationResponse = (errorCode: number, errorMessage: string, operationCode: number) => {
      if (!errorCode) return;
      if (this.getManagedRoomTransition() === "leaving") {
        this.emitDiagnostic("leave-operation-error-ignored", { errorCode, operationCode, detail: errorMessage });
        return;
      }
      const inactiveNormalJoin =
        operationCode === PHOTON_JOIN_GAME_OPERATION &&
        errorCode === PhotonJoinError.JoinFailedFoundInactiveJoiner &&
        Boolean(this.joinTargetRoomCode);
      if (
        operationCode === PHOTON_JOIN_GAME_OPERATION &&
        (this.rejoinRoomCode || inactiveNormalJoin)
      ) {
        if (inactiveNormalJoin && !this.rejoinRoomCode) {
          this.rejoinRoomCode = this.joinTargetRoomCode;
          this.recoveryJoinMode = "normal";
          localStorage.setItem(
            LAST_ROOM_KEY,
            JSON.stringify({
              recordVersion: RECOVERY_RECORD_VERSION,
              roomCode: this.joinTargetRoomCode,
              userId: this.identity.id,
              gameKind: this.room?.gameKind ?? readLastRoom()?.gameKind ?? "card",
              status: this.room?.status ?? readLastRoom()?.status ?? "waiting",
              savedAt: Date.now(),
            } satisfies LastRoomRecoveryRecord)
          );
        }
        this.handleReconnectSignal({
          type: "join-failure",
          errorCode,
          errorMessage,
          operationCode,
        });
        return;
      }
      const message = normalizePhotonError(errorMessage, `Photon 操作失败：${errorCode}`);
      if (errorMessage && message !== errorMessage) console.error("[Photon] operation error", errorMessage);
      this.callbacks.onError(message);
      this.rejectPendingJoin(message);
      this.rejectPendingAction(message);
    };

    this.client.onRoomList = () => this.callbacks.onRooms(this.buildLobbyRooms());
    this.client.onRoomListUpdate = () => this.callbacks.onRooms(this.buildLobbyRooms());
    this.client.onActorJoin = (actor: any) => {
      if (this.suppressRoomCallbacks) return;
      this.emitRoomSnapshot();
      this.callbacks.onEventLog([`${actorDisplayName(actor)} 进入房间。`]);
    };
    this.client.onActorLeave = (actor: any) => {
      if (this.suppressRoomCallbacks) return;
      this.removeSeatFromRegistry(actorPlayerId(actor));
      this.emitRoomSnapshot();
      this.callbacks.onEventLog([`${actorDisplayName(actor)} 离开房间。`]);
    };
    this.client.onActorSuspend = (actor: any) => {
      if (this.suppressRoomCallbacks) return;
      this.emitRoomSnapshot();
      this.callbacks.onEventLog([`${actorDisplayName(actor)} 暂时断线，等待重连。`]);
    };
    this.client.onActorPropertiesChange = () => this.emitRoomSnapshot();
    this.client.onMyRoomPropertiesChange = () => {
      this.restoreGameFromRoomProperties();
      this.emitRoomSnapshot();
    };

    this.client.onJoinRoom = () => {
      if (this.recoveryCancelled) {
        this.emitDiagnostic("late-room-join-ignored");
        this.client.leaveRoom?.();
        return;
      }
      if (!this.ensureCurrentRoomProtocol()) return;
      const recovered = Boolean(this.rejoinRoomCode);
      this.suppressRoomCallbacks = false;
      this.rejoinRoomCode = "";
      this.joinTargetRoomCode = "";
      this.rejoinFallbackAttempted = false;
      this.forceNormalJoin = false;
      this.saveLastRoom();
      this.handleReconnectSignal({ type: "joined" });
      this.restoreGameFromRoomProperties();
      const snapshot = this.emitRoomSnapshot();
      this.resolvePendingJoin(snapshot);
      this.resolvePendingRecovery(snapshot);
      if (this.game) {
        this.callbacks.onGame(this.game);
      }
      if (recovered) this.emitSystemChat(`${this.identity.name} 已重新连接房间。`);
    };

    this.bindWerewolfRoomCallbacks();
    this.client.onEvent = (code: number, data: unknown) => this.handlePhotonEvent(code, data);
  }

  private bindWerewolfRoomCallbacks() {
    const previousActorJoin = this.client.onActorJoin;
    this.client.onActorJoin = (actor: any) => {
      previousActorJoin?.(actor);
      if (this.shouldSuppressRoomEvents()) return;
      if (!this.werewolfModerator || !this.isLocalMasterClient()) return;
      this.werewolfModerator = getRulesRuntime().setWerewolfPlayerConnected(
        this.werewolfModerator,
        actorPlayerId(actor),
        true
      );
      this.sendWerewolfPrivateStateToActor(actor);
      this.publishWerewolfState([`${actorDisplayName(actor)} 已回到狼人杀对局。`]);
    };

    const wrapDisconnect = (previous: ((actor: any) => void) | undefined) => (actor: any) => {
      previous?.(actor);
      if (this.shouldSuppressRoomEvents()) return;
      this.ensureWerewolfModeratorAuthority();
      if (this.werewolfModerator) {
        this.handleWerewolfActorConnection(actor, false);
        return;
      }
      // Photon may publish the new Master Client immediately after the leave callback.
      window.setTimeout(() => {
        this.ensureWerewolfModeratorAuthority();
        this.handleWerewolfActorConnection(actor, false);
      }, 120);
    };
    this.client.onActorLeave = wrapDisconnect(this.client.onActorLeave);
    this.client.onActorSuspend = wrapDisconnect(this.client.onActorSuspend);

    const previousRoomProperties = this.client.onMyRoomPropertiesChange;
    this.client.onMyRoomPropertiesChange = (...args: unknown[]) => {
      previousRoomProperties?.(...args);
      if (this.shouldSuppressRoomEvents()) return;
      this.restoreWerewolfPublicFromRoomProperties();
      this.ensureWerewolfModeratorAuthority();
    };

    const previousJoinRoom = this.client.onJoinRoom;
    this.client.onJoinRoom = (...args: unknown[]) => {
      previousJoinRoom?.(...args);
      if (this.shouldSuppressRoomEvents()) return;
      this.restoreWerewolfPublicFromRoomProperties();
      if (this.werewolfPublic) this.callbacks.onWerewolfPublic(this.werewolfPublic);
      this.ensureWerewolfModeratorAuthority();
      if (this.werewolfPublic && this.werewolfPublic.phase !== "finished") {
        this.requestWerewolfPrivateState();
        window.setTimeout(() => {
          if (!this.werewolfPrivate) this.requestWerewolfPrivateState();
        }, 800);
      }
    };
  }

  private handlePhotonEvent(code: number, data: unknown) {
    if (!this.client.isJoinedToRoom?.()) return;
    if (this.shouldSuppressRoomEvents()) return;
    const envelope = data as PhotonEnvelope<unknown>;
    if (!envelope || envelope.roomCode !== this.client.myRoom().name) return;
    if (!this.acceptSeq(envelope)) return;

    if (code === EventCode.RoomReady) {
      this.emitRoomSnapshot();
      return;
    }

    if (code === EventCode.WerewolfActionSubmit) {
      if (!this.isLocalMasterClient()) return;
      const payload = envelope.payload as { action: WerewolfAction };
      this.applyWerewolfActionAsModerator(payload.action, envelope.userId);
      return;
    }

    if (code === EventCode.WerewolfPrivateRequest) {
      if (!this.isLocalMasterClient() || !this.werewolfModerator) return;
      const actor = (this.client.myRoomActorsArray?.() ?? []).find(
        (candidate: any) =>
          Number(candidate.actorNr) === Number(envelope.actorNr) ||
          actorPlayerId(candidate) === envelope.userId
      );
      if (actor) this.sendWerewolfPrivateStateToActor(actor);
      return;
    }

    if (code === EventCode.WerewolfPublicSnapshot || code === EventCode.WerewolfPhaseChanged) {
      const payload = envelope.payload as { state: WerewolfPublicState };
      if (!payload.state) return;
      this.werewolfPublic = structuredClone(payload.state) as WerewolfPublicState;
      this.callbacks.onWerewolfPublic(this.werewolfPublic);
      this.emitRoomSnapshot();
      return;
    }

    if (code === EventCode.WerewolfPrivateSnapshot || code === EventCode.WerewolfRoleAssignment) {
      const payload = envelope.payload as { state: WerewolfPrivateState };
      if (!payload.state) return;
      this.werewolfPrivate = structuredClone(payload.state) as WerewolfPrivateState;
      this.callbacks.onWerewolfPrivate(this.werewolfPrivate);
      return;
    }

    if (code === EventCode.WerewolfModeratorBackup) {
      const payload = envelope.payload as { state: WerewolfModeratorState };
      if (payload.state) this.werewolfBackup = structuredClone(payload.state) as WerewolfModeratorState;
      return;
    }

    if (code === EventCode.WerewolfSystemMessage) {
      const payload = envelope.payload as { message: string };
      if (payload.message) this.callbacks.onEventLog([payload.message]);
      return;
    }

    if (code === EventCode.WerewolfWolfChat) {
      const payload = envelope.payload as { message: PhotonWerewolfWolfMessage };
      if (payload.message?.text) this.callbacks.onWerewolfWolfMessage(payload.message);
      return;
    }

    if (code === EventCode.GameStart) {
      const payload = envelope.payload as { game: GameState };
      this.game = structuredClone(payload.game) as GameState;
      if (envelope.userId === this.identity.id) {
        this.persistGame("playing");
      }
      this.emitGame(this.game, ["对局开始。"]);
      return;
    }

    if (code === EventCode.GameAction) {
      const payload = envelope.payload as { action: GameAction };
      this.applyRemoteAction(payload.action, envelope.userId);
      return;
    }

    if (code === EventCode.GameSnapshot) {
      const payload = envelope.payload as { game: GameState };
      this.game = structuredClone(payload.game) as GameState;
      this.emitGame(this.game, ["状态已同步。"]);
      return;
    }

    if (code === EventCode.ChatMessage) {
      const payload = envelope.payload as { message: PhotonChatMessage };
      if (payload.message?.text) this.callbacks.onChatMessage(payload.message);
      return;
    }

    if (code === EventCode.TableGift) {
      const payload = envelope.payload as { gift: PhotonTableGift };
      if (payload.gift?.toSeatId) this.callbacks.onTableGift(payload.gift);
    }
  }

  private applyRemoteAction(action: GameAction, senderUserId: string) {
    if (!this.game) {
      this.restoreGameFromRoomProperties();
    }
    if (!this.game) {
      this.callbacks.onError("缺少对局快照，无法应用操作。");
      return;
    }

    try {
      const result = getRulesRuntime().applyGameAction(this.game, action);
      this.game = result.state;
      const snapshot = this.buildRoomSnapshot();
      const controllerPlayerId = snapshot.seats.find((seat) => seat.connected)?.playerId ?? snapshot.hostPlayerId;
      if (senderUserId === this.identity.id || controllerPlayerId === this.identity.id) {
        this.persistGame(this.game.phase === "finished" ? "finished" : "playing");
      }
      if (senderUserId === this.identity.id) {
        this.resolvePendingAction(this.game);
      }
      this.emitGame(this.game, result.events);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作被拒绝。";
      if (senderUserId === this.identity.id) {
        this.rejectPendingAction(message);
      }
      this.callbacks.onError(message);
    }
  }

  private applyWerewolfActionAsModerator(action: WerewolfAction, senderUserId: string) {
    if (!this.werewolfModerator) {
      this.callbacks.onError("狼人杀主控状态不可用，无法处理操作。");
      return;
    }
    if (action.type !== "AUTO_TIMEOUT" && "playerId" in action && action.playerId !== senderUserId) {
      this.callbacks.onError("狼人杀操作身份校验失败。");
      return;
    }
    try {
      const result = getRulesRuntime().applyWerewolfAction(
        this.werewolfModerator,
        action
      );
      this.werewolfModerator = result.state;
      this.publishWerewolfState(result.events);
    } catch (error) {
      const message = error instanceof Error ? error.message : "狼人杀操作被拒绝。";
      this.callbacks.onError(message);
    }
  }

  private publishWerewolfState(events: string[], roleAssignment = false) {
    if (this.shouldSuppressRoomEvents()) return;
    if (!this.werewolfModerator || !this.client.isJoinedToRoom?.()) return;
    this.werewolfPublic = getRulesRuntime().getWerewolfPublicState(
      this.werewolfModerator
    );
    const room = this.client.myRoom();
    room.setCustomProperties({
      [ROOM_STATUS_PROP]: this.werewolfPublic.phase === "finished" ? "finished" : "playing",
      [GAME_KIND_PROP]: "werewolf",
      [WEREWOLF_PUBLIC_PROP]: JSON.stringify(this.werewolfPublic),
      [ROOM_PROTOCOL_PROP]: currentProtocolVersion(),
      [ROOM_LOGIC_VERSION_PROP]: getRulesRuntimeInfo().logicVersion,
      [ROOM_LOGIC_MD5_PROP]: getRulesRuntimeInfo().logicMd5,
    });
    this.callbacks.onWerewolfPublic(this.werewolfPublic);
    this.raise(
      roleAssignment ? EventCode.WerewolfPhaseChanged : EventCode.WerewolfPublicSnapshot,
      { state: this.werewolfPublic }
    );
    this.distributeWerewolfPrivateStates(roleAssignment);
    this.sendWerewolfModeratorBackup();
    for (const message of events) {
      this.callbacks.onEventLog([message]);
      this.raise(EventCode.WerewolfSystemMessage, { message });
    }
    this.emitRoomSnapshot();
    this.saveLastRoom();
  }

  private distributeWerewolfPrivateStates(roleAssignment: boolean) {
    if (!this.werewolfModerator || !this.isLocalMasterClient()) return;
    for (const actor of this.client.myRoomActorsArray?.() ?? []) {
      this.sendWerewolfPrivateStateToActor(actor, roleAssignment);
    }
  }

  private sendWerewolfPrivateStateToActor(actor: any, roleAssignment = false) {
    if (!this.werewolfModerator) return;
    const playerId = actorPlayerId(actor);
    const seat = this.werewolfModerator.publicState.players.find((item) => item.playerId === playerId);
    if (!seat) return;
    const state = getRulesRuntime().getWerewolfPrivateState(
      this.werewolfModerator,
      seat.seatId
    );
    if (playerId === this.identity.id) {
      this.werewolfPrivate = state;
      this.callbacks.onWerewolfPrivate(state);
      return;
    }
    this.raiseToActors(
      roleAssignment ? EventCode.WerewolfRoleAssignment : EventCode.WerewolfPrivateSnapshot,
      { state },
      [Number(actor.actorNr)]
    );
  }

  private requestWerewolfPrivateState() {
    if (!this.client.isJoinedToRoom?.()) return;
    if (this.isLocalMasterClient()) {
      if (this.werewolfModerator) {
        this.sendWerewolfPrivateStateToActor(this.client.myActor());
      }
      return;
    }
    this.raise(
      EventCode.WerewolfPrivateRequest,
      { playerId: this.identity.id },
      Photon.LoadBalancing.Constants.ReceiverGroup.MasterClient
    );
  }

  private sendWerewolfModeratorBackup() {
    if (!this.werewolfModerator || !this.isLocalMasterClient()) return;
    const actors = [...(this.client.myRoomActorsArray?.() ?? [])]
      .filter((actor: any) => Number(actor.actorNr) !== Number(this.client.myActor()?.actorNr))
      .filter((actor: any) => !actor.isSuspended?.())
      .sort((a: any, b: any) => Number(a.actorNr) - Number(b.actorNr));
    const backup = actors[0];
    if (!backup) return;
    this.raiseToActors(
      EventCode.WerewolfModeratorBackup,
      { state: this.werewolfModerator },
      [Number(backup.actorNr)]
    );
  }

  private handleWerewolfActorConnection(actor: any, connected: boolean) {
    if (!this.werewolfModerator || !this.isLocalMasterClient()) return;
    this.werewolfModerator = getRulesRuntime().setWerewolfPlayerConnected(
      this.werewolfModerator,
      actorPlayerId(actor),
      connected
    );
    this.publishWerewolfState([
      `${actorDisplayName(actor)} ${connected ? "已重新连接" : "暂时掉线，等待重连"}。`,
    ]);
  }

  private ensureWerewolfModeratorAuthority() {
    if (!this.client.isJoinedToRoom?.() || !this.isLocalMasterClient()) return;
    if (!this.werewolfModerator && this.werewolfBackup) {
      this.werewolfModerator = structuredClone(this.werewolfBackup) as WerewolfModeratorState;
      this.publishWerewolfState(["狼人杀主控已迁移，对局继续。"]);
    }
  }

  private restoreWerewolfPublicFromRoomProperties() {
    if (this.shouldSuppressRoomEvents()) return;
    if (!this.client.isJoinedToRoom?.()) return;
    const props = this.client.myRoom().getCustomProperties?.() ?? {};
    if (props[GAME_KIND_PROP] !== "werewolf") {
      this.werewolfPublic = undefined;
      this.werewolfPrivate = undefined;
      return;
    }
    const raw = props[WEREWOLF_PUBLIC_PROP];
    if (typeof raw !== "string" || !raw) return;
    try {
      this.werewolfPublic = JSON.parse(raw) as WerewolfPublicState;
      this.callbacks.onWerewolfPublic(this.werewolfPublic);
    } catch {
      this.callbacks.onError("Photon 狼人杀公开状态解析失败。");
    }
  }

  private shouldSuppressRoomEvents(): boolean {
    return this.suppressRoomCallbacks || Boolean(this.pendingLeave) || this.reconnectState === "leaving";
  }

  private hideWerewolfWaitingRoomBeforeLeave() {
    if (!this.client.isJoinedToRoom?.() || !this.isLocalMasterClient()) return;
    const room = this.client.myRoom();
    const props = room?.getCustomProperties?.() ?? {};
    const isWerewolf = props[GAME_KIND_PROP] === "werewolf" || this.room?.gameKind === "werewolf";
    const status = props[ROOM_STATUS_PROP] ?? this.room?.status;
    if (!isWerewolf || status === "playing") return;
    try {
      room.setIsOpen?.(false);
      room.setIsVisible?.(false);
      room.setCustomProperties?.({
        [ROOM_STATUS_PROP]: "finished",
        [GAME_KIND_PROP]: "werewolf",
        [ROOM_PROTOCOL_PROP]: currentProtocolVersion(),
        [ROOM_LOGIC_VERSION_PROP]: getRulesRuntimeInfo().logicVersion,
        [ROOM_LOGIC_MD5_PROP]: getRulesRuntimeInfo().logicMd5,
      });
      this.emitDiagnostic("werewolf-waiting-room-hidden", { detail: String(room.name ?? "") });
    } catch (error) {
      this.emitDiagnostic("werewolf-waiting-room-hide-failed", {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isLocalMasterClient(): boolean {
    const room = this.client.myRoom?.();
    const actor = this.client.myActor?.();
    return Boolean(room && actor && Number(room.masterClientId) === Number(actor.actorNr));
  }

  private raise<T>(code: number, payload: T, receivers = Photon.LoadBalancing.Constants.ReceiverGroup.All) {
    const envelope: PhotonEnvelope<T> = {
      roomCode: this.client.myRoom().name,
      userId: this.identity.id,
      actorNr: this.client.myActor().actorNr,
      sessionId: this.sessionId,
      seq: ++this.seq,
      payload,
    };
    this.client.raiseEvent(code, envelope, {
      receivers,
    });
  }

  private raiseToActors<T>(code: number, payload: T, targetActors: number[]) {
    const envelope: PhotonEnvelope<T> = {
      roomCode: this.client.myRoom().name,
      userId: this.identity.id,
      actorNr: this.client.myActor().actorNr,
      sessionId: this.sessionId,
      seq: ++this.seq,
      payload,
    };
    this.client.raiseEvent(code, envelope, { targetActors });
  }

  private prepareLocalActor(ready?: boolean, characterId?: string) {
    const actor = this.client.myActor();
    // Photon 消息转发逻辑：playerName 只写入 Photon Actor custom properties，用于房间内显示，不做云端持久化。
    const props: Record<string, string | boolean> = {
      playerId: this.identity.id,
      uid: this.identity.uid ?? "",
      playerName: this.identity.name,
    };
    if (typeof ready === "boolean") {
      props.ready = ready;
    }
    if (characterId !== undefined) {
      props.characterId = characterId;
    }
    actor.setName(this.identity.name);
    actor.setCustomProperties(props);
  }

  private buildRoomSnapshot(): RoomSnapshot {
    const photonRoom = this.client.myRoom?.();
    const actors = [...(this.client.myRoomActorsArray?.() ?? [])].sort((a, b) => a.actorNr - b.actorNr);
    const roomProps = photonRoom?.getCustomProperties?.() ?? {};
    const persistedSeats = parseSeatRegistry(roomProps[ROOM_SEATS_PROP]);
    const baseSeats: RoomSeat[] =
      persistedSeats.length > 0
        ? persistedSeats
        : this.room?.seats ??
      this.game?.seats.map((seat) => ({
        seatId: seat.seatId,
        playerId: seat.playerId,
        playerName: seat.playerName,
        ready: true,
        connected: false,
        characterId: seat.character.id,
      })) ??
      [];
    const seats: RoomSeat[] = baseSeats.map((seat) => ({ ...seat, connected: false }));
    actors.forEach((actor, index) => {
      const props = actor.getCustomProperties?.() ?? actor.customProperties ?? {};
      const playerId = String(props.playerId || actor.userId || `actor-${actor.actorNr}`);
      const existingIndex = seats.findIndex((seat) => seat.playerId === playerId);
      const seatIndex = existingIndex >= 0 ? existingIndex : seats.length;
      seats[seatIndex] = {
        seatId: seats[seatIndex]?.seatId ?? `seat-${seatIndex + 1}`,
        playerId: String(props.playerId || actor.userId || `actor-${actor.actorNr}`),
        playerName: String(props.playerName || actor.name || `玩家 ${actor.actorNr}`),
        ready: Boolean(props.ready),
        connected: !actor.isSuspended?.(),
        characterId: props.characterId ? String(props.characterId) : undefined,
      };
    });
    const customProps = roomProps;
    const masterActor = actors.find(
      (actor) => Number(actor.actorNr) === Number(photonRoom?.masterClientId)
    );
    const hostPlayerId =
      (masterActor ? actorPlayerId(masterActor) : undefined) ??
      seats.find((seat) => seat.connected)?.playerId ??
      "";
    const gameKind = customProps[GAME_KIND_PROP] === "werewolf" ? "werewolf" : "card";
    const statusFromProps = customProps[ROOM_STATUS_PROP] as RoomSnapshot["status"] | undefined;
    const status =
      this.werewolfPublic?.phase === "finished"
        ? "finished"
        : this.werewolfPublic
          ? "playing"
          : this.game?.phase === "finished"
        ? "finished"
        : this.game
          ? "playing"
          : statusFromProps === "playing" || statusFromProps === "finished"
            ? statusFromProps
            : "waiting";

    return {
      id: String(photonRoom?.name ?? ""),
      name: String(photonRoom?.name ?? ""),
      hostPlayerId,
      maxPlayers: clampPlayerCount(Number(photonRoom?.maxPlayers || MAX_PLAYERS)),
      seats,
      status,
      gameKind,
      game: this.game,
      werewolfPublic: this.werewolfPublic,
    };
  }

  private buildLobbyRooms(): RoomSnapshot[] {
    const rooms = this.client.availableRooms?.() ?? [];
    return rooms
      .filter((room: any) => {
        if (room.removed) return false;
        if (Number(room.playerCount || 0) <= 0) return false;
        if (readPhotonRoomBoolean(room, "isVisible", true) === false) return false;
        if (readPhotonRoomBoolean(room, "isOpen", true) === false) return false;
        const props = room.getCustomProperties?.() ?? {};
        if (props[ROOM_STATUS_PROP] === "finished") return false;
        return props[ROOM_PROTOCOL_PROP] === currentProtocolVersion() && props[ROOM_LOGIC_MD5_PROP] === getRulesRuntimeInfo().logicMd5;
      })
      .map((room: any) => {
        const props = room.getCustomProperties?.() ?? {};
        const playerCount = Number(room.playerCount || 0);
        return {
          id: String(room.name),
          name: String(room.name),
          hostPlayerId: "",
          maxPlayers: clampPlayerCount(Number(room.maxPlayers || MAX_PLAYERS)),
          seats: Array.from({ length: playerCount }, (_, index) => ({
            seatId: `seat-${index + 1}`,
            playerId: `placeholder-${index + 1}`,
            playerName: "玩家",
            ready: false,
            connected: true,
          })),
          status: props[ROOM_STATUS_PROP] === "playing" ? "playing" : "waiting",
          gameKind: props[GAME_KIND_PROP] === "werewolf" ? "werewolf" : "card",
        } satisfies RoomSnapshot;
      });
  }

  private emitRoomSnapshot(): RoomSnapshot {
    if (this.shouldSuppressRoomEvents()) return this.room ?? this.buildRoomSnapshot();
    this.room = this.buildRoomSnapshot();
    this.persistSeatRegistry(this.room.seats);
    this.callbacks.onRoom(this.room);
    return this.room;
  }

  private persistSeatRegistry(seats: RoomSeat[]) {
    if (!this.client.isJoinedToRoom?.()) return;
    const room = this.client.myRoom();
    const actor = this.client.myActor?.();
    if (room?.masterClientId && actor?.actorNr !== room.masterClientId) return;
    const stableSeats = seats.map((seat) => ({ ...seat, connected: false }));
    room.setCustomProperties({ [ROOM_SEATS_PROP]: JSON.stringify(stableSeats) });
  }

  private removeSeatFromRegistry(playerId: string) {
    if (!this.client.isJoinedToRoom?.() || !this.isLocalMasterClient()) return;
    const room = this.client.myRoom();
    const props = room.getCustomProperties?.() ?? {};
    // Active games keep the fixed seat registry so a player can reclaim the same seat after TTL.
    if (props[ROOM_STATUS_PROP] === "playing") return;
    const seats = parseSeatRegistry(props[ROOM_SEATS_PROP]).filter(
      (seat) => seat.playerId !== playerId
    );
    room.setCustomProperties({ [ROOM_SEATS_PROP]: JSON.stringify(seats) });
    if (this.room) {
      this.room = {
        ...this.room,
        seats: this.room.seats.filter((seat) => seat.playerId !== playerId),
      };
    }
  }

  private emitGame(game: GameState, events: string[]) {
    const status = game.phase === "finished" ? "finished" : "playing";
    this.room = { ...this.buildRoomSnapshot(), game, status };
    this.callbacks.onRoom(this.room);
    this.callbacks.onGame(game);
    if (events.length > 0) {
      this.callbacks.onEventLog(events);
    }
  }

  private persistGame(status: RoomSnapshot["status"]) {
    if (!this.client.isJoinedToRoom?.() || !this.game) return;
    const room = this.client.myRoom();
    room.setCustomProperties({
      [ROOM_STATUS_PROP]: status,
      [ROOM_PROTOCOL_PROP]: currentProtocolVersion(),
      [ROOM_LOGIC_VERSION_PROP]: getRulesRuntimeInfo().logicVersion,
      [ROOM_LOGIC_MD5_PROP]: getRulesRuntimeInfo().logicMd5,
      [GAME_KIND_PROP]: "card",
      [GAME_STATE_PROP]: JSON.stringify(this.game),
    });
    this.saveLastRoom();
  }

  private ensureCurrentRoomProtocol(): boolean {
    if (!this.client.isJoinedToRoom?.()) return false;
    const props = this.client.myRoom().getCustomProperties?.() ?? {};
    const protocol = props[ROOM_PROTOCOL_PROP];
    const logicMd5 = props[ROOM_LOGIC_MD5_PROP];
    const currentRules = getRulesRuntimeInfo();
    if (protocol === currentProtocolVersion() && logicMd5 === currentRules.logicMd5) return true;
    const message = `房间版本不一致：当前协议 ${currentProtocolVersion()} / 规则 ${currentRules.logicVersion}，房间协议 ${protocol ? String(protocol) : "未知"} / 规则 ${props[ROOM_LOGIC_VERSION_PROP] ? String(props[ROOM_LOGIC_VERSION_PROP]) : "未知"}。请所有玩家使用同一热更版本。`;
    this.callbacks.onError(message);
    this.rejectPendingJoin(message);
    this.clearLastRoom();
    this.client.leaveRoom?.();
    return false;
  }

  private restoreGameFromRoomProperties() {
    if (!this.client.isJoinedToRoom?.()) return;
    const props = this.client.myRoom().getCustomProperties?.() ?? {};
    if (props[GAME_KIND_PROP] === "werewolf") {
      this.game = undefined;
      return;
    }
    const raw = props[GAME_STATE_PROP];
    if (typeof raw !== "string" || !raw) return;
    try {
      this.game = JSON.parse(raw) as GameState;
    } catch {
      this.callbacks.onError("Photon 房间快照解析失败。");
    }
  }

  private acceptSeq(envelope: PhotonEnvelope<unknown>): boolean {
    const key = `${envelope.userId}:${envelope.sessionId || envelope.actorNr}`;
    const previous = this.seenSeqByUser.get(key) ?? 0;
    if (envelope.seq <= previous) return false;
    this.seenSeqByUser.set(key, envelope.seq);
    return true;
  }

  private waitForJoin(roomCode: string): Promise<RoomSnapshot> {
    this.rejectPendingJoin("新的房间操作已开始。");
    this.roomSwitchInProgress = true;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingJoin = undefined;
        this.roomSwitchInProgress = false;
        reject(new Error(`进入房间 ${roomCode} 超时。`));
      }, OP_TIMEOUT_MS);
      this.pendingJoin = { resolve, reject, timeout };
    });
  }

  private waitForAction(): Promise<GameState> {
    this.rejectPendingAction("新的对局操作已开始。");
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingAction = undefined;
        reject(new Error("对局操作同步超时。"));
      }, OP_TIMEOUT_MS);
      this.pendingAction = { resolve, reject, timeout };
    });
  }

  private resolvePendingJoin(snapshot: RoomSnapshot) {
    if (!this.pendingJoin) return;
    window.clearTimeout(this.pendingJoin.timeout);
    this.pendingJoin.resolve(snapshot);
    this.pendingJoin = undefined;
    this.joinTargetRoomCode = "";
    this.roomSwitchInProgress = false;
  }

  private rejectPendingJoin(message: string) {
    if (!this.pendingJoin) return;
    window.clearTimeout(this.pendingJoin.timeout);
    this.pendingJoin.reject(new Error(message));
    this.pendingJoin = undefined;
    this.joinTargetRoomCode = "";
    this.roomSwitchInProgress = false;
  }

  private resolvePendingAction(game: GameState) {
    if (!this.pendingAction) return;
    window.clearTimeout(this.pendingAction.timeout);
    this.pendingAction.resolve(game);
    this.pendingAction = undefined;
  }

  private rejectPendingAction(message: string) {
    if (!this.pendingAction) return;
    window.clearTimeout(this.pendingAction.timeout);
    this.pendingAction.reject(new Error(message));
    this.pendingAction = undefined;
  }

  private resolvePendingRecovery(snapshot: RoomSnapshot) {
    if (!this.pendingRecovery) return;
    window.clearTimeout(this.pendingRecovery.timeout);
    this.pendingRecovery.resolve(snapshot);
    this.pendingRecovery = undefined;
  }

  private rejectPendingRecovery(message: string) {
    if (!this.pendingRecovery) return;
    window.clearTimeout(this.pendingRecovery.timeout);
    this.pendingRecovery.reject(new Error(message));
    this.pendingRecovery = undefined;
  }

  private emitDiagnostic(
    event: string,
    detail: Partial<Omit<NetworkDiagnostic, "timestamp" | "event" | "state" | "attempt">> = {}
  ) {
    this.callbacks.onDiagnostic?.({
      timestamp: Date.now(),
      event,
      state: this.reconnectState,
      attempt: this.reconnectAttempt,
      roomCode: (detail.roomCode ?? this.rejoinRoomCode) || this.room?.id,
      errorCode: detail.errorCode,
      operationCode: detail.operationCode,
      detail: detail.detail?.slice(0, 240),
    });
  }

  private isExpectedRoomSwitchState(stateName: string): boolean {
    if (!this.getManagedRoomTransition()) return false;
    const text = stateName.toLowerCase();
    if (/error|failed|timeout/.test(text)) return false;
    return /connect|disconnect|master|game|server|join|lobby|leave|authenticat/.test(text);
  }

  private getManagedRoomTransition(): ManagedRoomTransition {
    if (this.pendingLeave || this.reconnectState === "leaving") return "leaving";
    if (this.autoRejoinRequested || this.rejoinRoomCode || this.reconnectState === "rejoining") return "recovering";
    if (this.roomSwitchInProgress || this.joinTargetRoomCode || this.pendingJoin) return "joining";
    return "";
  }

  private buildManagedTransitionStatus(stateName?: string): PhotonStatus {
    const transition = this.getManagedRoomTransition();
    if (transition === "leaving") {
      return { ready: true, message: "正在返回 Photon 大厅...", connection: "connected" };
    }
    if (transition === "recovering") {
      const roomCode = this.rejoinRoomCode || readLastRoom()?.roomCode;
      return {
        ready: false,
        message: `正在恢复房间 ${roomCode ?? ""}...`,
        connection: "rejoining",
        attempt: this.reconnectAttempt,
        roomCode,
      };
    }
    if (transition === "joining") {
      return {
        ready: true,
        message: `正在进入房间 ${this.joinTargetRoomCode || ""}...`,
        connection: "connected",
        roomCode: this.joinTargetRoomCode,
      };
    }
    return { ready: false, message: `Photon：${stateName ?? "状态变化"}` };
  }

  private ensureLobbyReady() {
    if (!this.client.isInLobby?.()) {
      throw new Error("Photon 大厅尚未连接。");
    }
  }

  private ensureInRoom() {
    if (!this.client.isJoinedToRoom?.()) {
      throw new Error("还未进入 Photon 房间。");
    }
  }

  private saveLastRoom() {
    if (!this.client.isJoinedToRoom?.()) return;
    const seatId = this.room?.seats.find((seat) => seat.playerId === this.identity.id)?.seatId;
    const snapshot = this.room ?? this.buildRoomSnapshot();
    const record: LastRoomRecoveryRecord = {
      recordVersion: RECOVERY_RECORD_VERSION,
      roomCode: this.client.myRoom().name,
      userId: this.identity.id,
      seatId,
      gameKind: snapshot.gameKind ?? "card",
      status: snapshot.status,
      lastSnapshotAt: this.game || this.werewolfPublic ? Date.now() : undefined,
      savedAt: Date.now(),
    };
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(record));
  }

  private touchLastRoom() {
    const existing = readLastRoom();
    const roomCode = this.room?.id || existing?.roomCode;
    if (!roomCode || (existing && existing.userId !== this.identity.id)) return;
    const seatId =
      this.room?.seats.find((seat) => seat.playerId === this.identity.id)?.seatId ??
      existing?.seatId;
    const record: LastRoomRecoveryRecord = {
      recordVersion: RECOVERY_RECORD_VERSION,
      roomCode,
      userId: this.identity.id,
      seatId,
      gameKind: this.room?.gameKind ?? existing?.gameKind ?? "card",
      status: this.room?.status ?? existing?.status ?? "waiting",
      lastSnapshotAt: this.game || this.werewolfPublic ? Date.now() : existing?.lastSnapshotAt,
      savedAt: Date.now(),
    };
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(record));
  }

  private clearLastRoom() {
    localStorage.removeItem(LAST_ROOM_KEY);
  }

  private tryRejoinLastRoom() {
    if (this.attemptedRejoin) return;
    if (!this.autoRejoinRequested && !this.rejoinRoomCode && !this.forceNormalJoin) return;
    const record = readLastRoom();
    if (!record || record.userId !== this.identity.id) {
      this.finishReconnect(false);
      return;
    }
    this.attemptedRejoin = true;
    this.rejoinRoomCode = record.roomCode;
    this.prepareLocalActor();
    this.recoveryJoinMode = this.forceNormalJoin ? "normal" : "rejoin";
    this.callbacks.onStatus({
      ready: false,
      message:
        this.recoveryJoinMode === "rejoin"
          ? `正在恢复房间 ${record.roomCode} 的原座位...`
          : `正在按固定座位重新加入房间 ${record.roomCode}...`,
      connection: "rejoining",
      attempt: this.reconnectAttempt,
      roomCode: record.roomCode,
    });
    this.emitDiagnostic("room-join-attempt", { detail: this.recoveryJoinMode });
    this.client.joinRoom(
      record.roomCode,
      this.recoveryJoinMode === "rejoin" ? { rejoin: true } : { createIfNotExists: false }
    );
  }

  private completeLeave() {
    const pending = this.pendingLeave;
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    this.pendingLeave = undefined;
    this.suppressRoomCallbacks = false;
    this.reconnectState = "connected";
    this.reconnectInFlight = false;
    this.autoRejoinRequested = false;
    this.attemptedRejoin = false;
    this.rejoinRoomCode = "";
    this.joinTargetRoomCode = "";
    this.roomSwitchInProgress = false;
    this.forceNormalJoin = false;
    this.rejoinFallbackAttempted = false;
    this.recoveryJoinMode = "rejoin";
    this.activeActorRetryCount = 0;
    this.clearReconnectTimer();
    this.clearReconnectWatchdog();
    this.callbacks.onStatus({
      ready: true,
      message: this.client.isInLobby?.() ? "Photon 中国区大厅已连接" : "已离开房间，正在确认大厅连接...",
      connection: "connected",
    });
    pending.resolve(pending.snapshot);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer === undefined) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private clearReconnectWatchdog() {
    if (this.reconnectWatchdogTimer === undefined) return;
    window.clearTimeout(this.reconnectWatchdogTimer);
    this.reconnectWatchdogTimer = undefined;
  }

  private handleReconnectSignal(signal: ReconnectSignal) {
    if (signal.type === "request") {
      this.beginReconnect({
        preserveRoom: signal.preserveRoom,
        immediate: signal.immediate,
        delayMs: signal.delayMs,
        reason: signal.reason,
      });
      return;
    }

    if (signal.type === "joined") {
      this.finishReconnect(true);
      this.emitDiagnostic("reconnect-complete");
      return;
    }

    if (signal.type === "cancel") {
      this.reconnectGeneration += 1;
      this.clearReconnectTimer();
      this.clearReconnectWatchdog();
      this.reconnectInFlight = false;
      this.autoRejoinRequested = false;
      this.attemptedRejoin = false;
      this.rejoinRoomCode = "";
      this.forceNormalJoin = false;
      this.recoveryJoinMode = "rejoin";
      this.activeActorRetryCount = 0;
      this.recoveryCancelled = true;
      this.reconnectState = "failed";
      this.rejectPendingRecovery("已取消恢复对局。");
      this.emitDiagnostic("reconnect-cancelled");
      this.callbacks.onStatus({ ready: false, message: "已取消恢复对局，正在返回 Photon 大厅。", connection: "failed" });
      if (this.client.isInLobby?.()) {
        this.callbacks.onStatus({ ready: true, message: "Photon 中国区大厅已连接", connection: "connected" });
        return;
      }
      try {
        this.client.disconnect?.();
      } catch {
        // A disconnected peer can continue with a fresh lobby connection.
      }
      window.setTimeout(() => this.connect(), 120);
      return;
    }

    const decision = decideJoinFailure({
      errorCode: signal.errorCode,
      operationCode: signal.operationCode,
      mode: this.recoveryJoinMode,
      activeActorRetryCount: this.activeActorRetryCount,
    });
    this.emitDiagnostic("room-join-failure", {
      errorCode: signal.errorCode,
      operationCode: signal.operationCode,
      detail: `${decision.kind}:${signal.errorMessage || ""}`,
    });
    this.clearReconnectWatchdog();
    if (decision.kind === "ignore") return;
    if (decision.kind === "already-joined") {
      if (this.client.isJoinedToRoom?.()) {
        this.handleReconnectSignal({ type: "joined" });
        this.restoreGameFromRoomProperties();
        const snapshot = this.emitRoomSnapshot();
        this.resolvePendingRecovery(snapshot);
      } else {
        this.finishReconnect(false);
        this.handleReconnectSignal({
          type: "request",
          preserveRoom: true,
          delayMs: 500,
          reason: "Photon 已存在加入操作，重新确认房间状态",
        });
      }
      return;
    }
    if (decision.kind === "retry-rejoin" || decision.kind === "fallback-normal") {
      if (signal.errorCode === 32746) this.activeActorRetryCount += 1;
      this.forceNormalJoin = decision.kind === "fallback-normal" ? true : false;
      this.recoveryJoinMode = this.forceNormalJoin ? "normal" : "rejoin";
      this.rejoinFallbackAttempted = this.forceNormalJoin;
      this.attemptedRejoin = false;
      this.finishReconnect(false);
      this.handleReconnectSignal({
        type: "request",
        preserveRoom: true,
        delayMs: decision.delayMs,
        reason: decision.message,
      });
      return;
    }

    if (decision.kind === "stale-room") this.clearLastRoom();
    this.finishReconnect(false);
    this.autoRejoinRequested = false;
    this.attemptedRejoin = false;
    this.rejoinRoomCode = "";
    this.rejectPendingRecovery(decision.message);
    this.callbacks.onError(decision.message);
    this.callbacks.onStatus({ ready: false, message: decision.message, connection: "failed" });
    if (!this.client.isInLobby?.()) {
      try {
        this.client.disconnect?.();
      } catch {
        // Continue with a clean lobby connection below.
      }
      window.setTimeout(() => this.connect(), 120);
    }
  }

  private beginReconnect(
    options: { preserveRoom?: boolean; immediate?: boolean; delayMs?: number; reason?: string } = {}
  ) {
    if (this.intentionalDisconnect || this.pendingLeave || this.reconnectState === "leaving") return;
    const preserveRoom = Boolean(options.preserveRoom);
    if (preserveRoom) {
      this.autoRejoinRequested = true;
      this.touchLastRoom();
    } else {
      this.autoRejoinRequested = false;
      this.clearLastRoom();
    }
    if (!canStartReconnect(this.reconnectInFlight, this.reconnectTimer !== undefined)) {
      this.callbacks.onStatus({ ready: false, message: `${options.reason ?? "Photon 重连"}进行中...` });
      return;
    }
    this.intentionalDisconnect = false;
    this.reconnectInFlight = true;
    this.reconnectState = preserveRoom ? "rejoining" : "reconnecting";
    this.reconnectGeneration += 1;
    if (options.immediate) this.reconnectAttempt = 0;
    this.rejoinFallbackAttempted = false;
    this.attemptedRejoin = false;
    const wasActive = Boolean(this.client.isJoinedToRoom?.() || this.client.isInLobby?.());
    try {
      if (wasActive) this.client.disconnect?.();
    } catch {
      // Photon may already be disconnected; scheduled connect is authoritative.
    }
    const delay =
      options.delayMs ??
      (options.immediate ? (wasActive ? 120 : 0) : undefined);
    this.emitDiagnostic("reconnect-start", { detail: options.reason });
    this.scheduleReconnect(delay, this.reconnectGeneration);
  }

  private finishReconnect(success: boolean) {
    this.clearReconnectTimer();
    this.clearReconnectWatchdog();
    this.reconnectInFlight = false;
    if (success) {
      this.reconnectState = "connected";
      this.reconnectAttempt = 0;
      this.autoRejoinRequested = false;
      this.rejoinFallbackAttempted = false;
      this.forceNormalJoin = false;
      this.recoveryJoinMode = "rejoin";
      this.activeActorRetryCount = 0;
    } else {
      this.reconnectState = "failed";
    }
  }

  private startReconnectWatchdog(generation: number, detail: string) {
    this.clearReconnectWatchdog();
    this.reconnectWatchdogTimer = window.setTimeout(() => {
      this.reconnectWatchdogTimer = undefined;
      if (
        !isReconnectCallbackCurrent({
          callbackGeneration: generation,
          currentGeneration: this.reconnectGeneration,
          intentionalDisconnect: this.intentionalDisconnect,
          leaving: Boolean(this.pendingLeave) || this.reconnectState === "leaving",
        })
      ) return;
      this.emitDiagnostic("reconnect-watchdog-timeout", { detail });
      try {
        this.client.disconnect?.();
      } catch {
        // A stuck Photon peer may already be closed.
      }
      this.reconnectInFlight = false;
      this.scheduleReconnect(undefined, generation);
    }, RECONNECT_WATCHDOG_MS);
  }

  private scheduleReconnect(delayOverride?: number, generation = this.reconnectGeneration) {
    if (this.intentionalDisconnect || this.pendingLeave || this.reconnectState === "leaving") return;
    if (this.reconnectTimer !== undefined) return;
    if (!this.reconnectInFlight) {
      this.reconnectInFlight = true;
      this.reconnectGeneration += 1;
      generation = this.reconnectGeneration;
    }
    const delay =
      delayOverride ??
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    const roomCode = readLastRoom()?.roomCode;
    this.callbacks.onStatus({
      ready: false,
      message: delay > 0 ? `Photon 断线，${Math.ceil(delay / 1000)} 秒后自动重连...` : "正在重新连接 Photon...",
      connection: this.autoRejoinRequested ? "rejoining" : "reconnecting",
      attempt: this.reconnectAttempt,
      roomCode,
    });
    this.emitDiagnostic("reconnect-scheduled", { detail: String(delay) });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (
        !isReconnectCallbackCurrent({
          callbackGeneration: generation,
          currentGeneration: this.reconnectGeneration,
          intentionalDisconnect: this.intentionalDisconnect,
          leaving: Boolean(this.pendingLeave) || this.reconnectState === "leaving",
        })
      ) return;
      try {
        installNativeWebSocket();
        const record = readLastRoom();
        const canUseRecord = Boolean(record && record.userId === this.identity.id && this.autoRejoinRequested);
        if (canUseRecord && !this.forceNormalJoin && typeof this.client.reconnectAndRejoin === "function") {
          const canDirectRejoin = this.client.reconnectAndRejoin();
          if (canDirectRejoin) {
            this.recoveryJoinMode = "rejoin";
            this.reconnectState = "rejoining";
            this.rejoinRoomCode = record!.roomCode;
            this.callbacks.onStatus({
              ready: false,
              message: `正在快速恢复房间 ${record!.roomCode}...`,
              connection: "rejoining",
              attempt: this.reconnectAttempt,
              roomCode: record!.roomCode,
            });
            this.emitDiagnostic("direct-rejoin-start");
            this.startReconnectWatchdog(generation, "direct-rejoin");
            return;
          }
        }
        this.reconnectState = canUseRecord ? "rejoining" : "reconnecting";
        this.client.connectToRegionMaster(PHOTON_REGION);
        if (canUseRecord) {
          this.rejoinRoomCode = record!.roomCode;
        }
        this.startReconnectWatchdog(generation, canUseRecord ? "connect-then-rejoin" : "connect-lobby");
      } catch (error) {
        const message = normalizePhotonError(error, "Photon 重连失败。");
        console.error("[Photon] reconnect failed", error);
        this.callbacks.onError(message);
        if (generation === this.reconnectGeneration) this.scheduleReconnect(undefined, generation);
      }
    }, delay);
  }
}

function readLastRoom(): LastRoomRecoveryRecord | undefined {
  return parseLastRoomRecoveryRecord(localStorage.getItem(LAST_ROOM_KEY));
}

export function getLastRoomRecoveryCandidate(userId: string): LastRoomRecoveryRecord | undefined {
  const record = readLastRoom();
  return record?.userId === userId ? record : undefined;
}

function parseSeatRegistry(value: unknown): RoomSeat[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((seat): seat is RoomSeat =>
      Boolean(
        seat &&
        typeof seat === "object" &&
        typeof (seat as RoomSeat).seatId === "string" &&
        typeof (seat as RoomSeat).playerId === "string" &&
        typeof (seat as RoomSeat).playerName === "string"
      )
    );
  } catch {
    return [];
  }
}

function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return MAX_PLAYERS;
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(value)));
}

function currentProtocolVersion(): string {
  return getRulesRuntimeInfo().protocolVersion || PROTOCOL_VERSION;
}

function normalizeRoomCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!code) throw new Error("请输入房间号。");
  return code.slice(0, 24);
}

function actorDisplayName(actor: any): string {
  if (!actor) return "玩家";
  const props = actor.getCustomProperties?.() ?? actor.customProperties ?? {};
  return String(props.playerName || actor.name || actor.userId || "玩家");
}

function actorPlayerId(actor: any): string {
  const props = actor?.getCustomProperties?.() ?? actor?.customProperties ?? {};
  return String(props.playerId || actor?.userId || `actor-${actor?.actorNr ?? "unknown"}`);
}

function installNativeWebSocket(): void {
  const webSocketCtor = typeof globalThis !== "undefined" ? globalThis.WebSocket : undefined;
  if (typeof webSocketCtor === "function" && Photon.PhotonPeer?.setWebSocketImpl) {
    Photon.PhotonPeer.setWebSocketImpl(webSocketCtor);
  }
}

function readPhotonRoomBoolean(room: any, key: "isOpen" | "isVisible", fallback: boolean): boolean {
  const value = room?.[key];
  if (typeof value === "function") {
    try {
      return Boolean(value.call(room));
    } catch {
      return fallback;
    }
  }
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizePhotonError(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!text) return fallback;
  if (/ws does not work in the browser|Browser clients must use the native WebSocket object/i.test(text)) {
    return "Photon WebSocket 初始化失败，请重试连接。";
  }
  if (/WebSocket is not available/i.test(text)) {
    return "Photon WebSocket 不可用，请重启游戏后重试。";
  }
  if (/timeout/i.test(text)) {
    return "Photon 连接超时，请检查网络后重试。";
  }
  if (/app.?id|appid|region|china|cn/i.test(text)) {
    return `Photon 中国区连接失败：${text.length > 70 ? `${text.slice(0, 70)}...` : text}`;
  }
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function generateRoomCode(): string {
  return `ROOM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
