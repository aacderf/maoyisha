export type WerewolfRole = "werewolf" | "seer" | "witch" | "hunter" | "villager";
export type WerewolfWinner = "good" | "werewolf";
export type WerewolfDirection = "clockwise" | "counterclockwise";
export type WerewolfDeathReason = "werewolf" | "poison" | "exile" | "hunter";

export type WerewolfPhase =
  | "role-reveal"
  | "night-wolves"
  | "night-seer"
  | "night-witch"
  | "sheriff-signup"
  | "sheriff-speech"
  | "sheriff-vote"
  | "sheriff-runoff-speech"
  | "sheriff-runoff-vote"
  | "dawn"
  | "last-words"
  | "sheriff-direction"
  | "day-speech"
  | "exile-vote"
  | "exile-runoff-speech"
  | "exile-runoff-vote"
  | "hunter-shot"
  | "badge-transfer"
  | "finished";

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
  pendingNightDeaths: Array<{ seatId: string; reason: WerewolfDeathReason }>;
  pendingLastWords: string[];
  pendingHunterShots: string[];
  resumeAfterDeath: "sheriff-direction" | "night-wolves";
  timerSettings: WerewolfTimerSettings;
}

export type WerewolfAction =
  | { type: "CONFIRM_ROLE"; playerId: string }
  | { type: "WOLF_VOTE"; playerId: string; targetSeatId?: string }
  | { type: "SEER_CHECK"; playerId: string; targetSeatId?: string }
  | {
      type: "WITCH_ACTION";
      playerId: string;
      action: "save" | "poison" | "pass";
      targetSeatId?: string;
    }
  | { type: "SHERIFF_SIGNUP"; playerId: string; join: boolean }
  | { type: "SHERIFF_VOTE"; playerId: string; targetSeatId?: string }
  | { type: "COMPLETE_SPEECH"; playerId: string }
  | { type: "CHOOSE_SPEECH_DIRECTION"; playerId: string; direction: WerewolfDirection }
  | { type: "EXILE_VOTE"; playerId: string; targetSeatId?: string }
  | { type: "HUNTER_SHOOT"; playerId: string; targetSeatId?: string }
  | { type: "TRANSFER_BADGE"; playerId: string; targetSeatId?: string }
  | { type: "AUTO_TIMEOUT"; scopeId?: string };

export interface WerewolfActionResult {
  state: WerewolfModeratorState;
  events: string[];
}

export const DEFAULT_WEREWOLF_TIMER_SETTINGS: WerewolfTimerSettings = {
  roleRevealSeconds: 12,
  nightActionSeconds: 20,
  sheriffSignupSeconds: 15,
  speechSeconds: 60,
  voteSeconds: 20,
  lastWordsSeconds: 45,
};

export const WEREWOLF_ROLE_DEFINITIONS: WerewolfRoleDefinition[] = [
  {
    id: "werewolf",
    name: "狼人",
    camp: "werewolf",
    nightOrder: 1,
    description: "夜晚与狼队共同选择袭击目标，白天隐藏身份并参与放逐。",
  },
  {
    id: "seer",
    name: "预言家",
    camp: "good",
    nightOrder: 2,
    description: "每晚查验一名玩家，得知其属于狼人或好人阵营。",
  },
  {
    id: "witch",
    name: "女巫",
    camp: "good",
    nightOrder: 3,
    description: "拥有一瓶解药和一瓶毒药，每晚最多使用一种。",
  },
  {
    id: "hunter",
    name: "猎人",
    camp: "good",
    description: "被狼人击杀或放逐时可以开枪，被女巫毒死时不能开枪。",
  },
  {
    id: "villager",
    name: "平民",
    camp: "good",
    description: "没有夜间技能，通过发言和投票找出全部狼人。",
  },
];

export const WEREWOLF_PRESETS: WerewolfPreset[] = [
  {
    id: "werewolf-5",
    playerCount: 5,
    label: "5人快速标准局",
    roles: ["werewolf", "seer", "witch", "villager", "villager"],
  },
  {
    id: "werewolf-6",
    playerCount: 6,
    label: "6人双狼标准局",
    roles: ["werewolf", "werewolf", "seer", "witch", "villager", "villager"],
  },
  {
    id: "werewolf-7",
    playerCount: 7,
    label: "7人猎人标准局",
    roles: ["werewolf", "werewolf", "seer", "witch", "hunter", "villager", "villager"],
  },
  {
    id: "werewolf-8",
    playerCount: 8,
    label: "8人三狼标准局",
    roles: ["werewolf", "werewolf", "werewolf", "seer", "witch", "hunter", "villager", "villager"],
  },
];

