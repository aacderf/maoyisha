import { describe, expect, it } from "vitest";
import {
  WEREWOLF_PRESETS,
  applyWerewolfAction,
  createWerewolfGame,
  getWerewolfPrivateState,
  getWerewolfPublicState,
  setWerewolfPlayerConnected,
  type WerewolfModeratorState,
  type WerewolfRole,
} from "./werewolf.js";

function players(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `player-${index + 1}`,
    playerName: `玩家${index + 1}`,
  }));
}

function create(count = 8, seed = "werewolf-test") {
  return createWerewolfGame({
    roomId: "ROOM-WW",
    players: players(count),
    seed,
  });
}

function seatForRole(state: WerewolfModeratorState, role: WerewolfRole, index = 0) {
  const entries = Object.entries(state.roles).filter(([, item]) => item === role);
  const seatId = entries[index]?.[0];
  if (!seatId) throw new Error(`missing role ${role}`);
  return seatId;
}

function playerId(state: WerewolfModeratorState, seatId: string) {
  return state.publicState.players.find((player) => player.seatId === seatId)!.playerId;
}

function confirmAll(state: WerewolfModeratorState) {
  let current = state;
  for (const player of current.publicState.players) {
    current = applyWerewolfAction(current, {
      type: "CONFIRM_ROLE",
      playerId: player.playerId,
    }).state;
  }
  return current;
}

function completeFirstNightWithPasses(state: WerewolfModeratorState) {
  let current = confirmAll(state);
  const wolfSeats = Object.entries(current.roles)
    .filter(([, role]) => role === "werewolf")
    .map(([seatId]) => seatId);
  const victim = current.publicState.players.find(
    (player) => current.roles[player.seatId] !== "werewolf"
  )!.seatId;
  for (const wolfSeatId of wolfSeats) {
    current = applyWerewolfAction(current, {
      type: "WOLF_VOTE",
      playerId: playerId(current, wolfSeatId),
      targetSeatId: victim,
    }).state;
  }
  const seer = seatForRole(current, "seer");
  current = applyWerewolfAction(current, {
    type: "SEER_CHECK",
    playerId: playerId(current, seer),
    targetSeatId: wolfSeats[0],
  }).state;
  const witch = seatForRole(current, "witch");
  current = applyWerewolfAction(current, {
    type: "WITCH_ACTION",
    playerId: playerId(current, witch),
    action: "pass",
  }).state;
  return { state: current, victim, wolfSeats, seer, witch };
}

function playDeterministicGoodWin(count: number) {
  let state = confirmAll(create(count, `full-game-${count}`));
  let guard = 0;
  while (state.publicState.phase !== "finished" && guard++ < 200) {
    const phase = state.publicState.phase;
    if (phase === "night-wolves") {
      const alive = state.publicState.players.filter((player) => player.alive);
      const villagers = alive.filter(
        (player) => state.roles[player.seatId] === "villager"
      );
      const gods = alive.filter((player) =>
        ["seer", "witch", "hunter"].includes(state.roles[player.seatId]!)
      );
      const victim =
        villagers.length > 1
          ? villagers[0]!
          : gods.find((player) => state.roles[player.seatId] !== "hunter") ??
            gods[0]!;
      for (const wolf of alive.filter(
        (player) => state.roles[player.seatId] === "werewolf"
      )) {
        state = applyWerewolfAction(state, {
          type: "WOLF_VOTE",
          playerId: wolf.playerId,
          targetSeatId: victim.seatId,
        }).state;
      }
    } else if (phase === "night-seer") {
      const seer = state.publicState.players.find(
        (player) => player.alive && state.roles[player.seatId] === "seer"
      )!;
      const wolf = state.publicState.players.find(
        (player) => player.alive && state.roles[player.seatId] === "werewolf"
      )!;
      state = applyWerewolfAction(state, {
        type: "SEER_CHECK",
        playerId: seer.playerId,
        targetSeatId: wolf.seatId,
      }).state;
    } else if (phase === "night-witch") {
      const witch = state.publicState.players.find(
        (player) => player.alive && state.roles[player.seatId] === "witch"
      )!;
      state = applyWerewolfAction(state, {
        type: "WITCH_ACTION",
        playerId: witch.playerId,
        action: "pass",
      }).state;
    } else if (phase === "sheriff-signup") {
      for (const player of state.publicState.players.filter(
        (item) => item.alive
      )) {
        state = applyWerewolfAction(state, {
          type: "SHERIFF_SIGNUP",
          playerId: player.playerId,
          join: false,
        }).state;
      }
    } else if (
      phase === "day-speech" ||
      phase === "last-words" ||
      phase === "sheriff-speech" ||
      phase === "sheriff-runoff-speech" ||
      phase === "exile-runoff-speech"
    ) {
      const speaker =
        state.publicState.speechOrder[state.publicState.currentSpeakerIndex]!;
      state = applyWerewolfAction(state, {
        type: "COMPLETE_SPEECH",
        playerId: playerId(state, speaker),
      }).state;
    } else if (phase === "exile-vote") {
      const wolf = state.publicState.players.find(
        (player) => player.alive && state.roles[player.seatId] === "werewolf"
      )!;
      for (const voter of state.publicState.players.filter(
        (player) => player.alive
      )) {
        state = applyWerewolfAction(state, {
          type: "EXILE_VOTE",
          playerId: voter.playerId,
          targetSeatId: wolf.seatId,
        }).state;
      }
    } else {
      state = applyWerewolfAction(state, {
        type: "AUTO_TIMEOUT",
        scopeId: state.publicState.timer.scopeId,
      }).state;
    }
  }
  if (guard >= 200) {
    throw new Error(
      `full game ${count} did not finish: ${state.publicState.phase} day ${state.publicState.day}`
    );
  }
  return state;
}

