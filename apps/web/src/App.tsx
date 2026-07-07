import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { lazy, Suspense } from "react";
import {
  BadgeCheck,
  BookOpen,
  CircleHelp,
  Copy,
  Crown,
  DoorOpen,
  Gamepad2,
  Image as ImageIcon,
  Inbox,
  ListChecks,
  LogOut,
  Mail,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Send,
  Settings,
  Shield,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Swords,
  Trash2,
  UserRound,
  Users,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  type CharacterDefinition,
  type CharacterFaction,
  type EquipmentKey,
  type GameAction,
  type GameCard,
  type GameTimerSettings,
  type GameState,
  type PlayerIdentity,
  type RoomSnapshot,
  type UserProfile,
  type WerewolfAction,
  type WerewolfPrivateState,
  type WerewolfPublicState,
  type WerewolfRole,
} from "@cardgame/shared";
import { CardView, HealthBar, factionText, phaseText, responseText } from "./components/gamePieces.js";
import { BattleVfxCanvas } from "./components/BattleVfxCanvas.js";
import { CardFlightLayer } from "./components/CardFlightLayer.js";
import { CustomCursorLayer } from "./components/CustomCursorLayer.js";
import {
  type CloudBaseAuthSession,
  type CloudBaseEmailCodeChallenge,
  type CloudBasePasswordResetChallenge,
  getCloudBaseConfigWarning,
  loginWithCloudBaseEmail,
  loginWithCloudBaseEmailCode,
  loadCloudBaseSession,
  logoutCloudBase,
  normalizeNickname,
  registerWithCloudBaseEmailCode,
  requestCloudBasePasswordResetCode,
  requestCloudBaseEmailLoginCode,
  requestCloudBaseEmailRegisterCode,
  resetCloudBasePasswordWithCode,
  saveCloudBaseNickname,
  validateEmail,
} from "./lib/cloudbaseAuth.js";
import {
  CARD_MESSAGE_FUNCTIONS,
  type CardMessageRecord,
  downloadCardImage,
  loadUnreadCardMessages,
  sendCardMessage,
} from "./lib/cloudbaseCardMessages.js";
import {
  PhotonGameClient,
  getLastRoomRecoveryCandidate,
  type NetworkDiagnostic,
  type PhotonChatMessage,
  type PhotonStatus,
  type PhotonTableGift,
  type PhotonWerewolfWolfMessage,
} from "./lib/photonGame.js";
import { shouldPromptForRecovery, type LastRoomRecoveryRecord } from "./lib/recoveryRecord.js";
import { getRulesRuntime, getRulesRuntimeInfo, loadHotRulesRuntime, type RulesRuntimeInfo } from "./lib/rulesRuntime.js";
import { ANNOUNCERS, getBgmTracks, loadAudioConfig, type AudioTrack } from "./lib/audioAssets.js";
import { AudioManager } from "./lib/audioManager.js";
import type { AgoraVoiceManager, AgoraVoiceSnapshot } from "./lib/agoraVoice.js";
import { deriveBattleEffects, type BattleEffect } from "./lib/battleEffects.js";
import { ANNOUNCEMENT_DISMISS_KEY, LAST_ROOM_KEY } from "./config/appConfig.js";
import {
  CORE_CARD_NAMES,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_SETTINGS,
  formatKeyCode,
  KEY_BINDING_LABELS,
  KEY_BINDING_ORDER,
  normalizeBattleVfxStyle,
  normalizeCursorSettings,
  normalizeKeyBindings,
  QUICK_CHAT_MESSAGES,
  RECENT_CHARACTER_IDS,
  SETTINGS_KEY,
  TABLE_BACKGROUNDS,
  type GameSettings,
  type KeyBindingAction,
  type KeyBindings,
} from "./config/uiConfig.js";
import { FALLBACK_APP_CONTENT, loadHotAppContent, type AppContent } from "./lib/appContent.js";
import { initializeHotUpdate, resolveAssetUrl, type HotUpdateState } from "./lib/hotUpdate.js";
import { initializeMobilePlatform, isAndroidNative } from "./lib/platform.js";
import {
  getDesktopBridge,
  persistentStorage,
} from "./lib/persistentStorage.js";
import {
  clearRememberedCredentials,
  forgetRememberedPassword,
  loadRememberedCredentials,
  rememberEmailOnly,
  saveRememberedCredentials,
} from "./lib/rememberedCredentials.js";

const localStorage = persistentStorage;

const WerewolfGameTable = lazy(() =>
  import("./components/WerewolfMode.js").then((module) => ({ default: module.WerewolfGameTable }))
);

type AppView =
  | "login"
  | "lobby"
  | "room"
  | "game"
  | "werewolf-game"
  | "messages"
  | "settings"
  | "practice"
  | "preview";

function getVisualQaSession(): CloudBaseAuthSession | undefined {
  if (import.meta.env.VITE_MAOYI_VISUAL_QA !== "1") return undefined;
  const params = new URLSearchParams(window.location.search);
  if (params.get("maoyiVisualQa") !== "1") return undefined;
  const now = new Date().toISOString();
  return {
    token: "local-visual-qa",
    needsNickname: false,
    user: {
      id: "visual-qa-user",
      uid: "visual-qa-user",
      email: "qa@maoyisha.local",
      displayName: "黄煜欢",
      defaultAvatarKey: "huang",
      role: "player",
      createdAt: now,
      updatedAt: now,
    },
  };
}