export function createWerewolfGame(input: {
  roomId: string;
  players: WerewolfPlayerInput[];
  seed?: string;
  timerSettings?: Partial<WerewolfTimerSettings>;
}): WerewolfModeratorState {
  const preset = getWerewolfPreset(input.players.length);
  const players = input.players.map((player, index) => ({
    seatId: player.seatId ?? `seat-${index + 1}`,
    playerId: player.playerId,
    playerName: player.playerName,
    alive: true,
    connected: true,
    isSheriff: false,
    sheriffCandidate: false,
  }));
  const shuffledRoles = shuffle(preset.roles, input.seed ?? `${input.roomId}-${Date.now()}`);
  const roles = Object.fromEntries(players.map((player, index) => [player.seatId, shuffledRoles[index]!]));
  const timerSettings = { ...DEFAULT_WEREWOLF_TIMER_SETTINGS, ...input.timerSettings };
  const publicState: WerewolfPublicState = {
    id: `werewolf-${input.roomId}`,
    roomId: input.roomId,
    phase: "role-reveal",
    day: 1,
    players,
    speechDirection: "clockwise",
    speechOrder: [],
    currentSpeakerIndex: 0,
    runoffCandidates: [],
    lastVoteSummary: {},
    logs: ["身份已分配，请私下查看身份。"],
    timer: makeTimer("role-reveal", 1, timerSettings.roleRevealSeconds),
  };
  const privateState = Object.fromEntries(
    players.map((player) => [
      player.seatId,
      makePrivateState(player.seatId, roles[player.seatId]!, roles),
    ])
  );
  return {
    publicState,
    roles,
    confirmedSeatIds: [],
    wolfVotes: {},
    sheriffSignup: {},
    sheriffVotes: {},
    exileVotes: {},
    privateState,
    pendingNightDeaths: [],
    pendingLastWords: [],
    pendingHunterShots: [],
    resumeAfterDeath: "sheriff-direction",
    timerSettings,
  };
}

export function applyWerewolfAction(
  source: WerewolfModeratorState,
  action: WerewolfAction
): WerewolfActionResult {
  if (source.publicState.phase === "finished") {
    throw new Error("狼人杀对局已经结束。");
  }
  const state = structuredClone(source) as WerewolfModeratorState;
  const events: string[] = [];
  if (action.type === "AUTO_TIMEOUT") {
    if (action.scopeId && action.scopeId !== state.publicState.timer.scopeId) {
      return { state, events };
    }
    applyTimeout(state, events);
    return finalize(state, events);
  }

  const seat = requirePlayerById(state, action.playerId);
  switch (action.type) {
    case "CONFIRM_ROLE":
      requirePhase(state, "role-reveal");
      addUnique(state.confirmedSeatIds, seat.seatId);
      if (state.confirmedSeatIds.length >= state.publicState.players.length) {
        enterPhase(state, "night-wolves", events, "天黑请闭眼，狼人开始行动。");
      }
      break;
    case "WOLF_VOTE":
      requirePhase(state, "night-wolves");
      requireRole(state, seat.seatId, "werewolf");
      validateAliveTarget(state, action.targetSeatId, seat.seatId);
      state.wolfVotes[seat.seatId] = action.targetSeatId;
      refreshPrivateStates(state);
      if (allAliveRolesSubmitted(state, "werewolf", state.wolfVotes)) {
        resolveWolfVotes(state);
        enterPhase(state, "night-seer", events, "狼人行动结束，预言家请查验。");
      }
      break;
    case "SEER_CHECK":
      requirePhase(state, "night-seer");
      requireRole(state, seat.seatId, "seer");
      if (action.targetSeatId) {
        validateAliveTarget(state, action.targetSeatId, seat.seatId);
        state.seerTargetSeatId = action.targetSeatId;
        const check: WerewolfSeerCheck = {
          day: state.publicState.day,
          targetSeatId: action.targetSeatId,
          alignment: state.roles[action.targetSeatId] === "werewolf" ? "werewolf" : "good",
        };
        state.privateState[seat.seatId]!.seerChecks.push(check);
      }
      enterPhase(state, "night-witch", events, "预言家行动结束，女巫请行动。");
      break;
    case "WITCH_ACTION":
      requirePhase(state, "night-witch");
      requireRole(state, seat.seatId, "witch");
      applyWitchAction(state, seat.seatId, action.action, action.targetSeatId);
      finishNightActions(state, events);
      break;
    case "SHERIFF_SIGNUP":
      requirePhase(state, "sheriff-signup");
      requireAlive(seat);
      state.sheriffSignup[seat.seatId] = action.join;
      seat.sheriffCandidate = action.join;
      if (allAlivePlayersSubmitted(state, state.sheriffSignup)) {
        finishSheriffSignup(state, events);
      }
      break;
    case "SHERIFF_VOTE":
      if (state.publicState.phase !== "sheriff-vote" && state.publicState.phase !== "sheriff-runoff-vote") {
        throw new Error("当前不是警长投票阶段。");
      }
      requireAlive(seat);
      if (!sheriffVoterSeatIds(state).includes(seat.seatId)) {
        throw new Error("警长候选人不能参与本轮警长投票。");
      }
      validateVoteTarget(state, action.targetSeatId, sheriffCandidates(state));
      state.sheriffVotes[seat.seatId] = action.targetSeatId;
      if (allSeatIdsSubmitted(sheriffVoterSeatIds(state), state.sheriffVotes)) {
        resolveSheriffVote(state, events);
      }
      break;
    case "COMPLETE_SPEECH":
      if (!isSpeechPhase(state.publicState.phase)) throw new Error("当前不是发言阶段。");
      if (currentSpeakerSeatId(state) !== seat.seatId) throw new Error("当前还没有轮到你发言。");
      advanceSpeech(state, events);
      break;
    case "CHOOSE_SPEECH_DIRECTION":
      requirePhase(state, "sheriff-direction");
      if (seat.seatId !== state.publicState.sheriffSeatId) throw new Error("只有警长能决定发言方向。");
      state.publicState.speechDirection = action.direction;
      startDaySpeech(state, events);
      break;
    case "EXILE_VOTE":
      if (state.publicState.phase !== "exile-vote" && state.publicState.phase !== "exile-runoff-vote") {
        throw new Error("当前不是放逐投票阶段。");
      }
      requireAlive(seat);
      if (!exileVoterSeatIds(state).includes(seat.seatId)) {
        throw new Error("PK 玩家不能参与本轮放逐投票。");
      }
      validateVoteTarget(
        state,
        action.targetSeatId,
        state.publicState.phase === "exile-runoff-vote"
          ? state.publicState.runoffCandidates
          : alivePlayers(state).map((player) => player.seatId)
      );
      state.exileVotes[seat.seatId] = action.targetSeatId;
      if (allSeatIdsSubmitted(exileVoterSeatIds(state), state.exileVotes)) {
        resolveExileVote(state, events);
      }
      break;
    case "HUNTER_SHOOT":
      requirePhase(state, "hunter-shot");
      if (state.pendingHunterShots[0] !== seat.seatId) throw new Error("当前不是你的猎人技能。");
      if (action.targetSeatId) {
        validateAliveTarget(state, action.targetSeatId, seat.seatId);
        killPlayer(state, action.targetSeatId, "hunter", events);
      }
      state.pendingHunterShots.shift();
      continueAfterHunter(state, events);
      break;
    case "TRANSFER_BADGE":
      requirePhase(state, "badge-transfer");
      if (seat.seatId !== state.publicState.sheriffSeatId) throw new Error("只有死亡警长能处理警徽。");
      if (action.targetSeatId) {
        validateAliveTarget(state, action.targetSeatId, seat.seatId);
        setSheriff(state, action.targetSeatId);
        events.push(`${seat.playerName} 将警徽移交给 ${playerName(state, action.targetSeatId)}。`);
      } else {
        setSheriff(state, undefined);
        events.push(`${seat.playerName} 撕毁了警徽。`);
      }
      continueAfterDeath(state, events);
      break;
  }
  return finalize(state, events);
}