describe("werewolf presets", () => {
  it("defines exact 5-8 player role counts", () => {
    expect(WEREWOLF_PRESETS.map((preset) => preset.playerCount)).toEqual([5, 6, 7, 8]);
    for (const preset of WEREWOLF_PRESETS) {
      expect(preset.roles).toHaveLength(preset.playerCount);
      expect(preset.roles.filter((role) => role === "werewolf")).toHaveLength(
        preset.playerCount >= 8 ? 3 : preset.playerCount >= 6 ? 2 : 1
      );
    }
  });

  it("rejects unsupported player counts", () => {
    expect(() => create(4)).toThrow("仅支持 5-8 人");
    expect(() => create(9)).toThrow("仅支持 5-8 人");
  });
});

describe("werewolf hidden information", () => {
  it("keeps roles out of public state before the game ends", () => {
    const state = create();
    expect(getWerewolfPublicState(state).players.every((player) => !player.revealedRole)).toBe(true);
    expect(getWerewolfPrivateState(state, seatForRole(state, "werewolf")).role).toBe("werewolf");
  });

  it("only gives wolf teammates to wolves", () => {
    const state = create();
    const wolf = seatForRole(state, "werewolf");
    const seer = seatForRole(state, "seer");
    expect(getWerewolfPrivateState(state, wolf).wolfTeammateSeatIds.length).toBeGreaterThan(0);
    expect(getWerewolfPrivateState(state, seer).wolfTeammateSeatIds).toEqual([]);
  });

  it("shares wolf vote counts only through wolf private state", () => {
    let state = confirmAll(create(6, "wolf-private-votes"));
    const wolf = seatForRole(state, "werewolf");
    const victim = state.publicState.players.find(
      (player) => state.roles[player.seatId] !== "werewolf"
    )!.seatId;
    state = applyWerewolfAction(state, {
      type: "WOLF_VOTE",
      playerId: playerId(state, wolf),
      targetSeatId: victim,
    }).state;
    expect(getWerewolfPrivateState(state, wolf).wolfVoteSummary[victim]).toBe(1);
    expect(JSON.stringify(getWerewolfPublicState(state))).not.toContain(
      "wolfVoteSummary"
    );
  });
});

