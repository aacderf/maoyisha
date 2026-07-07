export type WerewolfRole = "werewolf" | "seer" | "witch" | "hunter" | "villager";
export type WerewolfWinner = "good" | "werewolf";
export type WerewolfDirection = "clockwise" | "counterclockwise";
export type WerewolfDeathReason = "werewolf" | "poison" | "exile" | "hunter";
export type WerewolfPhase = "role-reveal" | "night-wolves" | "night-seer" | "night-witch" | "sheriff-signup" | "sheriff-speech" | "sheriff-vote" | "sheriff-runoff-speech" | "sheriff-runoff-vote" | "dawn" | "last-words" | "sheriff-direction" | "day-speech" | "exile-vote" | "exile-runoff-speech" | "exile-runoff-vote" | "hunter-shot" | "badge-transfer" | "finished";
export interface WerewolfPreset {
    id: string;
    playerCount: number;
    label: string;
    roles: WerewolfRole[];
}
export interface WerewolfRoleDefinition {
    id: WerewolfRole;
    name: string;
    camp: "good" | "werewolf";
    description: string;
    nightOrder?: number;
}
export interface WerewolfPlayerInput {
    seatId?: string;
    playerId: string;
    playerName: string;
}
export interface WerewolfPublicPlayer {
    seatId: string;
    playerId: string;
    playerName: string;
    alive: boolean;
    connected: boolean;
    isSheriff: boolean;
    sheriffCandidate: boolean;
    deathReason?: WerewolfDeathReason;
    revealedRole?: WerewolfRole;
}
export interface WerewolfTimerSettings {
    roleRevealSeconds: number;
    nightActionSeconds: number;
    sheriffSignupSeconds: number;
    speechSeconds: number;
    voteSeconds: number;
    lastWordsSeconds: number;
}
export interface WerewolfPhaseTimer {
    scopeId: string;
    startedAt: number;
    durationSeconds: number;
}
export interface WerewolfPublicState {
    id: string;
    roomId: string;
    phase: WerewolfPhase;
    day: number;
    players: WerewolfPublicPlayer[];
    sheriffSeatId?: string;
    speechDirection: WerewolfDirection;
    speechOrder: string[];
    currentSpeakerIndex: number;
    runoffCandidates: string[];
    lastVoteSummary: Record<string, number>;
    logs: string[];
    winner?: WerewolfWinner;
    timer: WerewolfPhaseTimer;
}
export interface WerewolfSeerCheck {
    day: number;
    targetSeatId: string;
    alignment: "good" | "werewolf";
}
export interface WerewolfPrivateState {
    seatId: string;
    role: WerewolfRole;
    wolfTeammateSeatIds: string[];
    wolfVoteSummary: Record<string, number>;
    seerChecks: WerewolfSeerCheck[];
    witchAntidoteAvailable: boolean;
    witchPoisonAvailable: boolean;
    nightVictimSeatId?: string;
    canAct: boolean;
    actionSubmitted: boolean;
}
export interface WerewolfModeratorState {
    publicState: WerewolfPublicState;
    roles: Record<string, WerewolfRole>;
    confirmedSeatIds: string[];
    wolfVotes: Record<string, string | undefined>;
    seerTargetSeatId?: string;
    witchAction?: "save" | "poison" | "pass";
    witchPoisonTargetSeatId?: string;
    sheriffSignup: Record<string, boolean>;
    sheriffVotes: Record<string, string | undefined>;
    exileVotes: Record<string, string | undefined>;
    privateState: Record<string, WerewolfPrivateState>;
    pendingNightDeaths: Array<{
        seatId: string;
        reason: WerewolfDeathReason;
    }>;
    pendingLastWords: string[];
    pendingHunterShots: string[];
    resumeAfterDeath: "sheriff-direction" | "night-wolves";
    timerSettings: WerewolfTimerSettings;
}
export type WerewolfAction = {
    type: "CONFIRM_ROLE";
    playerId: string;
} | {
    type: "WOLF_VOTE";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "SEER_CHECK";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "WITCH_ACTION";
    playerId: string;
    action: "save" | "poison" | "pass";
    targetSeatId?: string;
} | {
    type: "SHERIFF_SIGNUP";
    playerId: string;
    join: boolean;
} | {
    type: "SHERIFF_VOTE";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "COMPLETE_SPEECH";
    playerId: string;
} | {
    type: "CHOOSE_SPEECH_DIRECTION";
    playerId: string;
    direction: WerewolfDirection;
} | {
    type: "EXILE_VOTE";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "HUNTER_SHOOT";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "TRANSFER_BADGE";
    playerId: string;
    targetSeatId?: string;
} | {
    type: "AUTO_TIMEOUT";
    scopeId?: string;
};
export interface WerewolfActionResult {
    state: WerewolfModeratorState;
    events: string[];
}
export declare const DEFAULT_WEREWOLF_TIMER_SETTINGS: WerewolfTimerSettings;
export declare const WEREWOLF_ROLE_DEFINITIONS: WerewolfRoleDefinition[];
export declare const WEREWOLF_PRESETS: WerewolfPreset[];
export declare function createWerewolfGame(input: {
    roomId: string;
    players: WerewolfPlayerInput[];
    seed?: string;
    timerSettings?: Partial<WerewolfTimerSettings>;
}): WerewolfModeratorState;
export declare function applyWerewolfAction(source: WerewolfModeratorState, action: WerewolfAction): WerewolfActionResult;
export declare function getWerewolfPrivateState(state: WerewolfModeratorState, seatId: string): WerewolfPrivateState;
export declare function getWerewolfPublicState(state: WerewolfModeratorState): WerewolfPublicState;
export declare function setWerewolfPlayerConnected(state: WerewolfModeratorState, playerId: string, connected: boolean): WerewolfModeratorState;
export declare function getWerewolfPreset(playerCount: number): WerewolfPreset;