export function getWerewolfPrivateState(
  state: WerewolfModeratorState,
  seatId: string
): WerewolfPrivateState {
  const privateState = state.privateState[seatId];
  if (!privateState) throw new Error("找不到狼人杀私有状态。");
  return structuredClone(privateState) as WerewolfPrivateState;
}

export function getWerewolfPublicState(state: WerewolfModeratorState): WerewolfPublicState {
  return structuredClone(state.publicState) as WerewolfPublicState;
}

export function setWerewolfPlayerConnected(
  state: WerewolfModeratorState,
  playerId: string,
  connected: boolean
): WerewolfModeratorState {
  const next = structuredClone(state) as WerewolfModeratorState;
  const player = next.publicState.players.find((item) => item.playerId === playerId);
  if (player) player.connected = connected;
  return next;
}

export function getWerewolfPreset(playerCount: number): WerewolfPreset {
  const preset = WEREWOLF_PRESETS.find((item) => item.playerCount === playerCount);
  if (!preset) throw new Error("狼人杀仅支持 5-8 人。");
  return preset;
}

function applyTimeout(state: WerewolfModeratorState, events: string[]) {
  const phase = state.publicState.phase;
  if (phase === "role-reveal") {
    state.confirmedSeatIds = state.publicState.players.map((player) => player.seatId);
    enterPhase(state, "night-wolves", events, "身份查看结束，狼人开始行动。");
  } else if (phase === "night-wolves") {
    resolveWolfVotes(state);
    enterPhase(state, "night-seer", events, "狼人行动超时，预言家请查验。");
  } else if (phase === "night-seer") {
    enterPhase(state, "night-witch", events, "预言家未行动，女巫请行动。");
  } else if (phase === "night-witch") {
    finishNightActions(state, events);
  } else if (phase === "sheriff-signup") {
    for (const player of alivePlayers(state)) {
      if (!(player.seatId in state.sheriffSignup)) state.sheriffSignup[player.seatId] = false;
    }
    finishSheriffSignup(state, events);
  } else if (isSpeechPhase(phase) || phase === "last-words") {
    advanceSpeech(state, events);
  } else if (phase === "sheriff-vote" || phase === "sheriff-runoff-vote") {
    for (const seatId of sheriffVoterSeatIds(state)) {
      if (!(seatId in state.sheriffVotes)) state.sheriffVotes[seatId] = undefined;
    }
    resolveSheriffVote(state, events);
  } else if (phase === "sheriff-direction") {
    state.publicState.speechDirection = "clockwise";
    startDaySpeech(state, events);
  } else if (phase === "exile-vote" || phase === "exile-runoff-vote") {
    for (const seatId of exileVoterSeatIds(state)) {
      if (!(seatId in state.exileVotes)) state.exileVotes[seatId] = undefined;
    }
    resolveExileVote(state, events);
  } else if (phase === "hunter-shot") {
    state.pendingHunterShots.shift();
    continueAfterHunter(state, events);
  } else if (phase === "badge-transfer") {
    setSheriff(state, undefined);
    events.push("警徽处理超时，警徽被撕毁。");
    continueAfterDeath(state, events);
  } else if (phase === "dawn") {
    resolveDawn(state, events);
  }
}

