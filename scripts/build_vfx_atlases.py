from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FRAME_ROOT = Path(os.environ.get("MAOYI_EFFEKSEER_FRAME_ROOT", ROOT / "tmp" / "effekseer-frames"))
SOURCE_ROOT = Path(os.environ.get("MAOYI_EFFEKSEER_SOURCE_ROOT", ""))
RUNTIME_ROOT = Path(os.environ.get("MAOYI_EFFEKSEER_RUNTIME_ROOT", ""))
OUTPUT_ROOT = ROOT / "assets" / "ui" / "vfx"
ATLAS_ROOT = OUTPUT_ROOT / "atlases"
FRAME_SIZE = 256
FRAME_COUNT = 24
COLS = 6

SOURCES = {
    "slash": ("Effekseer tutorial 05_02_Sample/effect.efkefc", "Effekseer"),
    "fire": ("NextSoft01/MagicFire1.efkproj", "NextSoft"),
    "thunder": ("NextSoft01/MagicThunder.efkproj", "NextSoft"),
    "heal": ("NextSoft01/MagicHeal1.efkproj", "NextSoft"),
    "shield": ("NextSoft01/MagicShield.efkproj", "NextSoft"),
    "buff": ("NextSoft01/PowerUp.efkproj", "NextSoft"),
    "trick": ("MAGICALxSPIRAL/MagicArea.efkproj", "MAGICALxSPIRAL"),
    "impact": ("MAGICALxSPIRAL/Attack_Impact.efkproj", "MAGICALxSPIRAL"),
    "defeat": ("MAGICALxSPIRAL/Breakdown.efkproj", "MAGICALxSPIRAL"),
    "poison": ("tktk01/Dark1.efkproj", "tktk"),
}

STYLE_VARIANTS = {
    "anime": {
        "slash": ("slash", "slash", 1.22, None),
        "fire": ("fire", "fire", 1.15, None),
        "thunder": ("thunder", "thunder", 1.18, None),
        "heal": ("heal", "heal", 5.0, "#8dffb4"),
        "buff": ("buff", "buff", 1.36, "#ffd77a"),
        "trick": ("trick", "trick", 1.72, "#cda8ff"),
        "negate": ("shield", "shield", 2.0, "#8ff8ee"),
        "phase": ("impact", "impact", 2.05, "#ffd77a"),
        "defeat": ("defeat", "defeat", 1.28, "#ff8d72"),
        "poison": ("poison", "poison", 0.78, "#86f279"),
    },
    "guofeng": {
        "slash": ("guofeng-slash", "slash", 1.55, "#ffe39a"),
        "fire": ("guofeng-fire", "fire", 1.34, "#ff7a32"),
        "thunder": ("guofeng-thunder", "thunder", 1.38, "#b9edff"),
        "heal": ("guofeng-heal", "heal", 5.25, "#a8ffd2"),
        "buff": ("guofeng-buff", "buff", 1.55, "#ffe08a"),
        "trick": ("guofeng-trick", "trick", 2.0, "#ffd27a"),
        "negate": ("guofeng-negate", "shield", 2.18, "#d9fbff"),
        "phase": ("guofeng-phase", "impact", 2.28, "#ffe19b"),
        "defeat": ("guofeng-defeat", "defeat", 1.44, "#ff6d4b"),
        "poison": ("guofeng-poison", "poison", 0.9, "#8cff6f"),
    },
}


def additive_to_alpha(image: Image.Image, tint: tuple[int, int, int] | None = None) -> Image.Image:
    source = image.convert("RGBA")
    output = Image.new("RGBA", source.size)
    pixels = []
    for red, green, blue, alpha in source.getdata():
        strength = max(red, green, blue)
        if alpha == 0 or strength == 0:
            pixels.append((0, 0, 0, 0))
            continue
        next_alpha = round(alpha * strength / 255)
        if tint:
            pixels.append((*tint, next_alpha))
        else:
            scale = 255 / strength
            pixels.append(
                (
                    min(255, round(red * scale)),
                    min(255, round(green * scale)),
                    min(255, round(blue * scale)),
                    next_alpha,
                )
            )
    output.putdata(pixels)
    return output


