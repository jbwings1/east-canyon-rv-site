(async function () {
  const summary = document.getElementById("view-summary");
  const message = document.getElementById("view-message");
  const actions = document.getElementById("view-actions");
  const editLink = document.getElementById("view-edit-link");
  const deleteLink = document.getElementById("view-delete-link");
  const bookingId = new URLSearchParams(window.location.search).get("id");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showMessage(text, type) {
    message.textContent = text || "";
    message.className = type ? `form-message ${type}` : "form-message";
  }

  function formatSiteDetails(spotId) {
    if (typeof window.SpotAvailability?.formatSiteDetails === "function") {
      return window.SpotAvailability.formatSiteDetails(spotId);
    }
    return spotId ? `Site ID ${spotId}` : "No site selected";
  }

  function bookedByLabel(booking) {
    if (booking.booked_by_kind === "admin") return "ECR admin";
    if (booking.booked_by_kind === "member") return "Member";
    return "Unknown";
  }

  function formatBookedOn(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function bookingWasEdited(booking) {
    if (!booking?.edited_at || !booking?.created_at) return false;
    const edited = new Date(booking.edited_at).getTime();
    const created = new Date(booking.created_at).getTime();
    return Number.isFinite(edited) && Number.isFinite(created) && edited > created;
  }

  function formatBookedEditedLine(booking) {
    const booked = formatBookedOn(booking.created_at);
    if (!bookingWasEdited(booking)) return booked;
    return `${booked} · Edited — ${formatBookedOn(booking.edited_at)}`;
  }

  const user = Auth.redirectForAuth({
    requireMember: true,
    loginPage: `login.html?next=${encodeURIComponent(
      `reservation-view.html${bookingId ? `?id=${bookingId}` : ""}`
    )}`,
  });
  if (!user) return;

  if (!bookingId) {
    showMessage("Missing reservation.", "error");
    return;
  }

  try {
    await Auth.ready();
  } catch {
    /* ignore */
  }

  let bookings = [];
  try {
    bookings = await Auth.listBookings();
  } catch (err) {
    showMessage(err.message, "error");
    return;
  }

  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) {
    showMessage("Reservation not found.", "error");
    summary.innerHTML = `<div><dt>Error</dt><dd>That reservation is not on your account.</dd></div>`;
    return;
  }

  const today = window.SpotAvailability.getToday();
  const editable =
    booking.status !== "cancelled" && booking.check_out && booking.check_out >= today;

  const rows = [
    ["Type", Auth.reservationTypeLabel(booking.reservation_type) || "—"],
    ["Status", booking.status || "—"],
    ["Booked by", bookedByLabel(booking)],
    ["Booked", formatBookedEditedLine(booking)],
    ["Confirmation #", Auth.bookingConfirmationId(booking)],
    [
      "Stay dates",
      booking.check_in && booking.check_out
        ? window.SpotAvailability.formatDateRange(booking.check_in, booking.check_out)
        : "—",
    ],
    ["Site", formatSiteDetails(booking.spot)],
    ["Notes", booking.notes || ""],
  ].filter(([, value]) => String(value || "").trim());

  summary.innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join("");

  actions.hidden = false;
  if (editable) {
    editLink.hidden = false;
    deleteLink.hidden = false;
    editLink.href = `reservation-edit.html?id=${encodeURIComponent(bookingId)}`;
    deleteLink.href = `reservation-delete.html?id=${encodeURIComponent(bookingId)}`;
  }
})();
