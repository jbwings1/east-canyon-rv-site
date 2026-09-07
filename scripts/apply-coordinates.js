/**
 * Apply saved coordinates JSON to js/map-units-generated.js
 * Run: node scripts/apply-coordinates.js rv-spot-coordinates.json
 * Merge several files: node scripts/apply-coordinates.js rv.json condo.json reunion.json
 */
const fs = require("fs");
const path = require("path");

const jsonPaths = process.argv.slice(2);
if (!jsonPaths.length) {
  console.error("Usage: node scripts/apply-coordinates.js <coordinates.json> [more.json ...]");
  process.exit(1);
}

const UNITS_PATH = path.join(__dirname, "..", "js", "map-units-generated.js");
const byId = new Map();

jsonPaths.forEach((jsonPath) => {
  const coords = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  coords.forEach((c) => byId.set(String(c.id), c));
});

const src = fs.readFileSync(UNITS_PATH, "utf8");
const match = src.match(/window\.MAP_UNITS\s*=\s*(\[[\s\S]*?\]);/);
if (!match) throw new Error("Could not parse MAP_UNITS");
const MAP_UNITS = JSON.parse(match[1]);

let updated = 0;
MAP_UNITS.forEach((unit) => {
  const c = byId.get(String(unit.id));
  if (!c) return;
  unit.x = c.x;
  unit.y = c.y;
  unit.w = c.w;
  unit.h = c.h;
  if (c.points && c.points.length === 4) {
    unit.points = c.points.map((p) => [Math.round(p[0]), Math.round(p[1])]);
  } else {
    delete unit.points;
  }
  updated += 1;
});

const sourceNames = jsonPaths.map((p) => path.basename(p)).join(", ");
const out = `/**
 * Map units — coordinates applied from ${sourceNames}.
 * Align tool: map-align.html · Apply: node scripts/apply-coordinates.js
 */
window.MAP_UNITS = ${JSON.stringify(MAP_UNITS, null, 2)};

window.CAMPGROUND_SPOTS = window.MAP_UNITS.filter((u) => u.category === "rv");
window.CONDO_UNITS = window.MAP_UNITS.filter((u) => u.category === "condo");
window.REUNION_SITES = window.MAP_UNITS.filter((u) => u.category === "reunion");
`;

fs.writeFileSync(UNITS_PATH, out, "utf8");
console.log(`Applied ${updated} units from ${jsonPaths.length} file(s) to ${UNITS_PATH}`);

const rv = MAP_UNITS.filter((u) => u.category === "rv" && u.points).length;
const condo = MAP_UNITS.filter((u) => u.category === "condo" && u.points).length;
const reunion = MAP_UNITS.filter((u) => u.category === "reunion" && u.points).length;
console.log(`With corner points: ${rv} RV, ${condo} condos, ${reunion} family sites`);
