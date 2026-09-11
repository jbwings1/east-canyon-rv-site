/**
 * Admin View Reservations — list all bookings; Edit/Cancel when manage task assigned.
 * Flags bookings that violate membership class rules.
 */
(async function () {
  const me = await AdminCommon.requireAdmin("reservations_view");
  if (!me) return;

  const bookingsBody = document.getElementById("admin-bookings-body");
  const message = document.getElementById("admin-message");
  const canManage = Auth.hasAdminTask("reservations_manage");
  const manageHint = document.getElementById("admin-manage-hint");

  if (manageHint) {
    manageHint.hidden = false;
    manageHint.innerHTML = canManage
      ? `You can <strong>Edit</strong> or <strong>Cancel</strong> below, or open <a href="admin-reservations-manage.html">Manage reservations</a>. Bookings that break class rules show a <strong>Class flag</strong>.`
      : `This list is view-only. Cancel and edit are on <a href="admin-reservations-manage.html">Manage reservations</a> (requires the Manage reservations task). Bookings that break class rules show a <strong>Class flag</strong>.`;
  }

  function memberIdForUser(profiles, userId) {
    return profiles.find((p) => p.id === userId)?.member_id || "";
  }

  function classFlagForBooking(booking, bookings, profiles) {
    if (typeof MembershipRights === "undefined" || !booking) {
      return { ok: true, message: "" };
    }
    if (booking.status === "cancelled") return { ok: true, message: "" };
    const memberBookings = bookings.filter((b) => b.user_id === booking.user_id);
    const gate = MembershipRights.evaluateExistingBooking(
      booking,
      memberBookings,
      memberIdForUser(profiles, booking.user_id)
    );
    return {
      ok: gate.ok,
      message: MembershipRights.formatViolations(gate.violations),
    };
  }

  function classFlagMarkup(flag) {
    if (flag.ok) return "";
    return `<span class="admin-class-flag" title="${AdminCommon.escapeHtml(flag.message)}">Class flag</span>
      <span class="admin-class-flag-detail">${AdminCommon.escapeHtml(flag.message)}</span>`;
  }

  try {
    const [profiles, bookings] = await Promise.all([
      Auth.listAllProfiles(),
      Auth.listAllBookings(),
    ]);
    if (!bookings.length) {
      bookingsBody.innerHTML = `<tr><td colspan="7">No bookings yet.</td></tr>`;
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const sorted = [...bookings].sort((a, b) => {
      const aIn = a.check_in || "";
      const bIn = b.check_in || "";
      if (aIn !== bIn) return aIn < bIn ? -1 : 1;
      return 0;
    });

    const flaggedCount = sorted.filter(
      (b) => !classFlagForBooking(b, bookings, profiles).ok
    ).length;
    if (flaggedCount && message) {
      AdminCommon.showMessage(
        message,
        `${flaggedCount} booking${flaggedCount === 1 ? "" : "s"} flagged for class rule issues.`,
        "error"
      );
    }

    bookingsBody.innerHTML = sorted
      .map((b) => {
        const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
        const dates = b.check_in && b.check_out ? `${b.check_in} → ${b.check_out}` : "—";
        const conf = Auth.bookingConfirmationId(b);
        const member = AdminCommon.memberLabel(profiles, b.user_id);
        const past = b.check_out && b.check_out < today;
        const canCancel = canManage && b.status !== "cancelled";
        const canEdit = canManage && b.status !== "cancelled";
        const flag = classFlagForBooking(b, bookings, profiles);
        const rowClass = [
          past && b.status !== "cancelled" ? "admin-booking-past" : "",
          flag.ok ? "" : "admin-row-class-flag",
        ]
          .filter(Boolean)
          .join(" ");
        const actions = canManage
          ? `<td class="admin-actions admin-booking-actions">
              ${
                canEdit
                  ? `<a class="btn btn-outline btn-small" href="admin-reservations-manage.html?edit=${encodeURIComponent(b.id)}">Edit</a>`
                  : ""
              }
              ${
                canCancel
                  ? `<button type="button" class="btn btn-primary btn-small" data-action="cancelled" data-booking-id="${AdminCommon.escapeHtml(b.id)}" data-label="${AdminCommon.escapeHtml(conf + " · " + member)}">Cancel</button>`
                  : `<span class="admin-help">—</span>`
              }
            </td>`
          : `<td><span class="admin-help">View only</span></td>`;
        return `<tr class="${rowClass}">
          <td><code>${AdminCommon.escapeHtml(conf)}</code>${classFlagMarkup(flag)}</td>
          <td>${AdminCommon.escapeHtml(member)}</td>
          <td>${AdminCommon.escapeHtml(type)}</td>
          <td>${AdminCommon.escapeHtml(b.spot || "—")}</td>
          <td>${AdminCommon.escapeHtml(dates)}</td>
          <td><span class="status-pill ${
            b.status === "confirmed" ? "available" : b.status === "cancelled" ? "booked" : "partial"
          }">${AdminCommon.escapeHtml(b.status || "—")}</span></td>
          ${actions}
        </tr>`;
      })
      .join("");
  } catch (err) {
    AdminCommon.showMessage(message, err.message, "error");
    bookingsBody.innerHTML = `<tr><td colspan="7">${AdminCommon.escapeHtml(err.message)}</td></tr>`;
  }

  bookingsBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='cancelled']");
    if (!button || !canManage) return;
    const id = button.getAttribute("data-booking-id");
    const label = button.getAttribute("data-label") || "this reservation";
    if (!confirm(`Cancel ${label}?`)) return;
    button.disabled = true;
    try {
      await Auth.updateBookingStatus(id, "cancelled");
      AdminCommon.showMessage(message, "Booking cancelled.", "success");
      window.location.reload();
    } catch (err) {
      AdminCommon.showMessage(message, err.message, "error");
      button.disabled = false;
    }
  });
})();
