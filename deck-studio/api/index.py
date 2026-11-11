"""Vercel entry point: the same Deck Studio server, in online demo mode."""
import os
import sys

os.environ["DECKSTUDIO_DEMO"] = "1"
os.environ["HOME"] = "/tmp"
os.environ.setdefault("APPDATA", "/tmp")
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))

import app  # noqa: E402


class handler(app.Handler):
    pass
