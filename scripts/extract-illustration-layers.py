"""Split machine.png into inspectable layer/sprite PNGs."""

from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = ROOT / "public" / "img" / "machine.png"
OUT = ROOT / "resources" / "illustration-layers"
IMG = ROOT / "public" / "img"

SKY_SEEDS = [
    (768, 20),
    (500, 15),
    (1000, 20),
    (200, 20),
    (1400, 20),
    (768, 80),
    (1100, 50),
    (600, 50),
]
SKY_THRESH = 28

# Drawn cog hubs on the 1536x1024 art (percent of canvas).
COG_HUBS = {
    "cog-drawn-large": {"cx": 0.485, "cy": 0.66, "size": 0.22},
    "cog-drawn-left": {"cx": 0.375, "cy": 0.71, "size": 0.14},
    "cog-drawn-right": {"cx": 0.59, "cy": 0.71, "size": 0.14},
}


def flood_from_seeds(img: np.ndarray, seeds: list[tuple[int, int]], thresh: int) -> np.ndarray:
    h, w = img.shape[:2]
    imgf = img.astype(np.int16)
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x, y in seeds:
        if 0 <= x < w and 0 <= y < h and not vis[y, x]:
            vis[y, x] = True
            q.append((x, y))
    while q:
        x, y = q.popleft()
        c = imgf[y, x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[ny, nx]:
                d = int(np.abs(imgf[ny, nx] - c).sum())
                if d <= thresh:
                    vis[ny, nx] = True
                    q.append((nx, ny))
    return vis


def connected_components(mask: np.ndarray, step: int = 2, min_n: int = 40):
    hs, ws = mask.shape
    small = mask[::step, ::step]
    h, w = small.shape
    seen = np.zeros_like(small)
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[y, x] or not small[y, x]:
                continue
            q = deque([(x, y)])
            seen[y, x] = True
            minx = maxx = x
            miny = maxy = y
            n = 0
            while q:
                cx, cy = q.popleft()
                n += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny, nx] and small[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if n >= min_n:
                comps.append(
                    {
                        "n": n,
                        "x0": minx * step,
                        "y0": miny * step,
                        "x1": min(ws - 1, maxx * step + step),
                        "y1": min(hs - 1, maxy * step + step),
                    }
                )
    comps.sort(key=lambda c: c["n"], reverse=True)
    return comps


def pad_box(box, w, h, pad):
    x0, y0, x1, y1 = box
    return (
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(w, x1 + pad),
        min(h, y1 + pad),
    )


def to_rgba(rgb: np.ndarray, alpha: np.ndarray) -> Image.Image:
    a = np.clip(alpha, 0, 255).astype(np.uint8)
    out = np.dstack([rgb, a])
    return Image.fromarray(out, "RGBA")


def feather_alpha(alpha: np.ndarray, radius: int = 1) -> np.ndarray:
    img = Image.fromarray(alpha.astype(np.uint8), "L")
    if radius:
        img = img.filter(ImageFilter.GaussianBlur(radius=radius))
    arr = np.array(img).astype(np.float32)
    # Keep solid interiors solid.
    arr = np.where(alpha >= 250, 255, arr)
    return arr


def save_full(path: Path, rgb: np.ndarray, mask: np.ndarray, feather: int = 1) -> None:
    alpha = feather_alpha(mask.astype(np.uint8) * 255, feather)
    to_rgba(rgb, alpha).save(path)


def crop_masked(rgb: np.ndarray, mask: np.ndarray, pad: int = 8, feather: int = 1) -> tuple[Image.Image, tuple[int, int, int, int]]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError("empty mask")
    h, w = mask.shape
    box = pad_box((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1), w, h, pad)
    x0, y0, x1, y1 = box
    piece = rgb[y0:y1, x0:x1]
    alpha = feather_alpha(mask[y0:y1, x0:x1].astype(np.uint8) * 255, feather)
    return to_rgba(piece, alpha), box


def inpaint_sky(rgb: np.ndarray, sky: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Keep real sky pixels; fill object holes with a tiled empty-parchment patch."""
    del rng
    h, w = sky.shape[:2]
    patch = rgb[4:52, 500:780]
    ph, pw = patch.shape[:2]
    tiled = np.tile(patch, (h // ph + 2, w // pw + 2, 1))[:h, :w]
    out = rgb.copy()
    out[~sky] = tiled[~sky]
    return out


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    rgb = np.array(Image.open(SRC_PATH).convert("RGB"))
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]

    print("flooding sky...")
    sky = flood_from_seeds(rgb, SKY_SEEDS, SKY_THRESH)
    obj = ~sky

    print("components...")
    comps = connected_components(obj, step=2, min_n=40)
    giant = comps[0]
    small = comps[1:]

    rng = np.random.default_rng(27)
    sky_img = inpaint_sky(rgb, sky, rng)
    Image.fromarray(sky_img).save(OUT / "00-sky.png")

    def mask_from_comp(c, extra=6):
        x0, y0, x1, y1 = pad_box((c["x0"], c["y0"], c["x1"], c["y1"]), w, h, extra)
        m = np.zeros_like(obj)
        m[y0:y1, x0:x1] = obj[y0:y1, x0:x1]
        return m

    sun_comp = next(c for c in small if c["x0"] < 80 and c["y0"] < 160)
    balloon_comp = next(c for c in small if 280 < c["x0"] < 340 and c["y0"] < 80)
    sun_mask = mask_from_comp(sun_comp)
    balloon_mask = mask_from_comp(balloon_comp)

    cloud_masks = []
    skipped = []
    for c in small:
        if c is sun_comp or c is balloon_comp:
            continue
        cx = (c["x0"] + c["x1"]) / 2 / w
        cy = (c["y0"] + c["y1"]) / 2 / h
        bw = c["x1"] - c["x0"]
        bh = c["y1"] - c["y0"]
        skyish = cy < 0.36 or (cy < 0.48 and cx < 0.16)
        real_cloud = c["n"] >= 180 and bw >= 80 and bh >= 28
        if skyish and real_cloud:
            cloud_masks.append((cy, cx, mask_from_comp(c, extra=10), c))
        else:
            skipped.append(c)

    cloud_masks.sort()
    used_sky_props = sun_mask | balloon_mask
    for _, _, m, _ in cloud_masks:
        used_sky_props |= m

    scene = obj & ~used_sky_props
    temple = scene & (xx < int(0.165 * w)) & (yy > int(0.28 * h)) & (yy < int(0.82 * h))
    castle = scene & (xx > int(0.88 * w)) & (yy > int(0.22 * h)) & (yy < int(0.84 * h))
    side_hills = scene & (yy > int(0.68 * h)) & ((xx < int(0.18 * w)) | (xx > int(0.86 * w)))
    r = rgb[:, :, 0].astype(np.int16)
    landscape = temple | castle | side_hills
    machine = scene & ~landscape

    # Chimney steam sits above the stack; keep a generous crop for cleanup.
    steam = (
        scene
        & (xx > int(0.64 * w))
        & (xx < int(0.84 * w))
        & (yy < int(0.22 * h))
        & (yy > int(0.02 * h))
        & (r > 190)
    )
    machine_body = machine & ~steam

    manifest = {
        "source": "public/img/machine.png",
        "canvas": {"width": w, "height": h},
        "note": (
            "Cut from the original etching. Parchment around sprites is keyed out, "
            "but edges and overlaps will still need a pass in an image editor. "
            "Full-canvas files (00-02) stack at 1536x1024. Sprites are cropped."
        ),
        "files": [],
    }

    def record(name, kind, box=None, extra=None):
        entry = {"file": name, "kind": kind}
        if box:
            entry["placement"] = {
                "left": box[0],
                "top": box[1],
                "width": box[2] - box[0],
                "height": box[3] - box[1],
                "left_pct": round(box[0] / w * 100, 2),
                "top_pct": round(box[1] / h * 100, 2),
            }
        if extra:
            entry.update(extra)
        manifest["files"].append(entry)

    record("00-sky.png", "full-canvas-layer")
    save_full(OUT / "01-landscape.png", rgb, landscape)
    record("01-landscape.png", "full-canvas-layer")
    save_full(OUT / "02-machine.png", rgb, machine_body)
    record("02-machine.png", "full-canvas-layer")

    sun_img, sun_box = crop_masked(rgb, sun_mask, pad=12)
    sun_img.save(OUT / "03-sun.png")
    record("03-sun.png", "sprite-animatable", sun_box)

    balloon_img, balloon_box = crop_masked(rgb, balloon_mask, pad=12)
    balloon_img.save(OUT / "04-balloon.png")
    record("04-balloon.png", "sprite-animatable", balloon_box)

    for i, (_, _, mask, c) in enumerate(cloud_masks, start=1):
        name = f"05-cloud-{i:02d}.png"
        img, box = crop_masked(rgb, mask, pad=10)
        img.save(OUT / name)
        record(name, "sprite-animatable", box)

    if steam.any():
        img, box = crop_masked(rgb, steam, pad=8)
        img.save(OUT / "06-steam-chimney.png")
        record("06-steam-chimney.png", "sprite-animatable", box)

    if temple.any():
        img, box = crop_masked(rgb, temple, pad=8)
        img.save(OUT / "07-temple.png")
        record("07-temple.png", "sprite-other", box)
    if castle.any():
        img, box = crop_masked(rgb, castle, pad=8)
        img.save(OUT / "08-castle.png")
        record("08-castle.png", "sprite-other", box)

    for name, spec in COG_HUBS.items():
        cx, cy, size = spec["cx"] * w, spec["cy"] * h, spec["size"] * w
        x0, y0 = int(cx - size / 2), int(cy - size / 2)
        x1, y1 = int(cx + size / 2), int(cy + size / 2)
        x0, y0, x1, y1 = pad_box((x0, y0, x1, y1), w, h, 4)
        crop = rgb[y0:y1, x0:x1]
        local = machine_body[y0:y1, x0:x1]
        to_rgba(crop, local.astype(np.uint8) * 255).save(OUT / f"{name}.png")
        record(
            f"{name}.png",
            "sprite-reference-from-scene",
            (x0, y0, x1, y1),
            extra={"hub_pct": {"left": spec["cx"] * 100, "top": spec["cy"] * 100}},
        )

    for src_name, dest in (
        ("cog-a.png", "cog-overlay-a.png"),
        ("cog-b.png", "cog-overlay-b.png"),
        ("cog-c.png", "cog-overlay-c.png"),
    ):
        shutil.copy2(IMG / src_name, OUT / dest)
        record(dest, "sprite-animatable-overlay", extra={"source": f"public/img/{src_name}"})

    shutil.copy2(SRC_PATH, OUT / "zz-original-machine.png")
    record("zz-original-machine.png", "reference")

    rebuild = sky_img.copy()
    for mask in [landscape, machine_body, sun_mask, balloon_mask, steam]:
        rebuild[mask] = rgb[mask]
    for _, _, mask, _ in cloud_masks:
        rebuild[mask] = rgb[mask]
    Image.fromarray(rebuild).save(OUT / "zz-rebuild-preview.png")
    record("zz-rebuild-preview.png", "reference")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_index(manifest)
    print("wrote", OUT)
    for f in sorted(OUT.iterdir()):
        if f.suffix == ".png":
            im = Image.open(f)
            print(f"  {f.name:28s} {im.size} {im.mode}")


def write_index(manifest: dict) -> None:
    cards = []
    for item in manifest["files"]:
        name = item["file"]
        kind = item["kind"]
        place = item.get("placement")
        meta = kind
        if place:
            meta += f" · place at left {place['left_pct']}% top {place['top_pct']}%"
        cards.append(
            f'<figure><img src="{name}" alt=""><figcaption><strong>{name}</strong><br>{meta}</figcaption></figure>'
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
<p>{manifest["note"]}</p>
<p>Open any PNG next to this file to clean it up. Stack the full-canvas files (00–02) at 1536×1024, then place the sprites using <code>manifest.json</code>.</p>
<section>
{''.join(cards)}
</section>
"""
    (OUT / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
