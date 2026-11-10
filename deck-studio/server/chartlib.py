"""The shared chart library (a folder on the Desktop used by every deck).

Folder layout:
    Deck Studio Charts/
        production/   charts every deck uses
        testing/      your edits in progress (used only in Testing mode)
        backups/      copies made before "Send to Production"
        README.txt
"""
import ast
import datetime
import os
import re
import shutil
import sys
import traceback

from paths import SEED_CHARTS, load_settings

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

NAME_RE = re.compile(r"^[a-z0-9_]{2,60}$")

README = """Deck Studio chart library
=========================

production\\  The chart types every deck uses.
testing\\     Edits you are trying out. Decks only use these while
             Testing mode is switched on (Data tab).
backups\\     Copies taken before a chart was sent to production.

Each chart is one Python file with four blocks: SETTINGS, AI PROMPT,
SAMPLE DATA and CHART CODE. Edit them from Deck Studio
(Data > Charts > Edit code) rather than by hand.
"""


class ChartError(Exception):
    pass


def library_dir():
    return load_settings().get("chartLibrary")


def ensure_library():
    root = library_dir()
    for sub in ("production", "testing", "backups"):
        os.makedirs(os.path.join(root, sub), exist_ok=True)
    prod = os.path.join(root, "production")
    if not any(f.endswith(".py") for f in os.listdir(prod)):
        for f in os.listdir(SEED_CHARTS):
            if f.endswith(".py"):
                shutil.copy2(os.path.join(SEED_CHARTS, f), os.path.join(prod, f))
    readme = os.path.join(root, "README.txt")
    if not os.path.exists(readme):
        with open(readme, "w", encoding="utf-8") as fh:
            fh.write(README)
    return root


def _path(name, variant):
    if not NAME_RE.match(name or ""):
        raise ChartError("Chart names use lower-case letters, digits and _ only.")
    return os.path.join(ensure_library(), variant, name + ".py")


def _read_meta(path):
    """Read TITLE / DESCRIPTION / SETTINGS without running the file."""
    meta = {"title": os.path.splitext(os.path.basename(path))[0], "description": "", "settings": {}}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                key = node.targets[0].id
                if key in ("TITLE", "DESCRIPTION", "SETTINGS"):
                    try:
                        meta[key.lower()] = ast.literal_eval(node.value)
                    except ValueError:
                        pass
    except SyntaxError as exc:
        meta["error"] = "Syntax error on line %s: %s" % (exc.lineno, exc.msg)
    except OSError as exc:
        meta["error"] = str(exc)
    return meta


def list_charts():
    root = ensure_library()
    names = set()
    for variant in ("production", "testing"):
        for f in os.listdir(os.path.join(root, variant)):
            if f.endswith(".py") and NAME_RE.match(f[:-3]):
                names.add(f[:-3])
    out = []
    for name in sorted(names):
        prod = os.path.join(root, "production", name + ".py")
        test = os.path.join(root, "testing", name + ".py")
        meta = _read_meta(prod if os.path.exists(prod) else test)
        tmeta = _read_meta(test) if os.path.exists(test) else None
        out.append({
            "name": name,
            "title": meta.get("title"),
            "description": meta.get("description"),
            "settings": meta.get("settings"),
            "testingSettings": tmeta.get("settings") if tmeta else None,
            "inProduction": os.path.exists(prod),
            "hasTesting": os.path.exists(test),
            "error": meta.get("error") or (tmeta or {}).get("error"),
            "modified": os.path.getmtime(test if os.path.exists(test) else prod),
        })
    return {"root": root, "charts": out}


def get_code(name, variant="auto"):
    test, prod = _path(name, "testing"), _path(name, "production")
    if variant == "auto":
        variant = "testing" if os.path.exists(test) else "production"
    path = test if variant == "testing" else prod
    if not os.path.exists(path):
        raise ChartError("Chart '%s' has no %s version." % (name, variant))
    with open(path, "r", encoding="utf-8") as fh:
        return {"name": name, "variant": variant, "code": fh.read(), "path": path,
                "hasTesting": os.path.exists(test), "inProduction": os.path.exists(prod)}


