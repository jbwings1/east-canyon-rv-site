(async function () {
  const body = document.getElementById("hub-reservations-body");
  const status = document.getElementById("hub-status");
  const signedOut = document.getElementById("hub-signed-out");
  const bookLink = document.getElementById("hub-book-link");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showStatus(text, type) {
    if (!status) return;
    status.textContent = text || "";
    status.className = type ? `form-message ${type}` : "form-message";
  }

  function formatSpotLabel(spotId) {
    if (!spotId) return "—";
    const unit = window.SpotAvailability?.findUnit?.(spotId);
    if (!unit) return spotId;
    if (unit.category === "condo") return `Condo ${unit.label}`;
    if (unit.category === "reunion") return unit.name || `Family site ${unit.label}`;
    return `Site ${unit.label}`;
  }

  function bookingIsEditable(booking) {
    if (!booking || booking.status === "cancelled") return false;
    const today = window.SpotAvailability.getToday();
    return Boolean(booking.check_out && booking.check_out >= today);
  }

  const params = new URLSearchParams(window.location.search);
  const ok = params.get("ok");
  if (ok === "created") showStatus("Reservation booked.", "success");
  if (ok === "updated") showStatus("Reservation updated.", "success");
  if (ok === "deleted") showStatus("Reservation deleted.", "success");
  if (ok && window.history.replaceState) {
    window.history.replaceState(null, "", "reservations.html");
  }

  const user = Auth.redirectForAuth({ requireMember: true });
  if (!user) return;

  try {
    await Auth.ready();
  } catch {
    /* cached profile is enough */
  }

  if (signedOut) signedOut.hidden = true;
  if (bookLink) bookLink.hidden = false;

  let bookings = [];
  try {
    bookings = await Auth.listBookings();
  } catch (err) {
    showStatus(err.message, "error");
    body.innerHTML = `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  if (!bookings.length) {
    body.innerHTML = `<tr><td colspan="5">No reservations yet. <a href="reservation-book.html">Book a new stay</a>.</td></tr>`;
    return;
  }

  body.innerHTML = bookings
    .map((b) => {
      const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
      const dates =
        b.check_in && b.check_out
          ? window.SpotAvailability.formatDateRange(b.check_in, b.check_out)
          : "—";
      const statusLabel = b.status || "—";
      const editable = bookingIsEditable(b);
      const actions = editable
        ? `<a class="btn-link" href="reservation-edit.html?id=${encodeURIComponent(b.id)}">Edit</a>
           <a class="btn-link" href="reservation-delete.html?id=${encodeURIComponent(b.id)}">Delete</a>`
        : statusLabel === "cancelled"
          ? `<span class="label-optional">Cancelled</span>`
          : `<span class="label-optional">Past stay</span>`;
      return `<tr>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(formatSpotLabel(b.spot))}</td>
        <td>${escapeHtml(dates)}</td>
        <td><span class="status-pill ${
          statusLabel === "confirmed"
            ? "available"
            : statusLabel === "cancelled"
              ? "booked"
              : "partial"
        }">${escapeHtml(statusLabel)}</span></td>
        <td class="admin-actions">${actions}</td>
      </tr>`;
    })
    .join("");
})();