function enterPhase(
  state: WerewolfModeratorState,
  phase: WerewolfPhase,
  events: string[],
  message?: string
) {
  state.publicState.phase = phase;
  state.publicState.timer = makeTimer(
    phase,
    state.publicState.day,
    phaseDuration(state.timerSettings, phase)
  );
  if (message) events.push(message);
  refreshPrivateStates(state);
  autoSkipMissingRole(state, events);
}

function autoSkipMissingRole(state: WerewolfModeratorState, events: string[]) {
  if (state.publicState.phase === "night-seer" && !aliveRoleSeatIds(state, "seer").length) {
    enterPhase(state, "night-witch", events, "预言家已出局，跳过查验。");
  } else if (state.publicState.phase === "night-witch" && !aliveRoleSeatIds(state, "witch").length) {
    finishNightActions(state, events);
  }
}

function finishNightActions(state: WerewolfModeratorState, events: string[]) {
  if (state.publicState.day === 1 && state.publicState.sheriffSeatId === undefined) {
    state.sheriffSignup = {};
    for (const player of state.publicState.players) player.sheriffCandidate = false;
    enterPhase(state, "sheriff-signup", events, "开始警长竞选，请选择是否上警。");
  } else {
    enterPhase(state, "dawn", events, "天亮了，正在结算昨夜情况。");
    resolveDawn(state, events);
  }
}

function finishSheriffSignup(state: WerewolfModeratorState, events: string[]) {
  const candidates = alivePlayers(state)
    .filter((player) => state.sheriffSignup[player.seatId])
    .map((player) => player.seatId);
  if (candidates.length === 0) {
    events.push("无人上警，本局暂时没有警长。");
    enterPhase(state, "dawn", events);
    resolveDawn(state, events);
  } else if (candidates.length === 1) {
    setSheriff(state, candidates[0]);
    events.push(`${playerName(state, candidates[0]!)} 自动当选警长。`);
    enterPhase(state, "dawn", events);
    resolveDawn(state, events);
  } else {
    state.publicState.speechOrder = candidates;
    state.publicState.currentSpeakerIndex = 0;
    enterPhase(state, "sheriff-speech", events, "警长候选人开始依次发言。");
  }
}

function resolveSheriffVote(state: WerewolfModeratorState, events: string[]) {
  const candidates = sheriffCandidates(state);
  const result = tallyVotes(state.sheriffVotes, candidates, undefined);
  state.publicState.lastVoteSummary = result.summary;
  state.sheriffVotes = {};
  if (result.winners.length === 1) {
    setSheriff(state, result.winners[0]);
    events.push(`${playerName(state, result.winners[0]!)} 当选警长。`);
    enterPhase(state, "dawn", events);
    resolveDawn(state, events);
    return;
  }
  if (state.publicState.phase === "sheriff-runoff-vote" || result.winners.length === 0) {
    events.push("警长投票仍然平票，本局没有警长。");
    for (const player of state.publicState.players) player.sheriffCandidate = false;
    state.publicState.runoffCandidates = [];
    enterPhase(state, "dawn", events);
    resolveDawn(state, events);
    return;
  }
  state.publicState.runoffCandidates = result.winners;
  state.publicState.speechOrder = result.winners;
  state.publicState.currentSpeakerIndex = 0;
  enterPhase(state, "sheriff-runoff-speech", events, "警长竞选平票，进入 PK 发言。");
}

function resolveDawn(state: WerewolfModeratorState, events: string[]) {
  requirePhase(state, "dawn");
  const uniqueDeaths = mergeDeaths(state.pendingNightDeaths);
  state.pendingNightDeaths = [];
  if (!uniqueDeaths.length) {
    events.push("昨夜是平安夜。");
    beginDayDiscussion(state, events);
    return;
  }
  for (const death of uniqueDeaths) killPlayer(state, death.seatId, death.reason, events);
  if (!state.pendingHunterShots.length && checkWinner(state, events)) return;
  state.pendingLastWords = uniqueDeaths.map((death) => death.seatId);
  state.resumeAfterDeath = "sheriff-direction";
  beginDeathInterruption(state, events);
}

