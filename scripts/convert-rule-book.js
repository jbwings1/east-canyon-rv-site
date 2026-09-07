const fs = require("fs");
const path = require("path");
const { PDFParse } = require("../docs/node_modules/pdf-parse");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\r\n/g, "\n");
}

function stripFrontMatter(text) {
  const marker = "1. PURPOSE AND AUTHORITY";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(idx);
}

function stripPageArtifacts(text) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, "\n")
    .replace(/^\s*\d+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function isHeading(line) {
  return /^\d+(?:\.\d+){0,3}\.\s+\S/.test(line);
}

function headingLevel(num) {
  const depth = String(num).split(".").length;
  if (depth === 1) return 2;
  if (depth === 2) return 3;
  return 4;
}

function splitHeadingLine(line) {
  // "1. PURPOSE AND AUTHORITY" or "1.1. Penalties - The penalty..."
  const m = line.match(/^(\d+(?:\.\d+){0,3})\.\s+(.+)$/);
  if (!m) return null;
  const num = m[1];
  const rest = m[2];
  const dash = rest.indexOf(" - ");
  if (dash === -1) {
    return { num, title: `${num}. ${rest}`, body: "" };
  }
  const titlePart = rest.slice(0, dash).trim();
  const bodyPart = rest.slice(dash + 3).trim();
  return { num, title: `${num}. ${titlePart}`, body: bodyPart };
}

function joinWrappedLines(lines) {
  const blocks = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) blocks.push({ type: "p", text: buf.trim() });
    buf = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (isHeading(line)) {
      flush();
      const parts = splitHeadingLine(line);
      if (parts) {
        blocks.push({ type: "h", num: parts.num, title: parts.title });
        if (parts.body) buf = parts.body;
      } else {
        blocks.push({ type: "h", num: "0", title: line });
      }
      continue;
    }
    if (!buf) {
      buf = line;
    } else if (/[-–—]$/.test(buf)) {
      buf = buf.replace(/[-–—]$/, "") + line;
    } else {
      buf += " " + line;
    }
  }
  flush();
  return blocks;
}

function toHtml(blocks) {
  const parts = [];
  for (const block of blocks) {
    if (block.type === "h") {
      const level = headingLevel(block.num);
      const id = String(block.num).replace(/\./g, "-");
      parts.push(`<h${level} id="sec-${id}">${escapeHtml(block.title)}</h${level}>`);
    } else {
      parts.push(`<p>${escapeHtml(block.text)}</p>`);
    }
  }
  return parts.join("\n");
}

async function main() {
  const root = path.join(__dirname, "..");
  const pdfPath = path.join(root, "docs", "rule-book.pdf");
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const result = await parser.getText();
  await parser.destroy();

  let text = cleanText(result.text || "");
  text = stripFrontMatter(text);
  text = stripPageArtifacts(text);

  const blocks = joinWrappedLines(text.split("\n"));
  const bodyHtml = toHtml(blocks);

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Policies and Rules | East Canyon Resort</title>
  <link rel="stylesheet" href="styles.css">
  <script src="js/auth.js?v=members2"></script>
  <script>
    (function () {
      var user = Auth.getCurrentUser();
      if (!user || Auth.needsPasswordChange(user)) {
        window.location.replace("login.html");
      }
    })();
  </script>
</head>
<body class="page-visitor">
  <header class="site-header">
    <div class="container header-inner">
      <a href="index.html" class="logo">
        <img src="pix/logo.jpg" alt="East Canyon Resort">
      </a>
      <nav class="header-nav" aria-label="Site links">
        <a href="index.html">Main Page</a>
        <a href="visitors.html">Visitors</a>
        <a href="members.html">Members</a>
      </nav>
    </div>
  </header>
  <main>
    <div class="container page-content page-content--wide">
      <h1>Policies and Rules</h1>
      <p class="policy-intro">
        East Canyon Resort Rules and Regulations
        (effective May 1st, 2025).
      </p>
      <form class="policy-search" id="policy-search-form" role="search">
        <label class="policy-search-label" for="policy-search-input">Search rules</label>
        <div class="policy-search-row">
          <input
            type="search"
            id="policy-search-input"
            name="q"
            placeholder="Search rules…"
            autocomplete="off"
          >
          <button type="submit">Search</button>
          <button type="button" id="policy-search-prev" disabled>Prev</button>
          <button type="button" id="policy-search-next" disabled>Next</button>
          <button type="button" id="policy-search-clear">Clear</button>
        </div>
        <p class="policy-search-status" id="policy-search-status" aria-live="polite"></p>
      </form>
      <article class="policy-document">
${bodyHtml}
      </article>
      <p><a href="member-home.html">Back to Members</a></p>
    </div>
  </main>
  <script src="js/policy-search.js?v=1"></script>
</body>
</html>
`;

  const outPath = path.join(root, "policies-and-rules.html");
  fs.writeFileSync(outPath, page, "utf8");
  console.log("Wrote", outPath, "blocks", blocks.length, "chars", page.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
