"""Windows integrations: real file dialogs, installed fonts, PowerPoint and
Outlook automation. Everything works without admin rights.

PowerPoint and Outlook are driven through PowerShell's built-in COM support,
so nothing extra needs installing. On other systems these features report
that they need Windows, and the rest of the app keeps working.
"""
import base64
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

from paths import APP_DIR, IS_WINDOWS

CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

FILTERS = {
    "deck": [("Deck Studio deck", "*.dstudio"), ("All files", "*.*")],
    "excel": [("Excel workbook", "*.xlsx *.xlsm"), ("All files", "*.*")],
    "pptx": [("PowerPoint presentation", "*.pptx"), ("All files", "*.*")],
    "potx": [("PowerPoint template or presentation", "*.potx *.pptx"), ("All files", "*.*")],
    "image": [("Pictures", "*.png *.jpg *.jpeg *.gif *.bmp"), ("All files", "*.*")],
    "any": [("All files", "*.*")],
}
DEFAULT_EXT = {"deck": ".dstudio", "pptx": ".pptx", "excel": ".xlsx"}


# ------------------------------------------------------------- file dialogs
_DIALOG_SCRIPT = r"""
import json, sys
args = json.loads(sys.argv[1])
try:
    import tkinter as tk
    from tkinter import filedialog
except Exception as exc:
    print(json.dumps({"unsupported": True, "reason": str(exc)})); sys.exit(0)
root = tk.Tk()
root.withdraw()
try:
    root.attributes("-topmost", True)
    root.update()
except Exception:
    pass
opts = {"title": args.get("title") or "Deck Studio", "parent": root}
if args.get("initialdir"):
    opts["initialdir"] = args["initialdir"]
mode = args.get("mode")
if mode == "folder":
    path = filedialog.askdirectory(mustexist=False, **opts)
elif mode == "save":
    opts["filetypes"] = [tuple(f) for f in args.get("filetypes") or []]
    opts["defaultextension"] = args.get("ext") or ""
    if args.get("initialfile"):
        opts["initialfile"] = args["initialfile"]
    path = filedialog.asksaveasfilename(confirmoverwrite=True, **opts)
else:
    opts["filetypes"] = [tuple(f) for f in args.get("filetypes") or []]
    path = filedialog.askopenfilename(**opts)
root.destroy()
print(json.dumps({"path": path or None}))
"""


def file_dialog(mode="open", kind="any", title=None, initial_dir=None, initial_file=None):
    args = {
        "mode": mode,
        "title": title,
        "filetypes": FILTERS.get(kind, FILTERS["any"]),
        "ext": DEFAULT_EXT.get(kind, ""),
        "initialdir": initial_dir if initial_dir and os.path.isdir(initial_dir) else None,
        "initialfile": initial_file,
    }
    exe = sys.executable
    if IS_WINDOWS and exe.lower().endswith("python.exe"):
        alt = exe[:-10] + "pythonw.exe"
        if os.path.exists(alt):
            exe = alt
    try:
        out = subprocess.run([exe, "-c", _DIALOG_SCRIPT, json.dumps(args)], capture_output=True, text=True,
                             timeout=600, creationflags=CREATE_NO_WINDOW)
        line = (out.stdout or "").strip().splitlines()
        if not line:
            return {"unsupported": True, "reason": (out.stderr or "dialog failed").strip()[-300:]}
        result = json.loads(line[-1])
        if result.get("path"):
            result["path"] = os.path.normpath(result["path"])
        return result
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        return {"unsupported": True, "reason": str(exc)}


# ---------------------------------------------------------------- fonts
def _font_dirs():
    dirs = []
    if IS_WINDOWS:
        windir = os.environ.get("WINDIR", r"C:\Windows")
        dirs.append(os.path.join(windir, "Fonts"))
        local = os.environ.get("LOCALAPPDATA")
        if local:
            dirs.append(os.path.join(local, "Microsoft", "Windows", "Fonts"))
    elif sys.platform == "darwin":
        dirs += ["/System/Library/Fonts", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
    else:
        dirs += ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts"),
                 os.path.expanduser("~/.local/share/fonts")]
    return [d for d in dirs if os.path.isdir(d)]


