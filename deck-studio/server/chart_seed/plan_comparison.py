TITLE = "Plan comparison (stacked pairs)"
DESCRIPTION = "Prior vs current plan by segment, one stacked pair per year, plus an aggregate pair on its own scale."

# ============================================================
# SETTINGS  (change these numbers and colours freely)
# ============================================================
SETTINGS = {
    "year_column": "Year",          # column holding the year
    "plan_column": "Plan",          # column holding the plan name
    "prior_name": "Prior",          # value in the plan column for the prior plan
    "current_name": "Current",      # value in the plan column for the current plan
    "prior_label": "PP",            # label shown under the prior bar
    "current_label": "CP",          # label shown under the current bar
    "segments": [],                 # segment columns to stack; empty = every number column
    "colors": ["#00778B", "#3BAEB7", "#75E4E3", "#FFD200"],
    "prior_tint": 0.45,             # 0 = same colour as current, 1 = white
    "bar_width": 72,                # bar width as % of its slot (higher = fatter bars)
    "gap_between_years": 1,         # empty slots between years (0, 1 or 2)
    "show_segment_labels": True,
    "hide_labels_below": 0.07,      # hide a segment label if smaller than this share of the axis
    "show_totals": True,
    "show_pair_labels": True,       # PP / CP under each bar
    "aggregate": True,              # add the aggregate pair on its own scale
    "aggregate_label": "Total",
    "aggregate_width": 0.16,        # share of the chart width used by the aggregate pair
    "show_legend": True,
    "font": "Interstate",
    "label_size": 9,
    "total_size": 10,
    "number_format": "0",
    "headroom": 1.12,               # space above the tallest bar (1.12 = 12%)
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
# SAMPLE DATA  (used for previews and "sample data" inserts)
# ============================================================
SAMPLE = {
    "columns": ["Year", "Plan", "X", "Y", "Z"],
    "rows": [
        [str(2025 + i), plan, 40 + i * 6 + (4 if plan == "Current" else 0), 25 + i * 3, 12 + i * 2]
        for i in range(6) for plan in ("Prior", "Current")
    ],
}

# ============================================================
# CHART CODE
# ============================================================
from deckchart import records, number, numeric_columns, nice_max, tint, text_on, colour, legend


def build(table, s, frame):
    rows = records(table)
    ycol, pcol = s["year_column"], s["plan_column"]
    segments = s["segments"] or numeric_columns(table, skip=(ycol, pcol))
    years = []
    for r in rows:
        y = str(r.get(ycol, ""))
        if y not in years:
            years.append(y)

    def value(year, plan, seg):
        for r in rows:
            if str(r.get(ycol, "")) == year and str(r.get(pcol, "")) == plan:
                return number(r.get(seg))
        return 0.0

    gap = int(s["gap_between_years"])
    cats, groups, slot_kind = [], [], []
    for i, y in enumerate(years):
        cats += [s["prior_label"] if s["show_pair_labels"] else "",
                 s["current_label"] if s["show_pair_labels"] else ""]
        slot_kind += [("p", y), ("c", y)]
        groups.append({"label": y, "span": 2})
        if i < len(years) - 1 and gap > 0:
            cats += [""] * gap
            slot_kind += [None] * gap
            groups.append({"label": "", "span": gap})

    def series_for(kinds, plan_lookup):
        out = []
        for si, seg in enumerate(segments):
            base = colour(s["colors"], si)
            vals, points = [], {}
            for idx, k in enumerate(kinds):
                if k is None:
                    vals.append(None)
                    continue
                kind, y = k
                plan = s["prior_name"] if kind == "p" else s["current_name"]
                vals.append(plan_lookup(y, plan, seg))
                if kind == "p" and s["prior_tint"] > 0:
                    points[idx] = tint(base, s["prior_tint"])
            out.append({"name": seg, "values": vals, "color": base,
                        "labelColor": text_on(base), "pointColors": points})
        return out

    main_series = series_for(slot_kind, value)
    totals = []
    for idx in range(len(cats)):
        vals = [sr["values"][idx] for sr in main_series]
        totals.append(None if all(v is None for v in vals) else sum(v or 0 for v in vals))
    main_max = nice_max(max([t or 0 for t in totals] + [1]), s["headroom"])

    def hide(series, axis_max):
        for sr in series:
            sr["hideLabels"] = [i for i, v in enumerate(sr["values"])
                                if v is not None and abs(v) < s["hide_labels_below"] * axis_max]
            # labels on tinted (prior) bars need their own contrast
            sr["pointLabelColors"] = {i: text_on(c) for i, c in sr["pointColors"].items()}
        return series

    hide(main_series, main_max)

    # ----- layout in points, converted to fractions of the object
    W, H = float(frame["w"]), float(frame["h"])
    legend_h = s["label_size"] * 2.2 if s["show_legend"] else 0
    top_room = s["total_size"] * 1.9 if s["show_totals"] else s["label_size"]
    label_rows = (2 if s["show_pair_labels"] else 1)
    bottom_room = s["label_size"] * (1.55 * label_rows + 0.6)
    panel_y = legend_h / H
    panel_h = 1 - panel_y
    plot_y = top_room / (H - legend_h)
    plot_h = max(0.2, 1 - plot_y - bottom_room / (H - legend_h))
    agg_w = s["aggregate_width"] if s["aggregate"] else 0
    sep = 0.025 if s["aggregate"] else 0
    bar_gap = max(0, round(100 * (100 / max(10, s["bar_width"]) - 1)))

    def axis_block():
        return {
            "categoryAxis": {"visible": True, "line": False, "lineColor": s["axis_color"],
                             "labelSize": s["label_size"], "labelColor": s["text_color"]},
            "dataLabels": {"show": s["show_segment_labels"], "size": s["label_size"],
                           "numFmt": s["number_format"], "position": "ctr"},
        }

    main = {
        "id": "main", "x": 0, "y": panel_y, "w": 1 - agg_w - sep, "h": panel_h,
        "kind": "bar", "direction": "col", "grouping": "stacked",
        "categories": cats, "groups": groups, "series": main_series,
        "gapWidth": bar_gap, "overlap": 100,
        "plot": {"x": 0, "y": plot_y, "w": 1, "h": plot_h},
        "valueAxis": {"min": 0, "max": main_max, "visible": False, "gridlines": False,
                      "numFmt": s["number_format"]},
        "totals": {"show": s["show_totals"], "values": totals, "size": s["total_size"],
                   "bold": True, "color": s["text_color"], "numFmt": s["number_format"]},
    }
    main.update(axis_block())
    spec = {"font": s["font"], "panels": [main], "texts": [], "shapes": []}
    plot_bottom = panel_y + panel_h * (plot_y + plot_h)
    spec["shapes"].append({"x1": 0, "y1": plot_bottom, "x2": main["w"], "y2": plot_bottom,
                           "color": s["axis_color"], "width": 0.75, "dash": "solid"})

    if s["aggregate"]:
        agg_kinds = [("p", "*"), ("c", "*")]

        def agg_value(_y, plan, seg):
            return sum(value(y, plan, seg) for y in years)

        agg_series = series_for(agg_kinds, agg_value)
        agg_totals = [sum(sr["values"][i] for sr in agg_series) for i in range(2)]
        agg_max = nice_max(max(agg_totals + [1]), s["headroom"])
        hide(agg_series, agg_max)
        x0 = 1 - agg_w
        agg = {
            "id": "aggregate", "x": x0, "y": panel_y, "w": agg_w, "h": panel_h,
            "kind": "bar", "direction": "col", "grouping": "stacked",
            "categories": [s["prior_label"] if s["show_pair_labels"] else "",
                           s["current_label"] if s["show_pair_labels"] else ""],
            "groups": [{"label": s["aggregate_label"], "span": 2}],
            "series": agg_series,
            # same bar width in points as the main chart
            "gapWidth": bar_gap, "overlap": 100,
            "plot": {"x": 0, "y": plot_y, "w": 1, "h": plot_h},
            "valueAxis": {"min": 0, "max": agg_max, "visible": False, "gridlines": False,
                          "numFmt": s["number_format"]},
            "totals": {"show": s["show_totals"], "values": agg_totals, "size": s["total_size"],
                       "bold": True, "color": s["text_color"], "numFmt": s["number_format"]},
        }
        agg.update(axis_block())
        # keep bars the same physical width as in the main chart
        main_slot = main["w"] * W / max(1, len(cats))
        want_w = main_slot * 2 / (agg_w * W)
        agg["plot"]["w"] = min(1.0, want_w)
        agg["plot"]["x"] = (1 - agg["plot"]["w"]) / 2
        spec["panels"].append(agg)
        sx = 1 - agg_w - sep / 2
        spec["shapes"].append({"x1": sx, "y1": panel_y + panel_h * plot_y * 0.5, "x2": sx,
                               "y2": 1.0, "color": s["axis_color"], "width": 0.75, "dash": "dash"})
        spec["shapes"].append({"x1": x0 + agg_w * agg["plot"]["x"], "y1": plot_bottom,
                               "x2": x0 + agg_w * (agg["plot"]["x"] + agg["plot"]["w"]),
                               "y2": plot_bottom, "color": s["axis_color"], "width": 0.75,
                               "dash": "solid"})

    if s["show_legend"]:
        items = [{"name": seg, "color": colour(s["colors"], i)} for i, seg in enumerate(segments)]
        spec["legend"] = legend(items, frame, size=s["label_size"], height_pt=legend_h,
                                color=s["text_color"])
    return spec
