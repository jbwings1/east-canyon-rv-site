const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readShellFrom(file, articleHtml, title, activeFile, prev, next) {
  let html = fs.readFileSync(path.join(root, file), "utf8");
  // Replace title
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)} | East Canyon Resort</title>`);
  // Replace h1
  html = html.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${escapeHtml(title)}</h1>`);
  // Active class in index
  html = html.replace(
    /class="active"/g,
    ""
  );
  html = html.replace(
    new RegExp(`(<a href="${activeFile}")`),
    `$1 class="active"`
  );
  // Section nav
  const navBits = [];
  if (prev) navBits.push(`<a href="${prev.href}">${prev.label}</a>`);
  if (next) navBits.push(`<a href="${next.href}">${next.label}</a>`);
  const nav = navBits.length
    ? `<p class="policy-section-nav">${navBits.join(" | ")}</p>`
    : "";
  html = html.replace(
    /<p class="policy-section-nav">[\s\S]*?<\/p>/g,
    nav
  );
  // Article body
  html = html.replace(
    /<article class="policy-document">[\s\S]*?<\/article>/,
    `<article class="policy-document">\n${articleHtml}\n        </article>`
  );
  return html;
}

const section17Body = `<h3 id="sec-17-1">17.1. Right to Impose Fines</h3>
<p>ECR reserves the right to impose a fine regarding any alleged violation of the Rules outlined in this Rule Book regardless of whether or not the fine is outlined in the Fee Schedule.</p>
<p>See <a href="policy-appendix.html#appendix-a">Appendix A - Penalty Summary</a> for listed fines.</p>`;

