"""Back-end checks. Run:  python tests/test_backend.py

Builds a deck in memory, exports it, then re-opens the .pptx and checks that
fonts, colours, charts and tables came through as native PowerPoint objects.
"""
import io
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server"))

TMP = tempfile.mkdtemp(prefix="ds_test_")
os.environ["APPDATA"] = TMP  # keep settings away from the real user folder
os.environ["HOME"] = TMP

import chartlib  # noqa: E402
import excel  # noqa: E402
import export_pptx  # noqa: E402
from paths import SEED_CHARTS, save_settings  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.oxml.ns import qn  # noqa: E402

save_settings({"chartLibrary": os.path.join(TMP, "Charts")})


def run(text, **kw):
    r = {"text": text, "font": "Interstate", "size": 18, "color": "#262626"}
    r.update(kw)
    return r


def textbox(paras, x=457200, y=457200, w=6000000, h=900000):
    return {"type": "shape", "textbox": True, "geom": "rect", "x": x, "y": y, "w": w, "h": h, "fill": None,
            "line": None, "text": {"anchor": "t", "autofit": "none", "wrap": True,
                                   "insets": {"l": 91440, "t": 45720, "r": 91440, "b": 45720}, "paras": paras}}


def sample_deck():
    spec = chartlib.render("plan_comparison", None, None, {"w": 700, "h": 360})["spec"]
    return {
        "name": "Test X", "size": {"w": 12192000, "h": 6858000},
        "theme": {"name": "House", "colors": {"accent1": "#00778B"}, "fonts": {"major": "Interstate", "minor": "Interstate"}},
        "master": {"background": "#FFFFFF", "elements": [textbox([{"runs": [run("#", field="slidenum", size=9)]}])]},
        "slides": [{
            "id": "abc", "notes": "Speaker note", "elements": [
                textbox([{"align": "ctr", "lineSpacing": 1.15, "spaceBefore": 6,
                          "runs": [run("Bold teal ", bold=True, color="#00778B"), run("italic", italic=True, size=24)]},
                         {"bullet": {"type": "char", "char": "•"}, "marL": 228600, "indent": -228600,
                          "runs": [run("Bullet X")]}]),
                {"type": "chart", "x": 457200, "y": 1500000, "w": 8890000, "h": 4572000, "spec": spec},
                {"type": "table", "x": 457200, "y": 6000000, "w": 4000000, "h": 600000, "cols": [2000000, 2000000],
                 "rows": [{"h": 300000, "cells": [
                     {"text": {"paras": [{"runs": [run("A", color="#FFFFFF")]}]}, "fill": {"color": "#00778B"},
                      "borders": {"b": {"color": "#00778B", "width": 1.5}}},
                     {"text": {"paras": [{"runs": [run("B")]}]}}]},
                     {"h": 300000, "cells": [{"text": {"paras": [{"runs": [run("1")]}]}},
                                             {"text": {"paras": [{"runs": [run("2")]}]}}]}]},
                {"type": "shape", "geom": "roundRect", "x": 10000000, "y": 300000, "w": 1200000, "h": 600000, "rot": 15,
                 "fill": {"color": "#FFD200", "alpha": 0.8}, "line": {"color": "#00778B", "width": 1.5, "dash": "dash"},
                 "text": {"anchor": "ctr", "paras": [{"align": "ctr", "runs": [run("Draft", size=14)]}]}},
                {"type": "line", "x1": 457200, "y1": 1300000, "x2": 11700000, "y2": 1300000,
                 "line": {"color": "#3BAEB7", "width": 2, "tail": "triangle"}},
                {"type": "shape", "textbox": True, "placeholder": "body", "x": 0, "y": 0, "w": 100, "h": 100,
                 "text": {"paras": [{"runs": [run("")]}]}},
            ]}],
    }


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.deck = sample_deck()
        data = export_pptx.export_bytes(cls.deck)
        cls.prs = Presentation(io.BytesIO(data))
        cls.slide = cls.prs.slides[0]

    def test_size_and_name(self):
        self.assertEqual(self.prs.slide_width, 12192000)
        self.assertEqual(self.slide._element.cSld.get("name"), "ds-abc")

    def test_text_is_explicit(self):
        tb = self.slide.shapes[0]
        rpr = tb.text_frame.paragraphs[0].runs[0]._r.find(qn("a:rPr"))
        self.assertEqual(rpr.get("sz"), "1800")
        self.assertEqual(rpr.get("b"), "1")
        self.assertEqual(rpr.find(qn("a:latin")).get("typeface"), "Interstate")
        self.assertEqual(rpr.find(qn("a:solidFill"))[0].get("val"), "00778B")
        ppr = tb.text_frame.paragraphs[0]._p.find(qn("a:pPr"))
        self.assertEqual(ppr.get("algn"), "ctr")
        self.assertEqual(ppr.find(qn("a:lnSpc"))[0].get("val"), "115000")
        bul = tb.text_frame.paragraphs[1]._p.find(qn("a:pPr"))
        self.assertIsNotNone(bul.find(qn("a:buChar")))

    def test_native_chart_with_totals(self):
        groups = [s for s in self.slide.shapes if s.shape_type == 6]  # group
        self.assertEqual(len(groups), 1)
        charts = [s for s in groups[0].shapes if s.has_chart]
        self.assertEqual(len(charts), 2, "main + aggregate charts")
        plot_area = charts[0].chart._chartSpace.find(qn("c:chart")).find(qn("c:plotArea"))
        self.assertIsNotNone(plot_area.find(qn("c:barChart")))
        self.assertIsNotNone(plot_area.find(qn("c:lineChart")), "totals series")
        self.assertIsNotNone(plot_area.find(qn("c:layout")).find(qn("c:manualLayout")))
        self.assertEqual(charts[0].chart.plots[0].overlap, 100)

    def test_table_has_no_theme_style(self):
        tables = [s for s in self.slide.shapes if s.has_table]
        self.assertEqual(len(tables), 1)
        tbl = tables[0].table
        self.assertEqual(tbl._tbl.tblPr.find(qn("a:tableStyleId")).text, export_pptx.NO_STYLE_TABLE)
        tcpr = tbl.cell(0, 0)._tc.tcPr
        self.assertEqual(tcpr.find(qn("a:solidFill"))[0].get("val"), "00778B")

    def test_shape_rotation_alpha_and_no_theme_style(self):
        shp = [s for s in self.slide.shapes if s.shape_type == 1][0]
        self.assertAlmostEqual(shp.rotation, 15, places=1)
        self.assertIsNone(shp._element.find(qn("p:style")))

    def test_empty_placeholder_skipped_and_notes(self):
        self.assertEqual(len(self.slide.shapes), 5)
        self.assertEqual(self.slide.notes_slide.notes_text_frame.text, "Speaker note")

    def test_master_slide_number_field(self):
        xml = self.prs.slide_master.shapes._spTree.xml
        self.assertIn('type="slidenum"', xml)


