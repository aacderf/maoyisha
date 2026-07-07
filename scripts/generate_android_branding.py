from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
UI = ROOT / "assets" / "ui"


def build_emblem() -> Image.Image:
    sheet = Image.open(UI / "maoyi-icons.png").convert("RGBA")
    emblem = sheet.crop((0, 20, 390, 470))
    pixels = emblem.load()
    for y in range(emblem.height):
        for x in range(emblem.width):
            r, g, b, _ = pixels[x, y]
            light = max(r, g, b)
            alpha = max(0, min(255, (light - 18) * 7))
            pixels[x, y] = (r, g, b, alpha)
    bbox = emblem.getbbox()
    return emblem.crop(bbox).filter(ImageFilter.UnsharpMask(radius=1.2, percent=115))


def build_icon(emblem: Image.Image, size: int, round_icon: bool = False) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (9, 11, 9, 255))
    draw = ImageDraw.Draw(canvas)
    for radius, color in (
        (0.48, (18, 29, 24, 255)),
        (0.42, (16, 43, 32, 255)),
        (0.35, (8, 18, 14, 255)),
    ):
        pad = int(size * (0.5 - radius))
        draw.ellipse((pad, pad, size - pad, size - pad), fill=color)
    draw.ellipse(
        (size * 0.08, size * 0.08, size * 0.92, size * 0.92),
        outline=(201, 157, 72, 255),
        width=max(2, size // 55),
    )
    target = int(size * 0.76)
    scaled = emblem.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    canvas.alpha_composite(scaled, (x, y))
    if round_icon:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
        canvas.putalpha(mask)
    return canvas


def build_foreground(emblem: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = int(size * 0.58)
    scaled = emblem.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def cover(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    ratio = max(size[0] / source.width, size[1] / source.height)
    resized = source.resize(
        (round(source.width * ratio), round(source.height * ratio)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def build_splash(emblem: Image.Image, size: tuple[int, int]) -> Image.Image:
    table = Image.open(UI / "table-bg.png").convert("RGB")
    canvas = cover(table, size)
    canvas = ImageEnhance.Brightness(canvas).enhance(0.32).convert("RGBA")
    shade = Image.new("RGBA", size, (0, 0, 0, 70))
    canvas = Image.alpha_composite(canvas, shade)
    target = int(min(size) * 0.48)
    scaled = emblem.copy()
    scaled.thumbnail((target, target), Image.Resampling.LANCZOS)
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    cx, cy = size[0] // 2, size[1] // 2
    glow_draw.ellipse(
        (cx - target * 0.55, cy - target * 0.55, cx + target * 0.55, cy + target * 0.55),
        fill=(61, 169, 125, 62),
    )
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(target * 0.16)))
    canvas.alpha_composite(scaled, ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2))
    return canvas.convert("RGB")


def main() -> None:
    emblem = build_emblem()
    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for density, (icon_size, foreground_size) in densities.items():
        target = RES / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)
        build_icon(emblem, icon_size).save(target / "ic_launcher.png")
        build_icon(emblem, icon_size, round_icon=True).save(target / "ic_launcher_round.png")
        build_foreground(emblem, foreground_size).save(target / "ic_launcher_foreground.png")

    landscape_sizes = {
        "mdpi": (480, 320),
        "hdpi": (800, 480),
        "xhdpi": (1280, 720),
        "xxhdpi": (1600, 960),
        "xxxhdpi": (1920, 1280),
    }
    portrait_sizes = {
        "mdpi": (320, 480),
        "hdpi": (480, 800),
        "xhdpi": (720, 1280),
        "xxhdpi": (960, 1600),
        "xxxhdpi": (1280, 1920),
    }
    for density, size in landscape_sizes.items():
        target = RES / f"drawable-land-{density}"
        target.mkdir(parents=True, exist_ok=True)
        build_splash(emblem, size).save(target / "splash.png", quality=92)
    for density, size in portrait_sizes.items():
        target = RES / f"drawable-port-{density}"
        target.mkdir(parents=True, exist_ok=True)
        build_splash(emblem, size).save(target / "splash.png", quality=92)

    build_splash(emblem, (480, 320)).save(RES / "drawable" / "splash.png", quality=92)
    print("Android 图标和启动图已生成。")


if __name__ == "__main__":
    main()