function resolveExileVote(state: WerewolfModeratorState, events: string[]) {
  const runoff = state.publicState.phase === "exile-runoff-vote";
  const candidates = runoff
    ? state.publicState.runoffCandidates
    : alivePlayers(state).map((player) => player.seatId);
  const result = tallyVotes(state.exileVotes, candidates, state.publicState.sheriffSeatId);
  state.publicState.lastVoteSummary = result.summary;
  state.exileVotes = {};
  if (result.winners.length === 1) {
    const targetSeatId = result.winners[0]!;
    events.push(`${playerName(state, targetSeatId)} 被放逐出局。`);
    killPlayer(state, targetSeatId, "exile", events);
    if (!state.pendingHunterShots.length && checkWinner(state, events)) return;
    state.pendingLastWords = [targetSeatId];
    state.resumeAfterDeath = "night-wolves";
    beginDeathInterruption(state, events);
    return;
  }
  if (runoff || result.winners.length === 0) {
    events.push("放逐投票平票，本日无人出局。");
    startNextNight(state, events);
    return;
  }
  state.publicState.runoffCandidates = result.winners;
  state.publicState.speechOrder = result.winners;
  state.publicState.currentSpeakerIndex = 0;
  enterPhase(state, "exile-runoff-speech", events, "放逐投票平票，进入 PK 发言。");
}

function advanceSpeech(state: WerewolfModeratorState, events: string[]) {
  const phase = state.publicState.phase;
  const speaker = currentSpeakerSeatId(state);
  if (speaker) events.push(`${playerName(state, speaker)} 发言结束。`);
  if (phase === "last-words") {
    state.pendingLastWords = state.pendingLastWords.filter(
      (seatId) => seatId !== speaker
    );
    state.publicState.speechOrder = [...state.pendingLastWords];
    state.publicState.currentSpeakerIndex = 0;
    if (state.publicState.speechOrder.length > 0) {
      state.publicState.timer = makeTimer(
        phase,
        state.publicState.day,
        phaseDuration(state.timerSettings, phase)
      );
    } else {
      continueAfterDeath(state, events);
    }
    return;
  }
  state.publicState.currentSpeakerIndex += 1;
  if (state.publicState.currentSpeakerIndex < state.publicState.speechOrder.length) {
    state.publicState.timer = makeTimer(phase, state.publicState.day, phaseDuration(state.timerSettings, phase));
    return;
  }
  if (phase === "sheriff-speech") {
    state.sheriffVotes = {};
    enterPhase(state, "sheriff-vote", events, "退水与非候选玩家开始投票选警长。");
  } else if (phase === "sheriff-runoff-speech") {
    state.sheriffVotes = {};
    enterPhase(state, "sheriff-runoff-vote", events, "警长 PK 发言结束，开始重新投票。");
  } else if (phase === "day-speech") {
    state.exileVotes = {};
    enterPhase(state, "exile-vote", events, "全员发言结束，开始放逐投票。");
  } else if (phase === "exile-runoff-speech") {
    state.exileVotes = {};
    enterPhase(state, "exile-runoff-vote", events, "PK 发言结束，开始重新投票。");
  }
}

function beginDayDiscussion(state: WerewolfModeratorState, events: string[]) {
  if (state.publicState.sheriffSeatId && aliveSeat(state, state.publicState.sheriffSeatId)) {
    enterPhase(state, "sheriff-direction", events, "请警长选择本日发言方向。");
  } else {
    state.publicState.speechDirection = "clockwise";
    startDaySpeech(state, events);
  }
}

function startDaySpeech(state: WerewolfModeratorState, events: string[]) {
  const alive = alivePlayers(state).map((player) => player.seatId);
  const sheriffIndex = state.publicState.sheriffSeatId
    ? alive.indexOf(state.publicState.sheriffSeatId)
    : -1;
  if (sheriffIndex < 0) {
    state.publicState.speechOrder =
      state.publicState.speechDirection === "clockwise"
        ? alive
        : [...alive].reverse();
  } else if (state.publicState.speechDirection === "clockwise") {
    // The sheriff chooses a side; the adjacent player speaks first and the sheriff summarizes last.
    state.publicState.speechOrder = rotate(alive, sheriffIndex + 1);
  } else {
    const reversed = [...alive].reverse();
    const reversedSheriffIndex = reversed.indexOf(state.publicState.sheriffSeatId!);
    state.publicState.speechOrder = rotate(reversed, reversedSheriffIndex + 1);
  }
  state.publicState.currentSpeakerIndex = 0;
  enterPhase(state, "day-speech", events, "白天顺序发言开始。");
}

function startNextNight(state: WerewolfModeratorState, events: string[]) {
  state.publicState.day += 1;
  state.wolfVotes = {};
  state.seerTargetSeatId = undefined;
  state.witchAction = undefined;
  state.witchPoisonTargetSeatId = undefined;
  state.publicState.runoffCandidates = [];
  state.publicState.speechOrder = [];
  state.publicState.currentSpeakerIndex = 0;
  enterPhase(state, "night-wolves", events, `第 ${state.publicState.day} 夜开始，狼人请行动。`);
}

function beginDeathInterruption(state: WerewolfModeratorState, events: string[]) {
  if (state.pendingHunterShots.length) {
    const hunter = state.publicState.players.find(
      (player) => player.seatId === state.pendingHunterShots[0]
    );
    if (hunter) hunter.revealedRole = "hunter";
    enterPhase(state, "hunter-shot", events, "猎人可以选择是否开枪。");
    return;
  }
  const deadSheriff = state.publicState.sheriffSeatId
    ? state.publicState.players.find(
        (player) => player.seatId === state.publicState.sheriffSeatId && !player.alive
      )
    : undefined;
  if (deadSheriff) {
    enterPhase(state, "badge-transfer", events, "死亡警长请选择移交或撕毁警徽。");
    return;
  }
  startLastWordsOrResume(state, events);
}

