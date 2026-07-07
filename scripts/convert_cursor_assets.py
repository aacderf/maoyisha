from __future__ import annotations

import io
import json
import struct
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CURSOR_ROOT = ROOT / "assets" / "ui" / "cursors"
SOURCE_CURSOR_ROOT = Path(r"D:\AI\卡牌游戏素材\光标")
MAX_ANI_FRAMES = 48


def chunks(data: bytes, start: int, end: int):
    offset = start
    while offset + 8 <= end:
        kind = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        body_start = offset + 8
        body_end = min(body_start + size, end)
        yield kind, data[body_start:body_end]
        offset = body_start + size + (size & 1)


def cursor_hotspot(data: bytes) -> tuple[int, int]:
    _reserved, cursor_type, count = struct.unpack_from("<HHH", data, 0)
    if cursor_type != 2 or count < 1:
        return (0, 0)
    entries = []
    for index in range(count):
        offset = 6 + index * 16
        width, height, _colors, _reserved, hot_x, hot_y, size, image_offset = struct.unpack_from(
            "<BBBBHHII", data, offset
        )
        entries.append(((width or 256) * (height or 256), hot_x, hot_y, size, image_offset))
    _area, hot_x, hot_y, _size, _image_offset = max(entries)
    return (hot_x, hot_y)


def save_cursor_png(source: Path, target: Path) -> dict:
    data = source.read_bytes()
    hot_x, hot_y = cursor_hotspot(data)
    with Image.open(io.BytesIO(data)) as image:
        frame = image.convert("RGBA")
        target.parent.mkdir(parents=True, exist_ok=True)
        frame.save(target, optimize=True)
        return {
            "src": target.relative_to(ROOT).as_posix(),
            "width": frame.width,
            "height": frame.height,
            "hotspot": [hot_x, hot_y],
        }


def parse_ani(source: Path, output_dir: Path, max_frames: int = MAX_ANI_FRAMES) -> dict:
    data = source.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"ACON":
        raise ValueError(f"Not an ANI file: {source}")

    ani_header = None
    rates: list[int] = []
    sequence: list[int] = []
    icons: list[bytes] = []

    def visit(payload: bytes, start: int, end: int) -> None:
        nonlocal ani_header, rates, sequence
        for kind, body in chunks(payload, start, end):
            if kind == b"anih" and len(body) >= 36:
                ani_header = struct.unpack_from("<9I", body, 0)
            elif kind == b"rate":
                rates = list(struct.unpack(f"<{len(body) // 4}I", body[: len(body) // 4 * 4]))
            elif kind == b"seq ":
                sequence = list(struct.unpack(f"<{len(body) // 4}I", body[: len(body) // 4 * 4]))
            elif kind == b"LIST" and len(body) >= 4:
                visit(body, 4, len(body))
            elif kind == b"icon":
                icons.append(body)

    visit(data, 12, len(data))
    if not icons:
        raise ValueError(f"No cursor frames found: {source}")

    default_rate = ani_header[7] if ani_header else 6
    order = sequence or list(range(len(icons)))
    if len(order) > max_frames:
        order = [order[min(len(order) - 1, round(index * (len(order) - 1) / (max_frames - 1)))] for index in range(max_frames)]
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for step, icon_index in enumerate(order):
        icon_data = icons[icon_index]
        hot_x, hot_y = cursor_hotspot(icon_data)
        with Image.open(io.BytesIO(icon_data)) as image:
            frame = image.convert("RGBA")
            target = output_dir / f"frame-{step:02d}.png"
            frame.save(target, optimize=True)
            jiffies = rates[step] if step < len(rates) else default_rate
            frames.append(
                {
                    "src": target.relative_to(ROOT).as_posix(),
                    "width": frame.width,
                    "height": frame.height,
                    "hotspot": [hot_x, hot_y],
                    "durationMs": max(16, round(jiffies * 1000 / 60)),
                }
            )
    return {"frames": frames}


def convert_cursor_asset(source: Path, target: Path) -> dict:
    if source.suffix.lower() == ".ani":
        return parse_ani(source, target.with_suffix(""))
    return save_cursor_png(source, target.with_suffix(".png"))


def main() -> None:
    manifest = {"version": 1, "baseSize": 64, "themes": {}}
    theme_sources = {
        "silksong": {
            "source_dir": CURSOR_ROOT / "silksong",
            "states": {
                "default": "default.cur",
                "pointer": "pointer.cur",
                "text": "text.cur",
                "not-allowed": "not-allowed.cur",
            },
        },
        "luoxiaohei": {
            "source_dir": CURSOR_ROOT / "luoxiaohei",
            "states": {
                "default": "default.ani",
                "pointer": "pointer.cur",
                "text": "text.cur",
                "not-allowed": "not-allowed.cur",
            },
        },
        "silverwolf": {
            "source_dir": SOURCE_CURSOR_ROOT / "Silver Wolf光标" / "here",
            "states": {
                "default": "pointer.ani",
                "pointer": "link.ani",
                "text": "text.ani",
                "not-allowed": "unavailable.ani",
            },
        },
        "firefly": {
            "source_dir": SOURCE_CURSOR_ROOT / "流萤光标",
            "states": {
                "default": "pointer.ani",
                "pointer": "link.ani",
                "text": "text.ani",
                "not-allowed": "unavailable.ani",
            },
        },
        "classicPointer": {
            "source_dir": SOURCE_CURSOR_ROOT / "普通的鼠标指针V1.5" / "安装文件",
            "states": {
                "default": "Normal.ani",
                "pointer": "Link.ani",
                "text": "Text.ani",
                "not-allowed": "Unavailable.cur",
            },
        },
    }
    for theme, config in theme_sources.items():
        source_dir = config["source_dir"]
        output_dir = CURSOR_ROOT / theme / "png"
        states = {}
        for state, filename in config["states"].items():
            source = source_dir / filename
            if not source.exists():
                raise FileNotFoundError(source)
            states[state] = convert_cursor_asset(source, output_dir / state)
        manifest["themes"][theme] = states

    target = CURSOR_ROOT / "cursor-manifest.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
