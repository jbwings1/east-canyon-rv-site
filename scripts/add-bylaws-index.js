const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [
  "policies-and-rules.html",
  ...Array.from({ length: 17 }, (_, i) => `policy-section-${i + 1}.html`),
  "policy-appendix.html",
];

const bylawsLink = `          <a href="policy-bylaws.html">Bylaws</a>`;

for (const name of files) {
  const file = path.join(root, name);
  let html = fs.readFileSync(file, "utf8");
  if (html.includes('href="policy-bylaws.html"')) {
    console.log("already has bylaws", name);
    continue;
  }

  if (html.includes('class="active"   >Appendix')) {
    html = html.replace(
      '<a href="policy-appendix.html" class="active"   >Appendix</a>',
      '<a href="policy-appendix.html" class="active">Appendix</a>\n' + bylawsLink
    );
  } else if (html.includes('<a href="policy-appendix.html">Appendix</a>')) {
    html = html.replace(
      '<a href="policy-appendix.html">Appendix</a>',
      '<a href="policy-appendix.html">Appendix</a>\n' + bylawsLink
    );
  } else {
    console.log("no appendix link", name);
    continue;
  }

  fs.writeFileSync(file, html);
  console.log("updated", name);
}