export default function App() {
  const [auth, setAuth] = useState<CloudBaseAuthSession | undefined>();
  const [authChecking, setAuthChecking] = useState(true);
  const [loginPrefillEmail, setLoginPrefillEmail] = useState("");
  const [photonClient, setPhotonClient] = useState<PhotonGameClient | undefined>();
  const [photonReady, setPhotonReady] = useState(false);
  const [photonStatus, setPhotonStatus] = useState<PhotonStatus>({
    ready: false,
    message: "Photon 尚未连接",
    connection: "reconnecting",
  });
  const [recoveryCandidate, setRecoveryCandidate] = useState<LastRoomRecoveryRecord | undefined>();
  const [recoveryPromptDismissed, setRecoveryPromptDismissed] = useState(false);
  const [view, setView] = useState<AppView>("login");
  const [room, setRoom] = useState<RoomSnapshot | undefined>();
  const [roomMode, setRoomMode] = useState<"online" | "practice">("online");
  const [rooms, setRooms] = useState<RoomSnapshot[]>([]);
  const [chatMessages, setChatMessages] = useState<PhotonChatMessage[]>([]);
  const [werewolfPublic, setWerewolfPublic] = useState<WerewolfPublicState | undefined>();
  const [werewolfPrivate, setWerewolfPrivate] = useState<WerewolfPrivateState | undefined>();
  const [werewolfWolfMessages, setWerewolfWolfMessages] = useState<PhotonWerewolfWolfMessage[]>([]);
  const [tableGifts, setTableGifts] = useState<PhotonTableGift[]>([]);
  const [notice, setNotice] = useState("请使用 CloudBase 邮箱账号登录。");
  const [settings, setSettingsState] = useState<GameSettings>(() => loadGameSettings());
  const [actionBusy, setActionBusy] = useState<string | undefined>();
  const [rulesReady, setRulesReady] = useState(false);
  const [rulesInfo, setRulesInfo] = useState<RulesRuntimeInfo>(() => getRulesRuntimeInfo());
  const [appContent, setAppContent] = useState<AppContent>(FALLBACK_APP_CONTENT);
  const [bgmTracks, setBgmTracks] = useState<AudioTrack[]>(() => getBgmTracks());
  const [hotUpdateReady, setHotUpdateReady] = useState(false);
  const [hotUpdateState, setHotUpdateState] = useState<HotUpdateState>({
    status: "checking",
    progress: 2,
    detail: "检查资源更新中",
  });
  const audioManagerRef = useRef<AudioManager | undefined>(undefined);
  const suppressRoomCallbackRef = useRef(false);
  const characters = useMemo<CharacterDefinition[]>(() => getRulesRuntime().BUILT_IN_CHARACTERS, [rulesInfo.logicMd5]);
  const visibleNotice = settings.showFullErrors ? notice : summarizeNotice(notice);
  if (!audioManagerRef.current) audioManagerRef.current = new AudioManager(settings);
  const audioManager = audioManagerRef.current;

  const identity = useMemo<PlayerIdentity | undefined>(
    () =>
      auth
        ? {
            id: auth.user.id,
            uid: auth.user.uid,
            email: auth.user.email,
            name: auth.user.displayName,
            role: auth.user.role,
          }
        : undefined,
    [auth]
  );

  useEffect(() => {
    let alive = true;
    void initializeHotUpdate((state) => {
      if (alive) setHotUpdateState(state);
    })
      .then((result) => {
        if (!alive) return;
        setHotUpdateState({
          status: result.status,
          progress: 100,
          detail: result.detail || (result.status === "complete" ? "更新完成" : "使用本地资源"),
        });
      })
      .catch((error) => {
        if (!alive) return;
        setHotUpdateState({
          status: "fallback",
          progress: 100,
          detail: error instanceof Error ? error.message : "更新失败，使用本地资源",
        });
      })
      .finally(() => {
        if (alive) setHotUpdateReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hotUpdateReady) return;
    let alive = true;
    void loadHotAppContent()
      .then((content) => {
        if (alive) setAppContent(content);
      })
      .catch(() => undefined);
    void loadAudioConfig()
      .then((tracks) => {
        if (alive) setBgmTracks(tracks);
      })
      .catch(() => {
        if (alive) setBgmTracks(getBgmTracks());
      });
    void loadHotRulesRuntime()
      .then((loaded) => {
        if (!alive) return;
        setRulesInfo(loaded);
        if (loaded.source === "hotfix") {
          setNotice(`规则热更已加载：${loaded.logicVersion}`);
        } else if (loaded.error) {
          setNotice(`规则热更不可用，已使用内置规则：${loaded.error}`);
        }
      })
      .finally(() => {
        if (alive) setRulesReady(true);
      });
    return () => {
      alive = false;
    };
  }, [hotUpdateReady]);

  useEffect(() => {
    const qaSession = getVisualQaSession();
    if (qaSession) {
      setAuth(qaSession);
      setView("lobby");
      setAuthChecking(false);
      setNotice("视觉 QA 模式：本地测试账号已启用。");
      return;
    }
    void loadCloudBaseSession()
      .then((session) => {
        if (session) {
          const lastEmail = session.user.email || "";
          if (lastEmail) {
            setLoginPrefillEmail(lastEmail);
            rememberEmailOnly(lastEmail);
          }
          setNotice(lastEmail ? "已检测到历史登录态，已填入上次邮箱，请重新输入密码进入游戏。" : "已检测到历史登录态，请重新登录进入游戏。");
        }
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "CloudBase 登录态恢复失败。"))
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (!identity || !rulesReady) return;
    try {
      const client = new PhotonGameClient(identity, {
        onStatus: (status) => {
          setPhotonStatus(status);
          setPhotonReady(status.ready);
          setNotice(status.message);
        },
        onRooms: setRooms,
        onRoom: (snapshot) => {
          if (suppressRoomCallbackRef.current) return;
          setRoom(snapshot);
          setView(
            snapshot.status === "playing"
              ? snapshot.gameKind === "werewolf"
                ? "werewolf-game"
                : "game"
              : "room"
          );
        },
        onGame: (game) => {
          setRoom((current) => (current ? { ...current, game, status: game.phase === "finished" ? "finished" : "playing" } : current));
          setView("game");
        },
        onEventLog: (events) => setNotice(events.at(-1) ?? "状态已更新"),
        onChatMessage: (message) =>
          setChatMessages((current) => {
            if (current.some((item) => item.id === message.id)) return current;
            return [...current, message].slice(-50);
          }),
        onTableGift: (gift) => {
          rememberTableGift(gift);
          setNotice(`${gift.fromPlayerName} ${gift.giftType === "egg" ? "扔了鸡蛋" : "送了鲜花"}`);
        },
        onWerewolfPublic: (state) => {
          if (suppressRoomCallbackRef.current) return;
          setWerewolfPublic(state);
          setRoom((current) =>
            current
              ? {
                  ...current,
                  gameKind: "werewolf",
                  werewolfPublic: state,
                  status: state.phase === "finished" ? "finished" : "playing",
                }
              : current
          );
          setView("werewolf-game");
        },
        onWerewolfPrivate: (state) => {
          if (suppressRoomCallbackRef.current) return;
          setWerewolfPrivate(state);
        },
        onWerewolfWolfMessage: (message) =>
          setWerewolfWolfMessages((current) => {
            if (current.some((item) => item.id === message.id)) return current;
            return [...current, message].slice(-50);
          }),
        onError: setNotice,
        onDiagnostic: appendNetworkDiagnostic,
      });
      setPhotonClient(client);
      try {
        client.connect();
      } catch (error) {
        setPhotonReady(false);
        setNotice(error instanceof Error ? `Photon 未连接：${error.message}` : "Photon 未连接。");
      }
      return () => {
        client.disconnect({ intentional: true });
        setPhotonClient(undefined);
        setPhotonReady(false);
      };
    } catch (error) {
      setPhotonReady(false);
      setPhotonClient(undefined);
      setNotice(error instanceof Error ? `Photon 初始化失败：${error.message}` : "Photon 初始化失败。");
      return undefined;
    }
  }, [identity?.id, rulesReady, rulesInfo.logicMd5]);

  useEffect(() => {
    if (!identity || !photonReady || view !== "lobby" || room || recoveryPromptDismissed) return;
    const candidate = getLastRoomRecoveryCandidate(identity.id);
    setRecoveryCandidate(shouldPromptForRecovery(candidate, identity.id) ? candidate : undefined);
  }, [identity, photonReady, recoveryPromptDismissed, room, view]);

  useEffect(() => {
    if (!identity || !photonClient) return;
    photonClient.updateIdentity(identity);
  }, [identity, photonClient]);

  useEffect(() => {
    audioManager.updateSettings(settings);
  }, [audioManager, settings]);

  useEffect(() => {
    if (!isAndroidNative) return;
    let cancelled = false;
    let dispose: () => Promise<void> = async () => {};
    void initializeMobilePlatform({
      onBack: () => {
        if (view === "game" || view === "werewolf-game" || view === "room") {
          if (window.confirm("是否退出当前房间？")) void leaveActiveRoom();
          return true;
        }
        if (view !== "lobby" && view !== "login") {
          setView(auth ? "lobby" : "login");
          return true;
        }
        return false;
      },
      onPause: () => {
        document.dispatchEvent(new CustomEvent("maoyi:app-pause"));
      },
      onResume: () => {
        document.dispatchEvent(new CustomEvent("maoyi:app-resume"));
        if (roomMode === "online" && room && photonClient) {
          photonClient.manualReconnect({ preserveRoom: true });
        }
      },
      onNetworkChange: (connected) => {
        if (!connected) {
          setNotice("网络已断开，恢复网络后将自动重连。");
        } else if (roomMode === "online" && room && photonClient) {
          setNotice("网络已恢复，正在重新进入房间。");
          photonClient.manualReconnect({ preserveRoom: true });
        }
      },
    }).then((cleanup) => {
      if (cancelled) {
        void cleanup();
      } else {
        dispose = cleanup;
      }
    });
    return () => {
      cancelled = true;
      void dispose();
    };
  }, [auth, photonClient, room, roomMode, view]);

  useEffect(() => {
    if (!auth) return;
    if (view === "room" && !room) {
      setView("lobby");
      setNotice("房间状态丢失，已返回大厅。");
    }
    if (view === "game" && (!room || !room.game)) {
      setView("lobby");
      setNotice("对局状态丢失，已返回大厅。");
    }
    if (view === "werewolf-game" && !room) {
      setView("lobby");
      setNotice("狼人杀房间状态已丢失，请从最近房间重新进入。");
    } else if (
      view === "werewolf-game" &&
      !werewolfPublic &&
      room?.werewolfPublic
    ) {
      setWerewolfPublic(room.werewolfPublic);
    }
  }, [auth, room, view, werewolfPublic]);

  useEffect(() => {
    if (!auth || view !== "lobby" || !photonReady || !settings.autoRefreshLobby || !photonClient) return;
    photonClient.refreshRooms();
    const timer = window.setInterval(() => photonClient.refreshRooms(), 10_000);
    return () => window.clearInterval(timer);
  }, [auth, photonReady, photonClient, settings.autoRefreshLobby, view]);

  useEffect(() => {
    setChatMessages([]);
    setTableGifts([]);
    setWerewolfWolfMessages([]);
    setWerewolfPrivate(undefined);
    setWerewolfPublic(room?.werewolfPublic);
  }, [room?.id]);

  function rememberTableGift(gift: PhotonTableGift) {
    setTableGifts((current) => {
      if (current.some((item) => item.id === gift.id)) return current;
      return [...current, gift].slice(-12);
    });
    window.setTimeout(() => {
      setTableGifts((current) => current.filter((item) => item.id !== gift.id));
    }, 4600);
  }

  function applyLogin(session: CloudBaseAuthSession, message: string) {
    setAuth(session);
    setView("lobby");
    setNotice(message);
  }

  async function saveNickname(nickname: string) {
    const session = await saveCloudBaseNickname(nickname);
    setAuth(session);
    setNotice("昵称已保存，正在连接 Photon。");
  }

  async function logout() {
    await logoutCloudBase();
    setAuth(undefined);
    photonClient?.disconnect({ intentional: true });
    setPhotonClient(undefined);
    setPhotonReady(false);
    setRoom(undefined);
    setWerewolfPublic(undefined);
    setWerewolfPrivate(undefined);
    setWerewolfWolfMessages([]);
    setRoomMode("online");
    setRooms([]);
    setView("login");
    setNotice("已退出登录。");
  }

  function updateSettings(patch: Partial<GameSettings>) {
    setSettingsState((current) => {
      const next = normalizeGameSettings({ ...current, ...patch });
      saveGameSettings(next);
      return next;
    });
  }

  function reconnectPhoton(options?: { preserveRoom?: boolean }) {
    if (photonClient) {
      photonClient.manualReconnect({ preserveRoom: Boolean(options?.preserveRoom) });
      setPhotonReady(false);
      setNotice(options?.preserveRoom ? "正在重新连接 Photon，保留当前房间。" : "正在重新连接 Photon。");
      return;
    }
    setPhotonReady(false);
    setNotice("Photon 客户端未就绪，请重新登录或稍后再试。");
  }

  async function recoverPreviousRoom() {
    if (!photonClient) {
      setNotice("Photon 客户端未就绪，请重新登录后恢复。");
      return;
    }
    await guarded(async () => {
      const snapshot = await photonClient.recoverLastRoom();
      setRecoveryCandidate(undefined);
      setRecoveryPromptDismissed(false);
      setRoom(snapshot);
      setRoomMode("online");
      setView(
        snapshot.status === "playing"
          ? snapshot.gameKind === "werewolf"
            ? "werewolf-game"
            : "game"
          : "room"
      );
    }, "正在恢复对局");
  }

  function cancelRecovery() {
    photonClient?.cancelReconnect();
    setRecoveryPromptDismissed(true);
    setRecoveryCandidate(undefined);
    setNotice("已忽略本次恢复提示，最近房间记录仍保留。");
  }

function resetSettings() {
    const next = normalizeGameSettings(DEFAULT_SETTINGS);
    saveGameSettings(next);
    setSettingsState(next);
    setNotice("本地设置已恢复默认。");
  }

  function clearLastRoomRecord() {
    localStorage.removeItem(LAST_ROOM_KEY);
    setRecoveryCandidate(undefined);
    setRecoveryPromptDismissed(true);
    setNotice("已清除最近房间记录。");
  }

  async function leaveActiveRoom() {
    const client = photonClient;
    const mode = roomMode;
    // 先退出界面，再等待 Photon 回到大厅；Photon 客户端会屏蔽离房期间迟到的房间快照。
    suppressRoomCallbackRef.current = true;
    setRoom(undefined);
    setWerewolfPublic(undefined);
    setWerewolfPrivate(undefined);
    setWerewolfWolfMessages([]);
    setRoomMode("online");
    setView("lobby");
    if (mode === "practice") {
      window.setTimeout(() => {
        suppressRoomCallbackRef.current = false;
      }, 200);
      setNotice("已退出练习场。");
      return;
    }
    if (!client) {
      window.setTimeout(() => {
        suppressRoomCallbackRef.current = false;
      }, 200);
      setNotice("已返回大厅，Photon 当前未连接。");
      return;
    }
    try {
      await client.leaveRoom({ intentional: true });
      client.refreshRooms();
      setNotice("已退出房间。");
    } finally {
      window.setTimeout(() => {
        suppressRoomCallbackRef.current = false;
        client.refreshRooms();
      }, 600);
    }
  }

  async function guarded(operation: () => Promise<void>, label = "操作同步中") {
    if (actionBusy) return;
    setActionBusy(label);
    try {
      await operation();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setActionBusy(undefined);
    }
  }

  function currentTimerSettings(): GameTimerSettings {
    return {
      turnSeconds: settings.turnTimerSeconds,
      responseSeconds: settings.responseTimerSeconds,
    };
  }

  function startPractice(playerCount: number, characterId: string) {
    if (!auth) return;
    const roomId = `practice-${Date.now()}`;
    const totalPlayers = clampPlayerLimit(playerCount);
    const approvedCharacters = characters.filter((character) => character.status === "approved");
    const players = Array.from({ length: totalPlayers }, (_, index) => {
      if (index === 0) {
        return {
          playerId: auth.user.id,
          playerName: auth.user.displayName,
          characterId,
        };
      }
      const character = approvedCharacters[index % Math.max(1, approvedCharacters.length)];
      return {
        playerId: `ai-${index}`,
        playerName: `人机 ${index}`,
        characterId: character?.id,
      };
    });
    const game = getRulesRuntime().createGame({
      roomId,
      players,
      characters,
      seed: roomId,
      timerSettings: currentTimerSettings(),
    });
    const initialGame = runPracticeAi(game, auth.user.id);
    setRoom({
      id: roomId,
      name: `练习场 ${totalPlayers} 人`,
      hostPlayerId: auth.user.id,
      maxPlayers: totalPlayers,
      status: initialGame.phase === "finished" ? "finished" : "playing",
      seats: initialGame.seats.map((seat) => ({
        seatId: seat.seatId,
        playerId: seat.playerId,
        playerName: seat.playerName,
        ready: true,
        connected: true,
        characterId: seat.character.id,
      })),
      game: initialGame,
    });
    setRoomMode("practice");
    setView("game");
    setNotice("练习场已开始。");
  }

  function applyPracticeAction(action: GameAction) {
    if (!auth || !room?.game) return;
    const next = getRulesRuntime().applyGameAction(room.game, action).state;
    const advanced = runPracticeAi(next, auth.user.id);
    setRoom((current) => (current ? { ...current, game: advanced, status: advanced.phase === "finished" ? "finished" : "playing" } : current));
  }

  const currentGame = room?.game;
  const networkRecovering =
    roomMode === "online" &&
    !photonStatus.ready &&
    (photonStatus.connection === "rejoining" || photonStatus.connection === "reconnecting");
  const tableBackground = TABLE_BACKGROUNDS.find((item) => item.id === settings.tableBackgroundId) ?? TABLE_BACKGROUNDS[0];

  if (!hotUpdateReady) {
    return <HotUpdateSplash state={hotUpdateState} />;
  }

  return (
    <main
      className={`app-shell ${isAndroidNative ? "mobile-native" : ""} ${view === "lobby" ? "is-lobby" : ""} ${view === "game" || view === "werewolf-game" ? "in-game" : ""} ${settings.compactUi ? "compact-ui" : ""} ${settings.tableCompact ? "table-compact" : ""} ${settings.battleHudCompact ? "battle-hud-compact" : ""} ${settings.compactHandZone ? "compact-hand-zone" : ""} ${settings.highContrastText ? "high-contrast-text" : ""} effect-${settings.effectIntensity} vfx-style-${settings.battleVfxStyle} ${settings.reduceMotion ? "reduce-motion" : ""}`}
      style={{
        "--hand-card-scale": settings.handCardScale,
        "--table-bg-url": `url("${resolveAssetUrl(tableBackground.path)}")`,
        "--lobby-bg-url": `url("${resolveAssetUrl("assets/ui/lobby/lobby-bg-ink-copper.jpg")}")`,
        "--avatar-sheet-url": `url("${resolveAssetUrl("assets/ui/default-avatars.png")}")`,
        "--icon-sheet-url": `url("${resolveAssetUrl("assets/ui/maoyi-icons.png")}")`,
        "--card-art-url": `url("${resolveAssetUrl("assets/ui/maoyi-card-arts.png")}")`,
      } as CSSProperties}
    >
      <CustomCursorLayer
        enabled={settings.customCursorEnabled && !isAndroidNative}
        theme={settings.cursorTheme}
        size={settings.cursorSize}
        trail={settings.cursorTrail}
        reducedMotion={settings.reduceMotion}
      />
      <header className="topbar">
        <div>
          <p className="eyebrow">CloudBase Auth · Photon Cloud</p>
          <h1>茂一杀 <small>v{appContent.appVersion}</small></h1>
        </div>
        {isAndroidNative ? (
          <nav className="mobile-top-actions">
            <span className="status-pill" title={notice}>{visibleNotice}</span>
            {auth && (
              <button onClick={() => void logout()} aria-label="退出登录">
                <LogOut size={18} />
              </button>
            )}
          </nav>
        ) : (
          <nav className="top-actions">
            <span className="status-pill" title={notice}>{visibleNotice}</span>
            {auth && (
              <>
                <button onClick={() => setView("lobby")}>大厅</button>
                <button onClick={() => setView("practice")}>练习场</button>
                <button onClick={() => setView("preview")}>卡牌预览</button>
                <button onClick={() => setView("messages")}>卡牌收发</button>
              <button onClick={() => setView("settings")}>
                <Settings size={16} /> 设置
              </button>
              <button>
                <PlayerAvatar user={auth.user} /> {auth.user.displayName}
              </button>
              <button onClick={() => void logout()} aria-label="退出登录">
                <LogOut size={16} />
              </button>
              </>
            )}
          </nav>
        )}
      </header>

      {networkRecovering && room && (
        <ConnectionRecoveryBar
          status={photonStatus}
          roomCode={room.id}
          onRetry={() => reconnectPhoton({ preserveRoom: true })}
          onCancel={cancelRecovery}
        />
      )}

      {!auth && (
        <LoginPanel
          loading={authChecking}
          prefillEmail={loginPrefillEmail}
          onLogin={(session) => applyLogin(session, "登录成功，正在连接 Photon。")}
          setNotice={setNotice}
        />
      )}

      {auth && view === "lobby" && (
        <>
          {recoveryCandidate && (
            <RecoveryPrompt
              record={recoveryCandidate}
              busy={Boolean(actionBusy) || networkRecovering}
              onRecover={() => void recoverPreviousRoom()}
              onIgnore={cancelRecovery}
            />
          )}
          <Lobby
            user={auth.user}
            characters={characters}
            appContent={appContent}
            settings={settings}
            audioManager={audioManager}
            bgmTracks={bgmTracks}
            photonReady={photonReady}
            notice={visibleNotice}
            noticeDetail={notice}
          actionBusy={actionBusy}
          rooms={rooms}
          networkReady={photonReady}
          onRefresh={() => photonClient?.refreshRooms()}
          onCreate={(name, maxPlayers, gameKind) =>
            guarded(async () => {
                if (!photonClient) throw new Error("Photon 未连接。");
                suppressRoomCallbackRef.current = false;
                setRoom(await photonClient.createOrJoinRoom(name, maxPlayers, gameKind));
                setRoomMode("online");
                setView("room");
            }, "正在创建房间")
          }
          onJoin={(roomId) =>
            guarded(async () => {
                if (!photonClient) throw new Error("Photon 未连接。");
                suppressRoomCallbackRef.current = false;
                setRoom(await photonClient.joinRoom(roomId));
                setRoomMode("online");
                setView("room");
            }, "正在加入房间")
          }
          onCopyUid={() => void copyText(auth.user.uid, "UID/openid 已复制。", setNotice)}
          onCopyText={(text, message) => void copyText(text, message, setNotice)}
            onReconnect={() => void recoverPreviousRoom()}
            onChangeSettings={updateSettings}
            onNavigate={setView}
          />
        </>
        )}

        {auth && view === "practice" && (
          <PracticePanel
            user={auth.user}
            characters={characters}
            defaultMaxPlayers={settings.defaultMaxPlayers}
            characterRefreshCount={settings.characterRefreshCount}
            onStart={startPractice}
            onBack={() => setView("lobby")}
          />
        )}

        {auth && view === "preview" && (
          <PreviewPanel
            characters={characters}
            rulesInfo={rulesInfo}
            onBack={() => setView("lobby")}
          />
        )}

      {auth && view === "messages" && (
        <CardMessagesPanel
          user={auth.user}
          setNotice={setNotice}
        />
      )}

      {auth && view === "settings" && (
        <SettingsPanel
          user={auth.user}
          settings={settings}
          audioManager={audioManager}
          bgmTracks={bgmTracks}
          photonReady={photonReady}
          actionBusy={actionBusy}
          onBack={() => setView("lobby")}
          onChangeSettings={updateSettings}
          onSaveNickname={(nickname) => guarded(() => saveNickname(nickname), "正在保存昵称")}
          onReconnect={() => reconnectPhoton()}
          onResetSettings={resetSettings}
          onClearLastRoom={clearLastRoomRecord}
          onCopyNetworkDiagnostics={() =>
            void copyText(networkDiagnosticText() || "暂无网络诊断记录。", "网络诊断已复制。", setNotice)
          }
          onClearNetworkDiagnostics={() => {
            localStorage.removeItem(NETWORK_DIAGNOSTIC_KEY);
            localStorage.removeItem(NETWORK_METRICS_KEY);
            setNotice("已清除本地网络诊断。");
          }}
          onClearRemember={() => {
            clearRememberedCredentials();
            setNotice("已清除本地记住邮箱和加密密码。");
          }}
        />
      )}

      {auth && identity && view === "room" && room && (
          <RoomPanel
            room={room}
            identity={identity}
            characters={characters}
            characterRefreshCount={settings.characterRefreshCount}
          onReady={(ready, characterId) =>
            guarded(async () => {
              if (!photonClient) throw new Error("Photon 未连接。");
              setRoom(await photonClient.setReady(ready, characterId));
            }, ready ? "正在准备" : "正在取消准备")
          }
          onStart={() =>
            guarded(async () => {
              if (!photonClient) throw new Error("Photon 未连接。");
              if (room.gameKind === "werewolf") {
                const werewolf = photonClient.startWerewolfGame();
                setWerewolfPublic(werewolf);
                setRoom((current) =>
                  current
                    ? {
                        ...current,
                        gameKind: "werewolf",
                        werewolfPublic: werewolf,
                        status: "playing",
                      }
                    : current
                );
                setRoomMode("online");
                setView("werewolf-game");
                return;
              }
              const game = await photonClient.startGame(characters, currentTimerSettings());
              setRoom((current) => (current ? { ...current, game, status: "playing" } : current));
              setRoomMode("online");
              setView("game");
            }, "正在开始对局")
          }
          onLeave={() =>
            guarded(async () => {
              await leaveActiveRoom();
            }, "正在离开房间")
          }
          actionBusy={Boolean(actionBusy) || networkRecovering}
        />
      )}

      {auth && identity && view === "game" && room && currentGame && (
        <GameTable
          room={room}
          game={currentGame}
          identity={identity}
          settings={settings}
          audioManager={audioManager}
          bgmTracks={bgmTracks}
          chatMessages={chatMessages}
          tableGifts={tableGifts}
          chatEnabled={roomMode === "online"}
          onChangeSettings={updateSettings}
          onSendChat={(text) => {
            if (roomMode !== "online") {
              setNotice("练习场不支持联网聊天。");
              return;
            }
            if (!photonClient) {
              setNotice("Photon 未连接。");
              return;
            }
            try {
              photonClient.sendChatMessage(text);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "聊天发送失败。");
            }
          }}
          onSendGift={(toSeatId, giftType) => {
            if (roomMode !== "online") {
              if (!identity) {
                setNotice("请先登录。");
                return;
              }
              const gift: PhotonTableGift = {
                id: `practice-${identity.id}-gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                roomId: room?.id ?? "practice",
                fromPlayerId: identity.id,
                fromPlayerName: identity.name,
                toSeatId,
                giftType,
                sentAt: Date.now(),
              };
              rememberTableGift(gift);
              const targetName = room?.game?.seats.find((seat) => seat.seatId === toSeatId)?.playerName ?? "目标";
              setNotice(`${identity.name} 向 ${targetName} ${giftType === "egg" ? "扔了鸡蛋" : "送了鲜花"}`);
              return;
            }
            if (!photonClient) {
              setNotice("Photon 未连接。");
              return;
            }
            try {
              photonClient.sendTableGift(toSeatId, giftType);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "礼物发送失败。");
            }
          }}
          onAction={(action) =>
              guarded(async () => {
                if (roomMode === "practice") {
                  applyPracticeAction(action);
                  return;
                }
                if (!photonClient) throw new Error("Photon 未连接。");
                const game = await photonClient.sendAction(action);
                setRoom((current) => (current ? { ...current, game } : current));
              }, roomMode === "practice" ? "正在执行操作" : "正在同步操作")
            }
          actionBusy={Boolean(actionBusy) || networkRecovering}
          onBackToLobby={() => {
            setView("lobby");
            setNotice("已返回大厅，对局状态仍保留。");
          }}
          onReconnect={() => reconnectPhoton({ preserveRoom: true })}
          onLeaveRoom={() =>
            guarded(async () => {
              await leaveActiveRoom();
            }, "正在退出房间")
          }
        />
      )}

      {auth &&
        identity &&
        view === "werewolf-game" &&
        room &&
        werewolfPublic && (
          <Suspense fallback={<section className="surface mode-loading">正在载入狼人杀牌桌…</section>}>
            <WerewolfGameTable
              room={room}
              state={werewolfPublic}
              privateState={werewolfPrivate}
              identity={identity}
              settings={settings}
              publicMessages={chatMessages}
              wolfMessages={werewolfWolfMessages}
              actionBusy={Boolean(actionBusy) || networkRecovering}
              canSubmitTimeout={() => photonClient?.canModerateWerewolf() ?? false}
              onAction={(action) =>
                guarded(async () => {
                  if (!photonClient) throw new Error("Photon 未连接。");
                  photonClient.sendWerewolfAction(action);
                }, "正在同步狼人杀操作")
              }
              onSendPublicMessage={(text) => {
                try {
                  photonClient?.sendChatMessage(text);
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : "消息发送失败。");
                }
              }}
              onSendWolfMessage={(text) => {
                try {
                  photonClient?.sendWerewolfWolfMessage(text);
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : "狼队消息发送失败。");
                }
              }}
              onChangeSettings={updateSettings}
              onReconnect={() => reconnectPhoton({ preserveRoom: true })}
              onLeaveRoom={() =>
                guarded(async () => {
                  await leaveActiveRoom();
                }, "正在退出房间")
              }
            />
          </Suspense>
        )}
    </main>
  );
}

function RecoveryPrompt({
  record,
  busy,
  onRecover,
  onIgnore,
}: {
  record: LastRoomRecoveryRecord;
  busy: boolean;
  onRecover: () => void;
  onIgnore: () => void;
}) {
  return (
    <section className="recovery-prompt" role="status">
      <div>
        <strong>检测到未结束对局</strong>
        <span>
          房间 {record.roomCode} · {record.gameKind === "werewolf" ? "狼人杀" : "标准牌局"}
          {record.seatId ? ` · 原座位 ${record.seatId}` : ""}
        </span>
      </div>
      <div className="recovery-actions">
        <button type="button" className="primary" disabled={busy} onClick={onRecover}>恢复对局</button>
        <button type="button" disabled={busy} onClick={onIgnore}>忽略</button>
      </div>
    </section>
  );
}

function ConnectionRecoveryBar({
  status,
  roomCode,
  onRetry,
  onCancel,
}: {
  status: PhotonStatus;
  roomCode: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <aside className="connection-recovery-bar" role="status" aria-live="polite">
      <WifiOff size={16} />
      <div>
        <strong>连接中断，牌桌操作已锁定</strong>
        <span>{status.message} · 房间 {status.roomCode ?? roomCode} · 第 {status.attempt ?? 0} 次</span>
      </div>
      <button type="button" onClick={onRetry}>立即重试</button>
      <button type="button" onClick={onCancel}>取消恢复</button>
    </aside>
  );
}

function HotUpdateSplash({ state }: { state: HotUpdateState }) {
  const label = {
    checking: "检查更新中",
    downloading: `下载中 ${Math.round(state.progress)}%`,
    verifying: "校验资源中",
    complete: "更新完成",
    none: "无更新",
    fallback: "使用本地资源",
  }[state.status];
  return (
    <main className="hot-update-screen">
      <section className="hot-update-card">
        <p className="eyebrow">茂一杀 Android</p>
        <h1>{label}</h1>
        <div className="hot-update-progress" aria-label={`更新进度 ${state.progress}%`}>
          <span style={{ width: `${Math.max(2, Math.min(100, state.progress))}%` }} />
        </div>
        <p>{state.detail}</p>
      </section>
    </main>
  );
}

function LoginPanel({
  loading,
  prefillEmail,
  onLogin,
  setNotice,
}: {
  loading: boolean;
  prefillEmail?: string;
  onLogin: (session: CloudBaseAuthSession) => void;
  setNotice: (message: string) => void;
}) {
  const [rememberedCredentials, setRememberedCredentials] = useState(() => loadRememberedCredentials());
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [loginMethod, setLoginMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState(rememberedCredentials.email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loginChallenge, setLoginChallenge] = useState<CloudBaseEmailCodeChallenge | undefined>();
  const [registerChallenge, setRegisterChallenge] = useState<CloudBaseEmailCodeChallenge | undefined>();
  const [resetChallenge, setResetChallenge] = useState<CloudBasePasswordResetChallenge | undefined>();
  const [remember, setRemember] = useState(rememberedCredentials.rememberEmail);
  const [rememberPassword, setRememberPassword] = useState(rememberedCredentials.rememberPassword);
  const [formStatus, setFormStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const configWarning = getCloudBaseConfigWarning();
  const formBusy = loading || submitting || sendingCode;
  const canSendRegisterCode =
    validateEmail(email) &&
    password.length >= 6 &&
    confirmPassword.length >= 6 &&
    password === confirmPassword;

  useEffect(() => {
    const next = loadRememberedCredentials();
    setRememberedCredentials(next);
    setRemember(next.rememberEmail);
    setRememberPassword(next.rememberPassword);
    if (next.rememberEmail && next.email) setEmail((current) => current.trim() ? current : next.email);
  }, []);

  useEffect(() => {
    const clean = (prefillEmail || "").trim();
    if (!clean || email.trim()) return;
    const next = loadRememberedCredentials();
    if (next.rememberEmail && next.email) {
      setEmail(next.email);
      setRememberedCredentials(next);
      setRememberPassword(next.rememberPassword);
    } else {
      setEmail(clean);
    }
    setRemember(true);
    setFormStatus("已填入上次登录邮箱，请输入密码。");
  }, [prefillEmail, email]);

  useEffect(() => {
    if (!remember || !validateEmail(email)) return;
    rememberEmailOnly(email);
    setRememberedCredentials(loadRememberedCredentials());
  }, [remember, email]);

  useEffect(() => {
    let cancelled = false;
    if (!rememberedCredentials.rememberPassword || !rememberedCredentials.passwordCipher) return;
    const desktopApp = getDesktopBridge();
    if (!desktopApp?.decryptText) {
      setRememberPassword(false);
      return;
    }
    void Promise.resolve(desktopApp.decryptText(rememberedCredentials.passwordCipher))
      .then((value) => {
        if (!cancelled && typeof value === "string") setPassword(value);
      })
      .catch(() => {
        if (!cancelled) {
          setRememberPassword(false);
          forgetRememberedPassword();
          setRememberedCredentials(loadRememberedCredentials());
          setFormStatus("本机加密密码读取失败，请重新输入。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rememberedCredentials.passwordCipher, rememberedCredentials.rememberPassword]);

  function switchMode(nextMode: "login" | "register" | "forgot") {
    setMode(nextMode);
    setFormStatus("");
    setVerificationCode("");
    setLoginChallenge(undefined);
    setRegisterChallenge(undefined);
    setResetChallenge(undefined);
  }

  function updateEmail(nextEmail: string) {
    setEmail(nextEmail);
    setVerificationCode("");
    setLoginChallenge(undefined);
    setRegisterChallenge(undefined);
    setResetChallenge(undefined);
  }

  function updatePassword(nextPassword: string) {
    setPassword(nextPassword);
    if (mode === "register") {
      setVerificationCode("");
      setRegisterChallenge(undefined);
      setResetChallenge(undefined);
    }
  }

  function updateConfirmPassword(nextPassword: string) {
    setConfirmPassword(nextPassword);
    if (mode === "register") {
      setVerificationCode("");
      setRegisterChallenge(undefined);
      setResetChallenge(undefined);
    }
  }

  function switchLoginMethod(nextMethod: "password" | "code") {
    setLoginMethod(nextMethod);
    setFormStatus("");
    setVerificationCode("");
    setLoginChallenge(undefined);
  }

  async function runCurrentAction() {
    if (configWarning) {
      setFormStatus(configWarning);
      setNotice(configWarning);
      return;
    }
    const action = mode === "login" ? submitLogin : mode === "register" ? submitRegister : submitForgot;
    setSubmitting(true);
    setFormStatus(
      mode === "login"
        ? loginMethod === "password" ? "正在密码登录 CloudBase..." : "正在验证码登录 CloudBase..."
        : mode === "register" ? "正在注册账号..." : "正在发送重置邮件..."
    );
    try {
      await action();
      if (mode === "forgot") setFormStatus("重置邮件已发送，请到邮箱继续修改密码。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败，请稍后再试。";
      setFormStatus(message);
      setNotice(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLogin() {
    let session: CloudBaseAuthSession;
    if (loginMethod === "password") {
      validatePasswordLoginInput(email, password);
      session = await loginWithCloudBaseEmail(email, password);
    } else {
      validateCodeLoginInput(email, verificationCode);
      if (!loginChallenge || loginChallenge.email !== email.trim()) throw new Error("请先发送邮箱验证码。");
      session = await loginWithCloudBaseEmailCode(loginChallenge, verificationCode);
    }
    const rememberWarning = await saveRememberedCredentials({
      rememberEmail: remember,
      rememberPassword: remember && rememberPassword && loginMethod === "password",
      email,
      password,
      previousPasswordCipher: loadRememberedCredentials().passwordCipher,
    });
    setRememberedCredentials(loadRememberedCredentials());
    if (rememberWarning) setNotice(rememberWarning);
    onLogin(session);
  }

  async function submitRegister() {
    validateRegisterInput(email, password, confirmPassword);
    if (!registerChallenge || registerChallenge.email !== email.trim()) throw new Error("请先发送邮箱验证码。");
    if (!verificationCode.trim()) throw new Error("请输入邮箱验证码。");
    setFormStatus("正在提交验证码并注册...");
    try {
      const session = await registerWithCloudBaseEmailCode(registerChallenge, verificationCode);
      const rememberWarning = await saveRememberedCredentials({
        rememberEmail: remember,
        rememberPassword: remember && rememberPassword,
        email,
        password,
        previousPasswordCipher: loadRememberedCredentials().passwordCipher,
      });
      setRememberedCredentials(loadRememberedCredentials());
      if (rememberWarning) setNotice(rememberWarning);
      setFormStatus("注册成功，正在进入游戏...");
      onLogin(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败。";
      if (message.includes("注册已提交")) {
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setFormStatus(message);
        setNotice(message);
        return;
      }
      throw error;
    }
  }

  async function sendLoginCode() {
    try {
      if (configWarning) throw new Error(configWarning);
      if (!validateEmail(email)) throw new Error("邮箱格式错误。");
      setSendingCode(true);
      setFormStatus("正在发送邮箱验证码...");
      const challenge = await requestCloudBaseEmailLoginCode(email);
      setLoginChallenge(challenge);
      setFormStatus("验证码已发送，请查看邮箱。");
      setNotice("验证码已发送，请查看邮箱。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "验证码发送失败。";
      setFormStatus(message);
      setNotice(message);
    } finally {
      setSendingCode(false);
    }
  }

  async function sendRegisterCode() {
    try {
      if (configWarning) throw new Error(configWarning);
      validateRegisterInput(email, password, confirmPassword);
      setSendingCode(true);
      setFormStatus("正在发送注册验证码...");
      const challenge = await requestCloudBaseEmailRegisterCode(email, password);
      setRegisterChallenge(challenge);
      setFormStatus("验证码已发送，请查看邮箱。");
      setNotice("验证码已发送，请查看邮箱。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "验证码发送失败。";
      setFormStatus(message);
      setNotice(message);
    } finally {
      setSendingCode(false);
    }
  }

  async function submitForgot() {
    validateRegisterInput(email, password, confirmPassword);
    if (!resetChallenge || resetChallenge.email !== email.trim()) throw new Error("请先发送密码重置验证码。");
    if (!verificationCode.trim()) throw new Error("请输入邮箱验证码。");
    const session = await resetCloudBasePasswordWithCode(resetChallenge, verificationCode, password);
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setResetChallenge(undefined);
    setNotice("密码已重置。");
    if (session) {
      const rememberWarning = await saveRememberedCredentials({
        rememberEmail: remember,
        rememberPassword: remember && rememberPassword,
        email,
        password,
        previousPasswordCipher: loadRememberedCredentials().passwordCipher,
      });
      setRememberedCredentials(loadRememberedCredentials());
      if (rememberWarning) setNotice(rememberWarning);
      onLogin(session);
    } else {
      setMode("login");
      setFormStatus("密码重置邮件已发送，请按邮件链接完成改密。");
    }
  }

  async function sendResetCode() {
    try {
      if (configWarning) throw new Error(configWarning);
      if (!validateEmail(email)) throw new Error("邮箱格式错误。");
      if (password.length < 6) throw new Error("新密码长度至少 6 位。");
      if (password !== confirmPassword) throw new Error("两次密码不一致。");
      setSendingCode(true);
      setFormStatus("正在发送密码重置验证码...");
      const challenge = await requestCloudBasePasswordResetCode(email);
      setResetChallenge(challenge);
      setFormStatus("验证码已发送，请查看邮箱。");
      setNotice("验证码已发送，请查看邮箱。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "验证码发送失败。";
      setFormStatus(message);
      setNotice(message);
    } finally {
      setSendingCode(false);
    }
  }

  return (
    <section className="login-layout immersive-login">
      <form
        className="login-panel login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void runCurrentAction();
        }}
      >
        <div className="connection-bar online">
          <span>纯客户端模式</span>
          <strong>CloudBase Auth 校验账号，Photon 同步牌局。</strong>
        </div>
        {configWarning && <div className="form-status" aria-live="polite">{configWarning}</div>}

        {mode === "login" && (
          <>
            <h2>邮箱登录</h2>
            <div className="auth-tabs" role="tablist" aria-label="登录方式">
              <button
                type="button"
                className={loginMethod === "password" ? "active" : ""}
                disabled={formBusy}
                onClick={() => switchLoginMethod("password")}
              >
                密码登录
              </button>
              <button
                type="button"
                className={loginMethod === "code" ? "active" : ""}
                disabled={formBusy}
                onClick={() => switchLoginMethod("code")}
              >
                验证码登录
              </button>
            </div>
            <label>邮箱<input value={email} onChange={(event) => updateEmail(event.target.value)} autoComplete="email" /></label>
            {loginMethod === "password" ? (
              <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            ) : (
              <label>邮箱验证码<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => {
                  setRemember(event.target.checked);
                  if (event.target.checked) {
                    rememberEmailOnly(email);
                    setRememberedCredentials(loadRememberedCredentials());
                  } else {
                    setRememberPassword(false);
                    clearRememberedCredentials();
                    setRememberedCredentials(loadRememberedCredentials());
                    setFormStatus("已清除本机记住邮箱和密码。");
                  }
                }}
              />
              记住邮箱
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={remember && rememberPassword}
                disabled={!remember || loginMethod !== "password"}
                onChange={(event) => setRememberPassword(event.target.checked)}
              />
              记住密码（仅 Windows 本机加密）
            </label>
            {remember && rememberPassword && loginMethod === "password" && (
              <small className="auth-secure-note">密码只保存为本机加密密文，Android 和浏览器不会保存密码。</small>
            )}
            {formStatus && <div className="form-status" aria-live="polite">{formStatus}</div>}
            {loginMethod === "code" && (
              <button type="button" disabled={formBusy || Boolean(configWarning) || !validateEmail(email)} onClick={() => void sendLoginCode()}>
                {sendingCode ? "发送中..." : "发送验证码"}
              </button>
            )}
            <button type="submit" disabled={formBusy || Boolean(configWarning)}>
              <DoorOpen size={16} /> {submitting ? "登录中..." : "登录"}
            </button>
            <div className="auth-secondary-actions">
              <button type="button" disabled={formBusy} onClick={() => switchMode("register")}>去注册</button>
              <button type="button" disabled={formBusy} onClick={() => switchMode("forgot")}>忘记密码</button>
            </div>
          </>
        )}

        {mode === "register" && (
          <>
            <h2>邮箱验证码注册</h2>
            <label>邮箱<input value={email} onChange={(event) => updateEmail(event.target.value)} autoComplete="email" /></label>
            <label>密码<input type="password" value={password} onChange={(event) => updatePassword(event.target.value)} autoComplete="new-password" /></label>
            <label>确认密码<input type="password" value={confirmPassword} onChange={(event) => updateConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
            <label>邮箱验证码<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
            {formStatus && <div className="form-status" aria-live="polite">{formStatus}</div>}
            <button type="button" disabled={formBusy || Boolean(configWarning) || !canSendRegisterCode} onClick={() => void sendRegisterCode()}>
              {sendingCode ? "发送中..." : "发送验证码"}
            </button>
            <button type="submit" disabled={formBusy || Boolean(configWarning)}>{submitting ? "注册中..." : "注册"}</button>
            <button type="button" disabled={formBusy} onClick={() => switchMode("login")}>返回登录</button>
          </>
        )}

        {mode === "forgot" && (
          <>
            <h2>忘记密码</h2>
            <label>邮箱<input value={email} onChange={(event) => updateEmail(event.target.value)} autoComplete="email" /></label>
            <label>新密码<input type="password" value={password} onChange={(event) => updatePassword(event.target.value)} autoComplete="new-password" /></label>
            <label>确认密码<input type="password" value={confirmPassword} onChange={(event) => updateConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
            <label>邮箱验证码<input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
            {formStatus && <div className="form-status" aria-live="polite">{formStatus}</div>}
            <button type="button" disabled={formBusy || Boolean(configWarning) || !validateEmail(email) || password.length < 6 || password !== confirmPassword} onClick={() => void sendResetCode()}>
              {sendingCode ? "发送中..." : "发送验证码"}
            </button>
            <button type="submit" disabled={formBusy || Boolean(configWarning)}>{submitting ? "重置中..." : "重置密码"}</button>
            <button type="button" disabled={formBusy} onClick={() => switchMode("login")}>返回登录</button>
          </>
        )}
      </form>
    </section>
  );
}

function CardMessagesPanel({
  user,
  setNotice,
}: {
  user: UserProfile;
  setNotice: (message: string) => void;
}) {
  const [receiverOpenid, setReceiverOpenid] = useState("");
  const [msgText, setMsgText] = useState("");
  const [imageFile, setImageFile] = useState<File | undefined>();
  const [fileInputKey, setFileInputKey] = useState(0);
  const [messages, setMessages] = useState<CardMessageRecord[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");

  useEffect(() => {
    void refreshMessages();
  }, []);

  async function refreshMessages() {
    setBusy(true);
    try {
      const list = await loadUnreadCardMessages();
      setMessages(list);
      setLastError("");
      setLastCheckedAt(new Date().toLocaleString());
      setNotice(`已拉取 ${list.length} 条未读卡牌。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未读卡牌拉取失败。";
      setLastError(message);
      setLastCheckedAt(new Date().toLocaleString());
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage() {
    setBusy(true);
    try {
      if (!imageFile) throw new Error("请选择一张图片。");
      await sendCardMessage({
        senderOpenid: user.uid,
        receiverOpenid,
        msgText,
        imageFile,
      });
      setReceiverOpenid("");
        setMsgText("");
        setImageFile(undefined);
        setFileInputKey((value) => value + 1);
        setLastError("");
        setNotice("卡牌已发送。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "卡牌发送失败。";
      setLastError(message);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function revealImage(message: CardMessageRecord) {
    if (imageUrls[message.id]) return;
    setBusy(true);
    try {
      const url = await downloadCardImage(message.cardFileID);
      setImageUrls((current) => ({ ...current, [message.id]: url }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片下载失败。";
      setLastError(message);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-grid message-board">
      <form
        className="surface card-message-send"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <div>
          <p className="eyebrow">CloudBase card-messages</p>
          <h2>发送卡牌</h2>
        </div>
        <div className="uid-box">
          <span>我的 openid</span>
          <strong>{user.uid}</strong>
        </div>
        <div className={`diagnostic-panel ${lastError ? "error" : ""}`}>
          <strong>诊断信息</strong>
          <span>拉取函数：{CARD_MESSAGE_FUNCTIONS.inbox}</span>
          <span>图片函数：{CARD_MESSAGE_FUNCTIONS.image}</span>
          <span>最近检查：{lastCheckedAt || "尚未完成"}</span>
          <span>最近错误：{lastError || "无"}</span>
          <button type="button" onClick={() => void refreshMessages()} disabled={busy}>
            <RefreshCw size={14} /> 重试拉取
          </button>
        </div>
        <label>
          接收方 openid
          <input value={receiverOpenid} onChange={(event) => setReceiverOpenid(event.target.value)} placeholder="粘贴对方 openid" />
        </label>
        <label>
          文字
          <textarea value={msgText} onChange={(event) => setMsgText(event.target.value)} maxLength={300} placeholder="输入一段自定义文字" />
        </label>
        <label>
          图片
          <input
            key={fileInputKey}
            type="file"
            accept="image/*"
            onChange={(event) => setImageFile(event.target.files?.[0])}
          />
        </label>
        {imageFile && <p className="muted">已选择：{imageFile.name}，发送前会压缩到最长边 1280px。</p>}
        <button type="submit" disabled={busy}>
          <Send size={16} /> 发送
        </button>
      </form>

      <div className="surface wide card-message-inbox">
        <div className="section-title">
          <div>
            <p className="eyebrow">getUserCardMsg</p>
            <h2>未读卡牌</h2>
          </div>
          <button onClick={() => void refreshMessages()} disabled={busy}>
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
        <div className="message-list">
          {messages.length === 0 && (
            <p className="muted"><Inbox size={16} /> 暂无未读卡牌。</p>
          )}
          {messages.map((message) => (
            <article className="message-card" key={message.id}>
              <div className="message-meta">
                <span><Mail size={14} /> {message.senderOpenid || "未知发送者"}</span>
                <small>{formatSendTime(message.sendTime)}</small>
              </div>
              <p>{message.msgText}</p>
              {imageUrls[message.id] ? (
                <button className="message-image" type="button" onClick={() => window.open(imageUrls[message.id], "_blank")}>
                  <img src={imageUrls[message.id]} alt="收到的卡牌图片" />
                </button>
              ) : (
                <button type="button" onClick={() => void revealImage(message)} disabled={busy || !message.cardFileID}>
                  <ImageIcon size={16} /> 点击加载图片
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Lobby({
  user,
  characters,
  appContent,
  settings,
  audioManager,
  bgmTracks,
  photonReady,
  notice,
  noticeDetail,
  actionBusy,
  rooms,
  networkReady,
  onRefresh,
  onCreate,
  onJoin,
  onCopyUid,
  onCopyText,
  onReconnect,
  onChangeSettings,
  onNavigate,
}: {
  user: UserProfile;
  characters: CharacterDefinition[];
  appContent: AppContent;
  settings: GameSettings;
  audioManager: AudioManager;
  bgmTracks: AudioTrack[];
  photonReady: boolean;
  notice: string;
  noticeDetail: string;
  actionBusy?: string;
  rooms: RoomSnapshot[];
  networkReady: boolean;
  onRefresh: () => void;
  onCreate: (
    name: string,
    maxPlayers: number,
    gameKind: "card" | "werewolf"
  ) => void;
  onJoin: (roomId: string) => void;
  onCopyUid: () => void;
  onCopyText: (text: string, message: string) => void;
  onReconnect: () => void;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
  onNavigate: (view: AppView) => void;
}) {
  const defaultRoomCode = `${settings.roomPrefix || "ROOM"}-1001`;
  const [roomCode, setRoomCode] = useState(defaultRoomCode);
  const [joinCode, setJoinCode] = useState(defaultRoomCode);
  const [maxPlayers, setMaxPlayers] = useState(settings.defaultMaxPlayers);
  const [gameKind, setGameKind] = useState<"card" | "werewolf">("card");
  const [roomFilter, setRoomFilter] = useState<"all" | "waiting" | "playing">("all");
  const [profileOpen, setProfileOpen] = useState(!settings.compactLobbyTools);
  const [toolsOpen, setToolsOpen] = useState(!settings.compactLobbyTools);
  const [mobilePanel, setMobilePanel] = useState<"create" | "join" | "rooms" | "profile" | "tools" | "">("");
  const [desktopPanel, setDesktopPanel] = useState<"create" | "join" | "rooms" | "notice" | "profile" | "tools" | "">("");
  const liveRooms = rooms.filter((room) => room.seats.some((seat) => seat.connected));
  const waitingRooms = liveRooms.filter((room) => room.status === "waiting").length;
  const displayedRooms = liveRooms.filter((room) => roomFilter === "all" || room.status === roomFilter);
  const joinableRooms = liveRooms.filter((room) => room.status === "waiting");
  const lastRoomCode = getRecentRoomCode();
  const activeSeatCount = liveRooms.reduce((sum, room) => sum + room.seats.filter((seat) => seat.connected).length, 0);
  const approvedCharacters = useMemo(() => characters.filter((character) => character.status === "approved"), [characters]);
  const featuredCharacters = approvedCharacters.slice(0, 3);
  const showLobbyVideo = settings.showLobbyVideo && !settings.reduceMotion;

  useEffect(() => {
    setMaxPlayers(settings.defaultMaxPlayers);
  }, [settings.defaultMaxPlayers]);

  useEffect(() => {
    setProfileOpen(!settings.compactLobbyTools);
    setToolsOpen(!settings.compactLobbyTools);
  }, [settings.compactLobbyTools]);

  function randomizeRoomCode() {
    const next = createLocalRoomCode(settings.roomPrefix);
    setRoomCode(next);
    setJoinCode(next);
  }

  function getMaxPlayersFor(kind: "card" | "werewolf") {
    const next =
      kind === "werewolf"
        ? Math.max(5, Math.min(8, Math.round(maxPlayers || 5)))
        : clampPlayerLimit(maxPlayers);
    if (next !== maxPlayers) setMaxPlayers(next);
    return next;
  }

  function createRoomOfKind(kind: "card" | "werewolf") {
    const nextCode = sanitizeRoomCode(roomCode);
    setRoomCode(nextCode);
    onCreate(nextCode, getMaxPlayersFor(kind), kind);
  }

  function createCurrentRoom() {
    createRoomOfKind(gameKind);
  }

  function selectGameKind(nextKind: "card" | "werewolf") {
    setGameKind(nextKind);
    if (nextKind === "werewolf" && maxPlayers < 5) setMaxPlayers(5);
  }

  function joinCurrentRoom(code: string) {
    const nextCode = sanitizeRoomCode(code);
    setJoinCode(nextCode);
    onJoin(nextCode);
  }

  if (isAndroidNative) {
    return (
      <section className="mobile-lobby">
        <div className="mobile-lobby-status">
          <button type="button" onClick={() => setMobilePanel("profile")}>
            <PlayerAvatar user={user} />
            <span>
              <strong>{user.displayName}</strong>
              <small>{photonReady ? "Photon 已连接" : "Photon 未连接"}</small>
            </span>
          </button>
          <span className={`mini-status ${photonReady ? "online" : "offline"}`}>
            {photonReady ? "可联机" : "离线"}
          </span>
        </div>

        <div className="mobile-lobby-hero">
          <div>
            <p>选择玩法</p>
            <h2>今天想玩哪一局？</h2>
          </div>
          <div className="mobile-mode-grid">
            <button type="button" className="primary" onClick={() => { selectGameKind("card"); setMobilePanel("create"); }}>
              <Swords size={28} />
              <strong>联机牌局</strong>
              <span>2-8 人实时对战</span>
            </button>
            <button type="button" onClick={() => onNavigate("practice")}>
              <Gamepad2 size={28} />
              <strong>练习场</strong>
              <span>单机人机对战</span>
            </button>
            <button type="button" onClick={() => { selectGameKind("werewolf"); setMobilePanel("create"); }}>
              <Users size={28} />
              <strong>狼人杀</strong>
              <span>5-8 人语音局</span>
            </button>
            <button type="button" disabled={!lastRoomCode || Boolean(actionBusy)} onClick={onReconnect}>
              <RefreshCw size={28} />
              <strong>重回上局</strong>
              <span>{lastRoomCode || "暂无记录"}</span>
            </button>
          </div>
        </div>

        <div className="mobile-lobby-dock">
          <button type="button" onClick={() => setMobilePanel("create")}><Plus size={20} /><span>创建</span></button>
          <button type="button" onClick={() => setMobilePanel("join")}><DoorOpen size={20} /><span>加入</span></button>
          <button type="button" onClick={() => { onRefresh(); setMobilePanel("rooms"); }}><Gamepad2 size={20} /><span>房间</span></button>
          <button type="button" onClick={() => setMobilePanel("tools")}><SlidersHorizontal size={20} /><span>更多</span></button>
        </div>

        {mobilePanel && (
          <div className="mobile-sheet-backdrop" role="presentation" onClick={() => setMobilePanel("")}>
            <section className={`mobile-sheet mobile-sheet-${mobilePanel}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-head">
                <div>
                  <small>茂一杀移动端</small>
                  <h2>
                    {mobilePanel === "create" ? "创建房间" :
                      mobilePanel === "join" ? "加入房间" :
                      mobilePanel === "rooms" ? "公开房间" :
                      mobilePanel === "profile" ? "账号信息" : "更多功能"}
                  </h2>
                </div>
                <button type="button" onClick={() => setMobilePanel("")}>关闭</button>
              </div>

              {mobilePanel === "create" && (
                <div className="mobile-create-panel">
                  <div className="segmented">
                    <button type="button" className={gameKind === "card" ? "selected" : ""} onClick={() => selectGameKind("card")}>茂一杀</button>
                    <button type="button" className={gameKind === "werewolf" ? "selected" : ""} onClick={() => selectGameKind("werewolf")}>狼人杀</button>
                  </div>
                  <label>房间号<input value={roomCode} onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))} /></label>
                  <label>人数
                    <select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>
                      {Array.from({ length: gameKind === "werewolf" ? 4 : 7 }, (_, index) => index + (gameKind === "werewolf" ? 5 : 2)).map((count) => (
                        <option value={count} key={count}>{count} 人</option>
                      ))}
                    </select>
                  </label>
                  <div className="mobile-sheet-actions">
                    <button type="button" onClick={randomizeRoomCode}><Shuffle size={16} /> 随机房间号</button>
                    <button className="primary" disabled={!networkReady || Boolean(actionBusy) || !roomCode.trim()} onClick={createCurrentRoom}><Plus size={16} /> 创建并进入</button>
                  </div>
                </div>
              )}

              {mobilePanel === "join" && (
                <div className="mobile-join-panel">
                  <label>房间号<input value={joinCode} onChange={(event) => setJoinCode(sanitizeRoomCode(event.target.value))} autoFocus /></label>
                  <button className="primary" disabled={!networkReady || Boolean(actionBusy) || !joinCode.trim()} onClick={() => joinCurrentRoom(joinCode)}>
                    <DoorOpen size={18} /> 加入房间
                  </button>
                </div>
              )}

              {mobilePanel === "rooms" && (
                <div className="mobile-room-browser">
                  <div className="segmented">
                    <button className={roomFilter === "all" ? "selected" : ""} onClick={() => setRoomFilter("all")}>全部</button>
                    <button className={roomFilter === "waiting" ? "selected" : ""} onClick={() => setRoomFilter("waiting")}>可加入</button>
                    <button className={roomFilter === "playing" ? "selected" : ""} onClick={() => setRoomFilter("playing")}>对局中</button>
                  </div>
                  <div className="mobile-room-list">
                    {displayedRooms.length === 0 && <div className="mobile-empty">暂无符合条件的公开房间</div>}
                    {displayedRooms.map((listedRoom) => (
                      <article key={listedRoom.id}>
                        <div>
                          <strong>{listedRoom.name}</strong>
                          <span>{listedRoom.gameKind === "werewolf" ? "狼人杀" : "卡牌"} · {listedRoom.seats.length}/{listedRoom.maxPlayers} 人</span>
                        </div>
                        <button disabled={listedRoom.status !== "waiting" || Boolean(actionBusy)} onClick={() => joinCurrentRoom(listedRoom.id)}>加入</button>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {mobilePanel === "profile" && (
                <div className="mobile-profile-panel">
                  <PlayerAvatar user={user} />
                  <div><strong>{user.displayName}</strong><span>{user.email}</span></div>
                  <div className="uid-box"><span>UID/openid</span><strong>{user.uid}</strong></div>
                  <button onClick={onCopyUid}><Copy size={16} /> 复制 UID</button>
                  <button onClick={onReconnect}><RotateCw size={16} /> 重连 Photon</button>
                </div>
              )}

              {mobilePanel === "tools" && (
                <div className="mobile-tool-grid">
                  <button onClick={() => onNavigate("preview")}><BookOpen size={22} />卡牌预览</button>
                  <button onClick={() => onNavigate("messages")}><Mail size={22} />卡牌收发</button>
                  <button onClick={() => onNavigate("settings")}><Settings size={22} />设置</button>
                  <button onClick={() => setMobilePanel("rooms")}><RefreshCw size={22} />房间列表</button>
                  <div className="mobile-music-panel">
                    <MusicControl settings={settings} audioManager={audioManager} bgmTracks={bgmTracks} scene="lobby" onChangeSettings={onChangeSettings} />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className={`lobby-board lobby-main-menu ${desktopPanel ? "panel-open" : ""}`}>
      <div className="lobby-scene-bg" aria-hidden="true" />
      <header className="lobby-scene-topbar">
        <button type="button" className="lobby-profile-chip" onClick={() => setDesktopPanel("profile")}>
          <PlayerAvatar user={user} />
          <span>
            <strong>{user.displayName}</strong>
            <small>{user.role === "admin" ? "管理员" : "玩家"} · {photonReady ? "Photon 在线" : "Photon 离线"}</small>
          </span>
        </button>
        <div className="lobby-resource-strip" aria-label="大厅状态">
          <span>v{appContent.appVersion}</span>
          <span>{liveRooms.length} 房间</span>
          <span>{waitingRooms} 可加入</span>
          <span>{activeSeatCount} 在线座位</span>
        </div>
      </header>

      <aside className="lobby-side-actions" aria-label="快捷入口">
        <button type="button" onClick={() => setDesktopPanel("profile")}><UserRound size={18} /><span>账号</span></button>
        <button type="button" onClick={() => { onRefresh(); setDesktopPanel("rooms"); }}><Gamepad2 size={18} /><span>房间</span></button>
        <button type="button" onClick={() => setDesktopPanel("notice")}><ListChecks size={18} /><span>公告</span></button>
        <button type="button" onClick={() => setDesktopPanel("tools")}><SlidersHorizontal size={18} /><span>工具</span></button>
      </aside>

      <section className="lobby-mode-stage">
        <div className="lobby-cinematic-column">
          <div className="lobby-compact-title">
            <span className={`lobby-signal ${photonReady ? "online" : "offline"}`}>
              {photonReady ? <Wifi size={16} /> : <WifiOff size={16} />}
              {photonReady ? "中国区大厅已连接" : "离线模式"}
            </span>
            <div>
              <p>墨黑铜金主厅</p>
              <h2>茂一杀</h2>
              <small title={noticeDetail}>{notice}</small>
            </div>
          </div>
          {showLobbyVideo && (
            <div className="lobby-cinematic-frame is-video" aria-label="大厅循环视觉">
              <video
                className="lobby-cinematic-video"
                src="/assets/ui/lobby/lobby-loop.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
              <div className="lobby-cinematic-shine" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="lobby-mode-panel" aria-label="选择玩法">
          <button className="lobby-mode-card primary" type="button" disabled={!networkReady || Boolean(actionBusy)} onClick={() => { selectGameKind("card"); createRoomOfKind("card"); }}>
            <span className="mode-emblem"><Swords size={30} /></span>
            <span><strong>茂一杀</strong><small>创建 {settings.defaultMaxPlayers} 人牌局</small></span>
          </button>
          <button className="lobby-mode-card ranked" type="button" disabled={!networkReady || Boolean(actionBusy)} onClick={() => { selectGameKind("werewolf"); createRoomOfKind("werewolf"); }}>
            <span className="mode-emblem"><Users size={30} /></span>
            <span><strong>狼人杀</strong><small>5-8 人语音局</small></span>
          </button>
          <button className="lobby-mode-card" type="button" onClick={() => onNavigate("practice")}>
            <span className="mode-emblem"><Gamepad2 size={26} /></span>
            <span><strong>练习场</strong><small>单机人机练牌</small></span>
          </button>
          <button className="lobby-mode-card" type="button" disabled={!lastRoomCode || Boolean(actionBusy)} onClick={onReconnect}>
            <span className="mode-emblem"><RefreshCw size={26} /></span>
            <span><strong>重回上局</strong><small>{lastRoomCode || "暂无记录"}</small></span>
          </button>
        </div>
      </section>

      <nav className="lobby-bottom-nav" aria-label="大厅导航">
        <button type="button" onClick={() => setDesktopPanel("create")}><Plus size={20} /><span>建房</span></button>
        <button type="button" onClick={() => { onRefresh(); setDesktopPanel("join"); }}><DoorOpen size={20} /><span>加入</span></button>
        <button type="button" onClick={() => onNavigate("preview")}><BookOpen size={20} /><span>武将</span></button>
        <button type="button" onClick={() => onNavigate("messages")}><Mail size={20} /><span>卡牌</span></button>
        <button type="button" onClick={() => setDesktopPanel("notice")}><Inbox size={20} /><span>公告</span></button>
        <button type="button" onClick={() => onNavigate("settings")}><Settings size={20} /><span>设置</span></button>
      </nav>

      {desktopPanel && (
        <div className="lobby-overlay-backdrop" role="presentation" onClick={() => setDesktopPanel("")}>
          <section className={`lobby-overlay-panel panel-${desktopPanel}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="lobby-overlay-head">
              <div>
                <p>{desktopPanel === "rooms" ? "Photon Cloud" : desktopPanel === "notice" ? `公告 v${appContent.announcementVersion}` : "大厅菜单"}</p>
                <h2>
                  {desktopPanel === "create" ? "创建房间" :
                    desktopPanel === "join" ? "加入房间" :
                    desktopPanel === "rooms" ? "房间列表" :
                    desktopPanel === "notice" ? appContent.announcementTitle :
                    desktopPanel === "profile" ? "账号信息" : "牌桌工具"}
                </h2>
              </div>
              <button type="button" onClick={() => setDesktopPanel("")}>关闭</button>
            </div>

            {desktopPanel === "create" && (
              <div className="lobby-panel-grid">
                <div className="segmented lobby-mode-select" aria-label="房间玩法">
                  <button type="button" className={gameKind === "card" ? "selected" : ""} onClick={() => selectGameKind("card")}>茂一杀牌局</button>
                  <button type="button" className={gameKind === "werewolf" ? "selected" : ""} onClick={() => selectGameKind("werewolf")}>狼人杀 5-8 人</button>
                </div>
                {gameKind === "werewolf" && <div className="werewolf-preset-preview"><strong>{maxPlayers} 人标准板型</strong><span>{describeWerewolfPreset(maxPlayers)}</span></div>}
                <div className="room-code-grid">
                  <label>房间号<input value={roomCode} onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))} /></label>
                  <label>人数上限<input type="number" min={gameKind === "werewolf" ? 5 : 2} max={8} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} /></label>
                </div>
                <div className="button-row">
                  <button disabled={!networkReady || Boolean(actionBusy) || !roomCode.trim()} onClick={createCurrentRoom}><Plus size={16} /> 创建房间</button>
                  <button type="button" onClick={randomizeRoomCode}><Shuffle size={16} /> 随机号</button>
                  <button type="button" onClick={() => onCopyText(roomCode, "房间号已复制。")}><Copy size={16} /> 复制</button>
                </div>
              </div>
            )}

            {desktopPanel === "join" && (
              <div className="lobby-panel-grid">
                <label>输入房间号<input value={joinCode} onChange={(event) => setJoinCode(sanitizeRoomCode(event.target.value))} autoFocus /></label>
                <button className="primary" disabled={!networkReady || Boolean(actionBusy) || !joinCode.trim()} onClick={() => joinCurrentRoom(joinCode)}><DoorOpen size={16} /> 加入房间</button>
                {!networkReady && <p className="muted">Photon 未连接时不能创建或加入房间。</p>}
                <div className="segmented">
                  <span>公开房间</span>
                  <button type="button" onClick={onRefresh} disabled={Boolean(actionBusy)}><RefreshCw size={14} /> 刷新</button>
                </div>
                <div className="room-list join-room-list">
                  {joinableRooms.length === 0 && (
                    <div className="empty-state">
                      <Gamepad2 size={28} />
                      <strong>暂无可加入公开房间</strong>
                      <span>可手动输入房间号，或创建新房间。</span>
                    </div>
                  )}
                  {joinableRooms.map((room) => (
                    <article className="room-row" key={room.id}>
                      <div>
                        <strong>{room.name}</strong>
                        <span>{room.gameKind === "werewolf" ? "狼人杀" : "卡牌"} · {room.seats.length}/{room.maxPlayers} · 等待中</span>
                      </div>
                      <div className="room-row-actions">
                        <button type="button" onClick={() => setJoinCode(room.id)}><Copy size={14} /> 填入</button>
                        <button type="button" disabled={Boolean(actionBusy)} onClick={() => joinCurrentRoom(room.id)}>加入</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {desktopPanel === "rooms" && (
              <div className="lobby-panel-grid">
                <div className="segmented">
                  <button className={roomFilter === "all" ? "selected" : ""} onClick={() => setRoomFilter("all")}>全部</button>
                  <button className={roomFilter === "waiting" ? "selected" : ""} onClick={() => setRoomFilter("waiting")}>可加入</button>
                  <button className={roomFilter === "playing" ? "selected" : ""} onClick={() => setRoomFilter("playing")}>对局中</button>
                  <button onClick={onRefresh} disabled={Boolean(actionBusy)}><RefreshCw size={14} /> 刷新</button>
                </div>
                <div className="room-list">
                  {displayedRooms.length === 0 && <div className="empty-state"><Gamepad2 size={28} /><strong>{rooms.length === 0 ? "暂无公开房间" : "当前筛选没有房间"}</strong><span>可直接创建房间，或输入房间号加入。</span></div>}
                  {displayedRooms.map((room) => (
                    <article className="room-row" key={room.id}>
                      <div>
                        <strong>{room.name}</strong>
                        <span>{room.gameKind === "werewolf" ? "狼人杀" : "卡牌"} · {room.seats.length}/{room.maxPlayers} · {room.status === "waiting" ? "等待中" : room.status === "playing" ? "对局中" : "已结束"}</span>
                      </div>
                      <div className="room-row-actions">
                        <button onClick={() => onCopyText(room.id, "房间号已复制。")}><Copy size={14} /> 复制</button>
                        <button disabled={room.status !== "waiting" || Boolean(actionBusy)} onClick={() => joinCurrentRoom(room.id)}>加入</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {desktopPanel === "notice" && (
              <div className="lobby-panel-grid">
                <ul className="announcement-list">{appContent.announcementItems.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}

            {desktopPanel === "profile" && (
              <div className="lobby-panel-grid">
                <div className="profile-head"><PlayerAvatar user={user} /><div><p className="eyebrow">当前账号</p><h2>{user.displayName}</h2></div></div>
                <div className="profile-lines">
                  <span><UserRound size={14} /> {user.email}</span>
                  <span><BadgeCheck size={14} /> {user.role === "admin" ? "管理员" : "玩家"}</span>
                  <span>{photonReady ? <Wifi size={14} /> : <WifiOff size={14} />} {photonReady ? "Photon 已连接" : "Photon 未连接"}</span>
                </div>
                <div className="uid-box"><span>UID/openid</span><strong>{user.uid}</strong></div>
                <button onClick={onCopyUid}><Copy size={16} /> 复制 UID</button>
              </div>
            )}

            {desktopPanel === "tools" && (
              <div className="lobby-panel-grid">
                <MusicControl settings={settings} audioManager={audioManager} bgmTracks={bgmTracks} scene="lobby" compact onChangeSettings={onChangeSettings} />
                <div className={`lobby-status-card ${photonReady ? "online" : "offline"}`} title={noticeDetail}>
                  <strong>{photonReady ? "Photon 已连接" : "Photon 未连接"}</strong>
                  <span>{notice}</span>
                  <button type="button" onClick={onReconnect}><RotateCw size={14} /> 重连 Photon</button>
                </div>
                {settings.showRuleTips && (
                  <div className="rule-panel">
                    <h3><BookOpen size={16} /> 规则提示</h3>
                    <p>出牌、响应、弃牌、结束回合由 Photon 同步；战况、聊天和设置默认收进抽屉。</p>
                    <div className="card-chip-list">{CORE_CARD_NAMES.slice(0, 12).map((name) => <span key={name}>{name}</span>)}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function AnnouncementCard({ content }: { content: AppContent }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ANNOUNCEMENT_DISMISS_KEY) === content.announcementVersion);
  useEffect(() => {
    setDismissed(localStorage.getItem(ANNOUNCEMENT_DISMISS_KEY) === content.announcementVersion);
  }, [content.announcementVersion]);
  if (dismissed) {
    return (
      <button
        type="button"
        className="announcement-tab"
        onClick={() => setDismissed(false)}
        title={`${content.announcementTitle} · v${content.announcementVersion}`}
      >
        公告 v{content.announcementVersion}
      </button>
    );
  }

  return (
    <aside className="announcement-card">
      <div>
        <strong>{content.announcementTitle}</strong>
        <span>v{content.announcementVersion}</span>
      </div>
      <ul>
        {content.announcementItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, content.announcementVersion);
          setDismissed(true);
        }}
      >
        收起
      </button>
    </aside>
  );
}

function SettingsPanel({
  user,
  settings,
  audioManager,
  bgmTracks,
  photonReady,
  actionBusy,
  onBack,
  onChangeSettings,
  onSaveNickname,
  onReconnect,
  onResetSettings,
  onClearLastRoom,
  onCopyNetworkDiagnostics,
  onClearNetworkDiagnostics,
  onClearRemember,
}: {
  user: UserProfile;
  settings: GameSettings;
  audioManager: AudioManager;
  bgmTracks: AudioTrack[];
  photonReady: boolean;
  actionBusy?: string;
  onBack: () => void;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
  onSaveNickname: (nickname: string) => void;
  onReconnect: () => void;
  onResetSettings: () => void;
  onClearLastRoom: () => void;
  onCopyNetworkDiagnostics: () => void;
  onClearNetworkDiagnostics: () => void;
  onClearRemember: () => void;
}) {
  const [nickname, setNickname] = useState(user.displayName);
  const [settingsTab, setSettingsTab] = useState<"visual" | "battle" | "keys" | "audio" | "network" | "update" | "account">("visual");
  const nicknameValid = normalizeNickname(nickname).length >= 2 && normalizeNickname(nickname).length <= 16;
  const desktopApp = getDesktopBridge();
  const networkMetrics = loadNetworkMetrics();
  return (
    <section className="settings-board">
      <div className="surface settings-panel settings-shell">
        <div className="section-title settings-title">
          <div>
            <p className="eyebrow">本地设置</p>
            <h2>设置</h2>
          </div>
          <button onClick={onBack}>返回大厅</button>
        </div>
        <div className="settings-tabs" role="tablist" aria-label="设置分类">
          {[
            ["visual", "画面"],
            ["battle", "对局"],
            ["keys", "键位"],
            ["audio", "音频"],
            ["network", "联机"],
            ["update", "热更新"],
            ["account", "账号/诊断"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={settingsTab === id ? "selected" : ""}
              onClick={() => setSettingsTab(id as typeof settingsTab)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="settings-tab-body">
          {settingsTab === "visual" && (
            <div className="settings-grid settings-group">
              <label>牌桌背景
                <select value={settings.tableBackgroundId} onChange={(event) => onChangeSettings({ tableBackgroundId: event.target.value })}>
                  {TABLE_BACKGROUNDS.map((background) => <option key={background.id} value={background.id}>{background.label}</option>)}
                </select>
              </label>
              <label>手牌大小 {Math.round(settings.handCardScale * 100)}%
                <input type="range" min={0.82} max={1.25} step={0.02} value={settings.handCardScale} onChange={(event) => onChangeSettings({ handCardScale: Number(event.target.value), handScale: Number(event.target.value) })} />
              </label>
              <label>特效强度
                <select value={settings.effectIntensity} onChange={(event) => onChangeSettings({ effectIntensity: event.target.value as GameSettings["effectIntensity"] })}>
                  <option value="off">关闭</option>
                  <option value="low">低</option>
                  <option value="normal">标准</option>
                  <option value="high">增强</option>
                </select>
              </label>
              <label>战斗特效风格
                <select data-vfx-style-select value={settings.battleVfxStyle} disabled={settings.effectIntensity === "off"} onChange={(event) => onChangeSettings({ battleVfxStyle: event.target.value as GameSettings["battleVfxStyle"] })}>
                  <option value="guofeng">国风 · 三国杀感</option>
                  <option value="anime">动画 · 清透光效</option>
                </select>
              </label>
              <label className="check-row"><input type="checkbox" checked={settings.compactUi} onChange={(event) => onChangeSettings({ compactUi: event.target.checked })} /> 紧凑 UI</label>
              <label className="check-row"><input type="checkbox" checked={settings.tableCompact} onChange={(event) => onChangeSettings({ tableCompact: event.target.checked })} /> 牌桌紧凑模式</label>
              <label className="check-row"><input type="checkbox" checked={settings.battleHudCompact} onChange={(event) => onChangeSettings({ battleHudCompact: event.target.checked })} /> 紧凑顶部 HUD</label>
              <label className="check-row"><input type="checkbox" checked={settings.compactHandZone} onChange={(event) => onChangeSettings({ compactHandZone: event.target.checked })} /> 缩小手牌区</label>
              <label className="check-row"><input type="checkbox" checked={settings.transparentHandZone} onChange={(event) => onChangeSettings({ transparentHandZone: event.target.checked })} /> 半透明手牌底栏</label>
              <label className="check-row"><input type="checkbox" checked={settings.showLobbyVideo} onChange={(event) => onChangeSettings({ showLobbyVideo: event.target.checked })} /> 大厅循环视频</label>
              <label className="check-row"><input type="checkbox" checked={settings.customCursorEnabled} onChange={(event) => onChangeSettings({ customCursorEnabled: event.target.checked })} /> 游戏自定义光标</label>
              <label>光标皮肤
                <select value={settings.cursorTheme} disabled={!settings.customCursorEnabled} onChange={(event) => onChangeSettings({ cursorTheme: event.target.value as GameSettings["cursorTheme"] })}>
                  <option value="silksong">丝之歌 · 大黄蜂</option>
                  <option value="luoxiaohei">罗小黑</option>
                  <option value="silverwolf">Silver Wolf</option>
                  <option value="firefly">流萤</option>
                  <option value="classicPointer">普通指针 V1.5</option>
                </select>
              </label>
              <label>光标大小 {Math.round(settings.cursorSize * 100)}%
                <input type="range" min={0.6} max={1.6} step={0.05} value={settings.cursorSize} disabled={!settings.customCursorEnabled} onChange={(event) => onChangeSettings({ cursorSize: Number(event.target.value) })} />
              </label>
              <label>光标跟随
                <select value={settings.cursorTrail} disabled={!settings.customCursorEnabled || settings.reduceMotion} onChange={(event) => onChangeSettings({ cursorTrail: event.target.value as GameSettings["cursorTrail"] })}>
                  <option value="off">关闭</option>
                  <option value="particle">金色粒子</option>
                  <option value="sakura">樱花</option>
                </select>
              </label>
              <label className="check-row"><input type="checkbox" checked={settings.clickEffectsEnabled} onChange={(event) => onChangeSettings({ clickEffectsEnabled: event.target.checked })} /> 点击粒子反馈</label>
              <label className="check-row"><input type="checkbox" checked={settings.highContrastText} onChange={(event) => onChangeSettings({ highContrastText: event.target.checked })} /> 高对比文字</label>
              <label className="check-row"><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => onChangeSettings({ reduceMotion: event.target.checked })} /> 减少动画</label>
            </div>
          )}

          {settingsTab === "battle" && (
            <div className="settings-grid settings-group">
              <label>默认房间人数<input type="number" min={2} max={8} value={settings.defaultMaxPlayers} onChange={(event) => onChangeSettings({ defaultMaxPlayers: Number(event.target.value) })} /></label>
              <label>默认房间号前缀<input value={settings.roomPrefix} onChange={(event) => onChangeSettings({ roomPrefix: event.target.value.toUpperCase() })} /></label>
              <label>出牌/弃牌倒计时
                <select value={settings.turnTimerSeconds} onChange={(event) => onChangeSettings({ turnTimerSeconds: Number(event.target.value) })}>
                  {[30, 60, 90].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
                </select>
              </label>
              <label>响应倒计时
                <select value={settings.responseTimerSeconds} onChange={(event) => onChangeSettings({ responseTimerSeconds: Number(event.target.value) })}>
                  {[15, 30, 60, 90].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
                </select>
              </label>
              <label>选将刷新次数
                <select value={settings.characterRefreshCount} onChange={(event) => onChangeSettings({ characterRefreshCount: Number(event.target.value) })}>
                  {[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} 次</option>)}
                </select>
              </label>
              <label className="check-row"><input type="checkbox" checked={settings.eventLogCollapsed} onChange={(event) => onChangeSettings({ eventLogCollapsed: event.target.checked })} /> 战况默认收起</label>
              <label className="check-row"><input type="checkbox" checked={settings.enableDragPlay} onChange={(event) => onChangeSettings({ enableDragPlay: event.target.checked })} /> 启用拖拽出牌</label>
              <label className="check-row"><input type="checkbox" checked={settings.enableHandSort} onChange={(event) => onChangeSettings({ enableHandSort: event.target.checked })} /> 启用手牌拖动排序</label>
              <label className="check-row"><input type="checkbox" checked={settings.showRuleTips} onChange={(event) => onChangeSettings({ showRuleTips: event.target.checked })} /> 显示规则提示</label>
            </div>
          )}

          {settingsTab === "keys" && (
            <KeyBindingEditor
              keyBindings={settings.keyBindings}
              onChange={(keyBindings) => onChangeSettings({ keyBindings })}
            />
          )}

          {settingsTab === "audio" && (
            <div className="settings-group">
              <MusicControl settings={settings} audioManager={audioManager} bgmTracks={bgmTracks} scene="settings" onChangeSettings={onChangeSettings} />
              <div className="settings-grid">
                <label>默认背景音乐
                  <select value={settings.currentBgmId} onChange={(event) => onChangeSettings({ currentBgmId: event.target.value })}>
                    {bgmTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
                  </select>
                </label>
                <label>主音量 {Math.round(settings.masterVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.masterVolume} onChange={(event) => onChangeSettings({ masterVolume: Number(event.target.value) })} /></label>
                <label>背景音乐 {Math.round(settings.bgmVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.bgmVolume} onChange={(event) => onChangeSettings({ bgmVolume: Number(event.target.value) })} /></label>
                <label>卡牌语音 {Math.round(settings.voiceVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.voiceVolume} onChange={(event) => onChangeSettings({ voiceVolume: Number(event.target.value) })} /></label>
                <label>实时语音 {Math.round(settings.rtcVoiceVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.rtcVoiceVolume} onChange={(event) => onChangeSettings({ rtcVoiceVolume: Number(event.target.value) })} /></label>
                <label>音效 {Math.round(settings.sfxVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.sfxVolume} onChange={(event) => onChangeSettings({ sfxVolume: Number(event.target.value) })} /></label>
                <label>播报 {Math.round(settings.announcerVolume * 100)}%<input type="range" min={0} max={1} step={0.01} value={settings.announcerVolume} onChange={(event) => onChangeSettings({ announcerVolume: Number(event.target.value) })} /></label>
                <label>循环模式
                  <select value={settings.loopMode} onChange={(event) => onChangeSettings({ loopMode: event.target.value as GameSettings["loopMode"] })}>
                    <option value="all">列表循环</option>
                    <option value="one">单曲循环</option>
                  </select>
                </label>
                <label className="check-row"><input type="checkbox" checked={settings.muted} onChange={(event) => onChangeSettings({ muted: event.target.checked })} /> 全局静音</label>
                <label className="check-row"><input type="checkbox" checked={settings.autoResume} onChange={(event) => onChangeSettings({ autoResume: event.target.checked })} /> 切换曲目后自动继续播放</label>
              </div>
            </div>
          )}

          {settingsTab === "network" && (
            <div className="settings-grid settings-group">
              <div className={`lobby-status-card ${photonReady ? "online" : "offline"}`}><strong>{photonReady ? "Photon 已连接" : "Photon 未连接"}</strong><span>异常退出或断线后优先尝试恢复原房间。</span></div>
              <div className="network-metrics-card">
                <strong>重连统计</strong>
                <span>{formatNetworkMetrics(networkMetrics)}</span>
                <small>最近房间：{networkMetrics.lastRoomCode || "无"} · 最近错误码：{networkMetrics.lastErrorCode ?? "无"}</small>
              </div>
              <label className="check-row"><input type="checkbox" checked={settings.autoRefreshLobby} onChange={(event) => onChangeSettings({ autoRefreshLobby: event.target.checked })} /> 大厅自动刷新房间</label>
              <button onClick={onReconnect} disabled={Boolean(actionBusy)}><Wifi size={16} /> {photonReady ? "重新连接 Photon" : "连接 Photon"}</button>
              <button onClick={onClearLastRoom}><Trash2 size={16} /> 清除最近房间</button>
              <button onClick={onCopyNetworkDiagnostics}><Copy size={16} /> 复制网络诊断</button>
              <button onClick={onClearNetworkDiagnostics}><Trash2 size={16} /> 清除网络诊断</button>
            </div>
          )}

          {settingsTab === "update" && (
            <div className="settings-grid settings-group">
              <div className="rule-panel">
                <h3><RefreshCw size={16} /> 热更新与本地资源</h3>
                <p>七牛只更新 assets、app-content、version 清单；React、CSS、Electron 和 Android 代码需要完整安装包。</p>
              </div>
              <button onClick={() => desktopApp?.restart?.()} disabled={!desktopApp?.restart}><RotateCw size={16} /> 重启应用检查热更新</button>
              <button onClick={() => window.location.reload()}><RefreshCw size={16} /> 重新加载前端</button>
              <button onClick={onResetSettings}><RotateCw size={16} /> 恢复默认设置</button>
            </div>
          )}

          {settingsTab === "account" && (
            <div className="settings-grid settings-group">
              <div className="profile-lines">
                <span><UserRound size={14} /> {user.email}</span>
                <span><BadgeCheck size={14} /> {user.role === "admin" ? "管理员" : "玩家"}</span>
                <span>UID/openid：{user.uid}</span>
              </div>
              <label>昵称<input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} /></label>
              <button disabled={!nicknameValid || Boolean(actionBusy)} onClick={() => onSaveNickname(nickname)}><SlidersHorizontal size={16} /> 保存昵称</button>
              <button onClick={onClearRemember}><Trash2 size={16} /> 清除记住邮箱和密码</button>
              <button onClick={() => void desktopApp?.openLogs?.()} disabled={!desktopApp?.openLogs}><ListChecks size={16} /> 打开日志目录</button>
              <label className="check-row"><input type="checkbox" checked={settings.showFullErrors} onChange={(event) => onChangeSettings({ showFullErrors: event.target.checked })} /> 显示完整错误信息</label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function KeyBindingEditor({
  keyBindings,
  onChange,
}: {
  keyBindings: KeyBindings;
  onChange: (keyBindings: KeyBindings) => void;
}) {
  const [capturing, setCapturing] = useState<KeyBindingAction | undefined>();
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!capturing) return;
    const activeAction = capturing;
    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      const code = event.code || event.key;
      if (!code) return;
      const conflictedAction = KEY_BINDING_ORDER.find(
        (action) => action !== activeAction && keyBindings[action] === code
      );
      if (conflictedAction) {
        setStatus(`${formatKeyCode(code)} 已用于“${KEY_BINDING_LABELS[conflictedAction]}”。`);
        setCapturing(undefined);
        return;
      }
      onChange({ ...keyBindings, [activeAction]: code });
      setStatus(`已将“${KEY_BINDING_LABELS[activeAction]}”设为 ${formatKeyCode(code)}。`);
      setCapturing(undefined);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, keyBindings, onChange]);

  return (
    <div className="settings-group keybinding-panel">
      <div className="rule-panel">
        <h3><SlidersHorizontal size={16} /> Windows 键盘操作</h3>
        <p>默认 Q/E 切手牌，A/D 切目标；输入聊天、邮箱或昵称时不会触发对局键位。</p>
      </div>
      <div className="keybinding-grid">
        {KEY_BINDING_ORDER.map((action) => (
          <div className="keybinding-row" key={action}>
            <span>{KEY_BINDING_LABELS[action]}</span>
            <kbd>{formatKeyCode(keyBindings[action])}</kbd>
            <button type="button" onClick={() => { setCapturing(action); setStatus(`请按下新的“${KEY_BINDING_LABELS[action]}”键。`); }}>
              {capturing === action ? "等待按键" : "更改"}
            </button>
          </div>
        ))}
      </div>
      {status && <div className="form-status" aria-live="polite">{status}</div>}
      <div className="settings-actions">
        <button type="button" onClick={() => { onChange(DEFAULT_KEY_BINDINGS); setStatus("已恢复默认键位。"); }}>
          <RotateCw size={16} /> 恢复默认键位
        </button>
      </div>
    </div>
  );
}

function PracticePanel({
  user,
  characters,
  defaultMaxPlayers,
  characterRefreshCount,
  onStart,
  onBack,
}: {
  user: UserProfile;
  characters: CharacterDefinition[];
  defaultMaxPlayers: number;
  characterRefreshCount: number;
  onStart: (playerCount: number, characterId: string) => void;
  onBack: () => void;
}) {
  const approved = useMemo(() => characters.filter((character) => character.status === "approved"), [characters]);
  const [playerCount, setPlayerCount] = useState(defaultMaxPlayers);
  const [refreshLeft, setRefreshLeft] = useState(characterRefreshCount);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [refreshSalt, setRefreshSalt] = useState(() => Math.random().toString(36).slice(2, 10));
  const candidateIds = useMemo(
    () => pickCharacterCandidates(approved, `${user.id}-practice-${refreshIndex}-${refreshSalt}`, 3).map((item) => item.id),
    [approved, refreshIndex, refreshSalt, user.id]
  );
  const candidates = candidateIds.map((id) => approved.find((character) => character.id === id)).filter(Boolean) as CharacterDefinition[];
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? approved[0]?.id ?? "");
  const selected = approved.find((character) => character.id === selectedId);

  useEffect(() => {
    if (!selectedId || !candidateIds.includes(selectedId)) {
      setSelectedId(candidates[0]?.id ?? approved[0]?.id ?? "");
    }
  }, [approved, candidateIds, candidates, selectedId]);

  function refreshCandidates() {
    if (refreshLeft <= 0) return;
    setRefreshLeft((value) => Math.max(0, value - 1));
    setRefreshIndex((value) => value + 1);
    setRefreshSalt(Math.random().toString(36).slice(2, 10));
  }

  return (
    <section className="surface practice-board">
      <div className="section-title">
        <div>
          <p className="eyebrow">单机人机</p>
          <h2>练习场</h2>
        </div>
        <button onClick={onBack}>返回大厅</button>
      </div>
      <div className="room-code-grid">
        <label>
          总人数
          <input type="number" min={2} max={8} value={playerCount} onChange={(event) => setPlayerCount(clampPlayerLimit(Number(event.target.value)))} />
        </label>
        <button disabled={!selectedId} onClick={() => onStart(clampPlayerLimit(playerCount), selectedId)}>
          <Swords size={16} /> 开始练习
        </button>
      </div>
      <div>
        <p className="eyebrow">随机 3 选 1</p>
        <h3>选择你的角色牌</h3>
      </div>
      <div className="draft-refresh-row">
        <span className="muted">剩余刷新 {refreshLeft} 次</span>
        <button type="button" disabled={refreshLeft <= 0} onClick={refreshCandidates}>
          <RefreshCw size={14} /> 刷新候选
        </button>
      </div>
      <div className="character-select-grid">
        {candidates.map((character) => (
          <button
            className={`character-choice ${selectedId === character.id ? "selected" : ""}`}
            key={character.id}
            onClick={() => setSelectedId(character.id)}
          >
            <strong>{character.name}</strong>
            <span>{factionText(character.faction)} · {character.maxHp} 体力</span>
            <small>{character.skillText || character.skills.map((skill) => skill.name).join("、") || "无技能"}</small>
          </button>
        ))}
      </div>
      {selected && <p className="muted">你将使用：{selected.name}。其余 {Math.max(1, clampPlayerLimit(playerCount) - 1)} 名玩家由 AI 控制。</p>}
    </section>
  );
}

function PreviewPanel({
  characters,
  rulesInfo,
  onBack,
}: {
  characters: CharacterDefinition[];
  rulesInfo: RulesRuntimeInfo;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"characters" | "cards">("characters");
  const [factionFilter, setFactionFilter] = useState<"all" | CharacterFaction>("all");
  const approved = useMemo(() => characters.filter((character) => character.status === "approved"), [characters]);
  const cards = useMemo(() => getRulesRuntime().getGameCardCatalog(), [rulesInfo.logicMd5]);
  const visibleCharacters = useMemo(
    () => approved.filter((character) => factionFilter === "all" || character.faction === factionFilter),
    [approved, factionFilter]
  );
  const recentCharacters = useMemo(
    () => visibleCharacters.filter((character) => RECENT_CHARACTER_IDS.includes(character.id as (typeof RECENT_CHARACTER_IDS)[number])),
    [visibleCharacters]
  );
  const regularCharacters = useMemo(
    () => visibleCharacters.filter((character) => !RECENT_CHARACTER_IDS.includes(character.id as (typeof RECENT_CHARACTER_IDS)[number])),
    [visibleCharacters]
  );
  const sourceLabel = rulesInfo.source === "hotfix" ? "热更规则" : "内置规则";
  const factionOptions: Array<{ value: "all" | CharacterFaction; label: string }> = [
    { value: "all", label: "全部" },
    { value: "shu", label: factionText("shu") },
    { value: "wei", label: factionText("wei") },
    { value: "wu", label: factionText("wu") },
    { value: "qun", label: factionText("qun") },
    { value: "custom", label: factionText("custom") },
  ];

  return (
    <section className="surface preview-board">
      <div className="section-title">
        <div>
          <p className="eyebrow">当前可用内容</p>
          <h2>卡牌预览</h2>
        </div>
        <button onClick={onBack}>返回大厅</button>
      </div>
      <div className={`preview-runtime-summary ${rulesInfo.source}`}>
        <div className="preview-runtime-grid">
          <article>
            <span>加载来源</span>
            <strong>{sourceLabel}</strong>
          </article>
          <article>
            <span>逻辑版本</span>
            <strong>{rulesInfo.logicVersion}</strong>
          </article>
          <article>
            <span>角色数</span>
            <strong>{approved.length}</strong>
          </article>
          <article>
            <span>卡牌数</span>
            <strong>{cards.length}</strong>
          </article>
        </div>
        <p className="muted">
          协议 {rulesInfo.protocolVersion} · MD5 {rulesInfo.logicMd5.slice(0, 8)}
        </p>
        {rulesInfo.source === "builtin" && rulesInfo.error && (
          <p className="preview-runtime-warning">热更角色或规则不可用，当前已回退到内置内容。</p>
        )}
      </div>
      <div className="segmented">
        <button className={tab === "characters" ? "selected" : ""} onClick={() => setTab("characters")}>角色牌</button>
        <button className={tab === "cards" ? "selected" : ""} onClick={() => setTab("cards")}>游戏牌</button>
      </div>
      {tab === "characters" ? (
        <>
          <div className="preview-filter-bar">
            <span className="muted">阵营筛选</span>
            <div className="segmented preview-filter-segment">
              {factionOptions.map((option) => (
                <button
                  className={factionFilter === option.value ? "selected" : ""}
                  key={option.value}
                  onClick={() => setFactionFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {recentCharacters.length > 0 && (
            <div className="preview-section">
              <div className="preview-section-header">
                <div>
                  <p className="eyebrow">最近新增</p>
                  <h3>新增角色</h3>
                </div>
                <span className="preview-section-count">{recentCharacters.length}</span>
              </div>
              <div className="preview-grid">
                {recentCharacters.map((character) => (
                  <article className="character-preview-card is-new" key={character.id}>
                    <span className="preview-new-badge">新增</span>
                    <div className="portrait">{getCharacterArtUrl(character) ? <img src={getCharacterArtUrl(character)} alt="" /> : character.name.slice(0, 1)}</div>
                    <div>
                      <strong>{character.name}</strong>
                      <span>{factionText(character.faction)} · {character.maxHp} 体力</span>
                    </div>
                    <p>{character.description}</p>
                    <small>{character.skillText || character.skills.map((skill) => `${skill.name}：${skill.description}`).join("；") || "无技能"}</small>
                  </article>
                ))}
              </div>
            </div>
          )}
          <div className="preview-section">
            <div className="preview-section-header">
              <div>
                <p className="eyebrow">全部角色</p>
                <h3>角色总览</h3>
              </div>
              <span className="preview-section-count">{regularCharacters.length}</span>
            </div>
            {regularCharacters.length > 0 ? (
              <div className="preview-grid">
                {regularCharacters.map((character) => (
                  <article className="character-preview-card" key={character.id}>
                    <div className="portrait">{getCharacterArtUrl(character) ? <img src={getCharacterArtUrl(character)} alt="" /> : character.name.slice(0, 1)}</div>
                    <div>
                      <strong>{character.name}</strong>
                      <span>{factionText(character.faction)} · {character.maxHp} 体力</span>
                    </div>
                    <p>{character.description}</p>
                    <small>{character.skillText || character.skills.map((skill) => `${skill.name}：${skill.description}`).join("；") || "无技能"}</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="preview-empty">当前筛选下没有可显示的角色。</div>
            )}
          </div>
        </>
      ) : (
        <div className="preview-grid card-preview-grid">
          {cards.map((card) => (
            <article className={`card-preview ${card.category} ${card.cardKey}`} key={card.id}>
              <span>{suitLabel(card.suit)} {card.rank}</span>
              <strong>{card.name}</strong>
              <small>
                {card.category === "basic" ? "基本牌" : card.category === "equip" ? "装备牌" : "锦囊牌"}
                {card.category === "equip" && card.equipmentSlot ? ` · ${equipmentSlotText(card.equipmentSlot)}` : ""}
                {card.range ? ` · 范围 ${card.range}` : ""}
                {card.requiresTarget ? " · 需要目标" : ""}
              </small>
              <p>{cardDescription(card)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RoomPanel({
  room,
  identity,
  characters,
  characterRefreshCount,
  onReady,
  onStart,
  onLeave,
  actionBusy,
}: {
  room: RoomSnapshot;
  identity: PlayerIdentity;
  characters: CharacterDefinition[];
  characterRefreshCount: number;
  onReady: (ready: boolean, characterId?: string) => void;
  onStart: () => void;
  onLeave: () => void;
  actionBusy?: boolean;
  }) {
    const isWerewolf = room.gameKind === "werewolf";
    const me = room.seats.find((seat) => seat.playerId === identity.id);
    const approved = useMemo(() => characters.filter((character) => character.status === "approved"), [characters]);
    const [refreshLeft, setRefreshLeft] = useState(characterRefreshCount);
    const [refreshIndex, setRefreshIndex] = useState(0);
    const [refreshSalt, setRefreshSalt] = useState(() => Math.random().toString(36).slice(2, 10));
    const candidateIds = useMemo(
      () => pickCharacterCandidates(approved, `${room.id}-${identity.id}-${refreshIndex}-${refreshSalt}`, 3).map((item) => item.id),
      [approved, identity.id, refreshIndex, refreshSalt, room.id]
    );
    const candidates = candidateIds.map((id) => approved.find((character) => character.id === id)).filter(Boolean) as CharacterDefinition[];
    const [characterId, setCharacterId] = useState(me?.characterId ?? candidates[0]?.id ?? approved[0]?.id);
    const canStart =
      room.seats.length >= (isWerewolf ? 5 : 2) &&
      room.seats.length <= 8 &&
      room.seats.every((seat) => seat.ready && seat.connected);
    const isHost = room.hostPlayerId === identity.id;
    const selected = approved.find((character) => character.id === characterId);

    useEffect(() => {
      if (me?.ready) return;
      if (!characterId || !candidateIds.includes(characterId)) {
        setCharacterId(candidates[0]?.id ?? approved[0]?.id);
      }
    }, [approved, candidateIds, candidates, characterId, me?.ready]);

    function refreshCandidates() {
      if (me?.ready || actionBusy || refreshLeft <= 0) return;
      setRefreshLeft((value) => Math.max(0, value - 1));
      setRefreshIndex((value) => value + 1);
      setRefreshSalt(Math.random().toString(36).slice(2, 10));
    }

  if (isAndroidNative) {
    return (
      <section className="mobile-room-screen">
        <header className="mobile-room-head">
          <div>
            <strong>{room.name}</strong>
            <span>
              {isWerewolf ? "狼人杀" : "茂一杀"} · {room.seats.length}/{room.maxPlayers} 人
            </span>
          </div>
          <span className={canStart ? "ready" : ""}>{canStart ? "可开始" : "等待准备"}</span>
          <button type="button" onClick={onLeave} disabled={actionBusy}>
            <DoorOpen size={18} /> 离开
          </button>
        </header>

        <div className="mobile-room-body">
          <section className="mobile-seat-board" aria-label="房间座位">
            <h3>玩家席</h3>
            <div>
              {Array.from({ length: room.maxPlayers }, (_, index) => {
                const seat = room.seats[index];
                return (
                  <article className={`mobile-room-seat ${seat?.ready ? "ready" : ""} ${seat?.connected === false ? "offline" : ""}`} key={seat?.seatId ?? `empty-${index}`}>
                    <span>{index + 1}</span>
                    <strong>{seat?.playerName ?? "等待玩家"}</strong>
                    <small>{seat ? (seat.connected ? (seat.ready ? "已准备" : "未准备") : "断线") : "空位"}</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mobile-role-stage">
            {isWerewolf ? (
              <div className="mobile-werewolf-brief">
                <Users size={34} />
                <h2>{room.maxPlayers} 人标准板型</h2>
                <p>{describeWerewolfPreset(room.maxPlayers)}</p>
                <span>身份开局后私下显示，白天发言与投票，夜晚按身份行动。</span>
              </div>
            ) : (
              <>
                <div className="mobile-role-title">
                  <div>
                    <small>开局选将</small>
                    <h2>随机三选一</h2>
                  </div>
                  <span>剩余刷新 {refreshLeft} 次</span>
                </div>
                <div className="mobile-character-deck">
                  {candidates.map((character) => (
                    <button
                      type="button"
                      className={`mobile-character-card faction-${character.faction} ${characterId === character.id ? "selected" : ""}`}
                      key={character.id}
                      disabled={Boolean(me?.ready) || actionBusy}
                      onClick={() => setCharacterId(character.id)}
                    >
                      <div className="mobile-character-art">
                        {getCharacterArtUrl(character) ? <img src={getCharacterArtUrl(character)} alt="" /> : <b>{character.name.slice(0, 1)}</b>}
                      </div>
                      <div>
                        <span>{factionText(character.faction)} · {character.maxHp} 体力</span>
                        <strong>{character.name}</strong>
                        <p>{character.skillText || character.skills.map((skill) => `${skill.name}：${skill.description}`).join("；") || "无技能"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="mobile-room-rail">
            {!isWerewolf && (
              <button type="button" disabled={Boolean(me?.ready) || actionBusy || refreshLeft <= 0} onClick={refreshCandidates}>
                <RefreshCw size={20} />
                <span>刷新</span>
                <small>{refreshLeft} 次</small>
              </button>
            )}
            <button
              type="button"
              className={me?.ready ? "selected" : ""}
              disabled={actionBusy || (!isWerewolf && !characterId)}
              onClick={() => onReady(!me?.ready, isWerewolf ? undefined : characterId)}
            >
              <Shield size={20} />
              <span>{me?.ready ? "取消准备" : "准备"}</span>
              <small>{isWerewolf ? "确认入局" : selected?.name ?? "未选角色"}</small>
            </button>
            <button type="button" className="primary" disabled={!isHost || !canStart || actionBusy} onClick={onStart}>
              <Crown size={20} />
              <span>{isHost ? "开始游戏" : "等待房主"}</span>
              <small>{canStart ? "全员就绪" : `至少 ${isWerewolf ? 5 : 2} 人`}</small>
            </button>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="surface room-lobby">
      <div className="section-title">
        <div>
          <h2>{room.name}</h2>
          <p className="muted">
            {room.gameKind === "werewolf" ? "狼人杀标准局" : "茂一杀牌局"}
            {" · "}
            {room.seats.length}/{room.maxPlayers} 人
            {" · "}
            {canStart ? "可以开始" : `至少 ${isWerewolf ? 5 : 2} 人且全员准备`}
          </p>
        </div>
        <button onClick={onLeave} disabled={actionBusy}>
          <DoorOpen size={16} /> 离开
        </button>
      </div>

      <div className="seat-grid">
        {room.seats.map((seat) => (
          <article className="seat-card" key={seat.seatId}>
            <span>{seat.seatId}</span>
            <strong>{seat.playerName}</strong>
            <small>{seat.connected ? "在线" : "断线"}</small>
            <b>{seat.ready ? "已准备" : "未准备"}</b>
          </article>
        ))}
      </div>

        {!isWerewolf && <div className="role-draft">
          <div>
            <p className="eyebrow">开局前选角色牌</p>
            <h3>随机 3 选 1</h3>
          </div>
          <div className="draft-refresh-row">
            <span className="muted">剩余刷新 {refreshLeft} 次，准备后锁定</span>
            <button type="button" disabled={Boolean(me?.ready) || actionBusy || refreshLeft <= 0} onClick={refreshCandidates}>
              <RefreshCw size={14} /> 刷新候选
            </button>
          </div>
          <div className="character-select-grid">
            {candidates.map((character) => (
              <button
                className={`character-choice ${characterId === character.id ? "selected" : ""}`}
                key={character.id}
                disabled={Boolean(me?.ready) || actionBusy}
                onClick={() => setCharacterId(character.id)}
              >
                <strong>{character.name}</strong>
                <span>{factionText(character.faction)} · {character.maxHp} 体力</span>
                <small>{character.skillText || character.skills.map((skill) => skill.name).join("、") || "无技能"}</small>
              </button>
            ))}
          </div>
        </div>}

        {isWerewolf && (
          <div className="werewolf-room-rules">
            <strong>标准网杀规则</strong>
            <span>身份将在开局后私下分配；狼人、预言家、女巫、猎人按夜间顺序行动。</span>
            <span>首日竞选警长，白天顺序发言并放逐投票；好人屠狼，狼人屠民或屠神。</span>
          </div>
        )}

        <div className="ready-bar">
          <p className="muted">
            {isWerewolf ? "身份开局后私下显示" : `已选：${selected?.name ?? "未选择角色"}`}
          </p>
          <button
            disabled={actionBusy || (!isWerewolf && !characterId)}
            onClick={() => onReady(!me?.ready, isWerewolf ? undefined : characterId)}
          >
            <Shield size={16} /> {me?.ready ? "取消准备" : "准备"}
        </button>
        <button disabled={!isHost || !canStart || actionBusy} onClick={onStart}>
          <Crown size={16} />{" "}
          {isHost ? (isWerewolf ? "开始狼人杀" : "开始") : "等待房主开始"}
        </button>
      </div>
    </section>
  );
}

type DragDropZone = "center" | "response" | "discard" | "";

type CardDragPreview = {
  cardId: string;
  cardKey: string;
  cardName: string;
  rank: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
  zone: DragDropZone;
  seatId: string;
};

function GameTable({
  room,
  game,
  identity,
  settings,
  audioManager,
  bgmTracks,
  chatMessages,
  tableGifts,
  chatEnabled,
  onChangeSettings,
  onSendChat,
  onSendGift,
  onAction,
  actionBusy,
  onBackToLobby,
  onReconnect,
  onLeaveRoom,
}: {
  room: RoomSnapshot;
  game: GameState;
  identity: PlayerIdentity;
  settings: GameSettings;
  audioManager: AudioManager;
  bgmTracks: AudioTrack[];
  chatMessages: PhotonChatMessage[];
  tableGifts: PhotonTableGift[];
  chatEnabled: boolean;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
  onSendChat: (text: string) => void;
  onSendGift: (toSeatId: string, giftType: "egg" | "flower") => void;
  onAction: (action: GameAction) => void;
  actionBusy?: boolean;
  onBackToLobby: () => void;
  onReconnect: () => void;
  onLeaveRoom: () => void;
}) {
  const mySeat = game.seats.find((seat) => seat.playerId === identity.id);
  const currentSeat = game.seats[game.currentSeatIndex];
  const [targetSeatId, setTargetSeatId] = useState("");
  const [giftTargetSeatId, setGiftTargetSeatId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [autoTimeoutScope, setAutoTimeoutScope] = useState("");
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [draggingCardId, setDraggingCardId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [hoveredSeatId, setHoveredSeatId] = useState("");
  const hoverShowRef = useRef<number | undefined>(undefined);
  const [dragOverSeatId, setDragOverSeatId] = useState("");
  const [dropZone, setDropZone] = useState<DragDropZone>("");
  const [dragPreview, setDragPreview] = useState<CardDragPreview | undefined>(undefined);
  const [cardFlightOrigins, setCardFlightOrigins] = useState<Record<string, [number, number]>>({});
  const [previewCardVoice, setPreviewCardVoice] = useState<GameState["lastCardVoice"]>();
  const [dragNotice, setDragNotice] = useState("");
  const [showDiscardPile, setShowDiscardPile] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(() => localStorage.getItem("maoyi.chat.collapsed") !== "false");
  const [battleSettingsOpen, setBattleSettingsOpen] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState<"" | "chat" | "log" | "music" | "voice">("");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [voiceSnapshot, setVoiceSnapshot] = useState<AgoraVoiceSnapshot>({ status: "idle", microphoneOn: false, remoteUserCount: 0 });
  const voiceManagerRef = useRef<AgoraVoiceManager | undefined>(undefined);
  const [battleEffects, setBattleEffects] = useState<BattleEffect[]>([]);
  const previousEffectGameRef = useRef<GameState | undefined>(undefined);
  const suppressCardClickRef = useRef(false);
  const touchDragRef = useRef<{
    pointerId: number;
    cardId: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pointerType: string;
    active: boolean;
    activate?: () => void;
    timer?: number;
  } | undefined>(undefined);
  const [yanDiliSelecting, setYanDiliSelecting] = useState(false);
  const [yanDiliCardIds, setYanDiliCardIds] = useState<string[]>([]);
  const [zhangbaSelecting, setZhangbaSelecting] = useState(false);
  const [zhangbaCardIds, setZhangbaCardIds] = useState<string[]>([]);
  const [baoWuxieSelecting, setBaoWuxieSelecting] = useState(false);
  const [baoWuxieCardIds, setBaoWuxieCardIds] = useState<string[]>([]);
  const [cjjShiguanSelecting, setCjjShiguanSelecting] = useState(false);
  const [fangtianTargetIds, setFangtianTargetIds] = useState<string[]>([]);
  const latestLog = game.logs.at(-1) ?? "暂无战况";
  const [seenLog, setSeenLog] = useState(latestLog);
  const isMyTurn = currentSeat?.playerId === identity.id;
  const canSubmitAutoTimeout = isAutoTimeoutController(game, room, identity.id);
  const pending = game.pendingResponse;
  const pendingChoice = game.pendingChoice;
  const isMyResponder = Boolean(pending && mySeat && isResponseEligibleForSeat(pending, mySeat.seatId));
  const hasPassedResponse = Boolean(pending?.mode === "global" && mySeat && pending.passedSeatIds?.includes(mySeat.seatId));
  const isGlobalWuxie = pending?.responseType === "wuxie" && pending.mode === "global";
  const isListedWuxieResponder = Boolean(isGlobalWuxie && mySeat && pending.eligibleResponderSeatIds?.includes(mySeat.seatId));
  const isMyChooser = Boolean(pendingChoice && mySeat?.seatId === pendingChoice.chooserSeatId);
  const isLockedByResponse = Boolean(pending || pendingChoice);
  const myHand = mySeat?.hand ?? [];
  const selectedHandCard = myHand.find((card) => card.id === selectedCardId);
  const extraWeapons = Array.isArray(mySeat?.skillState?.yangExtraWeapons) ? (mySeat?.skillState?.yangExtraWeapons as GameCard[]) : [];
  const hasWeapon = (key: string) => mySeat?.equipment.weapon?.equipmentKey === key || extraWeapons.some((card) => card.equipmentKey === key);
  const fangtianActive = Boolean(
    selectedHandCard &&
    isShaCard(selectedHandCard) &&
    myHand.length === 1 &&
    hasWeapon("fangtian") &&
    isMyTurn &&
    game.phase === "play" &&
    !isLockedByResponse
  );
  const targets = game.seats.filter((seat) => seat.alive && (selectedHandCard?.cardKey === "tiesuo" || seat.playerId !== identity.id));
  const remainingSeconds = getRemainingSeconds(game, now);
  const timerPercent = getTimerPercent(game, remainingSeconds);
  const orderedHand = useMemo(() => {
    const byId = new Map(myHand.map((card) => [card.id, card]));
    const sorted = handOrder.map((id) => byId.get(id)).filter(Boolean) as GameCard[];
    const missing = myHand.filter((card) => !handOrder.includes(card.id));
    return [...sorted, ...missing];
  }, [handOrder, myHand]);
  const recentCards = game.revealedCards.length > 0 ? game.revealedCards.slice(-3) : game.discardPile.slice(-3);
  const hasUnreadLog = settings.eventLogCollapsed && latestLog !== seenLog;
  const eventLogIsCollapsed = isAndroidNative ? mobileDrawer !== "log" : settings.eventLogCollapsed;
  const hoveredSeat = game.seats.find((seat) => seat.seatId === hoveredSeatId);
  const battleSeatPoints = useMemo(
    () => Object.fromEntries(game.seats.map((seat) => [seat.seatId, getRelativeSeatPoint(game.seats, seat.seatId, mySeat?.seatId)])),
    [game.seats, mySeat?.seatId]
  );
  const hoveredSeatDock = hoveredSeat
    ? hoveredSeat.seatId === mySeat?.seatId
      ? "left"
      : getRelativeSeatPoint(game.seats, hoveredSeat.seatId, mySeat?.seatId)[0] < 50
      ? "right"
      : "left"
    : "left";
  const activeDragCard = draggingCard();
  const choiceTargetSeatIds =
    pendingChoice?.kind === "multi-target-seat" || pendingChoice?.kind === "sha-transfer"
      ? pendingChoice.targetSeatIds ?? []
      : [];
  const targetingBeamStyle = activeDragCard && (dragOverSeatId || targetSeatId)
    ? getTargetingBeamStyle(game.seats, dragOverSeatId || targetSeatId, mySeat?.seatId)
    : undefined;
  const dragGhostStyle = dragPreview
    ? {
        "--drag-x": `${dragPreview.x}px`,
        "--drag-y": `${dragPreview.y}px`,
        "--drag-start-x": `${dragPreview.startX}px`,
        "--drag-start-y": `${dragPreview.startY}px`,
        "--drag-distance": `${Math.max(48, Math.hypot(dragPreview.x - dragPreview.startX, dragPreview.y - dragPreview.startY))}px`,
        "--drag-angle": `${Math.atan2(dragPreview.y - dragPreview.startY, dragPreview.x - dragPreview.startX)}rad`,
      } as CSSProperties
    : undefined;

  function handleSeatHover(seatId: string, hovered: boolean) {
    if (hoverShowRef.current !== undefined) {
      window.clearTimeout(hoverShowRef.current);
      hoverShowRef.current = undefined;
    }
    if (hovered) {
      hoverShowRef.current = window.setTimeout(() => {
        setHoveredSeatId(seatId);
        hoverShowRef.current = undefined;
      }, 140);
      return;
    }
    setHoveredSeatId((current) => (current === seatId ? "" : current));
  }

  useEffect(() => () => {
    if (hoverShowRef.current !== undefined) window.clearTimeout(hoverShowRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("card-pointer-dragging", Boolean(draggingCardId));
    return () => document.documentElement.classList.remove("card-pointer-dragging");
  }, [draggingCardId]);

  useEffect(() => {
    if (!chatEnabled) return;
    let disposed = false;
    let manager: AgoraVoiceManager | undefined;
    let unsubscribe: (() => void) | undefined;
    void import("./lib/agoraVoice.js")
      .then(({ AgoraVoiceManager }) => {
        if (disposed) return;
        manager = new AgoraVoiceManager();
        voiceManagerRef.current = manager;
        manager.setRemoteVolume(settings.rtcVoiceVolume);
        unsubscribe = manager.subscribe(setVoiceSnapshot);
        return manager.join(room.id);
      })
      .catch((error) => {
        if (disposed) return;
        setVoiceSnapshot((current) => ({
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : "实时语音加载失败。",
        }));
      });
    return () => {
      disposed = true;
      unsubscribe?.();
      manager?.dispose();
      if (voiceManagerRef.current === manager) voiceManagerRef.current = undefined;
    };
  }, [chatEnabled, room.id]);

  useEffect(() => {
    voiceManagerRef.current?.setRemoteVolume(settings.rtcVoiceVolume);
  }, [settings.rtcVoiceVolume]);

  async function toggleVoiceMicrophone() {
    try {
      await voiceManagerRef.current?.toggleMicrophone();
    } catch (error) {
      setVoiceSnapshot((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "麦克风开启失败。",
      }));
      setVoicePanelOpen(true);
    }
  }

  useGameAudioEvents(game, audioManager);

  useEffect(() => {
    const previous = previousEffectGameRef.current;
    previousEffectGameRef.current = game;
    if (settings.effectIntensity === "off") {
      setBattleEffects([]);
      return;
    }
    const nextEffects = deriveBattleEffects(previous, game, {
      reducedMotion: settings.reduceMotion,
      effectIntensity: settings.effectIntensity,
    });
    if (nextEffects.length === 0) return;
    setBattleEffects(nextEffects.slice(-4));
    const duration = settings.reduceMotion ? 420 : settings.effectIntensity === "low" ? 680 : settings.effectIntensity === "high" ? 1040 : 860;
    const timeout = window.setTimeout(() => setBattleEffects([]), duration);
    return () => window.clearTimeout(timeout);
  }, [game, settings.reduceMotion, settings.effectIntensity]);

  useEffect(() => {
    if (!targetSeatId && targets[0]) setTargetSeatId(targets[0].seatId);
  }, [targetSeatId, targets]);

  useEffect(() => {
    if (targetSeatId && !targets.some((seat) => seat.seatId === targetSeatId)) {
      setTargetSeatId(targets[0]?.seatId ?? "");
    }
    if (giftTargetSeatId && !targets.some((seat) => seat.seatId === giftTargetSeatId)) {
      setGiftTargetSeatId("");
    }
  }, [giftTargetSeatId, targetSeatId, targets]);

  useEffect(() => {
    if (!isMyTurn || game.phase !== "play" || mySeat?.character.id !== "builtin-cjj") {
      setCjjShiguanSelecting(false);
    }
  }, [game.phase, game.turn, isMyTurn, mySeat?.character.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings.eventLogCollapsed) setSeenLog(latestLog);
  }, [latestLog, settings.eventLogCollapsed]);

  useEffect(() => {
    const ids = myHand.map((card) => card.id);
    setHandOrder((current) => {
      const kept = current.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [myHand]);

  useEffect(() => {
    const timer = game.actionTimer;
    if (!canSubmitAutoTimeout || !timer || actionBusy || game.phase === "finished") return;
    const timerSeat = game.seats.find((seat) => seat.seatId === timer.seatId);
    const timerRoomSeat = room.seats.find((seat) => seat.seatId === timer.seatId);
    if (timerRoomSeat?.connected !== false && remainingSeconds > 0) return;
    const canAutoAct =
      (pending && (pending.mode === "global" || timer.seatId === pending.responderSeatId)) ||
      (pendingChoice && timer.seatId === pendingChoice.chooserSeatId) ||
      (!pending && !pendingChoice && timer.seatId === currentSeat?.seatId && (game.phase === "discard" || game.phase === "play" || game.phase === "finish"));
    if (!canAutoAct || autoTimeoutScope === timer.scopeId) return;
    setAutoTimeoutScope(timer.scopeId);
    onAction({ type: "AUTO_TIMEOUT", playerId: timerSeat?.playerId ?? identity.id, scopeId: timer.scopeId });
  }, [actionBusy, autoTimeoutScope, canSubmitAutoTimeout, currentSeat?.seatId, game.actionTimer?.scopeId, game.phase, game.seats, identity.id, onAction, pending, pendingChoice, remainingSeconds, room.seats]);

  function canPlayCard(card: GameCard, targetOverride = targetSeatId): boolean {
    if (!isMyTurn || isLockedByResponse || game.phase !== "play" || card.name === "未知手牌") return false;
    if (card.cardKey === "shan" || card.cardKey === "wuxie") return false;
    if (isShaCard(card) && game.usedShaThisTurn) return false;
    if (card.cardKey === "tao" && mySeat && mySeat.hp >= mySeat.maxHp) return false;
    if (card.cardKey === "jiu" && game.activeTurn.jiuUsed) return false;
    if (card.requiresTarget && !targetOverride) return false;
    return true;
  }

  function canRespondCard(card: GameCard): boolean {
    if (!pending || !isMyResponder || hasPassedResponse || card.name === "未知手牌") return false;
    if (pending.responseType === "tao" && card.cardKey === "jiu" && game.pendingDying?.seatId === mySeat?.seatId) return true;
    if (pending.responseType === "sha") return isShaCard(card);
    return card.cardKey === pending.responseType;
  }

  function canChooseWithCard(card: GameCard): boolean {
    if (!pendingChoice || !isMyChooser || card.name === "未知手牌") return false;
    if (pendingChoice.kind === "discard-suit") return card.suit === pendingChoice.requiredSuit;
    return false;
  }

  function canDiscardCard(card: GameCard): boolean {
    return isMyTurn && !isLockedByResponse && game.phase === "discard" && card.name !== "未知手牌";
  }

  function draggingCard(): GameCard | undefined {
    return myHand.find((card) => card.id === draggingCardId);
  }

  function resetDragState() {
    setDraggingCardId("");
    setDragOverSeatId("");
    setDropZone("");
    setDragPreview(undefined);
  }

  function beginCardDrag(event: DragEvent<HTMLElement>, card: GameCard) {
    event.preventDefault();
    event.stopPropagation();
    beginPointerCardDragFromElement(card, event.currentTarget);
  }

  function reorderHandOver(event: DragEvent<HTMLElement>, targetCardId: string) {
    if (!settings.enableHandSort || !draggingCardId || draggingCardId === targetCardId) return;
    event.preventDefault();
    reorderHandToCard(draggingCardId, targetCardId);
  }

  function rememberCardOrigin(cardId: string, point?: { x: number; y: number }) {
    const field = document.querySelector<HTMLElement>(".sg-battlefield");
    const bounds = field?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect();
    const safeCardId = cardId.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    const cardElement = document.querySelector<HTMLElement>(`[data-card-id="${safeCardId}"]`);
    const cardBounds = cardElement?.getBoundingClientRect();
    const sourceX = cardBounds ? cardBounds.left + cardBounds.width / 2 : point?.x ?? bounds.left + bounds.width / 2;
    const sourceY = cardBounds ? cardBounds.top + cardBounds.height / 2 : point?.y ?? bounds.top + bounds.height * 0.92;
    const origin: [number, number] = [
      Math.min(96, Math.max(4, ((sourceX - bounds.left) / Math.max(1, bounds.width)) * 100)),
      Math.min(96, Math.max(4, ((sourceY - bounds.top) / Math.max(1, bounds.height)) * 100)),
    ];
    setCardFlightOrigins((current) => {
      const entries = Object.entries({ ...current, [cardId]: origin }).slice(-24);
      return Object.fromEntries(entries);
    });
  }

  function dispatchCardAction(action: GameAction, point?: { x: number; y: number }) {
    if ("cardId" in action && typeof action.cardId === "string") rememberCardOrigin(action.cardId, point);
    onAction(action);
  }

  function reorderHandToCard(sourceCardId: string, targetCardId: string) {
    if (!settings.enableHandSort || sourceCardId === targetCardId) return;
    setHandOrder((current) => {
      const next = current.length > 0 ? [...current] : myHand.map((card) => card.id);
      const from = next.indexOf(sourceCardId);
      const to = next.indexOf(targetCardId);
      if (from < 0 || to < 0 || from === to) return current;
      next.splice(from, 1);
      next.splice(to, 0, sourceCardId);
      return next;
    });
  }

  function beginPointerCardDragFromElement(card: GameCard, element: HTMLElement) {
    if (!settings.enableDragPlay && !settings.enableHandSort) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    setDraggingCardId(card.id);
    setSelectedCardId(card.id);
    setDragNotice("");
    setDragPreview({
      cardId: card.id,
      cardKey: card.cardKey,
      cardName: card.name,
      rank: card.rank,
      x,
      y,
      startX: x,
      startY: y,
      active: true,
      zone: "",
      seatId: "",
    });
  }

  function handleDropError(message: string) {
    setDragNotice(message);
    window.setTimeout(() => setDragNotice((current) => (current === message ? "" : current)), 1600);
  }

  function playDraggedCardToCenter(card: GameCard) {
    if (pending && canRespondCard(card)) {
      dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: card.id });
      return;
    }
    if (pendingChoice && canChooseWithCard(card)) {
      dispatchCardAction({ type: "CHOOSE_CARD", playerId: identity.id, cardId: card.id });
      return;
    }
    if (canPlayCard(card, targetSeatId)) {
      dispatchCardAction({
        type: "PLAY_CARD",
        playerId: identity.id,
        cardId: card.id,
        targetSeatId: card.requiresTarget ? targetSeatId : undefined,
      });
      return;
    }
    handleDropError(card.requiresTarget ? "请先点击目标角色，或把牌拖到目标角色牌上。" : "当前阶段不能使用这张牌。");
  }

  function respondWithDraggedCard(card: GameCard) {
    if (canRespondCard(card)) {
      dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: card.id });
    } else {
      handleDropError("这里需要对应的响应牌。");
    }
  }

  function discardDraggedCard(card: GameCard) {
    if (canDiscardCard(card)) {
      dispatchCardAction({ type: "DISCARD_CARD", playerId: identity.id, cardId: card.id });
    } else {
      handleDropError("只有弃牌阶段才能拖到弃牌区。");
    }
  }

  function playDraggedCardToSeat(card: GameCard, seat: GameState["seats"][number]) {
    if (canDropOnSeat(seat, card)) {
      setTargetSeatId(seat.seatId);
      dispatchCardAction({ type: "PLAY_CARD", playerId: identity.id, cardId: card.id, targetSeatId: seat.seatId });
    } else {
      handleDropError("这张牌不能对该角色使用。");
    }
  }

  function dropToCenter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const card = draggingCard();
    if (!settings.enableDragPlay || !card) {
      resetDragState();
      return;
    }
    playDraggedCardToCenter(card);
    resetDragState();
  }

  function dropToResponse(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const card = draggingCard();
    if (settings.enableDragPlay && card) respondWithDraggedCard(card);
    resetDragState();
  }

  function dropToDiscard(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const card = draggingCard();
    if (settings.enableDragPlay && card) discardDraggedCard(card);
    resetDragState();
  }

  function canDropOnSeat(seat: GameState["seats"][number], card = draggingCard()): boolean {
    const canTargetSelf = card?.cardKey === "tiesuo";
    return Boolean(settings.enableDragPlay && card && seat.alive && (canTargetSelf || seat.playerId !== identity.id) && (card.requiresTarget || card.cardKey === "tiesuo") && canPlayCard(card, seat.seatId));
  }

  function dropToSeat(event: DragEvent<HTMLElement>, seat: GameState["seats"][number]) {
    event.preventDefault();
    event.stopPropagation();
    const card = draggingCard();
    if (card) playDraggedCardToSeat(card, seat);
    resetDragState();
  }

  function beginTouchCardDrag(event: ReactPointerEvent<HTMLElement>, card: GameCard) {
    if (!settings.enableDragPlay && !settings.enableHandSort) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const drag: NonNullable<typeof touchDragRef.current> = {
      pointerId: event.pointerId,
      cardId: card.id,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      pointerType: event.pointerType,
      active: false,
      timer: undefined as number | undefined,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded webviews may reject pointer capture after focus changes.
    }
    const activate = () => {
      drag.active = true;
      rememberCardOrigin(card.id, { x: drag.currentX, y: drag.currentY });
      setDraggingCardId(card.id);
      setSelectedCardId(card.id);
      setDragNotice(settings.enableDragPlay ? "拖到角色、中央响应区或弃牌区。" : "拖到其它手牌上调整顺序。");
      setDragPreview({
        cardId: card.id,
        cardKey: card.cardKey,
        cardName: card.name,
        rank: card.rank,
        x: drag.currentX,
        y: drag.currentY,
        startX: drag.startX,
        startY: drag.startY,
        active: true,
        zone: "",
        seatId: "",
      });
    };
    if (event.pointerType !== "mouse") {
      drag.timer = window.setTimeout(activate, isAndroidNative ? 260 : 220);
    }
    drag.activate = activate;
    touchDragRef.current = drag;
  }

  function moveTouchCardDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (drag.pointerType === "mouse" && distance > 5) {
        drag.activate?.();
      }
      if (distance > 12 && drag.timer !== undefined) {
        window.clearTimeout(drag.timer);
        drag.timer = undefined;
      }
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    updatePointerDragTarget(target, event.clientX, event.clientY, drag.cardId);
  }

  function endTouchCardDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer !== undefined) window.clearTimeout(drag.timer);
    touchDragRef.current = undefined;
    if (!drag.active) return;
    suppressCardClickRef.current = true;
    window.setTimeout(() => {
      suppressCardClickRef.current = false;
    }, 80);
    event.preventDefault();
    const card = myHand.find((item) => item.id === drag.cardId);
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const seatId = target?.closest<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    const zone = target?.closest<HTMLElement>("[data-drop-zone]")?.dataset.dropZone;
    if (card && seatId) {
      const seat = game.seats.find((item) => item.seatId === seatId);
      if (seat && canDropOnSeat(seat, card)) playDraggedCardToSeat(card, seat);
      else handleDropError("这张牌不能对该角色使用。");
    } else if (card && zone === "response") {
      respondWithDraggedCard(card);
    } else if (card && zone === "discard") {
      discardDraggedCard(card);
    } else if (card && zone === "center") {
      playDraggedCardToCenter(card);
    } else if (settings.enableHandSort) {
      setDragNotice("");
    } else {
      handleDropError("未拖到有效区域，牌已返回手牌。");
    }
    resetDragState();
  }

  function updatePointerDragTarget(target: HTMLElement | null, x: number, y: number, cardId: string) {
    const card = myHand.find((item) => item.id === cardId);
    const seatId = target?.closest<HTMLElement>("[data-seat-id]")?.dataset.seatId || "";
    const seat = seatId ? game.seats.find((item) => item.seatId === seatId) : undefined;
    const validSeatId = seat && card && canDropOnSeat(seat, card) ? seat.seatId : "";
    const targetCardId = target?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId || "";
    if (targetCardId) reorderHandToCard(cardId, targetCardId);
    const rawZone = target?.closest<HTMLElement>("[data-drop-zone]")?.dataset.dropZone || "";
    const zone: DragDropZone = rawZone === "center" || rawZone === "response" || rawZone === "discard" ? rawZone : "";
    setDragOverSeatId(validSeatId);
    setDropZone(zone);
    setDragPreview((current) => current && current.cardId === cardId ? { ...current, x, y, zone, seatId: validSeatId } : current);
  }

  function allowDrop(event: DragEvent<HTMLElement>, zone: DragDropZone) {
    if (!draggingCardId) return;
    event.preventDefault();
    setDropZone(zone);
  }

  function setEventLogCollapsed(collapsed: boolean) {
    onChangeSettings({ eventLogCollapsed: collapsed });
    if (!collapsed) setSeenLog(latestLog);
  }

  function setChatDockCollapsed(collapsed: boolean) {
    setChatCollapsed(collapsed);
    localStorage.setItem("maoyi.chat.collapsed", collapsed ? "true" : "false");
  }

  function selectTargetSeat(seatId: string) {
    setTargetSeatId(seatId);
    if (seatId !== mySeat?.seatId && targets.some((seat) => seat.seatId === seatId)) {
      setGiftTargetSeatId(seatId);
    }
  }

  function playBattleEffectPreview(variant: BattleEffect["variant"]) {
    const sourceSeat = mySeat ?? game.seats[0];
    const targetSeat = game.seats.find((seat) => seat.alive && seat.seatId !== sourceSeat?.seatId) ?? sourceSeat;
    if (!sourceSeat || !targetSeat || settings.effectIntensity === "off") {
      setDragNotice("当前已关闭特效。");
      return;
    }
    const motion = settings.reduceMotion ? "reduced" : "standard";
    const nowId = `preview:${Date.now()}:${variant}`;
    const cardKey =
      variant === "fire" ? "fire_sha" :
      variant === "thunder" ? "thunder_sha" :
      variant === "heal" ? "tao" :
      variant === "negate" ? "wuxie" :
      variant === "buff" ? "jiu" :
      variant === "phase" ? "sha" :
      variant === "defeat" ? "sha" :
      "sha";
    const next: BattleEffect[] = [];
    if (variant === "phase") {
      next.push({ id: `${nowId}:phase`, type: "phase", phase: game.phase, turn: game.turn, label: phaseText(game.phase), motion, variant: "phase" });
    } else {
      if (variant !== "poison") {
        next.push({ id: `${nowId}:card`, type: "card", seatId: sourceSeat.seatId, cardKey, cardName: battleEffectCardName(cardKey), motion, variant });
      }
      if (variant === "heal" || variant === "buff") {
        next.push({ id: `${nowId}:heal`, type: "heal", seatId: targetSeat.seatId, amount: 1, motion, variant: "heal" });
      } else if (variant === "poison") {
        next.push({ id: `${nowId}:poison`, type: "status", seatId: targetSeat.seatId, status: "poison", motion, variant: "poison" });
      } else if (variant === "defeat") {
        next.push({ id: `${nowId}:defeat`, type: "defeat", seatId: targetSeat.seatId, motion, variant: "defeat" });
      } else {
        next.push({
          id: `${nowId}:hit`,
          type: "damage",
          seatId: targetSeat.seatId,
          amount: 1,
          label: variant === "negate" ? "止" : undefined,
          motion,
          variant,
        });
      }
    }
    setBattleEffects(next);
    window.setTimeout(() => setBattleEffects([]), motion === "reduced" ? 500 : 950);
  }

  function playCardFlightPreview() {
    const sourceSeat = mySeat ?? game.seats[0];
    const targetSeat = game.seats.find((seat) => seat.alive && seat.seatId !== sourceSeat?.seatId) ?? sourceSeat;
    if (!sourceSeat || !targetSeat || settings.effectIntensity === "off") {
      setDragNotice("当前已关闭特效。");
      return;
    }
    const cardId = `preview-flight-${Date.now()}`;
    setCardFlightOrigins((current) => ({ ...current, [cardId]: [50, 92] }));
    setPreviewCardVoice({
      cardId,
      cardKey: "sha",
      cardName: "杀",
      seatId: sourceSeat.seatId,
      targetSeatId: targetSeat.seatId,
      seq: Date.now(),
    });
    window.setTimeout(() => setPreviewCardVoice(undefined), settings.reduceMotion ? 420 : 980);
  }

  const phaseButtonLabel = phaseActionLabel(game);
  const canUsePhaseButton =
    isMyTurn &&
    !isLockedByResponse &&
    game.phase !== "finished" &&
    (game.phase === "play" || game.phase === "discard" || game.phase === "finish");
  const giftTargetSeat = giftTargetSeatId ? targets.find((seat) => seat.seatId === giftTargetSeatId) : undefined;
  const tableRound = getTableRound(game);
  const yanFillUsedRound = Number(mySeat?.skillState?.yanFillRound ?? -1);
  const yanFillUsed = yanFillUsedRound === tableRound ? Number(mySeat?.skillState?.yanFillCount ?? 0) : 0;
  const canUseYanXiazhi =
    Boolean(mySeat?.character.id === "builtin-yan-laoban") &&
    isMyTurn &&
    game.phase === "play" &&
    !isLockedByResponse &&
    myHand.length >= 2 &&
    !mySeat?.skillState?.yanWuguUsed;
  const tudouShenggenCooldown = Math.max(0, 2 - (tableRound - Number(mySeat?.skillState?.tudouShenggenUsedRound ?? -99)));
  const canUseTudouShenggen =
    Boolean(mySeat?.character.id === "builtin-tudou") &&
    isMyTurn &&
    game.phase === "play" &&
    !isLockedByResponse &&
    Boolean(targetSeatId) &&
    targetSeatId !== mySeat?.seatId &&
    tudouShenggenCooldown <= 0;
  const canStartCjjShiguan =
    Boolean(mySeat?.character.id === "builtin-cjj") &&
    isMyTurn &&
    game.phase === "play" &&
    !isLockedByResponse &&
    myHand.length > 0 &&
    mySeat?.skillState?.cjjShiguanTurn !== game.turn;
  const canConfirmCjjShiguan =
    canStartCjjShiguan &&
    Boolean(selectedHandCard) &&
    Boolean(targetSeatId) &&
    targetSeatId !== mySeat?.seatId;
  const canUseYangXiaoli =
    Boolean(mySeat?.character.id === "builtin-yang-haiyan") &&
    isMyTurn &&
    game.phase === "play" &&
    !isLockedByResponse &&
    Boolean(selectedHandCard && (selectedHandCard.cardKey === "taoyuan" || selectedHandCard.cardKey === "wugu"));

  function toggleYanDiliCard(cardId: string) {
    setYanDiliCardIds((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      return [...current, cardId].slice(0, 2);
    });
  }

  function submitYanDili() {
    if (yanDiliCardIds.length !== 2) return;
    onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "yan-xiazhi-dili", cardIds: yanDiliCardIds });
    setYanDiliSelecting(false);
    setYanDiliCardIds([]);
  }

  function toggleCjjShiguan() {
    if (!cjjShiguanSelecting) {
      if (!canStartCjjShiguan) return;
      setCjjShiguanSelecting(true);
      setDragNotice("试管：选择一张手牌，再点击一名其他角色，最后确认发动。");
      return;
    }
    if (!selectedHandCard || !canConfirmCjjShiguan) return;
    onAction({
      type: "USE_SKILL",
      playerId: identity.id,
      skillId: "cjj-shiguan",
      targetSeatId,
      cardIds: [selectedHandCard.id],
    });
    setCjjShiguanSelecting(false);
    setSelectedCardId("");
    setDragNotice("");
  }

  function toggleZhangbaCard(cardId: string) {
    setZhangbaCardIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId].slice(0, 2));
  }

  function submitZhangba() {
    if (zhangbaCardIds.length !== 2 || !targetSeatId) return;
    onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "zhangba-sha", cardIds: zhangbaCardIds, targetSeatId });
    setZhangbaSelecting(false);
    setZhangbaCardIds([]);
  }

  function toggleFangtianTarget(seatId: string) {
    setFangtianTargetIds((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : [...current, seatId].slice(0, 3));
  }

  function toggleBaoWuxieCard(cardId: string) {
    setBaoWuxieCardIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId].slice(0, 2));
  }

  function submitBaoWuxie() {
    if (baoWuxieCardIds.length !== 2) return;
    onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "bao-double-wuxie", cardIds: baoWuxieCardIds });
    setBaoWuxieSelecting(false);
    setBaoWuxieCardIds([]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) return;
      const keyBindings = settings.keyBindings;
      const isBinding = (action: KeyBindingAction) => event.code === keyBindings[action] || event.key === keyBindings[action];
      const selectRelativeCard = (delta: number) => {
        if (orderedHand.length === 0) return false;
        const currentIndex = orderedHand.findIndex((card) => card.id === selectedCardId);
        const baseIndex = currentIndex >= 0 ? currentIndex : (delta > 0 ? -1 : 0);
        const next = orderedHand[(baseIndex + delta + orderedHand.length) % orderedHand.length];
        if (!next) return false;
        setSelectedCardId(next.id);
        return true;
      };
      const selectRelativeTarget = (delta: number) => {
        if (targets.length === 0) return false;
        const index = Math.max(0, targets.findIndex((seat) => seat.seatId === targetSeatId));
        const next = targets[(index + delta + targets.length) % targets.length];
        if (!next) return false;
        selectTargetSeat(next.seatId);
        return true;
      };
      if (event.key >= "1" && event.key <= "9") {
        const card = orderedHand[Number(event.key) - 1];
        if (card) {
          event.preventDefault();
          setSelectedCardId(card.id);
        }
        return;
      }
      if (isBinding("previousCard") || isBinding("nextCard")) {
        event.preventDefault();
        selectRelativeCard(isBinding("previousCard") ? -1 : 1);
        return;
      }
      if (event.key === "Tab" || event.key === "ArrowLeft" || event.key === "ArrowRight" || isBinding("previousTarget") || isBinding("nextTarget")) {
        const delta = event.key === "ArrowLeft" || isBinding("previousTarget") ? -1 : 1;
        if (!selectRelativeTarget(delta)) return;
        event.preventDefault();
        return;
      }
      if (isBinding("manualReconnect")) {
        event.preventDefault();
        onReconnect();
        return;
      }
      if (isBinding("openBattleMenu")) {
        event.preventDefault();
        setBattleSettingsOpen((open) => !open);
        return;
      }
      if (isBinding("endTurn")) {
        if (!canUsePhaseButton || actionBusy) return;
        event.preventDefault();
        onAction({ type: "END_TURN", playerId: identity.id });
        return;
      }
      if (isBinding("confirmAction") || isBinding("alternateConfirm")) {
        const card = orderedHand.find((item) => item.id === selectedCardId);
        if (!card || actionBusy) return;
        event.preventDefault();
        if (pendingChoice && canChooseWithCard(card)) {
          dispatchCardAction({ type: "CHOOSE_CARD", playerId: identity.id, cardId: card.id });
        } else if (pending && canRespondCard(card)) {
          dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: card.id });
        } else if (canPlayCard(card)) {
          dispatchCardAction({
            type: "PLAY_CARD",
            playerId: identity.id,
            cardId: card.id,
            targetSeatId: card.requiresTarget ? targetSeatId : undefined,
            targetSeatIds: fangtianActive && fangtianTargetIds.length > 0 ? fangtianTargetIds : undefined,
          });
        }
        return;
      }
      if (isBinding("cancelAction")) {
        event.preventDefault();
        if (isMyResponder && !hasPassedResponse) onAction({ type: "PASS_RESPONSE", playerId: identity.id });
        else if (isMyChooser) onAction({ type: "PASS_CHOICE", playerId: identity.id });
        else {
          setSelectedCardId("");
          setGiftTargetSeatId("");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionBusy, canUsePhaseButton, fangtianActive, fangtianTargetIds, hasPassedResponse, identity.id, isMyChooser, isMyResponder, onAction, onReconnect, orderedHand, pending, pendingChoice, selectedCardId, settings.keyBindings, targetSeatId, targets]);

  return (
    <section className={`game-layout sg-game-layout seat-count-${game.seats.length} ${settings.transparentHandZone ? "transparent-hand" : ""} ${settings.eventLogCollapsed ? "log-collapsed" : "log-open"}`}>
      {isAndroidNative ? (
        <>
          <div className="mobile-battle-hud">
            <div className="mobile-turn-summary">
              <strong>{currentSeat?.playerName ?? "等待行动"}</strong>
              <span>第 {game.turn} 回合 · {phaseText(game.phase)}</span>
              <small>{gameActionHint(game, identity.id)}</small>
            </div>
            {game.actionTimer && (
              <div className={`turn-timer ${remainingSeconds <= 5 ? "urgent" : ""}`} style={{ "--timer-percent": timerPercent } as CSSProperties}>
                <span>{remainingSeconds}</span>
                <small>{game.actionTimer.kind === "response" ? "响应" : game.actionTimer.kind === "discard" ? "弃牌" : "出牌"}</small>
              </div>
            )}
            <button className="mobile-phase-button" disabled={actionBusy || !canUsePhaseButton} onClick={() => onAction({ type: "END_TURN", playerId: identity.id })}>
              {phaseButtonLabel}
            </button>
          </div>
          <nav className="mobile-battle-dock" aria-label="牌桌工具">
            {chatEnabled && (
              <button type="button" className={voiceSnapshot.microphoneOn ? "mic-on" : ""} onClick={() => void toggleVoiceMicrophone()}>
                {voiceSnapshot.microphoneOn ? <Mic size={18} /> : <MicOff size={18} />}<span>语音</span>
              </button>
            )}
            <button type="button" className={mobileToolsOpen ? "selected" : ""} onClick={() => setMobileToolsOpen((open) => !open)}>
              <SlidersHorizontal size={18} /><span>菜单</span>
            </button>
            {mobileToolsOpen && (
              <div className="mobile-battle-tools">
                <button type="button" className={mobileDrawer === "chat" ? "selected" : ""} onClick={() => setMobileDrawer((current) => current === "chat" ? "" : "chat")}><Send size={18} /><span>聊天</span></button>
                <button type="button" className={mobileDrawer === "log" ? "selected" : ""} onClick={() => setMobileDrawer((current) => current === "log" ? "" : "log")}><ListChecks size={18} /><span>战况</span></button>
                <button type="button" className={mobileDrawer === "music" ? "selected" : ""} onClick={() => setMobileDrawer((current) => current === "music" ? "" : "music")}><Volume2 size={18} /><span>音乐</span></button>
                <button type="button" onClick={() => setBattleSettingsOpen(true)}><Settings size={18} /><span>设置</span></button>
              </div>
            )}
          </nav>
        </>
      ) : (
        <div className="battle-hud-strip">
          <div className="battle-hud-main">
            <span className="battle-room-name">{room.name}</span>
            <div className="battle-turn-state">
              <strong>{currentSeat?.playerName ?? "等待行动"}</strong>
              <span>第 {game.turn} 回合</span>
              <b>{phaseText(game.phase)}</b>
            </div>
            <small className="battle-action-hint">{gameActionHint(game, identity.id)}</small>
          </div>
          <div className="battle-hud-actions">
            {chatEnabled && (
              <div className={`voice-control ${voiceSnapshot.microphoneOn ? "mic-on" : ""}`}>
                <button
                  type="button"
                  className="voice-mic-button"
                  title={voiceSnapshot.microphoneOn ? "关闭麦克风" : "打开麦克风"}
                  aria-label={voiceSnapshot.microphoneOn ? "关闭麦克风" : "打开麦克风"}
                  onClick={() => void toggleVoiceMicrophone()}
                >
                  {voiceSnapshot.microphoneOn ? <Mic size={17} /> : <MicOff size={17} />}
                </button>
                <button
                  type="button"
                  className="voice-volume-button"
                  title="语音音量"
                  aria-label="打开语音音量设置"
                  onClick={() => setVoicePanelOpen((open) => !open)}
                >
                  <Volume2 size={15} />
                </button>
                {voicePanelOpen && (
                  <div className="voice-popover">
                    <strong>实时语音</strong>
                    <span>{voiceStatusText(voiceSnapshot)} · {voiceSnapshot.remoteUserCount} 人发言</span>
                    <label>接收音量
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.rtcVoiceVolume}
                        onChange={(event) => onChangeSettings({ rtcVoiceVolume: Number(event.target.value) })}
                      />
                    </label>
                    {voiceSnapshot.autoplayBlocked && (
                      <button type="button" onClick={() => voiceManagerRef.current?.resumePlayback()}>
                        恢复声音
                      </button>
                    )}
                    {voiceSnapshot.error && <small>{voiceSnapshot.error}</small>}
                  </div>
                )}
              </div>
            )}
            <MusicControl
              settings={settings}
              audioManager={audioManager}
              bgmTracks={bgmTracks}
              scene="battle"
              compact
              onChangeSettings={onChangeSettings}
            />
            {game.actionTimer && (
              <div className={`turn-timer ${remainingSeconds <= 5 ? "urgent" : ""}`} style={{ "--timer-percent": timerPercent } as CSSProperties}>
                <span>{remainingSeconds}</span>
                <small>{game.actionTimer.kind === "response" ? "响应" : game.actionTimer.kind === "discard" ? "弃牌" : "出牌"}</small>
              </div>
            )}
            <button disabled={actionBusy || !canUsePhaseButton} onClick={() => onAction({ type: "END_TURN", playerId: identity.id })}>
              {phaseButtonLabel}
            </button>
            <details className="battle-menu">
              <summary><SlidersHorizontal size={16} /> 菜单</summary>
              <div>
                <button type="button" onClick={onBackToLobby}>大厅</button>
                <button type="button" onClick={() => setBattleSettingsOpen(true)}>设置</button>
                <button type="button" onClick={() => setEventLogCollapsed(false)}>战况</button>
              </div>
            </details>
          </div>
        </div>
      )}

      <div
        className="battlefield sg-battlefield"
        onDragOver={(event) => {
          if ((event.target as HTMLElement).closest("[data-seat-card], [data-drop-zone='response'], [data-drop-zone='discard']")) return;
          allowDrop(event, "center");
        }}
        onDragLeave={() => setDropZone("")}
        onDrop={(event) => {
          if ((event.target as HTMLElement).closest("[data-seat-card], [data-drop-zone='response'], [data-drop-zone='discard']")) return;
          dropToCenter(event);
        }}
      >
        <BattleVfxCanvas
          effects={battleEffects}
          seatPoints={battleSeatPoints}
          intensity={settings.effectIntensity}
          vfxStyle={settings.battleVfxStyle}
          reducedMotion={settings.reduceMotion}
          clickEffectsEnabled={settings.clickEffectsEnabled}
        />
        <CardFlightLayer
          lastCardVoice={previewCardVoice ?? game.lastCardVoice}
          seatPoints={battleSeatPoints}
          cardOrigins={cardFlightOrigins}
          localSeatId={mySeat?.seatId}
          intensity={settings.effectIntensity}
          vfxStyle={settings.battleVfxStyle}
          reducedMotion={settings.reduceMotion}
        />
        {dragPreview && dragGhostStyle && (
          <div className={`card-drag-ghost-layer zone-${dragPreview.zone || "none"} ${dragPreview.seatId ? "has-target" : ""}`} aria-hidden="true">
            <span className="card-drag-target-line" style={dragGhostStyle} />
            <div className={`card-drag-ghost vfx-${dragPreview.cardKey}`} style={dragGhostStyle}>
              <span className="drag-ghost-trail" />
              <div className="drag-card-shell">
                <span>{dragPreview.rank}</span>
                <strong>{dragPreview.cardName}</strong>
              </div>
            </div>
          </div>
        )}
        <div className="table-stack-chip" aria-label="牌堆与弃牌">
          <span className="stack-chip-icon" aria-hidden="true">牌</span>
          <strong>{game.deck.length}</strong>
          <i />
          <span className="stack-chip-icon discard" aria-hidden="true">弃</span>
          <strong>{game.discardPile.length}</strong>
        </div>
        {targetingBeamStyle && activeDragCard && (
          <div className="targeting-beam" style={targetingBeamStyle}>
            <span>{activeDragCard.name}</span>
          </div>
        )}
        <div className="seat-ring" style={{ "--seat-count": game.seats.length } as CSSProperties}>
          {game.seats.map((seat) => {
            const canDrop = canDropOnSeat(seat);
            const visualEffect = battleEffects.reduce<"" | "hit" | "heal" | "skill" | "status" | "defeat">((current, effect) => {
              if (!("seatId" in effect) || effect.seatId !== seat.seatId) return current;
              if (effect.type === "damage") return "hit";
              if (effect.type === "heal") return "heal";
              if (effect.type === "skill") return "skill";
              if (effect.type === "status") return "status";
              if (effect.type === "defeat") return "defeat";
              return current;
            }, "");
            return (
              <PlayerSeatCard
                key={seat.seatId}
                seat={seat}
                style={getSeatStyle(game.seats, seat.seatId, mySeat?.seatId)}
                kgSourceName={getKgSourceName(game, seat)}
                isSelf={seat.playerId === identity.id}
                isCurrent={seat.seatId === currentSeat?.seatId}
                isSelectedTarget={seat.seatId === targetSeatId}
                isChoiceTarget={choiceTargetSeatIds.includes(seat.seatId) || (cjjShiguanSelecting && seat.alive && seat.seatId !== mySeat?.seatId)}
                canDrop={canDrop}
                isDragOver={dragOverSeatId === seat.seatId}
                visualEffect={visualEffect}
                onSelect={() => {
                  if (seat.alive && (seat.playerId !== identity.id || selectedHandCard?.cardKey === "tiesuo")) {
                    selectTargetSeat(seat.seatId);
                  }
                }}
                onHover={(hovered) => handleSeatHover(seat.seatId, hovered)}
                onDragOver={(event) => {
                  if (!canDrop) return;
                  event.preventDefault();
                  setDragOverSeatId(seat.seatId);
                }}
                onDragLeave={() => setDragOverSeatId("")}
                onDrop={(event) => dropToSeat(event, seat)}
              />
            );
          })}
        </div>
        {hoveredSeat && <CharacterHoverPanel seat={hoveredSeat} kgSourceName={getKgSourceName(game, hoveredSeat)} dock={hoveredSeatDock} />}
        <GiftLayer gifts={tableGifts} seats={game.seats} selfSeatId={mySeat?.seatId} />

        <div
          className={`center-field sg-center-field ${pending || pendingChoice ? "has-prompt" : ""} ${dropZone === "center" ? "drop-active" : ""}`}
          data-drop-zone="center"
          onDragOver={(event) => allowDrop(event, "center")}
          onDragLeave={() => setDropZone("")}
          onDrop={dropToCenter}
        >
          <PlayedCardStack cards={game.publicCards.length > 0 ? game.publicCards : recentCards} />
          {game.winnerSeatId && <strong className="winner-banner">胜者：{game.seats.find((seat) => seat.seatId === game.winnerSeatId)?.playerName}</strong>}
          {pendingChoice ? (
            <ChoicePanel
              game={game}
              pendingChoice={pendingChoice}
              isMine={isMyChooser}
              actionBusy={Boolean(actionBusy)}
              playerId={identity.id}
              onAction={onAction}
            />
          ) : pending ? (
            <div
              className={`response-panel sg-response-panel ${dropZone === "response" ? "drop-active" : ""}`}
              data-drop-zone="response"
              onDragOver={(event) => allowDrop(event, "response")}
              onDragLeave={() => setDropZone("")}
              onDrop={dropToResponse}
            >
              <strong>{pending.prompt}</strong>
              <span>需要：{responseText(pending.responseType)}</span>
              {isGlobalWuxie && !isListedWuxieResponder ? (
                <small>你没有无懈可击，已自动视为不响应。</small>
              ) : hasPassedResponse ? (
                <small>你已选择不响应，正在等待其他玩家。</small>
              ) : (
                <small>可把对应手牌拖到这里；倒计时结束将自动放弃响应。</small>
              )}
              {isMyResponder && (
                <div className="response-action-row">
                  {isGlobalWuxie && mySeat?.character.id === "builtin-bao-taihou" && myHand.length >= 2 && (
                    <button
                      type="button"
                      disabled={Boolean(actionBusy) || hasPassedResponse}
                      onClick={() => { setBaoWuxieSelecting((value) => !value); setBaoWuxieCardIds([]); }}
                    >
                      两牌当无懈
                    </button>
                  )}
                  <button
                    className="response-pass-button"
                    disabled={actionBusy || hasPassedResponse}
                    onClick={() => onAction({ type: "PASS_RESPONSE", playerId: identity.id })}
                  >
                    {hasPassedResponse ? "已不响应" : "不响应"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            fangtianActive && (
              <div className="target-strip target-strip-floating">
                <span>方天画戟目标</span>
                <div className="target-chip-row">
                  {targets.map((seat) => (
                    <button
                      type="button"
                      key={seat.seatId}
                      className={fangtianTargetIds.includes(seat.seatId) ? "selected" : ""}
                      onClick={() => toggleFangtianTarget(seat.seatId)}
                    >
                      {seat.playerName}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
          {dragNotice && <b className="drag-notice">{dragNotice}</b>}
        </div>
      </div>

      {isAndroidNative && selectedHandCard && (
        <div className="mobile-card-action-bar">
          <button type="button" className="mobile-card-name" onClick={() => setSelectedCardId("")}>
            <strong>{selectedHandCard.name}</strong>
            <span>{selectedHandCard.requiresTarget ? `目标：${game.seats.find((seat) => seat.seatId === targetSeatId)?.playerName ?? "请选择"}` : "再次点击取消"}</span>
          </button>
          {(canRespondCard(selectedHandCard) || canChooseWithCard(selectedHandCard)) && (
            <button
              type="button"
              className="primary"
              disabled={Boolean(actionBusy)}
              onClick={() => {
                if (pendingChoice && canChooseWithCard(selectedHandCard)) {
                  dispatchCardAction({ type: "CHOOSE_CARD", playerId: identity.id, cardId: selectedHandCard.id });
                  return;
                }
                dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: selectedHandCard.id });
              }}
            >
              响应
            </button>
          )}
          {canPlayCard(selectedHandCard) && (
            <button
              type="button"
              className="primary"
              disabled={Boolean(actionBusy)}
              onClick={() => dispatchCardAction({
                type: "PLAY_CARD",
                playerId: identity.id,
                cardId: selectedHandCard.id,
                targetSeatId: selectedHandCard.requiresTarget ? targetSeatId : undefined,
                targetSeatIds: fangtianActive && fangtianTargetIds.length > 0 ? fangtianTargetIds : undefined,
              })}
            >
              出牌
            </button>
          )}
          {canDiscardCard(selectedHandCard) && (
            <button type="button" className="danger" disabled={Boolean(actionBusy)} onClick={() => dispatchCardAction({ type: "DISCARD_CARD", playerId: identity.id, cardId: selectedHandCard.id })}>
              弃牌
            </button>
          )}
        </div>
      )}

      {!isAndroidNative && selectedHandCard && (canRespondCard(selectedHandCard) || canChooseWithCard(selectedHandCard) || canPlayCard(selectedHandCard) || canDiscardCard(selectedHandCard)) && (
        <div className="desktop-card-action-bar" role="toolbar" aria-label="当前手牌操作">
          <span className="desktop-card-action-name">{selectedHandCard.name}</span>
          {(canRespondCard(selectedHandCard) || canChooseWithCard(selectedHandCard)) && (
            <button
              type="button"
              className="primary"
              disabled={Boolean(actionBusy)}
              onClick={() => {
                if (pendingChoice && canChooseWithCard(selectedHandCard)) {
                  dispatchCardAction({ type: "CHOOSE_CARD", playerId: identity.id, cardId: selectedHandCard.id });
                  return;
                }
                dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: selectedHandCard.id });
              }}
            >
              响应
            </button>
          )}
          {canPlayCard(selectedHandCard) && (
            <button
              type="button"
              className="primary"
              disabled={Boolean(actionBusy)}
              onClick={() => dispatchCardAction({
                type: "PLAY_CARD",
                playerId: identity.id,
                cardId: selectedHandCard.id,
                targetSeatId: selectedHandCard.requiresTarget ? targetSeatId : undefined,
                targetSeatIds: fangtianActive && fangtianTargetIds.length > 0 ? fangtianTargetIds : undefined,
              })}
            >
              出牌
            </button>
          )}
          {canDiscardCard(selectedHandCard) && (
            <button type="button" className="danger" disabled={Boolean(actionBusy)} onClick={() => dispatchCardAction({ type: "DISCARD_CARD", playerId: identity.id, cardId: selectedHandCard.id })}>
              弃牌
            </button>
          )}
        </div>
      )}

      <div className="hand-zone sg-hand-zone">
        <div className="hand-meta">
          <div className="hand-summary">
            <h3>你的手牌</h3>
            <p className="muted">{mySeat ? `体力 ${mySeat.hp}/${mySeat.maxHp}，弃牌上限 ${getRulesRuntime().getHandLimit(mySeat)}` : "未入座"}</p>
          </div>
          <div className="battle-bottom-tools" aria-label="技能与弃牌区">
          {mySeat?.character.id === "builtin-yan-laoban" && (
            <div className="skill-row yan-skill-row" aria-label="严老板技能">
              <span className="skill-status">富可敌国 {yanFillUsed}/5</span>
              <button
                type="button"
                className="skill-pill"
                disabled={Boolean(actionBusy) || !canUseYanXiazhi}
                onClick={() => {
                  setYanDiliSelecting((value) => !value);
                  setYanDiliCardIds([]);
                }}
              >
                下知地理
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-shen-zhuxi" && (
            <div className="skill-row" aria-label="沈主席技能">
              <span className="skill-status">
                红杀盾 {Number(mySeat.skillState?.shenRedShaShield ?? 0)} · 黑杀抽牌 {Number(mySeat.skillState?.shenBlackShaStealUsed ?? 0)}/2
              </span>
              <button
                type="button"
                className="skill-pill limited"
                disabled={actionBusy || !isMyTurn || game.phase !== "play" || Boolean(mySeat.skillState?.shenStudentPartyUsed)}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "shen-xuesheng-dang" })}
              >
                {mySeat.skillState?.shenStudentPartyUsed ? "学生党已用" : "学生党"}
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-deng-gou" && (
            <div className="skill-row deng-skill-row" aria-label="邓狗技能">
              <span className="skill-status">{dengSkillSummary(mySeat, game.gameMode)}</span>
            </div>
          )}
          {mySeat?.character.id === "builtin-huang-daxian" && (
            <HuangDetainedSkillRow
              seat={mySeat}
              disabled={Boolean(actionBusy) || !isMyTurn || game.phase !== "play"}
              onUse={(cardId) => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "huang-use-detained", cardIds: [cardId] })}
            />
          )}
          {mySeat?.character.id === "builtin-haijie-dashen" && (
            <HaijieSkillRow
              seat={mySeat}
              disabled={Boolean(actionBusy) || !isMyTurn || game.phase !== "play"}
              onUse={(cardId) => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "haijie-jiujing", cardIds: [cardId] })}
            />
          )}
          {mySeat?.character.id === "builtin-hong-xiliang" && (
            <div className="skill-row" aria-label="虹吸量技能">
              <span className="skill-status">贪污共犯 {mySeat.skillState?.hongAccompliceTargetSeatId ? "已指定" : "未指定"}</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !isMyTurn || game.phase !== "play" || !targetSeatId || targetSeatId === mySeat.seatId}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "hong-tanwu", targetSeatId })}
              >
                贪污
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-ju-hui" && (
            <div className="skill-row" aria-label="举辉技能">
              <span className="skill-status">板书 {Number(mySeat.skillState?.juBoardMarks ?? 0)}/3</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || Number(mySeat.skillState?.juBoardMarks ?? 0) < 2}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "ju-jianjie-tao" })}
              >
                简洁·桃
              </button>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !targetSeatId || targetSeatId === mySeat.seatId || Number(mySeat.skillState?.juBoardMarks ?? 0) < 3}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "ju-jianjie-copy", targetSeatId })}
              >
                简洁·复制
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-yangzhi-tao" && (
            <div className="skill-row" aria-label="养殖套技能">
              <span className="skill-status">海龟：双武器/双防具，禁马</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !isMyTurn || game.phase !== "play"}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "yang-shuji" })}
              >
                书记
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-tudou" && (
            <div className="skill-row" aria-label="土豆技能">
              <span className="skill-status">生根 {tudouShenggenCooldown > 0 ? `冷却 ${tudouShenggenCooldown}` : "可用"} · 发芽摸牌阶段触发</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !canUseTudouShenggen}
                onClick={() => onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "tudou-shenggen", targetSeatId })}
              >
                生根
              </button>
            </div>
          )}
          {mySeat?.character.id === "builtin-cjj" && (
            <div className={`skill-row ${cjjShiguanSelecting ? "skill-selecting" : ""}`} aria-label="cjj技能">
              <span className="skill-status">
                {cjjShiguanSelecting
                  ? `试管：${selectedHandCard ? `弃置「${selectedHandCard.name}」` : "请选择手牌"} · ${targetSeatId && targetSeatId !== mySeat.seatId ? `目标 ${game.seats.find((seat) => seat.seatId === targetSeatId)?.playerName ?? "已选"}` : "请选择目标"}`
                  : `试管 ${mySeat.skillState?.cjjShiguanTurn === game.turn ? "已用" : "未用"} · 粉笔 ${Number(mySeat.skillState?.cjjFenbiCount ?? 0)}/2`}
              </span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || (cjjShiguanSelecting ? !canConfirmCjjShiguan : !canStartCjjShiguan)}
                onClick={toggleCjjShiguan}
              >
                {cjjShiguanSelecting ? "确认试管" : "试管"}
              </button>
              {cjjShiguanSelecting && (
                <button type="button" className="ghost-button" onClick={() => { setCjjShiguanSelecting(false); setDragNotice(""); }}>
                  取消
                </button>
              )}
            </div>
          )}
          {mySeat?.character.id === "builtin-yang-haiyan" && (
            <div className="skill-row" aria-label="杨嗨厌技能">
              <span className="skill-status">笑里藏刀：桃园/五谷转换 · 巧舌摸牌阶段触发</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !canUseYangXiaoli}
                onClick={() => selectedHandCard && onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "yang-xiaoli-nanman", cardIds: [selectedHandCard.id] })}
              >
                当南蛮
              </button>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !canUseYangXiaoli}
                onClick={() => selectedHandCard && onAction({ type: "USE_SKILL", playerId: identity.id, skillId: "yang-xiaoli-wanjian", cardIds: [selectedHandCard.id] })}
              >
                当万箭
              </button>
            </div>
          )}
          {hasWeapon("zhangba") && (
            <div className="skill-row weapon-skill-row" aria-label="丈八蛇矛技能">
              <span className="skill-status">丈八蛇矛：两牌当杀</span>
              <button
                type="button"
                disabled={Boolean(actionBusy) || !isMyTurn || game.phase !== "play" || isLockedByResponse || myHand.length < 2}
                onClick={() => { setZhangbaSelecting((value) => !value); setZhangbaCardIds([]); }}
              >
                发动
              </button>
            </div>
          )}
          <div
            className={`discard-drop ${dropZone === "discard" ? "drop-active" : ""}`}
            data-drop-zone="discard"
            role="button"
            tabIndex={0}
            onClick={() => setShowDiscardPile((value) => !value)}
            onDragOver={(event) => allowDrop(event, "discard")}
            onDragLeave={() => setDropZone("")}
            onDrop={dropToDiscard}
          >
            弃牌区 · {game.discardPile.length}
          </div>
          </div>
        </div>
        {showDiscardPile && (
          <div className="discard-viewer">
            {game.discardPile.slice(-18).map((card) => (
              <span key={`${card.id}-${card.name}`}>{card.name}</span>
            ))}
            {game.discardPile.length === 0 && <span>暂无弃牌</span>}
          </div>
        )}
        {yanDiliSelecting && (
          <div className="skill-cost-panel">
            <strong>下知地理：选择 2 张手牌弃置，视为使用五谷丰登</strong>
            <div className="skill-cost-cards">
              {orderedHand.map((card) => (
                <button
                  type="button"
                  className={`skill-cost-card ${yanDiliCardIds.includes(card.id) ? "selected" : ""}`}
                  key={card.id}
                  onClick={() => toggleYanDiliCard(card.id)}
                >
                  {card.name}
                </button>
              ))}
            </div>
            <div className="skill-cost-actions">
              <button type="button" disabled={yanDiliCardIds.length !== 2 || Boolean(actionBusy)} onClick={submitYanDili}>
                确认发动
              </button>
              <button type="button" onClick={() => { setYanDiliSelecting(false); setYanDiliCardIds([]); }}>
                取消
              </button>
            </div>
          </div>
        )}
        {zhangbaSelecting && (
          <div className="skill-cost-panel">
            <strong>丈八蛇矛：选择 2 张手牌，视为对当前目标使用杀</strong>
            <div className="skill-cost-cards">
              {orderedHand.map((card) => (
                <button
                  type="button"
                  className={`skill-cost-card ${zhangbaCardIds.includes(card.id) ? "selected" : ""}`}
                  key={card.id}
                  onClick={() => toggleZhangbaCard(card.id)}
                >
                  {card.name}
                </button>
              ))}
            </div>
            <div className="skill-cost-actions">
              <button type="button" disabled={zhangbaCardIds.length !== 2 || !targetSeatId || Boolean(actionBusy)} onClick={submitZhangba}>
                确认出杀
              </button>
              <button type="button" onClick={() => { setZhangbaSelecting(false); setZhangbaCardIds([]); }}>
                取消
              </button>
            </div>
          </div>
        )}
        {baoWuxieSelecting && (
          <div className="skill-cost-panel">
            <strong>愚蠢：选择 2 张手牌，视为使用无懈可击</strong>
            <div className="skill-cost-cards">
              {orderedHand.map((card) => (
                <button
                  type="button"
                  className={`skill-cost-card ${baoWuxieCardIds.includes(card.id) ? "selected" : ""}`}
                  key={card.id}
                  onClick={() => toggleBaoWuxieCard(card.id)}
                >
                  {card.name}
                </button>
              ))}
            </div>
            <div className="skill-cost-actions">
              <button type="button" disabled={baoWuxieCardIds.length !== 2 || Boolean(actionBusy)} onClick={submitBaoWuxie}>
                确认响应
              </button>
              <button type="button" onClick={() => { setBaoWuxieSelecting(false); setBaoWuxieCardIds([]); }}>
                取消
              </button>
            </div>
          </div>
        )}
        <div className="hand-list sg-hand-list">
          {orderedHand.map((card) => (
            <CardView
              key={card.id}
              card={card}
              draggable={false}
              isDragging={draggingCardId === card.id}
              selected={selectedCardId === card.id}
              canPlay={!actionBusy && canPlayCard(card)}
              canRespond={!actionBusy && (canRespondCard(card) || canChooseWithCard(card))}
              canDiscard={!actionBusy && canDiscardCard(card)}
              onSelect={() => {
                if (suppressCardClickRef.current) return;
                setSelectedCardId((current) => (current === card.id ? "" : card.id));
              }}
              onDragStart={(event) => beginCardDrag(event, card)}
              onDragOver={(event) => reorderHandOver(event, card.id)}
              onDrop={(event) => {
                event.preventDefault();
                resetDragState();
              }}
              onDragEnd={resetDragState}
              onPointerDown={(event) => beginTouchCardDrag(event, card)}
              onPointerMove={moveTouchCardDrag}
              onPointerUp={endTouchCardDrag}
              onPointerCancel={endTouchCardDrag}
              onPlay={() =>
                dispatchCardAction({
                  type: "PLAY_CARD",
                  playerId: identity.id,
                  cardId: card.id,
                  targetSeatId: card.requiresTarget ? targetSeatId : undefined,
                  targetSeatIds: fangtianActive && selectedCardId === card.id && fangtianTargetIds.length > 0 ? fangtianTargetIds : undefined,
                })
              }
              onRespond={() => {
                if (pendingChoice && canChooseWithCard(card)) {
                  dispatchCardAction({ type: "CHOOSE_CARD", playerId: identity.id, cardId: card.id });
                  return;
                }
                dispatchCardAction({ type: "RESPOND_CARD", playerId: identity.id, cardId: card.id });
              }}
              onDiscard={() => dispatchCardAction({ type: "DISCARD_CARD", playerId: identity.id, cardId: card.id })}
            />
          ))}
        </div>
      </div>

      {!isAndroidNative && (
        <button
          className={`event-log-toggle ${hasUnreadLog ? "has-unread" : ""}`}
          type="button"
          onClick={() => setEventLogCollapsed(!settings.eventLogCollapsed)}
          aria-expanded={!settings.eventLogCollapsed}
        >
          <ListChecks size={16} />
          <strong>战况</strong>
          <span>{latestLog}</span>
        </button>
      )}

      <aside className={`event-log sg-event-log ${eventLogIsCollapsed ? "collapsed" : "open"}`} aria-hidden={eventLogIsCollapsed}>
        <div className="event-log-head">
          <strong>战况</strong>
          <button type="button" onClick={() => isAndroidNative ? setMobileDrawer("") : setEventLogCollapsed(true)}>收起</button>
        </div>
        {game.logs.slice(-8).map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </aside>

      <GameChatDock
        messages={chatMessages}
        collapsed={isAndroidNative ? mobileDrawer !== "chat" : chatCollapsed}
        enabled={chatEnabled}
        onCollapse={(collapsed) => isAndroidNative ? setMobileDrawer(collapsed ? "" : "chat") : setChatDockCollapsed(collapsed)}
        onSend={onSendChat}
      />
      {isAndroidNative && mobileDrawer === "music" && (
        <aside className="mobile-battle-sheet mobile-music-sheet">
          <div className="mobile-battle-sheet-head">
            <strong>音乐与声音</strong>
            <button type="button" onClick={() => setMobileDrawer("")}>关闭</button>
          </div>
          <MusicControl
            settings={settings}
            audioManager={audioManager}
            bgmTracks={bgmTracks}
            scene="battle"
            onChangeSettings={onChangeSettings}
          />
          {chatEnabled && (
            <label className="mobile-volume-control">
              实时语音音量
              <input type="range" min={0} max={1} step={0.05} value={settings.rtcVoiceVolume} onChange={(event) => onChangeSettings({ rtcVoiceVolume: Number(event.target.value) })} />
            </label>
          )}
        </aside>
      )}
      {giftTargetSeat && (
        <div className="gift-target-bar">
          <button type="button" className="gift-close" onClick={() => setGiftTargetSeatId("")}>×</button>
          <span>互动：{game.seats.find((seat) => seat.seatId === targetSeatId)?.playerName ?? "目标"}</span>
          <button type="button" onClick={() => onSendGift(giftTargetSeat.seatId, "egg")}>🥚 鸡蛋</button>
          <button type="button" onClick={() => onSendGift(giftTargetSeat.seatId, "flower")}>✿ 鲜花</button>
        </div>
      )}
      {battleSettingsOpen && (
        <div className="battle-settings-overlay" role="dialog" aria-modal="true">
          <div className="battle-settings-panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">局内设置</p>
                <h2>牌桌设置</h2>
              </div>
              <button type="button" onClick={() => setBattleSettingsOpen(false)}>关闭</button>
            </div>
            <div className="settings-grid">
              <label>手牌大小
                <input type="range" min={0.85} max={1.15} step={0.05} value={settings.handScale} onChange={(event) => onChangeSettings({ handScale: Number(event.target.value) })} />
              </label>
              <label>牌桌背景
                <select value={settings.tableBackgroundId} onChange={(event) => onChangeSettings({ tableBackgroundId: event.target.value })}>
                  {TABLE_BACKGROUNDS.map((background) => <option key={background.id} value={background.id}>{background.label}</option>)}
                </select>
              </label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.enableDragPlay} onChange={(event) => onChangeSettings({ enableDragPlay: event.target.checked })} /> 启用拖拽出牌</label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.enableHandSort} onChange={(event) => onChangeSettings({ enableHandSort: event.target.checked })} /> 启用手牌排序</label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.transparentHandZone} onChange={(event) => onChangeSettings({ transparentHandZone: event.target.checked })} /> 透明手牌区</label>
              <label className="checkbox-line"><input type="checkbox" checked={settings.reduceMotion} onChange={(event) => onChangeSettings({ reduceMotion: event.target.checked })} /> 减少动画</label>
              <label>战斗特效风格
                <select data-vfx-style-select value={settings.battleVfxStyle} disabled={settings.effectIntensity === "off"} onChange={(event) => onChangeSettings({ battleVfxStyle: event.target.value as GameSettings["battleVfxStyle"] })}>
                  <option value="guofeng">国风 · 三国杀感</option>
                  <option value="anime">动画 · 清透光效</option>
                </select>
              </label>
              <div className="vfx-test-panel">
                <strong>播放特效测试</strong>
                <div>
                  {(["slash", "fire", "thunder", "heal", "negate", "poison", "phase", "defeat"] as BattleEffect["variant"][]).map((variant) => (
                    <button key={variant} type="button" onClick={() => playBattleEffectPreview(variant)}>
                      {battleEffectVariantLabel(variant)}
                    </button>
                  ))}
                  <button type="button" onClick={playCardFlightPreview}>飞牌</button>
                </div>
              </div>
              {chatEnabled && (
                <label>实时语音音量
                  <input type="range" min={0} max={1} step={0.05} value={settings.rtcVoiceVolume} onChange={(event) => onChangeSettings({ rtcVoiceVolume: Number(event.target.value) })} />
                </label>
              )}
            </div>
            <div className="battle-settings-actions">
              <button type="button" onClick={() => { setBattleSettingsOpen(false); onReconnect(); }}>
                <Wifi size={16} /> 重新连接
              </button>
              <button type="button" disabled={Boolean(actionBusy)} onClick={() => { setBattleSettingsOpen(false); onLeaveRoom(); }}>
                <DoorOpen size={16} /> 退出房间
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GiftLayer({
  gifts,
  seats,
  selfSeatId,
}: {
  gifts: PhotonTableGift[];
  seats: GameState["seats"];
  selfSeatId?: string;
}) {
  const visible = gifts.slice(-6);
  if (visible.length === 0) return null;
  return (
    <div className="gift-layer" aria-hidden="true">
      {visible.map((gift) => (
        <span
          key={gift.id}
          className={`gift-projectile gift-${gift.giftType}`}
          style={getGiftFlightStyle(seats, gift, selfSeatId)}
        >
          {gift.giftType === "egg" ? "🥚" : "✿"}
        </span>
      ))}
    </div>
  );
}

const BATTLE_EFFECT_CARD_NAMES: Record<string, string> = {
  sha: "杀",
  fire_sha: "火杀",
  thunder_sha: "雷杀",
  shan: "闪",
  tao: "桃",
  jiu: "酒",
  wuxie: "无懈可击",
  juedou: "决斗",
  nanman: "南蛮入侵",
  wanjian: "万箭齐发",
  huogong: "火攻",
  tiesuo: "铁索连环",
};

function battleEffectCardName(cardKey: string): string {
  return BATTLE_EFFECT_CARD_NAMES[cardKey] ?? cardKey;
}

function battleEffectVariantLabel(variant: BattleEffect["variant"]): string {
  return {
    slash: "斩击",
    fire: "火势",
    thunder: "雷纹",
    heal: "回复",
    buff: "增益",
    trick: "锦囊",
    negate: "封印",
    phase: "阶段",
    defeat: "印记",
    poison: "中毒",
  }[variant];
}

function GameChatDock({
  messages,
  collapsed,
  enabled,
  onCollapse,
  onSend,
}: {
  messages: PhotonChatMessage[];
  collapsed: boolean;
  enabled: boolean;
  onCollapse: (collapsed: boolean) => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const latest = messages.at(-1);
  const [floatingMessage, setFloatingMessage] = useState<PhotonChatMessage | undefined>();
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!latest) return;
    setFloatingMessage(latest);
    const timer = window.setTimeout(() => setFloatingMessage(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [latest?.id]);

  useEffect(() => {
    if (collapsed) return;
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [collapsed, messages.length]);

  const toast = floatingMessage ? (
    <div className="chat-floating-toast" key={floatingMessage.id}>
      <b>{floatingMessage.playerName}</b>
      <span>{floatingMessage.text}</span>
    </div>
  ) : null;

  function submit() {
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText("");
  }

  if (collapsed) {
    return (
      <>
        {toast}
        <button type="button" className="chat-toggle" onClick={() => onCollapse(false)}>
          <Send size={14} />
          <strong>聊天</strong>
          <span>{latest ? `${latest.playerName}: ${latest.text}` : enabled ? "房间文字聊天" : "练习场不可用"}</span>
        </button>
      </>
    );
  }

  return (
    <>
      {toast}
      <aside className="game-chat-dock">
        <div className="chat-head">
          <strong>房间聊天</strong>
          <button type="button" onClick={() => onCollapse(true)}>收起</button>
        </div>
        <div className="chat-messages" ref={messageListRef}>
          {messages.length === 0 && <p>{enabled ? "暂无聊天消息。" : "练习场不连接 Photon，聊天不可用。"}</p>}
          {messages.slice(-50).map((message) => (
            <p key={message.id}>
              <b>{message.playerName}</b>
              <span>{message.text}</span>
            </p>
          ))}
        </div>
        <div className="quick-chat-row">
          {QUICK_CHAT_MESSAGES.map((message, index) => (
            <button
              type="button"
              key={message}
              disabled={!enabled}
              onClick={() => onSend(message)}
              title={`${index + 1}: ${message}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="chat-input-row">
          <input
            value={text}
            maxLength={120}
            disabled={!enabled}
            placeholder={enabled ? "输入聊天内容" : "练习场不可聊天"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              const quickIndex = Number(event.key) - 1;
              if (quickIndex >= 0 && quickIndex < QUICK_CHAT_MESSAGES.length) {
                event.preventDefault();
                onSend(QUICK_CHAT_MESSAGES[quickIndex]!);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" disabled={!enabled || !text.trim()} onClick={submit}>
            发送
          </button>
        </div>
      </aside>
    </>
  );
}

function HuangDetainedSkillRow({
  seat,
  disabled,
  onUse,
}: {
  seat: GameState["seats"][number];
  disabled: boolean;
  onUse: (cardId: string) => void;
}) {
  const detained = getSkillCards(seat.skillState?.huangDetainedCards);
  if (detained.length === 0) {
    return <div className="skill-row"><span className="skill-status">错算扣押 0/3</span></div>;
  }
  return (
    <div className="skill-row huang-skill-row" aria-label="黄大仙错算">
      <span className="skill-status">错算扣押 {detained.length}/3</span>
      {detained.map((card) => (
        <button
          key={card.id}
          type="button"
          className="skill-pill"
          disabled={disabled}
          onClick={() => onUse(card.id)}
          title={`${card.name} ${suitLabel(card.suit)} ${card.rank}`}
        >
          {card.rank} 点
        </button>
      ))}
    </div>
  );
}

function HaijieSkillRow({
  seat,
  disabled,
  onUse,
}: {
  seat: GameState["seats"][number];
  disabled: boolean;
  onUse: (cardId: string) => void;
}) {
  const tricks = seat.hand.filter((card) => card.category === "trick");
  const used = Number(seat.skillState?.haijieAlcoholUsedRound ?? 0);
  const boost = Number(seat.skillState?.haijieMeidiDrawBoostTurns ?? 0);
  return (
    <div className="skill-row haijie-skill-row" aria-label="海杰大神酒精">
      <span className="skill-status">酒精 {Math.min(used, 2)}/2 · 美的 {boost}</span>
      {tricks.slice(0, 4).map((card) => (
        <button
          key={card.id}
          type="button"
          className="skill-pill"
          disabled={disabled || used >= 2}
          onClick={() => onUse(card.id)}
          title={`弃置 ${card.name}，获得酒`}
        >
          {card.name}换酒
        </button>
      ))}
    </div>
  );
}

function getSkillCards(value: unknown): GameCard[] {
  return Array.isArray(value) ? (value as GameCard[]) : [];
}

function ChoicePanel({
  game,
  pendingChoice,
  isMine,
  actionBusy,
  playerId,
  onAction,
}: {
  game: GameState;
  pendingChoice: NonNullable<GameState["pendingChoice"]>;
  isMine: boolean;
  actionBusy: boolean;
  playerId: string;
  onAction: (action: GameAction) => void;
}) {
  const isMultiTargetChoice = pendingChoice.kind === "multi-target-seat";
  const isMultiCardChoice = pendingChoice.kind === "multi-card";
  const isOpeningChoice = pendingChoice.kind === "opening-identity";
  const isTransferChoice = pendingChoice.kind === "sha-transfer";
  const isSkillConfirm = pendingChoice.kind === "skill-confirm";
  const [selectedTargets, setSelectedTargets] = useState<string[]>(pendingChoice.selectedTargetSeatIds ?? []);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  useEffect(() => {
    setSelectedTargets(pendingChoice.selectedTargetSeatIds ?? []);
    setSelectedCards([]);
  }, [pendingChoice.id, pendingChoice.selectedTargetSeatIds]);

  function toggleTarget(seatId: string) {
    setSelectedTargets((current) => {
      if (current.includes(seatId)) return current.filter((id) => id !== seatId);
      const maxTargets = pendingChoice.maxTargets ?? 2;
      return [...current, seatId].slice(0, maxTargets);
    });
  }

  function toggleCard(cardId: string) {
    setSelectedCards((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      return [...current, cardId].slice(0, pendingChoice.maxTargets ?? 2);
    });
  }

  return (
    <div className="choice-panel">
      <strong>{pendingChoice.prompt}</strong>
      {pendingChoice.kind === "discard-suit" && pendingChoice.requiredSuit && (
        <span className="choice-requirement">需要弃置：{suitLabel(pendingChoice.requiredSuit)} 花色</span>
      )}
      {!isMine && <span>等待其他玩家选择。</span>}
      {isMine && isOpeningChoice && (
        <div className="choice-actions identity-opening-actions">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onAction({ type: "CHOOSE_OPENING_IDENTITY", playerId, reveal: true })}
          >
            自爆身份
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onAction({ type: "CHOOSE_OPENING_IDENTITY", playerId, reveal: false })}
          >
            隐藏身份
          </button>
        </div>
      )}
      {isMine && isSkillConfirm && (
        <div className="choice-actions skill-confirm-actions">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onAction({ type: "USE_SKILL", playerId, skillId: pendingChoice.cardName })}
          >
            发动
          </button>
          <button type="button" disabled={actionBusy} onClick={() => onAction({ type: "PASS_CHOICE", playerId })}>
            不发动
          </button>
        </div>
      )}
      {isMine && isMultiTargetChoice && pendingChoice.targetSeatIds && (
        <div className="multi-target-panel">
          <div className="choice-grid">
            {pendingChoice.targetSeatIds.map((seatId) => {
              const seat = game.seats.find((item) => item.seatId === seatId);
              const selectedIndex = selectedTargets.indexOf(seatId);
              return (
                <button
                  key={seatId}
                  type="button"
                  className={selectedIndex >= 0 ? "selected-choice" : ""}
                  disabled={actionBusy}
                  onClick={() => toggleTarget(seatId)}
                >
                  <span>{selectedIndex >= 0 ? `${selectedIndex + 1}. ` : ""}{seat?.playerName ?? seatId}</span>
                  <small>{seat?.chained ? "已横置" : "未横置"}</small>
                </button>
              );
            })}
          </div>
          <div className="choice-actions">
            <button
              type="button"
              disabled={actionBusy || selectedTargets.length < (pendingChoice.minTargets ?? 1)}
              onClick={() => onAction({ type: "CHOOSE_TARGETS", playerId, targetSeatIds: selectedTargets })}
            >
              确认目标
            </button>
            <button type="button" disabled={actionBusy} onClick={() => onAction({ type: "PASS_CHOICE", playerId })}>
              重铸摸牌
            </button>
          </div>
        </div>
      )}
      {isMine && isMultiCardChoice && (
        <div className="multi-target-panel">
          <div className="choice-grid">
            {pendingChoice.choices.map((choice) => {
              const selectedIndex = selectedCards.indexOf(choice.cardId);
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={selectedIndex >= 0 ? "selected-choice" : ""}
                  disabled={actionBusy}
                  onClick={() => toggleCard(choice.cardId)}
                >
                  <span>{selectedIndex >= 0 ? `${selectedIndex + 1}. ` : ""}{choice.cardName}</span>
                  <small>{choiceAreaText(choice.area, choice.slot)}</small>
                </button>
              );
            })}
          </div>
          <div className="choice-actions">
            <button
              type="button"
              disabled={
                actionBusy ||
                selectedCards.length < (pendingChoice.minTargets ?? 2) ||
                selectedCards.length > (pendingChoice.maxTargets ?? 2)
              }
              onClick={() => onAction({ type: "CHOOSE_CARDS", playerId, cardIds: selectedCards })}
            >
              弃置并发动
            </button>
            <button type="button" disabled={actionBusy} onClick={() => onAction({ type: "PASS_CHOICE", playerId })}>
              不发动
            </button>
          </div>
        </div>
      )}
      {isMine && !isMultiTargetChoice && !isMultiCardChoice && !isOpeningChoice && !isSkillConfirm && pendingChoice.targetSeatIds && (
        <div className="choice-grid">
          {pendingChoice.targetSeatIds.map((seatId) => {
            const seat = game.seats.find((item) => item.seatId === seatId);
            return (
              <button
                key={seatId}
                disabled={actionBusy}
                onClick={() => onAction({ type: "CHOOSE_TARGET", playerId, targetSeatId: seatId })}
              >
                {seat?.playerName ?? seatId}
              </button>
            );
          })}
        </div>
      )}
      {isMine && !isMultiCardChoice && pendingChoice.choices.length > 0 && (
        <div className="choice-grid">
          {pendingChoice.choices.map((choice) => (
            <button
              key={choice.id}
              disabled={actionBusy}
              onClick={() => onAction({ type: "CHOOSE_CARD", playerId, cardId: choice.cardId, choiceId: choice.id })}
            >
              <span>{choice.cardName}</span>
              <small>{choiceAreaText(choice.area, choice.slot)}</small>
            </button>
          ))}
        </div>
      )}
      {isMine && !isMultiTargetChoice && !isMultiCardChoice && !isOpeningChoice && !isSkillConfirm && (
        <button disabled={actionBusy} onClick={() => onAction({ type: "PASS_CHOICE", playerId })}>
          {isTransferChoice ? "不转移" : "跳过"}
        </button>
      )}
    </div>
  );
}

function PlayerSeatCard({
  seat,
  style,
  kgSourceName,
  isSelf,
  isCurrent,
  isSelectedTarget,
  isChoiceTarget,
  canDrop,
  isDragOver,
  visualEffect,
  onSelect,
  onHover,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  seat: GameState["seats"][number];
  style: CSSProperties;
  kgSourceName?: string;
  isSelf: boolean;
  isCurrent: boolean;
  isSelectedTarget: boolean;
  isChoiceTarget: boolean;
  canDrop: boolean;
  isDragOver: boolean;
  visualEffect?: "" | "hit" | "heal" | "skill" | "status" | "defeat";
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}) {
  const identityVisible = Boolean(seat.identityRole && (seat.identityRevealed || isSelf));
  const identityLabel = seat.identityRole ? (identityVisible ? identityRoleText(seat.identityRole) : "身份未明") : "自由局";
  const identityClass = seat.identityRole && identityVisible ? `identity-${seat.identityRole}` : "identity-hidden";
  const statusTags = collectSeatStatusTags(seat, kgSourceName);
  const plateSlots = getSeatPlateSlots(seat);
  const skillPlateSlots: SeatPlateSlot[] = statusTags
    .filter((tag) => tag.kind === "skill")
    .map((tag) => ({
      key: tag.key,
      kind: tag.kind,
      icon: tag.icon,
      label: tag.label,
      name: tag.label,
      title: tag.title,
    }));
  const sideRailSlots = [...plateSlots, ...skillPlateSlots];
  const visiblePlateSlots = sideRailSlots.slice(0, 4);
  const hiddenSlotCount = Math.max(0, sideRailSlots.length - visiblePlateSlots.length);
  const statusSummary = statusTags.map((tag) => tag.title).join("；");

  return (
    <article
      data-seat-id={seat.seatId}
      data-seat-card="true"
      className={`player-plate sg-player-card ${isSelf ? "self" : ""} ${isCurrent ? "current" : ""} ${isSelectedTarget ? "selected-target" : ""} ${isChoiceTarget ? "choice-target" : ""} ${seat.chained ? "chained" : ""} ${seat.alive ? "" : "defeated"} ${canDrop ? "can-drop" : ""} ${isDragOver ? "drag-over" : ""} ${visualEffect ? `vfx-seat-${visualEffect}` : ""}`}
      style={style}
      tabIndex={0}
      role="button"
      aria-label={`${seat.playerName} ${seat.character.name} 体力 ${seat.hp}/${seat.maxHp}${statusSummary ? `，${statusSummary}` : ""}`}
      onClick={onSelect}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerCancel={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className={`faction-ribbon faction-${seat.character.faction}`} title={`阵营：${factionText(seat.character.faction)}`}>
        <FactionIcon faction={seat.character.faction} />
      </span>
      <span className={`identity-ribbon ${identityClass} ${seat.teamId ? `team-${seat.teamId}` : ""}`} title={`身份：${identityLabel}${seat.teamId ? `，${seat.teamId === "warm" ? "暖色队" : "冷色队"}` : ""}`}>
        <IdentityIcon role={seat.identityRole} visible={identityVisible} teamId={seat.teamId} />
      </span>
      <div className="portrait sg-portrait">
        {getCharacterArtUrl(seat.character) ? <img src={getCharacterArtUrl(seat.character)} alt="" /> : seat.character.name.slice(0, 1)}
      </div>
      {seat.chained && <span className="chain-wrap" aria-hidden="true"><i /><i /></span>}
      <HealthBar hp={seat.hp} maxHp={seat.maxHp} />
      <span className="hand-count-badge" title={`手牌 ${seat.hand.length} 张`}>
        <b>{seat.hand.length}</b>
      </span>
      <div className="seat-info">
        <strong title={seat.character.name}>{shortPlateName(seat.character.name)}</strong>
        <span>{seat.playerName}</span>
      </div>
      {(visiblePlateSlots.length > 0 || hiddenSlotCount > 0) && (
        <div className="seat-equipment-slots" aria-label="装备、马与标记">
          {visiblePlateSlots.map((slot) => (
            <span className={`filled slot-${slot.kind}`} title={slot.title} key={slot.key}>
              <i aria-hidden="true">{slot.icon}</i>
              <b>{slot.label}</b>
              <em>{slot.name}</em>
            </span>
          ))}
          {hiddenSlotCount > 0 && <span className="filled more" title="更多装备/标记请悬停查看"><i aria-hidden="true">+</i><b>更多</b><em>{hiddenSlotCount}</em></span>}
        </div>
      )}
    </article>
  );
}

type SeatPlateSlot = {
  key: string;
  kind: string;
  icon: string;
  label: string;
  name: string;
  title: string;
};

function getSeatPlateSlots(seat: GameState["seats"][number]): SeatPlateSlot[] {
  const slots: SeatPlateSlot[] = [];
  if (seat.equipment.weapon) slots.push({ key: "weapon", kind: "weapon", icon: "⚔", label: "武器", name: compactSlotName(seat.equipment.weapon.name), title: `武器：${seat.equipment.weapon.name}` });
  if (seat.equipment.armor) slots.push({ key: "armor", kind: "armor", icon: "▣", label: "防具", name: compactSlotName(seat.equipment.armor.name), title: `防具：${seat.equipment.armor.name}` });
  if (seat.equipment.attackHorse) slots.push({ key: "attackHorse", kind: "horse", icon: "↗", label: "进马", name: compactSlotName(seat.equipment.attackHorse.name), title: `进攻马：${seat.equipment.attackHorse.name}` });
  if (seat.equipment.defenseHorse) slots.push({ key: "defenseHorse", kind: "horse", icon: "↙", label: "防马", name: compactSlotName(seat.equipment.defenseHorse.name), title: `防御马：${seat.equipment.defenseHorse.name}` });
  if (seat.judgementArea.length > 0) slots.push({ key: "judgement", kind: "judge", icon: "判", label: "判定", name: `${seat.judgementArea.length}`, title: `判定区：${seat.judgementArea.map((card) => card.name).join("、")}` });
  return slots;
}

type SeatStatusTag = {
  key: string;
  label: string;
  icon: string;
  kind: "equip" | "judge" | "skill" | "chain" | "team";
  title: string;
};

function collectSeatStatusTags(seat: GameState["seats"][number], kgSourceName?: string): SeatStatusTag[] {
  const tags: SeatStatusTag[] = [];
  if (seat.teamId) {
    tags.push({
      key: "team",
      label: seat.teamId === "warm" ? "暖" : "冷",
      icon: seat.teamId === "warm" ? "阳" : "阴",
      kind: "team",
      title: seat.teamId === "warm" ? "暖色队" : "冷色队",
    });
  }
  if (seat.equipment.weapon) tags.push({ key: "weapon", label: seat.equipment.weapon.name, icon: "武", kind: "equip", title: `武器：${seat.equipment.weapon.name}` });
  if (seat.equipment.armor) tags.push({ key: "armor", label: seat.equipment.armor.name, icon: "甲", kind: "equip", title: `防具：${seat.equipment.armor.name}` });
  if (seat.equipment.attackHorse) tags.push({ key: "attackHorse", label: seat.equipment.attackHorse.name, icon: "进", kind: "equip", title: `进攻马：${seat.equipment.attackHorse.name}` });
  if (seat.equipment.defenseHorse) tags.push({ key: "defenseHorse", label: seat.equipment.defenseHorse.name, icon: "防", kind: "equip", title: `防御马：${seat.equipment.defenseHorse.name}` });
  if (seat.chained) tags.push({ key: "chain", label: "铁索", icon: "链", kind: "chain", title: "铁索连环：横置，受到属性伤害会传导。" });
  if (seat.judgementArea.length > 0) tags.push({ key: "judgement", label: `判定×${seat.judgementArea.length}`, icon: "判", kind: "judge", title: `判定区：${seat.judgementArea.map((card) => card.name).join("、")}` });
  if (typeof seat.skillState?.kgSourceSeatId === "string") tags.push({ key: "kg", label: `kg·${kgSourceName ?? "未知"}`, icon: "记", kind: "skill", title: `kg 标记来自 ${kgSourceName ?? "未知角色"}，持续到该角色回合结束。` });
  if (typeof seat.skillState?.cjjPoisonSourceSeatId === "string") {
    tags.push({ key: "cjjPoison", label: "毒", icon: "毒", kind: "skill", title: "试管毒标记：下一轮内造成伤害后失去 1 点体力并摸 1 张牌。" });
  }
  if (typeof seat.skillState?.tudouRootSourceSeatId === "string" || typeof seat.skillState?.tudouRootTargetSeatId === "string") {
    tags.push({ key: "tudouRoot", label: "生根", icon: "根", kind: "skill", title: "生根：本轮与绑定角色共享伤害传导。" });
  }
  if (seat.character.id === "builtin-deng-gou" && seat.skillState?.dengRevealed) tags.push({ key: "dengRevealed", label: "三五公开", icon: "明", kind: "skill", title: "邓狗：三五牌已公开。" });
  if (seat.character.id === "builtin-deng-gou" && seat.skillState?.dengHiddenHorse) tags.push({ key: "dengHiddenHorse", label: "隐匿+1马", icon: "隐", kind: "skill", title: "邓狗：存在隐匿 +1 马。" });
  if (seat.character.id === "builtin-deng-gou" && Number(seat.skillState?.dengTransferCharges ?? 0) > 0) {
    tags.push({ key: "dengTransfer", label: `转杀×${Number(seat.skillState?.dengTransferCharges ?? 0)}`, icon: "转", kind: "skill", title: "邓狗：可转移杀的次数。" });
  }
  if (seat.character.id === "builtin-deng-gou" && seat.skillState?.dengRenegadeReviveAvailable) tags.push({ key: "dengRevive", label: "起死回生", icon: "生", kind: "skill", title: "邓狗：仍有起死回生机会。" });
  if (seat.character.id === "builtin-huang-daxian") {
    const detained = getSkillCards(seat.skillState?.huangDetainedCards).length;
    if (detained > 0) tags.push({ key: "huangDetained", label: `扣押 ${detained}/3`, icon: "扣", kind: "skill", title: `黄大仙：扣押牌 ${detained}/3。` });
  }
  if (seat.character.id === "builtin-gay-guan") tags.push({ key: "gaySilence", label: `沉默${seat.maxHp > 1 ? "" : "封顶"}`, icon: "默", kind: "skill", title: `给关：沉默状态${seat.maxHp > 1 ? "可选" : "封顶"}。` });
  if (seat.character.id === "builtin-haijie-dashen" && Number(seat.skillState?.haijieMeidiDrawBoostTurns ?? 0) > 0) {
    tags.push({ key: "haijieMeidi", label: `美的×${Number(seat.skillState?.haijieMeidiDrawBoostTurns ?? 0)}`, icon: "美", kind: "skill", title: "海杰大神：摸牌增益回合数。" });
  }
  if (seat.character.id === "builtin-hong-xiliang" && seat.skillState?.hongAccompliceTargetSeatId) tags.push({ key: "hongTarget", label: "共犯", icon: "共", kind: "skill", title: "红喜亮：已指定共犯目标。" });
  if (seat.skillState?.hongAccompliceSourceSeatId) tags.push({ key: "hongMark", label: "共犯标记", icon: "犯", kind: "skill", title: "身上存在共犯标记。" });
  if (seat.character.id === "builtin-ju-hui" && Number(seat.skillState?.juBoardMarks ?? 0) > 0) {
    tags.push({ key: "juBoard", label: `板书×${Number(seat.skillState?.juBoardMarks ?? 0)}`, icon: "书", kind: "skill", title: "巨辉：板书标记数量。" });
  }
  if (seat.character.id === "builtin-ju-hui" && seat.skillState?.juCopiedFromSeatId) tags.push({ key: "juCopied", label: "复制技", icon: "复", kind: "skill", title: "巨辉：当前复制了其他角色技能。" });
  if (seat.character.id === "builtin-yangzhi-tao") {
    const weapons = getSkillCards(seat.skillState?.yangExtraWeapons).length;
    const armors = getSkillCards(seat.skillState?.yangExtraArmors).length;
    if (weapons || armors) tags.push({ key: "yangExtra", label: `海龟 ${weapons}/${armors}`, icon: "龟", kind: "skill", title: `杨志涛：额外武器 ${weapons}，额外防具 ${armors}。` });
  }
  return tags;
}

function FactionIcon({ faction }: { faction: CharacterDefinition["faction"] }) {
  if (faction === "shu") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 8c5-2 8-1 10 2 2-3 5-4 10-2v17c-5-2-8-1-10 2-2-3-5-4-10-2V8Z" />
        <path d="M16 10v16M9 12c3-.8 5-.3 7 1.6M23 12c-3-.8-5-.3-7 1.6" />
      </svg>
    );
  }
  if (faction === "qun") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M9 11h10l4 4v5l-4 4H9l-2-2v-9l2-2Z" />
        <path d="M19 13l7-3 1 3-6 4M11 15h5M11 20h7" />
      </svg>
    );
  }
  if (faction === "wei") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 21 21 8l3 3-13 13-5 1 2-4Z" />
        <path d="M19 10l3 3M7 25h18" />
      </svg>
    );
  }
  if (faction === "wu") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="11" cy="17" r="5" />
        <circle cx="21" cy="17" r="5" />
        <path d="M16 17h0M6 17H3M29 17h-3M11 12l-1-4M21 12l1-4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 5 27 16 16 27 5 16 16 5Z" />
      <path d="M11 16h10M16 11v10" />
    </svg>
  );
}

function IdentityIcon({
  role,
  visible,
  teamId,
}: {
  role: GameState["seats"][number]["identityRole"];
  visible: boolean;
  teamId?: GameState["seats"][number]["teamId"];
}) {
  const label = role ? (visible ? { lord: "主", loyalist: "忠", rebel: "反", renegade: "内" }[role] : "?") : teamId ? (teamId === "warm" ? "阳" : "阴") : "局";
  return <b>{label}</b>;
}

function PlayedCardStack({ cards }: { cards: GameCard[] }) {
  if (cards.length === 0) {
    return <div className="played-card-stack empty"><span>等待出牌</span></div>;
  }
  return (
    <div className="played-card-stack">
      {cards.map((card, index) => (
        <div
          className={`mini-play-card ${card.cardKey}`}
          style={{ "--stack-offset": `${index * 46}px`, "--stack-lift": `${index * 5}px` } as CSSProperties}
          key={`${card.id}-${index}`}
        >
          <span>{card.rank}</span>
          <strong>{card.name}</strong>
        </div>
      ))}
    </div>
  );
}

function getGiftFlightStyle(seats: GameState["seats"], gift: PhotonTableGift, selfSeatId?: string): CSSProperties {
  const senderSeatId = seats.find((seat) => seat.playerId === gift.fromPlayerId)?.seatId ?? selfSeatId;
  const [fromX, fromY] = senderSeatId ? getRelativeSeatPoint(seats, senderSeatId, selfSeatId) : [50, 92];
  const [toX, toY] = getRelativeSeatPoint(seats, gift.toSeatId, selfSeatId);
  const midX = (fromX + toX) / 2;
  const midY = Math.max(8, Math.min(fromY, toY) - 14);
  return {
    "--gift-from-x": `${fromX}%`,
    "--gift-from-y": `${fromY}%`,
    "--gift-mid-x": `${midX}%`,
    "--gift-mid-y": `${midY}%`,
    "--gift-to-x": `${toX}%`,
    "--gift-to-y": `${toY}%`,
  } as CSSProperties;
}

function getSeatStyle(seats: GameState["seats"], seatId: string, selfSeatId?: string): CSSProperties {
  const [x, y] = getRelativeSeatPoint(seats, seatId, selfSeatId);
  const labelOnRight = x < 50;
  return {
    "--seat-x": `${x}%`,
    "--seat-y": `${y}%`,
    "--seat-order": getRelativeSeatIndex(seats, seatId, selfSeatId),
    "--seat-label-left": labelOnRight ? "calc(100% + 8px)" : "auto",
    "--seat-label-right": labelOnRight ? "auto" : "calc(100% + 8px)",
  } as CSSProperties;
}

function getCharacterArtUrl(character: CharacterDefinition): string | undefined {
  const configured = character.artUrl || character.artPath;
  if (configured) {
    return /^(https?:|data:|blob:)/i.test(configured)
      ? configured
      : resolveAssetUrl(configured.replace(/^\.?\//, ""));
  }
  if (character.id.startsWith("builtin-")) {
    return resolveAssetUrl(`assets/ui/characters/${character.id}.jpg`);
  }
  return undefined;
}

function getKgSourceName(game: GameState, seat: GameState["seats"][number]): string | undefined {
  const sourceSeatId = typeof seat.skillState?.kgSourceSeatId === "string" ? seat.skillState.kgSourceSeatId : undefined;
  if (!sourceSeatId) return undefined;
  const source = game.seats.find((item) => item.seatId === sourceSeatId);
  return source?.playerName ?? source?.character.name;
}

function getTargetingBeamStyle(seats: GameState["seats"], seatId: string, selfSeatId?: string): CSSProperties {
  const [x, y] = getRelativeSeatPoint(seats, seatId, selfSeatId);
  const dx = x - 50;
  const dy = y - 50;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const length = Math.max(12, Math.sqrt(dx * dx + dy * dy));
  return {
    "--beam-angle": `${angle}deg`,
    "--beam-length": `${length}%`,
  } as CSSProperties;
}

function getRelativeSeatPoint(seats: GameState["seats"], seatId: string, selfSeatId?: string): [number, number] {
  const count = Math.min(8, Math.max(2, seats.length));
  const relativeIndex = getRelativeSeatIndex(seats, seatId, selfSeatId);
  const positionTable = isAndroidNative ? MOBILE_SEAT_POSITIONS : SEAT_POSITIONS;
  const positions = positionTable[count] ?? positionTable[8];
  return positions[Math.min(relativeIndex, positions.length - 1)] ?? [50, 50];
}

function getRelativeSeatIndex(seats: GameState["seats"], seatId: string, selfSeatId?: string): number {
  const index = seats.findIndex((seat) => seat.seatId === seatId);
  const selfIndex = Math.max(0, seats.findIndex((seat) => seat.seatId === selfSeatId));
  return index >= 0 ? (index - selfIndex + seats.length) % seats.length : 0;
}

const SEAT_POSITIONS: Record<number, Array<[number, number]>> = {
  2: [[86, 67], [50, 24]],
  3: [[86, 68], [15, 60], [50, 23]],
  4: [[86, 68], [15, 60], [35, 23], [65, 23]],
  5: [[86, 69], [15, 66], [13, 39], [50, 22], [87, 39]],
  6: [[86, 70], [15, 67], [12, 37], [35, 22], [65, 22], [88, 37]],
  7: [[86, 70], [15, 68], [12, 45], [23, 25], [50, 20], [77, 25], [89, 45]],
  8: [[86, 70], [15, 68], [11, 46], [22, 27], [40, 20], [60, 20], [78, 27], [89, 46]],
};

const MOBILE_SEAT_POSITIONS: Record<number, Array<[number, number]>> = {
  2: [[86, 70], [54, 29]],
  3: [[86, 70], [15, 52], [64, 29]],
  4: [[86, 70], [14, 54], [56, 29], [82, 40]],
  5: [[86, 70], [14, 58], [13, 39], [56, 29], [83, 41]],
  6: [[86, 70], [14, 58], [12, 40], [46, 28], [69, 29], [84, 43]],
  7: [[86, 70], [14, 58], [12, 41], [27, 29], [52, 27], [76, 30], [85, 44]],
  8: [[86, 70], [14, 58], [12, 40], [24, 29], [43, 27], [61, 27], [79, 30], [86, 44]],
};

function PlayerAvatar({ user }: { user: Pick<UserProfile, "displayName" | "defaultAvatarKey"> }) {
  return <span className={`avatar ${user.defaultAvatarKey}`}>{user.displayName.slice(0, 1)}</span>;
}

function MusicControl({
  settings,
  audioManager,
  bgmTracks,
  scene,
  compact = false,
  onChangeSettings,
}: {
  settings: GameSettings;
  audioManager: AudioManager;
  bgmTracks: AudioTrack[];
  scene: "lobby" | "battle" | "settings";
  compact?: boolean;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
}) {
  const [playing, setPlaying] = useState(audioManager.isPlaying());
  const tracks = bgmTracks.length > 0 ? bgmTracks : getBgmTracks();
  const currentTrack = tracks.find((track) => track.id === settings.currentBgmId) ?? tracks[0] ?? getBgmTracks()[0];
  const scopedTracks = tracks.filter((track) => scene === "settings" || track.scene === "any" || track.scene === scene);
  const visibleTracks = scopedTracks.some((track) => track.id === currentTrack.id) ? scopedTracks : [currentTrack, ...scopedTracks];

  useEffect(() => {
    setPlaying(audioManager.isPlaying());
  }, [audioManager, settings.currentBgmId]);

  async function playTrack(trackId: string) {
    onChangeSettings({ currentBgmId: trackId });
    const ok = await audioManager.playBgm(trackId);
    setPlaying(ok);
  }

  async function togglePlay() {
    const ok = await audioManager.toggleBgm(settings.currentBgmId);
    setPlaying(ok);
  }

  async function move(delta: number) {
    const nextId = adjacentTrackId(settings.currentBgmId, delta, tracks);
    onChangeSettings({ currentBgmId: nextId });
    const ok = await audioManager.playBgm(nextId);
    setPlaying(ok);
  }

  return (
    <div className={`music-control ${compact ? "compact" : ""}`}>
      <div className="music-main">
        <Volume2 size={16} />
        {!compact && <strong>{currentTrack.label}</strong>}
        <select
          aria-label="选择背景音乐"
          value={settings.currentBgmId}
          onChange={(event) => {
            const nextId = event.target.value;
            onChangeSettings({ currentBgmId: nextId });
            if (playing || settings.autoResume) void playTrack(nextId);
          }}
        >
          {visibleTracks.map((track) => (
            <option key={track.id} value={track.id}>{track.label}</option>
          ))}
        </select>
      </div>
      <div className="music-buttons">
        <button type="button" aria-label="上一首" onClick={() => void move(-1)}><SkipBack size={14} /></button>
        <button type="button" aria-label={playing ? "暂停音乐" : "播放音乐"} onClick={() => void togglePlay()}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" aria-label="下一首" onClick={() => void move(1)}><SkipForward size={14} /></button>
      </div>
      {!compact && (
        <label className="volume-inline">
          音量
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.masterVolume}
            onChange={(event) => onChangeSettings({ masterVolume: Number(event.target.value) })}
          />
        </label>
      )}
    </div>
  );
}

function CharacterHoverPanel({
  seat,
  kgSourceName,
  dock,
}: {
  seat: GameState["seats"][number];
  kgSourceName?: string;
  dock: "left" | "right";
}) {
  const hasKgMarker = typeof seat.skillState?.kgSourceSeatId === "string";
  const identityVisible = Boolean(seat.identityRole && seat.identityRevealed);
  const identityLabel = seat.identityRole ? (identityVisible ? identityRoleText(seat.identityRole) : "身份未明") : "自由局";
  const skillDescription =
    seat.character.skillText ||
    seat.character.skills.map((skill) => `${skill.name}：${skill.description}`).join("\n") ||
    "暂无技能描述。";
  return (
    <aside className={`character-hover-panel dock-${dock}`}>
      <div className="hover-portrait">
        {getCharacterArtUrl(seat.character) ? <img src={getCharacterArtUrl(seat.character)} alt="" /> : <span>{seat.character.name.slice(0, 1)}</span>}
      </div>
      <div className="hover-character-info">
        <p className="eyebrow">{factionText(seat.character.faction)} · {genderText(seat.character.gender)}</p>
        <h3>{seat.character.name}</h3>
        <strong>{seat.playerName}</strong>
        <small>身份：{identityLabel} · 手牌：{seat.hand.length}</small>
        <HealthBar hp={seat.hp} maxHp={seat.maxHp} />
      </div>
      {hasKgMarker && (
        <div className="hover-marker-row">
          <span className="status-badge kg-badge">kg 标记</span>
          <strong>来源：{kgSourceName ?? "未知角色"}</strong>
          <small>持续到该角色回合结束</small>
        </div>
      )}
      <div className="hover-slot-grid">
        {(["weapon", "armor", "attackHorse", "defenseHorse"] as const).map((slot) => (
          <span className={seat.equipment[slot] ? "filled" : ""} key={slot}>
            {equipmentSlotText(slot)}：{seat.equipment[slot]?.name ?? "空"}
          </span>
        ))}
        {Array.from({ length: 3 }, (_, index) => seat.judgementArea[index]).map((card, index) => (
          <span className={card ? "filled" : ""} key={index}>判定：{card?.name ?? "空"}</span>
        ))}
      </div>
      <div className="hover-skill-panel">
        <h4>技能说明</h4>
        <p>{skillDescription}</p>
      </div>
    </aside>
  );
}

function useGameAudioEvents(game: GameState, audioManager: AudioManager) {
  const previousRef = useRef<GameState | undefined>(undefined);
  const killStreakRef = useRef<{ killer: string; count: number }>({ killer: "", count: 0 });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = game;
    if (!previous || previous.id !== game.id) {
      killStreakRef.current = { killer: "", count: 0 };
      return;
    }

    const newLogs = game.logs.slice(previous.logs.length);
    for (const line of newLogs) {
      const killMatch = /^(.+?) 击败 (.+?)。$/.exec(line);
      if (!killMatch) continue;
      const killer = killMatch[1]!;
      killStreakRef.current =
        killStreakRef.current.killer === killer
          ? { killer, count: Math.min(8, killStreakRef.current.count + 1) }
          : { killer, count: 1 };
      audioManager.playAnnouncer(`kill${killStreakRef.current.count}` as keyof typeof ANNOUNCERS);
    }

    if (game.lastCardVoice && game.lastCardVoice.seq !== previous.lastCardVoice?.seq) {
      const voiceSeat = game.seats.find((seat) => seat.seatId === game.lastCardVoice?.seatId);
      audioManager.playCard(game.lastCardVoice.cardKey, voiceSeat?.character.gender);
    }

    for (const seat of game.seats) {
      const oldSeat = previous.seats.find((item) => item.seatId === seat.seatId);
      if (!oldSeat) continue;
      if (seat.hp < oldSeat.hp) audioManager.playDamage();
      if (seat.hp > oldSeat.hp) audioManager.playHeal();
      if (equipmentFingerprint(seat) !== equipmentFingerprint(oldSeat)) {
        audioManager.playEquip();
      }
    }
  }, [audioManager, game]);
}

function adjacentTrackId(currentTrackId: string, delta: number, tracks = getBgmTracks()): string {
  const list = tracks.length > 0 ? tracks : getBgmTracks();
  const currentIndex = Math.max(0, list.findIndex((track) => track.id === currentTrackId));
  return (list[(currentIndex + delta + list.length) % list.length] ?? list[0]).id;
}

function equipmentFingerprint(seat: GameState["seats"][number]): string {
  return ["weapon", "armor", "attackHorse", "defenseHorse"]
    .map((slot) => seat.equipment[slot as keyof typeof seat.equipment]?.id ?? "-")
    .join("|");
}

function isResponseEligibleForSeat(pending: NonNullable<GameState["pendingResponse"]>, seatId: string): boolean {
  if (pending.mode === "global") {
    return Boolean(
      pending.eligibleResponderSeatIds?.includes(seatId) &&
        !pending.passedSeatIds?.includes(seatId)
    );
  }
  return pending.responderSeatId === seatId;
}

function getTableRound(game: GameState): number {
  const aliveCount = Math.max(1, game.seats.filter((seat) => seat.alive).length);
  return Math.floor((game.turn - 1) / aliveCount);
}

function runPracticeAi(state: GameState, humanPlayerId: string): GameState {
  let next = state;
  for (let index = 0; index < 48; index += 1) {
    const action = choosePracticeAiAction(next, humanPlayerId);
    if (!action) break;
    try {
      next = getRulesRuntime().applyGameAction(next, action).state;
    } catch {
      const fallback = choosePracticeTimeoutAction(next, humanPlayerId);
      if (!fallback) break;
      next = getRulesRuntime().applyGameAction(next, fallback).state;
    }
  }
  return next;
}

function choosePracticeAiAction(game: GameState, humanPlayerId: string): GameAction | undefined {
  if (game.phase === "finished") return undefined;
  const choice = game.pendingChoice;
  if (choice) {
    const chooser = game.seats.find((seat) => seat.seatId === choice.chooserSeatId);
    if (!chooser || chooser.playerId === humanPlayerId) return undefined;
    if (choice.kind === "opening-identity") {
      return { type: "CHOOSE_OPENING_IDENTITY", playerId: chooser.playerId, reveal: false };
    }
    if (choice.kind === "sha-transfer") {
      const targetSeatId = choice.targetSeatIds?.[0];
      return targetSeatId
        ? { type: "CHOOSE_TARGET", playerId: chooser.playerId, targetSeatId }
        : { type: "PASS_CHOICE", playerId: chooser.playerId };
    }
    if (choice.kind === "multi-target-seat") {
      const targetSeatIds = choice.targetSeatIds?.slice(0, choice.maxTargets ?? 2) ?? [];
      return targetSeatIds.length > 0
        ? { type: "CHOOSE_TARGETS", playerId: chooser.playerId, targetSeatIds }
        : { type: "PASS_CHOICE", playerId: chooser.playerId };
    }
    if (choice.kind === "target-seat" && choice.targetSeatIds?.[0]) {
      return { type: "CHOOSE_TARGET", playerId: chooser.playerId, targetSeatId: choice.targetSeatIds[0] };
    }
    if (choice.kind === "skill-confirm" && choice.cardName === "sanshui-kg-mercy") {
      return { type: "USE_SKILL", playerId: chooser.playerId, skillId: "sanshui-kg-mercy" };
    }
    if (choice.kind === "skill-confirm" && choice.cardName === "yang-qiaoshe") {
      return { type: "PASS_CHOICE", playerId: chooser.playerId };
    }
    if (choice.kind === "skill-target" && choice.cardName === "tudou-faya") {
      const targetSeatId = choice.targetSeatIds?.[0];
      return targetSeatId
        ? { type: "CHOOSE_TARGET", playerId: chooser.playerId, targetSeatId }
        : { type: "PASS_CHOICE", playerId: chooser.playerId };
    }
    if (choice.kind === "multi-card" && choice.cardName === "tudou-shenggen-prevent") {
      return { type: "PASS_CHOICE", playerId: chooser.playerId };
    }
    if (choice.choices[0]) {
      return { type: "CHOOSE_CARD", playerId: chooser.playerId, cardId: choice.choices[0].cardId, choiceId: choice.choices[0].id };
    }
    return { type: "PASS_CHOICE", playerId: chooser.playerId };
  }

  const pending = game.pendingResponse;
  if (pending) {
    const responder = game.seats.find((seat) => seat.seatId === pending.responderSeatId);
    if (!responder || responder.playerId === humanPlayerId) return undefined;
    const responseCard = responder.hand.find((card) => {
      if (pending.responseType === "tao" && card.cardKey === "jiu" && game.pendingDying?.seatId === responder.seatId) return true;
      if (pending.responseType === "sha") return isShaCard(card);
      return card.cardKey === pending.responseType;
    });
    return responseCard
      ? { type: "RESPOND_CARD", playerId: responder.playerId, cardId: responseCard.id }
      : { type: "PASS_RESPONSE", playerId: responder.playerId };
  }

  const current = game.seats[game.currentSeatIndex];
  if (!current || current.playerId === humanPlayerId || !current.alive) return undefined;
  if (game.phase === "discard") {
    const discard = current.hand.at(-1);
  return current.hand.length > getRulesRuntime().getHandLimit(current) && discard
      ? { type: "DISCARD_CARD", playerId: current.playerId, cardId: discard.id }
      : { type: "END_TURN", playerId: current.playerId };
  }
  if (game.phase !== "play") return { type: "AUTO_TIMEOUT", playerId: current.playerId };

  const target = choosePracticeTarget(game, current.seatId, humanPlayerId);
  const heal = current.hp < current.maxHp ? current.hand.find((card) => card.cardKey === "tao") : undefined;
  if (heal) return { type: "PLAY_CARD", playerId: current.playerId, cardId: heal.id };

  const equip = current.hand.find((card) => card.category === "equip");
  if (equip) return { type: "PLAY_CARD", playerId: current.playerId, cardId: equip.id };

  const jiu = !game.activeTurn.jiuUsed && current.hand.some(isShaCard) ? current.hand.find((card) => card.cardKey === "jiu") : undefined;
  if (jiu) return { type: "PLAY_CARD", playerId: current.playerId, cardId: jiu.id };

  const sha = !game.usedShaThisTurn && target ? current.hand.find(isShaCard) : undefined;
  if (sha && target) return { type: "PLAY_CARD", playerId: current.playerId, cardId: sha.id, targetSeatId: target.seatId };

  const noTargetTrick = current.hand.find((card) => ["wuzhong", "nanman", "wanjian", "taoyuan", "wugu", "shandian"].includes(card.cardKey));
  if (noTargetTrick) return { type: "PLAY_CARD", playerId: current.playerId, cardId: noTargetTrick.id };

  const tiesuo = current.hand.find((card) => card.cardKey === "tiesuo");
  if (tiesuo) return { type: "PLAY_CARD", playerId: current.playerId, cardId: tiesuo.id, targetSeatId: target?.seatId };

  const targetTrick = target ? current.hand.find((card) => ["guohe", "shunshou", "juedou", "jiedao", "huogong", "lebu", "bingliang"].includes(card.cardKey)) : undefined;
  if (targetTrick && target) return { type: "PLAY_CARD", playerId: current.playerId, cardId: targetTrick.id, targetSeatId: target.seatId };

  return { type: "END_TURN", playerId: current.playerId };
}

function choosePracticeTimeoutAction(game: GameState, humanPlayerId: string): GameAction | undefined {
  const choice = game.pendingChoice;
  if (choice) {
    const chooser = game.seats.find((seat) => seat.seatId === choice.chooserSeatId);
    return chooser && chooser.playerId !== humanPlayerId ? { type: "AUTO_TIMEOUT", playerId: chooser.playerId } : undefined;
  }
  const pending = game.pendingResponse;
  if (pending) {
    const responder = game.seats.find((seat) => seat.seatId === pending.responderSeatId);
    return responder && responder.playerId !== humanPlayerId ? { type: "AUTO_TIMEOUT", playerId: responder.playerId } : undefined;
  }
  const current = game.seats[game.currentSeatIndex];
  return current && current.playerId !== humanPlayerId ? { type: "AUTO_TIMEOUT", playerId: current.playerId } : undefined;
}

function choosePracticeTarget(game: GameState, sourceSeatId: string, humanPlayerId: string) {
  return (
    game.seats.find((seat) => seat.playerId === humanPlayerId && seat.alive && seat.seatId !== sourceSeatId) ??
    game.seats.find((seat) => seat.alive && seat.seatId !== sourceSeatId)
  );
}

function getRemainingSeconds(game: GameState, now: number): number {
  const timer = game.actionTimer;
  if (!timer) return 0;
  return Math.max(0, Math.ceil((timer.startedAt + timer.durationSeconds * 1000 - now) / 1000));
}

function isAutoTimeoutController(game: GameState, room: RoomSnapshot, playerId: string): boolean {
  const connectedPlayerIds = new Set(room.seats.filter((seat) => seat.connected).map((seat) => seat.playerId));
  const controller =
    game.seats.find((seat) => seat.alive && connectedPlayerIds.has(seat.playerId)) ??
    game.seats.find((seat) => seat.alive);
  return controller?.playerId === playerId;
}

function getTimerPercent(game: GameState, remainingSeconds: number): string {
  const duration = game.actionTimer?.durationSeconds ?? 1;
  return `${Math.max(0, Math.min(100, (remainingSeconds / duration) * 100))}%`;
}

function pickCharacterCandidates(characters: CharacterDefinition[], seed: string, count: number): CharacterDefinition[] {
  const pool = characters.length > 0 ? [...characters] : [...getRulesRuntime().BUILT_IN_CHARACTERS];
  const random = seededUiRandom(seed);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function seededUiRandom(seed: string): () => number {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function cardDescription(card: GameCard): string {
  const text: Record<GameCard["cardKey"], string> = {
    sha: "对一名目标使用，目标需要出闪，否则受到 1 点伤害。",
    fire_sha: "按杀使用；命中后造成火焰伤害，可触发横置连环。",
    thunder_sha: "按杀使用；命中后造成雷电伤害，可触发横置连环。",
    shan: "用于响应杀或万箭齐发。",
    tao: "回复 1 点体力，濒死时可救援。",
    jiu: "本回合下一张杀伤害 +1，濒死时也可自救。",
    wuzhong: "摸 2 张牌。",
    guohe: "选择目标手牌、装备区或判定区一张牌弃置。",
    shunshou: "距离 1 内，选择目标手牌、装备区或判定区一张牌获得。",
    juedou: "双方轮流出杀，先不出杀者受到 1 点伤害。",
    jiedao: "令装备武器的目标对另一名玩家出杀；若不出，交出武器。",
    nanman: "其他玩家依次需要出杀，否则受到伤害。",
    wanjian: "其他玩家依次需要出闪，否则受到伤害。",
    taoyuan: "所有存活玩家回复 1 点体力。",
    wugu: "翻开与存活人数相同的牌，玩家依次选择获得。",
    wuxie: "响应锦囊，取消其效果。",
    lebu: "进入目标判定区；判定未通过时跳过出牌阶段。",
    shandian: "进入自己的判定区；命中后造成 3 点雷电伤害，否则移动。",
    huogong: "目标展示一张手牌，你可弃同花色牌造成 1 点火焰伤害。",
    tiesuo: "选择 1-2 名角色横置或解除横置；也可重铸摸 1 张。",
    bingliang: "距离 1 内进入目标判定区；判定未通过时跳过摸牌阶段。",
    weapon: "装备到武器栏，提高杀的攻击范围。",
    armor: "装备到防具栏；当前版本保留防具栏位。",
    attack_horse: "装备到进攻马栏，计算距离时更容易接近目标。",
    defense_horse: "装备到防御马栏，计算距离时让别人更难接近你。",
  };
  const equipmentText: Partial<Record<EquipmentKey, string>> = {
    zhuge: "诸葛连弩：出牌阶段可连续使用杀，不受通常次数限制。",
    qinggang: "青釭剑：你使用的杀无视目标防具。",
    cixiong: "雌雄双股剑：作为标准+军争武器展示，后续可继续补充主动特效。",
    qinglong: "青龙偃月刀：作为标准+军争武器展示，后续可继续补充连杀特效。",
    zhangba: "丈八蛇矛：作为标准+军争武器展示，后续可继续补充弃牌化杀特效。",
    guanshi: "贯石斧：作为标准+军争武器展示，后续可继续补充强行命中特效。",
    fangtian: "方天画戟：作为标准+军争武器展示，后续可继续补充多目标特效。",
    qilin: "麒麟弓：作为标准+军争武器展示，后续可继续补充拆马特效。",
    hanbing: "寒冰剑：杀造成伤害时，可防止此伤害并弃置目标至多两张牌。",
    guding: "古锭刀：若目标没有手牌，你的杀伤害 +1。",
    zhuque: "朱雀羽扇：你使用的普通杀视为火杀。",
    bagua: "八卦阵：需要打出闪时可进行判定，红色视为打出闪。",
    renwang: "仁王盾：黑色杀对你无效。",
    tengjia: "藤甲：免疫普通杀、南蛮和万箭；受到火焰伤害 +1。",
    baiyin: "白银狮子：将多点伤害改为 1；失去时回复 1 点体力。",
    chitu: "赤兔：进攻马，计算距离时更容易接近目标。",
    dayuan: "大宛：进攻马，计算距离时更容易接近目标。",
    zixing: "紫骍：进攻马，计算距离时更容易接近目标。",
    dilu: "的卢：防御马，其他角色计算到你的距离 +1。",
    jueying: "绝影：防御马，其他角色计算到你的距离 +1。",
    zhuahuang: "爪黄飞电：防御马，其他角色计算到你的距离 +1。",
  };
  if (card.equipmentKey && equipmentText[card.equipmentKey]) return equipmentText[card.equipmentKey]!;
  return text[card.cardKey];
}

function voiceStatusText(snapshot: AgoraVoiceSnapshot): string {
  if (snapshot.status === "connected") return snapshot.microphoneOn ? "麦克风已开启" : "已连接，麦克风关闭";
  if (snapshot.status === "connecting") return "正在连接";
  if (snapshot.status === "reconnecting") return "正在重连";
  if (snapshot.status === "error") return "连接异常";
  return "未连接";
}

function gameActionHint(game: GameState, playerId: string): string {
  const current = game.seats[game.currentSeatIndex];
  const pending = game.pendingResponse;
  const pendingChoice = game.pendingChoice;
  if (game.phase === "finished") return "对局已结束。";
  if (pendingChoice) {
    const chooser = game.seats.find((seat) => seat.seatId === pendingChoice.chooserSeatId);
    return chooser?.playerId === playerId ? `轮到你选择：${pendingChoice.prompt}` : `等待 ${chooser?.playerName ?? "其他玩家"} 选择。`;
  }
  if (pending) {
    const responder = game.seats.find((seat) => seat.seatId === pending.responderSeatId);
    return responder?.playerId === playerId ? `轮到你响应：${pending.prompt}` : `等待 ${responder?.playerName ?? "其他玩家"} 响应。`;
  }
  if (current?.playerId !== playerId) return `等待 ${current?.playerName ?? "当前玩家"} 行动。`;
  if (game.phase === "opening") return "开局身份选择中。";
  if (game.phase === "prepare" || game.phase === "judge" || game.phase === "draw") return "阶段正在自动结算。";
  if (game.phase === "discard") return "请弃牌到体力上限以内，然后完成弃牌。";
  if (game.phase === "finish") return "结束阶段，确认后进入下一名玩家。";
  if (game.phase === "dying") return "正在处理濒死救援。";
  return "轮到你出牌，可连续出牌或结束回合。";
}

function phaseActionLabel(game: GameState): string {
  if (game.phase === "play") return "结束出牌";
  if (game.phase === "discard") return "完成弃牌";
  if (game.phase === "finish") return "结束回合";
  if (game.phase === "opening") return "开局选择";
  if (game.phase === "prepare" || game.phase === "judge" || game.phase === "draw") return "自动结算中";
  return "等待响应";
}

function dengSkillSummary(seat: GameState["seats"][number], gameMode: GameState["gameMode"]): string {
  const state = seat.skillState ?? {};
  const parts: string[] = [];
  if (gameMode !== "identity") parts.push("非身份局不生效");
  else if (!state.dengOpeningChoiceDone && seat.identityRole !== "lord") parts.push("等待开局选择");
  else if (seat.identityRole === "lord") parts.push("主公不可自爆");
  if (state.dengRebelBoost) parts.push("反贼强化");
  if (state.dengRenegadeLimitBoost) parts.push("上限+2");
  if (state.dengRenegadeReviveAvailable) parts.push("起死回生可用");
  if (state.dengHiddenHorse) parts.push("虚拟+1马");
  parts.push(`转杀 ${Number(state.dengTransferCharges ?? 0)}`);
  const progress = Number(state.dengTransferProgress ?? 0);
  if (progress > 0) parts.push(`进度 ${progress}`);
  return `三五：${parts.join(" · ")}`;
}

function isShaCard(card: GameCard): boolean {
  return card.cardKey === "sha" || card.cardKey === "fire_sha" || card.cardKey === "thunder_sha";
}

function choiceAreaText(area: string, slot?: string): string {
  if (area === "hand") return "手牌";
  if (area === "judge") return "判定区";
  if (area === "public") return "公共牌";
  if (area === "equipment") return `装备区 · ${slot ? equipmentSlotText(slot) : ""}`;
  return area;
}

function suitLabel(suit: GameCard["suit"]): string {
  return { spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方块" }[suit];
}

function equipmentSlotText(slot: string): string {
  return {
    weapon: "武器",
    armor: "防具",
    attackHorse: "进攻马",
    defenseHorse: "防御马",
  }[slot] ?? slot;
}

function shortPlateName(name: string): string {
  const afterDot = name.includes("·") ? name.split("·").at(-1) || name : name;
  const compact = afterDot.replace(/\s+/g, "");
  if (compact.length <= 4) return compact;
  return compact.slice(-4);
}

function compactSlotName(name: string): string {
  const compact = name.replace(/\s+/g, "");
  return compact.length <= 4 ? compact : compact.slice(0, 4);
}

function identityRoleText(role: string): string {
  return {
    lord: "主公",
    loyalist: "忠臣",
    rebel: "反贼",
    renegade: "内奸",
  }[role] ?? role;
}

function genderText(gender?: CharacterDefinition["gender"]): string {
  return gender === "female" ? "女" : gender === "male" ? "男" : "未知";
}

function validatePasswordLoginInput(email: string, password: string): void {
  if (!validateEmail(email)) throw new Error("邮箱格式错误。");
  if (!password) throw new Error("请输入密码。");
}

function validateCodeLoginInput(email: string, verificationCode: string): void {
  if (!validateEmail(email)) throw new Error("邮箱格式错误。");
  if (!verificationCode.trim()) throw new Error("请输入邮箱验证码。");
}

function validateRegisterInput(email: string, password: string, confirmPassword: string): void {
  if (!validateEmail(email)) throw new Error("邮箱格式错误。");
  if (password.length < 6) throw new Error("密码长度小于 6 位。");
  if (password !== confirmPassword) throw new Error("两次密码不一致。");
}

function summarizeNotice(message: string): string {
  if (!message) return "";
  if (/ws does not work in the browser|Browser clients must use the native WebSocket object/i.test(message)) {
    return "Photon WebSocket 初始化失败，请重连。";
  }
  if (/WebSocket is not available/i.test(message)) {
    return "Photon WebSocket 不可用，请重启后重试。";
  }
  if (message.length > 42) return `${message.slice(0, 42)}...`;
  return message;
}

function getRecentRoomCode(): string {
  const raw = localStorage.getItem(LAST_ROOM_KEY);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { roomCode?: string; savedAt?: number };
    if (!parsed.roomCode) return "";
    if (parsed.savedAt && Date.now() - parsed.savedAt > 30_000) return "";
    return parsed.roomCode;
  } catch {
    return "";
  }
}

function loadGameSettings(): GameSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const shouldMigrateDragDefault =
        localStorage.getItem(`${SETTINGS_KEY}:drag-default-1.5.3-fix4`) !== "1" &&
        parsed.enableDragPlay === false &&
        parsed.enableHandSort !== true;
    const next = normalizeGameSettings({
      ...DEFAULT_SETTINGS,
      ...parsed,
      enableDragPlay: shouldMigrateDragDefault ? true : parsed.enableDragPlay ?? DEFAULT_SETTINGS.enableDragPlay,
    });
    if (shouldMigrateDragDefault) {
      localStorage.setItem(`${SETTINGS_KEY}:drag-default-1.5.3-fix4`, "1");
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveGameSettings(settings: GameSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function normalizeGameSettings(settings: GameSettings): GameSettings {
  const defaultMaxPlayers = Math.min(8, Math.max(2, Math.round(Number(settings.defaultMaxPlayers) || DEFAULT_SETTINGS.defaultMaxPlayers)));
  const roomPrefix = String(settings.roomPrefix || DEFAULT_SETTINGS.roomPrefix).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10) || DEFAULT_SETTINGS.roomPrefix;
  const legacyHandScale = Number(settings.handCardScale ?? settings.handScale);
  const handCardScale = Math.min(1.25, Math.max(0.82, Number.isFinite(legacyHandScale) ? legacyHandScale : DEFAULT_SETTINGS.handCardScale));
  const effectIntensity = ["off", "low", "normal", "high"].includes(String(settings.effectIntensity))
    ? settings.effectIntensity
    : DEFAULT_SETTINGS.effectIntensity;
  const battleVfxStyle = normalizeBattleVfxStyle(settings.battleVfxStyle);
  const { cursorTheme, cursorSize, cursorTrail } = normalizeCursorSettings(settings);
  const refreshCountRaw = Number(settings.characterRefreshCount);
  const characterRefreshCount = Number.isFinite(refreshCountRaw)
    ? Math.min(5, Math.max(0, Math.round(refreshCountRaw)))
    : DEFAULT_SETTINGS.characterRefreshCount;
  const tableBackgroundId = TABLE_BACKGROUNDS.some((background) => background.id === settings.tableBackgroundId)
    ? settings.tableBackgroundId
    : DEFAULT_SETTINGS.tableBackgroundId;
  return {
    defaultMaxPlayers,
    roomPrefix,
    tableBackgroundId,
    compactUi: Boolean(settings.compactUi),
    tableCompact: Boolean(settings.tableCompact),
    battleHudCompact: settings.battleHudCompact !== false,
    compactHandZone: settings.compactHandZone !== false,
    transparentHandZone: settings.transparentHandZone !== false,
    eventLogCollapsed: settings.eventLogCollapsed !== false,
    compactLobbyTools: settings.compactLobbyTools !== false,
    showLobbyVideo: settings.showLobbyVideo !== false,
    handScale: handCardScale,
    handCardScale,
    effectIntensity,
    battleVfxStyle,
    reduceMotion: Boolean(settings.reduceMotion),
    customCursorEnabled: settings.customCursorEnabled !== false,
    cursorTheme,
    cursorSize,
    cursorTrail,
    clickEffectsEnabled: settings.clickEffectsEnabled !== false,
    highContrastText: Boolean(settings.highContrastText),
    enableDragPlay: Boolean(settings.enableDragPlay),
    enableHandSort: Boolean(settings.enableHandSort),
    autoRefreshLobby: settings.autoRefreshLobby !== false,
    showRuleTips: settings.showRuleTips !== false,
    showFullErrors: Boolean(settings.showFullErrors),
    turnTimerSeconds: normalizeUiTimer(settings.turnTimerSeconds, DEFAULT_SETTINGS.turnTimerSeconds),
    responseTimerSeconds: normalizeUiTimer(settings.responseTimerSeconds, DEFAULT_SETTINGS.responseTimerSeconds),
    characterRefreshCount,
    masterVolume: normalizeVolume(settings.masterVolume, DEFAULT_SETTINGS.masterVolume),
    bgmVolume: normalizeVolume(settings.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
    sfxVolume: normalizeVolume(settings.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    voiceVolume: normalizeVolume(settings.voiceVolume, DEFAULT_SETTINGS.voiceVolume),
    rtcVoiceVolume: normalizeVolume(settings.rtcVoiceVolume, DEFAULT_SETTINGS.rtcVoiceVolume),
    announcerVolume: normalizeVolume(settings.announcerVolume, DEFAULT_SETTINGS.announcerVolume),
    muted: Boolean(settings.muted),
    currentBgmId: getBgmTracks().some((track) => track.id === settings.currentBgmId) ? settings.currentBgmId : DEFAULT_SETTINGS.currentBgmId,
    loopMode: settings.loopMode === "one" ? "one" : "all",
    autoResume: Boolean(settings.autoResume),
    keyBindings: normalizeKeyBindings(settings.keyBindings),
  };
}

function normalizeUiTimer(value: unknown, fallback: number): number {
  const allowed = [15, 30, 60, 90];
  const numeric = Math.round(Number(value) || fallback);
  return allowed.includes(numeric) ? numeric : fallback;
}

function normalizeVolume(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function createLocalRoomCode(prefix: string): string {
  const cleanPrefix = sanitizeRoomCode(prefix).slice(0, 10) || DEFAULT_SETTINGS.roomPrefix;
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${cleanPrefix}-${suffix}`;
}

function sanitizeRoomCode(value: string): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}

function describeWerewolfPreset(playerCount: number): string {
  const runtime = getRulesRuntime();
  const preset = runtime.WEREWOLF_PRESETS.find(
    (item) => item.playerCount === Math.max(5, Math.min(8, playerCount))
  );
  if (!preset) return "5-8 人标准网杀板型";
  const names = new Map(
    runtime.WEREWOLF_ROLE_DEFINITIONS.map((role) => [role.id, role.name])
  );
  const counts = new Map<WerewolfRole, number>();
  for (const role of preset.roles) {
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([role, count]) => `${count} ${names.get(role) ?? role}`)
    .join("、");
}

function clampPlayerLimit(value: number): number {
  return Math.min(8, Math.max(2, Math.round(Number(value) || DEFAULT_SETTINGS.defaultMaxPlayers)));
}

function isEditableElement(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return (
    element.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(element.closest(".game-chat-dock"))
  );
}

const NETWORK_DIAGNOSTIC_KEY = "maoyi.networkDiagnostics";
const NETWORK_METRICS_KEY = "maoyi.networkMetrics";
const NETWORK_DIAGNOSTIC_LIMIT = 80;

type NetworkMetrics = {
  disconnectCount: number;
  reconnectAttemptCount: number;
  reconnectSuccessCount: number;
  reconnectFailureCount: number;
  reconnectCancelCount: number;
  totalReconnectMs: number;
  lastReconnectStartedAt?: number;
  lastReconnectMs?: number;
  lastErrorCode?: number;
  lastRoomCode?: string;
  updatedAt: number;
};

function appendNetworkDiagnostic(entry: NetworkDiagnostic) {
  const sanitized: NetworkDiagnostic = {
    timestamp: entry.timestamp,
    event: entry.event.slice(0, 64),
    state: entry.state,
    attempt: entry.attempt,
    roomCode: entry.roomCode?.slice(0, 32),
    errorCode: entry.errorCode,
    operationCode: entry.operationCode,
    detail: entry.detail?.slice(0, 240),
  };
  try {
    const current = JSON.parse(localStorage.getItem(NETWORK_DIAGNOSTIC_KEY) ?? "[]") as NetworkDiagnostic[];
    localStorage.setItem(
      NETWORK_DIAGNOSTIC_KEY,
      JSON.stringify([...current.filter((item) => item && typeof item.timestamp === "number"), sanitized].slice(-NETWORK_DIAGNOSTIC_LIMIT))
    );
  } catch {
    localStorage.setItem(NETWORK_DIAGNOSTIC_KEY, JSON.stringify([sanitized]));
  }
  updateNetworkMetrics(sanitized);
  const desktop = getDesktopBridge();
  desktop?.reportNetworkDiagnostic?.(sanitized);
}

function networkDiagnosticText(): string {
  try {
    const metrics = loadNetworkMetrics();
    const entries = JSON.parse(localStorage.getItem(NETWORK_DIAGNOSTIC_KEY) ?? "[]") as NetworkDiagnostic[];
    const lines = entries
      .slice(-NETWORK_DIAGNOSTIC_LIMIT)
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    return [`# network-metrics ${JSON.stringify(metrics)}`, lines].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

function loadNetworkMetrics(): NetworkMetrics {
  const fallback: NetworkMetrics = {
    disconnectCount: 0,
    reconnectAttemptCount: 0,
    reconnectSuccessCount: 0,
    reconnectFailureCount: 0,
    reconnectCancelCount: 0,
    totalReconnectMs: 0,
    updatedAt: Date.now(),
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(NETWORK_METRICS_KEY) ?? "null") as Partial<NetworkMetrics> | null;
    if (!parsed) return fallback;
    return {
      ...fallback,
      ...parsed,
      disconnectCount: Math.max(0, Number(parsed.disconnectCount) || 0),
      reconnectAttemptCount: Math.max(0, Number(parsed.reconnectAttemptCount) || 0),
      reconnectSuccessCount: Math.max(0, Number(parsed.reconnectSuccessCount) || 0),
      reconnectFailureCount: Math.max(0, Number(parsed.reconnectFailureCount) || 0),
      reconnectCancelCount: Math.max(0, Number(parsed.reconnectCancelCount) || 0),
      totalReconnectMs: Math.max(0, Number(parsed.totalReconnectMs) || 0),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return fallback;
  }
}

function updateNetworkMetrics(entry: NetworkDiagnostic): void {
  const next = loadNetworkMetrics();
  const now = entry.timestamp || Date.now();
  next.updatedAt = now;
  next.lastRoomCode = entry.roomCode ?? next.lastRoomCode;
  if (typeof entry.errorCode === "number") next.lastErrorCode = entry.errorCode;
  if (entry.event === "reconnect-start") {
    next.disconnectCount += 1;
    next.lastReconnectStartedAt = now;
  }
  if (entry.event === "room-join-attempt" || entry.event === "direct-rejoin-start") {
    next.reconnectAttemptCount += 1;
  }
  if (entry.event === "reconnect-complete") {
    next.reconnectSuccessCount += 1;
    if (next.lastReconnectStartedAt) {
      next.lastReconnectMs = Math.max(0, now - next.lastReconnectStartedAt);
      next.totalReconnectMs += next.lastReconnectMs;
    }
    next.lastReconnectStartedAt = undefined;
  }
  if (entry.event === "room-join-failure") next.reconnectFailureCount += 1;
  if (entry.event === "reconnect-cancelled") next.reconnectCancelCount += 1;
  localStorage.setItem(NETWORK_METRICS_KEY, JSON.stringify(next));
}

function formatNetworkMetrics(metrics: NetworkMetrics): string {
  const avg = metrics.reconnectSuccessCount > 0
    ? Math.round(metrics.totalReconnectMs / metrics.reconnectSuccessCount)
    : 0;
  const successRate = metrics.reconnectAttemptCount > 0
    ? Math.round((metrics.reconnectSuccessCount / metrics.reconnectAttemptCount) * 100)
    : 0;
  return `断联 ${metrics.disconnectCount} 次 · 尝试 ${metrics.reconnectAttemptCount} 次 · 成功 ${metrics.reconnectSuccessCount} 次 · 成功率 ${successRate}% · 平均 ${avg}ms`;
}

async function copyText(text: string, successMessage: string, setNotice: (message: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setNotice(successMessage);
  } catch {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    setNotice(successMessage);
  }
}

function formatSendTime(value: CardMessageRecord["sendTime"]): string {
  if (!value) return "未知时间";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString();
}