function continueAfterHunter(state: WerewolfModeratorState, events: string[]) {
  if (state.pendingHunterShots.length) {
    const hunter = state.publicState.players.find(
      (player) => player.seatId === state.pendingHunterShots[0]
    );
    if (hunter) hunter.revealedRole = "hunter";
    state.publicState.timer = makeTimer("hunter-shot", state.publicState.day, state.timerSettings.nightActionSeconds);
    return;
  }
  if (checkWinner(state, events)) return;
  beginDeathInterruption(state, events);
}

function continueAfterDeath(state: WerewolfModeratorState, events: string[]) {
  startLastWordsOrResume(state, events);
}

function startLastWordsOrResume(state: WerewolfModeratorState, events: string[]) {
  const pending = state.pendingLastWords.filter((seatId) => !aliveSeat(state, seatId));
  state.pendingLastWords = pending;
  if (pending.length) {
    state.publicState.speechOrder = pending;
    state.publicState.currentSpeakerIndex = 0;
    enterPhase(state, "last-words", events, "出局玩家开始发表遗言。");
  } else if (state.resumeAfterDeath === "sheriff-direction") {
    beginDayDiscussion(state, events);
  } else {
    startNextNight(state, events);
  }
}

function applyWitchAction(
  state: WerewolfModeratorState,
  witchSeatId: string,
  action: "save" | "poison" | "pass",
  targetSeatId?: string
) {
  const privateState = state.privateState[witchSeatId]!;
  state.witchAction = action;
  if (action === "save") {
    const victim = resolveWolfVictim(state);
    if (!privateState.witchAntidoteAvailable || !victim) throw new Error("当前不能使用解药。");
    if (victim === witchSeatId && state.publicState.day !== 1) throw new Error("女巫只有首夜可以自救。");
    privateState.witchAntidoteAvailable = false;
    state.pendingNightDeaths = state.pendingNightDeaths.filter(
      (death) => !(death.seatId === victim && death.reason === "werewolf")
    );
  } else if (action === "poison") {
    if (!privateState.witchPoisonAvailable) throw new Error("毒药已经使用。");
    validateAliveTarget(state, targetSeatId, undefined);
    privateState.witchPoisonAvailable = false;
    state.witchPoisonTargetSeatId = targetSeatId;
    state.pendingNightDeaths.push({ seatId: targetSeatId!, reason: "poison" });
  }
}

function resolveWolfVotes(state: WerewolfModeratorState) {
  const candidates = alivePlayers(state)
    .filter((player) => state.roles[player.seatId] !== "werewolf")
    .map((player) => player.seatId);
  const result = tallyVotes(state.wolfVotes, candidates, undefined);
  state.pendingNightDeaths = result.winners.length === 1
    ? [{ seatId: result.winners[0]!, reason: "werewolf" }]
    : [];
}

function resolveWolfVictim(state: WerewolfModeratorState): string | undefined {
  return state.pendingNightDeaths.find((death) => death.reason === "werewolf")?.seatId;
}

function mergeDeaths(deaths: Array<{ seatId: string; reason: WerewolfDeathReason }>) {
  const result = new Map<string, WerewolfDeathReason>();
  for (const death of deaths) result.set(death.seatId, death.reason);
  return [...result.entries()].map(([seatId, reason]) => ({ seatId, reason }));
}

function killPlayer(
  state: WerewolfModeratorState,
  seatId: string,
  reason: WerewolfDeathReason,
  events: string[]
) {
  const player = requirePlayerBySeat(state, seatId);
  if (!player.alive) return;
  player.alive = false;
  player.deathReason = reason;
  player.sheriffCandidate = false;
  events.push(`${player.playerName} 出局。`);
  if (state.roles[seatId] === "hunter" && reason !== "poison") {
    addUnique(state.pendingHunterShots, seatId);
  }
}

function checkWinner(state: WerewolfModeratorState, events: string[]): boolean {
  const alive = alivePlayers(state);
  const wolves = alive.filter((player) => state.roles[player.seatId] === "werewolf");
  const villagers = alive.filter((player) => state.roles[player.seatId] === "villager");
  const gods = alive.filter((player) => {
    const role = state.roles[player.seatId];
    return role === "seer" || role === "witch" || role === "hunter";
  });
  let winner: WerewolfWinner | undefined;
  if (wolves.length === 0) winner = "good";
  else if (villagers.length === 0 || gods.length === 0) winner = "werewolf";
  if (!winner) return false;
  state.publicState.winner = winner;
  state.publicState.phase = "finished";
  state.publicState.players.forEach((player) => {
    player.revealedRole = state.roles[player.seatId];
  });
  state.publicState.timer = makeTimer("finished", state.publicState.day, 0);
  events.push(winner === "good" ? "好人阵营获胜。" : "狼人阵营获胜。");
  return true;
}

