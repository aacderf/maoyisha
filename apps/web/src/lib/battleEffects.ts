import type { GamePhase, GameState } from "@cardgame/shared";

type EffectSeat = Pick<GameState["seats"][number], "seatId" | "hp" | "alive"> & {
  skillState?: GameState["seats"][number]["skillState"];
};

export type BattleEffectSnapshot = Pick<GameState, "id" | "phase" | "turn" | "lastCardVoice" | "lastSkillVoice"> & {
  seats: EffectSeat[];
};

type BattleEffectBase = {
  id: string;
  motion: "standard" | "reduced";
  variant: BattleEffectVariant;
};

export type BattleEffectVariant =
  | "slash"
  | "fire"
  | "thunder"
  | "heal"
  | "buff"
  | "trick"
  | "negate"
  | "phase"
  | "defeat"
  | "poison";

export type BattleEffect =
  | (BattleEffectBase & {
      type: "card";
      seatId: string;
      cardKey: string;
      cardName: string;
    })
  | (BattleEffectBase & {
      type: "skill";
      seatId: string;
      skillId: string;
      skillName: string;
      targetSeatId?: string;
      targetSeatIds?: string[];
    })
  | (BattleEffectBase & {
      type: "damage" | "heal";
      seatId: string;
      amount: number;
      label?: string;
    })
  | (BattleEffectBase & {
      type: "phase";
      phase: GamePhase;
      turn: number;
      label: string;
    })
  | (BattleEffectBase & {
      type: "defeat";
      seatId: string;
    })
  | (BattleEffectBase & {
      type: "status";
      seatId: string;
      status: "poison";
    });

export function deriveBattleEffects(
  previous: BattleEffectSnapshot | undefined,
  current: BattleEffectSnapshot,
  options: { reducedMotion?: boolean; effectIntensity?: "off" | "low" | "normal" | "high" } = {}
): BattleEffect[] {
  if (!previous || previous.id !== current.id) return [];
  if (options.effectIntensity === "off") return [];

  const motion = options.reducedMotion ? "reduced" : "standard";
  const effects: BattleEffect[] = [];
  const latestCardVariant = current.lastCardVoice
    ? battleEffectVariantForCard(current.lastCardVoice.cardKey)
    : undefined;

  if (previous.phase !== current.phase || previous.turn !== current.turn) {
    effects.push({
      id: `${current.id}:phase:${current.turn}:${current.phase}`,
      type: "phase",
      phase: current.phase,
      turn: current.turn,
      label: phaseEffectLabel(current.phase),
      motion,
      variant: "phase",
    });
  }

  if (current.lastCardVoice && current.lastCardVoice.seq !== previous.lastCardVoice?.seq) {
    effects.push({
      id: `${current.id}:card:${current.lastCardVoice.seq}`,
      type: "card",
      seatId: current.lastCardVoice.seatId,
      cardKey: current.lastCardVoice.cardKey,
      cardName: cardEffectName(current.lastCardVoice.cardKey),
      motion,
      variant: battleEffectVariantForCard(current.lastCardVoice.cardKey),
    });
  }

  if (current.lastSkillVoice && current.lastSkillVoice.seq !== previous.lastSkillVoice?.seq) {
    effects.push({
      id: `${current.id}:skill:${current.lastSkillVoice.seq}`,
      type: "skill",
      seatId: current.lastSkillVoice.seatId,
      skillId: current.lastSkillVoice.skillId,
      skillName: current.lastSkillVoice.skillName ?? current.lastSkillVoice.skillId,
      targetSeatId: current.lastSkillVoice.targetSeatId,
      targetSeatIds: current.lastSkillVoice.targetSeatIds,
      motion,
      variant: current.lastSkillVoice.variant,
    });
  }

  for (const seat of current.seats) {
    const oldSeat = previous.seats.find((item) => item.seatId === seat.seatId);
    if (!oldSeat) continue;

    if (seat.hp < oldSeat.hp) {
      effects.push({
        id: `${current.id}:damage:${seat.seatId}:${current.turn}:${seat.hp}`,
        type: "damage",
        seatId: seat.seatId,
        amount: oldSeat.hp - seat.hp,
        motion,
        variant: damageVariantFromCard(latestCardVariant),
      });
    } else if (seat.hp > oldSeat.hp) {
      effects.push({
        id: `${current.id}:heal:${seat.seatId}:${current.turn}:${seat.hp}`,
        type: "heal",
        seatId: seat.seatId,
        amount: seat.hp - oldSeat.hp,
        motion,
        variant: "heal",
      });
    }

    if (oldSeat.alive && !seat.alive) {
      effects.push({
        id: `${current.id}:defeat:${seat.seatId}`,
        type: "defeat",
        seatId: seat.seatId,
        motion,
        variant: "defeat",
      });
    }

    const hadPoison = typeof oldSeat.skillState?.cjjPoisonSourceSeatId === "string";
    const hasPoison = typeof seat.skillState?.cjjPoisonSourceSeatId === "string";
    if (!hadPoison && hasPoison) {
      effects.push({
        id: `${current.id}:status:poison:${seat.seatId}:${current.turn}`,
        type: "status",
        seatId: seat.seatId,
        status: "poison",
        motion,
        variant: "poison",
      });
    }
  }

  return effects;
}

export function battleEffectVariantForCard(cardKey: string): BattleEffectVariant {
  if (cardKey === "sha") return "slash";
  if (cardKey === "fire_sha" || cardKey === "huogong") return "fire";
  if (cardKey === "thunder_sha" || cardKey === "shandian") return "thunder";
  if (cardKey === "tao" || cardKey === "taoyuan") return "heal";
  if (cardKey === "jiu" || cardKey === "wugu") return "buff";
  if (cardKey === "wuxie" || cardKey === "shan") return "negate";
  return "trick";
}

function damageVariantFromCard(variant: BattleEffectVariant | undefined): BattleEffectVariant {
  if (variant === "fire" || variant === "thunder" || variant === "trick" || variant === "negate") return variant;
  return "slash";
}

function cardEffectName(cardKey: string): string {
  const names: Record<string, string> = {
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
  return names[cardKey] ?? cardKey;
}

function phaseEffectLabel(phase: GamePhase): string {
  const labels: Record<GamePhase, string> = {
    opening: "开局",
    prepare: "准备阶段",
    judge: "判定阶段",
    draw: "摸牌阶段",
    play: "出牌阶段",
    discard: "弃牌阶段",
    finish: "结束阶段",
    response: "响应阶段",
    dying: "濒死结算",
    finished: "对局结束",
  };
  return labels[phase];
}
