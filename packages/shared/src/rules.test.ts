import { describe, expect, it } from "vitest";
import { getApprovedCharacters } from "./characters.js";
import { applyGameAction, createGame, getCurrentSeat, getGameCardCatalog, getHandLimit } from "./rules.js";
import type { CardKey, GameCard, GameState } from "./types.js";

function makeGame(playerCount = 2, autoPlay = true, characterIds: string[] = []): GameState {
  const state = createGame({
    roomId: `test-${playerCount}-${characterIds.join("-")}`,
    seed: "fixed",
    gameMode: "free",
    players: Array.from({ length: playerCount }, (_, index) => ({
      playerId: `p${index + 1}`,
      playerName: `player-${index + 1}`,
      characterId: characterIds[index],
    })),
  });
  return autoPlay ? advanceToPhase(state, "play") : state;
}

function advanceToPhase(state: GameState, phase: GameState["phase"]): GameState {
  let next = state;
  let guard = 0;
  while (next.phase !== phase && next.phase !== "finished" && guard < 16) {
    const current = getCurrentSeat(next);
    next = applyGameAction(next, { type: "END_PHASE", playerId: current.playerId }).state;
    guard += 1;
  }
  return next;
}

function setHands(state: GameState, hands: CardKey[][]): GameState {
  hands.forEach((cards, index) => {
    const seat = state.seats[index]!;
    seat.hand = cards.map((key, cardIndex) => card(`${seat.seatId}-${cardIndex}`, key));
  });
  return state;
}

function card(id: string, key: CardKey, suit: GameCard["suit"] = "spade", rank = 1): GameCard {
  const base = getGameCardCatalog().find((item) => item.cardKey === key);
  if (!base) throw new Error(`missing card ${key}`);
  return { ...base, id, suit, rank };
}

function passGlobalResponses(state: GameState): GameState {
  let next = state;
  let guard = 0;
  while (next.pendingResponse?.mode === "global" && guard < 16) {
    const pending = next.pendingResponse;
    const nextResponderSeatId =
      pending.responderSeatId ??
      pending.eligibleResponderSeatIds?.find((seatId) => !pending.passedSeatIds?.includes(seatId));
    const responder = next.seats.find((seat) => seat.seatId === nextResponderSeatId);
    if (!responder) break;
    next = applyGameAction(next, { type: "PASS_RESPONSE", playerId: responder.playerId }).state;
    guard += 1;
  }
  return next;
}

