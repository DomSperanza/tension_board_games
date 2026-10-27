#!/usr/bin/env python3
"""Draw the app icon and splash screens for Android and iOS.

The icon is a patch of the staggered hold lattice with a four-hold route lit like a problem:
green start, two blue hands, pink finish. Everything is drawn here, so there are no source images.

Usage: python3 scripts/make-icons.py   (needs Pillow: pip install pillow)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ANDROID_RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
IOS_ASSETS = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets'

BG = (13, 15, 20)  # --bg in styles.css
BG_TOP, BG_BOTTOM = (22, 27, 39), (10, 12, 17)
HOLE_MAIN, HOLE_OFFSET = (38, 44, 58), (30, 35, 48)
GREEN, BLUE, PINK = (46, 230, 107), (47, 107, 255), (255, 45, 155)

PITCH = 0.165  # lattice spacing as a fraction of the 108dp adaptive-icon canvas
# (x, y) in lattice steps from the centre, y down. Whole numbers are main holds, halves are offset holds.
ROUTE = [(-1, 1, GREEN), (0.5, 0.5, BLUE), (-0.5, -0.5, BLUE), (1, -1, PINK)]
SUPERSAMPLE = 4
LEGACY_CROP = 0.75  # legacy and iOS icons show the middle of the adaptive canvas


def circle(draw, cx, cy, r, fill):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)


def background_layer(size):
    s = size * SUPERSAMPLE
    img = Image.new('RGB', (s, s))
    top, bottom = BG_TOP, BG_BOTTOM
    for y in range(s):
        t = y / (s - 1)
        img.paste(tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)), (0, y, s, y + 1))
    draw = ImageDraw.Draw(img)
    p, c = PITCH * s, s / 2
    for i in range(-5, 6):
        for j in range(-5, 6):
            circle(draw, c + i * p, c + j * p, 0.17 * p, HOLE_MAIN)
            circle(draw, c + (i + 0.5) * p, c + (j + 0.5) * p, 0.11 * p, HOLE_OFFSET)
    return img.convert('RGBA').resize((size, size), Image.LANCZOS)


def foreground_layer(size):
    s = size * SUPERSAMPLE
    p, c = PITCH * s, s / 2
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for x, y, color in ROUTE:
        circle(gdraw, c + x * p, c + y * p, 0.46 * p, color + (190,))
    img = glow.filter(ImageFilter.GaussianBlur(0.18 * p))
    draw = ImageDraw.Draw(img)
    for x, y, color in ROUTE:
        circle(draw, c + x * p, c + y * p, 0.33 * p, color + (255,))
    return img.resize((size, size), Image.LANCZOS)


def full_icon(size):
    """Background and foreground together, cropped to the middle like a legacy icon."""
    canvas = round(size / LEGACY_CROP)
    img = background_layer(canvas)
    img.alpha_composite(foreground_layer(canvas))
    offset = (canvas - size) // 2
    return img.crop((offset, offset, offset + size, offset + size))


def masked(img, shape):
    s = img.size[0] * SUPERSAMPLE
    mask = Image.new('L', (s, s), 0)
    draw = ImageDraw.Draw(mask)
    if shape == 'round':
        draw.ellipse((0, 0, s - 1, s - 1), fill=255)
    else:
        draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=0.2 * s, fill=255)
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel('A'), mask.resize(img.size, Image.LANCZOS)))
    return out


def splash(width, height):
    img = Image.new('RGB', (width, height), BG)
    size = round(min(width, height) * 0.55)
    emblem = full_icon(size)
    # Fade the lattice patch out at the edges so it sits on the plain background.
    s = size * SUPERSAMPLE
    fade = Image.new('L', (s, s), 0)
    ImageDraw.Draw(fade).ellipse((0.1 * s, 0.1 * s, 0.9 * s, 0.9 * s), fill=255)
    fade = fade.filter(ImageFilter.GaussianBlur(0.08 * s)).resize((size, size), Image.LANCZOS)
    img.paste(emblem.convert('RGB'), ((width - size) // 2, (height - size) // 2), fade)
    return img


ANDROID_DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def main():
    for density, size in ANDROID_DENSITIES.items():
        folder = ANDROID_RES / f'mipmap-{density}'
        layer = size * 108 // 48  # adaptive layers are 108dp, legacy icons 48dp
        background_layer(layer).save(folder / 'ic_launcher_background.png')
        foreground_layer(layer).save(folder / 'ic_launcher_foreground.png')
        icon = full_icon(size)
        masked(icon, 'square').save(folder / 'ic_launcher.png')
        masked(icon, 'round').save(folder / 'ic_launcher_round.png')

    for path in sorted(ANDROID_RES.glob('drawable*/splash.png')):
        with Image.open(path) as old:
            width, height = old.size
        splash(width, height).save(path)

    full_icon(1024).convert('RGB').save(IOS_ASSETS / 'AppIcon.appiconset' / 'AppIcon-512@2x.png')
    for path in sorted((IOS_ASSETS / 'Splash.imageset').glob('splash-*.png')):
        splash(2732, 2732).save(path)
    print('Wrote Android and iOS icons and splash screens')


if __name__ == '__main__':
    main()