describe("werewolf night actions", () => {
  it("records a seer check privately", () => {
    let state = confirmAll(create(6));
    state = applyWerewolfAction(state, {
      type: "AUTO_TIMEOUT",
      scopeId: state.publicState.timer.scopeId,
    }).state;
    const seer = seatForRole(state, "seer");
    const wolf = seatForRole(state, "werewolf");
    state = applyWerewolfAction(state, {
      type: "SEER_CHECK",
      playerId: playerId(state, seer),
      targetSeatId: wolf,
    }).state;
    expect(getWerewolfPrivateState(state, seer).seerChecks.at(-1)).toMatchObject({
      targetSeatId: wolf,
      alignment: "werewolf",
    });
  });

  it("lets the witch save the first-night victim", () => {
    let state = confirmAll(create(5));
    const wolf = seatForRole(state, "werewolf");
    const victim = state.publicState.players.find((player) => player.seatId !== wolf)!.seatId;
    state = applyWerewolfAction(state, {
      type: "WOLF_VOTE",
      playerId: playerId(state, wolf),
      targetSeatId: victim,
    }).state;
    const seer = seatForRole(state, "seer");
    state = applyWerewolfAction(state, {
      type: "SEER_CHECK",
      playerId: playerId(state, seer),
      targetSeatId: wolf,
    }).state;
    const witch = seatForRole(state, "witch");
    expect(getWerewolfPrivateState(state, witch).nightVictimSeatId).toBe(victim);
    state = applyWerewolfAction(state, {
      type: "WITCH_ACTION",
      playerId: playerId(state, witch),
      action: "save",
    }).state;
    for (const player of state.publicState.players) {
      state = applyWerewolfAction(state, {
        type: "SHERIFF_SIGNUP",
        playerId: player.playerId,
        join: false,
      }).state;
    }
    expect(state.publicState.players.find((player) => player.seatId === victim)?.alive).toBe(true);
    expect(getWerewolfPrivateState(state, witch).witchAntidoteAvailable).toBe(false);
  });

  it("prevents a poisoned hunter from shooting", () => {
    let state = confirmAll(create(7));
    const wolfSeats = Object.entries(state.roles)
      .filter(([, role]) => role === "werewolf")
      .map(([seatId]) => seatId);
    const safeVictim = seatForRole(state, "villager");
    for (const wolf of wolfSeats) {
      state = applyWerewolfAction(state, {
        type: "WOLF_VOTE",
        playerId: playerId(state, wolf),
        targetSeatId: safeVictim,
      }).state;
    }
    const seer = seatForRole(state, "seer");
    state = applyWerewolfAction(state, {
      type: "SEER_CHECK",
      playerId: playerId(state, seer),
      targetSeatId: wolfSeats[0],
    }).state;
    const witch = seatForRole(state, "witch");
    const hunter = seatForRole(state, "hunter");
    state = applyWerewolfAction(state, {
      type: "WITCH_ACTION",
      playerId: playerId(state, witch),
      action: "poison",
      targetSeatId: hunter,
    }).state;
    for (const player of state.publicState.players) {
      state = applyWerewolfAction(state, {
        type: "SHERIFF_SIGNUP",
        playerId: player.playerId,
        join: false,
      }).state;
    }
    expect(state.pendingHunterShots).not.toContain(hunter);
  });
});

describe("werewolf sheriff and day flow", () => {
  it("elects a sheriff and uses a 1.5 vote during exile", () => {
    let state = completeFirstNightWithPasses(create(8)).state;
    const alive = state.publicState.players.filter((player) => player.alive);
    const candidateA = alive[0]!;
    const candidateB = alive[1]!;
    for (const player of alive) {
      state = applyWerewolfAction(state, {
        type: "SHERIFF_SIGNUP",
        playerId: player.playerId,
        join: player.seatId === candidateA.seatId || player.seatId === candidateB.seatId,
      }).state;
    }
    while (state.publicState.phase === "sheriff-speech") {
      const speaker = state.publicState.speechOrder[state.publicState.currentSpeakerIndex]!;
      state = applyWerewolfAction(state, {
        type: "COMPLETE_SPEECH",
        playerId: playerId(state, speaker),
      }).state;
    }
    for (const voter of state.publicState.players.filter(
      (player) => player.alive && !player.sheriffCandidate
    )) {
      state = applyWerewolfAction(state, {
        type: "SHERIFF_VOTE",
        playerId: voter.playerId,
        targetSeatId: candidateA.seatId,
      }).state;
    }
    expect(state.publicState.sheriffSeatId).toBe(candidateA.seatId);
  });

  it("continues automatically when sheriff signup times out", () => {
    let state = completeFirstNightWithPasses(create(6)).state;
    expect(state.publicState.phase).toBe("sheriff-signup");
    state = applyWerewolfAction(state, {
      type: "AUTO_TIMEOUT",
      scopeId: state.publicState.timer.scopeId,
    }).state;
    expect(["dawn", "last-words", "sheriff-direction", "day-speech"]).toContain(
      state.publicState.phase
    );
  });

  it.each(["clockwise", "counterclockwise"] as const)(
    "starts %s speech beside the sheriff and leaves the sheriff last",
    (direction) => {
      let state = confirmAll(create(6, `speech-order-${direction}`));
      const wolfSeats = Object.entries(state.roles)
        .filter(([, role]) => role === "werewolf")
        .map(([seatId]) => seatId);
      const victim = state.publicState.players.find(
        (player) => state.roles[player.seatId] !== "werewolf"
      )!.seatId;
      for (const wolfSeatId of wolfSeats) {
        state = applyWerewolfAction(state, {
          type: "WOLF_VOTE",
          playerId: playerId(state, wolfSeatId),
          targetSeatId: victim,
        }).state;
      }
      const seer = seatForRole(state, "seer");
      state = applyWerewolfAction(state, {
        type: "SEER_CHECK",
        playerId: playerId(state, seer),
        targetSeatId: wolfSeats[0],
      }).state;
      const witch = seatForRole(state, "witch");
      state = applyWerewolfAction(state, {
        type: "WITCH_ACTION",
        playerId: playerId(state, witch),
        action: "save",
      }).state;

      const sheriff = state.publicState.players[2]!;
      for (const player of state.publicState.players) {
        state = applyWerewolfAction(state, {
          type: "SHERIFF_SIGNUP",
          playerId: player.playerId,
          join: player.seatId === sheriff.seatId,
        }).state;
      }
      expect(state.publicState.phase).toBe("sheriff-direction");

      const alive = state.publicState.players
        .filter((player) => player.alive)
        .map((player) => player.seatId);
      const sheriffIndex = alive.indexOf(sheriff.seatId);
      const expectedFirst =
        direction === "clockwise"
          ? alive[(sheriffIndex + 1) % alive.length]
          : alive[(sheriffIndex - 1 + alive.length) % alive.length];
      state = applyWerewolfAction(state, {
        type: "CHOOSE_SPEECH_DIRECTION",
        playerId: sheriff.playerId,
        direction,
      }).state;

      expect(state.publicState.speechOrder[0]).toBe(expectedFirst);
      expect(state.publicState.speechOrder.at(-1)).toBe(sheriff.seatId);
    }
  );
});

