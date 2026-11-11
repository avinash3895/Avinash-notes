"""Read values out of saved Excel files.

Deck Studio never writes to Excel. It reads the values Excel saved last time,
so the rule for users is simple: save in Excel, then press Refresh.
The file is copied to a temp location first, so it can stay open in Excel.
"""
import datetime
import os
import re
import shutil
import tempfile

from openpyxl import load_workbook
from openpyxl.utils import range_boundaries, get_column_letter

_cache = {}


class ExcelError(Exception):
    pass


def _open(path):
    if not path:
        raise ExcelError("No Excel file chosen.")
    if not os.path.isfile(path) and os.environ.get("DECKSTUDIO_DEMO") == "1" \
            and re.match(r"Plan Data 0[12]\.xlsx$", os.path.basename(path)):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_sample_workbooks(os.path.dirname(path))
    if not os.path.isfile(path):
        raise ExcelError("File not found: %s" % path)
    stamp = os.path.getmtime(path)
    hit = _cache.get(path)
    if hit and hit[0] == stamp:
        return hit[1]
    tmpdir = tempfile.mkdtemp(prefix="deckstudio_")
    tmp = os.path.join(tmpdir, "book" + os.path.splitext(path)[1])
    try:
        shutil.copy2(path, tmp)
        wb = load_workbook(tmp, data_only=True, read_only=False)
    except Exception as exc:  # noqa: BLE001 - show the reason to the user
        raise ExcelError("Could not read %s (%s)" % (os.path.basename(path), exc))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    _cache[path] = (stamp, wb)
    return wb


def _clean(value):
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer() and abs(value) < 1e15:
        return value
    return value


def inspect(path):
    """List sheets, the named tables on each sheet, and workbook names."""
    wb = _open(path)
    sheets = []
    for ws in wb.worksheets:
        tables = []
        for name, table in ws.tables.items():
            ref = table.ref if hasattr(table, "ref") else table
            cols = []
            try:
                min_col, min_row, max_col, _ = range_boundaries(ref)
                for c in range(min_col, max_col + 1):
                    cols.append(str(ws.cell(row=min_row, column=c).value or ""))
            except Exception:  # noqa: BLE001
                pass
            tables.append({"name": name, "ref": ref, "columns": cols})
        sheets.append({"name": ws.title, "tables": tables, "dims": ws.dimensions})
    names = []
    try:
        for name, dn in wb.defined_names.items():
            names.append({"name": name, "ref": dn.attr_text})
    except Exception:  # noqa: BLE001
        pass
    for ws in wb.worksheets:
        try:
            for name, dn in ws.defined_names.items():
                names.append({"name": name, "ref": dn.attr_text, "sheet": ws.title})
        except Exception:  # noqa: BLE001
            pass
    return {"path": path, "sheets": sheets, "names": names}


def _find_table(wb, sheet, table):
    sheets = [wb[sheet]] if sheet and sheet in wb.sheetnames else wb.worksheets
    for ws in sheets:
        if table in ws.tables:
            t = ws.tables[table]
            return ws, (t.ref if hasattr(t, "ref") else t)
    # not on the named sheet: look everywhere (tables are workbook-unique)
    for ws in wb.worksheets:
        if table in ws.tables:
            t = ws.tables[table]
            return ws, (t.ref if hasattr(t, "ref") else t)
    raise ExcelError("Table '%s' was not found in the file." % table)


def read_range(ws, ref):
    min_col, min_row, max_col, max_row = range_boundaries(ref)
    out = []
    for r in range(min_row, max_row + 1):
        out.append([_clean(ws.cell(row=r, column=c).value) for c in range(min_col, max_col + 1)])
    return out


def read_table(path, sheet, table):
    """Return {columns, rows} for a named Excel table (header row = columns)."""
    wb = _open(path)
    if table:
        ws, ref = _find_table(wb, sheet, table)
    else:
        if sheet not in wb.sheetnames:
            raise ExcelError("Sheet '%s' was not found." % sheet)
        ws = wb[sheet]
        ref = ws.dimensions
    grid = read_range(ws, ref)
    if not grid:
        return {"columns": [], "rows": []}
    columns = [str(c) if c is not None else "" for c in grid[0]]
    rows = [row for row in grid[1:] if any(v is not None and v != "" for v in row)]
    return {"columns": columns, "rows": rows, "sheet": ws.title, "ref": ref}


_CELL = re.compile(r"^\$?([A-Za-z]{1,3})\$?(\d+)$")


def read_value(path, sheet, ref):
    """One value: a cell address like B4, or a workbook name like Total_X."""
    wb = _open(path)
    ref = (ref or "").strip()
    m = _CELL.match(ref)
    if m:
        if sheet not in wb.sheetnames:
            raise ExcelError("Sheet '%s' was not found." % sheet)
        return _clean(wb[sheet][ref.replace("$", "")].value)
    # defined name
    dn = None
    try:
        dn = wb.defined_names.get(ref)
    except Exception:  # noqa: BLE001
        dn = None
    if dn is None and sheet in wb.sheetnames:
        try:
            dn = wb[sheet].defined_names.get(ref)
        except Exception:  # noqa: BLE001
            dn = None
    if dn is None:
        raise ExcelError("'%s' is not a cell address or a name in the file." % ref)
    for title, coord in dn.destinations:
        cell = wb[title][coord.replace("$", "").split(":")[0]]
        return _clean(cell.value)
    raise ExcelError("Name '%s' does not point to a cell." % ref)


