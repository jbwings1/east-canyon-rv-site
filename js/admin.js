/**
 * Admin MVP — list members and bookings; confirm or cancel bookings.
 * Promote the first admin in SQL (service role / dashboard), never from the browser:
 *   update profiles set is_admin = true where email = 'you@example.com';
 */
(async function () {
  const denied = document.getElementById("admin-denied");
  const app = document.getElementById("admin-app");
  const message = document.getElementById("admin-message");
  const membersBody = document.getElementById("admin-members-body");
  const bookingsBody = document.getElementById("admin-bookings-body");

  function showMessage(text, type) {
    message.textContent = text;
    message.className = type ? `form-message ${type}` : "form-message";
  }

  const sessionUser = Auth.getCurrentUser();
  if (!sessionUser) {
    window.location.replace("login.html?next=admin.html");
    return;
  }

  try {
    await Auth.ready();
  } catch {
    /* cached profile */
  }

  const user = Auth.getCurrentUser();
  if (!Auth.isAdmin(user)) {
    denied.hidden = false;
    app.hidden = true;
    return;
  }

  denied.hidden = true;
  app.hidden = false;
  Auth.showAdminLinks();

  let profiles = [];
  let bookings = [];

  function memberLabel(userId) {
    const profile = profiles.find((p) => p.id === userId);
    if (!profile) return userId ? userId.slice(0, 8) : "—";
    return profile.full_name || profile.email || userId.slice(0, 8);
  }

  function renderMembers() {
    if (!profiles.length) {
      membersBody.innerHTML = `<tr><td colspan="6">No members yet.</td></tr>`;
      return;
    }
    membersBody.innerHTML = profiles
      .map((p) => {
        const type = Auth.reservationTypeLabel(p.reservation_type) || "—";
        const complete = p.profile_complete ? "Complete" : "Incomplete";
        return `<tr>
          <td>${escapeHtml(p.full_name || "—")}</td>
          <td>${escapeHtml(p.email || "—")}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(p.phone || "—")}</td>
          <td>${escapeHtml(p.assigned_spot || "—")}</td>
          <td>${complete}</td>
        </tr>`;
      })
      .join("");
  }

  function renderBookings() {
    if (!bookings.length) {
      bookingsBody.innerHTML = `<tr><td colspan="6">No bookings yet.</td></tr>`;
      return;
    }
    bookingsBody.innerHTML = bookings
      .map((b) => {
        const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
        const dates = b.check_in && b.check_out ? `${b.check_in} → ${b.check_out}` : "—";
        const canConfirm = b.status !== "confirmed";
        const canCancel = b.status !== "cancelled";
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function load() {
    try {
      [profiles, bookings] = await Promise.all([Auth.listAllProfiles(), Auth.listAllBookings()]);
      renderMembers();
      renderBookings();
    } catch (err) {
      showMessage(err.message, "error");
      membersBody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
      bookingsBody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  bookingsBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
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
