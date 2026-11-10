# Deck Studio

A PowerPoint-style deck editor that runs on your own laptop, offline. You build
the deck here, link charts and numbers to Excel, then export a real `.pptx` with
the same fonts, colours and layout, and with **native, editable PowerPoint charts**.

## First time (about 2 minutes, no admin rights)

1. Copy the whole `deck-studio` folder somewhere on your laptop, for example `Documents\deck-studio`.
2. Double-click **Install Deck Studio.bat**. It installs two helper packages from
   files that ship inside the folder (no internet needed) and puts a
   **Deck Studio** shortcut on your Desktop.
   - It needs Python 3.11, 3.12 or 3.13. If Python is missing, install it from the
     Company Portal or python.org with "Install for me only".

## Every day

- Double-click **Deck Studio** on your Desktop. Chrome opens it as its own window.
- A small black window also opens. Keep it open (minimised is fine) while you work.
  Closing it stops Deck Studio.

## Where things are

| What | Where |
|---|---|
| Your decks (AutoSave) | `Documents\Deck Studio` (change in File > Options) |
| Shared chart library | `Desktop\Deck Studio Charts` (`production`, `testing`, `backups`) |
| Sample Excel files | `Documents\Deck Studio\Sample data` |
| Settings | `%APPDATA%\DeckStudio\settings.json` |

## How the main features work

**Editing** works like PowerPoint: ribbon on top, slides on the left, notes at the
bottom, right-click menus, smart guides while dragging, Ctrl+Z / Ctrl+Y, Ctrl+C / V,
Ctrl+D, Ctrl+G, F5 for the slide show. Objects can sit outside the slide; the slide
show and the export only show what is on the slide.

**Rename the deck** by clicking its name in the title bar.

**Save**: AutoSave (top left) saves a moment after each change. File > Save New
Version makes `Deck v02`, `v03` and so on next to the current file.

**Charts** (Data > Charts): pick a chart type, insert it with sample data or linked
to a named Excel table. Chart Design > Chart Settings changes colours, spacing and
bar size for that one chart.

**Excel links**
- Charts link to *file > sheet > named table* (in Excel: Insert > Table, then name it).
- Numbers inside text: click in a text box, then Insert > Linked Number.
- Save the workbook in Excel, then **Data > Refresh Slide** (or Refresh All).
- **Data > Edit Links** works like Excel's: pick a file and use Change Source to move
  every chart and number from `file 01` to `file 02` in one go.

**Chart code** (Data > Charts > Edit code) opens in a new window.
1. Change the SETTINGS block or the code, then **Save to Testing** (Ctrl+S).
2. Turn on **Testing mode** (Data tab). Open decks redraw straight away.
3. **Send to Production** makes it permanent for every deck. It asks each time
   whether to back up the old version first.
4. New chart idea: **Copy AI Prompt**, paste it into Claude with a description,
   then paste the reply back and save.

**Export to PowerPoint** (Data > Export, or File > Export) writes a new `.pptx`.

**Update PowerPoint** replaces this deck's slides inside an existing `.pptx` and adds
new ones at the end. It also works while that file is open in PowerPoint. Slides you
added in PowerPoint are left alone.

**Check Export** (Data tab) shows the current slide next to how PowerPoint draws the
exported version.

**New Window** (View tab) opens the same deck in a second window. Edits show in both.

**Share** (top right) emails the deck as a `.pptx` through Outlook, or opens the
folder that holds the file.

## If something goes wrong

- *"Background program is not running"*: start Deck Studio again from the Desktop shortcut.
- *A chart says "Chart error"*: select it, open Chart Design and read the message.
  If you were editing chart code, fix it in the code window and save again.
- *Text wraps differently in PowerPoint*: the font isn't installed on that computer.
  Anyone opening the deck needs Interstate installed.
