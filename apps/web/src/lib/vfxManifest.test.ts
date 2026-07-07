import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BattleEffectVariant } from "./battleEffects.js";

const manifestPath = fileURLToPath(new URL("../../../../assets/ui/vfx/vfx-manifest.json", import.meta.url));

describe("battle VFX manifest", () => {
  it("contains both anime and guofeng variants", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      defaultStyle: string;
      styles: Record<string, { variants: Record<string, unknown> }>;
    };
    const variants: BattleEffectVariant[] = [
      "slash",
      "fire",
      "thunder",
      "heal",
      "buff",
      "trick",
      "negate",
      "phase",
      "defeat",
      "poison",
    ];

    expect(manifest.defaultStyle).toBe("guofeng");
    expect(Object.keys(manifest.styles).sort()).toEqual(["anime", "guofeng"]);
    for (const style of ["anime", "guofeng"]) {
      for (const variant of variants) {
        expect(manifest.styles[style]?.variants[variant]).toBeTruthy();
      }
    }
  });
});
