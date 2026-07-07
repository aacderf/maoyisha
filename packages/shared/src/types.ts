export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export type CharacterStatus = "draft" | "pending_review" | "approved" | "rejected";
export type CharacterFaction = "wei" | "shu" | "wu" | "qun" | "custom";
export type SkillTemplateType =
  | "draw_bonus_on_turn_start"
  | "max_hp_bonus"
  | "heal_once_when_low";

export interface SkillTemplate {
  id: string;
  name: string;
  type: SkillTemplateType;
  description: string;
  params: Record<string, number | string | boolean>;
}

export interface CharacterDefinition {
  id: string;
  ownerId: string;
  name: string;
  faction: CharacterFaction;
  gender: string;
  maxHp: number;
  tags: string[];
  artUrl?: string;
  artPath?: string;
  description: string;
  skills: SkillTemplate[];
  skillText?: string;
  status: CharacterStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type CardSuit = "spade" | "heart" | "club" | "diamond";
export type CardKey =
  | "sha"
  | "fire_sha"
  | "thunder_sha"
  | "shan"
  | "tao"
  | "jiu"
  | "wuzhong"
  | "guohe"
  | "shunshou"
  | "juedou"
  | "jiedao"
  | "nanman"
  | "wanjian"
  | "taoyuan"
  | "wugu"
  | "wuxie"
  | "lebu"
  | "shandian"
  | "huogong"
  | "tiesuo"
  | "bingliang"
  | "weapon"
  | "armor"
  | "attack_horse"
  | "defense_horse";
export type CardCategory = "basic" | "trick" | "equip";
export type CardResponseType = "sha" | "shan" | "tao" | "wuxie";
export type CardType = CardKey;
export type DamageNature = "normal" | "fire" | "thunder";
export type EquipmentSlot = "weapon" | "armor" | "attackHorse" | "defenseHorse";
export type EquipmentKey =
  | "zhuge"
  | "qinggang"
  | "hanbing"
  | "guding"
  | "zhuque"
  | "cixiong"
  | "qinglong"
  | "zhangba"
  | "guanshi"
  | "fangtian"
  | "qilin"
  | "bagua"
  | "renwang"
  | "tengjia"
  | "baiyin"
  | "dilu"
  | "jueying"
  | "zhuahuang"
  | "chitu"
  | "dayuan"
  | "zixing";
export type DelayedTrickType = "lebu" | "shandian" | "bingliang";
export type CardArea = "hand" | "equipment" | "judge" | "public";
export type GameMode = "free" | "team2v2" | "identity";
export type IdentityRole = "lord" | "loyalist" | "rebel" | "renegade";
export type TeamId = "warm" | "cold";

export interface GameCard {
  id: string;
  name: string;
  type: CardType;
  cardKey: CardKey;
  category: CardCategory;
  suit: CardSuit;
  rank: number;
  requiresTarget?: boolean;
  responseType?: CardResponseType;
  damage?: number;
  damageNature?: DamageNature;
  equipmentSlot?: EquipmentSlot;
  equipmentKey?: EquipmentKey;
  range?: number;
  delayedTrickType?: DelayedTrickType;
  distanceLimit?: number;
}

export interface PlayerIdentity {
  id: string;
  uid?: string;
  email?: string;
  name: string;
  avatarUrl?: string;
  role?: "admin" | "player";
}

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  defaultAvatarKey: string;
  role: "admin" | "player";
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
}

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
  fromUser?: UserProfile;
  toUser?: UserProfile;
}

export interface FriendProfile extends UserProfile {
  online: boolean;
}

export type GameInviteStatus = "pending" | "accepted" | "rejected" | "expired";

export interface GameInvite {
  id: string;
  roomId: string;
  fromUserId: string;
  toUserId: string;
  status: GameInviteStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  fromUser?: UserProfile;
}

export interface SeatState {
  seatId: string;
  playerId: string;
  playerName: string;
  ready: boolean;
  connected: boolean;
  character: CharacterDefinition;
  hp: number;
  maxHp: number;
  hand: GameCard[];
  discardPile: GameCard[];
  equipment: Partial<Record<EquipmentSlot, GameCard>>;
  judgementArea: GameCard[];
  chained: boolean;
  skipPlayPhase: boolean;
  skipDrawPhase: boolean;
  alive: boolean;
  identityRole?: IdentityRole;
  identityRevealed?: boolean;
  teamId?: TeamId;
  skillState?: Record<string, number | string | boolean | GameCard[] | undefined>;
}

