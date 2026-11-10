TITLE = "Line"
DESCRIPTION = "Lines over time with markers and value labels."

# ============================================================
# SETTINGS  (change these numbers and colours freely)
# ============================================================
SETTINGS = {
    "category_column": "",          # empty = first column
    "series_columns": [],           # empty = every number column
    "colors": ["#00778B", "#3BAEB7", "#75E4E3", "#FFD200", "#5B6770"],
    "bar_width": 60,                # % of each slot used by bars
    "line_width": 2.25,
    "marker": "circle",
    "show_labels": True,
    "show_legend": True,
    "font": "Interstate",
    "label_size": 9,
    "number_format": "0",
    "headroom": 1.12,
    "text_color": "#262626",
    "axis_color": "#7F7F7F",
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
SAMPLE = {"columns": ["Year", "X", "Y", "Z"], "rows": [["2025", 40, 25, 12], ["2026", 46, 28, 14], ["2027", 52, 31, 16], ["2028", 58, 34, 18], ["2029", 64, 37, 20], ["2030", 70, 40, 22]]}

# ============================================================
# CHART CODE
# ============================================================
from deckchart import number, numeric_columns, nice_max, text_on, colour, legend

KIND, DIRECTION, GROUPING = "line", "col", "standard"


def build(table, s, frame):
    cols = table["columns"]
    cat_col = s["category_column"] or cols[0]
    ci = cols.index(cat_col) if cat_col in cols else 0
    names = s["series_columns"] or numeric_columns(table, skip=(cols[ci],))
    rows = table["rows"]
    cats = [str(r[ci]) if r[ci] is not None else "" for r in rows]
    series = []
    for i, name in enumerate(names):
        k = cols.index(name)
        c = colour(s["colors"], i)
        series.append({"name": name, "values": [number(r[k], None) if k < len(r) else None for r in rows],
                       "color": c, "labelColor": text_on(c) if GROUPING != "clustered" and KIND == "bar" else s["text_color"],
                       "lineWidth": s.get("line_width", 2.25), "marker": s.get("marker", "circle")})
    if GROUPING in ("stacked",):
        top = max([sum(v or 0 for v in vals) for vals in zip(*[sr["values"] for sr in series])] + [1])
    elif GROUPING == "percentStacked":
        top = 1
    else:
        top = max([v or 0 for sr in series for v in sr["values"]] + [1])
    vmax = 1 if GROUPING == "percentStacked" else nice_max(top, s["headroom"])
    W, H = float(frame["w"]), float(frame["h"])
    legend_h = s["label_size"] * 2.2 if s["show_legend"] else 0
    py = legend_h / H
    if DIRECTION == "col":
        plot = {"x": 0.02, "y": (s["label_size"] * 1.8) / (H - legend_h), "w": 0.96,
                "h": 1 - (s["label_size"] * 4.0) / (H - legend_h)}
    else:
        lab_w = min(0.35, (max([len(c) for c in cats] + [3]) * s["label_size"] * 0.55 + 8) / W)
        plot = {"x": lab_w, "y": 0.02, "w": 1 - lab_w - 0.08, "h": 0.96}
    if GROUPING == "clustered" or KIND == "line":
        gap = max(0, round(100 * (100 / max(10, s["bar_width"]) - 1)))
    else:
        gap = max(0, round(100 * (100 / max(10, s["bar_width"]) - 1)))
    panel = {
        "id": "main", "x": 0, "y": py, "w": 1, "h": 1 - py,
        "kind": KIND, "direction": DIRECTION, "grouping": GROUPING,
        "categories": cats, "groups": None, "series": series,
        "gapWidth": gap, "overlap": 100 if GROUPING in ("stacked", "percentStacked") else s.get("overlap", -10),
        "plot": plot,
        "valueAxis": {"min": 0, "max": vmax, "visible": False, "gridlines": False, "numFmt": s["number_format"]},
        "categoryAxis": {"visible": True, "line": True, "lineColor": s["axis_color"],
                         "labelSize": s["label_size"], "labelColor": s["text_color"], "reverse": DIRECTION == "bar"},
        "dataLabels": {"show": s["show_labels"], "size": s["label_size"], "numFmt": s["number_format"],
                       "position": "ctr" if GROUPING != "clustered" and KIND == "bar" else ("t" if KIND == "line" else "outEnd")},
        "totals": {"show": bool(s.get("show_totals")) and DIRECTION == "col" and GROUPING == "stacked",
                   "values": [sum(v or 0 for v in vals) for vals in zip(*[sr["values"] for sr in series])],
                   "size": s["label_size"] + 1, "bold": True, "color": s["text_color"], "numFmt": s["number_format"]},
    }
    spec = {"font": s["font"], "panels": [panel], "texts": [], "shapes": []}
    if s["show_legend"]:
        spec["legend"] = legend([{"name": sr["name"], "color": sr["color"]} for sr in series], frame,
                                size=s["label_size"], height_pt=legend_h, color=s["text_color"])
    return spec
