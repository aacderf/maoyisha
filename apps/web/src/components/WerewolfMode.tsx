import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Crown,
  Eye,
  EyeOff,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Shield,
  Skull,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  PlayerIdentity,
  RoomSnapshot,
  WerewolfAction,
  WerewolfPrivateState,
  WerewolfPublicPlayer,
  WerewolfPublicState,
  WerewolfRole,
} from "@cardgame/shared";
import type {
  PhotonChatMessage,
  PhotonWerewolfWolfMessage,
} from "../lib/photonGame.js";
import { AgoraVoiceManager, type AgoraVoiceSnapshot } from "../lib/agoraVoice.js";
import type { GameSettings } from "../config/uiConfig.js";
import { persistentStorage } from "../lib/persistentStorage.js";

const localStorage = persistentStorage;

type VoiceScope = "public" | "wolves";

export function WerewolfGameTable({
  room,
  state,
  privateState,
  identity,
  settings,
  publicMessages,
  wolfMessages,
  actionBusy,
  canSubmitTimeout,
  onAction,
  onSendPublicMessage,
  onSendWolfMessage,
  onChangeSettings,
  onReconnect,
  onLeaveRoom,
}: {
  room: RoomSnapshot;
  state: WerewolfPublicState;
  privateState?: WerewolfPrivateState;
  identity: PlayerIdentity;
  settings: GameSettings;
  publicMessages: PhotonChatMessage[];
  wolfMessages: PhotonWerewolfWolfMessage[];
  actionBusy?: boolean;
  canSubmitTimeout: () => boolean;
  onAction: (action: WerewolfAction) => void;
  onSendPublicMessage: (text: string) => void;
  onSendWolfMessage: (text: string) => void;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
  onReconnect: () => void;
  onLeaveRoom: () => void;
}) {
  const me = state.players.find((player) => player.playerId === identity.id);
  const [selectedSeatId, setSelectedSeatId] = useState("");
  const [roleVisible, setRoleVisible] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatMode, setChatMode] = useState<"public" | "wolves">("public");
  const [chatOpen, setChatOpen] = useState(
    () => localStorage.getItem("maoyi.werewolf.chat.open") === "1"
  );
  const [chatToast, setChatToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [autoTimeoutScope, setAutoTimeoutScope] = useState("");
  const [voice, setVoice] = useState<AgoraVoiceSnapshot>({
    status: "idle",
    microphoneOn: false,
    remoteUserCount: 0,
  });
  const voiceManagerRef = useRef<AgoraVoiceManager | undefined>(undefined);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatToastTimerRef = useRef<number | undefined>(undefined);
  const currentSpeakerSeatId = state.speechOrder[state.currentSpeakerIndex];
  const remainingSeconds = Math.max(
    0,
    Math.ceil(
      (state.timer.startedAt + state.timer.durationSeconds * 1000 - now) / 1000
    )
  );
  const voiceScope = getVoiceScope(state, privateState);
  const microphoneAllowed = canUseMicrophone(
    state,
    privateState,
    me,
    currentSpeakerSeatId
  );
  const showWolfChat =
    privateState?.role === "werewolf" &&
    Boolean(me?.alive) &&
    state.phase === "night-wolves";
  const canPublicChat =
    !isNightPhase(state.phase) &&
    (Boolean(me?.alive) ||
      (state.phase === "last-words" && currentSpeakerSeatId === me?.seatId));
  const validTargets = useMemo(
    () => actionTargets(state, privateState, me),
    [me, privateState, state]
  );
  const selectedTarget = validTargets.find(
    (player) => player.seatId === selectedSeatId
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedSeatId("");
  }, [state.day, state.phase]);

  useEffect(() => {
    if (
      remainingSeconds > 0 ||
      autoTimeoutScope === state.timer.scopeId ||
      !canSubmitTimeout()
    ) {
      return;
    }
    setAutoTimeoutScope(state.timer.scopeId);
    onAction({ type: "AUTO_TIMEOUT", scopeId: state.timer.scopeId });
  }, [
    autoTimeoutScope,
    canSubmitTimeout,
    now,
    onAction,
    remainingSeconds,
    state.timer.scopeId,
  ]);

  useEffect(() => {
    const manager = new AgoraVoiceManager();
    voiceManagerRef.current = manager;
    manager.setRemoteVolume(settings.rtcVoiceVolume);
    const unsubscribe = manager.subscribe(setVoice);
    return () => {
      unsubscribe();
      manager.dispose();
      if (voiceManagerRef.current === manager) {
        voiceManagerRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const manager = voiceManagerRef.current;
    if (!manager) return;
    if (!voiceScope) {
      void manager.leave();
      return;
    }
    void manager.join(room.id, voiceScope).catch(() => undefined);
  }, [room.id, voiceScope]);

  useEffect(() => {
    voiceManagerRef.current?.setRemoteVolume(settings.rtcVoiceVolume);
  }, [settings.rtcVoiceVolume]);

  useEffect(() => {
    if (!microphoneAllowed && voice.microphoneOn) {
      void voiceManagerRef.current?.toggleMicrophone();
    }
  }, [microphoneAllowed, voice.microphoneOn]);

  useEffect(() => {
    if (!showWolfChat && chatMode === "wolves") setChatMode("public");
  }, [chatMode, showWolfChat]);

  useEffect(() => {
    localStorage.setItem("maoyi.werewolf.chat.open", chatOpen ? "1" : "0");
    if (chatOpen) setChatToast("");
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen || !chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [chatMode, chatOpen, publicMessages, wolfMessages]);

  useEffect(() => {
    const latestPublic = publicMessages.at(-1);
    const latestWolf = showWolfChat ? wolfMessages.at(-1) : undefined;
    const latest =
      latestWolf && (!latestPublic || latestWolf.sentAt > latestPublic.sentAt)
        ? latestWolf
        : latestPublic;
    if (!latest || chatOpen) return;
    setChatToast(`${latest.playerName}：${latest.text}`);
    if (chatToastTimerRef.current !== undefined) {
      window.clearTimeout(chatToastTimerRef.current);
    }
    chatToastTimerRef.current = window.setTimeout(() => {
      setChatToast("");
      chatToastTimerRef.current = undefined;
    }, 4_000);
    return () => {
      if (chatToastTimerRef.current !== undefined) {
        window.clearTimeout(chatToastTimerRef.current);
        chatToastTimerRef.current = undefined;
      }
    };
  }, [chatOpen, publicMessages, showWolfChat, wolfMessages]);

  function submitTargetAction() {
    if (!me || !selectedTarget) return;
    const targetSeatId = selectedTarget.seatId;
    if (state.phase === "night-wolves") {
      onAction({ type: "WOLF_VOTE", playerId: me.playerId, targetSeatId });
    } else if (state.phase === "night-seer") {
      onAction({ type: "SEER_CHECK", playerId: me.playerId, targetSeatId });
    } else if (
      state.phase === "sheriff-vote" ||
      state.phase === "sheriff-runoff-vote"
    ) {
      onAction({ type: "SHERIFF_VOTE", playerId: me.playerId, targetSeatId });
    } else if (
      state.phase === "exile-vote" ||
      state.phase === "exile-runoff-vote"
    ) {
      onAction({ type: "EXILE_VOTE", playerId: me.playerId, targetSeatId });
    } else if (state.phase === "hunter-shot") {
      onAction({ type: "HUNTER_SHOOT", playerId: me.playerId, targetSeatId });
    } else if (state.phase === "badge-transfer") {
      onAction({ type: "TRANSFER_BADGE", playerId: me.playerId, targetSeatId });
    }
  }

  function sendMessage() {
    const text = chatText.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!text) return;
    if (chatMode === "wolves") onSendWolfMessage(text);
    else onSendPublicMessage(text);
    setChatText("");
  }

  return (
    <section
      className={`werewolf-game phase-${state.phase} ${chatOpen ? "chat-open" : ""}`}
    >
      <header className="werewolf-hud">
        <div>
          <strong>狼人杀 · 第 {state.day} 天</strong>
          <span>{phaseLabel(state.phase)}</span>
        </div>
        <div className="werewolf-timer" aria-label={`剩余 ${remainingSeconds} 秒`}>
          <b>{remainingSeconds}</b>
          <span>秒</span>
        </div>
        <div className="werewolf-hud-actions">
          <button
            type="button"
            className={voice.microphoneOn ? "active" : ""}
            disabled={!microphoneAllowed || !voiceScope}
            onClick={() => void voiceManagerRef.current?.toggleMicrophone()}
            title={microphoneAllowed ? "切换麦克风" : "当前不能发言"}
          >
            {voice.microphoneOn ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          <span
            className={`werewolf-voice-status ${voice.status}`}
            title={voice.error || voiceStatusLabel(voice)}
          >
            {voiceStatusLabel(voice)}
          </span>
          {voice.autoplayBlocked && (
            <button
              type="button"
              onClick={() => void voiceManagerRef.current?.resumePlayback()}
              title="恢复语音播放"
            >
              <Volume2 size={16} />
            </button>
          )}
          <label className="werewolf-volume" title="语音音量">
            {settings.rtcVoiceVolume > 0 ? (
              <Volume2 size={15} />
            ) : (
              <VolumeX size={15} />
            )}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.rtcVoiceVolume}
              onChange={(event) =>
                onChangeSettings({
                  rtcVoiceVolume: Number(event.target.value),
                })
              }
            />
          </label>
          <button type="button" onClick={onReconnect} title="重新连接">
            <RefreshCw size={16} />
          </button>
          <button type="button" onClick={onLeaveRoom} title="退出房间">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div
        className={`werewolf-night-mask ${
          isNightPhase(state.phase) ? "visible" : ""
        }`}
      />

      <div className="werewolf-table">
        <div className="werewolf-seat-ring">
          {state.players.map((player, index) => {
            const point = seatPosition(index, state.players.length);
            const selectable = validTargets.some(
              (target) => target.seatId === player.seatId
            );
            return (
              <button
                type="button"
                key={player.seatId}
                className={[
                  "werewolf-seat",
                  player.alive ? "alive" : "dead",
                  selectable ? "selectable" : "",
                  selectedSeatId === player.seatId ? "selected" : "",
                  currentSpeakerSeatId === player.seatId ? "speaking" : "",
                  player.isSheriff ? "sheriff" : "",
                  player.connected ? "" : "disconnected",
                ].join(" ")}
                style={
                  {
                    "--ww-seat-x": `${point.x}%`,
                    "--ww-seat-y": `${point.y}%`,
                  } as CSSProperties
                }
                disabled={!selectable || actionBusy}
                onClick={() => setSelectedSeatId(player.seatId)}
              >
                <span className="werewolf-avatar">
                  {player.alive ? (
                    player.playerName.slice(0, 1)
                  ) : (
                    <Skull size={26} />
                  )}
                </span>
                <strong>{player.playerName}</strong>
                <small>
                  {player.isSheriff
                    ? "警长"
                    : player.sheriffCandidate
                      ? "上警"
                      : player.connected
                        ? "在线"
                        : "掉线"}
                </small>
                {player.revealedRole && (
                  <em>{roleLabel(player.revealedRole)}</em>
                )}
              </button>
            );
          })}
        </div>

        <main className="werewolf-center">
          <div className="werewolf-phase-card">
            <p className="eyebrow">
              {isNightPhase(state.phase) ? "夜间行动" : "白天议事"}
            </p>
            <h2>{phaseLabel(state.phase)}</h2>
            <p>{phasePrompt(state, privateState, me, currentSpeakerSeatId)}</p>
          </div>
          <WerewolfActionPanel
            state={state}
            privateState={privateState}
            me={me}
            selectedTarget={selectedTarget}
            actionBusy={actionBusy}
            onAction={onAction}
            onSubmitTarget={submitTargetAction}
          />
        </main>

        <aside className="werewolf-role-dock">
          <button
            type="button"
            className="werewolf-role-peek"
            onPointerDown={() => setRoleVisible(true)}
            onPointerUp={() => setRoleVisible(false)}
            onPointerLeave={() => setRoleVisible(false)}
            onPointerCancel={() => setRoleVisible(false)}
          >
            {roleVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            {roleVisible && privateState
              ? roleLabel(privateState.role)
              : "按住查看身份"}
          </button>
          {privateState?.role === "werewolf" && (
            <>
              <small>
                狼队：
                {privateState.wolfTeammateSeatIds
                  .map(
                    (seatId) =>
                      state.players.find((player) => player.seatId === seatId)
                        ?.playerName
                  )
                  .filter(Boolean)
                  .join("、") || "仅你一人"}
              </small>
              {state.phase === "night-wolves" &&
                Object.keys(privateState.wolfVoteSummary).length > 0 && (
                  <small>
                    刀人票：
                    {Object.entries(privateState.wolfVoteSummary)
                      .map(
                        ([seatId, count]) =>
                          `${playerLabel(state, seatId)} ${count} 票`
                      )
                      .join("、")}
                  </small>
                )}
            </>
          )}
          {privateState?.role === "seer" &&
            privateState.seerChecks.length > 0 && (
              <small>
                查验：
                {privateState.seerChecks
                  .map(
                    (check) =>
                      `${playerLabel(state, check.targetSeatId)} ${
                        check.alignment === "werewolf" ? "狼人" : "好人"
                      }`
                  )
                  .join("；")}
              </small>
            )}
        </aside>

        <aside className="werewolf-log">
          {state.logs.slice(-3).map((log, index) => (
            <p key={`${index}-${log}`}>{log}</p>
          ))}
        </aside>
      </div>

      <div className="werewolf-timeline" aria-label="狼人杀阶段时间轴">
        {[
          ["night", "夜晚"],
          ["sheriff", "警长"],
          ["speech", "发言"],
          ["vote", "放逐"],
        ].map(([stage, label]) => (
          <span
            key={stage}
            className={timelineStage(state.phase) === stage ? "active" : ""}
          >
            {label}
          </span>
        ))}
      </div>

      {chatToast && !chatOpen && <div className="werewolf-chat-toast">{chatToast}</div>}
      <button
        type="button"
        className={`werewolf-chat-toggle ${chatOpen ? "active" : ""}`}
        aria-expanded={chatOpen}
        onClick={() => setChatOpen((open) => !open)}
      >
        <MessageCircle size={16} />
        聊天
      </button>
      {chatOpen && (
        <aside className="werewolf-chat">
          <div className="werewolf-chat-tabs">
            <button
              type="button"
              className={chatMode === "public" ? "active" : ""}
              onClick={() => setChatMode("public")}
            >
              公共
            </button>
            {showWolfChat && (
              <button
                type="button"
                className={chatMode === "wolves" ? "active" : ""}
                onClick={() => setChatMode("wolves")}
              >
                狼队
              </button>
            )}
          </div>
          <div className="werewolf-chat-list" ref={chatListRef}>
            {(chatMode === "wolves" ? wolfMessages : publicMessages)
              .slice(-20)
              .map((message) => (
                <p key={message.id}>
                  <b>{message.playerName}</b> {message.text}
                </p>
              ))}
          </div>
          <div className="werewolf-chat-input">
            <input
              value={chatText}
              disabled={chatMode === "public" ? !canPublicChat : !showWolfChat}
              maxLength={120}
              placeholder={
                chatMode === "wolves"
                  ? "狼队私聊"
                  : canPublicChat
                    ? "发送房间消息"
                    : "出局后不能继续发言"
              }
              onChange={(event) => setChatText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              type="button"
              disabled={!chatText.trim()}
              onClick={sendMessage}
            >
              <Send size={15} />
            </button>
          </div>
        </aside>
      )}

      {state.phase === "role-reveal" && (
        <div className="werewolf-role-overlay">
          <div
            className={`werewolf-role-card ${roleVisible ? "revealed" : ""}`}
            onPointerDown={() => setRoleVisible(true)}
            onPointerUp={() => setRoleVisible(false)}
            onPointerLeave={() => setRoleVisible(false)}
            onPointerCancel={() => setRoleVisible(false)}
          >
            {roleVisible && privateState ? (
              <>
                <span>{roleSymbol(privateState.role)}</span>
                <h2>{roleLabel(privateState.role)}</h2>
                <p>{roleDescription(privateState.role)}</p>
              </>
            ) : (
              <>
                <Shield size={46} />
                <h2>按住查看身份</h2>
                <p>松开后自动隐藏，避免旁人看到。</p>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={
              !me || !privateState || privateState.actionSubmitted || actionBusy
            }
            onClick={() =>
              me &&
              onAction({ type: "CONFIRM_ROLE", playerId: me.playerId })
            }
          >
            {privateState?.actionSubmitted ? "等待其他玩家" : "确认身份"}
          </button>
        </div>
      )}
    </section>
  );
}

function WerewolfActionPanel({
  state,
  privateState,
  me,
  selectedTarget,
  actionBusy,
  onAction,
  onSubmitTarget,
}: {
  state: WerewolfPublicState;
  privateState?: WerewolfPrivateState;
  me?: WerewolfPublicPlayer;
  selectedTarget?: WerewolfPublicPlayer;
  actionBusy?: boolean;
  onAction: (action: WerewolfAction) => void;
  onSubmitTarget: () => void;
}) {
  if (!me || state.phase === "role-reveal" || state.phase === "finished") {
    return null;
  }
  const speaking = state.speechOrder[state.currentSpeakerIndex] === me.seatId;
  const disabled = Boolean(actionBusy || privateState?.actionSubmitted);

  if (state.phase === "sheriff-signup" && me.alive) {
    return (
      <div className="werewolf-action-panel">
        <button
          disabled={disabled}
          onClick={() =>
            onAction({
              type: "SHERIFF_SIGNUP",
              playerId: me.playerId,
              join: true,
            })
          }
        >
          <Crown size={16} /> 上警
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction({
              type: "SHERIFF_SIGNUP",
              playerId: me.playerId,
              join: false,
            })
          }
        >
          不上警
        </button>
      </div>
    );
  }

  if (speaking) {
    return (
      <div className="werewolf-action-panel">
        <button
          disabled={disabled}
          onClick={() =>
            onAction({ type: "COMPLETE_SPEECH", playerId: me.playerId })
          }
        >
          结束发言
        </button>
      </div>
    );
  }

  if (state.phase === "sheriff-direction" && state.sheriffSeatId === me.seatId) {
    return (
      <div className="werewolf-action-panel">
        <button
          disabled={disabled}
          onClick={() =>
            onAction({
              type: "CHOOSE_SPEECH_DIRECTION",
              playerId: me.playerId,
              direction: "clockwise",
            })
          }
        >
          顺时针发言
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction({
              type: "CHOOSE_SPEECH_DIRECTION",
              playerId: me.playerId,
              direction: "counterclockwise",
            })
          }
        >
          逆时针发言
        </button>
      </div>
    );
  }

  if (state.phase === "night-witch" && privateState?.role === "witch" && me.alive) {
    return (
      <div className="werewolf-action-panel">
        <button
          disabled={
            disabled ||
            !privateState.witchAntidoteAvailable ||
            !privateState.nightVictimSeatId
          }
          onClick={() =>
            onAction({
              type: "WITCH_ACTION",
              playerId: me.playerId,
              action: "save",
            })
          }
        >
          使用解药
        </button>
        <button
          disabled={
            disabled ||
            !privateState.witchPoisonAvailable ||
            !selectedTarget
          }
          onClick={() =>
            onAction({
              type: "WITCH_ACTION",
              playerId: me.playerId,
              action: "poison",
              targetSeatId: selectedTarget?.seatId,
            })
          }
        >
          毒杀{selectedTarget ? ` ${selectedTarget.playerName}` : ""}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction({
              type: "WITCH_ACTION",
              playerId: me.playerId,
              action: "pass",
            })
          }
        >
          不用药
        </button>
      </div>
    );
  }

  if (
    (state.phase === "night-seer" && privateState?.role === "seer") ||
    (state.phase === "night-wolves" && privateState?.role === "werewolf")
  ) {
    return (
      <div className="werewolf-action-panel">
        <button disabled={disabled || !selectedTarget} onClick={onSubmitTarget}>
          {state.phase === "night-seer" ? "查验" : "选择袭击"}
          {selectedTarget ? ` ${selectedTarget.playerName}` : ""}
        </button>
      </div>
    );
  }

  if (
    state.phase === "sheriff-vote" ||
    state.phase === "sheriff-runoff-vote" ||
    state.phase === "exile-vote" ||
    state.phase === "exile-runoff-vote"
  ) {
    const sheriffVote = state.phase.startsWith("sheriff");
    return (
      <div className="werewolf-action-panel">
        <button disabled={disabled || !selectedTarget} onClick={onSubmitTarget}>
          投票{selectedTarget ? ` ${selectedTarget.playerName}` : ""}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction(
              sheriffVote
                ? { type: "SHERIFF_VOTE", playerId: me.playerId }
                : { type: "EXILE_VOTE", playerId: me.playerId }
            )
          }
        >
          弃票
        </button>
      </div>
    );
  }

  if (state.phase === "hunter-shot" && privateState?.role === "hunter") {
    return (
      <div className="werewolf-action-panel">
        <button disabled={disabled || !selectedTarget} onClick={onSubmitTarget}>
          开枪{selectedTarget ? ` ${selectedTarget.playerName}` : ""}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction({ type: "HUNTER_SHOOT", playerId: me.playerId })
          }
        >
          不开枪
        </button>
      </div>
    );
  }

  if (state.phase === "badge-transfer" && state.sheriffSeatId === me.seatId) {
    return (
      <div className="werewolf-action-panel">
        <button disabled={disabled || !selectedTarget} onClick={onSubmitTarget}>
          移交警徽{selectedTarget ? ` ${selectedTarget.playerName}` : ""}
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            onAction({ type: "TRANSFER_BADGE", playerId: me.playerId })
          }
        >
          撕毁警徽
        </button>
      </div>
    );
  }
  return null;
}