const penaltyRows = [
  ["1.1", "For any violation with no specified penalty", "$50"],
  ["3.3", "Unaccompanied Guest", "$500"],
  ["4.1.8", "Fines according to offense - minimum fine", "$50"],
  ["4.1.9", "Late Checkout - up to 4 hours unless prior arrangements are made", "$50"],
  ["4.1.9", "Late Checkout - up to 5:00 pm", "$100"],
  ["4.1.9", "Late Checkout - up to close of the check-out desk", "$500"],
  ["4.1.9", "Late Checkout - each additional day", "$500"],
  ["4.1.10", "1st violation", "$50"],
  ["4.1.10", "Any additional violations", "$100"],
  ["4.1.11", "Per violation", "$50"],
  ["4.1.12", "Parking infraction", "$50"],
  ["4.1.12", "Blocking Wilderness road - towing cost plus up to", "$1,000"],
  ["4.1.14", "Per violation", "$50"],
  ["4.1.19", "Smoking - per incident for non-compliance of posted restrictions up to", "$500"],
  ["4.1.20", "Fires - per incident, all costs and damages related to the fire plus", "$1,000"],
  ["4.1.21", "Damage - minimum per violation", "$500"],
  ["4.1.24", "Check-In - 1st offense", "$500"],
  ["4.1.24", "Check-In - 2nd offense, add 1 year suspension", "$1,000"],
  ["4.2.1", "Hunting - may result in eviction, suspension of hunting privileges up to the end of the following year, possible suspension of up to all ECR privileges, and an immediate fine of", "$500"],
  ["4.2.2", "Immediate fine", "$500"],
  ["4.2.3", "Firearms - immediate fine", "$500"],
  ["4.2.4", "Poaching - immediate fine", "$500"],
  ["4.2.5", "Trespassing - possible suspension of usage of some or all ECR privileges or possible termination of membership, and", "$500"],
  ["4.2.6", "Overnight parking in undesignated wilderness areas", "$500"],
  ["4.5.5", "Pool/Hot Tub - per violation", "$100"],
  ["4.7.1", "Overnight over limit fee per person", "$50"],
  ["4.7.2", "Parking - per violation", "$50"],
  ["4.9.3", "Parking - no parking on RV Park access roads", "$500"],
  ["4.9.5", "Per night", "$100"],
  ["4.9.9", "Utility hookups may be disconnected without notice and the offender may be asked to leave the Resort, and per violation penalty of", "$50"],
  ["4.9.10", "Any cost associated with sanitizing the water system, plus", "$500"],
  ["4.9.11", "No coverings on grass", "$100"],
  ["4.9.12", "Per violation", "$50"],
  ["4.9.13", "Cost to repair any damage, plus", "$100"],
  ["4.11", "Unaccompanied Guest", "$500"],
  ["5.1.10", "Cancellation regular time - on 2nd offense and thereafter in the same fiscal year, add suspension of reservations for 30 days; on holidays, add $50", "$75"],
  ["5.2.3", "No show bonus time - on 2nd offense and thereafter in the same fiscal year, add suspension of reservations for 30 days; on holidays, add $50", "$100"],
  ["5.2.4", "Cancellation bonus time - first untimely cancellation", "$75"],
  ["5.2.4", "Cancellation bonus time - second untimely cancellation and any thereafter in the same fiscal year, add suspension of reservations for 30 days; on holidays, add $50", "$100"],
  ["6.5", "Unoccupied site - per night", "$100"],
  ["6.5", "Per night", "$50"],
  ["6.5", "Holiday additional per night", "$50*"],
  ["6.6", "No show RV park - per night", "$100"],
  ["6.7", "RV cancellation less than two calendar days", "$75*"],
  ["6.7", "Holiday additional", "$50*"],
  ["7.1", "Long Term storage (added November 14, 2024)", "$250 per month"],
  ["7.4", "Short term - each night", "$50"],
  ["7.5", "Parking Pass", "$50"],
  ["8.1", "FRA RV limit exceeded - per RV, per day", "$150"],
  ["8.3", "Family Reunion Area violations", "$1,000"],
  ["8.4.1", "Cancellation less than 21 days - per each day or night of the cancelled reservation, plus holiday additional per day $50*", "Total of reservation plus $85-$125"],
  ["8.6", "FRA power outlets - per violation", "$500"],
  ["9.1.1", "Unattended site - per night", "$100"],
  ["9.3", "Wilderness occupancy limit - per guest per night", "$50"],
  ["9.7.1", "Tenting in undesignated area", "$100"],
  ["12.1", "Cost of cleaning and/or repair of damage, plus per-pet-per-day penalty of", "(see rule)"],
  ["12.2.1", "Per day", "$100"],
  ["12.2.4", "Per violation", "$50"],
  ["13.1.2.1", "Per violation", "$250"],
  ["13.3", "Per violation", "$100"],
  ["13.3.1(a)", "Per month (added November 14, 2024)", "(see rule)"],
  ["13.3.2", "Per violation", "$100"],
  ["13.6", "Designated trails", "$250"],
  ["13.7", "Per violation", "$50"],
  ["14.1", "Disorderly Conduct - eviction and/or suspension of Resort use for 6 months or more and/or report to law enforcement; Board may consider further action up to termination; plus per violation penalty of up to", "(see rule)"],
  ["14.2", "Alcohol/Drug Policy - eviction and/or suspension of Resort use for 6 months or more and/or report to law enforcement, plus per violation penalty of", "(see rule)"],
];

const tableRows = penaltyRows
  .map(
    ([section, desc, amount]) =>
      `            <tr>
              <td>${escapeHtml(section)}</td>
              <td>${escapeHtml(desc)}</td>
              <td>${escapeHtml(amount)}</td>
            </tr>`
  )
  .join("\n");

