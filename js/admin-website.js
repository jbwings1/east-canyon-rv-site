/**
 * Admin Website — manage multiple site alerts (create, edit, reorder, delete).
 */
(async function () {
  const me = await AdminCommon.requireAdmin("website");
  if (!me) return;

  const result = document.getElementById("admin-alert-result");
  const form = document.getElementById("admin-alert-form");
  const listEl = document.getElementById("admin-alert-list");
  const listStatus = document.getElementById("admin-alert-list-status");

  let alerts = [];

  function escapeHtml(value) {
    return AdminCommon.escapeHtml(value);
  }

  function renderList() {
    if (!listEl) return;
    if (!alerts.length) {
      listEl.innerHTML = '<p class="admin-help">No alerts yet. Add one above.</p>';
      listStatus.textContent = "0 alerts";
      return;
    }
    listEl.innerHTML = alerts
      .map((alert, index) => {
        const body = escapeHtml(alert.body || "");
        const active = alert.active !== false;
        return `<article class="admin-alert-item" data-id="${alert.id}">
          <label class="admin-gallery-field">
            <span>Alert text</span>
            <textarea class="alert-body-input" rows="3">${body}</textarea>
          </label>
          <label class="admin-check">
            <input type="checkbox" class="alert-active-input"${active ? " checked" : ""}>
            Show on site banner
          </label>
          <div class="admin-actions">
            <button type="button" class="btn-link alert-move-up"${
              index === 0 ? " disabled" : ""
            }>Up</button>
            <button type="button" class="btn-link alert-move-down"${
              index === alerts.length - 1 ? " disabled" : ""
            }>Down</button>
            <button type="button" class="btn-link alert-save">Save</button>
            <button type="button" class="btn-link alert-delete">Delete</button>
          </div>
        </article>`;
      })
      .join("");
    const activeCount = alerts.filter((a) => a.active !== false).length;
    listStatus.textContent = `${alerts.length} alert${alerts.length === 1 ? "" : "s"} (${activeCount} active on banner)`;
    listStatus.className = "form-message";
  }

  async function loadAlerts() {
    listStatus.textContent = "Loading…";
    const { data, error } = await window.ecrSupabase
      .from("site_alerts")
      .select("id,body,active,sort_order,updated_at,created_at")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    alerts = data || [];
    renderList();
  }

  async function nextSortOrder() {
    if (!alerts.length) return 0;
    return Math.max(...alerts.map((a) => a.sort_order || 0)) + 1;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    AdminCommon.showMessage(result, "", "");
    try {
      const body = document.getElementById("alert-body").value.trim();
      if (!body) {
        AdminCommon.showMessage(result, "Enter alert text.", "error");
        return;
      }
      const payload = {
        body,
        active: document.getElementById("alert-active").checked,
        sort_order: await nextSortOrder(),
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await window.ecrSupabase.from("site_alerts").insert(payload);
      if (error) throw error;
      form.reset();
      document.getElementById("alert-active").checked = true;
      AdminCommon.showMessage(result, "Alert added. Banner rotates every 10 seconds when more than one is active.", "success");
      await loadAlerts();
    } catch (err) {
      AdminCommon.showMessage(result, err.message || String(err), "error");
    }
  });

  listEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const card = btn.closest(".admin-alert-item");
    if (!card) return;
    const id = card.dataset.id;
    const row = alerts.find((a) => a.id === id);
    if (!row) return;

    try {
      if (btn.classList.contains("alert-delete")) {
        if (!confirm("Delete this alert?")) return;
        const { error } = await window.ecrSupabase.from("site_alerts").delete().eq("id", id);
        if (error) throw error;
        await loadAlerts();
        return;
      }

      if (btn.classList.contains("alert-save")) {
        const body = card.querySelector(".alert-body-input")?.value.trim() || "";
        if (!body) {
          AdminCommon.showMessage(listStatus, "Alert text cannot be empty.", "error");
          return;
        }
        const active = !!card.querySelector(".alert-active-input")?.checked;
        const { error } = await window.ecrSupabase
          .from("site_alerts")
          .update({
            body,
            active,
            updated_by: me.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
        AdminCommon.showMessage(listStatus, "Alert saved.", "success");
        await loadAlerts();
        return;
      }

      if (btn.classList.contains("alert-move-up") || btn.classList.contains("alert-move-down")) {
        const index = alerts.findIndex((a) => a.id === id);
        const swapWith =
          btn.classList.contains("alert-move-up")
            ? alerts[index - 1]
            : alerts[index + 1];
        if (!swapWith) return;
        const aOrder = row.sort_order;
        const bOrder = swapWith.sort_order;
        const { error: e1 } = await window.ecrSupabase
          .from("site_alerts")
          .update({ sort_order: bOrder })
          .eq("id", row.id);
        if (e1) throw e1;
        const { error: e2 } = await window.ecrSupabase
          .from("site_alerts")
          .update({ sort_order: aOrder })
          .eq("id", swapWith.id);
        if (e2) throw e2;
        await loadAlerts();
      }
    } catch (err) {
      AdminCommon.showMessage(listStatus, err.message || String(err), "error");
    }
  });

  try {
    await loadAlerts();
  } catch (err) {
    AdminCommon.showMessage(listStatus, err.message || String(err), "error");
  }
})();
