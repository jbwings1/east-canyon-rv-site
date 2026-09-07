/**
 * Detect yellow RV + brown condo click regions from pix/map.png.
 * Run: node scripts/detect-rv-spots.js
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const MAP_PATH = path.join(__dirname, "..", "pix", "map.png");
const UNITS_PATH = path.join(__dirname, "..", "js", "map-units-generated.js");
const MAP_Y_MAX = 595;

function isYellow(r, g, b, a) {
  return a > 200 && r > 210 && g > 200 && b < 120 && Math.abs(r - g) < 40;
}

function isBrown(r, g, b, a) {
  return a > 200 && r > 55 && r < 120 && g > 35 && g < 95 && b > 15 && b < 70 && r > g && g > b + 5;
}

function loadImage(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function onParsed() {
        resolve(this);
      })
      .on("error", reject);
  });
}

function findComponents(png, predicate, maxY) {
  const { width, data } = png;
  const visited = new Uint8Array(width * maxY);
  const components = [];
  const idx = (x, y) => y * width + x;

  for (let y = 0; y < maxY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(x, y);
      if (visited[i]) continue;
      const o = i * 4;
      if (!predicate(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxYBox = y;
      let pixels = 0;
      const stack = [[x, y]];
      visited[i] = 1;

      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxYBox = Math.max(maxYBox, cy);

        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= maxY) continue;
          const ni = idx(nx, ny);
          if (visited[ni]) continue;
          const no = ni * 4;
          if (!predicate(data[no], data[no + 1], data[no + 2], data[no + 3])) continue;
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
      }

      components.push({
        minX,
        minY,
        maxX,
        maxY: maxYBox,
        pixels,
        cx: (minX + maxX) / 2,
        cy: (minY + maxYBox) / 2,
      });
    }
  }
  return components;
}

function rawBox(c) {
  return {
    x: c.minX,
    y: c.minY,
    w: c.maxX - c.minX + 1,
    h: c.maxY - c.minY + 1,
    cx: c.cx,
    cy: c.cy,
    pixels: c.pixels,
  };
}

/** Merge fragments of the same yellow pad (number splits the blob). */
function groupByDistance(boxes, maxDist = 18, maxRowDiff = 8, pad = 6) {
  const n = boxes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (Math.abs(a.cy - b.cy) <= maxRowDiff && Math.hypot(a.cx - b.cx, a.cy - b.cy) <= maxDist) {
        union(i, j);
      }
    }
  }

  const groups = new Map();
  boxes.forEach((box, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(box);
  });

  return [...groups.values()].map((items) => {
    const x1 = Math.min(...items.map((b) => b.x));
    const y1 = Math.min(...items.map((b) => b.y));
    const x2 = Math.max(...items.map((b) => b.x + b.w));
    const y2 = Math.max(...items.map((b) => b.y + b.h));
    return {
      x: x1 - pad,
      y: y1 - pad,
      w: x2 - x1 + pad * 2,
      h: y2 - y1 + pad * 2,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      pixels: items.reduce((sum, b) => sum + b.pixels, 0),
    };
  });
}

function sortByPosition(blobs) {
  return [...blobs].sort((a, b) => {
    const row = Math.round(a.cy / 12) - Math.round(b.cy / 12);
    if (row !== 0) return row;
    return a.cx - b.cx;
  });
}

function loadUnits() {
  const src = fs.readFileSync(UNITS_PATH, "utf8");
  const match = src.match(/window\.MAP_UNITS\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not parse MAP_UNITS");
  return JSON.parse(match[1]);
}

async function main() {
  const png = await loadImage(MAP_PATH);

  const rvFragments = findComponents(png, isYellow, MAP_Y_MAX)
    .filter((c) => c.pixels >= 25)
    .map(rawBox)
    .filter((b) => b.cx >= 85 && b.cx <= 810 && b.cy >= 120 && b.cy <= MAP_Y_MAX);

  let rvBoxes = groupByDistance(rvFragments, 18, 8, 6);
  rvBoxes = rvBoxes.filter((b) => b.pixels >= 50 && b.w >= 8 && b.h >= 8 && b.w <= 60 && b.h <= 60);

  const condoFragments = findComponents(png, isBrown, MAP_Y_MAX)
    .filter((c) => c.pixels >= 20)
    .map(rawBox)
    .filter((b) => b.cx >= 770 && b.cx <= 990 && b.cy >= 250 && b.cy <= 560);

  let condoBoxes = groupByDistance(condoFragments, 14, 6, 4);
  condoBoxes = condoBoxes.filter((b) => b.pixels >= 35 && b.w >= 8 && b.h >= 8);

  console.log(`RV click areas: ${rvBoxes.length}, condo click areas: ${condoBoxes.length}`);

  const rvOrdered = sortByPosition(rvBoxes).slice(0, 81);
  const rvById = {};
  rvOrdered.forEach((box, i) => {
    rvById[String(i + 1)] = box;
  });

  const condoSorted = sortByPosition(condoBoxes);
  const condoSpec = [
    [10, 6],
    [11, 4],
    [12, 4],
    [13, 6],
    [14, 4],
    [15, 2],
    [16, 6],
  ];
  const letters = "ABCDEF";
  const condoById = {};
  let ci = 0;
  condoSpec.forEach(([building, count]) => {
    for (let n = 0; n < count && ci < condoSorted.length; n += 1, ci += 1) {
      condoById[`${building}${letters[n]}`] = condoSorted[ci];
    }
  });

  const MAP_UNITS = loadUnits();
  MAP_UNITS.forEach((unit) => {
    const box = unit.category === "rv" ? rvById[unit.id] : condoById[unit.id];
    if (!box) return;
    unit.x = Math.round(Math.max(0, box.x));
    unit.y = Math.round(Math.max(0, box.y));
    unit.w = Math.round(box.w);
    unit.h = Math.round(box.h);
  });

  console.log(`Assigned ${Object.keys(rvById).length}/81 RV, ${Object.keys(condoById).length}/32 condos`);

  const out = `/**
 * Map units — click regions aligned to yellow RV pads on pix/map.png.
 * Regenerate: node scripts/detect-rv-spots.js
 */
window.MAP_UNITS = ${JSON.stringify(MAP_UNITS, null, 2)};

window.CAMPGROUND_SPOTS = window.MAP_UNITS.filter((u) => u.category === "rv");
window.CONDO_UNITS = window.MAP_UNITS.filter((u) => u.category === "condo");
`;
  fs.writeFileSync(UNITS_PATH, out, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
