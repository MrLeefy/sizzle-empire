#!/usr/bin/env python3
"""
Deterministic Python 3.11 + Pillow image analyzer for Sizzle Empire E2E visual gates.

Computes normalized region metrics (full, top_hud 0..16%, center 22..78%,
panel 50..88%, bottom_nav 88..100%) plus optional --crop=x1,y1,x2,y2.
Passes maxcolors=w*h to Image.getcolors() to avoid Pillow's 256-color None trap.
"""

import json
import sys
from PIL import Image, ImageStat


def srgb_to_linear(channel_255: float) -> float:
    c = max(0.0, min(1.0, channel_255 / 255.0))
    if c <= 0.03928:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def wcag_luma(r: float, g: float, b: float) -> float:
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


def analyze_region(rgb_img: Image.Image, box: tuple[int, int, int, int]) -> dict:
    crop = rgb_img.crop(box)
    cw, ch = crop.size
    pixel_count = max(1, cw * ch)

    colors = crop.getcolors(maxcolors=pixel_count)
    distinct_colors = len(colors) if colors is not None else pixel_count

    stat = ImageStat.Stat(crop)
    mean_r, mean_g, mean_b = stat.mean[:3]
    std_r, std_g, std_b = stat.stddev[:3]
    mean_std_rgb = (std_r + std_g + std_b) / 3.0
    luma_255 = 0.2126 * mean_r + 0.7152 * mean_g + 0.0722 * mean_b
    wcag_luma_of_mean = wcag_luma(mean_r, mean_g, mean_b)

    hsv_stat = ImageStat.Stat(crop.convert("HSV"))
    hsv_sat = hsv_stat.mean[1] / 255.0

    gray = crop.convert("L")
    hist = gray.histogram()
    total = sum(hist) or 1
    pct_dark_lt50 = 100.0 * sum(hist[:50]) / total
    pct_bright_ge180 = 100.0 * sum(hist[180:]) / total

    return {
        "box": list(box),
        "width": cw,
        "height": ch,
        "distinct_colors": int(distinct_colors),
        "mean_rgb": [round(mean_r, 2), round(mean_g, 2), round(mean_b, 2)],
        "std_rgb": [round(std_r, 2), round(std_g, 2), round(std_b, 2)],
        "mean_std_rgb": round(mean_std_rgb, 2),
        "luma_255": round(luma_255, 2),
        "wcag_luma_of_mean": round(wcag_luma_of_mean, 4),
        "hsv_sat": round(hsv_sat, 4),
        "pct_dark_lt50": round(pct_dark_lt50, 2),
        "pct_bright_ge180": round(pct_bright_ge180, 2),
    }


def parse_crop_arg(arg: str, w: int, h: int) -> tuple[int, int, int, int]:
    parts = [int(round(float(x.strip()))) for x in arg.split(",")]
    if len(parts) != 4:
        raise ValueError(f"Expected 4 coordinates for --crop, got: {arg}")
    x1 = max(0, min(w - 1, parts[0]))
    y1 = max(0, min(h - 1, parts[1]))
    x2 = max(x1 + 1, min(w, parts[2]))
    y2 = max(y1 + 1, min(h, parts[3]))
    return (x1, y1, x2, y2)


def norm_band(h: int, frac_start: float, frac_end: float) -> tuple[int, int]:
    y1 = max(0, min(h - 1, int(round(h * frac_start))))
    y2 = max(y1 + 1, min(h, int(round(h * frac_end))))
    return (y1, y2)


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: analyze_image.py <png_path> [--crop=x1,y1,x2,y2]\n")
        return 2

    img_path = sys.argv[1]
    crop_arg = None
    for arg in sys.argv[2:]:
        if arg.startswith("--crop="):
            crop_arg = arg.split("=", 1)[1]
        else:
            sys.stderr.write(f"Unknown argument: {arg}\n")
            return 2

    try:
        with Image.open(img_path) as img:
            orig_mode = img.mode
            rgb = img.convert("RGB")
            w, h = rgb.size

        if w < 1 or h < 1:
            raise ValueError(f"Invalid empty image dimensions: {w}x{h}")

        crop_box = parse_crop_arg(crop_arg, w, h) if crop_arg is not None else None
    except (ValueError, OSError) as exc:
        sys.stderr.write(f"Error analyzing image '{img_path}': {exc}\n")
        return 2

    top_y1, top_y2 = norm_band(h, 0.0, 0.16)
    ctr_y1, ctr_y2 = norm_band(h, 0.22, 0.78)
    pan_y1, pan_y2 = norm_band(h, 0.50, 0.88)
    bot_y1, bot_y2 = norm_band(h, 0.88, 1.00)

    regions = {
        "full": analyze_region(rgb, (0, 0, w, h)),
        "top_hud": analyze_region(rgb, (0, top_y1, w, top_y2)),
        "center": analyze_region(rgb, (0, ctr_y1, w, ctr_y2)),
        "panel": analyze_region(rgb, (0, pan_y1, w, pan_y2)),
        "bottom_nav": analyze_region(rgb, (0, bot_y1, w, bot_y2)),
    }

    if crop_box is not None:
        regions["crop"] = analyze_region(rgb, crop_box)

    result = {
        "path": img_path,
        "width": w,
        "height": h,
        "mode": orig_mode,
        "regions": regions,
    }
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
