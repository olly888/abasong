"""Regenerate the synthetic B5-05 poster using Pillow and qrcode on macOS.

Run with Pillow and qrcode in a local Python environment. The published URL
and real distribution poster are a separate B6 change.
"""

import io
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont
import qrcode

root = Path(__file__).resolve().parent.parent
invite = root / "apps/mobile/src/invitation"
assets = invite / "assets"
content = json.loads((invite / "poster-content.json").read_text())
local = json.loads((invite / "invite-local.json").read_text())
colors = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {tokens} from './packages/ui/src/index.ts'; console.log(JSON.stringify(tokens.color))",
], cwd=root))
blue, ink = colors["brandPrimary"], colors["ink"]
font_root = Path("/System/Library/Fonts")


def font(size, heavy=False, latin=False):
    name = "SFNS.ttf" if latin else "STHeiti Medium.ttc" if heavy else "STHeiti Light.ttc"
    return ImageFont.truetype(str(font_root / name), size * 3)


def pixels(bounds):
    return tuple(x * 3 for x in bounds)


scene_raw = subprocess.check_output([
    "node", "-e",
    "require('./apps/api/node_modules/sharp')(process.argv[1]).png().toBuffer().then(b=>process.stdout.write(b)).catch(e=>{console.error(e);process.exitCode=1})",
    str(root / "deploy/invitation/invite/scene.svg"),
], cwd=root)
scene = Image.open(io.BytesIO(scene_raw)).convert("RGB")
scene.save(assets / "scene.png", optimize=True)

matrix = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=4)
matrix.add_data(local["testUrl"])
matrix.make(fit=True)
qr = matrix.make_image(fill_color=ink, back_color="white").convert("RGB")
qr.save(assets / "qr-test.png", optimize=True)

poster = Image.new("RGB", pixels((350, 423)), "white")
draw = ImageDraw.Draw(poster)


def label(x, y, text, size, fill=ink, heavy=False, latin=False):
    f = font(size, heavy, latin)
    draw.text(pixels((x, y)), text, fill, font=f, anchor="lt")
    return draw.textlength(text, font=f) / 3


draw.rounded_rectangle(pixels((20, 22, 52, 54)), 27, fill=blue)
label(29, 27, "a", 25, "white", latin=True)
label(61, 28, "abasong", 23, latin=True)
label(20, 78, content["firstLine"], 25, heavy=True)
x = label(20, 114, content["secondLine"], 25, heavy=True)
label(20 + x, 114, content["highlight"], 25, blue, heavy=True)
poster.paste(scene.resize(pixels((310, 100)), Image.Resampling.LANCZOS), pixels((20, 150)))
for idx, benefit in enumerate(content["benefits"]):
    left = 20 + idx * 105
    draw.ellipse(pixels((left, 267, left + 8, 275)), fill=blue)
    label(left + 14, 263, benefit, 14)
draw.line(pixels((20, 291, 330, 291)), fill=colors["border"], width=3)
side = qr.width // 3
poster.paste(qr, pixels((20, 303)))
label(20 + side + 13, 321, content["scan"], 15, heavy=True)
label(20 + side + 13, 348, content["scanCaption"], 13)
label(20 + side + 13, 372, local["testLabel"], 12, colors["textSecondary"])
label(20, 401, content["source"], 12, colors["textSecondary"])
poster.save(assets / "abasong-invite-test.png", optimize=True)
