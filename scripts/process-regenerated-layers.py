"""Apply chroma keys and sprite fixes for regenerated illustration layers."""

from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources" / "illustration-layers"
ASSETS = Path(r"C:\Users\stret\.cursor\projects\c-xampp-htdocs-wm\assets")
BALLOON = OUT / "04-balloon.png"


def flood_sky(rgb: np.ndarray, thresh: int = 32) -> np.ndarray:
    h, w = rgb.shape[:2]
    imgf = rgb.astype(np.int16)
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        vis[0, x] = True
        q.append((x, 0))
    for y in range(min(50, h)):
        for x in (0, w - 1):
            if not vis[y, x]:
                vis[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        c = imgf[y, x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[ny, nx]:
                if int(np.abs(imgf[ny, nx] - c).sum()) <= thresh:
                    vis[ny, nx] = True
                    q.append((nx, ny))
    return vis


def chroma_alpha(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    mag = (r > 160) & (b > 140) & (g < 110) & (r > g + 60) & (b > g + 50)
    alpha = np.where(mag, 0, 255).astype(np.uint8)
    # Soften the key fringe.
    img = Image.fromarray(alpha, "L").filter(ImageFilter.MinFilter(3))
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    out = np.array(img)
    out[alpha >= 250] = 255
    out[mag] = 0
    return out


def crop_to_alpha(rgba: np.ndarray, pad: int = 8) -> tuple[Image.Image, tuple[int, int, int, int]]:
    a = rgba[:, :, 3]
    ys, xs = np.where(a > 8)
    h, w = a.shape
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad), min(h, y1 + pad)
    return Image.fromarray(rgba[y0:y1, x0:x1]), (x0, y0, x1, y1)


def to_rgba(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return np.dstack([rgb, alpha.astype(np.uint8)])


def split_clouds(path: Path) -> list[Image.Image]:
    rgb = np.array(Image.open(path).convert("RGB"))
    alpha = chroma_alpha(rgb)
    mask = alpha > 40
    h, w = mask.shape
    seen = np.zeros_like(mask)
    clouds = []
    for y in range(h):
        for x in range(w):
            if seen[y, x] or not mask[y, x]:
                continue
            q = deque([(x, y)])
            seen[y, x] = True
            pixels = []
            while q:
                cx, cy = q.popleft()
                pixels.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and mask[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if len(pixels) < 800:
                continue
            xs = [p[0] for p in pixels]
            ys = [p[1] for p in pixels]
            x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
            local = to_rgba(rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1])
            clouds.append((len(pixels), Image.fromarray(local)))
    clouds.sort(key=lambda t: -t[0])
    return [im for _, im in clouds]


def fix_balloon(path: Path) -> None:
    rgba = np.array(Image.open(path).convert("RGBA"))
    h, w = rgba.shape[:2]
    r, g, b, a = [rgba[:, :, i].astype(np.int16) for i in range(4)]
    gray = (0.3 * r + 0.59 * g + 0.11 * b)
    yy = np.arange(h)[:, None]
    in_band = (yy >= int(h * 0.44)) & (yy <= int(h * 0.78))
    parchment = (r > 170) & (g > 140) & (b > 85) & ((r - g) < 70) & (g + 15 > b) & (gray > 150)
    punch = in_band & parchment & (a > 0)
    rgba[punch, 3] = 0
    Image.fromarray(rgba).save(path)


def write_index(files: list[dict]) -> None:
    cards = []
    for item in files:
        name = item["file"]
        kind = item["kind"]
        cards.append(
            f'<figure><img src="{name}" alt=""><figcaption><strong>{name}</strong><br>{kind}</figcaption></figure>'
        )
    html = f"""<!doctype html>
<meta charset="utf-8">
<title>Illustration layers</title>
<style>
  body {{ font: 16px/1.4 Georgia, serif; background: #efe4cc; color: #281b12; margin: 1.5rem; }}
  h1 {{ margin-top: 0; }}
  p {{ max-width: 48rem; }}
  section {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 1rem; }}
  figure {{ margin: 0; padding: 0.75rem; background: #f7edd6; border: 1px solid #9f7d50; }}
  img {{ width: 100%; height: 12rem; object-fit: contain; background:
    linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%),
    linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%);
    background-size: 16px 16px; background-position: 0 0, 8px 8px; background-color: #fff; }}
  figcaption {{ margin-top: 0.5rem; font-size: 0.85rem; }}
</style>
<h1>Illustration layers</h1>
<p>Regenerated landscape, machine, base bar, and clouds. Sun kept. Balloon rigging punched through. Cog overlays kept; drawn cog crops and chimney steam removed.</p>
<section>
{''.join(cards)}
</section>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    files = []

    # Landscape: keep terrain, drop parchment sky.
    land_rgb = np.array(Image.open(ASSETS / "landscape-continuous.png").convert("RGB"))
    sky = flood_sky(land_rgb)
    alpha = np.where(sky, 0, 255).astype(np.uint8)
    alpha = np.array(Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=0.7)))
    alpha[~sky] = np.maximum(alpha[~sky], 220)
    alpha[sky] = 0
    Image.fromarray(to_rgba(land_rgb, alpha)).save(OUT / "01-landscape.png")
    files.append({"file": "01-landscape.png", "kind": "full-canvas landscape, no machine"})

    # Machine on transparent.
    mach_rgb = np.array(Image.open(ASSETS / "machine-isolated.png").convert("RGB"))
    mach_rgba = to_rgba(mach_rgb, chroma_alpha(mach_rgb))
    mach_img, _ = crop_to_alpha(mach_rgba, pad=12)
    mach_img.save(OUT / "02-machine.png")
    files.append({"file": "02-machine.png", "kind": "machine on transparent"})

    if (OUT / "00-sky.png").exists():
        files.append({"file": "00-sky.png", "kind": "parchment sky"})
    files.append({"file": "03-sun.png", "kind": "sun (unchanged)"})

    fix_balloon(BALLOON)
    files.append({"file": "04-balloon.png", "kind": "balloon, strings punched"})

    for old in OUT.glob("05-cloud-*.png"):
        old.unlink()
    clouds = split_clouds(ASSETS / "clouds-filled.png")
    for i, cloud in enumerate(clouds[:5], start=1):
        name = f"05-cloud-{i:02d}.png"
        cloud.save(OUT / name)
        files.append({"file": name, "kind": "filled cloud"})

    bar_rgb = np.array(Image.open(ASSETS / "base-bar.png").convert("RGB"))
    bar_img, _ = crop_to_alpha(to_rgba(bar_rgb, chroma_alpha(bar_rgb)), pad=6)
    bar_img.save(OUT / "06-base-bar.png")
    files.append({"file": "06-base-bar.png", "kind": "riveted base bar"})

    for name in (
        "06-steam-chimney.png",
        "07-temple.png",
        "08-castle.png",
        "cog-drawn-large.png",
        "cog-drawn-left.png",
        "cog-drawn-right.png",
    ):
        p = OUT / name
        if p.exists():
            p.unlink()

    for name in ("cog-overlay-a.png", "cog-overlay-b.png", "cog-overlay-c.png"):
        files.append({"file": name, "kind": "cog overlay (unchanged)"})

    if (OUT / "zz-original-machine.png").exists():
        files.append({"file": "zz-original-machine.png", "kind": "original reference"})

    (OUT / "manifest.json").write_text(
        json.dumps({"note": "Regenerated 2026-08-24", "files": files}, indent=2),
        encoding="utf-8",
    )
    write_index(files)
    print("updated", OUT)
    for f in sorted(OUT.glob("*.png")):
        im = Image.open(f)
        print(f"  {f.name:28s} {im.size} {im.mode}")


if __name__ == "__main__":
    main()
