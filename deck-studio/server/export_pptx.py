"""Write a Deck Studio deck as a native PowerPoint file.

Nothing here is guessed from the screen. The deck already stores every
measurement in PowerPoint's own units (EMU for positions, points for text),
so each property is copied across directly and set explicitly, which means
the PowerPoint theme can't quietly change fonts, colours or spacing.
"""
import base64
import copy
import io
import re

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_TICK_MARK, XL_MARKER_STYLE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

EMU_PER_PT = 12700

GEOMS = {
    "rect": MSO_SHAPE.RECTANGLE,
    "roundRect": MSO_SHAPE.ROUNDED_RECTANGLE,
    "ellipse": MSO_SHAPE.OVAL,
    "triangle": MSO_SHAPE.ISOSCELES_TRIANGLE,
    "rtTriangle": MSO_SHAPE.RIGHT_TRIANGLE,
    "diamond": MSO_SHAPE.DIAMOND,
    "parallelogram": MSO_SHAPE.PARALLELOGRAM,
    "trapezoid": MSO_SHAPE.TRAPEZOID,
    "homePlate": MSO_SHAPE.PENTAGON,
    "chevron": MSO_SHAPE.CHEVRON,
    "hexagon": MSO_SHAPE.HEXAGON,
    "rightArrow": MSO_SHAPE.RIGHT_ARROW,
    "leftArrow": MSO_SHAPE.LEFT_ARROW,
    "upArrow": MSO_SHAPE.UP_ARROW,
    "downArrow": MSO_SHAPE.DOWN_ARROW,
    "star5": MSO_SHAPE.STAR_5_POINT,
    "plus": MSO_SHAPE.CROSS,
    "wedgeRectCallout": MSO_SHAPE.RECTANGULAR_CALLOUT,
    "snip1Rect": MSO_SHAPE.SNIP_1_RECTANGLE,
    "round2SameRect": MSO_SHAPE.ROUND_2_SAME_RECTANGLE,
    "donut": MSO_SHAPE.DONUT,
    "blockArc": MSO_SHAPE.BLOCK_ARC,
}

DASH = {
    "solid": MSO_LINE_DASH_STYLE.SOLID,
    "dash": MSO_LINE_DASH_STYLE.DASH,
    "dot": MSO_LINE_DASH_STYLE.ROUND_DOT,
    "sysDash": MSO_LINE_DASH_STYLE.SQUARE_DOT,
    "lgDash": MSO_LINE_DASH_STYLE.LONG_DASH,
    "dashDot": MSO_LINE_DASH_STYLE.DASH_DOT,
}
PRST_DASH = {"solid": "solid", "dash": "dash", "dot": "sysDot", "sysDash": "sysDash",
             "lgDash": "lgDash", "dashDot": "dashDot"}

NO_STYLE_TABLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"


class ExportError(Exception):
    pass


# ------------------------------------------------------------------ helpers
def emu(v):
    return Emu(int(round(float(v or 0))))


def hex6(color, default="000000"):
    c = (color or "").lstrip("#")
    if re.fullmatch(r"[0-9A-Fa-f]{6}", c):
        return c.upper()
    if re.fullmatch(r"[0-9A-Fa-f]{3}", c):
        return "".join(ch * 2 for ch in c).upper()
    return default


def rgb(color):
    return RGBColor.from_string(hex6(color))


def el(tag, attrib=None, *children, **kw):
    node = etree.Element(qn(tag))
    for k, v in (attrib or {}).items():
        node.set(k, str(v))
    for k, v in kw.items():
        node.set(k, str(v))
    for ch in children:
        if ch is not None:
            node.append(ch)
    return node


def solid_fill(color, alpha=None):
    clr = el("a:srgbClr", {"val": hex6(color)})
    if alpha is not None and float(alpha) < 1:
        clr.append(el("a:alpha", {"val": int(round(float(alpha) * 100000))}))
    return el("a:solidFill", None, clr)


# ---------------------------------------------------------------- text body
def write_body(txBody, body, default_anchor="t"):
    """Replace a txBody's content with the deck's text model, all explicit."""
    body = body or {}
    bodyPr = txBody.find(qn("a:bodyPr"))
    if bodyPr is None:
        bodyPr = el("a:bodyPr")
        txBody.insert(0, bodyPr)
    for child in list(bodyPr):
        bodyPr.remove(child)
    ins = body.get("insets") or {}
    bodyPr.set("wrap", "square" if body.get("wrap", True) else "none")
    bodyPr.set("lIns", str(int(ins.get("l", 91440))))
    bodyPr.set("tIns", str(int(ins.get("t", 45720))))
    bodyPr.set("rIns", str(int(ins.get("r", 91440))))
    bodyPr.set("bIns", str(int(ins.get("b", 45720))))
    bodyPr.set("rtlCol", "0")
    bodyPr.set("anchor", {"t": "t", "ctr": "ctr", "b": "b"}.get(body.get("anchor", default_anchor), "t"))
    bodyPr.set("anchorCtr", "0")
    fit = body.get("autofit", "none")
    bodyPr.append(el({"shape": "a:spAutoFit", "norm": "a:normAutofit"}.get(fit, "a:noAutofit")))

    lst = txBody.find(qn("a:lstStyle"))
    if lst is None:
        lst = el("a:lstStyle")
        bodyPr.addnext(lst)
    for p in txBody.findall(qn("a:p")):
        txBody.remove(p)
    paras = body.get("paras") or [{"runs": [{"text": ""}]}]
    numbering = {}
    for para in paras:
        txBody.append(write_para(para, numbering))


