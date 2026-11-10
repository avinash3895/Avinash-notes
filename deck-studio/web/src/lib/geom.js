// SVG outlines for PowerPoint preset shapes, using PowerPoint's default
// adjustment values so the canvas matches the exported shape.

const pts = (list) => 'M' + list.map(([x, y]) => `${x},${y}`).join(' L') + ' Z';

export const SHAPES = [
  { id: 'rect', name: 'Rectangle', group: 'Rectangles' },
  { id: 'roundRect', name: 'Rounded Rectangle', group: 'Rectangles', adj: [0.16667] },
  { id: 'snip1Rect', name: 'Snipped Corner', group: 'Rectangles', adj: [0.16667] },
  { id: 'round2SameRect', name: 'Round Top Corners', group: 'Rectangles', adj: [0.16667, 0] },
  { id: 'ellipse', name: 'Oval', group: 'Basic Shapes' },
  { id: 'triangle', name: 'Triangle', group: 'Basic Shapes', adj: [0.5] },
  { id: 'rtTriangle', name: 'Right Triangle', group: 'Basic Shapes' },
  { id: 'diamond', name: 'Diamond', group: 'Basic Shapes' },
  { id: 'parallelogram', name: 'Parallelogram', group: 'Basic Shapes', adj: [0.25] },
  { id: 'trapezoid', name: 'Trapezoid', group: 'Basic Shapes', adj: [0.25] },
  { id: 'hexagon', name: 'Hexagon', group: 'Basic Shapes', adj: [0.25] },
  { id: 'plus', name: 'Plus', group: 'Basic Shapes', adj: [0.25] },
  { id: 'donut', name: 'Donut', group: 'Basic Shapes', adj: [0.25] },
  { id: 'star5', name: 'Star', group: 'Basic Shapes' },
  { id: 'rightArrow', name: 'Right Arrow', group: 'Block Arrows', adj: [0.5, 0.5] },
  { id: 'leftArrow', name: 'Left Arrow', group: 'Block Arrows', adj: [0.5, 0.5] },
  { id: 'upArrow', name: 'Up Arrow', group: 'Block Arrows', adj: [0.5, 0.5] },
  { id: 'downArrow', name: 'Down Arrow', group: 'Block Arrows', adj: [0.5, 0.5] },
  { id: 'homePlate', name: 'Pentagon Arrow', group: 'Block Arrows', adj: [0.5] },
  { id: 'chevron', name: 'Chevron', group: 'Block Arrows', adj: [0.5] },
  { id: 'wedgeRectCallout', name: 'Speech Callout', group: 'Callouts', adj: [-0.20833, 0.625] },
];

export const LINE_TOOLS = [
  { id: 'line', name: 'Line' },
  { id: 'arrow', name: 'Arrow' },
  { id: 'doubleArrow', name: 'Double Arrow' },
];