function actionTargets(
  state: WerewolfPublicState,
  privateState: WerewolfPrivateState | undefined,
  me: WerewolfPublicPlayer | undefined
) {
  if (!me) return [];
  const alive = state.players.filter((player) => player.alive);
  const others = alive.filter((player) => player.seatId !== me.seatId);
  if (state.phase === "night-wolves" && privateState?.role === "werewolf") {
    const wolves = new Set([
      privateState.seatId,
      ...privateState.wolfTeammateSeatIds,
    ]);
    return others.filter((player) => !wolves.has(player.seatId));
  }
  if (state.phase === "night-seer" && privateState?.role === "seer") {
    return others;
  }
  if (state.phase === "night-witch" && privateState?.role === "witch") {
    return others;
  }
  if (
    state.phase === "sheriff-vote" ||
    state.phase === "sheriff-runoff-vote"
  ) {
    if (me.sheriffCandidate) return [];
    const candidates = new Set(
      state.runoffCandidates.length
        ? state.runoffCandidates
        : state.players
            .filter((player) => player.sheriffCandidate)
            .map((player) => player.seatId)
    );
    return alive.filter((player) => candidates.has(player.seatId));
  }
  if (state.phase === "exile-vote") return alive;
  if (state.phase === "exile-runoff-vote") {
    if (state.runoffCandidates.includes(me.seatId)) return [];
    return alive.filter((player) =>
      state.runoffCandidates.includes(player.seatId)
    );
  }
  if (state.phase === "hunter-shot" && privateState?.role === "hunter") {
    return others;
  }
  if (state.phase === "badge-transfer" && state.sheriffSeatId === me.seatId) {
    return others;
  }
  return [];
}