def run_props(run, tag="a:rPr"):
    rpr = el(tag, {"lang": "en-GB", "dirty": "0"})
    rpr.set("sz", str(int(round(float(run.get("size", 18)) * 100))))
    rpr.set("b", "1" if run.get("bold") else "0")
    rpr.set("i", "1" if run.get("italic") else "0")
    rpr.set("u", "sng" if run.get("underline") else "none")
    rpr.set("strike", "sngStrike" if run.get("strike") else "noStrike")
    if run.get("baseline"):
        rpr.set("baseline", str(int(run["baseline"]) * 1000))
    if run.get("spacing"):
        rpr.set("spc", str(int(round(float(run["spacing"]) * 100))))
    if run.get("caps") == "all":
        rpr.set("cap", "all")
    elif run.get("caps") == "small":
        rpr.set("cap", "small")
    rpr.append(solid_fill(run.get("color", "#000000")))
    if run.get("highlight"):
        rpr.append(el("a:highlight", None, el("a:srgbClr", {"val": hex6(run["highlight"])})))
    font = run.get("font") or "Interstate"
    rpr.append(el("a:latin", {"typeface": font}))
    rpr.append(el("a:ea", {"typeface": font}))
    rpr.append(el("a:cs", {"typeface": font}))
    return rpr


def write_para(para, numbering):
    p = el("a:p")
    ppr = el("a:pPr")
    ppr.set("algn", {"l": "l", "ctr": "ctr", "r": "r", "just": "just"}.get(para.get("align", "l"), "l"))
    ppr.set("lvl", str(int(para.get("level", 0))))
    ppr.set("marL", str(int(para.get("marL", 0))))
    ppr.set("indent", str(int(para.get("indent", 0))))
    ppr.append(el("a:lnSpc", None, el("a:spcPct", {"val": int(round(float(para.get("lineSpacing", 1.0)) * 100000))})))
    ppr.append(el("a:spcBef", None, el("a:spcPts", {"val": int(round(float(para.get("spaceBefore", 0)) * 100))})))
    ppr.append(el("a:spcAft", None, el("a:spcPts", {"val": int(round(float(para.get("spaceAfter", 0)) * 100))})))
    bullet = para.get("bullet")
    runs = para.get("runs") or [{"text": ""}]
    first = runs[0] if runs else {}
    if bullet and bullet.get("type") == "char":
        if bullet.get("color"):
            ppr.append(el("a:buClr", None, el("a:srgbClr", {"val": hex6(bullet["color"])})))
        ppr.append(el("a:buSzPct", {"val": int(float(bullet.get("size", 1.0)) * 100000)}))
        ppr.append(el("a:buFont", {"typeface": bullet.get("font", "Arial")}))
        ppr.append(el("a:buChar", {"char": bullet.get("char", "•")}))
    elif bullet and bullet.get("type") == "num":
        ppr.append(el("a:buSzPct", {"val": 100000}))
        ppr.append(el("a:buFont", {"typeface": "+mj-lt"}))
        ppr.append(el("a:buAutoNum", {"type": bullet.get("scheme", "arabicPeriod"),
                                       "startAt": int(bullet.get("start", 1))}))
    else:
        ppr.append(el("a:buNone"))
    p.append(ppr)
    for run in runs:
        if run.get("field") == "slidenum":
            fld = el("a:fld", {"id": "{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}", "type": "slidenum"})
            fld.append(run_props(run))
            t = el("a:t")
            t.text = "\u2039#\u203a"
            fld.append(t)
            p.append(fld)
            continue
        text = run.get("text", "")
        if text == "":
            continue
        pieces = text.split("\n")
        for i, piece in enumerate(pieces):
            if i > 0:
                br = el("a:br")
                br.append(run_props(run))
                p.append(br)
            if piece:
                r = el("a:r")
                r.append(run_props(run))
                t = el("a:t")
                t.text = piece
                r.append(t)
                p.append(r)
    last = runs[-1] if runs else first
    p.append(run_props(last, "a:endParaRPr"))
    return p


# --------------------------------------------------------- shape formatting
def strip_style(shape):
    """Remove the theme style reference python-pptx adds, so the theme
    can't add outlines, shadows or font colours we didn't ask for."""
    style = shape._element.find(qn("p:style"))
    if style is not None:
        shape._element.remove(style)


def set_xfrm_extras(shape, e):
    xfrm = shape._element.spPr.find(qn("a:xfrm")) if hasattr(shape._element, "spPr") else None
    if xfrm is None:
        return
    if e.get("rot"):
        xfrm.set("rot", str(int(round(float(e["rot"]) * 60000)) % 21600000))
    if e.get("flipH"):
        xfrm.set("flipH", "1")
    if e.get("flipV"):
        xfrm.set("flipV", "1")