// Format Appendix C from extract
const appcRaw = fs.readFileSync(path.join(root, "docs", "extract-appc.txt"), "utf8");
function formatAppendixC(text) {
  let t = text
    .replace(/\r\n/g, "\n")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Drop title line; page will have h2
  t = t.replace(/^Appendix C[^\n]*\n(?:Regulations\n)?/, "");

  const blocks = [];
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  let buf = "";
  const flush = () => {
    if (buf) blocks.push(buf.trim());
    buf = "";
  };

  for (const line of lines) {
    if (
      /^C-\d+/.test(line) ||
      /^Permit Restrictions:/.test(line) ||
      /^Annual Fees per Hunter:/.test(line)
    ) {
      flush();
      buf = line;
      continue;
    }
    if (!buf) buf = line;
    else if (/[-–—]$/.test(buf)) buf = buf.replace(/[-–—]$/, "") + line;
    else buf += " " + line;
  }
  flush();

  function bodyToHtml(body) {
    if (!body) return "";
    const bulletSplit = body.split(/\s*[•*]\s+/).map((s) => s.trim()).filter(Boolean);
    if (bulletSplit.length > 1 && (/^[•*]/.test(body.trim()) || body.includes(" • ") || body.includes(" *"))) {
      const lead = /^[•*]/.test(body.trim()) ? "" : bulletSplit.shift();
      const list = `<ul>\n${bulletSplit.map((i) => `  <li>${escapeHtml(i)}</li>`).join("\n")}\n</ul>`;
      return (lead ? `<p>${escapeHtml(lead)}</p>\n` : "") + list;
    }
    return `<p>${escapeHtml(body)}</p>`;
  }

  return blocks
    .map((block) => {
      const m = block.match(/^(C-\d+[A-Za-z0-9-]*)\s*:\s*(.*)$/);
      if (m) {
        let rest = m[2].trim();
        let title = rest;
        let body = "";
        const named = rest.match(/^([^:*•.]{3,60}?):\s+([\s\S]+)$/);
        if (named) {
          title = named[1].trim();
          body = named[2].trim();
        } else {
          const cut = rest.indexOf(". ");
          if (cut > 0 && cut < 70) {
            title = rest.slice(0, cut + 1).trim();
            body = rest.slice(cut + 2).trim();
          } else {
            title = rest.length > 70 ? rest.slice(0, 70).trim() + "..." : rest;
            body = rest.length > 70 ? rest : "";
            if (body === rest) body = "";
          }
        }
        const heading = `${m[1]}: ${title}`.replace(/:\s*$/, "");
        return `<h3 id="${escapeHtml(m[1].toLowerCase())}">${escapeHtml(heading)}</h3>\n${bodyToHtml(body)}`;
      }
      if (/^(Permit Restrictions:|Annual Fees per Hunter:)/.test(block)) {
        return `<h3>${escapeHtml(block.replace(/:$/, ""))}</h3>`;
      }
      return bodyToHtml(block);
    })
    .join("\n");
}

const appendixBody = `<h2 id="appendix-a">Appendix A - Penalty Summary</h2>
<p>Listed fines from the East Canyon Resort Rules and Regulations. Amounts marked with * follow the Rule Book holiday/add-on notes.</p>
<div class="policy-table-wrap">
          <table class="policy-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Description</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
${tableRows}
            </tbody>
          </table>
        </div>
<h2 id="appendix-c">Appendix C - Wildlife Hunting Rules &amp; Regulations</h2>
${formatAppendixC(appcRaw)}
<p class="policy-note">Appendix B (fees) is referenced in the Rule Book. Add it here when you want that schedule posted on this site.</p>`;

const sec17Html = readShellFrom(
  "policy-section-17.html",
  section17Body,
  "17. RIGHT TO IMPOSE FINES",
  "policy-section-17.html",
  { href: "policy-section-16.html", label: "Previous" },
  { href: "policy-appendix.html", label: "Next" }
);

const appendixHtml = readShellFrom(
  "policy-appendix.html",
  appendixBody,
  "Appendix",
  "policy-appendix.html",
  { href: "policy-section-17.html", label: "Previous" },
  null
);

fs.writeFileSync(path.join(root, "policy-section-17.html"), sec17Html, "utf8");
fs.writeFileSync(path.join(root, "policy-appendix.html"), appendixHtml, "utf8");

// Keep full source from re-including Index/Appendix under section 17
const fullPath = path.join(root, "docs", "policies-and-rules-full.html");
if (fs.existsSync(fullPath)) {
  let full = fs.readFileSync(fullPath, "utf8");
  full = full.replace(
    /(<h2 id="sec-17">[\s\S]*?<\/h2>)[\s\S]*?(?=<h2\b|$)/,
    `$1\n${section17Body}\n`
  );
  fs.writeFileSync(fullPath, full, "utf8");
}

console.log("Fixed policy-section-17.html and policy-appendix.html");