function getVoiceScope(
  state: WerewolfPublicState,
  privateState?: WerewolfPrivateState
): VoiceScope | undefined {
  if (state.phase === "night-wolves" && privateState?.role === "werewolf") {
    return "wolves";
  }
  if (
    state.phase !== "role-reveal" &&
    !isNightPhase(state.phase) &&
    state.phase !== "finished"
  ) {
    return "public";
  }
  return undefined;
}

function canUseMicrophone(
  state: WerewolfPublicState,
  privateState: WerewolfPrivateState | undefined,
  me: WerewolfPublicPlayer | undefined,
  currentSpeakerSeatId?: string
) {
  if (!me) return false;
  if (state.phase === "night-wolves") {
    return me.alive && privateState?.role === "werewolf";
  }
  return currentSpeakerSeatId === me.seatId;
}

function voiceStatusLabel(snapshot: AgoraVoiceSnapshot) {
  if (snapshot.status === "connecting") return "语音连接中";
  if (snapshot.status === "reconnecting") return "语音重连中";
  if (snapshot.status === "connected") {
    return `语音已连接 · ${snapshot.remoteUserCount} 人`;
  }
  if (snapshot.status === "error") return "语音异常";
  return "语音待机";
}

function seatPosition(index: number, total: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return {
    x: 50 + Math.cos(angle) * 41,
    y: 50 + Math.sin(angle) * 38,
  };
}