# ---------------------------------------------------------------- formatting
def format_number(value, fmt):
    """A small Excel-style number formatter for linked numbers in text.

    Supports: 0, 0.0, #,##0, #,##0.00, 0%, 0.0%, literal text in quotes,
    a leading/trailing currency or text, and a negative section after ';'.
    """
    if value is None:
        return ""
    if not isinstance(value, (int, float)):
        return str(value)
    fmt = fmt or "General"
    if fmt == "General":
        if isinstance(value, float):
            return ("%.10g" % value)
        return str(value)
    sections = _split_sections(fmt)
    if value < 0 and len(sections) > 1:
        return _apply(abs(value), sections[1])
    out = _apply(abs(value) if len(sections) > 1 else value, sections[0])
    return out


def _split_sections(fmt):
    parts, cur, quoted = [], "", False
    for ch in fmt:
        if ch == '"':
            quoted = not quoted
        if ch == ";" and not quoted:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def _apply(value, section):
    # pull out quoted literals and pieces outside the number pattern
    prefix, suffix, core, quoted, seen_digit, buf = "", "", "", False, False, ""
    tokens = []
    i = 0
    while i < len(section):
        ch = section[i]
        if ch == '"':
            j = section.find('"', i + 1)
            j = len(section) if j < 0 else j
            tokens.append(("lit", section[i + 1:j]))
            i = j + 1
            continue
        if ch == "\\" and i + 1 < len(section):
            tokens.append(("lit", section[i + 1]))
            i += 2
            continue
        if ch in "0#,.%":
            tokens.append(("num", ch))
        else:
            tokens.append(("lit", ch))
        i += 1
    for kind, text in tokens:
        if kind == "num":
            seen_digit = True
            core += text
        elif not seen_digit:
            prefix += text
        else:
            suffix += text
    percent = "%" in core
    core = core.replace("%", "")
    scale = 0
    while core.endswith(","):
        scale += 1
        core = core[:-1]
    v = value * (100 if percent else 1) / (1000 ** scale)
    decimals = len(core.split(".")[1]) if "." in core else 0
    grouping = "," in core
    text = ("{:,.%df}" % decimals).format(v) if grouping else ("{:.%df}" % decimals).format(v)
    if text.startswith("-") and float(text.replace(",", "")) == 0:
        text = text[1:]
    return prefix + text + ("%" if percent else "") + suffix


def write_sample_workbooks(folder, variants=2):
    """Create the sample Excel files (version 01 and 02) used by the demo deck."""
    from openpyxl import Workbook
    from openpyxl.worksheet.table import Table, TableStyleInfo
    from openpyxl.workbook.defined_name import DefinedName

    paths = []
    for v in range(1, variants + 1):
        wb = Workbook()
        ws = wb.active
        ws.title = "Plan"
        years = [2025 + i for i in range(6)]
        ws.append(["Year", "Plan", "X", "Y", "Z"])
        for i, y in enumerate(years):
            bump = (v - 1) * 4
            ws.append([str(y), "Prior", 40 + i * 6, 25 + i * 3, 12 + i * 2])
            ws.append([str(y), "Current", 44 + i * 7 + bump, 27 + i * 4, 13 + i * 2 + bump // 2])
        tab = Table(displayName="PlanBySegment", ref="A1:E13")
        tab.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
        ws.add_table(tab)
        ws["G1"] = "Headline"
        ws["G2"] = "Total current plan"
        ws["H2"] = "=SUM(C3:E3,C5:E5,C7:E7,C9:E9,C11:E11,C13:E13)"
        # cached value so openpyxl (data_only) can read it without Excel
        total = 0
        for row in ws.iter_rows(min_row=2, max_row=13, values_only=True):
            if row[1] == "Current":
                total += row[2] + row[3] + row[4]
        ws["H2"] = total
        ws["G3"] = "Growth vs prior"
        prior = sum(r[2] + r[3] + r[4] for r in ws.iter_rows(min_row=2, max_row=13, values_only=True) if r[1] == "Prior")
        ws["H3"] = round(total / prior - 1, 4)
        try:
            wb.defined_names["Total_Current"] = DefinedName("Total_Current", attr_text="Plan!$H$2")
            wb.defined_names["Growth"] = DefinedName("Growth", attr_text="Plan!$H$3")
        except TypeError:
            wb.defined_names.append(DefinedName("Total_Current", attr_text="Plan!$H$2"))
            wb.defined_names.append(DefinedName("Growth", attr_text="Plan!$H$3"))

        ws2 = wb.create_sheet("Mix")
        ws2.append(["Segment", "Share"])
        for name, share in (("X", 0.48 + v * 0.01), ("Y", 0.32), ("Z", 0.20 - v * 0.01)):
            ws2.append([name, share])
        t2 = Table(displayName="SegmentMix", ref="A1:B4")
        t2.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
        ws2.add_table(t2)
        for col in range(1, 9):
            ws.column_dimensions[get_column_letter(col)].width = 14
        path = os.path.join(folder, "Plan Data %02d.xlsx" % v)
        wb.save(path)
        paths.append(path)
    return paths