export type GamePhase =
  | "opening"
  | "prepare"
  | "judge"
  | "draw"
  | "play"
  | "discard"
  | "finish"
  | "response"
  | "dying"
  | "finished";

export interface ActiveTurnState {
  playerId: string;
  shaUsed: boolean;
  jiuUsed: boolean;
  jiuDamageBonus: number;
  firstShaPlayed: boolean;
}

export interface GameTimerSettings {
  turnSeconds: number;
  responseSeconds: number;
}

export interface GameActionTimer {
  kind: "turn" | "discard" | "response";
  seatId: string;
  startedAt: number;
  durationSeconds: number;
  scopeId: string;
}

export type PendingEffect =
  | {
      kind: "damage";
      sourceSeatId: string;
      targetSeatId: string;
      amount: number;
      cardName: string;
      nature?: DamageNature;
      sourceCardKey?: CardKey;
      sourceSuit?: CardSuit;
      ignoreArmor?: boolean;
      skipKgMercy?: boolean;
      skipHanbingChoice?: boolean;
      skipBaguaChoice?: boolean;
      skipShenBossPrevent?: boolean;
    }
  | {
      kind: "draw";
      sourceSeatId: string;
      amount: number;
      cardName: string;
    }
  | {
      kind: "discard-random";
      sourceSeatId: string;
      targetSeatId: string;
      cardName: string;
    }
  | {
      kind: "steal-random";
      sourceSeatId: string;
      targetSeatId: string;
      cardName: string;
    }
  | {
      kind: "target-card";
      sourceSeatId: string;
      targetSeatId: string;
      action: "discard" | "steal";
      cardName: string;
    }
  | {
      kind: "heal-all";
      sourceSeatId: string;
      amount: number;
      cardName: string;
    }
  | {
      kind: "aoe";
      sourceSeatId: string;
      responseType: "sha" | "shan";
      queue: string[];
      amount: number;
      cardName: string;
      nature?: DamageNature;
      sourceCardKey?: CardKey;
      sourceSuit?: CardSuit;
      ignoreArmor?: boolean;
    }
  | {
      kind: "duel";
      sourceSeatId: string;
      targetSeatId: string;
      responderSeatId: string;
      cardName: string;
    }
  | {
      kind: "wugu";
      sourceSeatId: string;
      queue: string[];
      cardName: string;
    }
  | {
      kind: "jiedao";
      sourceSeatId: string;
      weaponSeatId: string;
      targetSeatId?: string;
      cardName: string;
    }
  | {
      kind: "huogong";
      sourceSeatId: string;
      targetSeatId: string;
      cardName: string;
      revealedCardId?: string;
      requiredSuit?: CardSuit;
    }
  | {
      kind: "chain";
      sourceSeatId: string;
      targetSeatIds: string[];
      cardName: string;
    }
  | {
      kind: "delayed";
      sourceSeatId: string;
      targetSeatId: string;
      cardName: string;
      delayedTrickType: DelayedTrickType;
      cardId: string;
    }
  | {
      kind: "dying";
      targetSeatId: string;
      cardName: string;
    }
  | {
      kind: "opening-identity";
      targetSeatId: string;
      cardName: string;
    };

export type ChoiceCardOption = {
  id: string;
  cardId: string;
  cardName: string;
  area: CardArea;
  ownerSeatId?: string;
  slot?: EquipmentSlot;
};

export interface PendingChoice {
  id: string;
  kind:
    | "target-card"
    | "public-card"
    | "target-seat"
    | "multi-target-seat"
    | "multi-card"
    | "discard-suit"
    | "opening-identity"
    | "sha-transfer"
    | "huogong-reveal"
    | "skill-target"
    | "skill-option"
    | "skill-confirm";
  chooserSeatId: string;
  sourceSeatId: string;
  cardName: string;
  effect: PendingEffect;
  prompt: string;
  choices: ChoiceCardOption[];
  targetSeatIds?: string[];
  selectedTargetSeatIds?: string[];
  minTargets?: number;
  maxTargets?: number;
  requiredSuit?: CardSuit;
  queue?: string[];
}