def save_testing(name, code):
    try:
        compile(code, name + ".py", "exec")
    except SyntaxError as exc:
        raise ChartError("Line %s: %s" % (exc.lineno, exc.msg))
    path = _path(name, "testing")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(code)
    return {"saved": path}


def new_chart(name, title, base="stacked_column"):
    if os.path.exists(_path(name, "production")) or os.path.exists(_path(name, "testing")):
        raise ChartError("A chart called '%s' already exists." % name)
    src = _path(base, "production")
    if not os.path.exists(src):
        src = os.path.join(SEED_CHARTS, "stacked_column.py")
    with open(src, "r", encoding="utf-8") as fh:
        code = fh.read()
    code = re.sub(r'^TITLE = .*$', 'TITLE = %r' % (title or name), code, count=1, flags=re.M)
    save_testing(name, code)
    return {"name": name}


def promote(name, backup=True):
    test, prod = _path(name, "testing"), _path(name, "production")
    if not os.path.exists(test):
        raise ChartError("There is no testing version of '%s' to send." % name)
    backup_path = None
    if backup and os.path.exists(prod):
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(ensure_library(), "backups", "%s_%s.py" % (name, stamp))
        shutil.copy2(prod, backup_path)
    shutil.move(test, prod)
    return {"production": prod, "backup": backup_path}


def discard_testing(name):
    test = _path(name, "testing")
    if os.path.exists(test):
        os.remove(test)
    return {"ok": True}


def _load(name, testing):
    test, prod = _path(name, "testing"), _path(name, "production")
    path = test if (testing and os.path.exists(test)) else prod
    if not os.path.exists(path):
        path = test if os.path.exists(test) else None
    if not path:
        raise ChartError("Chart type '%s' is not in the chart library." % name)
    with open(path, "r", encoding="utf-8") as fh:
        code = fh.read()
    scope = {"__name__": "deckstudio_chart_" + name, "__file__": path}
    try:
        exec(compile(code, path, "exec"), scope)  # noqa: S102 - user's own chart code
    except Exception as exc:  # noqa: BLE001
        raise ChartError(_friendly(exc))
    if "build" not in scope:
        raise ChartError("The chart file has no build(table, settings, frame) function.")
    return scope, path


def _friendly(exc):
    tb = traceback.extract_tb(exc.__traceback__)
    line = next((f.lineno for f in reversed(tb) if "deckstudio_chart" in (f.filename or "") or f.filename.endswith(".py")), None)
    return "%s: %s%s" % (type(exc).__name__, exc, (" (line %s)" % line) if line else "")


def render(name, table=None, overrides=None, frame=None, testing=False):
    scope, path = _load(name, testing)
    settings = dict(scope.get("SETTINGS", {}))
    settings.update(overrides or {})
    table = table if table and table.get("columns") else scope.get("SAMPLE", {"columns": [], "rows": []})
    frame = frame or {"w": 640, "h": 340}
    try:
        spec = scope["build"](table, settings, frame)
    except Exception as exc:  # noqa: BLE001
        raise ChartError(_friendly(exc))
    validate(spec)
    return {"spec": spec, "settings": scope.get("SETTINGS", {}), "source": "testing" if "testing" in path else "production",
            "sample": scope.get("SAMPLE")}


def validate(spec):
    if not isinstance(spec, dict) or not isinstance(spec.get("panels"), list):
        raise ChartError("build() must return a dict with a 'panels' list.")
    for p in spec["panels"]:
        n = len(p.get("categories", []))
        if p.get("kind") not in ("bar", "line", "pie", "doughnut"):
            raise ChartError("Panel kind must be bar, line, pie or doughnut.")
        for sr in p.get("series", []):
            if len(sr.get("values", [])) != n:
                raise ChartError("Series '%s' has %d values but there are %d categories."
                                 % (sr.get("name"), len(sr.get("values", [])), n))
