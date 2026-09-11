/**
 * Admin Manage Reservations — create, edit, confirm, cancel.
 */
(async function () {
  const me = await AdminCommon.requireAdmin("reservations_manage");
  if (!me) return;

  const bookingsBody = document.getElementById("admin-bookings-body");
  const bookingMember = document.getElementById("booking-member");
  const bookingType = document.getElementById("booking-type");
  const message = document.getElementById("admin-message");
  const createForm = document.getElementById("admin-create-booking-form");
  const editCard = document.getElementById("admin-edit-card");
  const editForm = document.getElementById("admin-edit-booking-form");
  const editResult = document.getElementById("admin-edit-booking-result");
  const editSummary = document.getElementById("admin-edit-summary");
  const filterStatus = document.getElementById("booking-filter-status");
  const filterSearch = document.getElementById("booking-filter-search");

  let profiles = [];
  let bookings = [];
  let editingId = null;

  function todayIso() {
    return new Date().toISOString().split("T")[0];
  }

  function uiType(dbType) {
    return Auth.toUiReservationType?.(dbType) || dbType || "rv";
  }

  function confirmationId(booking) {
    return Auth.bookingConfirmationId(booking);
  }

  function memberLabel(userId) {
    return AdminCommon.memberLabel(profiles, userId);
  }

  function renderBookingMemberOptions() {
    const current = bookingMember.value;
    bookingMember.innerHTML = `<option value="">Select member…</option>`;
    profiles
      .filter((m) => m.account_kind === "member" && m.account_status !== "closed")
      .forEach((m) => {
        const option = document.createElement("option");
        option.value = m.id;
        option.textContent = `${m.full_name || m.email}${m.member_id ? ` · ${m.member_id}` : ""}`;
        bookingMember.appendChild(option);
      });
    if (current) bookingMember.value = current;
  }

  function filteredBookings() {
    const statusFilter = filterStatus?.value || "active";
    const q = String(filterSearch?.value || "")
      .trim()
      .toLowerCase();
    const today = todayIso();

    return bookings
      .filter((b) => {
        if (statusFilter === "cancelled") return b.status === "cancelled";
        if (statusFilter === "active") {
          if (b.status === "cancelled") return false;
          if (b.check_out && b.check_out < today) return false;
          return true;
        }
        return true;
      })
      .filter((b) => {
        if (!q) return true;
        const label = memberLabel(b.user_id).toLowerCase();
        const conf = confirmationId(b).toLowerCase();
        const spot = String(b.spot || "").toLowerCase();
        return label.includes(q) || conf.includes(q) || spot.includes(q);
      })
      .sort((a, b) => {
        const aIn = a.check_in || "";
        const bIn = b.check_in || "";
        if (aIn !== bIn) return aIn < bIn ? -1 : 1;
        return String(a.created_at || "") < String(b.created_at || "") ? -1 : 1;
      });
  }

  function closeEdit() {
    editingId = null;
    if (editCard) editCard.hidden = true;
    editForm?.reset();
    AdminCommon.showMessage(editResult, "", "");
  }

  function openEdit(booking) {
    if (!booking || booking.status === "cancelled") return;
    editingId = booking.id;
    document.getElementById("edit-booking-id").value = booking.id;
    document.getElementById("edit-booking-type").value = uiType(booking.reservation_type);
    document.getElementById("edit-booking-spot").value = booking.spot || "";
    document.getElementById("edit-booking-check-in").value = booking.check_in || "";
    document.getElementById("edit-booking-check-out").value = booking.check_out || "";
    document.getElementById("edit-booking-notes").value = booking.notes || "";
    if (editSummary) {
      editSummary.textContent = `${confirmationId(booking)} · ${memberLabel(booking.user_id)}`;
    }
    if (editCard) {
      editCard.hidden = false;
      editCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    AdminCommon.showMessage(editResult, "", "");
  }

  function renderBookings() {
    const rows = filteredBookings();
    if (!rows.length) {
      bookingsBody.innerHTML = `<tr><td colspan="7">No bookings match this filter.</td></tr>`;
      return;
    }
    bookingsBody.innerHTML = rows
      .map((b) => {
        const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
        const dates = b.check_in && b.check_out ? `${b.check_in} → ${b.check_out}` : "—";
        const canConfirm = b.status !== "confirmed" && b.status !== "cancelled";
        const canCancel = b.status !== "cancelled";
        const canEdit = b.status !== "cancelled";
        return `<tr data-booking-id="${AdminCommon.escapeHtml(b.id)}">
          <td><code>${AdminCommon.escapeHtml(confirmationId(b))}</code></td>
          <td>${AdminCommon.escapeHtml(memberLabel(b.user_id))}</td>
          <td>${AdminCommon.escapeHtml(type)}</td>
          <td>${AdminCommon.escapeHtml(b.spot || "—")}</td>
          <td>${AdminCommon.escapeHtml(dates)}</td>
          <td><span class="status-pill ${
            b.status === "confirmed" ? "available" : b.status === "cancelled" ? "booked" : "partial"
          }">${AdminCommon.escapeHtml(b.status || "—")}</span></td>
          <td class="admin-actions admin-booking-actions">
            ${
              canEdit
                ? `<button type="button" class="btn btn-outline btn-small" data-action="edit">Edit</button>`
                : ""
            }
            ${
              canConfirm
                ? `<button type="button" class="btn btn-outline btn-small" data-action="confirmed">Confirm</button>`
                : ""
            }
            ${
              canCancel
                ? `<button type="button" class="btn btn-primary btn-small" data-action="cancelled">Cancel</button>`
                : ""
            }
          </td>
        </tr>`;
      })
      .join("");
  }

  async function load() {
    profiles = await Auth.listAllProfiles();
    bookings = await Auth.listAllBookings();
    renderBookingMemberOptions();
    renderBookings();
    if (editingId) {
      const still = bookings.find((b) => b.id === editingId);
      if (still && still.status !== "cancelled") openEdit(still);
      else closeEdit();
    }
  }

  function evaluateSelectedMemberRights() {
    if (typeof MembershipRights === "undefined") {
      return { ok: true, violations: [] };
    }
    const memberUserId = bookingMember.value;
    const profile = profiles.find((p) => p.id === memberUserId);
    const memberId = profile?.member_id || "";
    const reservationType = bookingType.value;
    const checkIn = document.getElementById("booking-check-in").value;
    const checkOut = document.getElementById("booking-check-out").value;
    const existing = bookings.filter((b) => b.user_id === memberUserId);
    return MembershipRights.validateBooking({
      memberId,
      reservationType,
      checkIn,
      checkOut,
      existingBookings: existing,
    });
  }

  function evaluateEditRights(booking) {
    if (typeof MembershipRights === "undefined" || !booking) {
      return { ok: true, violations: [] };
    }
    const profile = profiles.find((p) => p.id === booking.user_id);
    return MembershipRights.validateBooking({
      memberId: profile?.member_id || "",
      reservationType: document.getElementById("edit-booking-type").value,
      checkIn: document.getElementById("edit-booking-check-in").value,
      checkOut: document.getElementById("edit-booking-check-out").value,
      existingBookings: bookings.filter((b) => b.user_id === booking.user_id),
      excludeBookingId: booking.id,
    });
  }

  createForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("admin-create-booking-result");
    AdminCommon.showMessage(result, "", "");
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const gate = evaluateSelectedMemberRights();
      if (!gate.ok) {
        const limitText = MembershipRights.formatViolations(gate.violations);
        const override = await MembershipRights.showOverrideDialog(
          `${limitText} As an admin you may override this class limit, or start over.`
        );
        if (!override) {
          e.target.reset();
          AdminCommon.showMessage(result, "Started over — reservation not saved.", "");
          return;
        }
      }

      await Auth.createBookingForMember({
        memberUserId: document.getElementById("booking-member").value,
        reservationType: document.getElementById("booking-type").value,
        spot: document.getElementById("booking-spot").value.trim(),
        checkIn: document.getElementById("booking-check-in").value,
        checkOut: document.getElementById("booking-check-out").value,
        notes: document.getElementById("booking-notes").value.trim(),
      });
      AdminCommon.showMessage(result, "Reservation created for the member.", "success");
      e.target.reset();
      await load();
    } catch (err) {
      AdminCommon.showMessage(result, err.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    AdminCommon.showMessage(editResult, "", "");
    const id = document.getElementById("edit-booking-id").value;
    const booking = bookings.find((b) => b.id === id);
    if (!booking) {
      AdminCommon.showMessage(editResult, "Booking not found.", "error");
      return;
    }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const gate = evaluateEditRights(booking);
      if (!gate.ok) {
        const limitText = MembershipRights.formatViolations(gate.violations);
        const override = await MembershipRights.showOverrideDialog(
          `${limitText} As an admin you may override this class limit, or start over.`
        );
        if (!override) {
          AdminCommon.showMessage(editResult, "Edit cancelled — class limit not overridden.", "");
          return;
        }
      }
      await Auth.updateBookingAsAdmin(id, {
        reservationType: document.getElementById("edit-booking-type").value,
        spot: document.getElementById("edit-booking-spot").value.trim(),
        checkIn: document.getElementById("edit-booking-check-in").value,
        checkOut: document.getElementById("edit-booking-check-out").value,
        notes: document.getElementById("edit-booking-notes").value.trim(),
      });
      AdminCommon.showMessage(editResult, "Reservation updated.", "success");
      AdminCommon.showMessage(message, "Reservation updated.", "success");
      await load();
    } catch (err) {
      AdminCommon.showMessage(editResult, err.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.getElementById("admin-edit-cancel")?.addEventListener("click", () => {
    closeEdit();
  });

  filterStatus?.addEventListener("change", renderBookings);
  filterSearch?.addEventListener("input", renderBookings);

  bookingsBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("tr[data-booking-id]");
    if (!row) return;
    const id = row.getAttribute("data-booking-id");
    const booking = bookings.find((b) => b.id === id);
    const action = button.getAttribute("data-action");

    if (action === "edit") {
      if (booking) openEdit(booking);
      return;
    }

    if (action === "cancelled") {
      const label = booking
        ? `${confirmationId(booking)} (${memberLabel(booking.user_id)})`
        : "this reservation";
      if (!confirm(`Cancel ${label}? This cannot be undone from the member site.`)) return;
    }

    button.disabled = true;
    try {
      await Auth.updateBookingStatus(id, action);
      AdminCommon.showMessage(
        message,
        action === "confirmed" ? "Booking confirmed." : "Booking cancelled.",
        "success"
      );
      if (action === "cancelled" && editingId === id) closeEdit();
      await load();
    } catch (err) {
      AdminCommon.showMessage(message, err.message, "error");
      button.disabled = false;
    }
  });

  try {
    await load();
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      const booking = bookings.find((b) => b.id === editId);
      if (booking) openEdit(booking);
    }
  } catch (err) {
    AdminCommon.showMessage(message, err.message, "error");
  }
})();
