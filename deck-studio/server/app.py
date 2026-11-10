"""Deck Studio local server.

Serves the editor to Chrome and answers its requests (files, Excel, charts,
export). It only listens on this computer (127.0.0.1), so nothing is exposed
to the network.

Run:  python server/app.py            (opens Chrome)
      python server/app.py --no-browser --port 8765
"""
import argparse
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import chartlib  # noqa: E402
import excel  # noqa: E402
import export_pptx  # noqa: E402
import platform_win as plat  # noqa: E402
from paths import (IS_WINDOWS, SAMPLES, WEB_DIST, add_recent, documents_dir,  # noqa: E402
                   load_settings, save_settings)

VERSION = "1.0.0"
TEMP_ROOT = os.path.join(tempfile.gettempdir(), "deckstudio")
os.makedirs(TEMP_ROOT, exist_ok=True)
_served_temp = {}


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def safe_name(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", (name or "").strip()).strip(". ")
    return name or "Untitled deck"


def write_json_file(path, data):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    tmp = path + ".saving"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def serve_temp(path):
    token = "%x" % (abs(hash((path, time.time()))) & 0xFFFFFFFFFF)
    _served_temp[token] = path
    return "/api/tmp/%s/%s" % (token, urllib.parse.quote(os.path.basename(path)))


def export_template():
    t = load_settings().get("exportTemplate") or ""
    return t if t and os.path.isfile(t) else None


# ------------------------------------------------------------------ routes
def r_health(_):
    return {"ok": True, "version": VERSION, "windows": IS_WINDOWS, "python": sys.version.split()[0]}


def r_settings_get(_):
    s = load_settings()
    s["documents"] = documents_dir()
    s["windows"] = IS_WINDOWS
    return s


def r_settings_set(body):
    allowed = {"autosave", "autosaveFolder", "chartLibrary", "exportTemplate", "lastExport"}
    return save_settings({k: v for k, v in body.items() if k in allowed})


def r_fonts(_):
    return {"fonts": plat.installed_fonts()}


def r_dialog(body):
    settings = load_settings()
    initial = body.get("initialDir")
    if not initial:
        initial = settings.get("autosaveFolder") if body.get("kind") == "deck" else documents_dir()
    return plat.file_dialog(body.get("mode", "open"), body.get("kind", "any"), body.get("title"), initial,
                            body.get("defaultName"))


def r_deck_open(body):
    path = body.get("path")
    if not path or not os.path.isfile(path):
        raise ApiError("File not found: %s" % path)
    with open(path, "r", encoding="utf-8") as fh:
        try:
            deck = json.load(fh)
        except ValueError:
            raise ApiError("This file is not a Deck Studio deck.")
    add_recent(path, deck.get("name"))
    return {"path": path, "deck": deck, "modified": os.path.getmtime(path)}


def r_deck_save(body):
    path, deck = body.get("path"), body.get("deck")
    if not path:
        raise ApiError("No file path given.")
    if not path.lower().endswith(".dstudio"):
        path += ".dstudio"
    write_json_file(path, deck)
    if not body.get("quiet"):
        add_recent(path, deck.get("name"))
    return {"path": path, "saved": time.time()}


def r_autosave(body):
    deck = body.get("deck") or {}
    path = body.get("path")
    if not path:
        folder = load_settings().get("autosaveFolder") or os.path.join(documents_dir(), "Deck Studio")
        base = os.path.join(folder, safe_name(deck.get("name")))
        path = base + ".dstudio"
        n = 2
        while os.path.exists(path):
            path = "%s (%d).dstudio" % (base, n)
            n += 1
        add_recent(path, deck.get("name"))
    write_json_file(path, deck)
    return {"path": path, "saved": time.time()}


def r_deck_rename(body):
    path, name = body.get("path"), safe_name(body.get("name"))
    if not path or not os.path.isfile(path):
        return {"path": path}
    new = os.path.join(os.path.dirname(path), name + ".dstudio")
    if os.path.normcase(new) == os.path.normcase(path):
        return {"path": path}
    if os.path.exists(new):
        raise ApiError("A deck called '%s' already exists in that folder." % name)
    os.replace(path, new)
    add_recent(new, name)
    return {"path": new}


def r_next_version(body):
    """'Deck v01.dstudio' -> 'Deck v02.dstudio' in the same folder."""
    path = body.get("path")
    name = safe_name(body.get("name"))
    folder = os.path.dirname(path) if path else (load_settings().get("autosaveFolder") or documents_dir())
    m = re.match(r"^(.*?)[ _-]?v(\d+)$", name, re.I)
    stem, num = (m.group(1).strip(), int(m.group(2))) if m else (name, 1)
    while True:
        num += 1
        cand = "%s v%02d" % (stem, num)
        if not os.path.exists(os.path.join(folder, cand + ".dstudio")):
            return {"name": cand, "path": os.path.join(folder, cand + ".dstudio")}


def r_recent(_):
    rec = load_settings().get("recent", [])
    out = []
    for r in rec:
        p = r.get("path")
        out.append({**r, "exists": bool(p and os.path.exists(p)),
                    "modified": os.path.getmtime(p) if p and os.path.exists(p) else None,
                    "folder": os.path.dirname(p or "")})
    return {"recent": out}


def r_recent_remove(body):
    rec = [r for r in load_settings().get("recent", []) if r.get("path") != body.get("path")]
    save_settings({"recent": rec})
    return {"ok": True}


def r_exists(body):
    return {"exists": os.path.exists(body.get("path") or ""), "isFile": os.path.isfile(body.get("path") or "")}


# Excel ------------------------------------------------------------------
def r_excel_inspect(body):
    return excel.inspect(body.get("path"))


def r_excel_table(body):
    return excel.read_table(body.get("path"), body.get("sheet"), body.get("table"))


def r_excel_batch(body):
    out = []
    for req in body.get("requests") or []:
        try:
            if req.get("kind") == "table":
                out.append({"ok": True, **excel.read_table(req.get("path"), req.get("sheet"), req.get("table"))})
            else:
                v = excel.read_value(req.get("path"), req.get("sheet"), req.get("ref"))
                out.append({"ok": True, "value": v, "text": excel.format_number(v, req.get("format"))})
        except excel.ExcelError as exc:
            out.append({"ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            out.append({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)})
    return {"results": out}


def r_excel_value(body):
    v = excel.read_value(body.get("path"), body.get("sheet"), body.get("ref"))
    return {"value": v, "text": excel.format_number(v, body.get("format"))}


def r_links_check(body):
    out = {}
    for sid, src in (body.get("sources") or {}).items():
        p = src.get("path")
        info = {"exists": bool(p and os.path.isfile(p))}
        if info["exists"]:
            info["modified"] = os.path.getmtime(p)
            try:
                meta = excel.inspect(p)
                info["tables"] = [t["name"] for s in meta["sheets"] for t in s["tables"]]
                info["sheets"] = [s["name"] for s in meta["sheets"]]
            except excel.ExcelError as exc:
                info["error"] = str(exc)
        out[sid] = info
    return {"status": out}


def r_samples(_):
    folder = os.path.join(documents_dir(), "Deck Studio", "Sample data")
    os.makedirs(folder, exist_ok=True)
    paths = [os.path.join(folder, "Plan Data %02d.xlsx" % v) for v in (1, 2)]
    if not all(os.path.exists(p) for p in paths):
        paths = excel.write_sample_workbooks(folder)
    return {"files": paths, "folder": folder}


# Charts -----------------------------------------------------------------
def r_charts_list(_):
    return chartlib.list_charts()


def r_charts_code(body):
    return chartlib.get_code(body.get("name"), body.get("variant", "auto"))


def r_charts_save(body):
    return chartlib.save_testing(body.get("name"), body.get("code", ""))


def r_charts_new(body):
    return chartlib.new_chart(body.get("name"), body.get("title"), body.get("base") or "stacked_column")


def r_charts_render(body):
    return chartlib.render(body.get("name"), body.get("table"), body.get("settings"), body.get("frame"),
                           bool(body.get("testing")))


def r_charts_render_batch(body):
    out = {}
    for item in body.get("items") or []:
        key = item.get("key")
        try:
            out[key] = {"ok": True, **chartlib.render(item.get("name"), item.get("table"), item.get("settings"),
                                                      item.get("frame"), bool(body.get("testing")))}
        except chartlib.ChartError as exc:
            out[key] = {"ok": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            out[key] = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
    return {"results": out}


def r_charts_promote(body):
    return chartlib.promote(body.get("name"), bool(body.get("backup", True)))


def r_charts_discard(body):
    return chartlib.discard_testing(body.get("name"))


def r_charts_folder(_):
    root = chartlib.ensure_library()
    plat.open_path(root)
    return {"root": root}


# Export -----------------------------------------------------------------
def r_export(body):
    path = body.get("path")
    if not path:
        raise ApiError("Choose where to save the PowerPoint file.")
    if not path.lower().endswith(".pptx"):
        path += ".pptx"
    try:
        result = export_pptx.export(body.get("deck") or {}, path, export_template())
    except PermissionError:
        raise ApiError("PowerPoint has this file open, so it can't be replaced. Use 'Update PowerPoint' "
                       "instead, or close the file in PowerPoint and try again.")
    save_settings({"lastExport": path})
    return result


def _temp_export(deck, slide_ids=None):
    if slide_ids:
        wanted = set(slide_ids)
        deck = dict(deck, slides=[s for s in deck.get("slides", []) if s.get("id") in wanted])
    folder = tempfile.mkdtemp(prefix="export_", dir=TEMP_ROOT)
    path = os.path.join(folder, safe_name(deck.get("name")) + ".pptx")
    export_pptx.export(deck, path, export_template())
    return deck, path


def r_powerpoint_status(_):
    try:
        return plat.powerpoint_open_files()
    except plat.OfficeError as exc:
        return {"running": False, "files": [], "unavailable": str(exc)}


def r_powerpoint_update(body):
    target = body.get("target")
    deck = body.get("deck") or {}
    if not target:
        raise ApiError("Choose the PowerPoint file to update.")
    sub, source = _temp_export(deck, body.get("slideIds"))
    ids = [s.get("id") for s in sub.get("slides", [])]
    if not ids:
        raise ApiError("There are no slides to send.")
    if not IS_WINDOWS:
        raise ApiError("Updating a PowerPoint file in place needs Windows with PowerPoint installed. "
                       "Use 'Export to PowerPoint' instead.")
    if not os.path.isfile(target):
        raise ApiError("File not found: %s" % target)
    result = plat.powerpoint_update(os.path.abspath(target), source, ids, body.get("save", True))
    save_settings({"lastExport": target})
    return result


def r_compare(body):
    deck = body.get("deck") or {}
    sub, path = _temp_export(deck, body.get("slideIds"))
    out_dir, files, engine = plat.render_slides(path)
    return {"engine": engine, "images": [serve_temp(f) for f in files]}


def r_share(body):
    deck = body.get("deck") or {}
    how = body.get("how", "pptx")
    name = safe_name(deck.get("name"))
    folder = tempfile.mkdtemp(prefix="share_", dir=TEMP_ROOT)
    if how == "deck":
        path = os.path.join(folder, name + ".dstudio")
        write_json_file(path, deck)
    else:
        path = os.path.join(folder, name + ".pptx")
        export_pptx.export(deck, path, export_template())
    if body.get("mode") == "folder":
        plat.reveal(path)
        return {"path": path, "shown": True}
    try:
        plat.outlook_mail(path, name)
        return {"path": path, "mailed": True}
    except plat.OfficeError as exc:
        plat.reveal(path)
        return {"path": path, "mailed": False, "reason": str(exc)}


def r_open_path(body):
    return plat.open_path(body.get("path"))


def r_reveal(body):
    return plat.reveal(body.get("path"))


GET_ROUTES = {
    "/api/health": r_health,
    "/api/settings": r_settings_get,
    "/api/fonts": r_fonts,
    "/api/recent": r_recent,
    "/api/charts/list": r_charts_list,
    "/api/powerpoint/status": r_powerpoint_status,
}
POST_ROUTES = {
    "/api/settings": r_settings_set,
    "/api/dialog": r_dialog,
    "/api/deck/open": r_deck_open,
    "/api/deck/save": r_deck_save,
    "/api/deck/autosave": r_autosave,
    "/api/deck/rename": r_deck_rename,
    "/api/deck/next-version": r_next_version,
    "/api/recent/remove": r_recent_remove,
    "/api/fs/exists": r_exists,
    "/api/excel/inspect": r_excel_inspect,
    "/api/excel/table": r_excel_table,
    "/api/excel/value": r_excel_value,
    "/api/excel/batch": r_excel_batch,
    "/api/links/check": r_links_check,
    "/api/samples": r_samples,
    "/api/charts/code": r_charts_code,
    "/api/charts/save": r_charts_save,
    "/api/charts/new": r_charts_new,
    "/api/charts/render": r_charts_render,
    "/api/charts/render-batch": r_charts_render_batch,
    "/api/charts/promote": r_charts_promote,
    "/api/charts/discard": r_charts_discard,
    "/api/charts/folder": r_charts_folder,
    "/api/export": r_export,
    "/api/powerpoint/update": r_powerpoint_update,
    "/api/compare": r_compare,
    "/api/share": r_share,
    "/api/open-path": r_open_path,
    "/api/reveal": r_reveal,
}


class Handler(BaseHTTPRequestHandler):
    server_version = "DeckStudio/" + VERSION

    def log_message(self, fmt, *args):  # keep the console quiet
        if os.environ.get("DECKSTUDIO_DEBUG"):
            sys.stderr.write("%s\n" % (fmt % args))

    def _send(self, status, payload, ctype="application/json"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _api(self, fn, body):
        try:
            self._send(200, fn(body))
        except (ApiError, excel.ExcelError, chartlib.ChartError, export_pptx.ExportError, plat.OfficeError) as exc:
            self._send(getattr(exc, "status", 400), {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self._send(500, {"error": "%s: %s" % (type(exc).__name__, exc)})

    def do_GET(self):  # noqa: N802
        url = urllib.parse.urlparse(self.path)
        if url.path in GET_ROUTES:
            return self._api(GET_ROUTES[url.path], dict(urllib.parse.parse_qsl(url.query)))
        if url.path.startswith("/api/tmp/"):
            parts = url.path.split("/")
            path = _served_temp.get(parts[3] if len(parts) > 3 else "")
            if path and os.path.isfile(path):
                with open(path, "rb") as fh:
                    return self._send(200, fh.read(), mimetypes.guess_type(path)[0] or "application/octet-stream")
            return self._send(404, {"error": "not found"})
        if url.path.startswith("/api/"):
            return self._send(404, {"error": "Unknown request"})
        return self._static(url.path)

    def do_POST(self):  # noqa: N802
        url = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except ValueError:
            return self._send(400, {"error": "Bad request"})
        fn = POST_ROUTES.get(url.path)
        if not fn:
            return self._send(404, {"error": "Unknown request"})
        return self._api(fn, body)

    def _static(self, path):
        rel = urllib.parse.unquote(path).lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(WEB_DIST, rel))
        if not full.startswith(os.path.normpath(WEB_DIST)) or not os.path.isfile(full):
            full = os.path.join(WEB_DIST, "index.html")
        if not os.path.isfile(full):
            return self._send(500, b"The editor has not been built (web/dist is missing).", "text/plain")
        with open(full, "rb") as fh:
            data = fh.read()
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".js"):
            ctype = "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if full.endswith(".html") else "max-age=31536000")
        self.end_headers()
        self.wfile.write(data)


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def find_chrome():
    candidates = []
    if IS_WINDOWS:
        for base in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidates.append(os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"))
        for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES")):
            if base:
                candidates.append(os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
    else:
        for name in ("google-chrome", "chromium", "chromium-browser"):
            p = shutil.which(name)
            if p:
                candidates.append(p)
    return next((c for c in candidates if c and os.path.exists(c)), None)


def open_app_window(url):
    """Open Chrome as an app window (no address bar), like a desktop program."""
    chrome = find_chrome()
    if chrome:
        try:
            subprocess.Popen([chrome, "--app=" + url, "--new-window"])
            return
        except OSError:
            pass
    webbrowser.open(url)


def main():
    ap = argparse.ArgumentParser(description="Deck Studio")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    url = "http://127.0.0.1:%d/" % args.port
    if not port_free(args.port):
        # already running: just open another window onto it
        print("Deck Studio is already running at", url)
        if not args.no_browser:
            open_app_window(url)
        return
    chartlib.ensure_library()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Deck Studio %s is running at %s" % (VERSION, url))
    print("Keep this window open while you work. Close it to stop Deck Studio.")
    if not args.no_browser:
        threading.Timer(0.6, open_app_window, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
