export const RECOVERY_RECORD_VERSION = 2;

export type LastRoomRecoveryRecord = {
  recordVersion: 2;
  roomCode: string;
  userId: string;
  seatId?: string;
  gameKind: "card" | "werewolf";
  status: "waiting" | "playing" | "finished";
  lastSnapshotAt?: number;
  savedAt: number;
};

type LegacyLastRoomRecord = {
  roomCode?: unknown;
  userId?: unknown;
  seatId?: unknown;
  gameKind?: unknown;
  status?: unknown;
  lastSnapshotAt?: unknown;
  savedAt?: unknown;
};

export function parseLastRoomRecoveryRecord(raw: string | null): LastRoomRecoveryRecord | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as LegacyLastRoomRecord;
    if (typeof value.roomCode !== "string" || !value.roomCode.trim()) return undefined;
    if (typeof value.userId !== "string" || !value.userId) return undefined;

    const lastSnapshotAt =
      typeof value.lastSnapshotAt === "number" && Number.isFinite(value.lastSnapshotAt)
        ? value.lastSnapshotAt
        : undefined;
    const status =
      value.status === "waiting" || value.status === "playing" || value.status === "finished"
        ? value.status
        : lastSnapshotAt
          ? "playing"
          : "waiting";
    return {
      recordVersion: RECOVERY_RECORD_VERSION,
      roomCode: value.roomCode.trim().toUpperCase(),
      userId: value.userId,
      seatId: typeof value.seatId === "string" && value.seatId ? value.seatId : undefined,
      gameKind: value.gameKind === "werewolf" ? "werewolf" : "card",
      status,
      lastSnapshotAt,
      savedAt:
        typeof value.savedAt === "number" && Number.isFinite(value.savedAt)
          ? value.savedAt
          : Date.now(),
    };
  } catch {
    return undefined;
  }
}

export function shouldPromptForRecovery(
  record: LastRoomRecoveryRecord | undefined,
  userId: string
): record is LastRoomRecoveryRecord {
  return Boolean(record && record.userId === userId && record.status === "playing");
}