def apply_fill(shape, fill):
    if fill and fill.get("color"):
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill["color"])
        alpha = fill.get("alpha")
        if alpha is not None and float(alpha) < 1:
            clr = shape.fill._xPr.find(qn("a:solidFill")).find(qn("a:srgbClr"))
            clr.append(el("a:alpha", {"val": int(round(float(alpha) * 100000))}))
    else:
        shape.fill.background()


def apply_line(shape, line):
    if line and line.get("color") and float(line.get("width", 1)) > 0:
        shape.line.color.rgb = rgb(line["color"])
        shape.line.width = Pt(float(line.get("width", 1)))
        dash = line.get("dash", "solid")
        if dash != "solid":
            shape.line.dash_style = DASH.get(dash, MSO_LINE_DASH_STYLE.SOLID)
    else:
        shape.line.fill.background()


def add_shape(shapes, e):
    geom = e.get("geom", "rect")
    x, y, w, h = emu(e["x"]), emu(e["y"]), emu(max(1, e["w"])), emu(max(1, e["h"]))
    if e.get("textbox") and geom == "rect":
        shape = shapes.add_textbox(x, y, w, h)
    else:
        shape = shapes.add_shape(GEOMS.get(geom, MSO_SHAPE.RECTANGLE), x, y, w, h)
        strip_style(shape)
        adj = e.get("adj")
        if adj:
            for i, v in enumerate(adj[: len(shape.adjustments)]):
                if v is not None:
                    shape.adjustments[i] = float(v)
    apply_fill(shape, e.get("fill"))
    apply_line(shape, e.get("line"))
    set_xfrm_extras(shape, e)
    if e.get("name"):
        shape.name = e["name"]
    body = e.get("text")
    if body is not None:
        write_body(shape.text_frame._txBody, body, "ctr" if not e.get("textbox") else "t")
    elif not e.get("textbox"):
        write_body(shape.text_frame._txBody, {"paras": [], "anchor": "ctr"}, "ctr")
    return shape


def add_line(shapes, e):
    x1, y1, x2, y2 = (emu(e[k]) for k in ("x1", "y1", "x2", "y2"))
    conn = shapes.add_connector(MSO_CONNECTOR.STRAIGHT, x1, y1, x2, y2)
    strip_style(conn)
    line = e.get("line") or {}
    conn.line.color.rgb = rgb(line.get("color", "#000000"))
    conn.line.width = Pt(float(line.get("width", 1)))
    dash = line.get("dash", "solid")
    if dash != "solid":
        conn.line.dash_style = DASH.get(dash, MSO_LINE_DASH_STYLE.SOLID)
    ln = conn.line._get_or_add_ln()
    for key, tag in (("head", "a:headEnd"), ("tail", "a:tailEnd")):
        kind = line.get(key) or "none"
        if kind != "none":
            ln.append(el(tag, {"type": kind, "w": "med", "len": "med"}))
    if e.get("name"):
        conn.name = e["name"]
    return conn


def decode_image(src):
    m = re.match(r"data:([^;]+);base64,(.*)$", src or "", re.S)
    if not m:
        raise ExportError("An image on the slide has no embedded data.")
    return io.BytesIO(base64.b64decode(m.group(2)))


def add_image(shapes, e):
    pic = shapes.add_picture(decode_image(e["src"]), emu(e["x"]), emu(e["y"]), emu(e["w"]), emu(e["h"]))
    crop = e.get("crop") or {}
    for side in ("l", "t", "r", "b"):
        v = float(crop.get(side, 0) or 0)
        if v:
            setattr(pic, {"l": "crop_left", "t": "crop_top", "r": "crop_right", "b": "crop_bottom"}[side], v)
    if e.get("rot"):
        pic.rotation = float(e["rot"])
    xfrm = pic._element.spPr.find(qn("a:xfrm"))
    if e.get("flipH"):
        xfrm.set("flipH", "1")
    if e.get("flipV"):
        xfrm.set("flipV", "1")
    line = e.get("line")
    if line and line.get("color"):
        pic.line.color.rgb = rgb(line["color"])
        pic.line.width = Pt(float(line.get("width", 1)))
    if e.get("name"):
        pic.name = e["name"]
    return pic


def border_xml(tag, b):
    if not b or not b.get("color") or float(b.get("width", 0)) <= 0:
        return el(tag, {"w": "0"}, el("a:noFill"))
    ln = el(tag, {"w": int(round(float(b["width"]) * EMU_PER_PT)), "cap": "flat", "cmpd": "sng", "algn": "ctr"})
    ln.append(solid_fill(b["color"]))
    ln.append(el("a:prstDash", {"val": PRST_DASH.get(b.get("dash", "solid"), "solid")}))
    ln.append(el("a:round"))
    ln.append(el("a:headEnd", {"type": "none", "w": "med", "len": "med"}))
    ln.append(el("a:tailEnd", {"type": "none", "w": "med", "len": "med"}))
    return ln


