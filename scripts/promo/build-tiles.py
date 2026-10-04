#!/usr/bin/env python3
"""Build Chrome Web Store promo tiles (no alpha, exact sizes)."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MARK = ROOT / "apps/web/public/brand/mira-mark-512.png"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "apps/extension/promo/store")
ASSETS = Path("/Users/jacob/.cursor/projects/Users-jacob-Projects-sellcoach/assets")
AI_SMALL = ASSETS / "mira-small-tile-ref.jpg"
AI_MARQUEE = ASSETS / "mira-marquee-ref.jpg"

INK = (20, 20, 20)
WHITE = (255, 255, 255)
MUTED = (95, 99, 104)
ACCENT = (232, 93, 4)
WARM = (42, 33, 28)
CREAM = (247, 244, 240)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def load_mark(size: int) -> Image.Image:
    if MARK.exists():
        im = Image.open(MARK).convert("RGBA")
    else:
        im = Image.new("RGBA", (size, size), (*INK, 255))
        d = ImageDraw.Draw(im)
        d.text((size * 0.22, size * 0.12), "M", fill=WHITE, font=font(int(size * 0.55), bold=True))
        a = max(4, size // 10)
        d.rounded_rectangle(
            ((size - a) // 2, size * 0.72, (size + a) // 2, size * 0.72 + a),
            radius=max(1, a // 5),
            fill=ACCENT,
        )
    return im.resize((size, size), Image.Resampling.LANCZOS)


def draw_bg(size: tuple[int, int], *, marquee: bool) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size, CREAM if not marquee else WARM)
    draw = ImageDraw.Draw(img, "RGBA")

    if marquee:
        # Warm dark field + soft accent glow (opaque end result).
        for i in range(18):
            alpha = 18 - i
            pad = i * 28
            draw.ellipse(
                (-200 + pad, -180 + pad, int(w * 0.55) - pad, int(h * 1.2) - pad),
                fill=(232, 93, 4, alpha),
            )
        draw.rectangle((0, 0, w, h), outline=None)
        # Flatten intentional: redraw base then paste glow via composite
        base = Image.new("RGB", size, WARM)
        overlay = Image.new("RGBA", size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        for i in range(20):
            od.ellipse(
                (-220 + i * 30, -200 + i * 24, int(w * 0.62) - i * 20, int(h * 1.25) - i * 16),
                fill=(232, 93, 4, max(0, 22 - i)),
            )
        return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")

    # Small tile: light canvas with orange corner wash
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(16):
        od.ellipse(
            (int(w * 0.35) + i * 10, -80 + i * 8, w + 80 - i * 6, int(h * 0.95) - i * 6),
            fill=(232, 93, 4, max(0, 26 - i * 1.4)),
        )
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, size: int, bold: bool = True):
    f = font(size, bold=bold)
    while size > 16:
        f = font(size, bold=bold)
        bbox = draw.textbbox((0, 0), text, font=f)
        if bbox[2] - bbox[0] <= max_width:
            return f
        size -= 2
    return font(16, bold=bold)


def cover_resize(src: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Center-crop to exact size (cover). Output RGB, no alpha."""
    tw, th = size
    im = src.convert("RGB")
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(round(sw * scale)), int(round(sh * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def save_rgb(img: Image.Image, path: Path) -> None:
    rgb = img.convert("RGB")
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        rgb.save(path, "JPEG", quality=94, optimize=True, progressive=True)
    else:
        rgb.save(path, "PNG", optimize=True)
    print(f"wrote {path.name} ({rgb.size[0]}x{rgb.size[1]} {rgb.mode})")


def build_small(path: Path) -> None:
    w, h = 440, 280
    if AI_SMALL.exists():
        img = cover_resize(Image.open(AI_SMALL), (w, h))
        save_rgb(img, path)
        return

    img = draw_bg((w, h), marquee=False)
    draw = ImageDraw.Draw(img)
    mark = load_mark(72)
    img.paste(mark, (28, 28), mark)

    title = fit_text(draw, "Mira", w - 56, 54, bold=True)
    draw.text((28, 118), "Mira", font=title, fill=INK)

    sub = font(22, bold=False)
    draw.text((28, 178), "Learn from your best people.", font=sub, fill=MUTED)

    accent = font(15, bold=True)
    draw.text((28, 230), "Chrome side panel · Learn + Record", font=accent, fill=ACCENT)

    save_rgb(img, path)


def build_marquee(path: Path) -> None:
    w, h = 1400, 560
    if AI_MARQUEE.exists():
        base = cover_resize(Image.open(AI_MARQUEE), (w, h))
        # Composite a real product panel on the right for store polish.
        panel = Image.new("RGB", (420, 420), (250, 250, 251))
        pd = ImageDraw.Draw(panel)
        pd.rounded_rectangle((0, 0, 419, 419), radius=18, fill=(250, 250, 251))
        pd.rectangle((0, 0, 419, 52), fill=(245, 246, 248))
        mini = load_mark(28)
        panel.paste(mini, (16, 12), mini)
        pd.text((52, 14), "Mira", font=font(20, bold=True), fill=INK)
        pd.text((16, 72), "Handle a churn-risk account", font=font(22, bold=True), fill=INK)
        pd.text((16, 108), "From Jordan · Customer success", font=font(16), fill=MUTED)
        y = 160
        for i, label in enumerate(
            ["Open the priority account", "Check cancellation signals", "Escalate competitor comparison"],
            start=1,
        ):
            pd.rounded_rectangle((16, y, 403, y + 58), radius=10, fill=(243, 244, 246))
            pd.text((28, y + 18), f"{i}.  {label}", font=font(17, bold=True), fill=INK)
            y += 70
        pd.rounded_rectangle((16, 380, 200, 420), radius=10, fill=ACCENT)
        pd.text((36, 390), "Start with Mira", font=font(16, bold=True), fill=WHITE)

        # Soft dark plate behind panel so it sits on the banner
        plate = Image.new("RGB", (436, 436), (28, 22, 18))
        base.paste(plate, (900, 62))
        base.paste(panel, (908, 70))
        save_rgb(base, path)
        return

    img = draw_bg((w, h), marquee=True)
    draw = ImageDraw.Draw(img)
    mark = load_mark(120)
    img.paste(mark, (72, 80), mark)
    title = fit_text(draw, "Mira", 700, 110, bold=True)
    draw.text((72, 230), "Mira", font=title, fill=WHITE)
    sub = font(36, bold=False)
    draw.text((72, 360), "Your team learns from its best people.", font=sub, fill=(230, 224, 218))
    chip = font(22, bold=True)
    draw.text((72, 430), "Record  ·  Coach  ·  Onboard", font=chip, fill=ACCENT)
    save_rgb(img, path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    build_small(OUT / "tile-small.jpeg")
    build_marquee(OUT / "tile-marquee.jpeg")

    # 24-bit PNG copies (no alpha) — also accepted by the store
    for name in ("tile-small.jpeg", "tile-marquee.jpeg"):
        src = OUT / name
        im = Image.open(src).convert("RGB")
        png = OUT / name.replace(".jpeg", ".png")
        im.save(png, "PNG", optimize=True)
        print(f"wrote {png.name} (24-bit)")


if __name__ == "__main__":
    main()
