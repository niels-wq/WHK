#!/usr/bin/env python3
"""Render a calm 1200x630 title card for each WHK article.

Reads a JSON list on stdin (slug, title, motif, tone) and writes
assets/blog/<slug>.webp. Titles are drawn as given: no extra claims,
no people, no sales line.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'blog')
W, H = 1200, 630

PAPER = (247, 243, 234)
INK = (17, 25, 43)
INK_SOFT = (91, 85, 71)
LINE = (215, 203, 176)
WHITE = (255, 255, 255)

TONES = {
    'risk': {'bar': (162, 62, 44), 'wash': (241, 220, 210)},
    'gold': {'bar': (176, 127, 38), 'wash': (241, 227, 194)},
    'savings': {'bar': (28, 110, 74), 'wash': (219, 234, 225)},
    'ink': {'bar': (17, 25, 43), 'wash': (239, 231, 212)},
}

FONT_CANDIDATES = {
    'serif': [
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf',
    ],
    'sans': [
        '/usr/share/fonts/truetype/macos/Inter-Medium.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ],
    'footer': [
        '/usr/share/fonts/truetype/macos/Inter-Regular.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ],
}


def first_font(kind, size):
    for path in FONT_CANDIDATES[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit('Geen lettertype gevonden voor ' + kind)


def wrap(text, font, max_width):
    words = str(text or '').split()
    if not words:
        return ['WHK-artikel']
    lines = []
    current = ''
    for word in words:
        trial = word if not current else current + ' ' + word
        if font.getlength(trial) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_title(title, max_width):
    for size in (56, 50, 44, 40, 36, 32):
        font = first_font('serif', size)
        lines = wrap(title, font, max_width)
        too_wide = any(font.getlength(line) > max_width + 1 for line in lines)
        if len(lines) <= 4 and not too_wide:
            return font, lines
    font = first_font('serif', 30)
    return font, wrap(title, font, max_width)[:5]


def icon_document(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 34, y - 42, x + 34, y + 42], radius=6, outline=color, width=5)
    draw.line([(x - 16, y - 8), (x + 16, y - 8)], fill=color, width=4)
    draw.line([(x - 16, y + 10), (x + 8, y + 10)], fill=color, width=4)


def icon_calendar(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 38, y - 32, x + 38, y + 40], radius=6, outline=color, width=5)
    draw.line([(x - 38, y - 8), (x + 38, y - 8)], fill=color, width=5)
    draw.line([(x - 16, y - 46), (x - 16, y - 22)], fill=color, width=5)
    draw.line([(x + 16, y - 46), (x + 16, y - 22)], fill=color, width=5)


def icon_chart(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 40, y + 6, x - 18, y + 40], radius=3, fill=color)
    draw.rounded_rectangle([x - 10, y - 28, x + 12, y + 40], radius=3, fill=color)
    draw.rounded_rectangle([x + 20, y - 8, x + 42, y + 40], radius=3, fill=color)


def icon_scale(draw, c, color):
    x, y = c
    draw.line([(x, y - 42), (x, y + 32)], fill=color, width=5)
    draw.line([(x - 50, y - 18), (x + 50, y - 18)], fill=color, width=5)
    draw.line([(x - 50, y - 18), (x - 72, y + 14), (x - 28, y + 14), (x - 50, y - 18)], fill=color, width=4)
    draw.line([(x + 50, y - 18), (x + 28, y + 14), (x + 72, y + 14), (x + 50, y - 18)], fill=color, width=4)
    draw.line([(x - 26, y + 36), (x + 26, y + 36)], fill=color, width=5)


def icon_shield(draw, c, color):
    x, y = c
    draw.line(
        [(x, y - 46), (x + 40, y - 26), (x + 34, y + 12), (x, y + 46), (x - 34, y + 12), (x - 40, y - 26), (x, y - 46)],
        fill=color,
        width=5,
    )


def icon_path(draw, c, color):
    x, y = c
    draw.line([(x - 36, y + 20), (x + 28, y - 24)], fill=color, width=5)
    draw.ellipse([x - 48, y + 8, x - 24, y + 32], outline=color, width=5)
    draw.ellipse([x + 16, y - 36, x + 40, y - 12], outline=color, width=5)


def icon_building(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 40, y - 36, x + 40, y + 42], radius=4, outline=color, width=5)
    for row in (-16, 8):
        for col in (-18, 8):
            draw.rectangle([x + col, y + row, x + col + 14, y + row + 14], outline=color, width=4)


def icon_checklist(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 40, y - 42, x + 40, y + 42], radius=6, outline=color, width=5)
    for i, yy in enumerate((-18, 2, 22)):
        draw.rounded_rectangle([x - 24, y + yy - 6, x - 12, y + yy + 6], radius=2, outline=color, width=3)
        draw.line([(x - 4, y + yy), (x + 24, y + yy)], fill=color, width=4)
    draw.line([(x - 22, y - 16), (x - 18, y - 10), (x - 12, y - 22)], fill=color, width=3)


def icon_folder(draw, c, color):
    x, y = c
    draw.rounded_rectangle([x - 44, y - 16, x + 44, y + 40], radius=6, outline=color, width=5)
    draw.line([(x - 44, y - 16), (x - 44, y - 32), (x - 4, y - 32), (x + 8, y - 16)], fill=color, width=5)
    draw.line([(x - 24, y + 8), (x + 22, y + 8)], fill=color, width=4)


def icon_clock(draw, c, color):
    x, y = c
    draw.ellipse([x - 40, y - 40, x + 40, y + 40], outline=color, width=5)
    draw.line([(x, y), (x, y - 22)], fill=color, width=5)
    draw.line([(x, y), (x + 16, y + 8)], fill=color, width=5)


ICONS = {
    'document': icon_document,
    'calendar': icon_calendar,
    'chart': icon_chart,
    'scale': icon_scale,
    'shield': icon_shield,
    'path': icon_path,
    'building': icon_building,
    'checklist': icon_checklist,
    'folder': icon_folder,
    'clock': icon_clock,
}


def render(post):
    tone = TONES.get(post.get('tone') or 'risk', TONES['risk'])
    img = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 10], fill=tone['bar'])

    kicker = first_font('sans', 22)
    footer_font = first_font('footer', 22)
    draw.text((76, 78), 'WHK-kennisbank', font=kicker, fill=tone['bar'])
    draw.rectangle([76, 118, 148, 122], fill=tone['bar'])

    font, lines = fit_title(post.get('title') or 'WHK-artikel', 760)
    line_h = font.size + 12
    block_h = len(lines) * line_h - 12
    y = 168 + max(0, (250 - block_h) // 2)
    for line in lines:
        draw.text((76, y), line, font=font, fill=INK)
        y += line_h

    draw.line([(76, 548), (300, 548)], fill=LINE, width=2)
    draw.text((76, 564), 'werkhervattingskas.nl', font=footer_font, fill=INK_SOFT)

    cx, cy, r = 1010, 300, 112
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tone['wash'])
    icon = ICONS.get(post.get('motif') or 'document', icon_document)
    icon(draw, (cx, cy + 4), tone['bar'])
    return img


def main():
    posts = json.load(sys.stdin)
    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0
    for post in posts:
        slug = post.get('slug') or ''
        if not slug:
            continue
        dest = os.path.join(OUT_DIR, slug + '.webp')
        render(post).save(dest, 'WEBP', quality=78, method=6)
        count += 1
    print('wrote %d blog images to %s' % (count, OUT_DIR))


if __name__ == '__main__':
    main()