def add_table(shapes, e):
    rows, cols = e["rows"], e["cols"]
    gf = shapes.add_table(len(rows), len(cols), emu(e["x"]), emu(e["y"]), emu(e["w"]), emu(e["h"]))
    tbl = gf.table
    tblPr = tbl._tbl.tblPr
    for attr in ("firstRow", "bandRow", "firstCol", "lastRow", "lastCol", "bandCol"):
        if tblPr.get(attr) is not None:
            del tblPr.attrib[attr]
    style = tblPr.find(qn("a:tableStyleId"))
    if style is None:
        style = el("a:tableStyleId")
        tblPr.append(style)
    style.text = NO_STYLE_TABLE
    for i, w in enumerate(cols):
        tbl.columns[i].width = emu(w)
    for r, row in enumerate(rows):
        tbl.rows[r].height = emu(row.get("h", 370840))
        for c, cell in enumerate(row["cells"][: len(cols)]):
            tc = tbl.cell(r, c)._tc
            span = int(cell.get("span", 1) or 1)
            rspan = int(cell.get("rowSpan", 1) or 1)
            if span > 1:
                tc.set("gridSpan", str(span))
            if rspan > 1:
                tc.set("rowSpan", str(rspan))
            if cell.get("hMerge"):
                tc.set("hMerge", "1")
            if cell.get("vMerge"):
                tc.set("vMerge", "1")
            write_body(tc.get_or_add_txBody(), {**(cell.get("text") or {}), "autofit": "none"})
            tcPr = tc.get_or_add_tcPr()
            for child in list(tcPr):
                tcPr.remove(child)
            m = cell.get("margins") or {}
            tcPr.set("marL", str(int(m.get("l", 91440))))
            tcPr.set("marR", str(int(m.get("r", 91440))))
            tcPr.set("marT", str(int(m.get("t", 45720))))
            tcPr.set("marB", str(int(m.get("b", 45720))))
            tcPr.set("anchor", {"t": "t", "ctr": "ctr", "b": "b"}.get(cell.get("anchor", "t"), "t"))
            borders = cell.get("borders") or {}
            tcPr.append(border_xml("a:lnL", borders.get("l")))
            tcPr.append(border_xml("a:lnR", borders.get("r")))
            tcPr.append(border_xml("a:lnT", borders.get("t")))
            tcPr.append(border_xml("a:lnB", borders.get("b")))
            fill = cell.get("fill") or {}
            if fill.get("color"):
                tcPr.append(solid_fill(fill["color"], fill.get("alpha")))
            else:
                tcPr.append(el("a:noFill"))
    if e.get("name"):
        gf.name = e["name"]
    return gf


# -------------------------------------------------------------------- charts
def add_text_box(shapes, x, y, w, h, text, size=9, color="#262626", bold=False, align="l", font="Interstate",
                 anchor="ctr"):
    tb = shapes.add_textbox(emu(x), emu(y), emu(max(1, w)), emu(max(1, h)))
    write_body(tb.text_frame._txBody, {
        "insets": {"l": 0, "t": 0, "r": 0, "b": 0}, "anchor": anchor, "wrap": False, "autofit": "none",
        "paras": [{"align": align, "lineSpacing": 1.0,
                   "runs": [{"text": str(text), "size": size, "color": color, "bold": bold, "font": font}]}],
    })
    return tb


def add_chart(shapes, e):
    spec = e.get("spec") or {}
    panels = spec.get("panels") or []
    if not panels:
        raise ExportError("A chart on the slide has nothing to draw. Refresh it first.")
    X, Y, W, H = float(e["x"]), float(e["y"]), float(e["w"]), float(e["h"])
    font = spec.get("font", "Interstate")
    simple = len(panels) == 1 and not spec.get("legend") and not spec.get("texts") and not spec.get("shapes")
    target = shapes if simple else shapes.add_group_shape()
    container = target if simple else target.shapes
    for panel in panels:
        px = X + W * float(panel.get("x", 0))
        py = Y + H * float(panel.get("y", 0))
        pw = W * float(panel.get("w", 1))
        ph = H * float(panel.get("h", 1))
        add_chart_panel(container, panel, px, py, pw, ph, font)
    leg = spec.get("legend")
    if leg and leg.get("items"):
        items = leg["items"]
        lx, ly = X + W * float(leg.get("x", 0)), Y + H * float(leg.get("y", 0))
        lw, lh = W * float(leg.get("w", 1)), H * float(leg.get("h", 0.08))
        size = float(leg.get("size", 9))
        sq = size * 0.8 * EMU_PER_PT
        cursor = lx
        for i, it in enumerate(items):
            slot = W * float(it["w"]) if it.get("w") else lw / len(items)
            sx = cursor
            cursor += slot
            box = container.add_shape(MSO_SHAPE.RECTANGLE, emu(sx), emu(ly + (lh - sq) / 2), emu(sq), emu(sq))
            strip_style(box)
            apply_fill(box, {"color": it.get("color")})
            apply_line(box, None)
            write_body(box.text_frame._txBody, {"paras": []})
            tx = sx + sq + size * 0.4 * EMU_PER_PT
            add_text_box(container, tx, ly, max(1, slot - (tx - sx)), lh, it.get("name", ""), size,
                         leg.get("color", "#404040"), False, "l", font)
    for t in spec.get("texts") or []:
        add_text_box(container, X + W * t["x"], Y + H * t["y"], W * t["w"], H * t["h"], t.get("text", ""),
                     t.get("size", 9), t.get("color", "#262626"), t.get("bold", False), t.get("align", "l"), font,
                     t.get("anchor", "ctr"))
    for s in spec.get("shapes") or []:
        add_line(container, {"x1": X + W * s["x1"], "y1": Y + H * s["y1"], "x2": X + W * s["x2"],
                             "y2": Y + H * s["y2"],
                             "line": {"color": s.get("color", "#7F7F7F"), "width": s.get("width", 0.75),
                                      "dash": s.get("dash", "solid")}})
    if not simple and e.get("name"):
        target.name = e["name"]
    return target


