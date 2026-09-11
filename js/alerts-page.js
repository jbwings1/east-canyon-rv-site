/**
 * Current Alerts page — list all active site alerts.
 */
(async function () {
  const root = document.getElementById("alerts-root");
  const status = document.getElementById("alerts-status");
  if (!root || !window.ecrSupabase) return;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
    root.innerHTML = `<ul class="alerts-list">${alerts
      .map((a) => `<li>${escapeHtml(a.body)}</li>`)
      .join("")}</ul>`;
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
