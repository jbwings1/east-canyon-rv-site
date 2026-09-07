const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fullPath = path.join(root, "docs", "policies-and-rules-full.html");
const sourcePath = fs.existsSync(fullPath)
  ? fullPath
  : path.join(root, "policies-and-rules.html");
const html = fs.readFileSync(sourcePath, "utf8");

const articleMatch = html.match(
  /<article class="policy-document">([\s\S]*?)<\/article>/
);
if (!articleMatch) {
  console.error("Could not find policy-document article");
  process.exit(1);
}

const body = articleMatch[1];
const parts = body.split(/(?=<h2\b)/).filter((p) => p.trim());

function parseSection(chunk) {
  const m = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, " ").trim();
  const numMatch = title.match(/^(\d+)\.\s+(.*)$/);
  return {
    title,
    num: numMatch ? Number(numMatch[1]) : null,
    name: numMatch ? numMatch[2].trim() : title,
    html: chunk.trim(),
  };
}

const rawSections = parts.map(parseSection).filter(Boolean);

const main = [];
const appendixChunks = [];
let seenSeventeen = false;

for (const sec of rawSections) {
  if (sec.num !== null && sec.num >= 1 && sec.num <= 17 && !seenSeventeen) {
    main.push(sec);
    if (sec.num === 17) seenSeventeen = true;
    continue;
  }
  if (seenSeventeen || sec.num === null || sec.num < 1 || sec.num > 17) {
    appendixChunks.push(sec.html);
  } else {
    main.push(sec);
  }
}

const byNum = new Map();
for (const sec of main) {
  if (!byNum.has(sec.num)) byNum.set(sec.num, sec);
}
const sections = [...byNum.values()].sort((a, b) => a.num - b.num);

if (appendixChunks.length) {
  sections.push({
    title: "Appendix",
    num: "appendix",
    name: "Appendix",
    html: appendixChunks.join("\n"),
    isAppendix: true,
  });
}

function fileNameFor(sec) {
  if (sec.isAppendix) return "policy-appendix.html";
  return `policy-section-${sec.num}.html`;
}

function labelFor(sec) {
  return sec.isAppendix ? "Appendix" : `${sec.num}. ${sec.name}`;
}

function indexNav(activeFile) {
  const links = sections
    .map((sec) => {
      const file = fileNameFor(sec);
      const active = file === activeFile ? ' class="active"' : "";
      return `          <a href="${file}"${active}>${labelFor(sec)}</a>`;
    })
    .join("\n");

  return `      <aside class="policy-index">
        <h2 class="policy-index-title">Index</h2>
        <nav class="policy-index-nav" aria-label="Rule book sections">
${links}
          <a href="policy-bylaws.html"${activeFile === "policy-bylaws.html" ? ' class="active"' : ""}>Bylaws</a>
        </nav>
        <p class="policy-index-back"><a href="member-home.html">Back to Members</a></p>
      </aside>`;
}

function searchForm() {
  return `        <form class="policy-search" id="policy-search-form" role="search">
          <label class="policy-search-label" for="policy-search-input">Search this section</label>
          <div class="policy-search-row">
            <input
              type="search"
              id="policy-search-input"
              name="q"
              placeholder="Search this section..."
              autocomplete="off"
            >
            <button type="submit">Search</button>
            <button type="button" id="policy-search-prev" disabled>Prev</button>
            <button type="button" id="policy-search-next" disabled>Next</button>
            <button type="button" id="policy-search-clear">Clear</button>
          </div>
          <p class="policy-search-status" id="policy-search-status" aria-live="polite"></p>
        </form>`;
}

function pageShell({ title, bodyInner, includeSearch }) {
  const searchScript = includeSearch
    ? `\n  <script src="js/policy-search.js?v=1"></script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | East Canyon Resort</title>
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
${bodyInner}
  </main>${searchScript}
</body>
</html>
`;
}

// Landing page: index left, intro right
const landingBody = `    <div class="container policy-layout">
${indexNav("policies-and-rules.html")}
      <section class="policy-main">
        <h1>Policies and Rules</h1>
        <p class="policy-intro">
          East Canyon Resort Rules and Regulations (effective May 1st, 2025)
          and the Fourth Restated Bylaws (adopted October 9, 2025).
          Choose a section from the index to read it here.
        </p>
      </section>
    </div>`;

fs.writeFileSync(
  path.join(root, "policies-and-rules.html"),
  pageShell({
    title: "Policies and Rules",
    bodyInner: landingBody,
    includeSearch: false,
  }),
  "utf8"
);

sections.forEach((sec, i) => {
  const file = fileNameFor(sec);
  const prev = sections[i - 1];
  const next = sections[i + 1];
  const heading = labelFor(sec);

  const navBits = [];
  if (prev) {
    navBits.push(`<a href="${fileNameFor(prev)}">Previous</a>`);
  }
  if (next) {
    navBits.push(`<a href="${fileNameFor(next)}">Next</a>`);
  }

  let sectionHtml = sec.html;
  if (!sec.isAppendix) {
    sectionHtml = sectionHtml.replace(/^<h2[^>]*>[\s\S]*?<\/h2>\s*/, "");
  }
  // Section 17 was followed by Index/Appendix text in the PDF extract.
  if (sec.num === 17) {
    sectionHtml = sectionHtml.split(/<p>Index\b/)[0];
    if (!/Appendix A - Penalty Summary/.test(sectionHtml)) {
      sectionHtml +=
        '<p>See <a href="policy-appendix.html#appendix-a">Appendix A - Penalty Summary</a> for listed fines.</p>';
    }
  }

  const sectionNav = navBits.length
    ? `        <p class="policy-section-nav">${navBits.join(" | ")}</p>\n`
    : "";

  const bodyInner = `    <div class="container policy-layout">
${indexNav(file)}
      <section class="policy-main">
        <h1>${heading}</h1>
${sectionNav}${searchForm()}
        <article class="policy-document">
${sectionHtml}
        </article>
${sectionNav}      </section>
    </div>`;

  fs.writeFileSync(
    path.join(root, file),
    pageShell({ title: heading, bodyInner, includeSearch: true }),
    "utf8"
  );
  console.log("Wrote", file);
});

console.log("Wrote policies-and-rules.html with side index");
