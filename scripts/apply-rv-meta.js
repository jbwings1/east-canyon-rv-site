/**
 * Apply RV site type and size from the map legend table to js/map-units-generated.js
 * Run: node scripts/apply-rv-meta.js
 */
const fs = require("fs");
const path = require("path");

const UNITS_PATH = path.join(__dirname, "..", "js", "map-units-generated.js");

/** Slot, type (B/PT/D), and size from the yellow legend on pix/map.png */
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

function parkForSite(n) {
  if (n <= 41) return 1;
  if (n <= 68) return 2;
  return 3;
}

const src = fs.readFileSync(UNITS_PATH, "utf8");
const match = src.match(/window\.MAP_UNITS\s*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error("Could not parse MAP_UNITS");

const MAP_UNITS = JSON.parse(match[1]);
let updated = 0;

MAP_UNITS.forEach((unit) => {
  if (unit.category !== "rv") return;
  const n = Number(unit.id);
  const meta = RV_META[n];
  if (!meta) return;
  const [code, sizeFeet] = meta;
  unit.type = TYPE_MAP[code] || "back-in";
  unit.sizeFeet = sizeFeet;
  unit.park = parkForSite(n);
  updated += 1;
});

const header = `/**
 * Map units — RV meta from map legend; coordinates from align tool.
 * RV meta: node scripts/apply-rv-meta.js · Coordinates: node scripts/apply-coordinates.js
 */
`;

const body = `${header}window.MAP_UNITS = ${JSON.stringify(MAP_UNITS, null, 2)};

window.CAMPGROUND_SPOTS = window.MAP_UNITS.filter((u) => u.category === "rv");
window.CONDO_UNITS = window.MAP_UNITS.filter((u) => u.category === "condo");
window.REUNION_SITES = window.MAP_UNITS.filter((u) => u.category === "reunion");
`;

fs.writeFileSync(UNITS_PATH, body, "utf8");
console.log(`Updated type, size, and park for ${updated} RV sites in ${UNITS_PATH}`);
