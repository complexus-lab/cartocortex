// Generates app-icon.svg: a side-view brain with a network of connected neurons on a teal tile.
// Run:  node scripts/make-icon.mjs
// Then render it to a 1024px PNG and run `npx tauri icon app-icon.png` (see README).
import { writeFileSync } from "node:fs";

// Teal palette: edit here to re-theme the icon.
const C = {
  tileLight: "#0f9b8e", tileMid: "#0a5c58", tileDark: "#032a29",
  brainLight: "#2cc9b8", brainDark: "#0e7f77", // cerebrum gradient
  back: "#0d6b66",                              // cerebellum + brainstem
  rim: "#99f6e4",                               // outlines
  sulcus: "#99f6e4",
  link: "#ccfbf1", glow: "#5eead4",
  node: "#f0fdfa", nodeRing: "#2dd4bf",
};

// Tiny seeded PRNG so the layout is reproducible. Change SEED for a different neuron arrangement.
const SEED = 11;
let state = SEED;
const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const f = (n) => n.toFixed(1);

/** Wavy blob: ellipse whose radius wobbles (scalloped edge reads as gyri). */
function blob(cx, cy, rx, ry, n, wobble, bottomSquash = 1) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2, k = wobble(t);
    return [cx + rx * k * Math.cos(t), cy + ry * k * Math.sin(t) * (Math.sin(t) > 0 ? bottomSquash : 1)];
  });
}

/** Closed Catmull-Rom spline through points, as an SVG path. */
function smooth(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

const inside = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const edgeDist = ([x, y], poly) => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
};

// Shapes (1024 canvas; the brain faces left).
const cerebrum = blob(500, 470, 322, 236, 120,
  (t) => 1 + 0.034 * Math.sin(14 * t + 0.6) + 0.02 * Math.sin(23 * t + 2.1), 0.86);
const cerebellum = blob(690, 672, 128, 80, 60, (t) => 1 + 0.03 * Math.sin(10 * t + 1));
const stem = "M574 610 C572 690 586 760 608 804 Q620 824 646 818 Q670 812 662 784 C646 732 650 682 662 620 Z";

// Faint sulci (the big folds), drawn under the network.
const sulci = [
  "M318 548 C404 522 486 540 558 600",   // lateral fissure
  "M514 248 C566 326 540 398 596 474",   // central sulcus
  "M708 296 C684 356 706 420 654 476",   // parieto-occipital
  "M360 380 C410 350 440 372 470 346",
  "M610 560 C660 540 700 548 744 520",
];
const folds = ["M590 652 Q690 626 790 662", "M584 676 Q690 650 796 688", "M592 700 Q690 676 784 712"]; // cerebellum striations

// Neurons: spread inside the cerebrum, away from its edge and from each other.
const nodes = [];
for (let tries = 0; tries < 8000 && nodes.length < 26; tries++) {
  const p = [170 + rnd() * 660, 225 + rnd() * 480];
  if (!inside(p, cerebrum) || edgeDist(p, cerebrum) < 46) continue;
  if (nodes.some((q) => Math.hypot(q.x - p[0], q.y - p[1]) < 82)) continue;
  nodes.push({ x: p[0], y: p[1], r: 12 + rnd() * 8 });
}
// Each neuron links to its three nearest neighbours (de-duplicated).
const links = new Map();
nodes.forEach((a, i) => {
  nodes
    .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
    .filter((o) => o.j !== i && o.d < 170)
    .sort((p, q) => p.d - q.d)
    .slice(0, 3)
    .forEach((o) => links.set([Math.min(i, o.j), Math.max(i, o.j)].join("-"), o.d));
});
const linkPaths = [...links.keys()].map((key) => {
  const [i, j] = key.split("-").map(Number), a = nodes[i], b = nodes[j];
  const len = Math.hypot(b.x - a.x, b.y - a.y), bend = (rnd() - 0.5) * 0.28 * len;
  const mx = (a.x + b.x) / 2 - ((b.y - a.y) / len) * bend, my = (a.y + b.y) / 2 + ((b.x - a.x) / len) * bend;
  return `M${f(a.x)} ${f(a.y)}Q${f(mx)} ${f(my)} ${f(b.x)} ${f(b.y)}`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="tile" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="${C.tileLight}"/><stop offset=".5" stop-color="${C.tileMid}"/><stop offset="1" stop-color="${C.tileDark}"/>
    </radialGradient>
    <linearGradient id="brain" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.brainLight}"/><stop offset="1" stop-color="${C.brainDark}"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="url(#tile)"/>
  <rect x="6" y="6" width="1012" height="1012" rx="222" fill="none" stroke="${C.rim}" stroke-opacity=".18" stroke-width="4"/>

  <g transform="translate(512 520) scale(1.12) translate(-500 -520)">
  <path d="${stem}" fill="${C.back}" stroke="${C.rim}" stroke-width="8" stroke-linejoin="round"/>
  <path d="${smooth(cerebellum)}" fill="${C.back}" stroke="${C.rim}" stroke-width="8" stroke-linejoin="round"/>
  <g fill="none" stroke="${C.sulcus}" stroke-opacity=".4" stroke-width="6" stroke-linecap="round">${folds.map((d) => `<path d="${d}"/>`).join("")}</g>

  <path d="${smooth(cerebrum)}" fill="url(#brain)" stroke="${C.rim}" stroke-width="10" stroke-linejoin="round"/>
  <g fill="none" stroke="${C.sulcus}" stroke-opacity=".32" stroke-width="9" stroke-linecap="round">${sulci.map((d) => `<path d="${d}"/>`).join("")}</g>

  <g fill="none" stroke="${C.glow}" stroke-width="14" stroke-opacity=".45" filter="url(#blur)" stroke-linecap="round">${linkPaths.map((d) => `<path d="${d}"/>`).join("")}</g>
  <g fill="none" stroke="${C.link}" stroke-width="5" stroke-opacity=".9" stroke-linecap="round">${linkPaths.map((d) => `<path d="${d}"/>`).join("")}</g>
  <g fill="${C.glow}" fill-opacity=".55" filter="url(#blur)">${nodes.map((n) => `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(n.r * 1.9)}"/>`).join("")}</g>
  <g fill="${C.node}" stroke="${C.nodeRing}" stroke-width="5">${nodes.map((n) => `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(n.r)}"/>`).join("")}</g>
  </g>
</svg>
`;

writeFileSync(new URL("../app-icon.svg", import.meta.url), svg);
console.log(`app-icon.svg: ${nodes.length} neurons, ${links.size} links`);
