const fs = require("fs");
const m = JSON.parse(fs.readFileSync("pix/gallery/live-download-manifest.json", "utf8"));
const site = m.saved.filter((n) => !n.startsWith("pdf-"));
const pdfs = m.saved.filter((n) => n.startsWith("pdf-"));
const imgs = (arr) =>
  arr.map((n) => `          <img src="pix/gallery/${n}" alt="East Canyon Resort">`).join("\n");
const html = `
      <section class="picture-group">
        <h2>From eastcanyon.com</h2>
        <div class="picture-gallery">
${imgs(site)}
        </div>
      </section>

      <section class="picture-group">
        <h2>From live-site documents</h2>
        <div class="picture-gallery">
${imgs(pdfs)}
        </div>
      </section>
`;
const page = fs.readFileSync("pictures.html", "utf8");
const marker = "      </section>\n    </div>\n  </main>";
if (!page.includes(marker)) {
  console.error("marker not found");
  process.exit(1);
}
if (page.includes("From eastcanyon.com")) {
  console.log("already inserted");
  process.exit(0);
}
fs.writeFileSync("pictures.html", page.replace(marker, "      </section>" + html + "    </div>\n  </main>"));
console.log("site", site.length, "pdf", pdfs.length);