function playerLabel(state: WerewolfPublicState, seatId: string) {
  return (
    state.players.find((player) => player.seatId === seatId)?.playerName ??
    seatId
  );
}

function isNightPhase(phase: WerewolfPublicState["phase"]) {
  return phase.startsWith("night-");
}

function roleLabel(role: WerewolfRole) {
  return {
    werewolf: "狼人",
    seer: "预言家",
    witch: "女巫",
    hunter: "猎人",
    villager: "平民",
  }[role];
}

function roleSymbol(role: WerewolfRole) {
  return {
    werewolf: "狼",
    seer: "预",
    witch: "巫",
    hunter: "猎",
    villager: "民",
  }[role];
}

function roleDescription(role: WerewolfRole) {
  return {
    werewolf: "夜晚与狼队共同选择袭击目标，白天隐藏身份并参与放逐。",
    seer: "每晚查验一名玩家，得知其属于狼人或好人阵营。",
    witch: "拥有一瓶解药和一瓶毒药，每晚最多使用一种。",
    hunter: "被狼人击杀或放逐时可以开枪，被女巫毒死时不能开枪。",
    villager: "没有夜间技能，通过发言和投票找出全部狼人。",
  }[role];
}

function phaseLabel(phase: WerewolfPublicState["phase"]) {
  const labels: Record<WerewolfPublicState["phase"], string> = {
    "role-reveal": "查看身份",
    "night-wolves": "狼人行动",
    "night-seer": "预言家查验",
    "night-witch": "女巫行动",
    "sheriff-signup": "警长竞选报名",
    "sheriff-speech": "警长候选发言",
    "sheriff-vote": "警长投票",
    "sheriff-runoff-speech": "警长平票 PK",
    "sheriff-runoff-vote": "警长重新投票",
    dawn: "公布昨夜结果",
    "last-words": "遗言",
    "sheriff-direction": "警长选择发言方向",
    "day-speech": "白天顺序发言",
    "exile-vote": "放逐投票",
    "exile-runoff-speech": "放逐平票 PK",
    "exile-runoff-vote": "放逐重新投票",
    "hunter-shot": "猎人开枪",
    "badge-transfer": "警徽处理",
    finished: "胜负结算",
  };
  return labels[phase];
}

