export const PHOTON_JOIN_GAME_OPERATION = 226;
export const PLAYER_TTL_MS = 120_000;
export const ROOM_TTL_MS = 120_000;
export const RECONNECT_DELAYS_MS = [0, 1_000, 2_000, 5_000, 10_000] as const;
export const RECONNECT_WATCHDOG_MS = 9_000;

export function canStartReconnect(inFlight: boolean, timerPending: boolean): boolean {
  return !inFlight && !timerPending;
}

export function isReconnectCallbackCurrent(input: {
  callbackGeneration: number;
  currentGeneration: number;
  intentionalDisconnect: boolean;
  leaving: boolean;
}): boolean {
  return (
    input.callbackGeneration === input.currentGeneration &&
    !input.intentionalDisconnect &&
    !input.leaving
  );
}

export function shouldReconnectAfterPhotonError(input: {
  errorCode?: number;
  message?: string;
  preserveRoom: boolean;
}): boolean {
  if (!input.preserveRoom) return false;
  const text = String(input.message ?? "").toLowerCase();
  if (/disconnect|disconnected|timeout|closed|socket|websocket|network|connect|server|peer|name server/.test(text)) {
    return true;
  }
  return input.errorCode === 0;
}

export const PhotonJoinError = {
  GameClosed: 32764,
  GameDoesNotExist: 32758,
  JoinFailedPeerAlreadyJoined: 32750,
  JoinFailedFoundInactiveJoiner: 32749,
  JoinFailedWithRejoinerNotFound: 32748,
  JoinFailedFoundActiveJoiner: 32746,
} as const;

export type RecoveryJoinMode = "rejoin" | "normal";

export type JoinFailureDecision =
  | { kind: "ignore" }
  | { kind: "already-joined" }
  | { kind: "retry-rejoin"; delayMs: number; message: string }
  | { kind: "fallback-normal"; delayMs: number; message: string }
  | { kind: "stale-room"; message: string }
  | { kind: "fatal"; message: string };

export function decideJoinFailure(input: {
  errorCode: number;
  operationCode: number;
  mode: RecoveryJoinMode;
  activeActorRetryCount: number;
  maxActiveActorRetries?: number;
}): JoinFailureDecision {
  if (input.operationCode !== PHOTON_JOIN_GAME_OPERATION) return { kind: "ignore" };

  const maxActiveActorRetries = input.maxActiveActorRetries ?? 8;
  switch (input.errorCode) {
    case PhotonJoinError.JoinFailedPeerAlreadyJoined:
      return { kind: "already-joined" };
    case PhotonJoinError.JoinFailedFoundActiveJoiner:
      if (input.activeActorRetryCount >= maxActiveActorRetries) {
        return {
          kind: "fatal",
          message: "旧连接仍占用该座位，请等待片刻后手动重试。",
        };
      }
      return {
        kind: "retry-rejoin",
        delayMs: 1_500,
        message: "旧连接尚未释放，正在等待座位转为可恢复状态。",
      };
    case PhotonJoinError.JoinFailedFoundInactiveJoiner:
      return {
        kind: "retry-rejoin",
        delayMs: 0,
        message: "检测到断线座位，正在使用原身份恢复。",
      };
    case PhotonJoinError.JoinFailedWithRejoinerNotFound:
      if (input.mode === "rejoin") {
        return {
          kind: "fallback-normal",
          delayMs: 0,
          message: "原 Photon Actor 已过期，正在按固定座位重新加入。",
        };
      }
      return {
        kind: "fatal",
        message: "房间中找不到可恢复的玩家记录。",
      };
    case PhotonJoinError.GameDoesNotExist:
      return { kind: "stale-room", message: "上次房间已结束或不存在。" };
    case PhotonJoinError.GameClosed:
      return { kind: "fatal", message: "上次房间已关闭，暂时无法恢复。" };
    default:
      return { kind: "fatal", message: `Photon 进入房间失败：${input.errorCode}` };
  }
}
