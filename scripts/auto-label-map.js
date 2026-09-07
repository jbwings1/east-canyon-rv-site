/**
 * Auto-label RV spots by reading numbers printed on yellow pads (OCR).
 * Run: node scripts/auto-label-map.js
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const Tesseract = require("tesseract.js");

const MAP_PATH = path.join(__dirname, "..", "pix", "map.png");
const UNITS_PATH = path.join(__dirname, "..", "js", "map-units-generated.js");
const MAP_Y_MAX = 595;

function isYellow(r, g, b, a) {
  return a > 200 && r > 210 && g > 200 && b < 120 && Math.abs(r - g) < 40;
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

function findComponents(png, maxY) {
  const { width, data } = png;
  const visited = new Uint8Array(width * maxY);
  const components = [];
  const idx = (x, y) => y * width + x;

  for (let y = 0; y < maxY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(x, y);
      if (visited[i]) continue;
      const o = i * 4;
      if (!isYellow(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;

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
          if (!isYellow(data[no], data[no + 1], data[no + 2], data[no + 3])) continue;
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
      }

      components.push({ minX, minY, maxX, maxY: maxYBox, pixels, cx: (minX + maxX) / 2, cy: (minY + maxYBox) / 2 });
    }
  }
  return components;
}

function rawBox(c) {
  return { x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1, cx: c.cx, cy: c.cy, pixels: c.pixels };
}

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
      pixels: items.reduce((s, b) => s + b.pixels, 0),
    };
  });
}

/** Crop blob to high-contrast PNG buffer for OCR (black digits on white). */
function cropForOcr(png, box) {
  const pad = 4;
  const x0 = Math.max(0, Math.floor(box.x) - pad);
  const y0 = Math.max(0, Math.floor(box.y) - pad);
  const x1 = Math.min(png.width - 1, Math.ceil(box.x + box.w) + pad);
  const y1 = Math.min(png.height - 1, Math.ceil(box.y + box.h) + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const scale = 3;
  const out = new PNG({ width: w * scale, height: h * scale });

  for (let oy = 0; oy < h * scale; oy += 1) {
    for (let ox = 0; ox < w * scale; ox += 1) {
      const sx = x0 + Math.floor(ox / scale);
      const sy = y0 + Math.floor(oy / scale);
      const si = (sy * png.width + sx) * 4;
      const r = png.data[si];
      const g = png.data[si + 1];
      const b = png.data[si + 2];
      const isDark = r < 120 && g < 120 && b < 120;
      const oi = (oy * out.width + ox) * 4;
      const v = isDark ? 0 : 255;
      out.data[oi] = v;
      out.data[oi + 1] = v;
      out.data[oi + 2] = v;
      out.data[oi + 3] = 255;
    }
  }

  return PNG.sync.write(out);
}

async function ocrSiteNumber(png, box) {
  const buffer = cropForOcr(png, box);
  const { data } = await Tesseract.recognize(buffer, "eng", {
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  });
  const digits = (data.text || "").replace(/\D/g, "");
  const n = parseInt(digits, 10);
  if (n >= 1 && n <= 81) return n;
  return null;
}

function loadUnits() {
  const src = fs.readFileSync(UNITS_PATH, "utf8");
  const match = src.match(/window\.MAP_UNITS\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error("Could not parse MAP_UNITS");
  return JSON.parse(match[1]);
}

async function main() {
  console.log("Loading map and detecting yellow pads…");
  const png = await loadImage(MAP_PATH);
  const fragments = findComponents(png, MAP_Y_MAX)
    .filter((c) => c.pixels >= 25)
    .map(rawBox)
    .filter((b) => b.cx >= 85 && b.cx <= 810 && b.cy >= 120 && b.cy <= MAP_Y_MAX);

  let boxes = groupByDistance(fragments, 18, 8, 6);
  boxes = boxes.filter((b) => b.pixels >= 50 && b.w >= 8 && b.h >= 8);
  console.log(`Found ${boxes.length} yellow pad regions. Running OCR…`);

  const labeled = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    const siteNum = await ocrSiteNumber(png, box);
    if (siteNum) {
      labeled.push({ siteNum, box });
      process.stdout.write(`\r  Labeled ${labeled.length} sites (last: ${siteNum})   `);
    }
  }
  console.log(`\nOCR labeled ${labeled.length}/81 sites`);

  const bySite = new Map();
  labeled.forEach(({ siteNum, box }) => {
    if (!bySite.has(siteNum)) bySite.set(siteNum, box);
  });

  const MAP_UNITS = loadUnits();
  let updated = 0;
  MAP_UNITS.forEach((unit) => {
    if (unit.category !== "rv") return;
    const box = bySite.get(Number(unit.id));
    if (!box) return;
    unit.x = Math.round(Math.max(0, box.x));
    unit.y = Math.round(Math.max(0, box.y));
    unit.w = Math.round(box.w);
    unit.h = Math.round(box.h);
    updated += 1;
  });

  const out = `/**
 * Map units — coordinates from OCR auto-label (node scripts/auto-label-map.js).
 * Fine-tune remaining sites on map-align.html if needed.
 */
window.MAP_UNITS = ${JSON.stringify(MAP_UNITS, null, 2)};

window.CAMPGROUND_SPOTS = window.MAP_UNITS.filter((u) => u.category === "rv");
window.CONDO_UNITS = window.MAP_UNITS.filter((u) => u.category === "condo");
`;
  fs.writeFileSync(UNITS_PATH, out, "utf8");
  console.log(`Updated ${updated}/81 RV coordinates in ${UNITS_PATH}`);

  const missing = [];
  for (let n = 1; n <= 81; n += 1) {
    if (!bySite.has(n)) missing.push(n);
  }
  if (missing.length) {
    console.log(`Sites OCR missed (${missing.length}): ${missing.join(", ")}`);
    console.log("Use map-align.html walkthrough for the rest, or re-run after map cleanup.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
