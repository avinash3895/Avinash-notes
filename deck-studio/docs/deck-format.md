# Deck file format (`.dstudio`)

A `.dstudio` file is plain JSON. Units: positions and sizes are **EMU**
(914400 per inch, 360000 per cm, 12700 per point); font sizes, spacing and line
widths are **points**.

```json
{
  "format": "deck-studio", "version": 1, "id": "d...", "name": "Plan review X",
  "size": { "w": 12192000, "h": 6858000 },
  "theme": { "name": "House", "colors": { "accent1": "#00778B", "...": "..." },
             "fonts": { "major": "Interstate", "minor": "Interstate" } },
  "master": { "background": "#FFFFFF", "elements": [ ... ] },
  "layouts": [ { "id": "content", "name": "Title and Content", "elements": [ ... ],
                 "background": null, "hideMaster": false } ],
  "slides": [ { "id": "s...", "layout": "content", "elements": [ ... ], "notes": "",
                "hidden": false, "background": null, "hideMaster": false } ],
  "links": { "sources": { "x...": { "path": "C:\\...\\Plan Data 01.xlsx" } } }
}
```

## Elements
Every element has `id`, `type`, optional `name`.

| type | fields |
|---|---|
| `shape` | `geom` (rect, roundRect, ellipse, ...), `x y w h rot flipH flipV`, `fill {color, alpha}` or null, `line {color, width, dash}` or null, `text` (text body) or null, `textbox` true for text boxes, `placeholder` + `prompt` for layout placeholders |
| `line` | `x1 y1 x2 y2`, `line {color, width, dash, head, tail}` (ends: none, triangle, arrow, oval, diamond) |
| `image` | `x y w h rot`, `src` (data URL), `crop {l,t,r,b}` fractions, `lockAspect` |
| `table` | `x y w h`, `cols [EMU]`, `rows [{h, cells:[{text, fill, borders{l,r,t,b}, margins, anchor}]}]`, `style` |
| `chart` | `x y w h`, `chartType` (library file name), `link {source, sheet, table}`, `data {columns, rows}`, `settings` (overrides), `spec` (last drawn) |
| `group` | `children [elements]` (absolute coordinates) |

## Text body
```json
{ "anchor": "t|ctr|b", "autofit": "none|shape", "wrap": true,
  "insets": { "l": 91440, "t": 45720, "r": 91440, "b": 45720 },
  "paras": [ { "align": "l|ctr|r|just", "level": 0, "lineSpacing": 1.0,
               "spaceBefore": 0, "spaceAfter": 0, "marL": 0, "indent": 0,
               "bullet": null | {"type": "char", "char": "•"} | {"type": "num", "scheme": "arabicPeriod"},
               "runs": [ { "text": "...", "font": "Interstate", "size": 18, "bold": false,
                           "italic": false, "underline": false, "strike": false,
                           "color": "#262626", "baseline": 0, "spacing": 0,
                           "link": {"source", "sheet", "ref", "format"}?, "field": "slidenum"? } ] } ] }
```
A `\n` inside a run's text is a line break within the paragraph (PowerPoint `a:br`).

## Chart spec
Documented at the top of `server/deckchart.py`.
