/**
 * Generates approximate overlay coordinates for RV sites (1–81) and condos (32 units).
 * Refine positions with map.html?mapEdit=1 — click the map and update js/map-coordinates.js.
 *
 * Run: node scripts/generate-map-coordinates.js
 */

const fs = require("fs");
const path = require("path");

function gridSpots({ ids, originX, originY, cols, cellW, cellH, gapX = 3, gapY = 3 }) {
  const out = {};
  ids.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out[id] = {
      x: Math.round(originX + col * (cellW + gapX)),
      y: Math.round(originY + row * (cellH + gapY)),
      w: cellW,
      h: cellH,
    };
  });
  return out;
}

/** RV site type/size from map legend table (B=back-in, PT=pull-through, D=drive-in). */
const RV_META = {
  1: ["PT", 55], 2: ["B", 55], 3: ["B", 50], 4: ["B", 55], 5: ["B", 50],
  6: ["B", 55], 7: ["B", 55], 8: ["B", 55], 9: ["B", 50], 10: ["B", 50],
  11: ["B", 50], 12: ["B", 45], 13: ["B", 45], 14: ["B", 50], 15: ["D", 35],
  16: ["B", 55], 17: ["B", 50], 18: ["PT", 40], 19: ["B", 50], 20: ["B", 50],
  21: ["B", 50], 22: ["B", 45], 23: ["B", 50], 24: ["B", 60], 25: ["PT", 70],
  26: ["B", 65], 27: ["B", 65], 28: ["B", 65], 29: ["B", 65], 30: ["B", 65],
  31: ["B", 65], 32: ["B", 35], 33: ["B", 35], 34: ["B", 45], 35: ["B", 55],
  36: ["B", 45], 37: ["B", 40], 38: ["B", 35], 39: ["B", 50], 40: ["B", 40],
  41: ["B", 40],
  42: ["B", 40], 43: ["B", 35], 44: ["B", 45], 45: ["B", 55], 46: ["B", 45],
  47: ["B", 40], 48: ["B", 40], 49: ["B", 55], 50: ["B", 45], 51: ["B", 50],
  52: ["B", 45], 53: ["B", 40], 54: ["PT", 50], 55: ["B", 50], 56: ["B", 55],
  57: ["B", 55], 58: ["B", 55], 59: ["B", 50], 60: ["B", 55], 61: ["B", 50],
  62: ["B", 50], 63: ["B", 45], 64: ["B", 60], 65: ["B", 60], 66: ["B", 60],
  67: ["B", 45], 68: ["B", 45],
  69: ["B", 50], 70: ["B", 45], 71: ["B", 40], 72: ["PT", 90], 73: ["PT", 75],
  74: ["PT", 60], 75: ["B", 50], 76: ["B", 50], 77: ["PT", 35], 78: ["PT", 55],
  79: ["PT", 65], 80: ["PT", 75], 81: ["PT", 75],
};

const TYPE_MAP = { B: "back-in", PT: "pull-through", D: "drive-in" };

const coords = {};

// PK #1 — east cluster (sites 1–31)
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 11 }, (_, i) => String(i + 1)),
    originX: 598,
    originY: 318,
    cols: 11,
    cellW: 22,
    cellH: 28,
  })
);
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 20 }, (_, i) => String(i + 12)),
    originX: 560,
    originY: 360,
    cols: 5,
    cellW: 24,
    cellH: 26,
    gapX: 4,
    gapY: 5,
  })
);

// PK #2 — central cluster (32–68)
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 10 }, (_, i) => String(i + 32)),
    originX: 398,
    originY: 248,
    cols: 5,
    cellW: 24,
    cellH: 26,
  })
);
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 17 }, (_, i) => String(i + 42)),
    originX: 318,
    originY: 300,
    cols: 6,
    cellW: 22,
    cellH: 24,
    gapX: 3,
    gapY: 4,
  })
);
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 10 }, (_, i) => String(i + 59)),
    originX: 350,
    originY: 410,
    cols: 5,
    cellW: 22,
    cellH: 24,
  })
);

// PK #3 — west cluster (69–81)
Object.assign(
  coords,
  gridSpots({
    ids: Array.from({ length: 13 }, (_, i) => String(i + 69)),
    originX: 118,
    originY: 330,
    cols: 4,
    cellW: 26,
    cellH: 28,
    gapX: 5,
    gapY: 6,
  })
);

// Condos — brown boxes on east side (buildings 10–16)
const CONDO_BUILDINGS = [
  { building: 10, letters: "ABCDEF", originX: 868, originY: 332, cols: 3 },
  { building: 11, letters: "ABCD", originX: 908, originY: 332, cols: 2 },
  { building: 12, letters: "ABCD", originX: 848, originY: 392, cols: 2 },
  { building: 13, letters: "ABCDEF", originX: 888, originY: 392, cols: 3 },
  { building: 14, letters: "ABCD", originX: 848, originY: 452, cols: 2 },
  { building: 15, letters: "AB", originX: 908, originY: 452, cols: 2 },
  { building: 16, letters: "ABCDEF", originX: 848, originY: 512, cols: 3 },
];

CONDO_BUILDINGS.forEach(({ building, letters, originX, originY, cols }) => {
  const ids = letters.split("").map((L) => `${building}${L}`);
  Object.assign(
    coords,
    gridSpots({
      ids,
      originX,
      originY,
      cols,
      cellW: 20,
      cellH: 22,
      gapX: 4,
      gapY: 4,
    })
  );
});

const rvUnits = [];
for (let n = 1; n <= 81; n += 1) {
  const id = String(n);
  const [code, sizeFeet] = RV_META[n] || ["B", 40];
  const park = n <= 41 ? 1 : n <= 68 ? 2 : 3;
  rvUnits.push({
    id,
    label: id,
    category: "rv",
    type: TYPE_MAP[code] || "back-in",
    sizeFeet,
    park,
    ...coords[id],
  });
}

const condoUnits = [];
CONDO_BUILDINGS.forEach(({ building, letters }) => {
  letters.split("").forEach((letter, idx) => {
    const id = `${building}${letter}`;
    condoUnits.push({
      id,
      label: id,
      category: "condo",
      building,
      unit: letter,
      bedrooms: building <= 12 ? 2 : building <= 14 ? 3 : 2,
      ...coords[id],
    });
  });
});

const outPath = path.join(__dirname, "..", "js", "map-units-generated.js");
const content = `/**
 * Auto-generated map unit definitions — ${rvUnits.length} RV sites + ${condoUnits.length} condos.
 * Regenerate: node scripts/generate-map-coordinates.js
 * Fine-tune x/y/w/h with map.html?mapEdit=1
 */
window.MAP_UNITS = ${JSON.stringify([...rvUnits, ...condoUnits], null, 2)};

window.CAMPGROUND_SPOTS = window.MAP_UNITS.filter((u) => u.category === "rv");
window.CONDO_UNITS = window.MAP_UNITS.filter((u) => u.category === "condo");
`;

fs.writeFileSync(outPath, content, "utf8");
console.log(`Wrote ${rvUnits.length} RV + ${condoUnits.length} condo units to ${outPath}`);