def _chart_type(panel):
    kind, direction, grouping = panel.get("kind"), panel.get("direction", "col"), panel.get("grouping", "clustered")
    if kind == "bar":
        table = {
            ("col", "stacked"): XL_CHART_TYPE.COLUMN_STACKED,
            ("col", "clustered"): XL_CHART_TYPE.COLUMN_CLUSTERED,
            ("col", "percentStacked"): XL_CHART_TYPE.COLUMN_STACKED_100,
            ("bar", "stacked"): XL_CHART_TYPE.BAR_STACKED,
            ("bar", "clustered"): XL_CHART_TYPE.BAR_CLUSTERED,
            ("bar", "percentStacked"): XL_CHART_TYPE.BAR_STACKED_100,
        }
        return table.get((direction, grouping), XL_CHART_TYPE.COLUMN_CLUSTERED)
    if kind == "line":
        return XL_CHART_TYPE.LINE_MARKERS
    if kind == "pie":
        return XL_CHART_TYPE.PIE
    if kind == "doughnut":
        return XL_CHART_TYPE.DOUGHNUT
    raise ExportError("Unknown chart kind %r" % kind)


def _txpr(size, color, bold=False, font="Interstate"):
    defrpr = el("a:defRPr", {"sz": int(round(float(size) * 100)), "b": "1" if bold else "0"})
    defrpr.append(solid_fill(color))
    defrpr.append(el("a:latin", {"typeface": font}))
    defrpr.append(el("a:ea", {"typeface": font}))
    defrpr.append(el("a:cs", {"typeface": font}))
    return el("c:txPr", None,
              el("a:bodyPr", {"rot": "0", "spcFirstLastPara": "1", "vertOverflow": "overflow", "wrap": "none",
                              "anchor": "ctr", "anchorCtr": "1"}),
              el("a:lstStyle"),
              el("a:p", None, el("a:pPr", None, defrpr), el("a:endParaRPr", {"lang": "en-GB"})))


def _no_fill_sppr():
    return el("c:spPr", None, el("a:noFill"), el("a:ln", None, el("a:noFill")))


def _label_block(numfmt, size, color, font, pos=None, bold=False, percent=False, value=True):
    parts = [el("c:numFmt", {"formatCode": numfmt or "General", "sourceLinked": "0"}),
             _no_fill_sppr(), _txpr(size, color, bold, font)]
    if pos:
        parts.append(el("c:dLblPos", {"val": pos}))
    parts += [el("c:showLegendKey", {"val": "0"}), el("c:showVal", {"val": "1" if value else "0"}),
              el("c:showCatName", {"val": "0"}), el("c:showSerName", {"val": "0"}),
              el("c:showPercent", {"val": "1" if percent else "0"}), el("c:showBubbleSize", {"val": "0"})]
    return parts


def _set_dlbls(ser, panel, sr, font, kind):
    dl = panel.get("dataLabels") or {}
    old = ser.find(qn("c:dLbls"))
    if old is not None:
        ser.remove(old)
    if not dl.get("show"):
        return
    size = dl.get("size", 9)
    color = sr.get("labelColor") or dl.get("color") or "#262626"
    numfmt = dl.get("numFmt", "General")
    pie = kind in ("pie", "doughnut")
    percent = pie and panel.get("pieLabels") == "percent"
    pos = None
    if kind == "bar":
        pos = {"ctr": "ctr", "inEnd": "inEnd", "inBase": "inBase", "outEnd": "outEnd"}.get(dl.get("position", "ctr"), "ctr")
        if panel.get("grouping") in ("stacked", "percentStacked") and pos == "outEnd":
            pos = "inEnd"
    elif kind == "line":
        pos = {"t": "t", "b": "b", "r": "r", "l": "l", "ctr": "ctr"}.get(dl.get("position", "t"), "t")
    elif kind == "pie":
        pos = "ctr"
    dlbls = el("c:dLbls")
    hidden = set(int(i) for i in (sr.get("hideLabels") or []))
    point_colors = {int(k): v for k, v in (sr.get("pointLabelColors") or {}).items()}
    for i, v in enumerate(sr.get("values") or []):
        if i in hidden or v is None:
            dlbls.append(el("c:dLbl", None, el("c:idx", {"val": i}), el("c:delete", {"val": "1"})))
        elif i in point_colors and point_colors[i] != color:
            d = el("c:dLbl", None, el("c:idx", {"val": i}))
            for part in _label_block(numfmt, size, point_colors[i], font, pos, percent=percent, value=not percent):
                d.append(part)
            dlbls.append(d)
    for part in _label_block(numfmt, size, color, font, pos, percent=percent, value=not percent):
        dlbls.append(part)
    if pie:
        dlbls.append(el("c:showLeaderLines", {"val": "0"}))
    # c:dLbls goes after c:dPt elements and before c:cat / c:trendline
    anchor = None
    for tag in ("c:trendline", "c:errBars", "c:cat", "c:val", "c:smooth"):
        anchor = ser.find(qn(tag))
        if anchor is not None:
            break
    if anchor is not None:
        anchor.addprevious(dlbls)
    else:
        ser.append(dlbls)