describe("Maoyi Sha rules", () => {
  it("auto resolves prepare, judge, and draw before player action", () => {
    const state = makeGame(2, false);

    expect(state.phase).toBe("play");
    expect(getCurrentSeat(state).playerId).toBe("p1");
    expect(state.seats[0]!.hand.length).toBeGreaterThanOrEqual(6);
  });

  it("assigns identity roles for 5-player games", () => {
    const state = createGame({
      roomId: "identity-test",
      seed: "identity-fixed",
      gameMode: "identity",
      players: Array.from({ length: 5 }, (_, index) => ({
        playerId: `p${index + 1}`,
        playerName: `player-${index + 1}`,
      })),
    });
    const roles = state.seats.map((seat) => seat.identityRole).sort();

    expect(state.gameMode).toBe("identity");
    expect(roles).toEqual(["lord", "loyalist", "rebel", "rebel", "renegade"].sort());
    expect(state.seats.filter((seat) => seat.identityRevealed)).toHaveLength(1);
  });

  it("records card voice target data for flight effects", () => {
    let state = setHands(makeGame(3), [["sha"], ["shan"], ["shan"]]);
    const cardId = state.seats[0]!.hand[0]!.id;

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId,
      targetSeatId: "seat-2",
    }).state;

    expect(state.lastCardVoice).toMatchObject({
      cardId,
      cardKey: "sha",
      cardName: "杀",
      seatId: "seat-1",
      targetSeatId: "seat-2",
    });
  });

  it("rejects actions from non-current players", () => {
    const state = setHands(makeGame(), [["sha"], ["shan"]]);

    expect(() =>
      applyGameAction(state, {
        type: "PLAY_CARD",
        playerId: "p2",
        cardId: state.seats[1]!.hand[0]!.id,
        targetSeatId: "seat-1",
      })
    ).toThrow("还没轮到你行动");
  });

  it("resolves sha and shan response", () => {
    let state = setHands(makeGame(), [["sha"], ["shan"]]);

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    expect(state.pendingResponse?.responseType).toBe("shan");

    state = applyGameAction(state, {
      type: "RESPOND_CARD",
      playerId: "p2",
      cardId: state.seats[1]!.hand[0]!.id,
    }).state;
    expect(state.phase).toBe("play");
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp);
  });

  it("deals damage when sha is not dodged", () => {
    let state = setHands(makeGame(), [["sha"], []]);

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);
  });

  it("prompts Sanshui kg mercy before preventing damage", () => {
    let state = setHands(makeGame(2, false, ["builtin-sanshui-xiansheng"]), [["sha"], ["shan", "tao"]]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.pendingResponse = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, kgSourceSeatId: "seat-1" };

    const targetHp = state.seats[1]!.hp;
    const targetHandCount = state.seats[1]!.hand.length;

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.pendingChoice?.kind).toBe("skill-confirm");
    expect(state.pendingChoice?.cardName).toBe("sanshui-kg-mercy");
    expect(state.seats[1]!.hp).toBe(targetHp);

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "sanshui-kg-mercy" }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.lastSkillVoice).toMatchObject({
      seatId: "seat-1",
      skillId: "sanshui-kg-mercy",
      skillName: "kg 的怜悯",
      variant: "heal",
    });
    expect(state.seats[1]!.hp).toBe(targetHp);
    expect(state.seats[1]!.hand.length).toBe(targetHandCount - 1);
  });

  it("lets Sanshui pass kg mercy and apply damage once", () => {
    let state = setHands(makeGame(2, false, ["builtin-sanshui-xiansheng"]), [["sha"], ["shan"]]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.pendingResponse = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, kgSourceSeatId: "seat-1" };

    const targetMaxHp = state.seats[1]!.maxHp;

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    state = applyGameAction(state, { type: "PASS_CHOICE", playerId: "p1" }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(targetMaxHp - 1);
  });

  it("does not trigger Sanshui kg mercy for invalid kg sources", () => {
    let state = setHands(makeGame(2), [["sha"], []]);
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, kgSourceSeatId: "seat-1" };

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.pendingChoice?.cardName).not.toBe("sanshui-kg-mercy");
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);

    state = setHands(makeGame(2, false, ["builtin-sanshui-xiansheng"]), [["sha"], []]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.pendingResponse = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, kgSourceSeatId: "seat-9" };

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.pendingChoice?.cardName).not.toBe("sanshui-kg-mercy");
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);
  });

  it("lets Sanshui use the limited dying skill and assign kg", () => {
    let state = setHands(
      makeGame(2, false, ["builtin-vanguard", "builtin-sanshui-xiansheng"]),
      [["sha"], ["shan"]]
    );
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.pendingResponse = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[1]!.hp = 1;

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatId: "seat-2",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.pendingChoice?.cardName).toBe("sanshui-zixin");
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p2", skillId: "sanshui-zixin" }).state;
    expect(state.pendingChoice?.cardName).toBe("sanshui-zixin-target");
    expect(state.seats[1]!.maxHp).toBe(2);
    expect(state.seats[1]!.hp).toBe(2);
    expect(state.seats[1]!.hand).toHaveLength(2);

    state = applyGameAction(state, { type: "CHOOSE_TARGET", playerId: "p2", targetSeatId: "seat-1" }).state;
    expect(state.pendingDying).toBeUndefined();
    expect(state.seats[0]!.skillState?.kgSourceSeatId).toBe("seat-2");
    expect(state.seats[1]!.skillState?.sanshuiZixinUsed).toBe(true);
  });

  it("resolves wuzhong, guohe, and shunshou", () => {
    let state = setHands(makeGame(), [["wuzhong"], []]);
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state = passGlobalResponses(state);
    expect(state.seats[0]!.hand.length).toBeGreaterThanOrEqual(2);

    state = setHands(makeGame(), [["guohe"], ["sha", "shan"]]);
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = passGlobalResponses(state);
    state = applyGameAction(state, {
      type: "CHOOSE_CARD",
      playerId: "p1",
      cardId: state.pendingChoice!.choices[0]!.cardId,
      choiceId: state.pendingChoice!.choices[0]!.id,
    }).state;
    expect(state.seats[1]!.hand.length).toBe(1);

    state = setHands(makeGame(), [["shunshou"], ["sha"]]);
    state.seats[1]!.hand.push(card("extra-target-card", "shan"));
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = passGlobalResponses(state);
    expect(state.pendingChoice!.choices.every((choice) => choice.area !== "hand" || /^手牌 \d+$/.test(choice.cardName))).toBe(true);
    const extraChoice = state.pendingChoice!.choices.find((choice) => choice.cardId === "extra-target-card")!;
    state = applyGameAction(state, {
      type: "CHOOSE_CARD",
      playerId: "p1",
      cardId: extraChoice.cardId,
      choiceId: extraChoice.id,
    }).state;
    expect(state.seats[0]!.hand.some((item) => item.id === "extra-target-card")).toBe(true);
  });

  it("handles delayed tricks in judge phase", () => {
    let state = makeGame(2, false);
    state.currentSeatIndex = 1;
    state.phase = "judge";
    state.seats[1]!.judgementArea.push(card("target-lebu", "lebu"));
    state.deck.unshift(card("judge-spade", "sha", "spade", 7));

    state = applyGameAction(state, { type: "END_PHASE", playerId: "p2" }).state;
    state = advanceToPhase(state, "discard");

    expect(getCurrentSeat(state).playerId).toBe("p2");
    expect(state.seats[1]!.skipPlayPhase).toBe(true);
  });

  it("uses concrete equipment variants", () => {
    let state = setHands(makeGame(), [["weapon", "weapon", "armor"], []]);
    state.seats[0]!.hand[1] = { ...state.seats[0]!.hand[1]!, name: "Qinggang", equipmentKey: "qinggang", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    expect(state.seats[0]!.equipment.weapon?.equipmentKey).toBe("zhuge");

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    expect(state.seats[0]!.equipment.weapon?.equipmentKey).toBe("qinggang");
    expect(state.discardPile.some((item) => item.equipmentKey === "zhuge")).toBe(true);
  });

  it("exposes recent characters and new equipment in catalogs", () => {
    const characters = getApprovedCharacters();
    expect(characters.some((item) => item.id === "builtin-gay-guan")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-haijie-dashen")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-hong-xiliang")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-ju-hui")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-yangzhi-tao")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-tudou")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-cjj")).toBe(true);
    expect(characters.some((item) => item.id === "builtin-yang-haiyan")).toBe(true);

    const catalog = getGameCardCatalog();
    expect(catalog.some((item) => item.equipmentKey === "hanbing")).toBe(true);
    expect(catalog.some((item) => item.equipmentKey === "guding")).toBe(true);
    expect(catalog.some((item) => item.equipmentKey === "zhuque")).toBe(true);
  });

  it("lets zhuque convert normal sha into fire damage against tengjia", () => {
    let state = setHands(makeGame(), [["weapon", "sha"], []]);
    state.seats[0]!.hand[0] = { ...state.seats[0]!.hand[0]!, name: "Zhuque", equipmentKey: "zhuque", range: 4 };
    state.seats[1]!.equipment.armor = { ...card("tengjia-armor", "armor"), name: "藤甲", equipmentKey: "tengjia" };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 2);
  });

  it("adds guding damage against targets with no hand cards", () => {
    let state = setHands(makeGame(), [["weapon", "sha"], []]);
    state.seats[0]!.hand[0] = { ...state.seats[0]!.hand[0]!, name: "Guding", equipmentKey: "guding", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 2);
  });

  it("offers hanbing choice to prevent damage and discard cards", () => {
    let state = setHands(makeGame(), [["weapon", "sha"], ["shan", "tao"]]);
    state.seats[0]!.hand[0] = { ...state.seats[0]!.hand[0]!, name: "Hanbing", equipmentKey: "hanbing", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;

    expect(state.pendingChoice?.cardName).toBe("hanbing-sword");
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp);

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "hanbing-sword" }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp);
    expect(state.seats[1]!.hand.length).toBe(0);
  });

  it("applies normal damage when hanbing choice is passed", () => {
    let state = setHands(makeGame(), [["weapon", "sha"], ["shan"]]);
    state.seats[0]!.hand[0] = { ...state.seats[0]!.hand[0]!, name: "Hanbing", equipmentKey: "hanbing", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    state = applyGameAction(state, { type: "PASS_CHOICE", playerId: "p1" }).state;

    expect(state.pendingChoice).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);
  });

  it("asks before using bagua and treats a red judgement as shan", () => {
    let state = setHands(makeGame(), [["sha"], []]);
    state.seats[1]!.equipment.armor = { ...card("bagua", "armor"), name: "八卦阵", equipmentKey: "bagua" };
    state.deck.unshift(card("red-judge", "tao", "heart", 6));

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    expect(state.pendingChoice?.cardName).toBe("bagua-armor");
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p2", skillId: "bagua-armor" }).state;

    expect(state.pendingResponse).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp);
  });

  it("lets the cixiong target choose a discard before sha response", () => {
    let state = setHands(makeGame(), [["sha"], ["tao"]]);
    state.seats[0]!.character.gender = "male";
    state.seats[1]!.character.gender = "female";
    state.seats[0]!.equipment.weapon = { ...card("cixiong", "weapon"), name: "雌雄双股剑", equipmentKey: "cixiong", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    expect(state.pendingChoice?.cardName).toBe("cixiong-sword");
    const choice = state.pendingChoice!.choices[0]!;
    state = applyGameAction(state, { type: "CHOOSE_CARD", playerId: "p2", cardId: choice.cardId, choiceId: choice.id }).state;

    expect(state.seats[1]!.hand).toHaveLength(0);
    expect(state.pendingResponse?.responseType).toBe("shan");
  });

  it("supports qinglong follow-up sha after target dodges", () => {
    let state = setHands(makeGame(), [["sha", "sha"], ["shan"]]);
    state.seats[0]!.equipment.weapon = { ...card("qinglong", "weapon"), name: "青龙偃月刀", equipmentKey: "qinglong", range: 3 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "RESPOND_CARD", playerId: "p2", cardId: state.seats[1]!.hand[0]!.id }).state;
    expect(state.pendingChoice?.cardName).toBe("qinglong-blade");
    const choice = state.pendingChoice!.choices[0]!;
    state = applyGameAction(state, { type: "CHOOSE_CARD", playerId: "p1", cardId: choice.cardId, choiceId: choice.id }).state;

    expect(state.pendingResponse?.responseType).toBe("shan");
    expect(state.pendingResponse?.responderSeatId).toBe("seat-2");
  });

  it("supports guanshi discarding two cards to force damage", () => {
    let state = setHands(makeGame(), [["sha", "tao", "jiu"], ["shan"]]);
    state.seats[0]!.equipment.weapon = { ...card("guanshi", "weapon"), name: "贯石斧", equipmentKey: "guanshi", range: 3 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "RESPOND_CARD", playerId: "p2", cardId: state.seats[1]!.hand[0]!.id }).state;
    expect(state.pendingChoice?.cardName).toBe("guanshi-axe");
    state = applyGameAction(state, { type: "CHOOSE_CARDS", playerId: "p1", cardIds: state.pendingChoice!.choices.slice(0, 2).map((choice) => choice.cardId) }).state;

    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);
  });

  it("asks before qilin discards a target horse", () => {
    let state = setHands(makeGame(), [["sha"], []]);
    state.seats[0]!.equipment.weapon = { ...card("qilin", "weapon"), name: "麒麟弓", equipmentKey: "qilin", range: 5 };
    state.seats[1]!.equipment.defenseHorse = { ...card("horse", "defense_horse"), name: "+1 马", equipmentKey: "defense_horse" };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    expect(state.pendingChoice?.cardName).toBe("qilin-bow");
    const choice = state.pendingChoice!.choices[0]!;
    state = applyGameAction(state, { type: "CHOOSE_CARD", playerId: "p1", cardId: choice.cardId, choiceId: choice.id }).state;

    expect(state.seats[1]!.equipment.defenseHorse).toBeUndefined();
  });

  it("uses two hand cards as sha with zhangba", () => {
    let state = setHands(makeGame(), [["tao", "jiu"], []]);
    state.seats[0]!.equipment.weapon = { ...card("zhangba", "weapon"), name: "丈八蛇矛", equipmentKey: "zhangba", range: 3 };

    state = applyGameAction(state, {
      type: "USE_SKILL",
      playerId: "p1",
      skillId: "zhangba-sha",
      cardIds: state.seats[0]!.hand.map((item) => item.id),
      targetSeatId: "seat-2",
    }).state;

    expect(state.seats[0]!.hand).toHaveLength(0);
    expect(state.pendingResponse?.responseType).toBe("shan");
  });

  it("lets fangtian target up to three players with the last hand sha", () => {
    let state = setHands(makeGame(4), [["sha"], [], [], []]);
    state.seats[0]!.equipment.weapon = { ...card("fangtian", "weapon"), name: "方天画戟", equipmentKey: "fangtian", range: 4 };

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
      targetSeatIds: ["seat-2", "seat-3", "seat-4"],
    }).state;

    expect(state.pendingResponse?.effect.kind).toBe("aoe");
    expect(state.pendingResponse?.responderSeatId).toBe("seat-2");
    expect(state.pendingResponse?.effect.kind === "aoe" ? state.pendingResponse.effect.queue : []).toEqual(["seat-3", "seat-4"]);
  });

  it("lets Bao Taihou use two cards as wuxie", () => {
    let state = setHands(makeGame(3, true, ["builtin-vanguard", "builtin-bao-taihou"]), [["wuzhong"], ["sha", "shan"], []]);
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    expect(state.pendingResponse?.eligibleResponderSeatIds).toContain("seat-2");

    state = applyGameAction(state, {
      type: "USE_SKILL",
      playerId: "p2",
      skillId: "bao-double-wuxie",
      cardIds: state.seats[1]!.hand.map((item) => item.id),
    }).state;

    expect(state.seats[1]!.hand).toHaveLength(0);
    expect(state.seats[0]!.hand).toHaveLength(0);
  });

  it("asks Shen Laoban before talent judgement and exposes red options", () => {
    let state = makeGame(2, false, ["builtin-tianzhi-jiaozi-shen-laoban"]);
    expect(state.pendingChoice?.cardName).toBe("shen-boss-talent-judge");
    state.deck.unshift(card("shen-red-judge", "tao", "heart", 7));
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "shen-boss-talent-judge" }).state;
    expect(state.pendingChoice?.cardName).toBe("shen-boss-talent-option");
    const option = state.pendingChoice!.choices.find((choice) => choice.cardId === "shen-boss-sha-limit")!;
    state = applyGameAction(state, { type: "CHOOSE_CARD", playerId: "p1", cardId: option.cardId, choiceId: option.id }).state;
    expect(state.seats[0]!.skillState?.shenBossShaLimitBonus).toBe(1);
  });

  it("supports Yan Laoban skills", () => {
    let state = setHands(makeGame(2, true, ["builtin-yan-laoban"]), [[], []]);
    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn.playerId = "p2";
    state = applyGameAction(state, { type: "END_PHASE", playerId: "p2" }).state;
    expect(state.seats[0]!.hand.length).toBe(3);
    expect(state.seats[0]!.skillState?.yanFillCount).toBe(1);

    state = makeGame(2, true, ["builtin-yan-laoban"]);
    state.seats[0]!.hand = [card("yan-a", "sha"), card("yan-b", "shan")];
    state = applyGameAction(state, {
      type: "USE_SKILL",
      playerId: "p1",
      skillId: "yan-xiazhi-dili",
      cardIds: ["yan-a", "yan-b"],
    }).state;
    state = passGlobalResponses(state);
    expect(state.pendingChoice?.kind).toBe("public-card");
  });

  it("triggers Yan passive at most five times per round and waits until discard ends", () => {
    let state = makeGame(2, true, ["builtin-yan-laoban"]);
    state.currentSeatIndex = 0;
    state.activeTurn.playerId = "p1";
    state.phase = "discard";
    state.seats[0]!.hand = [];

    state = applyGameAction(state, { type: "END_PHASE", playerId: "p1" }).state;
    expect(state.phase).toBe("finish");
    expect(state.seats[0]!.hand).toHaveLength(3);

    for (let trigger = 2; trigger <= 6; trigger += 1) {
      state.seats[0]!.hand = [];
      state.currentSeatIndex = 1;
      state.activeTurn.playerId = "p2";
      state.phase = "play";
      state = applyGameAction(state, { type: "END_PHASE", playerId: "p2" }).state;
    }
    expect(state.seats[0]!.skillState?.yanFillCount).toBe(5);
    expect(state.seats[0]!.hand).toHaveLength(0);
  });

  it("supports Huang Daxian detained-card recalc", () => {
    let state = makeGame(2, false, ["builtin-huang-daxian"]);
    state.seats[0]!.hand = ["sha", "shan", "tao", "jiu"].map((key, index) => card(`huang-hand-${index}`, key as CardKey));
    state.seats[0]!.skillState = {};
    state.seats[0]!.skipDrawPhase = false;
    state.phase = "judge";
    state.deck.unshift(card("huang-judge", "sha", "club", 5));

    state = advanceToPhase(state, "play");

    const detained = state.seats[0]!.skillState?.huangDetainedCards as GameCard[];
    expect(detained).toHaveLength(1);
    expect(detained[0]!.rank).toBe(5);
    expect(state.seats[0]!.hand.length).toBe(4);

    state = applyGameAction(state, {
      type: "USE_SKILL",
      playerId: "p1",
      skillId: "huang-use-detained",
      cardIds: [detained[0]!.id],
    }).state;

    expect(state.seats[0]!.hand.length).toBe(6);
    expect((state.seats[0]!.skillState?.huangDetainedCards as GameCard[])).toHaveLength(0);
  });

  it("uses Yan hand limit of 3", () => {
    const state = makeGame(2, true, ["builtin-yan-laoban"]);
    expect(getHandLimit(state.seats[0]!)).toBe(3);
  });

  it("supports gay Guan optional silence after hp loss", () => {
    let state = makeGame(2, true, ["builtin-gay-guan"]);
    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn = { playerId: "p2", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[0]!.hand = [];
    state.seats[1]!.hand = [card("attack-gay", "sha")];

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: state.seats[1]!.hand[0]!.id,
      targetSeatId: "seat-1",
    }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p1" }).state;

    expect(state.pendingChoice?.kind).toBe("skill-confirm");
    expect(state.pendingChoice?.cardName).toBe("gay-chenmo");

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "gay-chenmo" }).state;

    expect(state.seats[0]!.maxHp).toBe(3);
    expect(state.seats[0]!.hand.some((item) => item.cardKey === "tao")).toBe(true);
    expect(state.seats[0]!.hand.some((item) => item.cardKey === "nanman")).toBe(true);
    expect(state.seats[0]!.hand.some((item) => item.cardKey === "huogong")).toBe(true);
  });

  it("supports Haijie trick-to-jiu and draw boost tracking", () => {
    let state = setHands(makeGame(2, true, ["builtin-haijie-dashen"]), [["guohe"], []]);

    state = applyGameAction(state, {
      type: "USE_SKILL",
      playerId: "p1",
      skillId: "haijie-jiujing",
      cardIds: [state.seats[0]!.hand[0]!.id],
    }).state;

    const jiu = state.seats[0]!.hand.find((item) => item.cardKey === "jiu");
    expect(jiu).toBeTruthy();
    expect(state.discardPile.some((item) => item.cardKey === "guohe")).toBe(true);

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: jiu!.id }).state;
    expect(state.seats[0]!.skillState?.haijieMeidiDrawBoostTurns).toBe(2);
  });

  it("supports tiesuo multi-target chain and recast", () => {
    let state = setHands(makeGame(3), [["tiesuo"], [], []]);

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    expect(state.pendingChoice?.kind).toBe("multi-target-seat");
    state = applyGameAction(state, {
      type: "CHOOSE_TARGETS",
      playerId: "p1",
      targetSeatIds: ["seat-2", "seat-3"],
    }).state;
    state = passGlobalResponses(state);

    expect(state.seats[1]!.chained).toBe(true);
    expect(state.seats[2]!.chained).toBe(true);
    expect(state.phase).toBe("play");

    state = setHands(makeGame(2), [["tiesuo"], []]);
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state = applyGameAction(state, { type: "PASS_CHOICE", playerId: "p1" }).state;
    expect(state.pendingChoice).toBeUndefined();
    expect(state.pendingResponse).toBeUndefined();
    expect(state.seats[0]!.hand.length).toBe(1);
    expect(state.phase).toBe("play");
  });

  it("skips players without wuxie and resolves immediately when nobody can respond", () => {
    let state = setHands(makeGame(3), [["wuzhong"], ["sha"], ["shan"]]);
    const before = state.seats[0]!.hand.length;

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
    }).state;

    expect(state.pendingResponse).toBeUndefined();
    expect(state.phase).toBe("play");
    expect(state.seats[0]!.hand.length).toBe(before + 1);
  });

  it("only asks players who currently hold wuxie", () => {
    let state = setHands(makeGame(3), [["wuzhong"], ["sha"], ["wuxie"]]);

    state = applyGameAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: state.seats[0]!.hand[0]!.id,
    }).state;

    expect(state.pendingResponse?.mode).toBe("global");
    expect(state.pendingResponse?.eligibleResponderSeatIds).toEqual(["seat-3"]);
    expect(state.pendingResponse?.responderSeatId).toBe("seat-3");
  });

  it("supports Shen Zhuxi red sha shield and black sha steal limit", () => {
    let state = makeGame(2, true, ["builtin-shen-zhuxi"]);
    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn = { playerId: "p2", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[0]!.hand = [];
    state.seats[1]!.hand = [card("red-sha-1", "sha", "heart", 7), card("red-sha-2", "sha", "diamond", 8)];

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p2", cardId: "red-sha-1", targetSeatId: "seat-1" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p1" }).state;
    expect(state.seats[0]!.hp).toBe(state.seats[0]!.maxHp - 1);
    expect(state.seats[0]!.skillState?.shenRedShaShield).toBe(1);

    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p2", cardId: "red-sha-2", targetSeatId: "seat-1" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p1" }).state;
    expect(state.seats[0]!.hp).toBe(state.seats[0]!.maxHp - 1);
    expect(state.seats[0]!.skillState?.shenRedShaShield).toBe(0);

    state = makeGame(2, true, ["builtin-shen-zhuxi"]);
    state.seats[0]!.hand = [
      card("black-sha-1", "sha", "spade", 7),
      card("black-sha-2", "sha", "club", 8),
      card("black-sha-3", "sha", "spade", 9),
    ];
    state.seats[1]!.hand = [card("target-a", "tao"), card("target-b", "jiu"), card("target-c", "wuzhong")];

    for (const [index, cardId] of ["black-sha-1", "black-sha-2", "black-sha-3"].entries()) {
      state.usedShaThisTurn = false;
      state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId, targetSeatId: "seat-2" }).state;
      state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
      if (index < 2) {
        expect(state.pendingChoice?.cardName).toBe("shen-black-sha-steal");
        state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "shen-black-sha-steal" }).state;
      }
    }

    expect(state.seats[0]!.skillState?.shenBlackShaStealUsed).toBe(2);
    expect(state.seats[1]!.hand.length).toBe(1);
  });

  it("supports Shen Zhuxi limited student party skill", () => {
    let state = makeGame(2, true, ["builtin-shen-zhuxi"]);
    state.seats[0]!.hp = 2;
    state.seats[0]!.hand = [];

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "shen-xuesheng-dang" }).state;
    expect(state.seats[0]!.hp).toBe(4);
    expect(state.seats[0]!.hand.length).toBe(3);
    expect(state.seats[0]!.skillState?.shenStudentPartyUsed).toBe(true);
    expect(() => applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "shen-xuesheng-dang" })).toThrow();
  });

  it("runs Deng Gou opening identity choice before the first turn", () => {
    let state = createGame({
      roomId: "deng-opening",
      seed: "deng-opening",
      gameMode: "identity",
      players: Array.from({ length: 5 }, (_, index) => ({
        playerId: `p${index + 1}`,
        playerName: `player-${index + 1}`,
        characterId: "builtin-deng-gou",
      })),
    });

    expect(state.phase).toBe("opening");
    expect(state.pendingChoice?.kind).toBe("opening-identity");
    const chooserSeatId = state.pendingChoice!.chooserSeatId;
    const chooser = state.seats.find((seat) => seat.seatId === chooserSeatId)!;
    expect(chooser.identityRole).not.toBe("lord");

    state = applyGameAction(state, {
      type: "CHOOSE_OPENING_IDENTITY",
      playerId: chooser.playerId,
      reveal: false,
    }).state;

    expect(state.seats.find((seat) => seat.seatId === chooserSeatId)!.skillState?.dengHiddenHorse).toBe(true);
  });

  it("applies Deng Gou rebel reveal bonuses", () => {
    let state = createGame({
      roomId: "deng-rebel",
      seed: "deng-rebel",
      gameMode: "identity",
      players: Array.from({ length: 5 }, (_, index) => ({
        playerId: `p${index + 1}`,
        playerName: `player-${index + 1}`,
        characterId: "builtin-deng-gou",
      })),
    });
    const chooser = state.seats.find((seat) => seat.seatId === state.pendingChoice!.chooserSeatId)!;
    chooser.identityRole = "rebel";

    state = applyGameAction(state, { type: "CHOOSE_OPENING_IDENTITY", playerId: chooser.playerId, reveal: true }).state;
    const updated = state.seats.find((seat) => seat.seatId === chooser.seatId)!;

    expect(updated.identityRevealed).toBe(true);
    expect(updated.skillState?.dengRebelBoost).toBe(true);
  });

  it("applies Deng Gou rebel sha and draw bonuses", () => {
    let state = setHands(makeGame(2, true, ["builtin-deng-gou"]), [["sha"], []]);
    state.seats[0]!.skillState = { ...state.seats[0]!.skillState, dengRebelBoost: true };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 2);

    state = makeGame(2, false, ["builtin-deng-gou"]);
    state.phase = "draw";
    state.seats[0]!.hand = [];
    state.seats[0]!.skillState = { ...state.seats[0]!.skillState, dengRebelBoost: true };
    state = applyGameAction(state, { type: "END_PHASE", playerId: "p1" }).state;
    expect(state.seats[0]!.hand.length).toBe(3);
  });

  it("applies Deng Gou hidden horse and sha transfer", () => {
    let state = setHands(makeGame(2, true, ["builtin-vanguard", "builtin-deng-gou"]), [["sha"], []]);
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, dengHiddenHorse: true };
    expect(() =>
      applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" })
    ).toThrow("目标距离太远");

    state = setHands(makeGame(3, true, ["builtin-vanguard", "builtin-deng-gou", "builtin-vanguard"]), [["sha"], [], []]);
    state.seats[1]!.skillState = { ...state.seats[1]!.skillState, dengTransferCharges: 1 };
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    expect(state.pendingChoice?.kind).toBe("sha-transfer");
    state = applyGameAction(state, { type: "CHOOSE_TARGET", playerId: "p2", targetSeatId: "seat-3" }).state;
    expect(state.pendingResponse?.responderSeatId).toBe("seat-3");
    expect(state.seats[1]!.skillState?.dengTransferCharges).toBe(0);
  });

  it("applies Deng Gou renegade hand limit and one-time revive", () => {
    let state = makeGame(2, true, ["builtin-deng-gou"]);
    state.seats[0]!.skillState = {
      ...state.seats[0]!.skillState,
      dengRenegadeLimitBoost: true,
      dengRenegadeReviveAvailable: true,
    };
    expect(getHandLimit(state.seats[0]!)).toBe(5);

    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn = { playerId: "p2", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[0]!.hp = 1;
    state.seats[0]!.hand = [];
    state.seats[1]!.hand = [card("kill-deng", "sha")];

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p2", cardId: "kill-deng", targetSeatId: "seat-1" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p1" }).state;

    expect(state.seats[0]!.alive).toBe(true);
    expect(state.seats[0]!.hp).toBe(state.seats[0]!.maxHp);
    expect(state.seats[0]!.hand.length).toBe(3);
    expect(state.seats[0]!.skillState?.dengRenegadeReviveAvailable).toBe(false);
  });

  it("auto-passes response timeout with scope guard", () => {
    let state = setHands(makeGame(), [["sha"], []]);
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    const scopeId = state.actionTimer?.scopeId;

    state = applyGameAction(state, { type: "AUTO_TIMEOUT", playerId: "p2", scopeId }).state;

    expect(state.pendingResponse).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(state.seats[1]!.maxHp - 1);
    const afterDuplicate = applyGameAction(state, { type: "AUTO_TIMEOUT", playerId: "p2", scopeId }).state;
    expect(afterDuplicate.seats[1]!.hp).toBe(state.seats[1]!.hp);
  });

  it("supports Hong Xiliang accomplice and draw bonuses", () => {
    let state = makeGame(3, true, ["builtin-hong-xiliang", "builtin-vanguard", "builtin-vanguard"]);
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "hong-tanwu", targetSeatId: "seat-2" }).state;

    expect(state.seats[0]!.skillState?.hongAccompliceTargetSeatId).toBe("seat-2");
    expect(state.seats[1]!.skillState?.hongAccompliceSourceSeatId).toBe("seat-1");

    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn = { playerId: "p2", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state.seats[1]!.hand = [card("hong-blocked-sha", "sha")];
    expect(() => applyGameAction(state, { type: "PLAY_CARD", playerId: "p2", cardId: "hong-blocked-sha", targetSeatId: "seat-1" })).toThrow();

    state = makeGame(2, false, ["builtin-hong-xiliang"]);
    state.phase = "draw";
    state.seats[0]!.hand = [];
    state = applyGameAction(state, { type: "END_PHASE", playerId: "p1" }).state;
    expect(state.seats[0]!.hand.length).toBe(3);
  });

  it("supports Ju Hui board marks and concise skill", () => {
    let state = setHands(makeGame(2, true, ["builtin-ju-hui"]), [["guohe"], ["sha"]]);

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    expect(state.seats[0]!.skillState?.juBoardMarks).toBe(1);

    state = makeGame(2, true, ["builtin-ju-hui"]);
    state.seats[0]!.hp = 1;
    state.seats[0]!.skillState = { ...state.seats[0]!.skillState, juBoardMarks: 2 };
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "ju-jianjie-tao" }).state;
    expect(state.seats[0]!.hp).toBe(2);
    expect(state.seats[0]!.skillState?.juBoardMarks).toBe(0);

    state.seats[0]!.skillState = { ...state.seats[0]!.skillState, juBoardMarks: 3 };
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "ju-jianjie-copy", targetSeatId: "seat-2" }).state;
    expect(state.seats[0]!.skillState?.juCopiedFromSeatId).toBe("seat-2");
  });

  it("supports Yangzhi Tao dual equipment and secretary skill", () => {
    let state = setHands(makeGame(2, true, ["builtin-yangzhi-tao"]), [["weapon", "weapon", "armor", "defense_horse"], []]);
    state.seats[0]!.hand[1] = { ...state.seats[0]!.hand[1]!, name: "Qinggang", equipmentKey: "qinggang", range: 2 };

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id }).state;
    expect(state.seats[0]!.equipment.weapon?.equipmentKey).toBe("zhuge");
    expect((state.seats[0]!.skillState?.yangExtraWeapons as GameCard[])).toHaveLength(1);
    expect(() => applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand.at(-1)!.id })).toThrow();

    state = makeGame(2, true, ["builtin-yangzhi-tao"]);
    state.seats[0]!.hand = [];
    state.discardPile = [card("discard-a", "sha"), card("discard-b", "tao"), card("discard-c", "jiu")];
    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "yang-shuji" }).state;
    expect(state.seats[0]!.hand.map((item) => item.id)).toEqual(["discard-b", "discard-c"]);
    expect(state.discardPile).toHaveLength(1);
  });

  it("supports Tudou root damage link and prevention prompt", () => {
    let state = setHands(makeGame(2, false, ["builtin-tudou", "builtin-vanguard"]), [["sha", "shan", "tao"], []]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "tudou-shenggen", targetSeatId: "seat-2" }).state;
    expect(state.seats[0]!.skillState?.tudouRootTargetSeatId).toBe("seat-2");
    expect(state.seats[1]!.skillState?.tudouRootSourceSeatId).toBe("seat-1");

    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p1", cardId: state.seats[0]!.hand[0]!.id, targetSeatId: "seat-2" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    expect(state.pendingChoice?.cardName).toBe("tudou-shenggen-prevent");

    state = applyGameAction(state, { type: "PASS_CHOICE", playerId: "p1" }).state;
    expect(state.seats[0]!.hp).toBe(2);
    expect(state.seats[1]!.hp).toBe(3);
  });

  it("supports cjj poison mark after poisoned source deals damage", () => {
    let state = setHands(makeGame(2, false, ["builtin-cjj", "builtin-vanguard"]), [["sha"], ["sha"]]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "cjj-shiguan", targetSeatId: "seat-2", cardIds: [state.seats[0]!.hand[0]!.id] }).state;
    expect(state.seats[1]!.skillState?.cjjPoisonSourceSeatId).toBe("seat-1");

    state.currentSeatIndex = 1;
    state.phase = "play";
    state.activeTurn = { playerId: "p2", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
    state.usedShaThisTurn = false;
    state = applyGameAction(state, { type: "PLAY_CARD", playerId: "p2", cardId: state.seats[1]!.hand[0]!.id, targetSeatId: "seat-1" }).state;
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p1" }).state;
    expect(state.seats[1]!.skillState?.cjjPoisonSourceSeatId).toBeUndefined();
    expect(state.seats[1]!.hp).toBe(3);
    expect(state.seats[0]!.hp).toBe(2);
  });

  it("supports Yang Haiyan converting taoyuan or wugu into mass attack", () => {
    let state = setHands(makeGame(2, false, ["builtin-yang-haiyan", "builtin-vanguard"]), [["taoyuan"], []]);
    state.currentSeatIndex = 0;
    state.phase = "play";
    state.pendingChoice = undefined;
    state.activeTurn = { playerId: "p1", shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };

    state = applyGameAction(state, { type: "USE_SKILL", playerId: "p1", skillId: "yang-xiaoli-nanman", cardIds: [state.seats[0]!.hand[0]!.id] }).state;
    expect(state.discardPile.some((item) => item.cardKey === "taoyuan")).toBe(true);
    state = applyGameAction(state, { type: "PASS_RESPONSE", playerId: "p2" }).state;
    expect(state.seats[1]!.hp).toBeLessThan(state.seats[1]!.maxHp);
  });
});