function refreshPrivateStates(state: WerewolfModeratorState) {
  const wolfVictim = resolveWolfVictim(state);
  for (const player of state.publicState.players) {
    const privateState = state.privateState[player.seatId]!;
    privateState.nightVictimSeatId =
      privateState.role === "witch" && state.publicState.phase === "night-witch"
        ? wolfVictim
        : undefined;
    privateState.wolfVoteSummary =
      privateState.role === "werewolf"
        ? tallyPrivateTargets(state.wolfVotes)
        : {};
    privateState.canAct = canPrivateRoleAct(state, player.seatId);
    privateState.actionSubmitted = hasSubmittedCurrentAction(state, player.seatId);
  }
}

function canPrivateRoleAct(state: WerewolfModeratorState, seatId: string): boolean {
  const player = requirePlayerBySeat(state, seatId);
  if (!player.alive) return false;
  const role = state.roles[seatId];
  if (state.publicState.phase === "role-reveal") return true;
  if (state.publicState.phase === "night-wolves") return role === "werewolf";
  if (state.publicState.phase === "night-seer") return role === "seer";
  if (state.publicState.phase === "night-witch") return role === "witch";
  if (state.publicState.phase === "hunter-shot") return state.pendingHunterShots[0] === seatId;
  if (state.publicState.phase === "badge-transfer") return state.publicState.sheriffSeatId === seatId;
  return false;
}

function hasSubmittedCurrentAction(state: WerewolfModeratorState, seatId: string): boolean {
  if (state.publicState.phase === "role-reveal") return state.confirmedSeatIds.includes(seatId);
  if (state.publicState.phase === "night-wolves") return seatId in state.wolfVotes;
  if (state.publicState.phase === "night-seer") return Boolean(state.seerTargetSeatId);
  if (state.publicState.phase === "night-witch") return Boolean(state.witchAction);
  if (state.publicState.phase === "sheriff-signup") return seatId in state.sheriffSignup;
  if (
    state.publicState.phase === "sheriff-vote" ||
    state.publicState.phase === "sheriff-runoff-vote"
  ) {
    return seatId in state.sheriffVotes;
  }
  if (
    state.publicState.phase === "exile-vote" ||
    state.publicState.phase === "exile-runoff-vote"
  ) {
    return seatId in state.exileVotes;
  }
  return false;
}

function makePrivateState(
  seatId: string,
  role: WerewolfRole,
  roles: Record<string, WerewolfRole>
): WerewolfPrivateState {
  return {
    seatId,
    role,
    wolfTeammateSeatIds:
      role === "werewolf"
        ? Object.entries(roles)
            .filter(([otherSeatId, otherRole]) => otherRole === "werewolf" && otherSeatId !== seatId)
            .map(([otherSeatId]) => otherSeatId)
        : [],
    wolfVoteSummary: {},
    seerChecks: [],
    witchAntidoteAvailable: role === "witch",
    witchPoisonAvailable: role === "witch",
    canAct: true,
    actionSubmitted: false,
  };
}

function tallyPrivateTargets(votes: Record<string, string | undefined>) {
  const summary: Record<string, number> = {};
  for (const targetSeatId of Object.values(votes)) {
    if (!targetSeatId) continue;
    summary[targetSeatId] = (summary[targetSeatId] ?? 0) + 1;
  }
  return summary;
}

function finalize(state: WerewolfModeratorState, events: string[]): WerewolfActionResult {
  refreshPrivateStates(state);
  if (events.length) state.publicState.logs.push(...events);
  state.publicState.logs = state.publicState.logs.slice(-100);
  return { state, events };
}

function setSheriff(state: WerewolfModeratorState, seatId?: string) {
  state.publicState.sheriffSeatId = seatId;
  for (const player of state.publicState.players) {
    player.isSheriff = player.seatId === seatId;
    player.sheriffCandidate = false;
  }
}

function tallyVotes(
  votes: Record<string, string | undefined>,
  candidateSeatIds: string[],
  sheriffSeatId?: string
) {
  const allowed = new Set(candidateSeatIds);
  const summary: Record<string, number> = {};
  for (const [voterSeatId, targetSeatId] of Object.entries(votes)) {
    if (!targetSeatId || !allowed.has(targetSeatId)) continue;
    summary[targetSeatId] = (summary[targetSeatId] ?? 0) + (voterSeatId === sheriffSeatId ? 1.5 : 1);
  }
  const max = Math.max(0, ...Object.values(summary));
  return {
    summary,
    winners: max > 0
      ? candidateSeatIds.filter((seatId) => summary[seatId] === max)
      : [],
  };
}

function sheriffCandidates(state: WerewolfModeratorState): string[] {
  return state.publicState.runoffCandidates.length
    ? state.publicState.runoffCandidates
    : state.publicState.players
        .filter((player) => player.sheriffCandidate && player.alive)
        .map((player) => player.seatId);
}

function sheriffVoterSeatIds(state: WerewolfModeratorState): string[] {
  const candidates = new Set(sheriffCandidates(state));
  return alivePlayers(state)
    .filter((player) => !candidates.has(player.seatId))
    .map((player) => player.seatId);
}

