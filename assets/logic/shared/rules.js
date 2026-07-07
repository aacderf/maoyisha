import { BUILT_IN_CHARACTERS, getApprovedCharacters } from "./characters.js";
import { cardDef, createStarterDeck } from "./game-data/cards.js";
const DEFAULT_TIMER_SETTINGS = {
    turnSeconds: 60,
    responseSeconds: 15,
};
const IDENTITY_DISTRIBUTION = {
    5: ["lord", "loyalist", "rebel", "rebel", "renegade"],
    6: ["lord", "loyalist", "rebel", "rebel", "rebel", "renegade"],
    7: ["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "renegade"],
    8: ["lord", "loyalist", "loyalist", "rebel", "rebel", "rebel", "rebel", "renegade"],
};
function normalizeGameMode(mode, playerCount) {
    if (mode) {
        if (mode === "team2v2" && playerCount !== 4)
            throw new Error("2V2 仅支持 4 名玩家。");
        if (mode === "identity" && playerCount < 5)
            throw new Error("身份局至少需要 5 名玩家。");
        return mode;
    }
    if (playerCount === 4)
        return "team2v2";
    return playerCount >= 5 ? "identity" : "free";
}
function assignIdentityRoles(mode, playerCount, seed) {
    if (mode !== "identity")
        return Array.from({ length: playerCount }, () => undefined);
    const roles = IDENTITY_DISTRIBUTION[playerCount];
    if (!roles)
        throw new Error("身份局仅支持 5-8 人。");
    return shuffleItems(roles, `${seed}-identity`);
}
function assignTeamId(mode, index) {
    if (mode !== "team2v2")
        return undefined;
    return index % 2 === 0 ? "warm" : "cold";
}
function shuffleItems(items, seed) {
    const result = [...items];
    const random = seededRandom(seed);
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}
export function createGame(input) {
    const approvedCharacters = getApprovedCharacters(input.characters);
    const deck = shuffleDeck(createStarterDeck(), input.seed ?? input.roomId);
    const gameMode = normalizeGameMode(input.gameMode, input.players.length);
    const identityRoles = assignIdentityRoles(gameMode, input.players.length, input.seed ?? input.roomId);
    const lordIndex = identityRoles.findIndex((role) => role === "lord");
    const seats = input.players.map((player, index) => {
        const character = approvedCharacters.find((item) => item.id === player.characterId) ??
            BUILT_IN_CHARACTERS[index % BUILT_IN_CHARACTERS.length];
        const identityRole = identityRoles[index];
        const teamId = assignTeamId(gameMode, index);
        const maxHp = getEffectiveMaxHp(character) + (identityRole === "lord" ? 1 : 0);
        return {
            seatId: `seat-${index + 1}`,
            playerId: player.playerId,
            playerName: player.playerName,
            ready: true,
            connected: true,
            character,
            hp: maxHp,
            maxHp,
            hand: [],
            discardPile: [],
            equipment: {},
            judgementArea: [],
            chained: false,
            skipPlayPhase: false,
            skipDrawPhase: false,
            alive: true,
            identityRole,
            identityRevealed: identityRole === "lord" || gameMode === "team2v2",
            teamId,
            skillState: {},
        };
    });
    const firstSeatIndex = lordIndex >= 0 ? lordIndex : 0;
    const state = {
        id: `game-${input.roomId}`,
        roomId: input.roomId,
        seats,
        deck,
        discardPile: [],
        currentSeatIndex: firstSeatIndex,
        phase: "prepare",
        turn: 1,
        logs: ["对局开始。"],
        activeTurn: createActiveTurn(seats[firstSeatIndex]?.playerId ?? ""),
        usedShaThisTurn: false,
        revealedCards: [],
        publicCards: [],
        timerSettings: normalizeTimerSettings(input.timerSettings),
        gameMode,
    };
    for (const seat of seats)
        drawCards(state, seat, 4);
    const openingEvents = [];
    if (startDengOpeningChoice(state, openingEvents)) {
        state.logs.push(...openingEvents);
    }
    else {
        resetTurnSkillState(getCurrentSeat(state));
        state.logs.push(...advancePhase(state, false));
    }
    return syncActionTimer(state);
}
export function applyGameAction(state, action) {
    if (state.phase === "finished") {
        throw new Error("对局已经结束。");
    }
    const next = cloneGameState(state);
    if (action.type === "AUTO_TIMEOUT" && action.scopeId && next.actionTimer?.scopeId !== action.scopeId) {
        return { state: next, events: [] };
    }
    if (next.pendingChoice) {
        const choicePlayerId = action.type === "AUTO_TIMEOUT" ? requireSeatById(next, next.pendingChoice.chooserSeatId).playerId : action.playerId;
        if (action.type === "CHOOSE_OPENING_IDENTITY") {
            return finalizeAction(chooseOpeningIdentity(next, action.playerId, action.reveal));
        }
        if (action.type === "CHOOSE_CARD") {
            return finalizeAction(choosePendingCard(next, action.playerId, action.cardId, action.choiceId));
        }
        if (action.type === "CHOOSE_TARGET") {
            return finalizeAction(choosePendingTarget(next, action.playerId, action.targetSeatId));
        }
        if (action.type === "CHOOSE_TARGETS") {
            return finalizeAction(choosePendingTargets(next, action.playerId, action.targetSeatIds));
        }
        if (action.type === "CHOOSE_CARDS") {
            return finalizeAction(choosePendingCards(next, action.playerId, action.cardIds));
        }
        if (action.type === "USE_SKILL") {
            return finalizeAction(choosePendingSkill(next, action));
        }
        if (action.type === "PASS_CHOICE" || action.type === "AUTO_TIMEOUT") {
            return finalizeAction(passPendingChoice(next, choicePlayerId));
        }
        throw new Error("请先处理当前选择。");
    }
    if (next.pendingResponse) {
        if (action.type === "RESPOND_CARD")
            return finalizeAction(respondCard(next, action.playerId, action.cardId));
        if (action.type === "USE_SKILL" && action.skillId === "bao-double-wuxie") {
            return finalizeAction(respondBaoDoubleWuxie(next, action));
        }
        if (action.type === "PASS_RESPONSE" || action.type === "AUTO_TIMEOUT") {
            if (action.type === "AUTO_TIMEOUT" &&
                next.pendingResponse.responseType === "wuxie" &&
                next.pendingResponse.mode === "global") {
                return finalizeAction(timeoutGlobalWuxie(next));
            }
            const responsePlayerId = action.type === "AUTO_TIMEOUT" ? requireSeatById(next, next.pendingResponse.responderSeatId).playerId : action.playerId;
            return finalizeAction(passResponse(next, responsePlayerId));
        }
        throw new Error("请先处理当前响应。");
    }
    const current = getCurrentSeat(next);
    if (current.playerId !== action.playerId)
        throw new Error("还没轮到你行动。");
    if (!current.alive)
        throw new Error("已出局玩家不能行动。");
    if (action.type === "PLAY_CARD") {
        return finalizeAction(playCard(next, current, action.cardId, action.targetSeatId, action.targetSeatIds));
    }
    if (action.type === "DISCARD_CARD") {
        return finalizeAction(discardCard(next, current, action.cardId));
    }
    if (action.type === "END_TURN" || action.type === "END_PHASE") {
        return finalizeAction(advancePhaseAction(next, current, action.type === "END_TURN"));
    }
    if (action.type === "AUTO_TIMEOUT") {
        return finalizeAction(autoTimeout(next, current));
    }
    if (action.type === "USE_SKILL") {
        return finalizeAction(useCharacterSkill(next, current, action));
    }
    throw new Error("未知操作。");
}
export function getCurrentSeat(state) {
    const seat = state.seats[state.currentSeatIndex];
    if (!seat)
        throw new Error("当前座位不存在。");
    return seat;
}
export function getHandLimit(seat) {
    let limit = seat.character.id === "builtin-yan-laoban" ? 3 : Math.max(1, seat.hp);
    if (isDengGou(seat) && seat.skillState?.dengRenegadeLimitBoost)
        limit += 2;
    if (isHuangDaxian(seat) && seat.skillState?.huangHandLimitBonus)
        limit += 3;
    return limit;
}
function startDengOpeningChoice(state, events, queue = collectDengOpeningQueue(state)) {
    if (state.gameMode !== "identity")
        return false;
    const nextSeatId = queue.shift();
    if (!nextSeatId)
        return false;
    const seat = requireSeatById(state, nextSeatId);
    state.phase = "opening";
    state.pendingChoice = {
        id: choiceId(state),
        kind: "opening-identity",
        chooserSeatId: seat.seatId,
        sourceSeatId: seat.seatId,
        cardName: "三五",
        effect: { kind: "opening-identity", targetSeatId: seat.seatId, cardName: "三五" },
        prompt: `${seat.playerName} 的邓狗开局选择：自爆身份或隐藏身份。`,
        choices: [],
        queue,
    };
    events.push(state.pendingChoice?.prompt ?? "火攻结算。");
    return true;
}
function collectDengOpeningQueue(state) {
    if (state.gameMode !== "identity")
        return [];
    return state.seats
        .filter((seat) => seat.alive &&
        isDengGou(seat) &&
        seat.identityRole !== "lord" &&
        !seat.skillState?.dengOpeningChoiceDone)
        .map((seat) => seat.seatId);
}
function finishDengOpeningChoice(state, events) {
    if (startDengOpeningChoice(state, events, state.pendingChoice?.queue ?? [])) {
        state.logs.push(...events);
        return { state, events };
    }
    state.pendingChoice = undefined;
    state.phase = "prepare";
    resetTurnSkillState(getCurrentSeat(state));
    events.push("开局身份选择完成，进入首名玩家回合。");
    events.push(...advancePhase(state, false));
    state.logs.push(...events);
    return { state, events };
}
function playCard(state, current, cardId, targetSeatId, targetSeatIds) {
    if (state.phase !== "play")
        throw new Error("当前阶段不能出牌。");
    const card = takeCard(current.hand, cardId);
    if (card)
        markCardVoice(state, current, card, { targetSeatId, targetSeatIds });
    if (!card)
        throw new Error("手牌不存在。");
    const events = [`${current.playerName} 使用 ${card.name}。`];
    triggerKgCardUse(state, current, card, events);
    try {
        if (isSha(card)) {
            const requestedTargets = Array.from(new Set([...(targetSeatIds ?? []), ...(targetSeatId ? [targetSeatId] : [])]));
            if (hasWeaponKey(current, "fangtian") && current.hand.length === 0 && requestedTargets.length > 1) {
                playFangtianSha(state, current, card, requestedTargets, events);
                return { state, events };
            }
            playSha(state, current, card, targetSeatId, events);
            return { state, events };
        }
        if (card.cardKey === "shan" || card.cardKey === "wuxie") {
            throw new Error(`${card.name} 只能在响应时使用。`);
        }
        if (card.cardKey === "tao") {
            if (current.hp >= current.maxHp)
                throw new Error("体力已满，不能使用桃。");
            discardUsedCard(state, current, card);
            current.hp = Math.min(current.maxHp, current.hp + 1);
            events.push(`${current.playerName} 回复 1 点体力。`);
            state.logs.push(...events);
            return { state, events };
        }
        if (card.cardKey === "jiu") {
            if (state.activeTurn.jiuUsed)
                throw new Error("本回合已经使用过酒。");
            discardUsedCard(state, current, card);
            state.activeTurn.jiuUsed = true;
            state.activeTurn.jiuDamageBonus = 1;
            events.push(`${current.playerName} 下一张杀伤害 +1。`);
            if (isHaijieDashen(current)) {
                current.skillState = {
                    ...current.skillState,
                    haijieMeidiDrawBoostTurns: Number(current.skillState?.haijieMeidiDrawBoostTurns ?? 0) + 2,
                };
                events.push(`${current.playerName} 触发美的，接下来两个摸牌阶段摸牌数 +1。`);
            }
            state.logs.push(...events);
            return { state, events };
        }
        if (card.category === "equip") {
            equipCard(state, current, card, events);
            state.logs.push(...events);
            return { state, events };
        }
        if (card.cardKey === "tiesuo") {
            discardUsedCard(state, current, card);
            state.logs.push(...events);
            return startTiesuoChoice(state, current, card, targetSeatId, events);
        }
        const trickCard = prepareBaoFirstTrick(current, card, events);
        const effect = buildTrickEffect(state, current, trickCard, targetSeatId);
        triggerJuBoardMarkOnTrick(state, current, trickCard, effect, events);
        discardUsedCard(state, current, trickCard);
        state.logs.push(...events);
        return startWuxieCheck(state, current.seatId, card.name, effect, events);
    }
    catch (error) {
        current.hand.push(card);
        throw error;
    }
}
function playFangtianSha(state, current, card, targetSeatIds, events) {
    if (targetSeatIds.length < 1 || targetSeatIds.length > 3)
        throw new Error("方天画戟最多指定三名目标。");
    const targets = targetSeatIds.map((seatId) => requireReachableTarget(state, current, seatId, card));
    const shaUsedCount = Number(current.skillState?.shaUsedCount ?? 0);
    if (state.usedShaThisTurn)
        throw new Error("本回合已经使用过杀。");
    discardUsedCard(state, current, card);
    current.skillState = { ...current.skillState, shaUsedCount: shaUsedCount + 1 };
    state.usedShaThisTurn = true;
    state.activeTurn.shaUsed = true;
    state.activeTurn.firstShaPlayed = true;
    const effect = {
        kind: "aoe",
        sourceSeatId: current.seatId,
        responseType: "shan",
        queue: targets.map((target) => target.seatId),
        amount: (card.damage ?? 1) + state.activeTurn.jiuDamageBonus,
        cardName: card.name,
        nature: card.damageNature ?? "normal",
        sourceCardKey: card.cardKey,
        sourceSuit: card.suit,
        ignoreArmor: hasWeaponKey(current, "qinggang"),
    };
    state.activeTurn.jiuDamageBonus = 0;
    events.push(`${current.playerName} 发动方天画戟，对 ${targets.map((target) => target.playerName).join("、")} 使用杀。`);
    const response = nextAoeResponse(state, effect);
    if (response) {
        state.pendingResponse = response;
        state.phase = "response";
        events.push(response.prompt);
    }
    state.logs.push(...events);
}
function playSha(state, current, card, targetSeatId, events, discardPhysicalCard = true) {
    if (isHuangDaxian(current) && current.skillState?.huangNoSha)
        throw new Error("黄大仙本出牌阶段不能使用杀。");
    const target = requireReachableTarget(state, current, targetSeatId, card);
    if (isHongAccompliceBlocked(state, current, target))
        throw new Error("本轮共犯不能对虹吸量使用杀。");
    const hasZhuge = hasWeaponKey(current, "zhuge");
    if (state.usedShaThisTurn && hasZhuge)
        state.usedShaThisTurn = false;
    const shaUsedCount = Number(current.skillState?.shaUsedCount ?? 0);
    const extraShaLimit = Number(current.skillState?.shenBossShaLimitBonus ?? 0);
    const hongTeacherBonus = isHongXiliang(current) && target.character.faction === "wei" ? 1 : 0;
    const shaLimit = hasZhuge ? Number.POSITIVE_INFINITY : 1 + extraShaLimit + hongTeacherBonus;
    if (shaUsedCount < shaLimit)
        state.usedShaThisTurn = false;
    if (state.usedShaThisTurn)
        throw new Error("本回合已经使用过杀。");
    if (discardPhysicalCard)
        discardUsedCard(state, current, card);
    current.skillState = { ...current.skillState, shaUsedCount: shaUsedCount + 1 };
    if (!hasZhuge && shaUsedCount + 1 >= shaLimit)
        state.usedShaThisTurn = true;
    state.activeTurn.shaUsed = true;
    state.activeTurn.firstShaPlayed = true;
    const ignoreArmor = hasWeaponKey(current, "qinggang");
    const dengBonus = isDengGou(current) && current.skillState?.dengRebelBoost ? 1 : 0;
    const amount = (card.damage ?? 1) + state.activeTurn.jiuDamageBonus + dengBonus;
    const damageNature = card.cardKey === "sha" && hasWeaponKey(current, "zhuque") ? "fire" : (card.damageNature ?? "normal");
    state.activeTurn.jiuDamageBonus = 0;
    const effect = {
        kind: "damage",
        sourceSeatId: current.seatId,
        targetSeatId: target.seatId,
        amount,
        cardName: card.name,
        nature: damageNature,
        ignoreArmor,
        sourceCardKey: card.cardKey,
        sourceSuit: card.suit,
    };
    if (dengBonus)
        events.push(`${current.playerName} 的三五使本次杀伤害 +1。`);
    if (damageNature === "fire" && card.cardKey === "sha")
        events.push(`${current.playerName} 的朱雀羽扇将普通杀转化为火杀。`);
    if (hasWeaponKey(current, "cixiong") &&
        current.character.gender &&
        target.character.gender &&
        current.character.gender !== target.character.gender) {
        if (target.hand.length > 0) {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "target-card",
                chooserSeatId: target.seatId,
                sourceSeatId: current.seatId,
                cardName: "cixiong-sword",
                effect,
                prompt: `${target.playerName} 选择弃置一张手牌，否则 ${current.playerName} 摸一张牌。`,
                choices: target.hand.map((item, index) => choiceFromCard(item, "hand", target.seatId, undefined, `手牌 ${index + 1}`)),
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
            state.logs.push(...events);
            return;
        }
        else {
            drawCards(state, current, 1);
            events.push(`${current.playerName} 的雌雄双股剑触发，摸 1 张牌。`);
        }
    }
    if (startDengShaTransferChoice(state, current, target, card, effect, events))
        return;
    startShaResponse(state, current, target, card, effect, events);
}
function startShaResponse(state, source, target, card, effect, events) {
    const ignoreArmor = Boolean(effect.ignoreArmor);
    if (!ignoreArmor && hasArmorKey(target, "tengjia") && card.cardKey === "sha" && effect.nature === "normal") {
        events.push(`${target.playerName} 的藤甲免疫了普通杀。`);
        state.logs.push(...events);
        return;
    }
    if (!ignoreArmor && hasArmorKey(target, "renwang") && card.cardKey === "sha" && (card.suit === "spade" || card.suit === "club")) {
        events.push(`${target.playerName} 的仁王盾抵消了黑色杀。`);
        state.logs.push(...events);
        return;
    }
    if (!ignoreArmor && !effect.skipBaguaChoice && hasArmorKey(target, "bagua")) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-confirm",
            chooserSeatId: target.seatId,
            sourceSeatId: source.seatId,
            cardName: "bagua-armor",
            effect: { ...effect, skipBaguaChoice: true },
            prompt: `${target.playerName} 可以发动八卦阵进行判定，红色视为使用闪。`,
            choices: [],
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return;
    }
    state.pendingResponse = {
        id: responseId(state),
        responseType: "shan",
        responderSeatId: target.seatId,
        sourceSeatId: source.seatId,
        cardName: card.name,
        prompt: `${target.playerName} 需要使用闪响应 ${card.name}。`,
        effect,
    };
    state.phase = "response";
    events.push(state.pendingResponse.prompt);
    state.logs.push(...events);
}
function startDengShaTransferChoice(state, source, target, card, effect, events) {
    if (!isDengGou(target))
        return false;
    const charges = Number(target.skillState?.dengTransferCharges ?? 0);
    if (charges <= 0)
        return false;
    const targetSeatIds = state.seats
        .filter((seat) => seat.alive &&
        seat.seatId !== source.seatId &&
        seat.seatId !== target.seatId &&
        canReachShaTarget(state, target, seat))
        .map((seat) => seat.seatId);
    if (targetSeatIds.length === 0)
        return false;
    state.pendingChoice = {
        id: choiceId(state),
        kind: "sha-transfer",
        chooserSeatId: target.seatId,
        sourceSeatId: source.seatId,
        cardName: card.name,
        effect,
        prompt: `${target.playerName} 可发动转杀，将 ${card.name} 转移给攻击范围内的其他角色。`,
        choices: [],
        targetSeatIds,
    };
    state.phase = "response";
    events.push(state.pendingChoice?.prompt ?? "火攻结算。");
    state.logs.push(...events);
    return true;
}
function discardCard(state, current, cardId) {
    if (state.phase !== "discard")
        throw new Error("当前阶段不能弃牌。");
    if (current.hand.length <= getHandLimit(current))
        throw new Error("当前不需要继续弃牌。");
    const card = takeCard(current.hand, cardId);
    if (!card)
        throw new Error("手牌不存在。");
    discardToPile(state, current, card);
    const events = [`${current.playerName} 弃置 ${card.name}。`];
    state.logs.push(...events);
    if (current.hand.length <= getHandLimit(current)) {
        events.push(...advancePhase(state, true));
    }
    return { state, events };
}
function chooseOpeningIdentity(state, playerId, reveal) {
    const pending = requirePendingChoice(state, playerId);
    if (pending.kind !== "opening-identity" || pending.effect.kind !== "opening-identity") {
        throw new Error("当前不需要处理开局身份选择。");
    }
    const chooser = requireSeatById(state, pending.chooserSeatId);
    const queue = [...(pending.queue ?? [])];
    const events = [];
    if (reveal && chooser.identityRole === "lord") {
        throw new Error("主公身份不能使用三五自爆身份。");
    }
    chooser.skillState = {
        ...chooser.skillState,
        dengOpeningChoiceDone: true,
    };
    if (reveal) {
        chooser.identityRevealed = true;
        chooser.skillState.dengRevealed = true;
        if (chooser.identityRole === "rebel") {
            chooser.skillState.dengRebelBoost = true;
            events.push(`${chooser.playerName} 发动三五公开反贼身份：杀伤害 +1，摸牌阶段额外摸 1 张。`);
        }
        else if (chooser.identityRole === "renegade") {
            chooser.skillState.dengRenegadeLimitBoost = true;
            chooser.skillState.dengRenegadeReviveAvailable = true;
            events.push(`${chooser.playerName} 发动三五公开内奸身份：手牌上限 +2，并获得一次起死回生。`);
        }
        else {
            events.push(`${chooser.playerName} 发动三五公开身份。`);
        }
    }
    else {
        chooser.skillState.dengHiddenHorse = true;
        events.push(`${chooser.playerName} 选择隐藏身份，视为拥有一匹额外 +1 马。`);
    }
    state.pendingChoice = {
        ...pending,
        queue,
    };
    return finishDengOpeningChoice(state, events);
}
function advancePhaseAction(state, current, endTurnRequested) {
    const events = advancePhase(state, endTurnRequested);
    if (state.phase === "discard" && current.hand.length > getHandLimit(current)) {
        events.push(`${current.playerName} 需要弃牌至 ${getHandLimit(current)} 张。`);
    }
    state.logs.push(...events);
    return { state, events };
}
function endTurn(state, current) {
    if (state.phase === "play" && current.hand.length > getHandLimit(current)) {
        state.phase = "discard";
        const events = [`${current.playerName} 进入弃牌阶段。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (current.hand.length > getHandLimit(current)) {
        throw new Error(`请弃牌到 ${getHandLimit(current)} 张。`);
    }
    const events = advanceTurn(state);
    return { state, events };
}
function autoTimeout(state, current) {
    const events = [`${current.playerName} 操作超时。`];
    while ((state.phase === "discard" || current.hand.length > getHandLimit(current)) && current.hand.length > getHandLimit(current)) {
        const card = current.hand.pop();
        if (!card)
            break;
        discardToPile(state, current, card);
        events.push(`${current.playerName} 自动弃置 ${card.name}。`);
    }
    state.logs.push(...events);
    events.push(...advancePhase(state, true));
    return { state, events };
}
function respondCard(state, playerId, cardId) {
    const pending = requirePendingResponse(state, playerId);
    const responder = requireResponseSeatForPlayer(state, pending, playerId);
    const card = takeCard(responder.hand, cardId);
    if (card)
        markCardVoice(state, responder, card);
    if (!card)
        throw new Error("响应牌不存在。");
    const dyingSeat = state.pendingDying ? requireSeatById(state, state.pendingDying.seatId) : undefined;
    const canUseJiuAsRescue = pending.responseType === "tao" &&
        card.cardKey === "jiu" &&
        dyingSeat?.seatId === responder.seatId;
    if (!cardMatchesResponse(card, pending.responseType) && !canUseJiuAsRescue) {
        responder.hand.push(card);
        throw new Error(`请使用 ${responseName(pending.responseType)} 响应。`);
    }
    discardToPile(state, responder, card);
    const events = [`${responder.playerName} 使用 ${card.name} 响应。`];
    if (pending.responseType === "wuxie") {
        return continueWuxieResponse(state, pending, responder, events);
    }
    if (pending.responseType === "shan" && pending.effect.kind === "damage") {
        events.push(`${responder.playerName} 闪避了 ${pending.cardName}。`);
        clearPendingResponse(state);
        if (startPostShanWeaponChoice(state, pending.effect, events)) {
            state.logs.push(...events);
            return { state, events };
        }
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.effect.kind === "jiedao" && pending.responseType === "sha") {
        clearPendingResponse(state);
        const targetSeatId = pending.effect.targetSeatId;
        if (targetSeatId) {
            const target = requireSeatById(state, targetSeatId);
            const effect = {
                kind: "damage",
                sourceSeatId: responder.seatId,
                targetSeatId: target.seatId,
                amount: card.damage ?? 1,
                cardName: card.name,
                nature: card.damageNature ?? "normal",
                sourceCardKey: card.cardKey,
                sourceSuit: card.suit,
            };
            if (!startDengShaTransferChoice(state, responder, target, card, effect, events)) {
                startShaResponse(state, responder, target, card, effect, events);
            }
        }
        else {
            state.logs.push(...events);
        }
        return { state, events };
    }
    if (pending.effect.kind === "aoe") {
        state.logs.push(...events);
        return continueAoe(state, pending.effect, events);
    }
    if (pending.effect.kind === "duel") {
        const nextResponder = responder.seatId === pending.effect.sourceSeatId
            ? pending.effect.targetSeatId
            : pending.effect.sourceSeatId;
        const next = requireSeatById(state, nextResponder);
        state.pendingResponse = {
            ...pending,
            id: responseId(state),
            responderSeatId: next.seatId,
            prompt: `${next.playerName} 需要对决斗使用杀。`,
            effect: {
                ...pending.effect,
                responderSeatId: next.seatId,
            },
        };
        state.phase = "response";
        events.push(state.pendingResponse.prompt);
        state.logs.push(...events.slice(1));
        return { state, events };
    }
    if (pending.responseType === "tao" && pending.effect.kind === "dying" && state.pendingDying) {
        const target = requireSeatById(state, state.pendingDying.seatId);
        target.hp = Math.min(target.maxHp, target.hp + 1);
        target.alive = true;
        events.push(`${target.playerName} 脱离濒死。`);
        const resume = state.pendingDying.resume;
        state.pendingDying = undefined;
        if (target.hp > 0 && resume && state.phase !== "finished") {
            state.pendingResponse = resume;
            state.phase = "response";
        }
        else {
            clearPendingResponse(state);
        }
        state.logs.push(...events);
        return { state, events };
    }
    throw new Error("当前响应无法处理。");
}
function respondBaoDoubleWuxie(state, action) {
    const pending = requirePendingResponse(state, action.playerId);
    if (pending.responseType !== "wuxie" || pending.mode !== "global")
        throw new Error("当前不能视为使用无懈可击。");
    const responder = requireResponseSeatForPlayer(state, pending, action.playerId);
    if (!isBaoTaihou(responder))
        throw new Error("只有包太后可以发动愚蠢。");
    const ids = Array.from(new Set(action.cardIds ?? []));
    if (ids.length !== 2)
        throw new Error("请选择两张手牌视为无懈可击。");
    const cards = ids.map((id) => takeCard(responder.hand, id));
    if (cards.some((card) => !card)) {
        for (const card of cards)
            if (card)
                responder.hand.push(card);
        throw new Error("选择的手牌不存在。");
    }
    for (const card of cards)
        discardToPile(state, responder, card);
    markSkillVoice(state, responder, action);
    const events = [`${responder.playerName} 发动愚蠢，将两张手牌当无懈可击使用。`];
    return continueWuxieResponse(state, pending, responder, events);
}
function continueWuxieResponse(state, pending, responder, events) {
    const depth = Number(pending.wuxieDepth ?? 0) + 1;
    const eligible = eligibleWuxieResponders(state);
    if (eligible.length === 0) {
        clearPendingResponse(state);
        events.push("场上已无人可继续响应无懈可击，响应窗口自动结束。");
        return finalizeWuxieResponse(state, { ...pending, wuxieDepth: depth }, events);
    }
    state.pendingResponse = {
        ...pending,
        id: responseId(state),
        responderSeatId: eligible[0] ?? responder.seatId,
        mode: "global",
        eligibleResponderSeatIds: eligible,
        passedSeatIds: [],
        wuxieDepth: depth,
        prompt: `所有玩家可继续使用无懈可击响应 ${pending.cardName}。`,
    };
    state.phase = "response";
    events.push(state.pendingResponse.prompt);
    state.logs.push(...events);
    return { state, events };
}
function startPostShanWeaponChoice(state, effect, events, skipQinglong = false) {
    const source = requireSeatById(state, effect.sourceSeatId);
    if (!source.alive)
        return false;
    const qinglongCards = source.hand.filter(isSha);
    if (!skipQinglong && hasWeaponKey(source, "qinglong") && qinglongCards.length > 0) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "target-card",
            chooserSeatId: source.seatId,
            sourceSeatId: source.seatId,
            cardName: "qinglong-blade",
            effect,
            prompt: `${source.playerName} 可以发动青龙偃月刀，再使用一张杀。`,
            choices: qinglongCards.map((card) => choiceFromCard(card, "hand", source.seatId)),
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        return true;
    }
    const discardChoices = collectTargetCardChoices(source);
    if (hasWeaponKey(source, "guanshi") && discardChoices.length >= 2) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "multi-card",
            chooserSeatId: source.seatId,
            sourceSeatId: source.seatId,
            cardName: "guanshi-axe",
            effect,
            prompt: `${source.playerName} 可以发动贯石斧，弃置两张牌令本次杀仍造成伤害。`,
            choices: discardChoices,
            minTargets: 2,
            maxTargets: 2,
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        return true;
    }
    return false;
}
function resumeShaResponseFromDamage(state, effect, events) {
    const source = requireSeatById(state, effect.sourceSeatId);
    const target = requireSeatById(state, effect.targetSeatId);
    const card = {
        id: `resume-${state.turn}-${effect.sourceSeatId}-${effect.targetSeatId}`,
        name: effect.cardName,
        cardKey: effect.sourceCardKey ?? "sha",
        category: "basic",
        suit: effect.sourceSuit ?? "spade",
        rank: 1,
        requiresTarget: true,
        responseType: "shan",
        damage: effect.amount,
        damageNature: effect.nature ?? "normal",
    };
    startShaResponse(state, source, target, card, effect, events);
}
function passResponse(state, playerId) {
    const pending = requirePendingResponse(state, playerId);
    const responder = requireResponseSeatForPlayer(state, pending, playerId);
    const events = [`${responder.playerName} 放弃响应。`];
    if (pending.responseType === "wuxie") {
        if (pending.mode === "global") {
            const eligible = pending.eligibleResponderSeatIds ?? eligibleWuxieResponders(state);
            const passed = Array.from(new Set([...(pending.passedSeatIds ?? []), responder.seatId]));
            const allPassed = eligible.every((seatId) => passed.includes(seatId));
            if (!allPassed) {
                state.pendingResponse = {
                    ...pending,
                    id: `${pending.id}-pass-${passed.length}`,
                    passedSeatIds: passed,
                    responderSeatId: eligible.find((seatId) => !passed.includes(seatId)) ?? pending.responderSeatId,
                };
                state.logs.push(...events);
                return { state, events };
            }
            clearPendingResponse(state);
            return finalizeWuxieResponse(state, pending, events);
        }
        const nextSeatId = shiftNextResponder(pending);
        if (nextSeatId) {
            const next = requireSeatById(state, nextSeatId);
            state.pendingResponse = { ...pending, responderSeatId: next.seatId };
            events.push(`${next.playerName} 可以使用无懈可击。`);
            state.logs.push(...events);
            return { state, events };
        }
        clearPendingResponse(state);
        state.logs.push(...events);
        return resolveEffect(state, pending.effect, events);
    }
    if (pending.effect.kind === "jiedao" && pending.responseType === "sha") {
        clearPendingResponse(state);
        transferWeaponForJiedao(state, pending.effect, events);
        state.phase = "play";
        state.logs.push(...events.slice(1));
        return { state, events };
    }
    if (pending.responseType === "shan" && pending.effect.kind === "damage") {
        clearPendingResponse(state);
        const paused = applyDamage(state, pending.effect.sourceSeatId, pending.effect.targetSeatId, pending.effect.amount, pending.effect.cardName, events, pending.effect.nature, undefined, pending.effect.ignoreArmor, { cardKey: pending.effect.sourceCardKey, suit: pending.effect.sourceSuit });
        if (!paused)
            state.logs.push(...events.slice(1));
        return { state, events };
    }
    if (pending.effect.kind === "aoe") {
        clearPendingResponse(state);
        const resume = nextAoeResponse(state, pending.effect);
        if (hasArmorKey(responder, "tengjia") && (pending.effect.nature ?? "normal") === "normal") {
            events.push(`${responder.playerName} 的藤甲免疫了 ${pending.effect.cardName}。`);
            if (resume) {
                state.pendingResponse = resume;
                state.phase = "response";
                events.push(resume.prompt);
            }
            else {
                state.phase = "play";
            }
            state.logs.push(...events.slice(1));
            return { state, events };
        }
        const paused = applyDamage(state, pending.effect.sourceSeatId, responder.seatId, pending.effect.amount, pending.effect.cardName, events, pending.effect.nature, resume, pending.effect.ignoreArmor, { cardKey: pending.effect.sourceCardKey, suit: pending.effect.sourceSuit });
        if (paused)
            return { state, events };
        if (resume) {
            state.pendingResponse = resume;
            state.phase = "response";
            events.push(resume.prompt);
        }
        else {
            state.phase = "play";
        }
        state.logs.push(...events.slice(1));
        return { state, events };
    }
    if (pending.effect.kind === "duel") {
        clearPendingResponse(state);
        const damageSource = responder.seatId === pending.effect.sourceSeatId
            ? pending.effect.targetSeatId
            : pending.effect.sourceSeatId;
        applyDamage(state, damageSource, responder.seatId, 1, pending.effect.cardName, events);
        if (!state.pendingResponse && state.phase !== "finished")
            state.phase = "play";
        state.logs.push(...events.slice(1));
        return { state, events };
    }
    if (pending.responseType === "tao" && pending.effect.kind === "dying" && state.pendingDying) {
        const nextSeatId = shiftNextResponder(pending);
        if (nextSeatId) {
            const next = requireSeatById(state, nextSeatId);
            state.pendingResponse = {
                ...pending,
                responderSeatId: next.seatId,
                queue: pending.queue,
                prompt: `${next.playerName} 可以使用桃救援。`,
            };
            events.push(state.pendingResponse.prompt);
            state.logs.push(...events);
            return { state, events };
        }
        const dying = requireSeatById(state, state.pendingDying.seatId);
        const deathSourceSeatId = state.pendingDying.sourceSeatId;
        const killer = state.seats.find((seat) => seat.seatId === deathSourceSeatId);
        if (killer && killer.seatId !== dying.seatId) {
            events.push(`${killer.playerName} 击败 ${dying.playerName}。`);
        }
        dying.alive = false;
        dying.hp = 0;
        events.push(`${dying.playerName} 出局。`);
        const resume = state.pendingDying.resume;
        state.pendingDying = undefined;
        clearPendingResponse(state);
        handleSeatDeath(state, dying, deathSourceSeatId, events);
        finishIfOnlyOneAlive(state, events);
        if (state.phase !== "finished" && resume) {
            state.pendingResponse = skipDeadResponder(state, resume);
            state.phase = state.pendingResponse ? "response" : "play";
        }
        state.logs.push(...events.slice(1));
        return { state, events };
    }
    throw new Error("当前响应无法跳过。");
}
function timeoutGlobalWuxie(state) {
    const pending = state.pendingResponse;
    if (!pending || pending.responseType !== "wuxie" || pending.mode !== "global")
        throw new Error("当前不是全场无懈响应。");
    const events = ["无懈可击响应窗口结束，未响应者视为不响应。"];
    clearPendingResponse(state);
    return finalizeWuxieResponse(state, pending, events);
}
function buildTrickEffect(state, source, card, targetSeatId) {
    if (card.cardKey === "wuzhong") {
        return { kind: "draw", sourceSeatId: source.seatId, amount: 2, cardName: card.name };
    }
    if (card.cardKey === "guohe") {
        const target = requireTargetWithCards(state, source, targetSeatId, "过河拆桥");
        return { kind: "target-card", sourceSeatId: source.seatId, targetSeatId: target.seatId, action: "discard", cardName: card.name };
    }
    if (card.cardKey === "shunshou") {
        const target = requireTargetWithCards(state, source, targetSeatId, "顺手牵羊");
        if (getSeatDistance(state, source, target) > 1)
            throw new Error("顺手牵羊只能选择距离 1 内的目标。");
        return { kind: "target-card", sourceSeatId: source.seatId, targetSeatId: target.seatId, action: "steal", cardName: card.name };
    }
    if (card.cardKey === "juedou") {
        const target = requireTarget(state, source, targetSeatId);
        return { kind: "duel", sourceSeatId: source.seatId, targetSeatId: target.seatId, responderSeatId: target.seatId, cardName: card.name };
    }
    if (card.cardKey === "jiedao") {
        const target = requireTarget(state, source, targetSeatId);
        if (!target.equipment.weapon)
            throw new Error("借刀杀人的目标必须装备武器。");
        return { kind: "jiedao", sourceSeatId: source.seatId, weaponSeatId: target.seatId, cardName: card.name };
    }
    if (card.cardKey === "nanman") {
        return {
            kind: "aoe",
            sourceSeatId: source.seatId,
            responseType: "sha",
            queue: aliveOtherSeatIds(state, source.seatId),
            amount: 1,
            cardName: card.name,
            sourceCardKey: card.cardKey,
            sourceSuit: card.suit,
        };
    }
    if (card.cardKey === "wanjian") {
        return {
            kind: "aoe",
            sourceSeatId: source.seatId,
            responseType: "shan",
            queue: aliveOtherSeatIds(state, source.seatId),
            amount: 1,
            cardName: card.name,
            sourceCardKey: card.cardKey,
            sourceSuit: card.suit,
        };
    }
    if (card.cardKey === "taoyuan") {
        return { kind: "heal-all", sourceSeatId: source.seatId, amount: 1, cardName: card.name };
    }
    if (card.cardKey === "wugu") {
        return { kind: "wugu", sourceSeatId: source.seatId, queue: responseQueueFrom(state, source.seatId, true), cardName: card.name };
    }
    if (card.cardKey === "huogong") {
        const target = requireTargetWithCards(state, source, targetSeatId, "火攻");
        return { kind: "huogong", sourceSeatId: source.seatId, targetSeatId: target.seatId, cardName: card.name };
    }
    if (card.cardKey === "tiesuo") {
        const target = targetSeatId ? requireTarget(state, source, targetSeatId) : undefined;
        return { kind: "chain", sourceSeatId: source.seatId, targetSeatIds: target ? [target.seatId] : [source.seatId], cardName: card.name };
    }
    if (card.delayedTrickType) {
        const target = card.cardKey === "shandian" ? source : requireTarget(state, source, targetSeatId);
        if (target.judgementArea.some((item) => item.delayedTrickType === card.delayedTrickType)) {
            throw new Error(`${target.playerName} 的判定区已有同名延时锦囊。`);
        }
        return {
            kind: "delayed",
            sourceSeatId: source.seatId,
            targetSeatId: target.seatId,
            cardName: card.name,
            delayedTrickType: card.delayedTrickType,
            cardId: card.id,
        };
    }
    throw new Error("该牌暂未实现。");
}
function startWuxieCheck(state, sourceSeatId, cardName, effect, events) {
    const eligible = eligibleWuxieResponders(state);
    if (eligible.length === 0)
        return resolveEffect(state, effect, events);
    const responder = requireSeatById(state, eligible[0]);
    state.phase = "response";
    state.pendingResponse = {
        id: responseId(state),
        responseType: "wuxie",
        responderSeatId: responder.seatId,
        sourceSeatId,
        cardName,
        prompt: `所有玩家可使用无懈可击响应 ${cardName}。`,
        effect,
        mode: "global",
        eligibleResponderSeatIds: eligible,
        passedSeatIds: [],
        wuxieDepth: 0,
    };
    events.push(state.pendingResponse.prompt);
    state.logs.push(state.pendingResponse.prompt);
    return { state, events };
}
function startTiesuoChoice(state, source, card, initialTargetSeatId, events) {
    const legalTargets = aliveSeatIds(state);
    const selected = initialTargetSeatId && legalTargets.includes(initialTargetSeatId) ? [initialTargetSeatId] : [];
    state.pendingChoice = {
        id: choiceId(state),
        kind: "multi-target-seat",
        chooserSeatId: source.seatId,
        sourceSeatId: source.seatId,
        cardName: card.name,
        effect: { kind: "chain", sourceSeatId: source.seatId, targetSeatIds: selected, cardName: card.name },
        prompt: `${source.playerName} 选择 1-2 名角色横置或重置；也可以重铸摸 1 张。`,
        choices: [],
        targetSeatIds: legalTargets,
        selectedTargetSeatIds: selected,
        minTargets: 1,
        maxTargets: 2,
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    state.logs.push(state.pendingChoice.prompt);
    return { state, events };
}
function resolveEffect(state, effect, events) {
    if (effect.kind === "draw") {
        const source = requireSeatById(state, effect.sourceSeatId);
        drawCards(state, source, effect.amount);
        events.push(`${source.playerName} 摸 ${effect.amount} 张牌。`);
    }
    if (effect.kind === "discard-random" || effect.kind === "steal-random") {
        const normalized = {
            kind: "target-card",
            sourceSeatId: effect.sourceSeatId,
            targetSeatId: effect.targetSeatId,
            action: effect.kind === "discard-random" ? "discard" : "steal",
            cardName: effect.cardName,
        };
        return startTargetCardChoice(state, normalized, events);
    }
    if (effect.kind === "target-card") {
        return startTargetCardChoice(state, effect, events);
    }
    if (effect.kind === "heal-all") {
        for (const seat of state.seats.filter((item) => item.alive)) {
            if (seat.hp < seat.maxHp)
                seat.hp = Math.min(seat.maxHp, seat.hp + effect.amount);
        }
        events.push("所有存活玩家回复 1 点体力。");
    }
    if (effect.kind === "aoe") {
        const response = nextAoeResponse(state, effect);
        if (response) {
            state.pendingResponse = response;
            state.phase = "response";
            events.push(response.prompt);
            state.logs.push(...events);
            return { state, events };
        }
    }
    if (effect.kind === "duel") {
        const target = requireSeatById(state, effect.targetSeatId);
        state.pendingResponse = {
            id: responseId(state),
            responseType: "sha",
            responderSeatId: target.seatId,
            sourceSeatId: effect.sourceSeatId,
            cardName: effect.cardName,
            prompt: `${target.playerName} 需要对决斗使用杀。`,
            effect,
        };
        state.phase = "response";
        events.push(state.pendingResponse.prompt);
        state.logs.push(...events);
        return { state, events };
    }
    if (effect.kind === "wugu") {
        revealPublicCards(state, aliveSeatIds(state).length);
        events.push(`五谷丰登翻开 ${state.publicCards.length} 张牌。`);
        return continueWuguChoice(state, effect.queue, effect, events);
    }
    if (effect.kind === "jiedao") {
        return startJiedaoChoice(state, effect, events);
    }
    if (effect.kind === "huogong") {
        return startHuogongChoice(state, effect, events);
    }
    if (effect.kind === "chain") {
        for (const targetSeatId of effect.targetSeatIds.slice(0, 2)) {
            const target = requireSeatById(state, targetSeatId);
            target.chained = !target.chained;
            events.push(`${target.playerName} ${target.chained ? "进入横置" : "解除横置"}。`);
        }
    }
    if (effect.kind === "delayed") {
        const target = requireSeatById(state, effect.targetSeatId);
        const card = takeCard(state.discardPile, effect.cardId) ?? takeCard(state.revealedCards, effect.cardId);
        if (card) {
            target.judgementArea.push(card);
            events.push(`${card.name} 进入 ${target.playerName} 的判定区。`);
        }
    }
    state.phase = "play";
    state.logs.push(...events.slice(-2));
    return { state, events };
}
function startTargetCardChoice(state, effect, events) {
    const source = requireSeatById(state, effect.sourceSeatId);
    const target = requireSeatById(state, effect.targetSeatId);
    const choices = collectTargetCardChoices(target);
    if (choices.length === 0) {
        events.push(`${target.playerName} 没有可处理的牌。`);
        state.phase = "play";
        state.logs.push(...events.slice(-2));
        return { state, events };
    }
    state.pendingChoice = {
        id: choiceId(state),
        kind: "target-card",
        chooserSeatId: source.seatId,
        sourceSeatId: source.seatId,
        cardName: effect.cardName,
        effect,
        prompt: `${source.playerName} 选择 ${target.playerName} 的一张牌。`,
        choices,
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    state.logs.push(...events);
    return { state, events };
}
function startJiedaoChoice(state, effect, events) {
    const source = requireSeatById(state, effect.sourceSeatId);
    const weaponSeat = requireSeatById(state, effect.weaponSeatId);
    const targets = state.seats
        .filter((seat) => seat.alive && seat.seatId !== weaponSeat.seatId && canReachShaTarget(state, weaponSeat, seat))
        .map((seat) => seat.seatId);
    if (!weaponSeat.equipment.weapon || targets.length === 0) {
        events.push(`${weaponSeat.playerName} 没有可执行借刀杀人的目标。`);
        state.phase = "play";
        state.logs.push(...events.slice(-2));
        return { state, events };
    }
    state.pendingChoice = {
        id: choiceId(state),
        kind: "target-seat",
        chooserSeatId: source.seatId,
        sourceSeatId: source.seatId,
        cardName: effect.cardName,
        effect,
        prompt: `${source.playerName} 为借刀杀人选择被攻击目标。`,
        choices: [],
        targetSeatIds: targets,
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    state.logs.push(...events);
    return { state, events };
}
function startHuogongChoice(state, effect, events) {
    const source = requireSeatById(state, effect.sourceSeatId);
    const target = requireSeatById(state, effect.targetSeatId);
    if (target.hand.length === 0) {
        events.push(`${target.playerName} 没有手牌，火攻无效。`);
        state.phase = "play";
        state.logs.push(...events.slice(-2));
        return { state, events };
    }
    state.pendingChoice = {
        id: choiceId(state),
        kind: "huogong-reveal",
        chooserSeatId: target.seatId,
        sourceSeatId: source.seatId,
        cardName: effect.cardName,
        effect,
        prompt: `${target.playerName} 需要展示一张手牌给 ${source.playerName} 结算火攻。`,
        choices: target.hand.map((card, index) => choiceFromCard(card, "hand", target.seatId, undefined, `手牌 ${index + 1}`)),
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    state.logs.push(...events);
    return { state, events };
    /*
    state.pendingChoice = {
      id: choiceId(state),
      kind: "discard-suit",
      chooserSeatId: source.seatId,
      sourceSeatId: source.seatId,
      cardName: effect.cardName,
      effect: { ...effect, revealedCardId: shown.id, requiredSuit: shown.suit },
      prompt: `${target.playerName} 展示 ${shown.name}（${suitName(shown.suit)}），${source.playerName} 可弃一张${suitName(shown.suit)}牌造成火焰伤害。`,
      choices,
      requiredSuit: shown.suit,
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    state.logs.push(...events);
    return { state, events };
    */
}
function choosePendingCard(state, playerId, cardId, choiceIdValue) {
    const pending = requirePendingChoice(state, playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    const events = [`${chooser.playerName} 完成选择。`];
    if (pending.kind === "skill-option" && pending.cardName === "shen-boss-talent-option") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        if (choice.cardId === "shen-boss-sha-limit") {
            chooser.skillState = { ...chooser.skillState, shenBossShaLimitBonus: 1 };
            state.pendingChoice = undefined;
            state.phase = "play";
            events.push(`${chooser.playerName} 选择本回合杀次数上限 +1。`);
        }
        else if (choice.cardId === "shen-boss-prevent") {
            chooser.skillState = { ...chooser.skillState, shenBossPreventDamageAvailable: true, shenBossDamageShieldUsed: false };
            state.pendingChoice = undefined;
            state.phase = "play";
            events.push(`${chooser.playerName} 选择本回合首次受伤可弃牌防止。`);
        }
        else {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "multi-card",
                chooserSeatId: chooser.seatId,
                sourceSeatId: chooser.seatId,
                cardName: "shen-boss-cycle",
                effect: { kind: "draw", sourceSeatId: chooser.seatId, amount: 0, cardName: "腰折的天才" },
                prompt: `${chooser.playerName} 可弃置一至两张手牌并摸等量牌，也可跳过。`,
                choices: chooser.hand.map((card) => choiceFromCard(card, "hand", chooser.seatId)),
                minTargets: 1,
                maxTargets: 2,
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
        }
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.cardName === "shen-boss-prevent-damage" && pending.effect.kind === "damage") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        const discarded = takeChoiceCard(state, choice);
        if (!discarded)
            throw new Error("减伤弃置牌不存在。");
        discardToPile(state, chooser, discarded);
        chooser.skillState = { ...chooser.skillState, shenBossPreventDamageAvailable: false, shenBossDamageShieldUsed: true };
        state.pendingChoice = undefined;
        state.phase = "play";
        events.push(`${chooser.playerName} 弃置 ${discarded.name}，防止本次伤害。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.cardName === "cixiong-sword" && pending.effect.kind === "damage") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        const discarded = takeChoiceCard(state, choice);
        if (!discarded)
            throw new Error("雌雄双股剑弃置牌不存在。");
        discardToPile(state, chooser, discarded);
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 因雌雄双股剑弃置一张手牌。`);
        resumeShaResponseFromDamage(state, pending.effect, events);
        return { state, events };
    }
    if (pending.cardName === "qinglong-blade" && pending.effect.kind === "damage") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        const sha = takeCard(source.hand, choice.cardId);
        if (!sha || !isSha(sha))
            throw new Error("请选择一张杀继续追击。");
        discardToPile(state, source, sha);
        markCardVoice(state, source, sha);
        state.pendingChoice = undefined;
        const target = requireSeatById(state, pending.effect.targetSeatId);
        const effect = {
            kind: "damage",
            sourceSeatId: source.seatId,
            targetSeatId: target.seatId,
            amount: sha.damage ?? 1,
            cardName: sha.name,
            nature: sha.damageNature ?? "normal",
            ignoreArmor: hasWeaponKey(source, "qinggang"),
            sourceCardKey: sha.cardKey,
            sourceSuit: sha.suit,
        };
        events.push(`${source.playerName} 发动青龙偃月刀，继续对 ${target.playerName} 使用 ${sha.name}。`);
        startShaResponse(state, source, target, sha, effect, events);
        return { state, events };
    }
    if (pending.cardName === "shen-boss-prevent-damage" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未弃牌，本次伤害正常结算。`);
        const effect = pending.effect;
        const paused = applyDamage(state, effect.sourceSeatId, effect.targetSeatId, effect.amount, effect.cardName, events, effect.nature, undefined, effect.ignoreArmor, { cardKey: effect.sourceCardKey, suit: effect.sourceSuit }, Boolean(effect.skipKgMercy), Boolean(effect.skipHanbingChoice), true);
        if (!paused)
            state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "huogong-reveal" && pending.effect.kind === "huogong") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        const target = requireSeatById(state, pending.effect.targetSeatId);
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        const shown = target.hand.find((card) => card.id === choice.cardId);
        if (!shown)
            throw new Error("火攻展示牌不存在。");
        state.revealedCards.push({ ...shown });
        const choices = source.hand
            .filter((card) => card.suit === shown.suit)
            .map((card) => choiceFromCard(card, "hand", source.seatId));
        state.pendingChoice = {
            id: choiceId(state),
            kind: "discard-suit",
            chooserSeatId: source.seatId,
            sourceSeatId: source.seatId,
            cardName: pending.effect.cardName,
            effect: { ...pending.effect, revealedCardId: shown.id, requiredSuit: shown.suit },
            prompt: `${target.playerName} 展示 ${shown.name}（${suitName(shown.suit)}），${source.playerName} 可弃一张${suitName(shown.suit)}牌造成火焰伤害。`,
            choices,
            requiredSuit: shown.suit,
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "target-card" && pending.effect.kind === "target-card") {
        const choice = requireChoiceOption(pending, cardId, choiceIdValue);
        const card = takeChoiceCard(state, choice);
        if (!card)
            throw new Error("选择的牌不存在。");
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        const owner = choice.ownerSeatId ? requireSeatById(state, choice.ownerSeatId) : undefined;
        if (pending.effect.action === "discard") {
            if (owner)
                discardToPile(state, owner, card);
            else
                state.discardPile.push(card);
            state.revealedCards.push(card);
            events.push(`${source.playerName} 弃置 ${owner?.playerName ?? "目标"} 的 ${card.name}。`);
        }
        else {
            source.hand.push(card);
            events.push(`${source.playerName} 获得 ${owner?.playerName ?? "目标"} 的一张牌。`);
        }
        state.pendingChoice = undefined;
        state.phase = "play";
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "public-card" && pending.effect.kind === "wugu") {
        const card = takeCard(state.publicCards, cardId);
        if (!card)
            throw new Error("公共牌不存在。");
        chooser.hand.push(card);
        events.push(`${chooser.playerName} 从五谷丰登获得 ${card.name}。`);
        state.pendingChoice = undefined;
        return continueWuguChoice(state, pending.queue ?? [], pending.effect, events);
    }
    if (pending.kind === "discard-suit" && pending.effect.kind === "huogong") {
        const card = takeCard(chooser.hand, cardId);
        if (!card)
            throw new Error("手牌不存在。");
        if (card.suit !== pending.requiredSuit) {
            chooser.hand.push(card);
            throw new Error("请选择同花色手牌。");
        }
        discardToPile(state, chooser, card);
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 弃置同花色牌，火攻生效。`);
        applyDamage(state, pending.effect.sourceSeatId, pending.effect.targetSeatId, 1, pending.cardName, events, "fire");
        if (!state.pendingResponse && state.phase !== "finished")
            state.phase = "play";
        state.logs.push(...events);
        return { state, events };
    }
    throw new Error("当前选择无法使用这张牌。");
}
function choosePendingCards(state, playerId, cardIds) {
    const pending = requirePendingChoice(state, playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    if (pending.kind === "multi-card" && pending.cardName === "tudou-shenggen-prevent") {
        const uniqueIds = Array.from(new Set(cardIds));
        if (uniqueIds.length !== 2)
            throw new Error("生根需要弃置两张手牌来防止传导伤害。");
        const discarded = [];
        for (const id of uniqueIds) {
            const card = takeCard(chooser.hand, id);
            if (!card) {
                chooser.hand.push(...discarded);
                throw new Error("生根选择的手牌不存在。");
            }
            discarded.push(card);
        }
        for (const card of discarded)
            discardToPile(state, chooser, card);
        const effect = pending.effect;
        const target = effect.kind === "damage" ? requireSeatById(state, effect.targetSeatId) : undefined;
        state.pendingChoice = undefined;
        state.phase = "play";
        const events = [`${chooser.playerName} 弃置两张牌，防止生根传导给 ${target?.playerName ?? "目标"} 的伤害。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "multi-card" && pending.cardName === "shen-boss-cycle") {
        const uniqueIds = Array.from(new Set(cardIds));
        if (uniqueIds.length < 1 || uniqueIds.length > 2)
            throw new Error("请选择一至两张手牌。");
        const discarded = [];
        for (const id of uniqueIds) {
            const card = takeCard(chooser.hand, id);
            if (!card)
                throw new Error("选择的手牌不存在。");
            discarded.push(card);
        }
        for (const card of discarded)
            discardToPile(state, chooser, card);
        drawCards(state, chooser, discarded.length);
        state.pendingChoice = undefined;
        state.phase = "play";
        const events = [`${chooser.playerName} 弃置 ${discarded.length} 张手牌并摸等量牌。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind !== "multi-card" || pending.cardName !== "guanshi-axe" || pending.effect.kind !== "damage") {
        throw new Error("当前不需要选择多张牌。");
    }
    const uniqueIds = Array.from(new Set(cardIds));
    if (uniqueIds.length !== 2)
        throw new Error("贯石斧需要弃置两张牌。");
    const selected = uniqueIds.map((id) => pending.choices.find((choice) => choice.cardId === id));
    if (selected.some((choice) => !choice))
        throw new Error("贯石斧选择的牌不合法。");
    const removed = [];
    for (const choice of selected) {
        const card = takeChoiceCard(state, choice);
        if (!card)
            throw new Error("贯石斧选择的牌不存在。");
        removed.push(card);
    }
    for (const card of removed)
        discardToPile(state, chooser, card);
    state.pendingChoice = undefined;
    const events = [`${chooser.playerName} 发动贯石斧，弃置两张牌令本次杀仍造成伤害。`];
    const effect = pending.effect;
    const paused = applyDamage(state, effect.sourceSeatId, effect.targetSeatId, effect.amount, effect.cardName, events, effect.nature, undefined, effect.ignoreArmor, { cardKey: effect.sourceCardKey, suit: effect.sourceSuit }, Boolean(effect.skipKgMercy), true);
    if (!paused)
        state.logs.push(...events);
    return { state, events };
}
function choosePendingTarget(state, playerId, targetSeatId) {
    const pending = requirePendingChoice(state, playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    if (pending.kind === "skill-target" && pending.cardName === "tudou-faya") {
        if (!isTudou(chooser))
            throw new Error("只有土豆可以发动发芽。");
        if (!pending.targetSeatIds?.includes(targetSeatId))
            throw new Error("目标不合法。");
        const target = requireSeatById(state, targetSeatId);
        const round = getRoundNumber(state);
        chooser.skillState = { ...chooser.skillState, tudouFayaRound: round };
        drawCards(state, chooser, 1);
        drawCards(state, target, 1);
        state.pendingChoice = undefined;
        state.phase = "draw";
        const events = [`${chooser.playerName} 发动发芽，与 ${target.playerName} 各摸 1 张牌。`];
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "sha-transfer" && pending.effect.kind === "damage") {
        if (!pending.targetSeatIds?.includes(targetSeatId))
            throw new Error("目标不合法。");
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        const target = requireSeatById(state, targetSeatId);
        const charges = Number(chooser.skillState?.dengTransferCharges ?? 0);
        if (charges <= 0)
            throw new Error("转杀次数不足。");
        chooser.skillState = { ...chooser.skillState, dengTransferCharges: charges - 1 };
        state.pendingChoice = undefined;
        const effect = {
            ...pending.effect,
            targetSeatId: target.seatId,
        };
        const card = {
            cardKey: effect.sourceCardKey ?? "sha",
            suit: effect.sourceSuit ?? "spade",
            damageNature: effect.nature ?? "normal",
            name: pending.cardName,
        };
        const events = [`${chooser.playerName} 发动转杀，将 ${pending.cardName} 转移给 ${target.playerName}。`];
        startShaResponse(state, source, target, card, effect, events);
        return { state, events };
    }
    if (pending.kind === "skill-target" && pending.cardName === "op的神罚") {
        if (!pending.targetSeatIds?.includes(targetSeatId))
            throw new Error("目标不合法。");
        const source = requireSeatById(state, pending.sourceSeatId);
        const target = requireSeatById(state, targetSeatId);
        const events = [`${source.playerName} 发动 op的神罚，令 ${target.playerName} 获得 kg 标记。`];
        applyKgMarker(state, source, target, events);
        state.pendingChoice = undefined;
        state.phase = "prepare";
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-target" && pending.cardName === "sanshui-zixin-target") {
        if (!pending.targetSeatIds?.includes(targetSeatId))
            throw new Error("目标不合法。");
        const source = requireSeatById(state, pending.sourceSeatId);
        const target = requireSeatById(state, targetSeatId);
        const events = [`${source.playerName} 发动自刎归天，令 ${target.playerName} 获得 kg 标记。`];
        applyKgMarker(state, source, target, events);
        state.pendingChoice = undefined;
        resumeAfterDyingRecovery(state);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind !== "target-seat" || pending.effect.kind !== "jiedao") {
        throw new Error("当前不需要选择目标。");
    }
    if (!pending.targetSeatIds?.includes(targetSeatId))
        throw new Error("目标不合法。");
    const weaponSeat = requireSeatById(state, pending.effect.weaponSeatId);
    const target = requireSeatById(state, targetSeatId);
    state.pendingChoice = undefined;
    state.pendingResponse = {
        id: responseId(state),
        responseType: "sha",
        responderSeatId: weaponSeat.seatId,
        sourceSeatId: chooser.seatId,
        cardName: pending.cardName,
        prompt: `${weaponSeat.playerName} 需要对 ${target.playerName} 使用杀，否则交出武器。`,
        effect: { ...pending.effect, targetSeatId },
    };
    state.phase = "response";
    const events = [`${chooser.playerName} 指定 ${target.playerName} 为借刀杀人目标。`, state.pendingResponse.prompt];
    state.logs.push(...events);
    return { state, events };
}
function choosePendingTargets(state, playerId, targetSeatIds) {
    const pending = requirePendingChoice(state, playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    if (pending.kind !== "multi-target-seat" || pending.effect.kind !== "chain") {
        throw new Error("当前不需要选择多个目标。");
    }
    const uniqueTargets = Array.from(new Set(targetSeatIds)).filter((seatId) => pending.targetSeatIds?.includes(seatId));
    const minTargets = pending.minTargets ?? 1;
    const maxTargets = pending.maxTargets ?? 2;
    if (uniqueTargets.length < minTargets || uniqueTargets.length > maxTargets) {
        throw new Error(`请选择 ${minTargets}-${maxTargets} 名目标。`);
    }
    for (const seatId of uniqueTargets) {
        const target = requireSeatById(state, seatId);
        if (!target.alive)
            throw new Error("目标不合法。");
    }
    state.pendingChoice = undefined;
    const effect = {
        ...pending.effect,
        targetSeatIds: uniqueTargets,
    };
    const targetNames = uniqueTargets.map((seatId) => requireSeatById(state, seatId).playerName).join("、");
    const events = [`${chooser.playerName} 指定 ${targetNames} 结算铁索连环。`];
    return startWuxieCheck(state, chooser.seatId, pending.cardName, effect, events);
}
function choosePendingSkill(state, action) {
    const pending = requirePendingChoice(state, action.playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    if (pending.kind !== "skill-confirm")
        throw new Error("当前不需要确认技能。");
    if (action.skillId !== pending.cardName && action.skillId !== skillIdFromConfirmChoice(pending)) {
        throw new Error("技能确认不匹配。");
    }
    markSkillVoice(state, chooser, action);
    if (action.skillId === "sanshui-kg-mercy") {
        if (!isSanshui(chooser))
            throw new Error("只有三水先生可以发动 kg 的怜悯。");
        if (pending.effect.kind !== "damage")
            throw new Error("kg 的怜悯缺少伤害结算信息。");
        const target = requireSeatById(state, pending.effect.targetSeatId);
        if (target.skillState?.kgSourceSeatId !== chooser.seatId)
            throw new Error("目标没有对应的 kg 标记。");
        const discarded = takeDeterministicHandCard(state, target, `kg-mercy-${state.turn}-${target.hand.length}`);
        if (discarded)
            discardToPile(state, target, discarded);
        state.pendingChoice = undefined;
        if (state.phase !== "finished")
            state.phase = "play";
        const events = [
            discarded
                ? `${chooser.playerName} 发动 kg 的怜悯，防止伤害并弃置 ${target.playerName} 一张手牌。`
                : `${chooser.playerName} 发动 kg 的怜悯，防止伤害；${target.playerName} 没有手牌可弃。`,
        ];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "hanbing-sword") {
        if (pending.effect.kind !== "damage")
            throw new Error("寒冰剑缺少伤害结算信息。");
        const target = requireSeatById(state, pending.effect.targetSeatId);
        const removableChoices = collectTargetCardChoices(target).slice(0, 2);
        const discardedNames = [];
        for (const choice of removableChoices) {
            const removed = takeChoiceCard(state, choice);
            if (removed) {
                discardToPile(state, target, removed);
                discardedNames.push(removed.name);
            }
        }
        state.pendingChoice = undefined;
        if (state.phase !== "finished")
            state.phase = "play";
        const events = [
            discardedNames.length > 0
                ? `${chooser.playerName} 发动寒冰剑，防止本次伤害，并弃置 ${target.playerName} 的 ${discardedNames.join("、")}。`
                : `${chooser.playerName} 发动寒冰剑，防止本次伤害，但 ${target.playerName} 没有可弃置的牌。`,
        ];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "bagua-armor") {
        if (pending.effect.kind !== "damage")
            throw new Error("八卦阵缺少响应信息。");
        state.pendingChoice = undefined;
        const events = [];
        if (tryBaguaDodge(state, chooser, events)) {
            state.phase = "play";
            state.logs.push(...events);
            return { state, events };
        }
        events.push(`${chooser.playerName} 的八卦阵未判定成功，仍需使用闪。`);
        resumeShaResponseFromDamage(state, pending.effect, events);
        return { state, events };
    }
    if (action.skillId === "shen-black-sha-steal") {
        if (!isShenZhuxi(chooser) || pending.effect.kind !== "steal-random")
            throw new Error("乒乓高手结算信息无效。");
        const target = requireSeatById(state, pending.effect.targetSeatId);
        const stolen = takeDeterministicHandCard(state, target, `shen-${chooser.seatId}-${target.seatId}-${state.turn}`);
        if (stolen)
            chooser.hand.push(stolen);
        chooser.skillState = {
            ...chooser.skillState,
            shenBlackShaStealUsed: Number(chooser.skillState?.shenBlackShaStealUsed ?? 0) + 1,
        };
        state.pendingChoice = undefined;
        state.phase = "play";
        const events = [stolen ? `${chooser.playerName} 发动乒乓高手，抽取 ${target.playerName} 一张手牌。` : `${target.playerName} 没有可抽取的手牌。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "sanshui-kg-trick-draw") {
        if (!isSanshui(chooser) || pending.effect.kind !== "draw")
            throw new Error("op的神罚摸牌结算信息无效。");
        const round = getRoundNumber(state);
        drawCards(state, chooser, 1);
        chooser.skillState = { ...chooser.skillState, sanshuiKgTrickRound: round, sanshuiKgTrickPendingRound: undefined };
        state.pendingChoice = undefined;
        state.phase = "play";
        const events = [`${chooser.playerName} 发动 op的神罚，因带 kg 角色使用锦囊摸 1 张牌。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "yang-qiaoshe") {
        if (!isYangHaiyan(chooser))
            throw new Error("只有杨嗨厌可以发动巧舌如簧。");
        const round = getRoundNumber(state);
        const judge = drawJudgeCard(state);
        state.revealedCards.push(judge);
        state.discardPile.push(judge);
        chooser.skillState = { ...chooser.skillState, yangQiaosheRound: round };
        const events = [`${chooser.playerName} 发动巧舌如簧，判定为 ${suitName(judge.suit)} ${judge.rank}。`];
        if (judge.suit === "heart") {
            chooser.hand.push(createGeneratedCard("lebu", `yang-qiaoshe-${state.turn}-${chooser.hand.length}`));
            events.push(`${chooser.playerName} 判定为红桃，获得一张乐不思蜀。`);
        }
        state.pendingChoice = undefined;
        state.phase = "draw";
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "sanshui-zixin") {
        if (!isSanshui(chooser) || pending.effect.kind !== "dying" || !state.pendingDying) {
            throw new Error("自刎归天结算信息无效。");
        }
        if (chooser.skillState?.sanshuiZixinUsed || chooser.maxHp <= 1)
            throw new Error("自刎归天已使用或体力上限不足。");
        for (const card of chooser.hand.splice(0))
            discardToPile(state, chooser, card);
        chooser.maxHp = Math.max(1, chooser.maxHp - 1);
        chooser.hp = Math.min(2, chooser.maxHp);
        chooser.alive = true;
        drawCards(state, chooser, 2);
        chooser.skillState = { ...chooser.skillState, sanshuiZixinUsed: true };
        const targets = state.seats.filter((seat) => seat.alive && seat.seatId !== chooser.seatId).map((seat) => seat.seatId);
        const events = [`${chooser.playerName} 发动自刎归天，弃置全部手牌，体力上限 -1，回复体力并摸 2 张牌。`];
        if (targets.length === 0) {
            state.pendingChoice = undefined;
            resumeAfterDyingRecovery(state);
        }
        else {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "skill-target",
                chooserSeatId: chooser.seatId,
                sourceSeatId: chooser.seatId,
                cardName: "sanshui-zixin-target",
                effect: { kind: "dying", targetSeatId: chooser.seatId, cardName: "自刎归天" },
                prompt: "请选择一名其他角色获得 kg 标记。",
                choices: [],
                targetSeatIds: targets,
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
        }
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "shen-boss-talent-judge") {
        if (!isShenLaoban(chooser))
            throw new Error("只有天之骄子·沈老板可以发动腰折的天才。");
        const judge = drawJudgeCard(state);
        state.discardPile.push(judge);
        state.revealedCards.push(judge);
        if (!isRedSuit(judge.suit)) {
            chooser.skillState = { ...chooser.skillState, shenBossNoExtraSha: true };
            state.pendingChoice = undefined;
            state.phase = "play";
            const events = [`${chooser.playerName} 腰折的天才判定为黑色，本回合不能额外使用杀。`];
            state.logs.push(...events);
            return { state, events };
        }
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-option",
            chooserSeatId: chooser.seatId,
            sourceSeatId: chooser.seatId,
            cardName: "shen-boss-talent-option",
            effect: { kind: "draw", sourceSeatId: chooser.seatId, amount: 0, cardName: "腰折的天才" },
            prompt: `${chooser.playerName} 判定为红色，请选择一项。`,
            choices: [
                { id: "shen-boss-sha-limit", cardId: "shen-boss-sha-limit", cardName: "杀次数上限 +1", area: "public" },
                { id: "shen-boss-prevent", cardId: "shen-boss-prevent", cardName: "首次伤害可弃牌防止", area: "public" },
                { id: "shen-boss-cycle", cardId: "shen-boss-cycle", cardName: "弃至多两牌并摸等量牌", area: "public" },
            ],
        };
        state.phase = "response";
        const events = [`${chooser.playerName} 腰折的天才判定为红色。`, state.pendingChoice.prompt];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "gay-chenmo" || pending.cardName === "沉默") {
        if (!isGayGuan(chooser))
            throw new Error("只有 gay管可以发动沉默。");
        if (chooser.maxHp <= 1)
            throw new Error("体力上限不足，不能发动沉默。");
        const round = getRoundNumber(state);
        if (Number(chooser.skillState?.gaySilentUsedRound ?? -1) === round)
            throw new Error("沉默本轮已经使用过。");
        chooser.maxHp = Math.max(1, chooser.maxHp - 1);
        chooser.hp = Math.min(chooser.hp, chooser.maxHp);
        chooser.hand.push(createGeneratedCard("tao", `gay-chenmo-tao-${state.turn}-${chooser.hand.length}`));
        chooser.hand.push(createGeneratedCard("nanman", `gay-chenmo-nanman-${state.turn}-${chooser.hand.length}`));
        chooser.hand.push(createGeneratedCard("huogong", `gay-chenmo-huogong-${state.turn}-${chooser.hand.length}`));
        chooser.skillState = { ...chooser.skillState, gaySilentUsedRound: round };
        state.pendingChoice = undefined;
        if (state.phase !== "finished")
            state.phase = "play";
        const events = [`${chooser.playerName} 发动沉默，扣 1 点体力上限并获得桃、南蛮入侵、火攻。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (action.skillId === "gay-weixiao" || pending.cardName === "微笑") {
        if (!isGayGuan(chooser))
            throw new Error("只有 gay管可以发动微笑。");
        if (chooser.maxHp >= 6)
            throw new Error("体力上限已达到 6。");
        chooser.maxHp = Math.min(6, chooser.maxHp + 1);
        state.pendingChoice = undefined;
        if (state.phase !== "finished")
            state.phase = "play";
        const events = [`${chooser.playerName} 发动微笑，体力上限 +1。`];
        state.logs.push(...events);
        return { state, events };
    }
    throw new Error("该确认技能暂未实现。");
}
function passPendingChoice(state, playerId) {
    const pending = requirePendingChoice(state, playerId);
    const chooser = requireSeatById(state, pending.chooserSeatId);
    const events = [`${chooser.playerName} 放弃选择。`];
    if (pending.kind === "public-card" && pending.effect.kind === "wugu" && state.publicCards[0]) {
        return choosePendingCard(state, playerId, state.publicCards[0].id);
    }
    if (pending.kind === "huogong-reveal" && pending.effect.kind === "huogong" && pending.choices[0]) {
        return choosePendingCard(state, playerId, pending.choices[0].cardId, pending.choices[0].id);
    }
    if (pending.kind === "multi-target-seat" && pending.effect.kind === "chain") {
        state.pendingChoice = undefined;
        state.phase = "play";
        drawCards(state, chooser, 1);
        events.push(`${chooser.playerName} 重铸铁索连环，摸 1 张牌。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.cardName === "cixiong-sword" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        drawCards(state, source, 1);
        events.push(`${chooser.playerName} 未弃牌，${source.playerName} 因雌雄双股剑摸 1 张牌。`);
        resumeShaResponseFromDamage(state, pending.effect, events);
        return { state, events };
    }
    if (pending.cardName === "qinglong-blade" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        if (startPostShanWeaponChoice(state, pending.effect, events, true)) {
            state.logs.push(...events);
            return { state, events };
        }
        state.phase = "play";
        events.push(`${chooser.playerName} 未发动青龙偃月刀。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "multi-card" && pending.cardName === "guanshi-axe") {
        state.pendingChoice = undefined;
        state.phase = "play";
        events.push(`${chooser.playerName} 未发动贯石斧。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "multi-card" && pending.cardName === "tudou-shenggen-prevent" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未弃牌防止生根传导。`);
        const paused = applyDamage(state, pending.effect.sourceSeatId, pending.effect.targetSeatId, pending.effect.amount, pending.effect.cardName, events, pending.effect.nature, undefined, pending.effect.ignoreArmor, { cardKey: pending.effect.sourceCardKey, suit: pending.effect.sourceSuit }, true, true, true);
        if (!paused)
            state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "sha-transfer" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        const source = requireSeatById(state, pending.effect.sourceSeatId);
        const target = requireSeatById(state, pending.effect.targetSeatId);
        const card = {
            cardKey: pending.effect.sourceCardKey ?? "sha",
            suit: pending.effect.sourceSuit ?? "spade",
            damageNature: pending.effect.nature ?? "normal",
            name: pending.cardName,
        };
        events.push(`${chooser.playerName} 未发动转杀。`);
        startShaResponse(state, source, target, card, pending.effect, events);
        return { state, events };
    }
    if (pending.kind === "opening-identity") {
        return chooseOpeningIdentity(state, playerId, false);
    }
    if (pending.kind === "skill-target" && pending.cardName === "tudou-faya") {
        chooser.skillState = { ...chooser.skillState, tudouFayaRound: getRoundNumber(state) };
        state.pendingChoice = undefined;
        state.phase = "draw";
        events.push(`${chooser.playerName} 未发动发芽。`);
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm" && pending.cardName === "yang-qiaoshe") {
        chooser.skillState = { ...chooser.skillState, yangQiaosheRound: getRoundNumber(state) };
        state.pendingChoice = undefined;
        state.phase = "draw";
        events.push(`${chooser.playerName} 未发动巧舌如簧。`);
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm" && pending.cardName === "sanshui-kg-mercy" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未发动 kg 的怜悯。`);
        const paused = applyDamage(state, pending.effect.sourceSeatId, pending.effect.targetSeatId, pending.effect.amount, pending.effect.cardName, events, pending.effect.nature, undefined, pending.effect.ignoreArmor, { cardKey: pending.effect.sourceCardKey, suit: pending.effect.sourceSuit }, true, Boolean(pending.effect.skipHanbingChoice));
        if (!paused)
            state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm" && pending.cardName === "sanshui-zixin" && pending.effect.kind === "dying") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未发动自刎归天。`);
        continueDyingFromPending(state, events);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm" && pending.cardName === "hanbing-sword" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未发动寒冰剑。`);
        const paused = applyDamage(state, pending.effect.sourceSeatId, pending.effect.targetSeatId, pending.effect.amount, pending.effect.cardName, events, pending.effect.nature, undefined, pending.effect.ignoreArmor, { cardKey: pending.effect.sourceCardKey, suit: pending.effect.sourceSuit }, Boolean(pending.effect.skipKgMercy), true);
        if (!paused)
            state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm" && pending.cardName === "bagua-armor" && pending.effect.kind === "damage") {
        state.pendingChoice = undefined;
        events.push(`${chooser.playerName} 未发动八卦阵。`);
        resumeShaResponseFromDamage(state, pending.effect, events);
        return { state, events };
    }
    if (pending.kind === "skill-confirm") {
        state.pendingChoice = undefined;
        state.phase = "play";
        events.push(`${chooser.playerName} 未发动 ${pending.effect.cardName}。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (pending.kind === "skill-target" && pending.cardName === "op的神罚") {
        state.pendingChoice = undefined;
        state.phase = "prepare";
        events.push(...advancePhase(state, false));
        state.logs.push(...events);
        return { state, events };
    }
    state.pendingChoice = undefined;
    state.phase = "play";
    if (pending.kind === "discard-suit") {
        events.push(`${pending.cardName} 未造成额外效果。`);
    }
    state.logs.push(...events);
    return { state, events };
}
function continueWuguChoice(state, queue, effect, events) {
    while (queue.length > 0) {
        const nextSeatId = queue.shift();
        const seat = state.seats.find((item) => item.seatId === nextSeatId);
        if (seat?.alive && state.publicCards.length > 0) {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "public-card",
                chooserSeatId: seat.seatId,
                sourceSeatId: effect.sourceSeatId,
                cardName: effect.cardName,
                effect,
                prompt: `${seat.playerName} 从五谷丰登中选择一张牌。`,
                choices: state.publicCards.map((card) => choiceFromCard(card, "public")),
                queue,
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
            state.logs.push(...events);
            return { state, events };
        }
    }
    if (state.publicCards.length > 0) {
        for (const card of state.publicCards.splice(0)) {
            state.discardPile.push(card);
            state.revealedCards.push(card);
        }
        events.push("五谷丰登剩余牌进入弃牌堆。");
    }
    state.pendingChoice = undefined;
    state.phase = "play";
    state.logs.push(...events.slice(-2));
    return { state, events };
}
function continueAoe(state, effect, events) {
    const next = nextAoeResponse(state, effect);
    if (next) {
        state.pendingResponse = next;
        state.phase = "response";
        events.push(next.prompt);
    }
    else {
        clearPendingResponse(state);
    }
    state.logs.push(...events.slice(1));
    return { state, events };
}
function nextAoeResponse(state, effect) {
    while (effect.queue.length > 0) {
        const seatId = effect.queue.shift();
        const seat = state.seats.find((item) => item.seatId === seatId);
        if (seat?.alive) {
            return {
                id: responseId(state),
                responseType: effect.responseType,
                responderSeatId: seat.seatId,
                sourceSeatId: effect.sourceSeatId,
                cardName: effect.cardName,
                prompt: `${seat.playerName} 需要对 ${effect.cardName} 使用 ${responseName(effect.responseType)}。`,
                effect,
            };
        }
    }
    return undefined;
}
function applyDamage(state, sourceSeatId, targetSeatId, amount, cardName, events, nature = "normal", resume, ignoreArmor = false, sourceCard, skipKgMercy = false, skipHanbingChoice = false, skipShenBossPrevent = false) {
    const source = requireSeatById(state, sourceSeatId);
    const target = requireSeatById(state, targetSeatId);
    const isRedShaDamage = Boolean(sourceCard?.cardKey && isShaKey(sourceCard.cardKey) && sourceCard.suit && isRedSuit(sourceCard.suit));
    const isBlackShaDamage = Boolean(sourceCard?.cardKey && isShaKey(sourceCard.cardKey) && sourceCard.suit && isBlackSuit(sourceCard.suit));
    if (isShenZhuxi(target) && source.seatId !== target.seatId && isRedShaDamage) {
        const shield = Number(target.skillState?.shenRedShaShield ?? 0);
        if (shield > 0) {
            target.skillState = { ...target.skillState, shenRedShaShield: shield - 1 };
            events.push(`${target.playerName} 触发乒乓高手，免疫本次红色杀伤害。`);
            if (state.phase !== "finished")
                state.phase = "play";
            return false;
        }
    }
    if (!skipShenBossPrevent &&
        isShenLaoban(target) &&
        target.skillState?.shenBossPreventDamageAvailable &&
        !target.skillState?.shenBossDamageShieldUsed &&
        target.hand.length > 0) {
        target.skillState = { ...target.skillState, shenBossDamageShieldUsed: true };
        state.pendingChoice = {
            id: choiceId(state),
            kind: "target-card",
            chooserSeatId: target.seatId,
            sourceSeatId: source.seatId,
            cardName: "shen-boss-prevent-damage",
            effect: {
                kind: "damage",
                sourceSeatId,
                targetSeatId,
                amount,
                cardName,
                nature,
                ignoreArmor,
                sourceCardKey: sourceCard?.cardKey,
                sourceSuit: sourceCard?.suit,
                skipKgMercy,
                skipHanbingChoice,
                skipShenBossPrevent: true,
            },
            prompt: `${target.playerName} 可以弃置一张手牌，防止本次伤害。`,
            choices: target.hand.map((card) => choiceFromCard(card, "hand", target.seatId)),
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return true;
    }
    if (!skipKgMercy && isSanshui(source) && target.skillState?.kgSourceSeatId === source.seatId && source.seatId !== target.seatId) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-confirm",
            chooserSeatId: source.seatId,
            sourceSeatId: source.seatId,
            cardName: "sanshui-kg-mercy",
            effect: {
                kind: "damage",
                sourceSeatId,
                targetSeatId,
                amount,
                cardName,
                nature,
                ignoreArmor,
                sourceCardKey: sourceCard?.cardKey,
                sourceSuit: sourceCard?.suit,
                skipKgMercy: true,
                skipHanbingChoice,
            },
            prompt: `${source.playerName} 可以发动 kg 的怜悯，防止对 ${target.playerName} 的本次伤害并弃置其一张手牌。`,
            choices: [],
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return true;
    }
    if (hasWeaponKey(source, "guding") && source.seatId !== target.seatId && sourceCard?.cardKey && isShaKey(sourceCard.cardKey) && target.hand.length === 0) {
        amount += 1;
        events.push(`${source.playerName} 的古锭刀触发，本次伤害 +1。`);
    }
    if (!skipHanbingChoice &&
        hasWeaponKey(source, "hanbing") &&
        source.seatId !== target.seatId &&
        sourceCard?.cardKey &&
        isShaKey(sourceCard.cardKey) &&
        collectTargetCardChoices(target).length > 0) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-confirm",
            chooserSeatId: source.seatId,
            sourceSeatId: source.seatId,
            cardName: "hanbing-sword",
            effect: {
                kind: "damage",
                sourceSeatId,
                targetSeatId,
                amount,
                cardName,
                nature,
                ignoreArmor,
                sourceCardKey: sourceCard?.cardKey,
                sourceSuit: sourceCard?.suit,
                skipKgMercy,
                skipHanbingChoice: true,
            },
            prompt: `${source.playerName} 可以发动寒冰剑：防止本次伤害，并改为弃置 ${target.playerName} 至多两张牌。`,
            choices: [],
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return true;
    }
    if (!ignoreArmor && hasArmorKey(target, "baiyin") && amount > 1)
        amount = 1;
    if (!ignoreArmor && hasArmorKey(target, "tengjia") && nature === "fire")
        amount += 1;
    const chainedTargets = nature !== "normal" && target.chained
        ? state.seats.filter((seat) => seat.alive && seat.chained && seat.seatId !== target.seatId).map((seat) => seat.seatId)
        : [];
    if (nature !== "normal")
        target.chained = false;
    target.hp = Math.max(0, target.hp - amount);
    events.push(`${source.playerName} 对 ${target.playerName} 造成 ${amount} 点${natureText(nature)}伤害。`);
    if (amount > 0 && triggerCjjPowderDraw(state, source, target, sourceCard, cardName, events)) {
        // 粉笔是受伤后的补牌效果，不打断后续伤害结算。
    }
    if (amount > 0 && triggerCjjPoison(state, source, target, cardName, events))
        return true;
    if (amount > 0 && triggerTudouRootDamage(state, source, target, amount, cardName, nature, sourceCard, events))
        return true;
    if (isShenZhuxi(target) && source.seatId !== target.seatId && isRedShaDamage) {
        target.skillState = {
            ...target.skillState,
            shenRedShaShield: Number(target.skillState?.shenRedShaShield ?? 0) + 1,
        };
        events.push(`${target.playerName} 触发乒乓高手，获得 1 次红色杀免疫。`);
    }
    if (isShenZhuxi(source) && source.seatId !== target.seatId && isBlackShaDamage) {
        const used = Number(source.skillState?.shenBlackShaStealUsed ?? 0);
        if (used < 2 && target.hand.length > 0 && !state.pendingChoice) {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "skill-confirm",
                chooserSeatId: source.seatId,
                sourceSeatId: source.seatId,
                cardName: "shen-black-sha-steal",
                effect: { kind: "steal-random", sourceSeatId: source.seatId, targetSeatId: target.seatId, cardName: "乒乓高手" },
                prompt: `${source.playerName} 可以发动乒乓高手，抽取 ${target.playerName} 一张手牌（本回合 ${used}/2）。`,
                choices: [],
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
        }
    }
    if (isWuMao(source) && source.seatId !== target.seatId && amount > 0) {
        let progress = Number(source.skillState?.wuMaoDamageProgress ?? 0) + amount;
        while (progress >= 2) {
            progress -= 2;
            source.hand.push(createGeneratedCard("wuxie", `wu-mao-${state.turn}-${source.hand.length}`));
            drawCards(state, source, 1);
            events.push(`${source.playerName} 触发英语大师，获得无懈可击并摸 1 张牌。`);
        }
        source.skillState = { ...source.skillState, wuMaoDamageProgress: progress };
    }
    if (amount > 0 &&
        source.seatId !== target.seatId &&
        sourceCard?.cardKey &&
        isShaKey(sourceCard.cardKey) &&
        hasWeaponKey(source, "qilin") &&
        !state.pendingChoice) {
        const horseChoices = ["attackHorse", "defenseHorse"]
            .map((slot) => {
            const horse = target.equipment[slot];
            return horse ? choiceFromCard(horse, "equipment", target.seatId, slot) : undefined;
        })
            .filter((choice) => Boolean(choice));
        if (horseChoices.length > 0) {
            state.pendingChoice = {
                id: choiceId(state),
                kind: "target-card",
                chooserSeatId: source.seatId,
                sourceSeatId: source.seatId,
                cardName: "qilin-bow",
                effect: { kind: "target-card", sourceSeatId: source.seatId, targetSeatId: target.seatId, action: "discard", cardName: "麒麟弓" },
                prompt: `${source.playerName} 可以发动麒麟弓，弃置 ${target.playerName} 的一匹马。`,
                choices: horseChoices,
            };
            state.phase = "response";
            events.push(state.pendingChoice.prompt);
        }
    }
    if (amount > 0 &&
        isGayGuan(target) &&
        target.hp > 0 &&
        target.maxHp > 1 &&
        Number(target.skillState?.gaySilentUsedRound ?? -1) !== getRoundNumber(state)) {
        startSkillConfirmChoice(state, target, "gay-chenmo", "沉默", `${target.playerName} 可以发动沉默：扣 1 点体力上限，获得桃、南蛮入侵、火攻。`, events);
    }
    if (amount > 0 &&
        nature === "fire" &&
        cardName === "火攻" &&
        isGayGuan(source) &&
        source.seatId !== target.seatId &&
        source.maxHp < 6) {
        startSkillConfirmChoice(state, source, "gay-weixiao", "微笑", `${source.playerName} 可以发动微笑：体力上限 +1（最高 6，不回复体力）。`, events);
    }
    if (target.hp <= 0) {
        if (isDengGou(target) && target.skillState?.dengRenegadeReviveAvailable) {
            target.skillState = { ...target.skillState, dengRenegadeReviveAvailable: false };
            target.alive = true;
            target.hp = target.maxHp;
            drawCards(state, target, 3);
            events.push(`${target.playerName} 触发三五起死回生，回满体力并摸 3 张牌。`);
        }
        else {
            const paused = startDying(state, target, sourceSeatId, cardName, events, resume);
            if (paused)
                return true;
        }
    }
    for (const chainedSeatId of chainedTargets) {
        const chained = requireSeatById(state, chainedSeatId);
        chained.chained = false;
        const paused = applyDamage(state, sourceSeatId, chained.seatId, amount, cardName, events, nature, undefined, false, sourceCard);
        if (paused)
            return true;
    }
    if (state.phase !== "finished" && !state.pendingChoice && !state.pendingResponse)
        state.phase = "play";
    return false;
}
function triggerCjjPowderDraw(state, source, target, sourceCard, cardName, events) {
    if (!isCjj(target) || source.seatId === target.seatId || source.character.faction !== "shu")
        return false;
    if (!isTrickDamage(sourceCard, cardName))
        return false;
    const round = getRoundNumber(state);
    const usedRound = Number(target.skillState?.cjjFenbiRound ?? -1);
    const usedCount = usedRound === round ? Number(target.skillState?.cjjFenbiCount ?? 0) : 0;
    if (usedCount >= 2)
        return false;
    drawCards(state, target, 2);
    target.skillState = { ...target.skillState, cjjFenbiRound: round, cjjFenbiCount: usedCount + 1 };
    events.push(`${target.playerName} 触发粉笔，因学生锦囊伤害摸 2 张牌（本轮 ${usedCount + 1}/2）。`);
    return true;
}
function triggerCjjPoison(state, source, target, cardName, events) {
    if (source.seatId === target.seatId || cardName === "试管")
        return false;
    const poisonSourceSeatId = source.skillState?.cjjPoisonSourceSeatId;
    const expireTurn = Number(source.skillState?.cjjPoisonExpireTurn ?? -1);
    if (typeof poisonSourceSeatId !== "string" || state.turn > expireTurn)
        return false;
    source.skillState = {
        ...source.skillState,
        cjjPoisonSourceSeatId: undefined,
        cjjPoisonExpireTurn: undefined,
    };
    source.hp = Math.max(0, source.hp - 1);
    drawCards(state, source, 1);
    const poisonSource = state.seats.find((seat) => seat.seatId === poisonSourceSeatId);
    events.push(`${source.playerName} 的毒标记触发，失去 1 点体力并摸 1 张牌。`);
    if (poisonSource)
        events.push(`毒标记来自 ${poisonSource.playerName}，现已移除。`);
    if (source.hp <= 0)
        return startDying(state, source, target.seatId, "试管", events);
    return false;
}
function triggerTudouRootDamage(state, source, damaged, amount, cardName, nature, sourceCard, events) {
    if (cardName === "生根" || state.pendingChoice || state.pendingResponse || state.pendingDying)
        return false;
    const link = findTudouRootLink(state, damaged);
    if (!link || !link.counterpart.alive || link.counterpart.seatId === damaged.seatId)
        return false;
    const effect = {
        kind: "damage",
        sourceSeatId: source.seatId,
        targetSeatId: link.counterpart.seatId,
        amount,
        cardName: "生根",
        nature,
        sourceCardKey: sourceCard?.cardKey,
        sourceSuit: sourceCard?.suit,
        skipKgMercy: true,
        skipHanbingChoice: true,
        skipShenBossPrevent: true,
    };
    if (link.owner.hand.length >= 2) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "multi-card",
            chooserSeatId: link.owner.seatId,
            sourceSeatId: source.seatId,
            cardName: "tudou-shenggen-prevent",
            effect,
            prompt: `${link.owner.playerName} 可以弃置两张牌，防止生根传导给 ${link.counterpart.playerName} 的 ${amount} 点伤害。`,
            choices: link.owner.hand.map((card) => choiceFromCard(card, "hand", link.owner.seatId)),
            minTargets: 2,
            maxTargets: 2,
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return true;
    }
    events.push(`${link.owner.playerName} 没有足够手牌防止生根传导。`);
    return applyDamage(state, effect.sourceSeatId, effect.targetSeatId, effect.amount, effect.cardName, events, effect.nature, undefined, effect.ignoreArmor, { cardKey: effect.sourceCardKey, suit: effect.sourceSuit }, true, true, true);
}
function findTudouRootLink(state, damaged) {
    const round = getRoundNumber(state);
    if (isTudou(damaged) && Number(damaged.skillState?.tudouRootRound ?? -1) === round) {
        const targetSeatId = damaged.skillState?.tudouRootTargetSeatId;
        const counterpart = typeof targetSeatId === "string" ? state.seats.find((seat) => seat.seatId === targetSeatId) : undefined;
        if (counterpart?.alive)
            return { owner: damaged, counterpart };
    }
    const ownerSeatId = damaged.skillState?.tudouRootSourceSeatId;
    if (typeof ownerSeatId !== "string" || Number(damaged.skillState?.tudouRootRound ?? -1) !== round)
        return undefined;
    const owner = state.seats.find((seat) => seat.seatId === ownerSeatId);
    if (owner && isTudou(owner) && owner.skillState?.tudouRootTargetSeatId === damaged.seatId && Number(owner.skillState?.tudouRootRound ?? -1) === round) {
        return { owner, counterpart: owner };
    }
    return undefined;
}
function isTrickDamage(sourceCard, cardName) {
    if (sourceCard?.cardKey && cardDef(sourceCard.cardKey).category === "trick")
        return true;
    return ["南蛮入侵", "万箭齐发", "决斗", "火攻"].includes(cardName);
}
function startDying(state, target, sourceSeatId, cardName, events, resume) {
    const queue = responseQueueFrom(state, target.seatId, true).filter((seatId) => {
        const seat = requireSeatById(state, seatId);
        return seat.hand.some((card) => card.cardKey === "tao" || (seat.seatId === target.seatId && card.cardKey === "jiu"));
    });
    state.phase = "dying";
    state.pendingDying = { seatId: target.seatId, queue, sourceSeatId, resume };
    // Optional dying skills must resolve before Tao rescue. Human players are never opted in automatically.
    if (isSanshui(target) && !target.skillState?.sanshuiZixinUsed && target.maxHp > 1) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-confirm",
            chooserSeatId: target.seatId,
            sourceSeatId: target.seatId,
            cardName: "sanshui-zixin",
            effect: { kind: "dying", targetSeatId: target.seatId, cardName },
            prompt: `${target.playerName} 可以发动限定技自刎归天。`,
            choices: [],
        };
        events.push(state.pendingChoice.prompt);
        state.logs.push(...events);
        return true;
    }
    const paused = continueDyingFromPending(state, events);
    if (paused)
        state.logs.push(...events);
    return paused;
}
function continueDyingFromPending(state, events) {
    const dyingState = state.pendingDying;
    if (!dyingState)
        return false;
    const target = requireSeatById(state, dyingState.seatId);
    const first = dyingState.queue.shift();
    if (!first) {
        const source = state.seats.find((seat) => seat.seatId === dyingState.sourceSeatId);
        if (source && source.seatId !== target.seatId)
            events.push(`${source.playerName} 击败 ${target.playerName}。`);
        target.alive = false;
        target.hp = 0;
        events.push(`${target.playerName} 出局。`);
        const resume = dyingState.resume;
        state.pendingDying = undefined;
        handleSeatDeath(state, target, dyingState.sourceSeatId, events);
        finishIfOnlyOneAlive(state, events);
        if (state.phase !== "finished" && resume) {
            state.pendingResponse = skipDeadResponder(state, resume);
            state.phase = state.pendingResponse ? "response" : "play";
        }
        return false;
    }
    const responder = requireSeatById(state, first);
    state.pendingResponse = {
        id: responseId(state),
        responseType: "tao",
        responderSeatId: responder.seatId,
        sourceSeatId: target.seatId,
        cardName: "濒死救援",
        prompt: `${target.playerName} 濒死，${responder.playerName} 可以使用桃救援。`,
        effect: { kind: "dying", targetSeatId: target.seatId, cardName: "濒死救援" },
        queue: dyingState.queue,
    };
    events.push(state.pendingResponse.prompt);
    return true;
}
function resumeAfterDyingRecovery(state) {
    const resume = state.pendingDying?.resume;
    state.pendingDying = undefined;
    state.pendingResponse = undefined;
    if (resume && state.phase !== "finished") {
        state.pendingResponse = resume;
        state.phase = "response";
    }
    else if (state.phase !== "finished") {
        state.phase = "play";
    }
}
function finishIfOnlyOneAlive(state, events) {
    if (state.gameMode === "identity" && finishIdentityGameIfNeeded(state, events))
        return;
    if (state.gameMode === "team2v2" && finishTeamGameIfNeeded(state, events))
        return;
    const alive = state.seats.filter((seat) => seat.alive);
    if (alive.length === 1) {
        state.phase = "finished";
        state.pendingResponse = undefined;
        state.pendingChoice = undefined;
        state.pendingDying = undefined;
        state.winnerSeatId = alive[0].seatId;
        events.push(`${alive[0].playerName} 获胜。`);
    }
}
function finishTeamGameIfNeeded(state, events) {
    const aliveTeams = new Set(state.seats.filter((seat) => seat.alive && seat.teamId).map((seat) => seat.teamId));
    if (aliveTeams.size !== 1)
        return false;
    const winnerTeam = [...aliveTeams][0];
    const winnerSeat = state.seats.find((seat) => seat.alive && seat.teamId === winnerTeam);
    state.phase = "finished";
    state.pendingResponse = undefined;
    state.pendingChoice = undefined;
    state.pendingDying = undefined;
    state.winnerTeam = winnerTeam;
    state.winnerSeatId = winnerSeat?.seatId;
    events.push(`${teamName(winnerTeam)}获胜。`);
    return true;
}
function handleSeatDeath(state, dead, sourceSeatId, events) {
    dead.identityRevealed = true;
    if (state.gameMode === "team2v2") {
        const teammate = state.seats.find((seat) => seat.alive && seat.teamId && seat.teamId === dead.teamId && seat.seatId !== dead.seatId);
        if (teammate) {
            drawCards(state, teammate, 1);
            events.push(`${teammate.playerName} 因队友阵亡摸 1 张牌。`);
        }
        return;
    }
    if (state.gameMode !== "identity" || !sourceSeatId)
        return;
    const killer = state.seats.find((seat) => seat.seatId === sourceSeatId);
    if (!killer || killer.seatId === dead.seatId)
        return;
    if (dead.identityRole === "rebel") {
        drawCards(state, killer, 3);
        events.push(`${killer.playerName} 击败反贼，摸三张牌。`);
    }
    if (killer.identityRole === "lord" && dead.identityRole === "loyalist") {
        discardAllCards(state, killer);
        events.push(`${killer.playerName} 误伤忠臣，弃置全部牌。`);
    }
}
function finishIdentityGameIfNeeded(state, events) {
    const lord = state.seats.find((seat) => seat.identityRole === "lord");
    const alive = state.seats.filter((seat) => seat.alive);
    const aliveRebels = alive.filter((seat) => seat.identityRole === "rebel");
    const aliveRenegades = alive.filter((seat) => seat.identityRole === "renegade");
    if (lord && !lord.alive) {
        state.phase = "finished";
        state.pendingResponse = undefined;
        state.pendingChoice = undefined;
        state.pendingDying = undefined;
        const soleWinner = alive.length === 1 ? alive[0] : undefined;
        if (soleWinner?.identityRole === "renegade") {
            state.winnerSeatId = soleWinner.seatId;
            state.winnerRole = "renegade";
            events.push(`${soleWinner.playerName} 以内奸身份获胜。`);
        }
        else {
            state.winnerRole = "rebel";
            state.winnerSeatId = aliveRebels[0]?.seatId;
            events.push("反贼阵营获胜。");
        }
        revealAllIdentities(state);
        return true;
    }
    if (lord?.alive && aliveRebels.length === 0 && aliveRenegades.length === 0) {
        state.phase = "finished";
        state.pendingResponse = undefined;
        state.pendingChoice = undefined;
        state.pendingDying = undefined;
        state.winnerRole = "lordSide";
        state.winnerSeatId = lord.seatId;
        revealAllIdentities(state);
        events.push("主公与忠臣阵营获胜。");
        return true;
    }
    return false;
}
function revealAllIdentities(state) {
    for (const seat of state.seats)
        seat.identityRevealed = true;
}
function discardAllCards(state, seat) {
    for (const card of seat.hand.splice(0))
        discardToPile(state, seat, card);
    for (const slot of Object.keys(seat.equipment)) {
        removeEquipmentCard(state, seat, slot, []);
    }
}
function startPrepareSkillChoice(state, seat, events) {
    if (!isSanshui(seat) || seat.skillState?.sanshuiKgPreparedTurn === state.turn)
        return false;
    const targetSeatIds = aliveOtherSeatIds(state, seat.seatId);
    if (targetSeatIds.length === 0)
        return false;
    seat.skillState = { ...seat.skillState, sanshuiKgPreparedTurn: state.turn };
    state.pendingChoice = {
        id: choiceId(state),
        kind: "skill-target",
        chooserSeatId: seat.seatId,
        sourceSeatId: seat.seatId,
        cardName: "op的神罚",
        effect: { kind: "draw", sourceSeatId: seat.seatId, amount: 0, cardName: "op的神罚" },
        prompt: `${seat.playerName} 可以选择一名其他角色获得 kg 标记。`,
        choices: [],
        targetSeatIds,
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    return true;
}
function startSkillConfirmChoice(state, seat, skillId, skillName, prompt, events) {
    if (state.pendingChoice || state.pendingResponse || state.pendingDying || state.phase === "finished")
        return false;
    state.pendingChoice = {
        id: choiceId(state),
        kind: "skill-confirm",
        chooserSeatId: seat.seatId,
        sourceSeatId: seat.seatId,
        cardName: skillId,
        effect: { kind: "draw", sourceSeatId: seat.seatId, amount: 0, cardName: skillName },
        prompt,
        choices: [],
    };
    state.phase = "response";
    events.push(prompt);
    return true;
}
function skillIdFromConfirmChoice(choice) {
    return choice.cardName;
}
function startPlayPhaseSkillChoice(state, seat, events) {
    if (!isShenLaoban(seat) || seat.skillState?.shenBossTalentCheckedTurn === state.turn)
        return false;
    seat.skillState = { ...seat.skillState, shenBossTalentCheckedTurn: state.turn };
    state.pendingChoice = {
        id: choiceId(state),
        kind: "skill-confirm",
        chooserSeatId: seat.seatId,
        sourceSeatId: seat.seatId,
        cardName: "shen-boss-talent-judge",
        effect: { kind: "draw", sourceSeatId: seat.seatId, amount: 0, cardName: "腰折的天才" },
        prompt: `${seat.playerName} 可以发动腰折的天才，进行一次判定。`,
        choices: [],
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
    return true;
}
function startDrawPhaseSkillChoice(state, seat, events) {
    if (seat.skipDrawPhase || isHuangDaxian(seat))
        return false;
    const round = getRoundNumber(state);
    if (isTudou(seat) && Number(seat.skillState?.tudouFayaRound ?? -1) !== round) {
        const targetSeatIds = aliveOtherSeatIds(state, seat.seatId);
        if (targetSeatIds.length === 0)
            return false;
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-target",
            chooserSeatId: seat.seatId,
            sourceSeatId: seat.seatId,
            cardName: "tudou-faya",
            effect: { kind: "draw", sourceSeatId: seat.seatId, amount: 1, cardName: "发芽" },
            prompt: `${seat.playerName} 可以发动发芽：选择一名角色，你与其各摸 1 张牌。`,
            choices: [],
            targetSeatIds,
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        return true;
    }
    if (isYangHaiyan(seat) && Number(seat.skillState?.yangQiaosheRound ?? -1) !== round) {
        state.pendingChoice = {
            id: choiceId(state),
            kind: "skill-confirm",
            chooserSeatId: seat.seatId,
            sourceSeatId: seat.seatId,
            cardName: "yang-qiaoshe",
            effect: { kind: "draw", sourceSeatId: seat.seatId, amount: 0, cardName: "巧舌如簧" },
            prompt: `${seat.playerName} 可以发动巧舌如簧：进行一次判定，红桃则获得乐不思蜀。`,
            choices: [],
        };
        state.phase = "response";
        events.push(state.pendingChoice.prompt);
        return true;
    }
    return false;
}
function advancePhase(state, endTurnRequested = false) {
    const current = getCurrentSeat(state);
    const events = [];
    if (state.phase === "prepare") {
        if (startPrepareSkillChoice(state, current, events))
            return events;
        state.phase = "judge";
        events.push(`${current.playerName} 进入判定阶段。`);
    }
    if (state.phase === "judge") {
        processTurnStartJudgements(state, current, events);
        resolveHuangJudgePhase(state, current, events);
        if (state.pendingResponse || state.phase === "finished")
            return events;
        state.phase = "draw";
        events.push(`${current.playerName} 进入摸牌阶段。`);
    }
    if (state.phase === "draw") {
        if (startDrawPhaseSkillChoice(state, current, events))
            return events;
        resolveDrawPhase(state, current, events);
        if (state.phase !== "finished")
            state.phase = current.skipPlayPhase ? "discard" : "play";
        events.push(current.skipPlayPhase ? `${current.playerName} 跳过出牌阶段。` : `${current.playerName} 进入出牌阶段。`);
        if (state.phase === "play" && startPlayPhaseSkillChoice(state, current, events))
            return events;
        return events;
    }
    if (state.phase === "play") {
        if (current.hand.length > getHandLimit(current)) {
            state.phase = "discard";
            events.push(`${current.playerName} 进入弃牌阶段。`);
            return events;
        }
        if (endTurnRequested) {
            state.phase = "finish";
            events.push(`${current.playerName} 进入结束阶段。`);
            resolveFinishPhaseSkills(state, current, events);
            events.push(...advanceTurn(state));
            return events;
        }
        state.phase = "finish";
        events.push(`${current.playerName} 进入结束阶段。`);
        return events;
    }
    if (state.phase === "discard") {
        if (current.hand.length > getHandLimit(current))
            throw new Error(`请弃牌至 ${getHandLimit(current)} 张。`);
        state.phase = "finish";
        events.push(`${current.playerName} 进入结束阶段。`);
        if (endTurnRequested) {
            resolveFinishPhaseSkills(state, current, events);
            events.push(...advanceTurn(state));
        }
        return events;
    }
    if (state.phase === "finish") {
        resolveFinishPhaseSkills(state, current, events);
        events.push(...advanceTurn(state));
        return events;
    }
    return events;
}
function resolveFinishPhaseSkills(state, current, events) {
    const round = getRoundNumber(state);
    if (current.skillState?.hongAccompliceTargetSeatId &&
        Number(current.skillState?.hongAccompliceRound ?? -1) === round) {
        drawCards(state, current, 1);
        events.push(`${current.playerName} 因贪污在结束阶段摸 1 张牌。`);
    }
    if (current.skillState?.hongAccompliceSourceSeatId &&
        Number(current.skillState?.hongAccompliceRound ?? -1) === round) {
        drawCards(state, current, 1);
        events.push(`${current.playerName} 因共犯在结束阶段摸 1 张牌。`);
    }
}
function advanceTurn(state) {
    const previous = state.seats[state.currentSeatIndex];
    const nextIndex = findNextAliveSeatIndex(state);
    const events = [`${previous.playerName} 结束回合。`, `轮到 ${state.seats[nextIndex].playerName}。`];
    if (previous.skillState?.kgSourceSeatId) {
        previous.skillState = { ...previous.skillState, kgSourceSeatId: undefined };
        events.push(`${previous.playerName} 的 kg 标记移除。`);
    }
    updateDengTransferProgress(state, events);
    state.currentSeatIndex = nextIndex;
    state.phase = "prepare";
    state.pendingResponse = undefined;
    state.pendingChoice = undefined;
    state.pendingDying = undefined;
    state.turn += 1;
    clearExpiredCharacterMarks(state, events);
    const next = state.seats[nextIndex];
    next.skipDrawPhase = false;
    next.skipPlayPhase = false;
    state.activeTurn = createActiveTurn(next.playerId);
    state.usedShaThisTurn = false;
    clearTurnScopedSkillState(state);
    resetTurnSkillState(next);
    events.push(...advancePhase(state, false));
    return events;
}
function updateDengTransferProgress(state, events) {
    const aliveCount = Math.max(1, state.seats.filter((seat) => seat.alive).length);
    const threshold = aliveCount * 2;
    for (const seat of state.seats) {
        if (!seat.alive || !isDengGou(seat))
            continue;
        const progress = Number(seat.skillState?.dengTransferProgress ?? 0) + 1;
        if (progress >= threshold) {
            const charges = Math.min(1, Number(seat.skillState?.dengTransferCharges ?? 0) + 1);
            seat.skillState = {
                ...seat.skillState,
                dengTransferProgress: 0,
                dengTransferCharges: charges,
            };
            if (charges > 0)
                events.push(`${seat.playerName} 的转杀机会已准备。`);
        }
        else {
            seat.skillState = {
                ...seat.skillState,
                dengTransferProgress: progress,
            };
        }
    }
    for (const seat of state.seats) {
        if (!seat.alive || !isBaoTaihou(seat))
            continue;
        const progress = Number(seat.skillState?.baoPanicProgress ?? 0) + 1;
        if (progress >= threshold) {
            seat.skillState = {
                ...seat.skillState,
                baoPanicProgress: 0,
                baoPanicCharges: Math.min(1, Number(seat.skillState?.baoPanicCharges ?? 0) + 1),
            };
            if (Number(seat.skillState?.baoPanicCharges ?? 0) > 0)
                events.push(`${seat.playerName} 的恐慌已准备。`);
        }
        else {
            seat.skillState = { ...seat.skillState, baoPanicProgress: progress };
        }
    }
}
function resetTurnSkillState(seat) {
    seat.skillState = {
        ...seat.skillState,
        yanWuguUsed: false,
        huangHandLimitBonus: false,
        huangNoSha: false,
        shenBlackShaStealUsed: 0,
        shenBossDamageShieldUsed: false,
        shenBossPreventDamageAvailable: false,
        shenBossShaLimitBonus: 0,
        shenBossNoExtraSha: false,
        baoFirstTrickUsed: false,
        sanshuiKgTrickTurn: undefined,
    };
}
function clearTurnScopedSkillState(state) {
    for (const seat of state.seats) {
        if (seat.skillState?.shenRedShaShield) {
            seat.skillState = { ...seat.skillState, shenRedShaShield: 0 };
        }
    }
}
function clearExpiredCharacterMarks(state, events) {
    const round = getRoundNumber(state);
    for (const seat of state.seats) {
        if (Number(seat.skillState?.cjjPoisonExpireTurn ?? Number.POSITIVE_INFINITY) < state.turn) {
            seat.skillState = { ...seat.skillState, cjjPoisonSourceSeatId: undefined, cjjPoisonExpireTurn: undefined };
            events.push(`${seat.playerName} 的毒标记自然移除。`);
        }
        if (Number(seat.skillState?.tudouRootRound ?? -1) < round) {
            seat.skillState = {
                ...seat.skillState,
                tudouRootTargetSeatId: undefined,
                tudouRootSourceSeatId: undefined,
                tudouRootRound: undefined,
            };
        }
    }
}
function resolveHuangJudgePhase(state, seat, events) {
    if (!isHuangDaxian(seat) || !seat.alive)
        return;
    const judge = drawJudgeCard(state);
    state.revealedCards.push(judge);
    const detained = getHuangDetainedCards(seat);
    if (detained.length >= 3) {
        const overflow = detained.shift();
        if (overflow) {
            discardToPile(state, seat, overflow);
            events.push(`${seat.playerName} 的错算扣押已满，最早扣押的 ${overflow.name} 进入弃牌堆。`);
        }
    }
    detained.push(judge);
    seat.skipDrawPhase = true;
    seat.skillState = {
        ...seat.skillState,
        huangDetainedCards: detained,
    };
    events.push(`${seat.playerName} 发动错算，扣押 ${judge.name}（${suitName(judge.suit)} ${judge.rank}）。`);
}
function resolveDrawPhase(state, seat, events) {
    if (isHuangDaxian(seat)) {
        events.push(`${seat.playerName} 因错算没有摸牌阶段。`);
        return;
    }
    if (seat.skipDrawPhase) {
        events.push(`${seat.playerName} 跳过摸牌阶段。`);
        return;
    }
    const dengBonus = isDengGou(seat) && seat.skillState?.dengRebelBoost ? 1 : 0;
    const baoBonus = isBaoTaihou(seat) && hasAliveFaction(state, "wu") ? 1 : 0;
    const panicMinus = seat.skillState?.baoPanicDrawMinus ? 1 : 0;
    if (panicMinus)
        seat.skillState = { ...seat.skillState, baoPanicDrawMinus: false };
    const hongBonus = isHongXiliang(seat) ? 1 : 0;
    const haijieBoostTurns = Number(seat.skillState?.haijieMeidiDrawBoostTurns ?? 0);
    const haijieBonus = isHaijieDashen(seat) && haijieBoostTurns > 0 ? 1 : 0;
    if (haijieBonus) {
        seat.skillState = {
            ...seat.skillState,
            haijieMeidiDrawBoostTurns: Math.max(0, haijieBoostTurns - 1),
        };
    }
    const drawCount = Math.max(0, 2 + getDrawBonus(seat.character) + dengBonus + baoBonus + hongBonus + haijieBonus - panicMinus);
    drawCards(state, seat, drawCount);
    appendDrawPhaseSkillLogs(seat, events, baoBonus, panicMinus);
    if (hongBonus)
        events.push(`${seat.playerName} 触发九个千万，额外摸 1 张。`);
    events.push(`${seat.playerName} 摸 ${drawCount} 张牌。`);
    if (dengBonus)
        events.push(`${seat.playerName} 的三五额外摸 1 张。`);
    if (haijieBonus)
        events.push(`${seat.playerName} 的美的额外摸 1 张。`);
}
function appendDrawPhaseSkillLogs(seat, events, baoBonus, panicMinus) {
    if (baoBonus)
        events.push(`${seat.playerName} 触发忠犬，额外摸 1 张。`);
    if (panicMinus)
        events.push(`${seat.playerName} 受恐慌影响，少摸 1 张。`);
}
function applyPassiveSkills(state, events) {
    if (state.phase === "opening" || state.phase === "finished" || state.pendingDying)
        return;
    const current = state.seats[state.currentSeatIndex];
    const round = getRoundNumber(state);
    for (const seat of state.seats) {
        if (!seat.alive || !isYanLaoban(seat) || seat.hand.length >= 3)
            continue;
        // 弃牌过程中暂停补牌，避免“弃一张、补一张”的循环；离开弃牌阶段后会再次检查。
        if (current?.seatId === seat.seatId && state.phase === "discard")
            continue;
        const usedRound = Number(seat.skillState?.yanFillRound ?? -1);
        const used = usedRound === round ? Number(seat.skillState?.yanFillCount ?? 0) : 0;
        if (used >= 5)
            continue;
        drawCards(state, seat, 3 - seat.hand.length);
        seat.skillState = { ...seat.skillState, yanFillRound: round, yanFillCount: used + 1 };
        const message = `${seat.playerName} 触发富可敌国，摸至三张手牌（本轮 ${used + 1}/5）。`;
        events.push(message);
        state.logs.push(message);
    }
}
function useCharacterSkill(state, current, action) {
    markSkillVoice(state, current, action);
    if (action.skillId === "zhangba-sha") {
        if (state.phase !== "play" || !hasWeaponKey(current, "zhangba"))
            throw new Error("当前不能发动丈八蛇矛。");
        const ids = Array.from(new Set(action.cardIds ?? []));
        if (ids.length !== 2)
            throw new Error("丈八蛇矛需要选择两张手牌。");
        const subcards = ids.map((id) => takeCard(current.hand, id));
        if (subcards.some((card) => !card)) {
            for (const card of subcards)
                if (card)
                    current.hand.push(card);
            throw new Error("丈八蛇矛选择的手牌不存在。");
        }
        for (const card of subcards)
            discardToPile(state, current, card);
        const virtualSha = {
            ...createGeneratedCard("sha", `zhangba-${state.turn}-${ids.join("-")}`),
            suit: "spade",
            rank: 1,
        };
        const events = [`${current.playerName} 发动丈八蛇矛，将两张手牌当杀使用。`];
        playSha(state, current, virtualSha, action.targetSeatId, events, false);
        return { state, events };
    }
    if (isShenZhuxi(current) && action.skillId === "shen-xuesheng-dang") {
        if (state.phase !== "play")
            throw new Error("学生党只能在出牌阶段使用。");
        if (current.skillState?.shenStudentPartyUsed)
            throw new Error("学生党一局只能使用一次。");
        current.skillState = { ...current.skillState, shenStudentPartyUsed: true };
        current.hp = Math.min(current.maxHp, current.hp + 2);
        drawCards(state, current, 3);
        const events = [`${current.playerName} 发动限定技学生党，回复 2 点体力并摸 3 张牌。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isBaoTaihou(current) && action.skillId === "bao-konghuang") {
        if (state.phase !== "play")
            throw new Error("恐慌只能在出牌阶段使用。");
        const charges = Number(current.skillState?.baoPanicCharges ?? 0);
        if (charges <= 0)
            throw new Error("恐慌次数不足。");
        const target = requireTarget(state, current, action.targetSeatId);
        target.skillState = { ...target.skillState, baoPanicDrawMinus: true };
        current.skillState = { ...current.skillState, baoPanicCharges: charges - 1 };
        const events = [`${current.playerName} 发动恐慌，${target.playerName} 下个摸牌阶段少摸 1 张。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isHuangDaxian(current) && action.skillId === "huang-use-detained") {
        if (state.phase !== "play")
            throw new Error("错算扣押牌只能在出牌阶段使用。");
        const detained = getHuangDetainedCards(current);
        const cardId = action.cardIds?.[0];
        const index = detained.findIndex((card) => card.id === cardId);
        if (!cardId || index < 0)
            throw new Error("请选择一张已扣押的错算牌。");
        const used = detained.splice(index, 1)[0];
        discardToPile(state, current, used);
        const drawCount = Math.max(1, Math.round(Math.sqrt(used.rank)));
        drawCards(state, current, drawCount);
        current.skillState = {
            ...current.skillState,
            huangDetainedCards: detained,
            huangHandLimitBonus: drawCount === 1,
            huangNoSha: drawCount === 4,
        };
        const events = [`${current.playerName} 发动错算，弃置扣押的 ${used.name} 并摸 ${drawCount} 张牌。`];
        if (drawCount === 1)
            events.push(`${current.playerName} 触发重算，本回合手牌上限 +3。`);
        if (drawCount === 4)
            events.push(`${current.playerName} 触发重算，本出牌阶段不能使用杀。`);
        state.logs.push(...events);
        return { state, events };
    }
    if (isHaijieDashen(current) && action.skillId === "haijie-jiujing") {
        if (state.phase !== "play")
            throw new Error("酒精只能在出牌阶段使用。");
        const round = getRoundNumber(state);
        const usedRound = Number(current.skillState?.haijieAlcoholRound ?? -1);
        const usedCount = usedRound === round ? Number(current.skillState?.haijieAlcoholUsedRound ?? 0) : 0;
        if (usedCount >= 2)
            throw new Error("酒精每轮最多使用两次。");
        const cardId = action.cardIds?.[0];
        if (!cardId)
            throw new Error("请选择一张锦囊牌置换成酒。");
        const trick = takeCard(current.hand, cardId);
        if (!trick)
            throw new Error("选择的手牌不存在。");
        if (trick.category !== "trick") {
            current.hand.push(trick);
            throw new Error("酒精只能置换锦囊牌。");
        }
        discardToPile(state, current, trick);
        current.hand.push(createGeneratedCard("jiu", `haijie-${state.turn}-${round}-${usedCount}-${current.hand.length}`));
        current.skillState = {
            ...current.skillState,
            haijieAlcoholRound: round,
            haijieAlcoholUsedRound: usedCount + 1,
        };
        const events = [`${current.playerName} 发动酒精，弃置 ${trick.name} 并获得一张酒。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isHongXiliang(current) && action.skillId === "hong-tanwu") {
        if (state.phase !== "play")
            throw new Error("贪污只能在出牌阶段使用。");
        if (state.seats.filter((seat) => seat.alive).length < 3)
            throw new Error("场上至少 3 人时才能发动贪污。");
        const round = getRoundNumber(state);
        const usedRound = Number(current.skillState?.hongTanwuRoundUsed ?? -99);
        if (round - usedRound < 2)
            throw new Error("贪污每两轮只能使用一次。");
        const target = requireTarget(state, current, action.targetSeatId);
        current.skillState = {
            ...current.skillState,
            hongTanwuRoundUsed: round,
            hongAccompliceTargetSeatId: target.seatId,
            hongAccompliceRound: round,
        };
        target.skillState = {
            ...target.skillState,
            hongAccompliceSourceSeatId: current.seatId,
            hongAccompliceRound: round,
        };
        const events = [`${current.playerName} 指定 ${target.playerName} 为共犯，本轮互相结算贪污效果。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isJuHui(current) && action.skillId === "ju-jianjie-tao") {
        const marks = Number(current.skillState?.juBoardMarks ?? 0);
        if (marks < 2)
            throw new Error("简洁需要 2 枚板书标记。");
        current.skillState = { ...current.skillState, juBoardMarks: marks - 2 };
        if (current.hp < current.maxHp)
            current.hp += 1;
        const events = [`${current.playerName} 消耗 2 枚板书标记，视为使用桃。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isJuHui(current) && action.skillId === "ju-jianjie-copy") {
        const marks = Number(current.skillState?.juBoardMarks ?? 0);
        if (marks < 3)
            throw new Error("复制技能需要 3 枚板书标记。");
        const target = requireTarget(state, current, action.targetSeatId);
        current.skillState = {
            ...current.skillState,
            juBoardMarks: marks - 3,
            juCopiedFromSeatId: target.seatId,
            juCopiedUntilRound: getRoundNumber(state) + 2,
        };
        const events = [`${current.playerName} 复制 ${target.playerName} 的一个非限定技能，持续 2 轮。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isYangzhiTao(current) && action.skillId === "yang-shuji") {
        if (state.phase !== "play")
            throw new Error("书记只能在出牌阶段使用。");
        if (current.skillState?.yangShujiTurn === state.turn)
            throw new Error("书记每回合只能使用一次。");
        const takeCount = Math.min(2, state.discardPile.length);
        if (takeCount <= 0)
            throw new Error("弃牌堆没有可获得的牌。");
        const gained = state.discardPile.splice(state.discardPile.length - takeCount, takeCount);
        current.hand.push(...gained);
        current.skillState = { ...current.skillState, yangShujiTurn: state.turn };
        const events = [`${current.playerName} 发动书记，获得弃牌堆最新 ${takeCount} 张牌。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isTudou(current) && action.skillId === "tudou-shenggen") {
        if (state.phase !== "play")
            throw new Error("生根只能在出牌阶段指定目标。");
        const round = getRoundNumber(state);
        const usedRound = Number(current.skillState?.tudouShenggenUsedRound ?? -99);
        if (round - usedRound < 2)
            throw new Error("生根每两轮只能指定一次。");
        const target = requireTarget(state, current, action.targetSeatId);
        const previousTargetId = current.skillState?.tudouRootTargetSeatId;
        if (typeof previousTargetId === "string" && previousTargetId !== target.seatId) {
            const previous = state.seats.find((seat) => seat.seatId === previousTargetId);
            if (previous?.skillState?.tudouRootSourceSeatId === current.seatId) {
                previous.skillState = { ...previous.skillState, tudouRootSourceSeatId: undefined, tudouRootRound: undefined };
            }
        }
        current.skillState = {
            ...current.skillState,
            tudouShenggenUsedRound: round,
            tudouRootTargetSeatId: target.seatId,
            tudouRootRound: round,
        };
        target.skillState = {
            ...target.skillState,
            tudouRootSourceSeatId: current.seatId,
            tudouRootRound: round,
        };
        const events = [`${current.playerName} 发动生根，本轮与 ${target.playerName} 共享伤害传导。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isCjj(current) && action.skillId === "cjj-shiguan") {
        if (state.phase !== "play")
            throw new Error("试管只能在出牌阶段使用。");
        if (current.skillState?.cjjShiguanTurn === state.turn)
            throw new Error("试管每回合只能使用一次。");
        const cardId = action.cardIds?.[0];
        if (!cardId)
            throw new Error("试管需要弃置一张手牌。");
        const discarded = takeCard(current.hand, cardId);
        if (!discarded)
            throw new Error("试管选择的手牌不存在。");
        const target = requireTarget(state, current, action.targetSeatId);
        discardToPile(state, current, discarded);
        target.skillState = {
            ...target.skillState,
            cjjPoisonSourceSeatId: current.seatId,
            cjjPoisonExpireTurn: state.turn + Math.max(1, state.seats.filter((seat) => seat.alive).length),
        };
        current.skillState = { ...current.skillState, cjjShiguanTurn: state.turn };
        const events = [`${current.playerName} 发动试管，弃置 ${discarded.name}，令 ${target.playerName} 获得毒标记。`];
        state.logs.push(...events);
        return { state, events };
    }
    if (isYangHaiyan(current) && (action.skillId === "yang-xiaoli-nanman" || action.skillId === "yang-xiaoli-wanjian")) {
        if (state.phase !== "play")
            throw new Error("笑里藏刀只能在出牌阶段使用。");
        const cardId = action.cardIds?.[0];
        if (!cardId)
            throw new Error("请选择桃园结义或五谷丰登。");
        const original = takeCard(current.hand, cardId);
        if (!original)
            throw new Error("笑里藏刀选择的手牌不存在。");
        if (original.cardKey !== "taoyuan" && original.cardKey !== "wugu") {
            current.hand.push(original);
            throw new Error("笑里藏刀只能转换桃园结义或五谷丰登。");
        }
        const virtualKey = action.skillId === "yang-xiaoli-nanman" ? "nanman" : "wanjian";
        const virtual = {
            ...createGeneratedCard(virtualKey, `yang-xiaoli-${state.turn}-${original.id}`),
            suit: original.suit,
            rank: original.rank,
        };
        discardToPile(state, current, original);
        const events = [`${current.playerName} 发动笑里藏刀，将 ${original.name} 当作 ${virtual.name} 使用。`];
        const effect = buildTrickEffect(state, current, virtual);
        return startWuxieCheck(state, current.seatId, virtual.name, effect, events);
    }
    if (current.character.id !== "builtin-yan-laoban" || action.skillId !== "yan-xiazhi-dili") {
        throw new Error("该技能暂未实现。");
    }
    if (state.phase !== "play")
        throw new Error("下知地理只能在出牌阶段使用。");
    if (current.skillState?.yanWuguUsed)
        throw new Error("下知地理每回合只能使用一次。");
    const cardIds = Array.from(new Set(action.cardIds ?? []));
    if (cardIds.length !== 2)
        throw new Error("下知地理需要明确选择两张手牌。");
    const discarded = [];
    for (const cardId of cardIds) {
        const card = takeCard(current.hand, cardId);
        if (!card) {
            current.hand.push(...discarded);
            throw new Error("下知地理选择的手牌不存在。");
        }
        discarded.push(card);
    }
    for (const card of discarded)
        discardToPile(state, current, card);
    current.skillState = { ...current.skillState, yanWuguUsed: true };
    const events = [`${current.playerName} 发动下知地理，弃两张牌视为使用五谷丰登。`];
    const effect = { kind: "wugu", sourceSeatId: current.seatId, queue: responseQueueFrom(state, current.seatId, true), cardName: "下知地理" };
    return startWuxieCheck(state, current.seatId, "下知地理", effect, events);
}
function tryBaguaDodge(state, seat, events) {
    const judge = drawJudgeCard(state);
    state.discardPile.push(judge);
    state.revealedCards.push(judge);
    const success = judge.suit === "heart" || judge.suit === "diamond";
    events.push(`${seat.playerName} 发动八卦阵判定 ${suitName(judge.suit)} ${judge.rank}${success ? "，视为打出闪。" : "，未生效。"}`);
    return success;
}
function isYanLaoban(seat) {
    return seat.character.id === "builtin-yan-laoban";
}
function isShenZhuxi(seat) {
    return seat.character.id === "builtin-shen-zhuxi";
}
function isShenLaoban(seat) {
    return seat.character.id === "builtin-tianzhi-jiaozi-shen-laoban";
}
function isSanshui(seat) {
    return seat.character.id === "builtin-sanshui-xiansheng";
}
function isBaoTaihou(seat) {
    return seat.character.id === "builtin-bao-taihou";
}
function isWuMao(seat) {
    return seat.character.id === "builtin-wu-mao";
}
function isGayGuan(seat) {
    return seat.character.id === "builtin-gay-guan";
}
function isHaijieDashen(seat) {
    return seat.character.id === "builtin-haijie-dashen";
}
function isHongXiliang(seat) {
    return seat.character.id === "builtin-hong-xiliang";
}
function isJuHui(seat) {
    return seat.character.id === "builtin-ju-hui";
}
function isYangzhiTao(seat) {
    return seat.character.id === "builtin-yangzhi-tao";
}
function isTudou(seat) {
    return seat.character.id === "builtin-tudou";
}
function isCjj(seat) {
    return seat.character.id === "builtin-cjj";
}
function isYangHaiyan(seat) {
    return seat.character.id === "builtin-yang-haiyan";
}
function isDengGou(seat) {
    return seat.character.id === "builtin-deng-gou";
}
function isHuangDaxian(seat) {
    return seat.character.id === "builtin-huang-daxian";
}
function getHuangDetainedCards(seat) {
    const cards = seat.skillState?.huangDetainedCards;
    return Array.isArray(cards) ? [...cards] : [];
}
function getRoundNumber(state) {
    const aliveCount = Math.max(1, state.seats.filter((seat) => seat.alive).length);
    return Math.floor((state.turn - 1) / aliveCount);
}
function processTurnStartJudgements(state, seat, events) {
    const delayed = seat.judgementArea.splice(0);
    for (const trick of delayed) {
        const judge = drawJudgeCard(state);
        events.push(`${seat.playerName} 判定 ${trick.name}：${suitName(judge.suit)} ${judge.rank}。`);
        state.discardPile.push(judge);
        state.revealedCards.push(judge);
        if (trick.delayedTrickType === "lebu") {
            if (judge.suit !== "heart") {
                seat.skipPlayPhase = true;
                events.push(`${seat.playerName} 本回合跳过出牌阶段。`);
            }
            else {
                events.push("乐不思蜀未生效。");
            }
            state.discardPile.push(trick);
            state.revealedCards.push(trick);
        }
        if (trick.delayedTrickType === "bingliang") {
            if (judge.suit !== "club") {
                seat.skipDrawPhase = true;
                events.push(`${seat.playerName} 本回合跳过摸牌阶段。`);
            }
            else {
                events.push("兵粮寸断未生效。");
            }
            state.discardPile.push(trick);
            state.revealedCards.push(trick);
        }
        if (trick.delayedTrickType === "shandian") {
            if (judge.suit === "spade" && judge.rank >= 2 && judge.rank <= 9) {
                state.discardPile.push(trick);
                state.revealedCards.push(trick);
                const paused = applyDamage(state, seat.seatId, seat.seatId, 3, trick.name, events, "thunder");
                if (paused || state.phase === "finished")
                    return;
            }
            else {
                const nextSeat = nextAliveSeatAfter(state, seat.seatId);
                if (nextSeat) {
                    nextSeat.judgementArea.push(trick);
                    events.push(`闪电移动到 ${nextSeat.playerName} 的判定区。`);
                }
                else {
                    state.discardPile.push(trick);
                    state.revealedCards.push(trick);
                }
            }
        }
    }
}
function drawForCurrentPlayer(state, amount) {
    drawCards(state, getCurrentSeat(state), amount);
    return state;
}
function drawCards(state, seat, amount) {
    for (let index = 0; index < amount; index += 1) {
        if (state.deck.length === 0) {
            state.deck = shuffleDeck(state.discardPile.splice(0), `${state.id}-${state.turn}-${index}`);
        }
        const card = state.deck.shift();
        if (card)
            seat.hand.push(card);
    }
}
function revealPublicCards(state, amount) {
    state.publicCards = [];
    for (let index = 0; index < amount; index += 1) {
        if (state.deck.length === 0) {
            state.deck = shuffleDeck(state.discardPile.splice(0), `${state.id}-public-${state.turn}-${index}`);
        }
        const card = state.deck.shift();
        if (card) {
            state.publicCards.push(card);
            state.revealedCards.push({ ...card });
        }
    }
}
function drawJudgeCard(state) {
    if (state.deck.length === 0) {
        state.deck = shuffleDeck(state.discardPile.splice(0), `${state.id}-judge-${state.turn}`);
    }
    const card = state.deck.shift();
    if (!card)
        throw new Error("牌堆为空，无法判定。");
    return card;
}
function createGeneratedCard(cardKey, seed) {
    return {
        id: `generated-${cardKey}-${seed}`,
        ...cardDef(cardKey),
        suit: "spade",
        rank: 1,
    };
}
function requirePendingResponse(state, playerId) {
    const pending = state.pendingResponse;
    if (!pending)
        throw new Error("当前没有需要响应的操作。");
    requireResponseSeatForPlayer(state, pending, playerId);
    return pending;
}
function requireResponseSeatForPlayer(state, pending, playerId) {
    const seat = state.seats.find((item) => item.playerId === playerId);
    if (!seat)
        throw new Error("当前座位不存在。");
    if (!isSeatEligibleForResponse(pending, seat.seatId))
        throw new Error("当前不是你响应。");
    return seat;
}
function isSeatEligibleForResponse(pending, seatId) {
    if (pending.mode === "global") {
        return Boolean(pending.eligibleResponderSeatIds?.includes(seatId) &&
            !pending.passedSeatIds?.includes(seatId));
    }
    return pending.responderSeatId === seatId;
}
function eligibleWuxieResponders(state) {
    return state.seats
        .filter((seat) => seat.alive && (seat.hand.some((card) => card.cardKey === "wuxie") || (isBaoTaihou(seat) && seat.hand.length >= 2)))
        .map((seat) => seat.seatId);
}
function finalizeWuxieResponse(state, pending, events) {
    const depth = Number(pending.wuxieDepth ?? 0);
    if (depth % 2 === 1) {
        events.push(`${pending.cardName} 被无懈可击抵消。`);
        return cancelEffectByWuxie(state, pending.effect, events);
    }
    return resolveEffect(state, pending.effect, events);
}
function cancelEffectByWuxie(state, effect, events) {
    if (effect.kind === "delayed" && effect.delayedTrickType === "shandian") {
        const card = takeCard(state.discardPile, effect.cardId) ?? takeCard(state.revealedCards, effect.cardId);
        if (card)
            takeCard(state.revealedCards, effect.cardId);
        const target = requireSeatById(state, effect.targetSeatId);
        const next = nextAliveSeatAfter(state, target.seatId);
        if (card && next) {
            next.judgementArea.push(card);
            events.push(`闪电被无懈抵消，移动到 ${next.playerName} 的判定区。`);
        }
        else if (card) {
            state.discardPile.push(card);
            events.push("闪电无人可传，进入弃牌堆。");
        }
    }
    if (state.phase !== "finished")
        state.phase = "play";
    state.logs.push(...events);
    return { state, events };
}
function requirePendingChoice(state, playerId) {
    const pending = state.pendingChoice;
    if (!pending)
        throw new Error("当前没有需要选择的操作。");
    const chooser = requireSeatById(state, pending.chooserSeatId);
    if (chooser.playerId !== playerId)
        throw new Error("当前不是你选择。");
    return pending;
}
function clearPendingResponse(state) {
    state.pendingResponse = undefined;
    if (!state.pendingDying && state.phase !== "finished")
        state.phase = "play";
}
function shiftNextResponder(pending) {
    return pending.queue?.shift();
}
function skipDeadResponder(state, pending) {
    if (state.seats.some((seat) => seat.seatId === pending.responderSeatId && seat.alive))
        return pending;
    const nextSeatId = shiftNextResponder(pending);
    if (!nextSeatId)
        return undefined;
    return { ...pending, responderSeatId: nextSeatId };
}
function requireTarget(state, current, targetSeatId) {
    const target = state.seats.find((seat) => seat.seatId === targetSeatId);
    if (!target || !target.alive || target.playerId === current.playerId) {
        throw new Error("请选择一个合法目标。");
    }
    return target;
}
function requireReachableTarget(state, current, targetSeatId, card) {
    const target = requireTarget(state, current, targetSeatId);
    const limit = card.cardKey === "sha" || card.cardKey === "fire_sha" || card.cardKey === "thunder_sha"
        ? getAttackRange(current)
        : card.distanceLimit;
    if (limit && getSeatDistance(state, current, target) > limit) {
        throw new Error(`${card.name} 的目标距离太远。`);
    }
    return target;
}
function requireTargetWithCards(state, current, targetSeatId, cardName) {
    const target = requireTarget(state, current, targetSeatId);
    if (collectTargetCardChoices(target).length === 0) {
        throw new Error(`${target.playerName} 没有可被 ${cardName} 处理的牌。`);
    }
    return target;
}
function requireSeatById(state, seatId) {
    const seat = state.seats.find((item) => item.seatId === seatId);
    if (!seat)
        throw new Error("座位不存在。");
    return seat;
}
function aliveSeatIds(state) {
    return state.seats.filter((seat) => seat.alive).map((seat) => seat.seatId);
}
function aliveOtherSeatIds(state, seatId) {
    return state.seats.filter((seat) => seat.alive && seat.seatId !== seatId).map((seat) => seat.seatId);
}
function responseQueueFrom(state, seatId, includeStart = false) {
    const start = state.seats.findIndex((seat) => seat.seatId === seatId);
    const result = [];
    for (let offset = includeStart ? 0 : 1; offset < state.seats.length + (includeStart ? 0 : 1); offset += 1) {
        const seat = state.seats[(start + offset) % state.seats.length];
        if (seat?.alive)
            result.push(seat.seatId);
    }
    return [...new Set(result)];
}
function findNextAliveSeatIndex(state) {
    for (let offset = 1; offset <= state.seats.length; offset += 1) {
        const index = (state.currentSeatIndex + offset) % state.seats.length;
        if (state.seats[index]?.alive)
            return index;
    }
    return state.currentSeatIndex;
}
function nextAliveSeatAfter(state, seatId) {
    const start = state.seats.findIndex((seat) => seat.seatId === seatId);
    for (let offset = 1; offset <= state.seats.length; offset += 1) {
        const seat = state.seats[(start + offset) % state.seats.length];
        if (seat?.alive)
            return seat;
    }
    return undefined;
}
function getSeatDistance(state, source, target) {
    const sourceIndex = state.seats.findIndex((seat) => seat.seatId === source.seatId);
    const targetIndex = state.seats.findIndex((seat) => seat.seatId === target.seatId);
    const clockwise = Math.abs(sourceIndex - targetIndex);
    const base = Math.min(clockwise, state.seats.length - clockwise);
    const attackHorse = source.equipment.attackHorse ? 1 : 0;
    const defenseHorse = target.equipment.defenseHorse ? 1 : 0;
    const dengHiddenHorse = isDengGou(target) && target.skillState?.dengHiddenHorse ? 1 : 0;
    return Math.max(1, base - attackHorse + defenseHorse + dengHiddenHorse);
}
function getAttackRange(seat) {
    const extraWeapons = getSkillCards(seat.skillState?.yangExtraWeapons);
    const weaponRanges = [seat.equipment.weapon, ...extraWeapons].map((card) => card?.range ?? 1);
    const boardBonus = isJuHui(seat) ? Number(seat.skillState?.juBoardMarks ?? 0) : 0;
    return Math.max(1, ...weaponRanges) + boardBonus;
}
function getSkillCards(value) {
    return Array.isArray(value) ? [...value] : [];
}
function hasWeaponKey(seat, key) {
    return (seat.equipment.weapon?.equipmentKey === key ||
        getSkillCards(seat.skillState?.yangExtraWeapons).some((card) => card.equipmentKey === key));
}
function hasArmorKey(seat, key) {
    return (seat.equipment.armor?.equipmentKey === key ||
        getSkillCards(seat.skillState?.yangExtraArmors).some((card) => card.equipmentKey === key));
}
function canReachShaTarget(state, source, target) {
    return getSeatDistance(state, source, target) <= getAttackRange(source);
}
function isHongAccompliceBlocked(state, source, target) {
    if (!isHongXiliang(target))
        return false;
    const round = getRoundNumber(state);
    return (source.skillState?.hongAccompliceSourceSeatId === target.seatId &&
        Number(source.skillState?.hongAccompliceRound ?? -1) === round);
}
function getEffectiveMaxHp(character) {
    return character.maxHp + character.skills.reduce((sum, skill) => {
        if (skill.type !== "max_hp_bonus")
            return sum;
        return sum + Number(skill.params.amount ?? 0);
    }, 0);
}
function getDrawBonus(character) {
    return character.skills.reduce((sum, skill) => {
        if (skill.type !== "draw_bonus_on_turn_start")
            return sum;
        return sum + Number(skill.params.amount ?? 0);
    }, 0);
}
function hasAliveFaction(state, faction) {
    return state.seats.some((seat) => seat.alive && seat.character.faction === faction);
}
function applyKgMarker(_state, source, target, events) {
    target.skillState = {
        ...target.skillState,
        kgSourceSeatId: source.seatId,
    };
    events.push(`${target.playerName} 获得 kg 标记。`);
}
function triggerKgCardUse(state, user, card, events) {
    const sourceSeatId = typeof user.skillState?.kgSourceSeatId === "string" ? user.skillState.kgSourceSeatId : undefined;
    if (!sourceSeatId)
        return;
    const source = state.seats.find((seat) => seat.seatId === sourceSeatId && seat.alive);
    if (!source)
        return;
    if (isSha(card)) {
        drawCards(state, source, 1);
        events.push(`${source.playerName} 因 kg 标记摸 1 张牌。`);
    }
    if (card.category === "trick" && !card.delayedTrickType) {
        const round = getRoundNumber(state);
        const usedRound = Number(source.skillState?.sanshuiKgTrickRound ?? -1);
        if (usedRound !== round) {
            source.skillState = { ...source.skillState, sanshuiKgTrickPendingRound: round };
            events.push(`${source.playerName} 的 op的神罚已触发，待本次结算后选择是否摸牌。`);
        }
    }
}
function triggerJuBoardMarkOnTrick(_state, source, card, effect, events) {
    if (!isJuHui(source) || card.category !== "trick")
        return;
    const targetIds = new Set();
    const effectData = effect;
    if (effectData.targetSeatId)
        targetIds.add(effectData.targetSeatId);
    if (effectData.weaponSeatId)
        targetIds.add(effectData.weaponSeatId);
    if (effectData.victimSeatId)
        targetIds.add(effectData.victimSeatId);
    for (const seatId of effectData.targetSeatIds ?? [])
        targetIds.add(seatId);
    for (const seatId of effectData.queue ?? [])
        targetIds.add(seatId);
    targetIds.delete(source.seatId);
    if (targetIds.size === 0)
        return;
    const marks = Math.min(3, Number(source.skillState?.juBoardMarks ?? 0) + 1);
    source.skillState = { ...source.skillState, juBoardMarks: marks };
    events.push(`${source.playerName} 获得 1 枚板书标记，当前 ${marks}/3。`);
}
function prepareBaoFirstTrick(seat, card, events) {
    if (!isBaoTaihou(seat) || card.category !== "trick" || card.delayedTrickType || seat.skillState?.baoFirstTrickUsed) {
        return card;
    }
    seat.skillState = { ...seat.skillState, baoFirstTrickUsed: true };
    events.push(`${seat.playerName} 触发愚蠢，第一张锦囊不限制距离。`);
    return { ...card, distanceLimit: undefined };
}
function equipCard(state, seat, card, events) {
    const slot = card.equipmentSlot;
    if (!slot)
        throw new Error("装备牌缺少装备槽。");
    if (isYangzhiTao(seat) && (slot === "attackHorse" || slot === "defenseHorse")) {
        throw new Error("养殖套不能装备马。");
    }
    if (isYangzhiTao(seat) && (slot === "weapon" || slot === "armor") && seat.equipment[slot]) {
        const stateKey = slot === "weapon" ? "yangExtraWeapons" : "yangExtraArmors";
        const extraCards = getSkillCards(seat.skillState?.[stateKey]);
        if (extraCards.length >= 1) {
            const removed = extraCards.shift();
            onEquipmentRemoved(seat, removed, events);
            discardToPile(state, seat, removed);
            events.push(`${seat.playerName} 替换额外装备 ${removed.name}。`);
        }
        extraCards.push(card);
        seat.skillState = { ...seat.skillState, [stateKey]: extraCards };
        onEquipmentAdded(seat, card, events);
        state.revealedCards.push(card);
        events.push(`${seat.playerName} 额外装备 ${card.name}。`);
        return;
    }
    equipCardDefault(state, seat, card, events, slot);
}
function equipCardDefault(state, seat, card, events, slot) {
    if (!slot)
        throw new Error("装备牌缺少装备槽。");
    const old = seat.equipment[slot];
    if (old) {
        removeEquipmentCard(state, seat, slot, events);
        events.push(`${seat.playerName} 替换 ${old.name}。`);
    }
    seat.equipment[slot] = card;
    onEquipmentAdded(seat, card, events);
    state.revealedCards.push(card);
    events.push(`${seat.playerName} 装备 ${card.name}。`);
}
function removeEquipmentCard(state, seat, slot, events) {
    const card = seat.equipment[slot];
    if (!card)
        return undefined;
    delete seat.equipment[slot];
    onEquipmentRemoved(seat, card, events);
    if (card.equipmentKey === "baiyin" && seat.alive && seat.hp > 0 && seat.hp < seat.maxHp) {
        seat.hp = Math.min(seat.maxHp, seat.hp + 1);
        events.push(`${seat.playerName} 失去白银狮子，回复 1 点体力。`);
    }
    discardToPile(state, seat, card);
    return card;
}
function detachEquipmentCard(seat, slot, events) {
    const card = seat.equipment[slot];
    if (!card)
        return undefined;
    delete seat.equipment[slot];
    onEquipmentRemoved(seat, card, events);
    if (card.equipmentKey === "baiyin" && seat.alive && seat.hp > 0 && seat.hp < seat.maxHp) {
        seat.hp = Math.min(seat.maxHp, seat.hp + 1);
        events.push(`${seat.playerName} 失去白银狮子，回复 1 点体力。`);
    }
    return card;
}
function onEquipmentAdded(seat, _card, events) {
    if (!isWuMao(seat))
        return;
    seat.maxHp += 1;
    seat.skillState = { ...seat.skillState, wuMaoEquipBonus: Number(seat.skillState?.wuMaoEquipBonus ?? 0) + 1 };
    events.push(`${seat.playerName} 触发健身，体力上限 +1。`);
}
function onEquipmentRemoved(seat, card, events) {
    if (!isWuMao(seat))
        return;
    const bonus = Number(seat.skillState?.wuMaoEquipBonus ?? 0);
    if (bonus <= 0)
        return;
    seat.maxHp = Math.max(1, seat.maxHp - 1);
    seat.hp = Math.min(seat.hp, seat.maxHp);
    seat.skillState = { ...seat.skillState, wuMaoEquipBonus: bonus - 1 };
    events.push(`${seat.playerName} 失去 ${card.name}，健身体力上限 -1。`);
}
function transferWeaponForJiedao(state, effect, events) {
    const source = requireSeatById(state, effect.sourceSeatId);
    const weaponSeat = requireSeatById(state, effect.weaponSeatId);
    const weapon = weaponSeat.equipment.weapon;
    if (!weapon) {
        events.push(`${weaponSeat.playerName} 没有武器可交出。`);
        return;
    }
    detachEquipmentCard(weaponSeat, "weapon", events);
    source.hand.push(weapon);
    events.push(`${source.playerName} 获得 ${weaponSeat.playerName} 的武器。`);
}
function collectTargetCardChoices(target) {
    const hand = target.hand.map((card, index) => choiceFromCard(card, "hand", target.seatId, undefined, `手牌 ${index + 1}`));
    const equipment = Object.entries(target.equipment).flatMap(([slot, card]) => card ? [choiceFromCard(card, "equipment", target.seatId, slot)] : []);
    const judge = target.judgementArea.map((card) => choiceFromCard(card, "judge", target.seatId));
    return [...hand, ...equipment, ...judge];
}
function choiceFromCard(card, area, ownerSeatId, slot, displayName) {
    return {
        id: `${area}-${ownerSeatId ?? "public"}-${slot ?? "card"}-${card.id}`,
        cardId: card.id,
        cardName: displayName ?? card.name,
        area,
        ownerSeatId,
        slot,
    };
}
function requireChoiceOption(pending, cardId, choiceIdValue) {
    const choice = pending.choices.find((item) => item.id === choiceIdValue || item.cardId === cardId);
    if (!choice)
        throw new Error("选择项不存在。");
    return choice;
}
function takeChoiceCard(state, choice) {
    if (choice.area === "public")
        return takeCard(state.publicCards, choice.cardId);
    if (!choice.ownerSeatId)
        return undefined;
    const owner = requireSeatById(state, choice.ownerSeatId);
    if (choice.area === "hand")
        return takeCard(owner.hand, choice.cardId);
    if (choice.area === "judge")
        return takeCard(owner.judgementArea, choice.cardId);
    if (choice.area === "equipment" && choice.slot) {
        const card = owner.equipment[choice.slot];
        if (card?.id === choice.cardId) {
            return detachEquipmentCard(owner, choice.slot, []);
        }
    }
    return undefined;
}
function takeCard(cards, cardId) {
    const index = cards.findIndex((card) => card.id === cardId);
    if (index < 0)
        return undefined;
    return cards.splice(index, 1)[0];
}
function takeDeterministicHandCard(state, seat, seed) {
    if (seat.hand.length === 0)
        return undefined;
    const random = seededRandom(`${state.id}-${seed}-${seat.hand.length}`);
    const index = Math.floor(random() * seat.hand.length);
    return seat.hand.splice(index, 1)[0];
}
function discardUsedCard(state, seat, card) {
    discardToPile(state, seat, card);
}
function discardToPile(state, seat, card) {
    seat.discardPile.push(card);
    state.discardPile.push(card);
    state.revealedCards.push(card);
}
function isSha(card) {
    return card.cardKey === "sha" || card.cardKey === "fire_sha" || card.cardKey === "thunder_sha";
}
function isShaKey(cardKey) {
    return cardKey === "sha" || cardKey === "fire_sha" || cardKey === "thunder_sha";
}
function isRedSuit(suit) {
    return suit === "heart" || suit === "diamond";
}
function isBlackSuit(suit) {
    return suit === "spade" || suit === "club";
}
function cardMatchesResponse(card, responseType) {
    if (responseType === "sha")
        return isSha(card);
    return card.cardKey === responseType;
}
function cloneGameState(state) {
    return structuredClone(state);
}
function finalizeAction(result) {
    flushDeferredCharacterChoice(result.state, result.events);
    applyPassiveSkills(result.state, result.events);
    syncActionTimer(result.state);
    return result;
}
function flushDeferredCharacterChoice(state, events) {
    if (state.pendingChoice || state.pendingResponse || state.pendingDying || state.phase === "finished")
        return;
    const round = getRoundNumber(state);
    const sanshui = state.seats.find((seat) => seat.alive &&
        isSanshui(seat) &&
        Number(seat.skillState?.sanshuiKgTrickPendingRound ?? -1) === round &&
        Number(seat.skillState?.sanshuiKgTrickRound ?? -1) !== round);
    if (!sanshui)
        return;
    sanshui.skillState = { ...sanshui.skillState, sanshuiKgTrickPendingRound: undefined };
    state.pendingChoice = {
        id: choiceId(state),
        kind: "skill-confirm",
        chooserSeatId: sanshui.seatId,
        sourceSeatId: sanshui.seatId,
        cardName: "sanshui-kg-trick-draw",
        effect: { kind: "draw", sourceSeatId: sanshui.seatId, amount: 1, cardName: "op的神罚" },
        prompt: `${sanshui.playerName} 可以发动 op的神罚，摸 1 张牌（本轮限一次）。`,
        choices: [],
    };
    state.phase = "response";
    events.push(state.pendingChoice.prompt);
}
function syncActionTimer(state) {
    if (state.phase === "finished" || state.winnerSeatId) {
        state.actionTimer = undefined;
        return state;
    }
    if (state.pendingResponse) {
        const durationSeconds = state.pendingResponse.responseType === "wuxie" && state.pendingResponse.mode === "global"
            ? 5
            : state.timerSettings.responseSeconds;
        setActionTimer(state, "response", state.pendingResponse.responderSeatId, state.pendingResponse.id, durationSeconds);
        return state;
    }
    if (state.pendingChoice) {
        setActionTimer(state, "response", state.pendingChoice.chooserSeatId, state.pendingChoice.id, state.timerSettings.responseSeconds);
        return state;
    }
    const current = state.seats[state.currentSeatIndex];
    if (!current) {
        state.actionTimer = undefined;
        return state;
    }
    const kind = state.phase === "discard" ? "discard" : "turn";
    const scopeId = `${kind}-${state.turn}-${current.seatId}`;
    setActionTimer(state, kind, current.seatId, scopeId, state.timerSettings.turnSeconds);
    return state;
}
function setActionTimer(state, kind, seatId, scopeId, durationSeconds) {
    if (state.actionTimer?.scopeId === scopeId && state.actionTimer.kind === kind && state.actionTimer.seatId === seatId)
        return;
    state.actionTimer = { kind, seatId, scopeId, durationSeconds, startedAt: Date.now() };
}
function markCardVoice(state, seat, card, options = {}) {
    const targetSeatIds = Array.from(new Set(options.targetSeatIds ?? [])).filter(Boolean);
    state.lastCardVoice = {
        cardId: card.id,
        cardKey: card.cardKey,
        cardName: card.name,
        seatId: seat.seatId,
        ...(options.targetSeatId ? { targetSeatId: options.targetSeatId } : {}),
        ...(targetSeatIds.length > 0 ? { targetSeatIds } : {}),
        seq: (state.lastCardVoice?.seq ?? 0) + 1,
    };
}
function markSkillVoice(state, seat, action) {
    const targetSeatIds = action.targetSeatId ? [action.targetSeatId] : [];
    state.lastSkillVoice = {
        seq: (state.lastSkillVoice?.seq ?? 0) + 1,
        seatId: seat.seatId,
        skillId: action.skillId,
        skillName: skillVoiceName(action.skillId),
        variant: skillVoiceVariant(action.skillId),
        ...(action.targetSeatId ? { targetSeatId: action.targetSeatId } : {}),
        ...(targetSeatIds.length > 0 ? { targetSeatIds } : {}),
    };
}
function skillVoiceVariant(skillId) {
    if (skillId.includes("zhangba") || skillId.includes("sha") || skillId.includes("sword") || skillId.includes("blade"))
        return "slash";
    if (skillId.includes("huo") || skillId.includes("fire"))
        return "fire";
    if (skillId.includes("lei") || skillId.includes("thunder"))
        return "thunder";
    if (skillId.includes("tao") || skillId.includes("mercy") || skillId.includes("heal"))
        return "heal";
    if (skillId.includes("shield") || skillId.includes("dang") || skillId.includes("shenggen") || skillId.includes("copy"))
        return "buff";
    if (skillId.includes("poison") || skillId.includes("cjj") || skillId.includes("silence") || skillId.includes("konghuang"))
        return "poison";
    if (skillId.includes("wuxie") || skillId.includes("negate"))
        return "negate";
    return "trick";
}
function skillVoiceName(skillId) {
    const names = {
        "zhangba-sha": "丈八蛇矛",
        "bao-double-wuxie": "愚蠢",
        "shen-xuesheng-dang": "学生党",
        "bao-konghuang": "恐慌",
        "huang-use-detained": "错算",
        "haijie-jiujing": "酒精",
        "hong-tanwu": "贪污",
        "ju-jianjie-tao": "简洁·桃",
        "ju-jianjie-copy": "简洁·复制",
        "yang-shuji": "书记",
        "tudou-shenggen": "生根",
        "cjj-shiguan": "试管",
        "yang-xiaoli-nanman": "笑里藏刀",
        "yang-xiaoli-wanjian": "笑里藏刀",
        "yan-xiazhi-dili": "地利",
        "sanshui-kg-mercy": "kg 的怜悯",
        "hanbing-sword": "寒冰剑",
        "qinglong-blade": "青龙偃月刀",
    };
    return names[skillId] ?? skillId;
}
function normalizeTimerSettings(input) {
    return {
        turnSeconds: clampTimer(input?.turnSeconds, DEFAULT_TIMER_SETTINGS.turnSeconds),
        responseSeconds: clampTimer(input?.responseSeconds, DEFAULT_TIMER_SETTINGS.responseSeconds),
    };
}
function clampTimer(value, fallback) {
    const numeric = Math.round(Number(value) || fallback);
    return Math.min(90, Math.max(15, numeric));
}
function createActiveTurn(playerId) {
    return { playerId, shaUsed: false, jiuUsed: false, jiuDamageBonus: 0, firstShaPlayed: false };
}
function responseId(state) {
    return `resp-${state.turn}-${state.logs.length}-${state.revealedCards.length}`;
}
function choiceId(state) {
    return `choice-${state.turn}-${state.logs.length}-${state.revealedCards.length}-${state.publicCards.length}`;
}
function responseName(type) {
    return { sha: "杀", shan: "闪", tao: "桃", wuxie: "无懈可击" }[type];
}
function natureText(nature) {
    if (nature === "fire")
        return "火焰";
    if (nature === "thunder")
        return "雷电";
    return "";
}
function suitName(suit) {
    return { spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方片" }[suit];
}
function teamName(teamId) {
    return teamId === "warm" ? "暖色队" : teamId === "cold" ? "冷色队" : "队伍";
}
export function getGameCardCatalog() {
    return createStarterDeck().filter((card, index, cards) => cards.findIndex((item) => item.name === card.name) === index);
}
function shuffleDeck(cards, seed) {
    const result = cards.map((card) => ({ ...card }));
    const random = seededRandom(seed);
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}
function seededRandom(seed) {
    let value = 2166136261;
    for (const char of seed) {
        value ^= char.charCodeAt(0);
        value = Math.imul(value, 16777619);
    }
    return () => {
        value += 0x6d2b79f5;
        let result = Math.imul(value ^ (value >>> 15), value | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}