def _manual_layout(plot_area, box):
    for old in plot_area.findall(qn("c:layout")):
        plot_area.remove(old)
    ml = el("c:manualLayout", None,
            el("c:layoutTarget", {"val": "inner"}),
            el("c:xMode", {"val": "edge"}), el("c:yMode", {"val": "edge"}),
            el("c:x", {"val": "%.6f" % float(box.get("x", 0))}),
            el("c:y", {"val": "%.6f" % float(box.get("y", 0))}),
            el("c:w", {"val": "%.6f" % float(box.get("w", 1))}),
            el("c:h", {"val": "%.6f" % float(box.get("h", 1))}))
    plot_area.insert(0, el("c:layout", None, ml))


def add_chart_panel(shapes, panel, x, y, w, h, font):
    kind = panel.get("kind")
    cats = [str(c) if c is not None else "" for c in panel.get("categories") or []]
    series = panel.get("series") or []
    dl = panel.get("dataLabels") or {}
    data = CategoryChartData(number_format=dl.get("numFmt") or "General")
    groups = panel.get("groups")
    if groups and kind in ("bar", "line"):
        i = 0
        for g in groups:
            parent = data.add_category(str(g.get("label", "")))
            for _ in range(int(g.get("span", 1))):
                parent.add_sub_category(cats[i] if i < len(cats) else "")
                i += 1
    else:
        data.categories = cats
    for sr in series:
        data.add_series(str(sr.get("name", "")), [None if v is None else float(v) for v in sr.get("values", [])])
    totals = panel.get("totals") or {}
    want_totals = (kind == "bar" and panel.get("direction", "col") == "col"
                   and panel.get("grouping") == "stacked" and totals.get("show"))
    if want_totals:
        data.add_series("Total", [None if v is None else float(v) for v in totals.get("values", [])])

    gf = shapes.add_chart(_chart_type(panel), emu(x), emu(y), emu(max(1, w)), emu(max(1, h)), data)
    chart = gf.chart
    chart.has_legend = False
    chart.has_title = False
    cs = chart._chartSpace
    # chart text defaults
    va = panel.get("valueAxis") or {}
    ca = panel.get("categoryAxis") or {}
    chart.font.name = font
    chart.font.size = Pt(float(ca.get("labelSize", dl.get("size", 9))))
    chart.font.color.rgb = rgb(ca.get("labelColor", "#404040"))
    # no rounded corners, no chart-area fill or border
    rc = cs.find(qn("c:roundedCorners"))
    if rc is None:
        rc = el("c:roundedCorners")
        cs.find(qn("c:date1904")).addnext(rc) if cs.find(qn("c:date1904")) is not None else cs.insert(0, rc)
    rc.set("val", "0")
    old_sppr = cs.find(qn("c:spPr"))
    if old_sppr is not None:
        cs.remove(old_sppr)
    cs.find(qn("c:chart")).addnext(_no_fill_sppr())

    plot_area = cs.find(qn("c:chart")).find(qn("c:plotArea"))
    _manual_layout(plot_area, panel.get("plot") or {})
    pa_sppr = plot_area.find(qn("c:spPr"))
    if pa_sppr is not None:
        plot_area.remove(pa_sppr)
    plot_area.append(_no_fill_sppr())

    plot = chart.plots[0]
    xml_chart = plot._element
    vary = xml_chart.find(qn("c:varyColors"))
    if vary is not None:
        vary.set("val", "1" if kind in ("pie", "doughnut") else "0")
    if kind == "bar":
        plot.gap_width = int(panel.get("gapWidth", 150))
        plot.overlap = int(panel.get("overlap", 100 if panel.get("grouping") != "clustered" else 0))

    sers = xml_chart.findall(qn("c:ser"))
    total_ser = sers[-1] if want_totals else None
    for i, sr in enumerate(series):
        s = plot.series[i]
        color = sr.get("color") or "#00778B"
        if kind == "line":
            s.format.line.color.rgb = rgb(color)
            s.format.line.width = Pt(float(sr.get("lineWidth", 2.25)))
            s.smooth = False
            if sr.get("marker", "circle") == "none":
                s.marker.style = XL_MARKER_STYLE.NONE
            else:
                s.marker.style = XL_MARKER_STYLE.CIRCLE
                s.marker.size = int(sr.get("markerSize", 6))
                s.marker.format.fill.solid()
                s.marker.format.fill.fore_color.rgb = rgb(color)
                s.marker.format.line.fill.background()
        elif kind in ("pie", "doughnut"):
            pcs = {int(k): v for k, v in (sr.get("pointColors") or {}).items()}
            for idx in range(len(cats)):
                pt = s.points[idx]
                pt.format.fill.solid()
                pt.format.fill.fore_color.rgb = rgb(pcs.get(idx, color))
                pt.format.line.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                pt.format.line.width = Pt(1)
        else:
            s.format.fill.solid()
            s.format.fill.fore_color.rgb = rgb(color)
            s.format.line.fill.background()
            s.invert_if_negative = False
            for idx, pc in (sr.get("pointColors") or {}).items():
                idx = int(idx)
                if idx < len(cats):
                    pt = s.points[idx]
                    pt.format.fill.solid()
                    pt.format.fill.fore_color.rgb = rgb(pc)
                    pt.format.line.fill.background()
        _set_dlbls(sers[i], panel, sr, font, kind)

    if kind in ("pie", "doughnut"):
        fsa = xml_chart.find(qn("c:firstSliceAng"))
        if fsa is None:
            fsa = el("c:firstSliceAng")
            xml_chart.append(fsa)
        fsa.set("val", str(int(panel.get("firstSliceAngle", 0))))
        if kind == "doughnut":
            hs = xml_chart.find(qn("c:holeSize"))
            if hs is None:
                hs = el("c:holeSize")
                xml_chart.append(hs)
            hs.set("val", str(max(10, min(90, int(panel.get("holeSize", 55))))))
        return gf

    # ----- axes
    try:
        vax = chart.value_axis
        if va.get("min") is not None:
            vax.minimum_scale = float(va["min"])
        if va.get("max") is not None:
            vax.maximum_scale = float(va["max"])
        if va.get("majorUnit"):
            vax.major_unit = float(va["majorUnit"])
        vax.has_major_gridlines = bool(va.get("gridlines"))
        if va.get("gridlines"):
            gl = vax.major_gridlines.format.line
            gl.color.rgb = rgb(va.get("gridColor", "#D9D9D9"))
            gl.width = Pt(0.5)
        vax.has_minor_gridlines = False
        vax.major_tick_mark = XL_TICK_MARK.NONE
        vax.minor_tick_mark = XL_TICK_MARK.NONE
        vax.tick_labels.number_format = va.get("numFmt", "General")
        vax.tick_labels.number_format_is_linked = False
        vax.tick_labels.font.size = Pt(float(va.get("labelSize", ca.get("labelSize", 9))))
        vax.format.line.fill.background()
        vax.visible = bool(va.get("visible"))
    except (ValueError, AttributeError):
        pass
    try:
        cax = chart.category_axis
        cax.major_tick_mark = XL_TICK_MARK.NONE
        cax.minor_tick_mark = XL_TICK_MARK.NONE
        cax.has_major_gridlines = False
        if ca.get("line"):
            cax.format.line.color.rgb = rgb(ca.get("lineColor", "#7F7F7F"))
            cax.format.line.width = Pt(0.75)
        else:
            cax.format.line.fill.background()
        f = cax.tick_labels.font
        f.size = Pt(float(ca.get("labelSize", 9)))
        f.color.rgb = rgb(ca.get("labelColor", "#404040"))
        f.name = font
        if ca.get("reverse"):
            cax.reverse_order = True
        cax.visible = ca.get("visible", True)
        cat_ax = plot_area.find(qn("c:catAx"))
        if cat_ax is not None:
            nml = cat_ax.find(qn("c:noMultiLvlLbl"))
            if nml is not None:
                nml.set("val", "0")
            lo = cat_ax.find(qn("c:lblOffset"))
            if lo is not None:
                lo.set("val", "100")
    except (ValueError, AttributeError):
        pass

    if want_totals and total_ser is not None:
        _totals_as_line(xml_chart, total_ser, totals, font)
    return gf


