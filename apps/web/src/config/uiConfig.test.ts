import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyCode,
  normalizeBattleVfxStyle,
  normalizeCursorSettings,
  normalizeKeyBindings,
  type KeyBindings,
} from "./uiConfig.js";

describe("ui key bindings", () => {
  it("keeps the Q/E + A/D desktop defaults", () => {
    expect(DEFAULT_KEY_BINDINGS.previousCard).toBe("KeyQ");
    expect(DEFAULT_KEY_BINDINGS.nextCard).toBe("KeyE");
    expect(DEFAULT_KEY_BINDINGS.previousTarget).toBe("KeyA");
    expect(DEFAULT_KEY_BINDINGS.nextTarget).toBe("KeyD");
  });

  it("normalizes missing and duplicated custom bindings", () => {
    const bindings = normalizeKeyBindings({
      previousCard: "KeyZ",
      nextCard: "KeyZ",
      previousTarget: "",
    } as Partial<KeyBindings>);

    expect(bindings.previousCard).toBe("KeyZ");
    expect(bindings.nextCard).toBe(DEFAULT_KEY_BINDINGS.nextCard);
    expect(bindings.previousTarget).toBe(DEFAULT_KEY_BINDINGS.previousTarget);
  });

  it("avoids keeping a duplicate when the duplicate is another command default", () => {
    const bindings = normalizeKeyBindings({
      previousCard: DEFAULT_KEY_BINDINGS.nextCard,
      nextCard: DEFAULT_KEY_BINDINGS.nextCard,
    } as Partial<KeyBindings>);

    expect(new Set(Object.values(bindings)).size).toBe(Object.values(bindings).length);
  });

  it("formats keyboard codes for settings display", () => {
    expect(formatKeyCode("KeyQ")).toBe("Q");
    expect(formatKeyCode("Digit7")).toBe("7");
    expect(formatKeyCode("Space")).toBe("Space");
  });

  it("migrates cursor settings and clamps cursor size", () => {
    expect(normalizeCursorSettings({})).toEqual({
      cursorTheme: "silksong",
      cursorSize: 1,
      cursorTrail: "particle",
    });
    expect(normalizeCursorSettings({
      cursorTheme: "luoxiaohei",
      cursorSize: 9,
      cursorTrail: "sakura",
    })).toEqual({
      cursorTheme: "luoxiaohei",
      cursorSize: 1.6,
      cursorTrail: "sakura",
    });
    expect(normalizeCursorSettings({
      cursorTheme: "silverwolf",
      cursorSize: 1,
      cursorTrail: "particle",
    })).toEqual({
      cursorTheme: "silverwolf",
      cursorSize: 1,
      cursorTrail: "particle",
    });
    expect(normalizeCursorSettings({
      cursorTheme: "firefly",
      cursorSize: 1,
      cursorTrail: "particle",
    })).toEqual({
      cursorTheme: "firefly",
      cursorSize: 1,
      cursorTrail: "particle",
    });
    expect(normalizeCursorSettings({
      cursorTheme: "classicPointer",
      cursorSize: 1,
      cursorTrail: "particle",
    })).toEqual({
      cursorTheme: "classicPointer",
      cursorSize: 1,
      cursorTrail: "particle",
    });
    expect(normalizeCursorSettings({ cursorSize: 0.1, cursorTrail: "off" })).toEqual({
      cursorTheme: "silksong",
      cursorSize: 0.6,
      cursorTrail: "off",
    });
  });

  it("normalizes battle VFX style", () => {
    expect(normalizeBattleVfxStyle("anime")).toBe("anime");
    expect(normalizeBattleVfxStyle("guofeng")).toBe("guofeng");
    expect(normalizeBattleVfxStyle("unknown")).toBe("guofeng");
  });
});
