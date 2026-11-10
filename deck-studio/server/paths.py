"""Where Deck Studio keeps things on disk.

Everything here works without admin rights: settings live in the user's own
AppData folder, and the shared chart library lives on the user's Desktop.
"""
import json
import os
import sys
import threading

IS_WINDOWS = sys.platform.startswith("win")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIST = os.path.join(ROOT, "web", "dist")
SEED_CHARTS = os.path.join(ROOT, "server", "chart_seed")
SAMPLES = os.path.join(ROOT, "samples")


def _app_dir():
    if IS_WINDOWS:
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, "DeckStudio")
    return os.path.join(os.path.expanduser("~"), ".deckstudio")


APP_DIR = _app_dir()
SETTINGS_FILE = os.path.join(APP_DIR, "settings.json")


def desktop_dir():
    """The real Desktop folder (corporate laptops often move it into OneDrive)."""
    if IS_WINDOWS:
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
            )
            value, _ = winreg.QueryValueEx(key, "Desktop")
            path = os.path.expandvars(value)
            if os.path.isdir(path):
                return path
        except OSError:
            pass
    path = os.path.join(os.path.expanduser("~"), "Desktop")
    return path


def documents_dir():
    if IS_WINDOWS:
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
            )
            value, _ = winreg.QueryValueEx(key, "Personal")
            path = os.path.expandvars(value)
            if os.path.isdir(path):
                return path
        except OSError:
            pass
    return os.path.join(os.path.expanduser("~"), "Documents")


DEFAULT_SETTINGS = {
    "autosave": True,
    "autosaveFolder": os.path.join(documents_dir(), "Deck Studio"),
    "chartLibrary": os.path.join(desktop_dir(), "Deck Studio Charts"),
    "exportTemplate": "",
    "recent": [],
    "lastExport": "",
}

_lock = threading.Lock()


def load_settings():
    with _lock:
        data = dict(DEFAULT_SETTINGS)
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as fh:
                data.update(json.load(fh))
        except (OSError, ValueError):
            pass
        return data


def save_settings(changes):
    current = load_settings()
    current.update(changes)
    with _lock:
        os.makedirs(APP_DIR, exist_ok=True)
        tmp = SETTINGS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(current, fh, indent=2)
        os.replace(tmp, SETTINGS_FILE)
    return current


def add_recent(path, name=None):
    settings = load_settings()
    recent = [r for r in settings.get("recent", []) if r.get("path") != path]
    recent.insert(0, {"path": path, "name": name or os.path.basename(path)})
    save_settings({"recent": recent[:20]})
