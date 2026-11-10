"""Helpers that chart code in the chart library can use.

A chart file returns a *chart spec*: a plain dictionary that describes the
chart in PowerPoint's own terms (bars, gap width, colours, axis range, labels).
The same spec is drawn on the Deck Studio canvas and written to PowerPoint as
native, editable charts, so what you see is what you export.

Spec layout (all positions are fractions 0..1 of the chart object):

spec = {
  "font": "Interstate",
  "panels": [ PANEL, ... ],      # each panel becomes one native chart
  "legend": LEGEND or None,      # drawn as small squares + text boxes
  "texts":  [ TEXT, ... ],       # extra text boxes (titles, notes)
  "shapes": [ LINE, ... ],       # extra straight lines (baselines, dividers)
}

PANEL = {
  "x", "y", "w", "h": where the native chart sits inside the object,
  "kind": "bar" | "line" | "pie" | "doughnut",
  "direction": "col" (vertical bars) | "bar" (horizontal bars),
  "grouping": "stacked" | "clustered" | "percentStacked" | "standard",
  "categories": ["Prior", "Current", ...],         # one per slot
  "groups": [{"label": "2025", "span": 2}, ...] or None,   # second label row
  "series": [{"name", "values", "color", "labelColor",
              "pointColors": {index: colour}, "hideLabels": [index, ...],
              "lineWidth": 2.25, "marker": "none" | "circle"}],
  "gapWidth": 0..500, "overlap": -100..100,
  "plot": {"x", "y", "w", "h"},                    # inner plot area, fractions of the panel
  "valueAxis": {"min", "max", "visible", "gridlines", "numFmt", "labelSize"},
  "categoryAxis": {"visible", "line", "lineColor", "labelSize", "labelColor", "reverse"},
  "dataLabels": {"show", "size", "numFmt", "color", "position"},
  "totals": {"show", "values", "size", "bold", "color", "numFmt"},
  "holeSize": 55, "firstSliceAngle": 0, "pieLabels": "value" | "percent" | "none",
}
LEGEND = {"items": [{"name", "color"}], "x", "y", "w", "h", "size", "color"}
TEXT   = {"x", "y", "w", "h", "text", "size", "bold", "color", "align": "l"|"ctr"|"r"}
LINE   = {"x1", "y1", "x2", "y2", "color", "width" (points), "dash": "solid"|"dash"|"dot"}
"""
import math

HOUSE = ["#00778B", "#3BAEB7", "#75E4E3", "#FFD200", "#5B6770", "#A7B1B7", "#004F5D", "#B8EDEC"]
DARK_TEXT = "#262626"
MID_TEXT = "#595959"


def records(table):
    """Turn {columns, rows} into a list of dicts keyed by column name."""
    cols = table.get("columns", [])
    return [dict(zip(cols, row)) for row in table.get("rows", [])]


def number(value, default=0.0):
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def numeric_columns(table, skip=()):
    cols = table.get("columns", [])
    out = []
    for i, c in enumerate(cols):
        if c in skip:
            continue
        vals = [r[i] for r in table.get("rows", []) if i < len(r)]
        if vals and all(isinstance(v, (int, float)) or v in (None, "") for v in vals):
            out.append(c)
    return out


def nice_max(value, headroom=1.1):
    """Round an axis maximum up to a tidy number."""
    value = float(value or 0) * headroom
    if value <= 0:
        return 1.0
    exp = math.floor(math.log10(value))
    base = 10 ** exp
    for step in (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10):
        if step * base >= value:
            return step * base
    return 10 * base


def tint(hex_color, amount):
    """Mix a colour with white. amount 0 = unchanged, 1 = white."""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    r = round(r + (255 - r) * amount)
    g = round(g + (255 - g) * amount)
    b = round(b + (255 - b) * amount)
    return "#%02X%02X%02X" % (r, g, b)


def text_on(hex_color):
    """White or dark text, whichever reads better on the given fill."""
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))

    def lin(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return "#FFFFFF" if lum < 0.45 else DARK_TEXT


def colour(settings_colors, i):
    pal = settings_colors or HOUSE
    return pal[i % len(pal)]


def legend(items, frame, size=9, y=0.0, height_pt=None, color=MID_TEXT, x=0.0):
    """A one-row legend across the top of the chart.

    Each item gets a width from its text length (square + gap + text + space),
    stored as a fraction in item["w"], so both the canvas and PowerPoint place
    the items in exactly the same spots.
    """
    h_pt = height_pt or size * 2.0
    out, total = [], 0.0
    for it in items:
        w_pt = size * 0.8 + size * 0.4 + len(str(it.get("name", ""))) * size * 0.56 + size * 1.6
        frac = w_pt / float(frame["w"])
        out.append(dict(it, w=frac))
        total += frac
    return {
        "items": out,
        "x": x,
        "y": y,
        "w": min(1.0, total),
        "h": h_pt / frame["h"],
        "size": size,
        "color": color,
    }
