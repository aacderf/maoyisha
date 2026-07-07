import { describe, expect, it } from "vitest";
import {
  PHOTON_JOIN_GAME_OPERATION,
  PLAYER_TTL_MS,
  RECONNECT_DELAYS_MS,
  RECONNECT_WATCHDOG_MS,
  ROOM_TTL_MS,
  canStartReconnect,
  PhotonJoinError,
  decideJoinFailure,
  isReconnectCallbackCurrent,
  shouldReconnectAfterPhotonError,
} from "./reconnectPolicy.js";
import {
  RECOVERY_RECORD_VERSION,
  parseLastRoomRecoveryRecord,
  shouldPromptForRecovery,
} from "./recoveryRecord.js";

describe("Photon reconnect policy", () => {
  it("uses 120 second actor and room retention with the required backoff", () => {
    expect(PLAYER_TTL_MS).toBe(120_000);
    expect(ROOM_TTL_MS).toBe(120_000);
    expect(RECONNECT_DELAYS_MS).toEqual([0, 1_000, 2_000, 5_000, 10_000]);
    expect(RECONNECT_WATCHDOG_MS).toBeGreaterThanOrEqual(8_000);
    expect(RECONNECT_WATCHDOG_MS).toBeLessThanOrEqual(10_000);
  });

  it("deduplicates repeated reconnect callbacks", () => {
    expect(canStartReconnect(false, false)).toBe(true);
    expect(canStartReconnect(true, false)).toBe(false);
    expect(canStartReconnect(false, true)).toBe(false);
  });

  it("invalidates delayed callbacks after cancellation", () => {
    expect(
      isReconnectCallbackCurrent({
        callbackGeneration: 4,
        currentGeneration: 5,
        intentionalDisconnect: false,
        leaving: false,
      })
    ).toBe(false);
    expect(
      isReconnectCallbackCurrent({
        callbackGeneration: 5,
        currentGeneration: 5,
        intentionalDisconnect: false,
        leaving: false,
      })
    ).toBe(true);
  });

  it("ignores errors from unrelated Photon operations", () => {
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.JoinFailedWithRejoinerNotFound,
        operationCode: 253,
        mode: "rejoin",
        activeActorRetryCount: 0,
      })
    ).toEqual({ kind: "ignore" });
  });

  it("only treats connection style Photon errors as reconnect triggers", () => {
    expect(
      shouldReconnectAfterPhotonError({
        preserveRoom: true,
        message: "websocket timeout",
      })
    ).toBe(true);
    expect(
      shouldReconnectAfterPhotonError({
        preserveRoom: false,
        message: "websocket timeout",
      })
    ).toBe(false);
    expect(
      shouldReconnectAfterPhotonError({
        preserveRoom: true,
        errorCode: 32760,
        message: "invalid operation",
      })
    ).toBe(false);
  });

  it("waits for an active actor and stops after the bounded retry count", () => {
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.JoinFailedFoundActiveJoiner,
        operationCode: PHOTON_JOIN_GAME_OPERATION,
        mode: "rejoin",
        activeActorRetryCount: 0,
      })
    ).toMatchObject({ kind: "retry-rejoin", delayMs: 1_500 });
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.JoinFailedFoundActiveJoiner,
        operationCode: PHOTON_JOIN_GAME_OPERATION,
        mode: "rejoin",
        activeActorRetryCount: 8,
      })
    ).toMatchObject({ kind: "fatal" });
  });

  it("switches normal join to rejoin when an inactive actor exists", () => {
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.JoinFailedFoundInactiveJoiner,
        operationCode: PHOTON_JOIN_GAME_OPERATION,
        mode: "normal",
        activeActorRetryCount: 0,
      })
    ).toMatchObject({ kind: "retry-rejoin" });
  });

  it("falls back to one normal join when the rejoin actor expired", () => {
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.JoinFailedWithRejoinerNotFound,
        operationCode: PHOTON_JOIN_GAME_OPERATION,
        mode: "rejoin",
        activeActorRetryCount: 0,
      })
    ).toMatchObject({ kind: "fallback-normal" });
  });

  it("marks a missing room as stale", () => {
    expect(
      decideJoinFailure({
        errorCode: PhotonJoinError.GameDoesNotExist,
        operationCode: PHOTON_JOIN_GAME_OPERATION,
        mode: "normal",
        activeActorRetryCount: 0,
      })
    ).toMatchObject({ kind: "stale-room" });
  });
});

describe("last room recovery record", () => {
  it("upgrades a legacy playing record without using savedAt as Photon TTL", () => {
    const record = parseLastRoomRecoveryRecord(
      JSON.stringify({
        roomCode: "room-1001",
        userId: "user-a",
        seatId: "seat-2",
        lastSnapshotAt: 100,
        savedAt: 1,
      })
    );
    expect(record).toMatchObject({
      recordVersion: RECOVERY_RECORD_VERSION,
      roomCode: "ROOM-1001",
      userId: "user-a",
      gameKind: "card",
      status: "playing",
    });
    expect(shouldPromptForRecovery(record, "user-a")).toBe(true);
  });

  it("does not prompt for waiting, finished, invalid, or another user's record", () => {
    const waiting = parseLastRoomRecoveryRecord(
      JSON.stringify({ roomCode: "A", userId: "u", status: "waiting", savedAt: 1 })
    );
    const finished = parseLastRoomRecoveryRecord(
      JSON.stringify({ roomCode: "A", userId: "u", status: "finished", savedAt: 1 })
    );
    expect(shouldPromptForRecovery(waiting, "u")).toBe(false);
    expect(shouldPromptForRecovery(finished, "u")).toBe(false);
    expect(shouldPromptForRecovery(waiting, "other")).toBe(false);
    expect(parseLastRoomRecoveryRecord("bad json")).toBeUndefined();
  });
});