def _totals_as_line(bar_chart, ser, totals, font):
    """Move the 'Total' series out of the stacked bars into an invisible line
    series whose labels sit on top of each stack. Labels follow the data when
    the numbers change in PowerPoint's Edit Data."""
    bar_chart.remove(ser)
    line = el("c:lineChart", None, el("c:grouping", {"val": "standard"}), el("c:varyColors", {"val": "0"}))
    new = el("c:ser")
    for tag in ("c:idx", "c:order", "c:tx"):
        node = ser.find(qn(tag))
        if node is not None:
            new.append(copy.deepcopy(node))
    new.append(el("c:spPr", None, el("a:ln", None, el("a:noFill"))))
    new.append(el("c:marker", None, el("c:symbol", {"val": "none"})))
    dlbls = el("c:dLbls")
    for i, v in enumerate(totals.get("values") or []):
        if v is None:
            dlbls.append(el("c:dLbl", None, el("c:idx", {"val": i}), el("c:delete", {"val": "1"})))
    for part in _label_block(totals.get("numFmt", "General"), totals.get("size", 10), totals.get("color", "#262626"),
                             font, "t", bold=totals.get("bold", True)):
        dlbls.append(part)
    new.append(dlbls)
    for tag in ("c:cat", "c:val"):
        node = ser.find(qn(tag))
        if node is not None:
            new.append(copy.deepcopy(node))
    new.append(el("c:smooth", {"val": "0"}))
    line.append(new)
    line.append(el("c:marker", {"val": "1"}))
    for ax in bar_chart.findall(qn("c:axId")):
        line.append(copy.deepcopy(ax))
    bar_chart.addnext(line)


# ------------------------------------------------------------------- slides
def _empty_placeholder(e):
    if not e.get("placeholder") or not e.get("text"):
        return False
    for p in e["text"].get("paras") or []:
        for r in p.get("runs") or []:
            if r.get("text") or r.get("field"):
                return False
    return True