function exileVoterSeatIds(state: WerewolfModeratorState): string[] {
  const runoffCandidates = new Set(
    state.publicState.phase === "exile-runoff-vote" ? state.publicState.runoffCandidates : []
  );
  return alivePlayers(state)
    .filter((player) => !runoffCandidates.has(player.seatId))
    .map((player) => player.seatId);
}

function phaseDuration(settings: WerewolfTimerSettings, phase: WerewolfPhase): number {
  if (phase === "role-reveal") return settings.roleRevealSeconds;
  if (phase.startsWith("night-") || phase === "hunter-shot" || phase === "badge-transfer") {
    return settings.nightActionSeconds;
  }
  if (phase === "sheriff-signup") return settings.sheriffSignupSeconds;
  if (isSpeechPhase(phase)) return settings.speechSeconds;
  if (phase === "last-words") return settings.lastWordsSeconds;
  if (phase.includes("vote")) return settings.voteSeconds;
  return 8;
}

function makeTimer(phase: WerewolfPhase, day: number, durationSeconds: number): WerewolfPhaseTimer {
  return {
    scopeId: `ww-${day}-${phase}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    durationSeconds,
  };
}

function allAliveRolesSubmitted(
  state: WerewolfModeratorState,
  role: WerewolfRole,
  map: Record<string, unknown>
): boolean {
  return aliveRoleSeatIds(state, role).every((seatId) => seatId in map);
}

function allAlivePlayersSubmitted(
  state: WerewolfModeratorState,
  map: Record<string, unknown>
): boolean {
  return alivePlayers(state).every((player) => player.seatId in map);
}

function allSeatIdsSubmitted(seatIds: string[], map: Record<string, unknown>): boolean {
  return seatIds.every((seatId) => seatId in map);
}

function aliveRoleSeatIds(state: WerewolfModeratorState, role: WerewolfRole): string[] {
  return alivePlayers(state)
    .filter((player) => state.roles[player.seatId] === role)
    .map((player) => player.seatId);
}

function alivePlayers(state: WerewolfModeratorState): WerewolfPublicPlayer[] {
  return state.publicState.players.filter((player) => player.alive);
}

function aliveSeat(state: WerewolfModeratorState, seatId: string): boolean {
  return Boolean(state.publicState.players.find((player) => player.seatId === seatId)?.alive);
}

function currentSpeakerSeatId(state: WerewolfModeratorState): string | undefined {
  return state.publicState.speechOrder[state.publicState.currentSpeakerIndex];
}

function isSpeechPhase(phase: WerewolfPhase): boolean {
  return (
    phase === "sheriff-speech" ||
    phase === "sheriff-runoff-speech" ||
    phase === "day-speech" ||
    phase === "exile-runoff-speech" ||
    phase === "last-words"
  );
}

function requirePhase(state: WerewolfModeratorState, phase: WerewolfPhase) {
  if (state.publicState.phase !== phase) throw new Error(`当前不是${phase}阶段。`);
}

function requireRole(state: WerewolfModeratorState, seatId: string, role: WerewolfRole) {
  if (state.roles[seatId] !== role) throw new Error("你的身份不能执行该操作。");
  requireAlive(requirePlayerBySeat(state, seatId));
}

function requireAlive(player: WerewolfPublicPlayer) {
  if (!player.alive) throw new Error("出局玩家不能执行该操作。");
}

function validateAliveTarget(
  state: WerewolfModeratorState,
  seatId: string | undefined,
  forbiddenSeatId?: string
) {
  if (!seatId) throw new Error("请选择目标。");
  const target = requirePlayerBySeat(state, seatId);
  if (!target.alive) throw new Error("目标已经出局。");
  if (forbiddenSeatId && seatId === forbiddenSeatId) throw new Error("不能选择自己。");
}

function validateVoteTarget(
  state: WerewolfModeratorState,
  targetSeatId: string | undefined,
  allowedSeatIds: string[]
) {
  if (targetSeatId === undefined) return;
  if (!allowedSeatIds.includes(targetSeatId) || !aliveSeat(state, targetSeatId)) {
    throw new Error("投票目标无效。");
  }
}

function requirePlayerById(
  state: WerewolfModeratorState,
  playerId: string
): WerewolfPublicPlayer {
  const player = state.publicState.players.find((item) => item.playerId === playerId);
  if (!player) throw new Error("玩家不在当前狼人杀对局中。");
  return player;
}

function requirePlayerBySeat(
  state: WerewolfModeratorState,
  seatId: string
): WerewolfPublicPlayer {
  const player = state.publicState.players.find((item) => item.seatId === seatId);
  if (!player) throw new Error("找不到狼人杀座位。");
  return player;
}

function playerName(state: WerewolfModeratorState, seatId: string): string {
  return requirePlayerBySeat(state, seatId).playerName;
}

function addUnique(items: string[], value: string) {
  if (!items.includes(value)) items.push(value);
}

function rotate<T>(items: T[], startIndex: number): T[] {
  if (!items.length) return [];
  const index = ((startIndex % items.length) + items.length) % items.length;
  return [...items.slice(index), ...items.slice(0, index)];
}

function shuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function seededRandom(seed: string): () => number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
