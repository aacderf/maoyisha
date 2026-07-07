import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifestPath = fileURLToPath(new URL("../../../../assets/ui/cursors/cursor-manifest.json", import.meta.url));

describe("cursor manifest", () => {
  it("contains all selectable cursor themes and core states", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      themes: Record<string, Record<string, unknown>>;
    };

    for (const theme of ["silksong", "luoxiaohei", "silverwolf", "firefly", "classicPointer"]) {
      expect(manifest.themes[theme]).toBeTruthy();
      for (const state of ["default", "pointer", "text", "not-allowed"]) {
        expect(manifest.themes[theme]?.[state]).toBeTruthy();
      }
    }
  });
});
