import sys
from PIL import Image, ImageDraw, ImageFont
import numpy as np

FONTS_DIR = "fonts"
def _load_font(size):
    return ImageFont.truetype(f"{FONTS_DIR}/Roboto-Bold.ttf", size)
def _headline_line_width(draw, text, font):
    return draw.textlength(text, font=font)

lines = ["PRECISA DE CAIXA RÁPIDO?", "ASSISTE ESSE VIDEO!"]
fs = 60
font = _load_font(fs)
border = 24
line_h = int(fs * 1.1)
content_h = line_h * max(1, len(lines))
baseline_offset = int(fs * 1.02)
total_w = 800
total_h = content_h + border * 2

img = Image.new("RGBA", (total_w, total_h), (255, 0, 0, 255))
draw = ImageDraw.Draw(img)

y = border + baseline_offset
for line in lines:
    lw = _headline_line_width(draw, line, font)
    x = border + (800 - border*2 - lw) // 2
    draw.text((x, y), line, font=font, fill=(255,255,255), anchor="ls")
    y += line_h

arr = np.array(img)
is_white = (arr[:, :, 0] > 200) & (arr[:, :, 1] > 200) & (arr[:, :, 2] > 200)
rows = np.any(is_white, axis=1)

from itertools import groupby
blocks = []
curr = 0
for k, g in groupby(rows):
    length = sum(1 for _ in g)
    if k:
        blocks.append((curr, curr+length-1))
    curr += length

print(f"Text blocks (start_row, end_row): {blocks}")
if len(blocks) >= 2:
    print(f"Gap between line 1 and line 2: {blocks[1][0] - blocks[0][1] - 1} pixels")
