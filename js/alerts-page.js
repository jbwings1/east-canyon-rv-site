/**
 * Current Alerts page — list every active site alert (full list; banner rotates separately).
 */
(async function () {
  const root = document.getElementById("alerts-root");
  const status = document.getElementById("alerts-status");
  if (!root) return;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  if (!window.ecrSupabase) {
    if (status) {
      status.hidden = false;
      status.textContent = "Alerts could not be loaded right now.";
    }
    return;
  }

  try {
    const { data, error } = await window.ecrSupabase
      .from("site_alerts")
      .select("id,body,sort_order,updated_at")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const alerts = (data || []).filter((a) => String(a.body || "").trim());
    if (!alerts.length) {
      if (status) {
        status.hidden = false;
        status.textContent = "There are no current alerts.";
      }
      root.innerHTML = "";
      return;
    }

    root.innerHTML = `<div class="alerts-page-list">${alerts
      .map(
        (a, i) => `<article class="alerts-page-item">
        <h2 class="alerts-page-heading">Alert ${i + 1}${
          alerts.length > 1 ? ` of ${alerts.length}` : ""
        }</h2>
        <p>${escapeHtml(a.body)}</p>
      </article>`
      )
      .join("")}</div>`;

    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
  } catch (err) {
    if (status) {
      status.hidden = false;
      status.textContent = "Alerts could not be loaded right now.";
    }
    console.error(err);
  }
})();