export function shapePath(geom, w, h, adj) {
  const ss = Math.min(w, h);
  const a = (i, d) => (adj && adj[i] != null ? adj[i] : d);
  switch (geom) {
    case 'roundRect': {
      const r = Math.min(ss * a(0, 0.16667), ss / 2);
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case 'snip1Rect': {
      const d = ss * a(0, 0.16667);
      return pts([[0, 0], [w - d, 0], [w, d], [w, h], [0, h]]);
    }
    case 'round2SameRect': {
      const r = Math.min(ss * a(0, 0.16667), ss / 2);
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h} H0 V${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case 'ellipse':
      return `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`;
    case 'triangle':
      return pts([[w * a(0, 0.5), 0], [w, h], [0, h]]);
    case 'rtTriangle':
      return pts([[0, 0], [w, h], [0, h]]);
    case 'diamond':
      return pts([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'parallelogram': {
      const d = ss * a(0, 0.25);
      return pts([[d, 0], [w, 0], [w - d, h], [0, h]]);
    }
    case 'trapezoid': {
      const d = ss * a(0, 0.25);
      return pts([[d, 0], [w - d, 0], [w, h], [0, h]]);
    }
    case 'hexagon': {
      const d = ss * a(0, 0.25);
      return pts([[0, h / 2], [d, 0], [w - d, 0], [w, h / 2], [w - d, h], [d, h]]);
    }
    case 'plus': {
      const d = ss * a(0, 0.25);
      return pts([[d, 0], [w - d, 0], [w - d, d], [w, d], [w, h - d], [w - d, h - d], [w - d, h], [d, h], [d, h - d], [0, h - d], [0, d], [d, d]]);
    }
    case 'donut': {
      const d = ss * a(0, 0.25);
      const rx = w / 2; const ry = h / 2; const ix = rx - d; const iy = ry - d;
      return `M0,${ry} A${rx},${ry} 0 1 1 ${w},${ry} A${rx},${ry} 0 1 1 0,${ry} Z M${d},${ry} A${ix},${iy} 0 1 0 ${w - d},${ry} A${ix},${iy} 0 1 0 ${d},${ry} Z`;
    }
    case 'star5': {
      const cx = w / 2; const cy = h / 2;
      const outerX = w / 2 * 1.0; const outerY = h / 2 * 1.0;
      const inner = 0.38197;
      const list = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : inner;
        list.push([cx + Math.cos(ang) * outerX * r, cy + Math.sin(ang) * outerY * r * 1.0515 + (h * 0.025)]);
      }
      return pts(list);
    }
    case 'rightArrow': {
      const sh = h * a(0, 0.5); const hd = ss * a(1, 0.5);
      const y1 = (h - sh) / 2; const y2 = h - y1; const x = w - hd;
      return pts([[0, y1], [x, y1], [x, 0], [w, h / 2], [x, h], [x, y2], [0, y2]]);
    }
    case 'leftArrow': {
      const sh = h * a(0, 0.5); const hd = ss * a(1, 0.5);
      const y1 = (h - sh) / 2; const y2 = h - y1;
      return pts([[w, y1], [hd, y1], [hd, 0], [0, h / 2], [hd, h], [hd, y2], [w, y2]]);
    }
    case 'upArrow': {
      const sw = w * a(0, 0.5); const hd = ss * a(1, 0.5);
      const x1 = (w - sw) / 2; const x2 = w - x1;
      return pts([[x1, h], [x1, hd], [0, hd], [w / 2, 0], [w, hd], [x2, hd], [x2, h]]);
    }
    case 'downArrow': {
      const sw = w * a(0, 0.5); const hd = ss * a(1, 0.5);
      const x1 = (w - sw) / 2; const x2 = w - x1; const y = h - hd;
      return pts([[x1, 0], [x2, 0], [x2, y], [w, y], [w / 2, h], [0, y], [x1, y]]);
    }
    case 'homePlate': {
      const d = ss * a(0, 0.5);
      return pts([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]);
    }
    case 'chevron': {
      const d = ss * a(0, 0.5);
      return pts([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]);
    }
    case 'wedgeRectCallout': {
      const tx = w / 2 + w * a(0, -0.20833); const ty = h / 2 + h * a(1, 0.625);
      const x1 = w * (1 / 6); const x2 = w * (1 / 3);
      return pts([[0, 0], [w, 0], [w, h], [x2, h], [tx, ty], [x1, h], [0, h]]);
    }
    default:
      return `M0,0 H${w} V${h} H0 Z`;
  }
}

export function dashArray(dash, width) {
  const w = Math.max(width, 0.75);
  switch (dash) {
    case 'dash': return `${4 * w} ${3 * w}`;
    case 'dot': return `${w} ${w}`;
    case 'sysDash': return `${3 * w} ${w}`;
    case 'lgDash': return `${8 * w} ${3 * w}`;
    case 'dashDot': return `${4 * w} ${3 * w} ${w} ${3 * w}`;
    default: return undefined;
  }
}