def _names_from_font(path):
    """Read the family names stored inside a .ttf/.otf/.ttc file."""
    names = set()
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError:
        return names
    offsets = [0]
    if data[:4] == b"ttcf":
        count = struct.unpack(">I", data[8:12])[0]
        offsets = list(struct.unpack(">%dI" % count, data[12:12 + 4 * count]))
    for off in offsets:
        try:
            num_tables = struct.unpack(">H", data[off + 4:off + 6])[0]
            for i in range(num_tables):
                rec = off + 12 + 16 * i
                tag = data[rec:rec + 4]
                if tag != b"name":
                    continue
                t_off = struct.unpack(">I", data[rec + 8:rec + 12])[0]
                fmt, count, string_off = struct.unpack(">HHH", data[t_off:t_off + 6])
                fam = {}
                for j in range(count):
                    r = t_off + 6 + 12 * j
                    pid, eid, lid, nid, length, noff = struct.unpack(">HHHHHH", data[r:r + 12])
                    if nid != 1:
                        continue
                    raw = data[t_off + string_off + noff:t_off + string_off + noff + length]
                    if pid == 3:
                        try:
                            fam[(0 if lid == 0x409 else 1)] = raw.decode("utf-16-be")
                        except UnicodeDecodeError:
                            pass
                    elif pid == 1 and lid == 0:
                        fam.setdefault(2, raw.decode("latin-1"))
                if fam:
                    names.add(fam[min(fam)].strip())
        except (struct.error, IndexError):
            continue
    return names


def installed_fonts():
    cache_file = os.path.join(APP_DIR, "fonts-cache.json")
    files = []
    for d in _font_dirs():
        for root, _, fnames in os.walk(d):
            for f in fnames:
                if f.lower().endswith((".ttf", ".otf", ".ttc")):
                    files.append(os.path.join(root, f))
    stamp = "%d:%d" % (len(files), int(max([os.path.getmtime(f) for f in files] + [0])))
    try:
        with open(cache_file, "r", encoding="utf-8") as fh:
            cached = json.load(fh)
        if cached.get("stamp") == stamp:
            return cached["fonts"]
    except (OSError, ValueError):
        pass
    fams = set()
    for f in files:
        fams |= _names_from_font(f)
    fonts = sorted((n for n in fams if n and not n.startswith((".", "@"))), key=str.lower)
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as fh:
            json.dump({"stamp": stamp, "fonts": fonts}, fh)
    except OSError:
        pass
    return fonts


# ------------------------------------------------------------- PowerShell
class OfficeError(Exception):
    pass


def run_powershell(script, timeout=300):
    if not IS_WINDOWS:
        raise OfficeError("This needs Windows with PowerPoint installed.")
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    try:
        out = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-EncodedCommand", encoded],
            capture_output=True, text=True, timeout=timeout, creationflags=CREATE_NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise OfficeError("Could not run PowerShell: %s" % exc)
    lines = [l for l in (out.stdout or "").splitlines() if l.strip().startswith("{")]
    if not lines:
        raise OfficeError((out.stderr or out.stdout or "PowerShell gave no answer").strip()[-600:])
    result = json.loads(lines[-1])
    if result.get("error"):
        raise OfficeError(result["error"])
    return result


def _ps_str(value):
    return "'" + str(value).replace("'", "''") + "'"


def powerpoint_open_files():
    script = r"""
$ErrorActionPreference = 'Stop'
try {
  $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
  $list = @()
  foreach ($p in $ppt.Presentations) { $list += $p.FullName }
  @{ running = $true; files = $list } | ConvertTo-Json -Compress
} catch {
  @{ running = $false; files = @() } | ConvertTo-Json -Compress
}
"""
    return run_powershell(script, timeout=60)


