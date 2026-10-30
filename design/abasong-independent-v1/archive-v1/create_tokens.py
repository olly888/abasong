"""Generate review-stage design tokens and check approved text pairs locally."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COLORS = {
    "ink": "#18211D",
    "inkSoft": "#35443B",
    "signal": "#D5F24A",
    "signalSoft": "#F1F8D4",
    "canvas": "#F4F5F0",
    "surface": "#FFFFFF",
    "surfaceMuted": "#ECEFE7",
    "textSecondary": "#56645A",
    "textMuted": "#66736A",
    "border": "#DCE2D7",
    "controlBorder": "#7C897F",
    "success": "#236346",
    "successSoft": "#E6F2E9",
    "warning": "#855307",
    "warningSoft": "#FFF1D5",
    "danger": "#AE3734",
    "dangerSoft": "#FBE9E6",
    "info": "#315F8B",
    "infoSoft": "#EAF0F8",
    "focus": "#315F8B",
    "mapLand": "#E8EDE1",
    "mapPark": "#D8E3C8",
    "mapRoad": "#FFFFFF",
    "mapArterial": "#D0D7CB",
    "mapLabel": "#586451",
}

def tok(kind, value, description=None):
    out = {"$type": kind, "$value": value}
    if description:
        out["$description"] = description
    return out

def dimension(value):
    return tok("dimension", {"value": value, "unit": "px"})

tokens = {
    "$description": "Abasong independent direction v1; design proposal, not a released identity.",
    "color": {k: tok("color", v) for k, v in COLORS.items()},
    "space": {str(v): dimension(v) for v in [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]},
    "radius": {k: dimension(v) for k, v in {"control": 12, "card": 20, "sheet": 28, "pill": 999}.items()},
    "size": {k: dimension(v) for k, v in {"touchMin": 48, "button": 52, "icon": 24, "iconSmall": 20}.items()},
    "fontSize": {k: dimension(v) for k, v in {"caption": 13, "label": 14, "body": 16, "title": 20, "heading": 28, "display": 40}.items()},
    "fontWeight": {"regular": tok("fontWeight", 400), "medium": tok("fontWeight", 500), "semibold": tok("fontWeight", 600), "bold": tok("fontWeight", 700)},
    "motion": {"fast": tok("duration", {"value": 120, "unit": "ms"}), "normal": tok("duration", {"value": 200, "unit": "ms"}), "sheet": tok("duration", {"value": 280, "unit": "ms"})},
    "semantic": {
        "actionPrimary": tok("color", "{color.ink}"),
        "actionPrimaryText": tok("color", "{color.surface}"),
        "actionHighlight": tok("color", "{color.signal}"),
        "actionHighlightText": tok("color", "{color.ink}"),
        "textPrimary": tok("color", "{color.ink}"),
        "surfaceApp": tok("color", "{color.canvas}"),
        "surfaceCard": tok("color", "{color.surface}"),
    },
}
(ROOT / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")
css = [":root {"]
css += [f"  --color-{k}: {v};" for k, v in COLORS.items()]
css += [f"  --space-{v}: {v}px;" for v in [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]]
css += ["  --radius-control: 12px;", "  --radius-card: 20px;", "  --radius-sheet: 28px;", "  --touch-min: 48px;", "}"]
(ROOT / "tokens.css").write_text("\n".join(css) + "\n")

def luminance(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in [1, 3, 5]]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]
    return sum(c * w for c, w in zip(linear, [0.2126, 0.7152, 0.0722]))

pairs = [
    ("ink", "surface", 4.5), ("ink", "signal", 4.5),
    ("textSecondary", "surface", 4.5), ("textMuted", "surface", 4.5),
    ("success", "successSoft", 4.5), ("warning", "warningSoft", 4.5),
    ("danger", "dangerSoft", 4.5), ("info", "infoSoft", 4.5),
    ("controlBorder", "surface", 3.0), ("focus", "surface", 3.0),
]
report = []
for fg, bg, threshold in pairs:
    a, b = sorted([luminance(COLORS[fg]), luminance(COLORS[bg])], reverse=True)
    ratio = (a + 0.05) / (b + 0.05)
    assert ratio >= threshold, (fg, bg, ratio)
    report.append({"foreground": fg, "background": bg, "contrast": round(ratio, 2), "minimum": threshold, "pass": True})
(ROOT / "contrast-check.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Generated tokens.json, tokens.css and {len(report)} passing contrast checks.")
