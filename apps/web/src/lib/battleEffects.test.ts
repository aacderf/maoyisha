import { describe, expect, it } from "vitest";
import { battleEffectVariantForCard, deriveBattleEffects, type BattleEffectSnapshot } from "./battleEffects.js";

function snapshot(patch: Partial<BattleEffectSnapshot> = {}): BattleEffectSnapshot {
  return {
    id: "game-1",
    phase: "play",
    turn: 2,
    seats: [
      { seatId: "a", hp: 4, alive: true },
      { seatId: "b", hp: 3, alive: true },
    ],
    ...patch,
  };
}

describe("deriveBattleEffects", () => {
  it("does not emit effects on first render or game replacement", () => {
    expect(deriveBattleEffects(undefined, snapshot())).toEqual([]);
    expect(deriveBattleEffects(snapshot({ id: "old" }), snapshot())).toEqual([]);
  });

  it("emits one phase transition when phase or turn changes", () => {
    const effects = deriveBattleEffects(snapshot({ phase: "draw", turn: 1 }), snapshot());
    expect(effects).toEqual([
      expect.objectContaining({ type: "phase", phase: "play", turn: 2, variant: "phase" }),
    ]);
  });

  it("emits a card flight only when the sequence changes", () => {
    const previous = snapshot({ lastCardVoice: { cardKey: "shan", seatId: "b", seq: 3 } });
    const current = snapshot({ lastCardVoice: { cardKey: "sha", seatId: "a", seq: 4 } });
    expect(deriveBattleEffects(previous, current)).toEqual([
      expect.objectContaining({ type: "card", seatId: "a", cardKey: "sha", variant: "slash" }),
    ]);
    expect(deriveBattleEffects(current, current)).toEqual([]);
  });

  it("emits active skill feedback only when the skill sequence changes", () => {
    const previous = snapshot({ lastSkillVoice: { seq: 1, seatId: "a", skillId: "old", skillName: "旧技能", variant: "trick" } });
    const current = snapshot({ lastSkillVoice: { seq: 2, seatId: "b", skillId: "zhangba-sha", skillName: "丈八蛇矛", variant: "slash", targetSeatId: "a" } });

    expect(deriveBattleEffects(previous, current)).toEqual([
      expect.objectContaining({
        type: "skill",
        seatId: "b",
        skillId: "zhangba-sha",
        skillName: "丈八蛇矛",
        variant: "slash",
        targetSeatId: "a",
      }),
    ]);
    expect(deriveBattleEffects(current, current)).toEqual([]);
  });

  it("emits damage and healing with the exact HP delta", () => {
    const previous = snapshot();
    const current = snapshot({
      lastCardVoice: { cardKey: "fire_sha", seatId: "b", seq: 8 },
      seats: [
        { seatId: "a", hp: 2, alive: true },
        { seatId: "b", hp: 4, alive: true },
      ],
    });
    expect(deriveBattleEffects(previous, current)).toEqual([
      expect.objectContaining({ type: "card", seatId: "b", cardKey: "fire_sha", variant: "fire" }),
      expect.objectContaining({ type: "damage", seatId: "a", amount: 2, variant: "fire" }),
      expect.objectContaining({ type: "heal", seatId: "b", amount: 1, variant: "heal" }),
    ]);
  });

  it("emits a local defeat marker without changing game state", () => {
    const current = snapshot({
      seats: [
        { seatId: "a", hp: 4, alive: true },
        { seatId: "b", hp: 0, alive: false },
      ],
    });
    expect(deriveBattleEffects(snapshot(), current)).toEqual([
      expect.objectContaining({ type: "damage", seatId: "b", amount: 3 }),
      expect.objectContaining({ type: "defeat", seatId: "b", variant: "defeat" }),
    ]);
  });

  it("emits poison feedback only when the 试管 mark is newly attached", () => {
    const previous = snapshot();
    const current = snapshot({
      seats: [
        { seatId: "a", hp: 4, alive: true },
        {
          seatId: "b",
          hp: 3,
          alive: true,
          skillState: { cjjPoisonSourceSeatId: "a" },
        },
      ],
    });

    expect(deriveBattleEffects(previous, current)).toEqual([
      expect.objectContaining({ type: "status", seatId: "b", status: "poison", variant: "poison" }),
    ]);
    expect(deriveBattleEffects(current, current)).toEqual([]);
  });

  it("marks all feedback as reduced when motion is reduced", () => {
    const effects = deriveBattleEffects(
      snapshot(),
      snapshot({ phase: "discard", seats: [{ seatId: "a", hp: 3, alive: true }] }),
      { reducedMotion: true }
    );
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => effect.motion === "reduced")).toBe(true);
  });

  it("does not emit visual effects when intensity is off", () => {
    const effects = deriveBattleEffects(
      snapshot(),
      snapshot({ lastCardVoice: { cardKey: "sha", seatId: "a", seq: 9 }, seats: [{ seatId: "a", hp: 2, alive: true }] }),
      { effectIntensity: "off" }
    );
    expect(effects).toEqual([]);
  });

  it("maps card keys to premium visual variants", () => {
    expect(battleEffectVariantForCard("sha")).toBe("slash");
    expect(battleEffectVariantForCard("fire_sha")).toBe("fire");
    expect(battleEffectVariantForCard("thunder_sha")).toBe("thunder");
    expect(battleEffectVariantForCard("tao")).toBe("heal");
    expect(battleEffectVariantForCard("jiu")).toBe("buff");
    expect(battleEffectVariantForCard("wuxie")).toBe("negate");
    expect(battleEffectVariantForCard("juedou")).toBe("trick");
  });
});