def powerpoint_update(target, source, slide_ids, save=True):
    """Replace / add Deck Studio slides inside a PowerPoint file, even while it
    is open in PowerPoint. Slides are matched by the hidden name ds-<id> that
    every exported slide carries; unmatched slides are added at the end.
    Slides in the target that Deck Studio didn't make are never touched."""
    ids = ",".join(_ps_str("ds-" + i) for i in slide_ids)
    script = r"""
$ErrorActionPreference = 'Stop'
try {
  $target = %(target)s
  $source = %(source)s
  $ids = @(%(ids)s)
  try { $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application') }
  catch { $ppt = New-Object -ComObject PowerPoint.Application }
  $pres = $null
  foreach ($p in $ppt.Presentations) { if ($p.FullName -ieq $target) { $pres = $p } }
  $wasOpen = $true
  if ($pres -eq $null) { $wasOpen = $false; $pres = $ppt.Presentations.Open($target, 0, 0, 0) }
  $replaced = 0; $added = 0
  for ($i = 0; $i -lt $ids.Count; $i++) {
    $name = $ids[$i]
    $idx = 0
    foreach ($s in $pres.Slides) { if ($s.Name -eq $name) { $idx = $s.SlideIndex } }
    if ($idx -gt 0) {
      [void]$pres.Slides.InsertFromFile($source, $idx, $i + 1, $i + 1)
      $pres.Slides.Item($idx).Delete()
      $pres.Slides.Item($idx).Name = $name
      $replaced++
    } else {
      $end = $pres.Slides.Count
      [void]$pres.Slides.InsertFromFile($source, $end, $i + 1, $i + 1)
      $pres.Slides.Item($end + 1).Name = $name
      $added++
    }
  }
  if (%(save)s) { $pres.Save() }
  if (-not $wasOpen) { $pres.Close() }
  @{ ok = $true; replaced = $replaced; added = $added; wasOpen = $wasOpen } | ConvertTo-Json -Compress
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
""" % {"target": _ps_str(target), "source": _ps_str(source), "ids": ids, "save": "$true" if save else "$false"}
    return run_powershell(script)


def powerpoint_render(pptx_path, out_dir, width=1280, height=720):
    script = r"""
$ErrorActionPreference = 'Stop'
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  $pres = $ppt.Presentations.Open(%(src)s, -1, 0, 0)
  $files = @()
  foreach ($s in $pres.Slides) {
    $f = Join-Path %(out)s ("slide_{0:D3}.png" -f $s.SlideIndex)
    $s.Export($f, 'PNG', %(w)d, %(h)d)
    $files += $f
  }
  $pres.Close()
  @{ ok = $true; files = $files } | ConvertTo-Json -Compress
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
""" % {"src": _ps_str(pptx_path), "out": _ps_str(out_dir), "w": width, "h": height}
    return run_powershell(script)["files"]


def libreoffice_render(pptx_path, out_dir):
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise OfficeError("Neither PowerPoint nor LibreOffice is available to draw the exported slides.")
    subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", out_dir, pptx_path],
                   capture_output=True, timeout=180)
    pdf = os.path.join(out_dir, os.path.splitext(os.path.basename(pptx_path))[0] + ".pdf")
    if not os.path.exists(pdf) or not shutil.which("pdftoppm"):
        raise OfficeError("Could not draw the exported slides.")
    subprocess.run(["pdftoppm", "-png", "-r", "96", pdf, os.path.join(out_dir, "slide")], capture_output=True,
                   timeout=180)
    return sorted(os.path.join(out_dir, f) for f in os.listdir(out_dir) if f.startswith("slide") and f.endswith(".png"))


def render_slides(pptx_path):
    out_dir = tempfile.mkdtemp(prefix="deckstudio_compare_")
    if IS_WINDOWS:
        try:
            return out_dir, powerpoint_render(pptx_path, out_dir), "PowerPoint"
        except OfficeError:
            pass
    return out_dir, libreoffice_render(pptx_path, out_dir), "LibreOffice"


def outlook_mail(attachment, subject):
    script = r"""
$ErrorActionPreference = 'Stop'
try {
  $ol = New-Object -ComObject Outlook.Application
  $m = $ol.CreateItem(0)
  $m.Subject = %(subject)s
  [void]$m.Attachments.Add(%(path)s)
  $m.Display()
  @{ ok = $true } | ConvertTo-Json -Compress
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
}
""" % {"subject": _ps_str(subject), "path": _ps_str(attachment)}
    return run_powershell(script, timeout=120)


def open_path(path):
    if not os.path.exists(path):
        raise OfficeError("Not found: %s" % path)
    if IS_WINDOWS:
        os.startfile(path)  # noqa: S606
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
    return {"ok": True}


def reveal(path):
    if IS_WINDOWS:
        subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
        return {"ok": True}
    return open_path(os.path.dirname(path) or ".")