def hex_to_rgb(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def guofeng_pass(frame: Image.Image, tint: tuple[int, int, int] | None) -> Image.Image:
    base = additive_to_alpha(frame, tint)
    alpha = base.getchannel("A")
    ink_alpha = alpha.filter(ImageFilter.GaussianBlur(4)).point(lambda value: min(150, round(value * 0.5)))
    ink = Image.new("RGBA", base.size, (28, 16, 6, 0))
    ink.putalpha(ink_alpha)
    glow_alpha = alpha.filter(ImageFilter.GaussianBlur(2)).point(lambda value: min(180, round(value * 0.35)))
    glow = Image.new("RGBA", base.size, (*(tint or (255, 222, 150)), 0))
    glow.putalpha(glow_alpha)
    output = Image.new("RGBA", base.size)
    output.alpha_composite(ink)
    output.alpha_composite(glow)
    output.alpha_composite(base)
    return output


def build_atlas(output_id: str, effect_id: str, style: str, tint: str | None = None) -> None:
    source_dir = FRAME_ROOT / effect_id
    frame_paths = sorted(source_dir.glob("frame-*.png"))[:FRAME_COUNT]
    if len(frame_paths) != FRAME_COUNT:
        raise RuntimeError(f"{effect_id}: expected {FRAME_COUNT} frames, found {len(frame_paths)}")
    rows = (FRAME_COUNT + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * FRAME_SIZE, rows * FRAME_SIZE))
    frames = {}
    names = []
    effect_tint = hex_to_rgb(tint) or {
        "poison": (142, 255, 105),
        "slash": (255, 216, 116),
    }.get(effect_id)
    for index, frame_path in enumerate(frame_paths):
        source_frame = Image.open(frame_path)
        frame = guofeng_pass(source_frame, effect_tint) if style == "guofeng" else additive_to_alpha(source_frame, effect_tint)
        x = (index % COLS) * FRAME_SIZE
        y = (index // COLS) * FRAME_SIZE
        atlas.alpha_composite(frame, (x, y))
        name = f"{output_id}-{index:02d}.png"
        names.append(name)
        frames[name] = {
            "frame": {"x": x, "y": y, "w": FRAME_SIZE, "h": FRAME_SIZE},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_SIZE, "h": FRAME_SIZE},
            "sourceSize": {"w": FRAME_SIZE, "h": FRAME_SIZE},
        }
    ATLAS_ROOT.mkdir(parents=True, exist_ok=True)
    atlas.save(ATLAS_ROOT / f"{output_id}.png", optimize=True)
    data = {
        "frames": frames,
        "animations": {output_id: names},
        "meta": {
            "app": "Effekseer 1.80.5 + maoyisha atlas packer",
            "version": "1.0",
            "image": f"{output_id}.png",
            "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height},
            "scale": "1",
        },
    }
    (ATLAS_ROOT / f"{output_id}.json").write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def build_cursor_assets() -> None:
    cursor_root = OUTPUT_ROOT / "cursor"
    cursor_root.mkdir(parents=True, exist_ok=True)
    particle_source = RUNTIME_ROOT / "Resources" / "Texture" / "Particle01.png"
    sakura_source = (
        SOURCE_ROOT
        / "HATO01"
        / "HATO-Springhascome"
        / "Flowersbloom"
        / "hanagasaku.png"
    )
    if not particle_source.exists() or not sakura_source.exists():
        raise RuntimeError("Effekseer cursor trail source textures are missing")
    particle = additive_to_alpha(Image.open(particle_source))
    particle.save(cursor_root / "particle.png", optimize=True)
    sakura_preview = Image.open(sakura_source).convert("RGBA")
    sakura = additive_to_alpha(sakura_preview.crop((0, 68, 86, 164)))
    sakura.thumbnail((64, 64), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (64, 64))
    canvas.alpha_composite(sakura, ((64 - sakura.width) // 2, (64 - sakura.height) // 2))
    canvas.save(cursor_root / "sakura.png", optimize=True)
    ink_source = SOURCE_ROOT / "tktk01" / "tktk01" / "Texture" / "smoke_tex.png"
    if ink_source.exists():
        ink = Image.open(ink_source).convert("RGBA")
        ink.thumbnail((128, 128), Image.Resampling.LANCZOS)
        ink_canvas = Image.new("RGBA", (128, 128))
        ink_canvas.alpha_composite(ink, ((128 - ink.width) // 2, (128 - ink.height) // 2))
        ink_canvas.save(cursor_root / "ink.png", optimize=True)


def main() -> None:
    if not SOURCE_ROOT.exists() or not RUNTIME_ROOT.exists():
        raise RuntimeError("Set MAOYI_EFFEKSEER_SOURCE_ROOT and MAOYI_EFFEKSEER_RUNTIME_ROOT")
    built: set[str] = set()
    for style, variants in STYLE_VARIANTS.items():
        for _variant, (output_id, effect_id, _scale, tint) in variants.items():
            if output_id in built:
                continue
            build_atlas(output_id, effect_id, style, tint)
            built.add(output_id)
    build_cursor_assets()
    styles = {}
    for style, variants in STYLE_VARIANTS.items():
        styles[style] = {
            "variants": {
                variant: {
                    "atlas": f"assets/ui/vfx/atlases/{output_id}.json",
                    "animation": output_id,
                    "scale": scale,
                    **({"tint": tint} if tint and style == "anime" else {}),
                    "source": SOURCES[effect_id][0] + (" (Maoyisha guofeng tint pass)" if style == "guofeng" else ""),
                    "author": SOURCES[effect_id][1],
                    "license": "CC0-1.0",
                }
                for variant, (output_id, effect_id, scale, tint) in variants.items()
            }
        }
    manifest = {
        "version": 1,
        "frameSize": FRAME_SIZE,
        "frameCount": FRAME_COUNT,
        "fps": 30,
        "defaultStyle": "guofeng",
        "styles": styles,
        "variants": styles["anime"]["variants"],
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    (OUTPUT_ROOT / "vfx-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(OUTPUT_ROOT / "vfx-manifest.json")


if __name__ == "__main__":
    main()