def add_element(shapes, e):
    t = e.get("type")
    if _empty_placeholder(e):
        return None  # PowerPoint would only show "Click to add..." prompts
    if t == "shape":
        return add_shape(shapes, e)
    if t == "line":
        return add_line(shapes, e)
    if t == "image":
        return add_image(shapes, e)
    if t == "table":
        return add_table(shapes, e)
    if t == "chart":
        return add_chart(shapes, e)
    if t == "group":
        grp = shapes.add_group_shape()
        for child in e.get("children") or []:
            add_element(grp.shapes, child)
        if e.get("name"):
            grp.name = e["name"]
        return grp
    return None


def apply_theme(prs, theme):
    """Write the deck's colours and fonts into the PowerPoint theme, so new
    things the user adds later in PowerPoint also use the house style."""
    master = prs.slide_master
    theme_part = master.part.part_related_by(RT.THEME)
    root = etree.fromstring(theme_part.blob)
    ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    colors = (theme or {}).get("colors") or {}
    scheme = root.find(".//a:clrScheme", ns)
    if scheme is not None:
        scheme.set("name", (theme or {}).get("name", "House"))
        for key, value in colors.items():
            slot = scheme.find("a:" + key, ns)
            if slot is None:
                continue
            for child in list(slot):
                slot.remove(child)
            slot.append(el("a:srgbClr", {"val": hex6(value)}))
    fonts = (theme or {}).get("fonts") or {}
    fscheme = root.find(".//a:fontScheme", ns)
    if fscheme is not None:
        fscheme.set("name", (theme or {}).get("name", "House"))
        for which, key in (("a:majorFont", "major"), ("a:minorFont", "minor")):
            node = fscheme.find(which, ns)
            if node is not None and fonts.get(key):
                node.find("a:latin", ns).set("typeface", fonts[key])
    blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    if hasattr(theme_part, "_blob"):
        theme_part._blob = blob
    else:  # XmlPart
        theme_part._element = etree.fromstring(blob)


def _blank_layout(prs):
    for layout in prs.slide_layouts:
        if layout.name and layout.name.lower() == "blank":
            return layout
    best = min(prs.slide_layouts, key=lambda l: len(l.placeholders))
    return best


def _set_background(slide_like, color):
    if color:
        fill = slide_like.background.fill
        fill.solid()
        fill.fore_color.rgb = rgb(color)


def _move_master_elements(prs, elements, layout):
    """Put the slide master's own objects (logo, footer, lines) onto the
    PowerPoint slide master, so they behave like master objects there too."""
    if not elements:
        return
    scratch = prs.slides.add_slide(layout)
    for e in elements:
        if e.get("type") in ("chart", "table"):
            continue  # masters hold shapes, text, pictures and lines only
        add_element(scratch.shapes, e)
    master = prs.slide_master
    master_tree = master.shapes._spTree
    for node in list(scratch.shapes._spTree)[2:]:
        for blip in node.iter(qn("a:blip")):
            rid = blip.get(qn("r:embed"))
            if rid:
                image_part = scratch.part.related_part(rid)
                blip.set(qn("r:embed"), master.part.relate_to(image_part, RT.IMAGE))
        master_tree.append(node)
    sld_ids = prs.slides._sldIdLst
    last = sld_ids[-1]
    prs.part.drop_rel(last.rId)
    sld_ids.remove(last)


def _strip_master_placeholders(prs):
    """The default template's master carries Calibri placeholders; they never
    show on Blank slides, but remove footer/date/number boxes for cleanliness."""
    tree = prs.slide_master.shapes._spTree
    for sp in list(tree):
        ph = sp.find(".//" + qn("p:ph"))
        if ph is not None and ph.get("type") in ("dt", "ftr", "sldNum"):
            tree.remove(sp)


def build_presentation(deck, template=None):
    prs = Presentation(template) if template else Presentation()
    size = deck.get("size") or {"w": 12192000, "h": 6858000}
    if not template:
        prs.slide_width = emu(size["w"])
        prs.slide_height = emu(size["h"])
        apply_theme(prs, deck.get("theme"))
        _strip_master_placeholders(prs)
    layout = _blank_layout(prs)
    master = deck.get("master") or {}
    if not template:
        _set_background(prs.slide_master, master.get("background") or "#FFFFFF")
        _move_master_elements(prs, master.get("elements") or [], layout)
    for s in deck.get("slides") or []:
        slide = prs.slides.add_slide(layout)
        slide._element.cSld.set("name", "ds-" + str(s.get("id")))
        if s.get("background"):
            _set_background(slide, s["background"])
        if s.get("hideMaster"):
            slide._element.set("showMasterSp", "0")
        if s.get("hidden"):
            slide._element.set("show", "0")
        for e in s.get("elements") or []:
            add_element(slide.shapes, e)
        notes = (s.get("notes") or "").strip()
        if notes:
            slide.notes_slide.notes_text_frame.text = notes
    return prs


def export(deck, path, template=None):
    prs = build_presentation(deck, template or None)
    prs.save(path)
    return {"path": path, "slides": len(deck.get("slides") or [])}


def export_bytes(deck, template=None):
    buf = io.BytesIO()
    build_presentation(deck, template or None).save(buf)
    return buf.getvalue()
