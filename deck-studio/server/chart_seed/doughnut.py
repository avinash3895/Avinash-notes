TITLE = "Doughnut"
DESCRIPTION = "Share of total by category, with percentage labels."

# ============================================================
# SETTINGS  (change these numbers and colours freely)
# ============================================================
SETTINGS = {
    "category_column": "",
    "value_column": "",
    "colors": ["#00778B", "#3BAEB7", "#75E4E3", "#FFD200", "#5B6770"],
    "hole_size": 58,               # 10..90, size of the hole in %
    "labels": "percent",           # percent, value or none
    "show_legend": True,
    "font": "Interstate",
    "label_size": 10,
    "number_format": "0%",
    "text_color": "#262626",
}

# ============================================================
# AI PROMPT  (copy this into Claude to make a new chart type)
# ============================================================
AI_PROMPT = """
You are writing a chart file for Deck Studio. Reply with one complete Python file.
The file must define TITLE, DESCRIPTION, SETTINGS (a dict of simple values),
AI_PROMPT (this text), SAMPLE (a dict with "columns" and "rows") and
build(table, settings, frame) that returns a chart spec dict.
- table is {"columns": [...], "rows": [[...], ...]} read from an Excel table.
- settings is SETTINGS merged with any per-chart overrides.
- frame is {"w": width_in_points, "h": height_in_points} of the chart object.
- The spec format is described at the top of deckchart.py (panels, legend,
  texts, shapes). Every position is a fraction 0..1 of the object.
- Only use what the spec supports: bar (col/bar, stacked/clustered/percentStacked),
  line, pie, doughnut, data labels, totals (vertical bars only), point colours,
  hidden labels, legend items, extra text boxes and straight lines.
- You may use: from deckchart import HOUSE, records, number, numeric_columns,
  nice_max, tint, text_on, colour, legend.
- Use generic names (X, Y, Z) in sample data. House font Interstate;
  colours #00778B, #3BAEB7, #75E4E3 with #FFD200 as accent.
Describe the chart you want here:
"""

# ============================================================
# SAMPLE DATA
# ============================================================
SAMPLE = {"columns": ["Segment", "Share"], "rows": [["X", 0.48], ["Y", 0.32], ["Z", 0.20]]}

# ============================================================
# CHART CODE
# ============================================================
from deckchart import number, numeric_columns, text_on, colour, legend


def build(table, s, frame):
    cols = table["columns"]
    ci = cols.index(s["category_column"]) if s["category_column"] in cols else 0
    vcol = s["value_column"] or (numeric_columns(table, skip=(cols[ci],)) or [cols[-1]])[0]
    vi = cols.index(vcol)
    cats = [str(r[ci]) for r in table["rows"]]
    vals = [number(r[vi]) for r in table["rows"]]
    colors = {i: colour(s["colors"], i) for i in range(len(cats))}
    W, H = float(frame["w"]), float(frame["h"])
    legend_h = s["label_size"] * 2.2 if s["show_legend"] else 0
    py = legend_h / H
    side = min(W, H - legend_h)
    pw, ph = side / W, side / (H - legend_h)
    panel = {
        "id": "main", "x": 0, "y": py, "w": 1, "h": 1 - py,
        "kind": "doughnut", "direction": "col", "grouping": "standard",
        "categories": cats, "groups": None,
        "series": [{"name": vcol, "values": vals, "color": colors[0], "pointColors": colors,
                    "pointLabelColors": {i: text_on(c) for i, c in colors.items()}}],
        "gapWidth": 0, "overlap": 0,
        "plot": {"x": (1 - pw) / 2, "y": (1 - ph) / 2, "w": pw, "h": ph},
        "valueAxis": {"visible": False}, "categoryAxis": {"visible": False},
        "dataLabels": {"show": s["labels"] != "none", "size": s["label_size"], "numFmt": s["number_format"],
                       "position": "ctr"},
        "pieLabels": s["labels"], "holeSize": s["hole_size"], "firstSliceAngle": 0,
        "totals": {"show": False},
    }
    spec = {"font": s["font"], "panels": [panel], "texts": [], "shapes": []}
    if s["show_legend"]:
        spec["legend"] = legend([{"name": c, "color": colors[i]} for i, c in enumerate(cats)], frame,
                                size=s["label_size"], height_pt=legend_h, color=s["text_color"])
    return spec