export interface PendingResponse {
  id: string;
  responseType: CardResponseType;
  responderSeatId: string;
  sourceSeatId: string;
  cardName: string;
  prompt: string;
  effect: PendingEffect;
  queue?: string[];
  mode?: "single" | "global";
  eligibleResponderSeatIds?: string[];
  passedSeatIds?: string[];
  wuxieDepth?: number;
}

export interface PendingDying {
  seatId: string;
  queue: string[];
  sourceSeatId?: string;
  resume?: PendingResponse;
}

export interface GameState {
  id: string;
  roomId: string;
  seats: SeatState[];
  deck: GameCard[];
  discardPile: GameCard[];
  currentSeatIndex: number;
  phase: GamePhase;
  turn: number;
  logs: string[];
  activeTurn: ActiveTurnState;
  pendingResponse?: PendingResponse;
  pendingChoice?: PendingChoice;
  pendingDying?: PendingDying;
  usedShaThisTurn: boolean;
  revealedCards: GameCard[];
  publicCards: GameCard[];
  timerSettings: GameTimerSettings;
  gameMode: GameMode;
  winnerRole?: IdentityRole | "lordSide";
  winnerTeam?: TeamId;
  lastCardVoice?: {
    cardId?: string;
    cardKey: CardKey;
    cardName?: string;
    seatId: string;
    targetSeatId?: string;
    targetSeatIds?: string[];
    seq: number;
  };
  lastSkillVoice?: {
    seq: number;
    seatId: string;
    skillId: string;
    skillName?: string;
    variant: "slash" | "fire" | "thunder" | "heal" | "buff" | "trick" | "negate" | "phase" | "defeat" | "poison";
    targetSeatId?: string;
    targetSeatIds?: string[];
  };
  actionTimer?: GameActionTimer;
  winnerSeatId?: string;
}

export type GameAction =
  | {
      type: "PLAY_CARD";
      playerId: string;
      cardId: string;
      targetSeatId?: string;
      targetSeatIds?: string[];
    }
  | {
      type: "DISCARD_CARD";
      playerId: string;
      cardId: string;
    }
  | {
      type: "CHOOSE_CARD";
      playerId: string;
      cardId: string;
      choiceId?: string;
    }
  | {
      type: "CHOOSE_TARGET";
      playerId: string;
      targetSeatId: string;
    }
  | {
      type: "CHOOSE_TARGETS";
      playerId: string;
      targetSeatIds: string[];
    }
  | {
      type: "CHOOSE_CARDS";
      playerId: string;
      cardIds: string[];
    }
  | {
      type: "PASS_CHOICE";
      playerId: string;
    }
  | {
      type: "CHOOSE_OPENING_IDENTITY";
      playerId: string;
      reveal: boolean;
    }
  | {
      type: "END_PHASE";
      playerId: string;
    }
  | {
      type: "END_TURN";
      playerId: string;
    }
  | {
      type: "RESPOND_CARD";
      playerId: string;
      cardId: string;
    }
  | {
      type: "PASS_RESPONSE";
      playerId: string;
    }
  | {
      type: "USE_SKILL";
      playerId: string;
      skillId: string;
      targetSeatId?: string;
      cardIds?: string[];
    }
  | {
      type: "AUTO_TIMEOUT";
      playerId: string;
      scopeId?: string;
    };

export interface GameActionResult {
  state: GameState;
  events: string[];
}

export interface RoomSeat {
  seatId: string;
  playerId: string;
  playerName: string;
  ready: boolean;
  connected: boolean;
  characterId?: string;
}

export interface RoomSnapshot {
  id: string;
  name: string;
  hostPlayerId: string;
  maxPlayers: number;
  seats: RoomSeat[];
  status: "waiting" | "playing" | "finished";
  gameKind?: "card" | "werewolf";
  game?: GameState;
  werewolfPublic?: import("./werewolf.js").WerewolfPublicState;
}
