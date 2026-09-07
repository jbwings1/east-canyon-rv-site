/**
 * Crawl eastcanyon.com (pages + PDFs) and save photos we do not already have.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "pix", "gallery");
const PDF_DIR = path.join(ROOT, "files", "from-live");
const MANIFEST = path.join(OUT_DIR, "live-download-manifest.json");

const SKIP_MEDIA = [
  "3325e1_13baa922758e4b35b6184eba0fd21767", // site logo
  "8d6893330740455c96d218258a458aa4", // instagram icon
  "e316f544f9094143b9eac01f1f19e697", // facebook icon
  "9c4b521dd2404cd5a05ed6115f3a0dc8", // twitter icon
];

const EXTRA_PAGES = [
  "https://www.eastcanyon.com/login-details",
  "https://www.eastcanyon.com/forum",
  "https://www.eastcanyon.com/about",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function get(url, binary = false) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          get(next, binary).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${res.statusCode} ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve(binary ? buf : buf.toString("utf8"));
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(45000, () => req.destroy(new Error("timeout " + url)));
  });
}

function hashBuf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function collectExistingHashes() {
  const hashes = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        if (name === "temp-review") continue;
        walk(full);
      } else if (/\.(jpe?g|png|gif|webp)$/i.test(name)) {
        hashes.add(hashBuf(fs.readFileSync(full)));
      }
    }
  };
  walk(path.join(ROOT, "pix"));
  return hashes;
}

function mediaId(file) {
  return file.replace(/~mv2.*$/i, "").replace(/\.(jpe?g|png|gif|webp|avif)$/i, "");
}

function originalMediaUrl(raw) {
  let s = raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  try {
    s = decodeURIComponent(s);
  } catch {}
  s = s.replace(/&quot;/g, "").replace(/\\"/g, "");
  const idx = s.indexOf("/media/");
  if (idx === -1) return null;
  let rest = s.slice(idx + "/media/".length);
  rest = rest.split("/v1/")[0].split("?")[0];
  rest = rest.replace(/%7E/gi, "~");
  if (!rest || rest.length < 8) return null;
  return "https://static.wixstatic.com/media/" + rest;
}

function isLikelyPhoto(file) {
  const id = mediaId(file);
  if (SKIP_MEDIA.some((x) => id.startsWith(x) || file.startsWith(x))) return false;
  if (/^(11062b_|nsplsh_|11062b)/i.test(file) && !/~mv2/i.test(file)) return false;
  if (!/\.(jpe?g|png|webp)$/i.test(file) && !/~mv2/i.test(file)) return false;
  if (/\.svg$/i.test(file)) return false;
  return true;
}

function extractFromHtml(html) {
  const images = new Set();
  const pdfs = new Set();
  const mediaRe = /static\.wixstatic\.com\/media\/([^"'\\\s<>]+)/gi;
  let m;
  while ((m = mediaRe.exec(html))) {
    const url = originalMediaUrl("https://static.wixstatic.com/media/" + m[1]);
    if (url) images.add(url);
  }
  const pdfRe =
    /https?:\\?\/\\?\/(?:www\.)?(?:eastcanyon\.com\/_files\/ugd\/|[^"'\\s]*filesusr\.com\/ugd\/)[a-z0-9_]+\.pdf/gi;
  const pdfRe2 = /\/_files\/ugd\/[a-z0-9_]+\.pdf/gi;
  while ((m = pdfRe.exec(html))) {
    pdfs.add(m[0].replace(/\\\//g, "/"));
  }
  while ((m = pdfRe2.exec(html))) {
    pdfs.add("https://www.eastcanyon.com" + m[0]);
  }
  return { images, pdfs };
}

function extractEmbeddedImages(pdfBuf) {
  const out = [];
  let i = 0;
  while (i < pdfBuf.length - 2) {
    if (pdfBuf[i] === 0xff && pdfBuf[i + 1] === 0xd8 && pdfBuf[i + 2] === 0xff) {
      let j = i + 2;
      while (j < pdfBuf.length - 1) {
        if (pdfBuf[j] === 0xff && pdfBuf[j + 1] === 0xd9) {
          const slice = pdfBuf.subarray(i, j + 2);
          if (slice.length > 12000) out.push({ ext: ".jpg", buf: Buffer.from(slice) });
          i = j + 2;
          break;
        }
        j++;
      }
      if (j >= pdfBuf.length - 1) i++;
    } else if (
      pdfBuf[i] === 0x89 &&
      pdfBuf[i + 1] === 0x50 &&
      pdfBuf[i + 2] === 0x4e &&
      pdfBuf[i + 3] === 0x47
    ) {
      const end = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
      const e = pdfBuf.indexOf(end, i + 8);
      if (e !== -1) {
        const slice = pdfBuf.subarray(i, e + 8);
        if (slice.length > 12000) out.push({ ext: ".png", buf: Buffer.from(slice) });
        i = e + 8;
      } else i++;
    } else i++;
  }
  return out;
}

function safeName(file) {
  let name = file.split("/").pop();
  name = decodeURIComponent(name).replace(/[<>:"/\\|?*]+/g, "-");
  if (name.length > 80) name = mediaId(name).slice(0, 60) + path.extname(name);
  if (!/\.(jpe?g|png|gif|webp)$/i.test(name)) name += ".jpg";
  return name;
}

async function saveImage(buf, destName, hashes, saved) {
  if (buf.length < 10000) return false;
  const h = hashBuf(buf);
  if (hashes.has(h)) return false;
  hashes.add(h);
  let dest = path.join(OUT_DIR, destName);
  if (fs.existsSync(dest)) {
    const base = destName.replace(/\.[^.]+$/, "");
    const ext = path.extname(destName);
    dest = path.join(OUT_DIR, `${base}-live${ext}`);
  }
  fs.writeFileSync(dest, buf);
  saved.push(path.basename(dest));
  return true;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const hashes = collectExistingHashes();
  const saved = [];
  const skipped = [];
  const errors = [];

  const sitemap = await get("https://www.eastcanyon.com/pages-sitemap.xml");
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  for (const extra of EXTRA_PAGES) {
    if (!pages.includes(extra)) pages.push(extra);
  }

  const images = new Set();
  const pdfs = new Set();
  console.log(`Crawling ${pages.length} pages…`);
  for (const page of pages) {
    try {
      const html = await get(page);
      const found = extractFromHtml(html);
      found.images.forEach((u) => images.add(u));
      found.pdfs.forEach((u) => pdfs.add(u));
      console.log(`  ${page} — ${found.images.size} images, ${found.pdfs.size} pdfs`);
    } catch (err) {
      errors.push(String(err.message || err));
      console.log(`  FAIL ${page}: ${err.message}`);
    }
    await sleep(200);
  }

  console.log(`\nUnique remote images: ${images.size}`);
  console.log(`Unique remote PDFs: ${pdfs.size}`);

  for (const url of images) {
    const file = url.split("/media/")[1];
    if (!file || !isLikelyPhoto(file)) {
      skipped.push(url);
      continue;
    }
    try {
      const buf = await get(url, true);
      const name = safeName(file);
      const ok = await saveImage(buf, name, hashes, saved);
      console.log(ok ? `  saved ${name}` : `  have ${name}`);
    } catch (err) {
      errors.push(url + " " + err.message);
      console.log(`  FAIL image ${url}: ${err.message}`);
    }
    await sleep(80);
  }

  for (const pdfUrl of pdfs) {
    const fname = pdfUrl.split("/").pop();
    const dest = path.join(PDF_DIR, fname);
    let buf;
    try {
      buf = await get(pdfUrl, true);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
      console.log(`  pdf ${fname} (${buf.length} bytes)`);
    } catch (err) {
      errors.push(pdfUrl + " " + err.message);
      console.log(`  FAIL pdf ${pdfUrl}: ${err.message}`);
      continue;
    }
    const embedded = extractEmbeddedImages(buf);
    let n = 0;
    for (const img of embedded) {
      n += 1;
      const name = `pdf-${fname.replace(/\.pdf$/i, "")}-${String(n).padStart(2, "0")}${img.ext}`;
      const ok = await saveImage(img.buf, name, hashes, saved);
      if (ok) console.log(`    extracted ${name}`);
    }
    await sleep(80);
  }

  const localPdfs = [];
  const walkPdf = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walkPdf(full);
      else if (/\.pdf$/i.test(name) && !full.includes("board-member-sheet")) localPdfs.push(full);
    }
  };
  walkPdf(path.join(ROOT, "files"));
  console.log(`\nScanning ${localPdfs.length} local PDFs for photos…`);
  for (const full of localPdfs) {
    const buf = fs.readFileSync(full);
    const embedded = extractEmbeddedImages(buf);
    let n = 0;
    const base = path.basename(full, ".pdf");
    for (const img of embedded) {
      n += 1;
      const name = `pdf-${base}-${String(n).padStart(2, "0")}${img.ext}`;
      const ok = await saveImage(img.buf, name, hashes, saved);
      if (ok) console.log(`  extracted ${name}`);
    }
  }

  const report = { saved, skippedCount: skipped.length, errors, imageCount: images.size, pdfCount: pdfs.size };
  fs.writeFileSync(MANIFEST, JSON.stringify(report, null, 2));
  console.log(`\nDone. New photos: ${saved.length}. Errors: ${errors.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
