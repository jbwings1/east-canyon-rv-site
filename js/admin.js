/**
 * Admin desk — task-gated member provisioning, bookings, alerts, and staff.
 */
(async function () {
  const denied = document.getElementById("admin-denied");
  const app = document.getElementById("admin-app");
  const message = document.getElementById("admin-message");
  const membersBody = document.getElementById("admin-members-body");
  const bookingsBody = document.getElementById("admin-bookings-body");
  const staffBody = document.getElementById("admin-staff-body");
  const bookingMember = document.getElementById("booking-member");

  function showMessage(text, type) {
    if (!message) return;
    message.textContent = text;
    message.className = type ? `form-message ${type}` : "form-message";
  }

  function showLocal(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = type ? `form-message ${type}` : "form-message";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const sessionUser = Auth.getCurrentUser();
  if (!sessionUser) {
    window.location.replace("admin-login.html");
    return;
  }

  try {
    await Auth.ready();
  } catch {
    /* cached profile */
  }

  const isAdmin = await Auth.verifyAdmin();
  const me = Auth.getCurrentUser() || sessionUser;
  if (!isAdmin || me.accountKind !== "admin") {
    denied.hidden = false;
    app.hidden = true;
    return;
  }

  denied.hidden = true;
  app.hidden = false;
  Auth.showAdminLinks();

  const who = document.getElementById("admin-whoami");
  if (who) {
    const seat = me.adminSeat ? `${me.adminLevel}${me.adminSeat}` : `Level ${me.adminLevel || 1}`;
    who.textContent = `${me.name || me.email} · ${seat}${me.staffCode ? ` · ${me.staffCode}` : ""}. `;
  }

  document.querySelectorAll("[data-admin-task]").forEach((section) => {
    const task = section.getAttribute("data-admin-task");
    section.hidden = !Auth.hasAdminTask(task);
  });

  document.getElementById("admin-logout")?.addEventListener("click", () =>
    Auth.logout("admin-login.html")
  );

  let members = [];
  let staff = [];
  let bookings = [];

  function memberLabel(userId) {
    const profile = [...members, ...staff].find((p) => p.id === userId);
    if (!profile) return userId ? userId.slice(0, 8) : "—";
    const id = profile.member_id ? ` (${profile.member_id})` : "";
    return `${profile.full_name || profile.email || userId.slice(0, 8)}${id}`;
  }

  function renderMembers() {
    if (!Auth.hasAdminTask("members") && !Auth.hasAdminTask("reservations_view")) return;
    if (!membersBody) return;
    if (!members.length) {
      membersBody.innerHTML = `<tr><td colspan="6">No members yet.</td></tr>`;
      return;
    }
    membersBody.innerHTML = members
      .map((p) => {
        const status = p.account_status || "active";
        const password = p.must_change_password ? "Temp / change required" : "Set";
        return `<tr>
          <td>${escapeHtml(p.member_id || "—")}</td>
          <td>${escapeHtml(p.full_name || "—")}</td>
          <td>${escapeHtml(p.email || "—")}</td>
          <td>${escapeHtml(p.phone || "—")}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(password)}</td>
        </tr>`;
      })
      .join("");
  }

  function renderBookingMemberOptions() {
    if (!bookingMember) return;
    const current = bookingMember.value;
    bookingMember.innerHTML = `<option value="">Select member…</option>`;
    members
      .filter((m) => m.account_status !== "closed")
      .forEach((m) => {
        const option = document.createElement("option");
        option.value = m.id;
        option.textContent = `${m.full_name || m.email}${m.member_id ? ` · ${m.member_id}` : ""}`;
        bookingMember.appendChild(option);
      });
    if (current) bookingMember.value = current;
  }

  function renderBookings() {
    if (!bookingsBody) return;
    const canManage = Auth.hasAdminTask("reservations_manage");
    if (!bookings.length) {
      bookingsBody.innerHTML = `<tr><td colspan="6">No bookings yet.</td></tr>`;
      return;
    }
    bookingsBody.innerHTML = bookings
      .map((b) => {
        const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
        const dates = b.check_in && b.check_out ? `${b.check_in} → ${b.check_out}` : "—";
        const canConfirm = canManage && b.status !== "confirmed";
        const canCancel = canManage && b.status !== "cancelled";
        return `<tr data-booking-id="${escapeHtml(b.id)}">
          <td>${escapeHtml(memberLabel(b.user_id))}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(b.spot || "—")}</td>
          <td>${escapeHtml(dates)}</td>
          <td><span class="status-pill ${b.status === "confirmed" ? "available" : b.status === "cancelled" ? "booked" : "partial"}">${escapeHtml(b.status || "—")}</span></td>
          <td class="admin-actions">
            ${canConfirm ? `<button type="button" class="btn-link" data-action="confirmed">Confirm</button>` : ""}
            ${canCancel ? `<button type="button" class="btn-link" data-action="cancelled">Cancel</button>` : ""}
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderStaff() {
    if (!staffBody) return;
    if (!staff.length) {
      staffBody.innerHTML = `<tr><td colspan="5">No staff yet.</td></tr>`;
      return;
    }
    staffBody.innerHTML = staff
      .map((p) => {
        const levelSeat =
          p.admin_level != null
            ? `${p.admin_level}${p.admin_seat || ""}`
            : "—";
        const tasks = Array.isArray(p.admin_tasks) ? p.admin_tasks.join(", ") : "—";
        return `<tr>
          <td>${escapeHtml(p.staff_code || "—")}</td>
          <td>${escapeHtml(p.full_name || "—")}</td>
          <td>${escapeHtml(p.email || "—")}</td>
          <td>${escapeHtml(levelSeat)}</td>
          <td>${escapeHtml(p.admin_level === 1 ? "All tasks" : tasks || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadAlert() {
    if (!Auth.hasAdminTask("website")) return;
    const { data, error } = await window.ecrSupabase
      .from("site_alerts")
      .select("id,body,active")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const alert = data?.[0];
    if (!alert) return;
    const body = document.getElementById("alert-body");
    const active = document.getElementById("alert-active");
    if (body) body.value = alert.body || "";
    if (active) active.checked = alert.active !== false;
    document.getElementById("admin-alert-form").dataset.alertId = alert.id;
  }

  async function load() {
    try {
      const profiles = await Auth.listAllProfiles();
      members = profiles.filter((p) => p.account_kind === "member");
      staff = profiles.filter((p) => p.account_kind === "admin");
      if (Auth.hasAdminTask("reservations_view") || Auth.hasAdminTask("reservations_manage")) {
        bookings = await Auth.listAllBookings();
      }
      renderMembers();
      renderBookingMemberOptions();
      renderBookings();
      renderStaff();
      await loadAlert();
    } catch (err) {
      showMessage(err.message, "error");
      if (membersBody) {
        membersBody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
      }
      if (bookingsBody) {
        bookingsBody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
      }
    }
  }

  document.getElementById("admin-create-member-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("admin-create-member-result");
    showLocal(result, "", "");
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const payload = {
        kind: "member",
        member_id: document.getElementById("member-id-input").value.trim(),
        full_name: document.getElementById("member-name-input").value.trim(),
        email: document.getElementById("member-email-input").value.trim(),
        phone: document.getElementById("member-phone-input").value.trim(),
        address: document.getElementById("member-address-input").value.trim(),
        city: document.getElementById("member-city-input").value.trim(),
        state: document.getElementById("member-state-input").value.trim(),
        zip: document.getElementById("member-zip-input").value.trim(),
        temporary_password: document.getElementById("member-temp-password").value,
      };
      const created = await Auth.provisionUser(payload);
      showLocal(
        result,
        `Created ${created.email} (ID ${created.member_id}). Give them the temporary password to activate.`,
        "success"
      );
      e.target.reset();
      await load();
    } catch (err) {
      showLocal(result, err.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.getElementById("admin-create-booking-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("admin-create-booking-result");
    showLocal(result, "", "");
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await Auth.createBookingForMember({
        memberUserId: document.getElementById("booking-member").value,
        reservationType: document.getElementById("booking-type").value,
        spot: document.getElementById("booking-spot").value.trim(),
        checkIn: document.getElementById("booking-check-in").value,
        checkOut: document.getElementById("booking-check-out").value,
        notes: document.getElementById("booking-notes").value.trim(),
      });
      showLocal(result, "Reservation created for the member.", "success");
      e.target.reset();
      await load();
    } catch (err) {
      showLocal(result, err.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.getElementById("admin-create-staff-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("admin-create-staff-result");
    showLocal(result, "", "");
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const tasks = Array.from(
        document.querySelectorAll('input[name="staff-task"]:checked')
      ).map((el) => el.value);
      const created = await Auth.provisionUser({
        kind: "admin",
        full_name: document.getElementById("staff-name").value.trim(),
        email: document.getElementById("staff-email").value.trim(),
        phone: document.getElementById("staff-phone").value.trim(),
        admin_level: Number(document.getElementById("staff-level").value),
        admin_seat: document.getElementById("staff-seat").value.trim().toLowerCase(),
        staff_code: document.getElementById("staff-code").value.trim(),
        admin_tasks: tasks,
        temporary_password: document.getElementById("staff-temp-password").value,
      });
      showLocal(
        result,
        `Staff ${created.email} created (${created.staff_code}).`,
        "success"
      );
      e.target.reset();
      await load();
    } catch (err) {
      showLocal(result, err.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.getElementById("admin-alert-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("admin-alert-result");
    showLocal(result, "", "");
    try {
      const id = e.target.dataset.alertId;
      const body = document.getElementById("alert-body").value.trim();
      const active = document.getElementById("alert-active").checked;
      const payload = {
        body,
        active,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      };
      let error;
      if (id) {
        ({ error } = await window.ecrSupabase.from("site_alerts").update(payload).eq("id", id));
      } else {
        ({ error } = await window.ecrSupabase.from("site_alerts").insert(payload));
      }
      if (error) throw error;
      showLocal(result, "Alert saved. (Pages still use the static banner until they load this table.)", "success");
      await loadAlert();
    } catch (err) {
      showLocal(result, err.message || String(err), "error");
    }
  });

  bookingsBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (!Auth.hasAdminTask("reservations_manage")) {
      showMessage("You are not assigned reservations manage.", "error");
      return;
    }
    const row = button.closest("tr[data-booking-id]");
    if (!row) return;
    const status = button.getAttribute("data-action");
    button.disabled = true;
    try {
      await Auth.updateBookingStatus(row.getAttribute("data-booking-id"), status);
      showMessage(status === "confirmed" ? "Booking confirmed." : "Booking cancelled.", "success");
      await load();
    } catch (err) {
      showMessage(err.message, "error");
      button.disabled = false;
    }
  });

  await load();
})();
