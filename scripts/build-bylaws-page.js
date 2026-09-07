const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const raw = fs.readFileSync(path.join(root, "docs", "extract-bylaws.txt"), "utf8");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let text = raw
  .replace(/\r/g, "")
  .replace(/\t/g, " ")
  .replace(/^-- \d+ of \d+ --\s*$/gm, "")
  .replace(/ARTICLE Ill\b/g, "ARTICLE III")
  .replace(/ARTlCLE X\b/g, "ARTICLE X")
  .replace(/ARTICLE X11\b/g, "ARTICLE XII")
  .replace(/ARTICLE X1\b/g, "ARTICLE XI")
  .replace(/^4\.8\s+/m, "4.08 ")
  .replace(/^Maintenance Fees\.\s+/m, "10.01 Maintenance Fees. ")
  .replace(/^Assessments\.\s+/m, "10.02 Assessments. ");

const lines = text
  .split("\n")
  .map((l) => l.replace(/\s+/g, " ").trim())
  .filter(Boolean);

const blocks = [];
let current = "";

function flush() {
  if (current) {
    blocks.push(current.trim());
    current = "";
  }
}

for (const line of lines) {
  if (/^ARTICLE [IVX0-9]+$/i.test(line)) {
    flush();
    blocks.push(line);
    continue;
  }
  if (/^(MEMBERSHIP|TRANSFERABILITY|MEETINGS OF THE MEMBERS|BOARD OF DIRECTORS|COMMITTEES|OFFICERS|INDEMNIFICATION|FISCAL POLICIES|POLICIES, PLAN AND PROCEDURES|MAINTENANCE FEES|AMENDMENT OF BYLAWS|INTERPRETATION)$/.test(line)) {
    flush();
    blocks.push("TITLE:" + line);
    continue;
  }
  if (
    /^\d+\.\d{2}\s+[A-Z]/.test(line) &&
    !/^\d+\.\d{2}\s+hereof\b/i.test(line)
  ) {
    flush();
    current = line;
    continue;
  }
  if (/^FOURTH RESTATED BYLAWS/.test(line) || /^Pursuant to the provisions/.test(line)) {
    flush();
    current = line;
    continue;
  }
  if (
    (current.startsWith("9.01") || current.startsWith("LIST:")) &&
    /^(Annual |Accounting |Compensation |Termination |Business |Conflict |Travel |Delegation |Handling |Rights of |Data processing |Assessments,)/.test(line)
  ) {
    flush();
    current = "LIST:" + line;
    continue;
  }
  current = current ? current + " " + line : line;
}
flush();

const htmlParts = [];
for (const block of blocks) {
  if (/^ARTICLE /.test(block)) {
    const id = block.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "");
    htmlParts.push(`<h2 id="${id}">${escapeHtml(block)}</h2>`);
    continue;
  }
  if (block.startsWith("TITLE:")) {
    htmlParts.push(`<h3>${escapeHtml(block.slice(6))}</h3>`);
    continue;
  }
  if (block.startsWith("LIST:")) {
    const last = htmlParts[htmlParts.length - 1];
    const item = `<li>${escapeHtml(block.slice(5))}</li>`;
    if (last && last.startsWith("<ul>")) {
      htmlParts[htmlParts.length - 1] = last.replace("</ul>", `${item}</ul>`);
    } else {
      htmlParts.push(`<ul>${item}</ul>`);
    }
    continue;
  }
  const sec = block.match(/^(\d+\.\d{2})\s+(.+)$/);
  if (sec) {
    const id = "bylaw-" + sec[1].replace(".", "-");
    htmlParts.push(`<h3 id="${id}">${escapeHtml(sec[1])}</h3>`);
    htmlParts.push(`<p>${escapeHtml(sec[2])}</p>`);
    continue;
  }
  htmlParts.push(`<p>${escapeHtml(block)}</p>`);
}

const articleHtml = htmlParts.join("\n");

const indexLinks = `          <a href="policy-section-1.html">1. PURPOSE AND AUTHORITY</a>
          <a href="policy-section-2.html">2. DEFINITIONS</a>
          <a href="policy-section-3.html">3. USE RIGHTS AND PRIVILEGES</a>
          <a href="policy-section-4.html">4. USE OF FACILITIES</a>
          <a href="policy-section-5.html">5. CONDO RESERVATIONS</a>
          <a href="policy-section-6.html">6. RV PARK RESERVATIONS</a>
          <a href="policy-section-7.html">7. RV STORAGE AREAS</a>
          <a href="policy-section-8.html">8. FAMILY REUNION AREAS (FRA)</a>
          <a href="policy-section-9.html">9. WILDERNESS AREA</a>
          <a href="policy-section-10.html">10. GUEST POLICY</a>
          <a href="policy-section-11.html">11. CONDO RENTAL</a>
          <a href="policy-section-12.html">12. PET POLICY</a>
          <a href="policy-section-13.html">13. OHV/ATV/UTV POLICY</a>
          <a href="policy-section-14.html">14. CONDUCT</a>
          <a href="policy-section-15.html">15. FINES, FEES, AND ASSESSMENTS</a>
          <a href="policy-section-16.html">16. APPEAL OR CONTEST</a>
          <a href="policy-section-17.html">17. RIGHT TO IMPOSE FINES</a>
          <a href="policy-appendix.html">Appendix</a>
          <a href="policy-bylaws.html" class="active">Bylaws</a>`;

const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fourth Restated Bylaws | East Canyon Resort</title>
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
        <a href="login.html">Members</a>
      </nav>
    </div>
  </header>
  <main>
    <div class="container policy-layout">
      <aside class="policy-index">
        <h2 class="policy-index-title">Index</h2>
        <nav class="policy-index-nav" aria-label="Rule book sections">
${indexLinks}
        </nav>
        <p class="policy-index-back"><a href="member-home.html">Back to Members</a></p>
      </aside>
      <section class="policy-main">
        <h1>Fourth Restated Bylaws</h1>
        <p class="policy-section-nav"><a href="policy-appendix.html">Previous</a></p>
        <form class="policy-search" id="policy-search-form" role="search">
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
        </form>
        <p class="policy-intro">
          Adopted October 9, 2025.
          <a href="files/policies/fourth-restated-bylaws.pdf" target="_blank" rel="noopener noreferrer">Download PDF</a>
        </p>
        <article class="policy-document">
${articleHtml}
        </article>
        <p class="policy-section-nav"><a href="policy-appendix.html">Previous</a></p>
      </section>
    </div>
  </main>
  <script src="js/policy-search.js?v=1"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, "policy-bylaws.html"), page, "utf8");
console.log("Wrote policy-bylaws.html", articleHtml.length, "chars of body");