function timelineStage(phase: WerewolfPublicState["phase"]) {
  if (
    phase === "role-reveal" ||
    phase.startsWith("night-") ||
    phase === "dawn"
  ) {
    return "night";
  }
  if (phase.startsWith("sheriff-")) return "sheriff";
  if (
    phase === "day-speech" ||
    phase === "last-words" ||
    phase === "hunter-shot" ||
    phase === "badge-transfer"
  ) {
    return "speech";
  }
  return "vote";
}

function phasePrompt(
  state: WerewolfPublicState,
  privateState: WerewolfPrivateState | undefined,
  me: WerewolfPublicPlayer | undefined,
  currentSpeakerSeatId?: string
) {
  if (state.phase === "finished") {
    return state.winner === "good" ? "好人阵营获胜。" : "狼人阵营获胜。";
  }
  if (currentSpeakerSeatId) {
    return `当前由 ${playerLabel(state, currentSpeakerSeatId)} 发言。`;
  }
  if (state.phase === "night-wolves") {
    return privateState?.role === "werewolf"
      ? "选择袭击目标，可使用狼队私聊与语音。"
      : "狼人正在行动，请等待。";
  }
  if (state.phase === "night-seer") {
    return privateState?.role === "seer"
      ? "请选择一名玩家进行查验。"
      : "预言家正在行动。";
  }
  if (state.phase === "night-witch") {
    if (privateState?.role !== "witch") return "女巫正在行动。";
    return privateState.nightVictimSeatId
      ? `昨夜目标是 ${playerLabel(
          state,
          privateState.nightVictimSeatId
        )}，请选择是否用药。`
      : "狼人没有形成有效袭击目标，可选择使用毒药或不用药。";
  }
  if (state.phase === "sheriff-signup") return "请选择是否参加警长竞选。";
  if (state.phase.includes("vote")) return "点击一名可选玩家，再确认投票。";
  if (state.phase === "sheriff-direction") {
    return me?.isSheriff
      ? "请选择发言方向。"
      : "等待警长决定发言方向。";
  }
  if (state.phase === "hunter-shot") {
    return privateState?.role === "hunter"
      ? "你可以开枪带走一名存活玩家。"
      : "等待猎人决定是否开枪。";
  }
  if (state.phase === "badge-transfer") {
    return me?.isSheriff
      ? "请选择移交警徽，或撕毁警徽。"
      : "等待死亡警长处理警徽。";
  }
  return "等待电子法官推进流程。";
}