class ChartLibraryTests(unittest.TestCase):
    def test_every_seed_chart_renders_and_exports(self):
        for f in os.listdir(SEED_CHARTS):
            if not f.endswith(".py"):
                continue
            name = f[:-3]
            with self.subTest(chart=name):
                spec = chartlib.render(name, None, None, {"w": 600, "h": 320})["spec"]
                deck = {"slides": [{"id": "s", "elements": [{"type": "chart", "x": 0, "y": 0, "w": 7620000, "h": 4064000, "spec": spec}]}]}
                export_pptx.export_bytes(deck)

    def test_testing_and_promote(self):
        code = chartlib.get_code("stacked_column")["code"].replace('"bar_width": 60', '"bar_width": 80')
        chartlib.save_testing("stacked_column", code)
        self.assertEqual(chartlib.render("stacked_column", testing=True)["source"], "testing")
        self.assertEqual(chartlib.render("stacked_column", testing=False)["source"], "production")
        res = chartlib.promote("stacked_column", backup=True)
        self.assertTrue(os.path.exists(res["backup"]))
        with self.assertRaises(chartlib.ChartError):
            chartlib.save_testing("stacked_column", "def build(:\n")


class ExcelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = excel.write_sample_workbooks(TMP)

    def test_table_and_names(self):
        t = excel.read_table(self.files[0], "Plan", "PlanBySegment")
        self.assertEqual(t["columns"], ["Year", "Plan", "X", "Y", "Z"])
        self.assertEqual(len(t["rows"]), 12)
        self.assertEqual(excel.read_value(self.files[0], "Plan", "Total_Current"), 699)
        self.assertEqual(excel.read_value(self.files[0], "Plan", "C2"), 40)

    def test_number_formats(self):
        f = excel.format_number
        self.assertEqual(f(1234.567, "#,##0"), "1,235")
        self.assertEqual(f(1234.567, "#,##0.0"), "1,234.6")
        self.assertEqual(f(0.1234, "0.0%"), "12.3%")
        self.assertEqual(f(1234567, '#,##0.0,,"m"'), "1.2m")
        self.assertEqual(f(-5, "0;(0)"), "(5)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