describe("werewolf victory", () => {
  it.each([5, 6, 7, 8])(
    "can complete a full %i-player game through the public phases",
    (count) => {
      const state = playDeterministicGoodWin(count);
      expect(state.publicState.phase).toBe("finished");
      expect(state.publicState.winner).toBe("good");
    }
  );

  it("declares good victory when all wolves die", () => {
    let state = create(5);
    const wolf = seatForRole(state, "werewolf");
    state.publicState.phase = "exile-vote";
    state.publicState.runoffCandidates = [];
    state.publicState.sheriffSeatId = undefined;
    state.exileVotes = Object.fromEntries(
      state.publicState.players
        .filter((player) => player.alive)
        .map((player) => [player.seatId, wolf])
    );
    const result = applyWerewolfAction(state, {
      type: "AUTO_TIMEOUT",
      scopeId: state.publicState.timer.scopeId,
    }).state;
    expect(result.publicState.phase).toBe("finished");
    expect(result.publicState.winner).toBe("good");
    expect(result.publicState.players.every((player) => player.revealedRole)).toBe(true);
  });

  it("declares werewolf victory after all villagers are eliminated", () => {
    let state = create(5, "wolf-slaughter-villagers");
    const villagers = Object.entries(state.roles)
      .filter(([, role]) => role === "villager")
      .map(([seatId]) => seatId);
    state.publicState.players.find((player) => player.seatId === villagers[0])!.alive = false;
    state.publicState.phase = "exile-vote";
    state.exileVotes = Object.fromEntries(
      state.publicState.players
        .filter((player) => player.alive)
        .map((player) => [player.seatId, villagers[1]])
    );
    state = applyWerewolfAction(state, {
      type: "AUTO_TIMEOUT",
      scopeId: state.publicState.timer.scopeId,
    }).state;
    expect(state.publicState.winner).toBe("werewolf");
  });

  it("declares werewolf victory after all gods are eliminated", () => {
    let state = create(5, "wolf-slaughter-gods");
    const seer = seatForRole(state, "seer");
    const witch = seatForRole(state, "witch");
    state.publicState.players.find((player) => player.seatId === witch)!.alive = false;
    state.publicState.phase = "exile-vote";
    state.exileVotes = Object.fromEntries(
      state.publicState.players
        .filter((player) => player.alive)
        .map((player) => [player.seatId, seer])
    );
    state = applyWerewolfAction(state, {
      type: "AUTO_TIMEOUT",
      scopeId: state.publicState.timer.scopeId,
    }).state;
    expect(state.publicState.winner).toBe("werewolf");
  });
});

describe("werewolf reconnect and private action state", () => {
  it("marks a disconnected player without changing their seat or role", () => {
    const state = create(6);
    const target = state.publicState.players[2]!;
    const role = state.roles[target.seatId];
    const next = setWerewolfPlayerConnected(state, target.playerId, false);
    expect(next.publicState.players[2]).toMatchObject({
      seatId: target.seatId,
      playerId: target.playerId,
      connected: false,
    });
    expect(next.roles[target.seatId]).toBe(role);
  });

  it("marks a submitted sheriff choice only in that player's private state", () => {
    let state = completeFirstNightWithPasses(create(6, "sheriff-private-submit")).state;
    const player = state.publicState.players[0]!;
    state = applyWerewolfAction(state, {
      type: "SHERIFF_SIGNUP",
      playerId: player.playerId,
      join: false,
    }).state;
    expect(getWerewolfPrivateState(state, player.seatId).actionSubmitted).toBe(true);
    expect(
      getWerewolfPrivateState(state, state.publicState.players[1]!.seatId)
        .actionSubmitted
    ).toBe(false);
  });
});
