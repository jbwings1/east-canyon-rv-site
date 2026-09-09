(async function () {
  const list = document.getElementById("hub-booking-list");
  const status = document.getElementById("hub-status");
  const notice = document.getElementById("hub-booking-notice");
  const bookLink = document.getElementById("hub-book-link");
  const adminNote = document.getElementById("hub-occupancy-admin-note");
  const occFrom = document.getElementById("occupancy-from");
  const occTo = document.getElementById("occupancy-to");
  const occBtn = document.getElementById("occupancy-check-btn");
  const occMsg = document.getElementById("occupancy-message");
  const occWrap = document.getElementById("occupancy-map-wrap");
  const occDetail = document.getElementById("occupancy-unit-detail");

  let bookings = [];
  let occupancyRows = [];
  let isAdmin = false;
  let mapReady = false;

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

  function showOccMsg(text, type) {
    if (!occMsg) return;
    occMsg.textContent = text || "";
    occMsg.className = type ? `form-message ${type}` : "form-message";
  }

  function formatSpotLabel(spotId) {
    if (!spotId) return "Not assigned yet";
    const unit = window.SpotAvailability?.findUnit?.(spotId);
    if (!unit) return spotId;
    if (unit.category === "condo") return `Condo ${unit.label}`;
    if (unit.category === "reunion") return unit.name || `Family site ${unit.label}`;
    return `Site ${unit.label}`;
  }

  function formatSiteDetails(spotId) {
    if (typeof window.SpotAvailability?.formatSiteDetails === "function") {
      return window.SpotAvailability.formatSiteDetails(spotId);
    }
    const unit = window.SpotAvailability?.findUnit?.(spotId);
    if (!unit) return spotId ? `Site ID ${spotId}` : "No site selected";
    return formatSpotLabel(spotId);
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

  function editChangeTooltip(booking) {
    if (!bookingWasEdited(booking)) return "Original booking";
    const summary = String(booking.last_edit_summary || "").trim();
    return summary || "Reservation was edited";
  }

  /** Same-line Booked · Edited with native title tooltips for the last change. */
  function formatBookedEditedLineHtml(booking) {
    const booked = formatBookedOn(booking.created_at);
    const tip = escapeHtml(editChangeTooltip(booking));
    if (!bookingWasEdited(booking)) {
      return `<span title="${tip}">${escapeHtml(booked)}</span>`;
    }
    const edited = formatBookedOn(booking.edited_at);
    return (
      `<span title="${tip}">${escapeHtml(booked)}</span>` +
      ` · Edited — <span title="${tip}">${escapeHtml(edited)}</span>`
    );
  }

  function confirmationId(booking) {
    return Auth.bookingConfirmationId(booking);
  }

  function bookingIsEditable(booking) {
    if (!booking || booking.status === "cancelled") return false;
    const today = window.SpotAvailability.getToday();
    return Boolean(booking.check_out && booking.check_out >= today);
  }

  function updateBookingNotice() {
    if (!notice) return;
    const active = Auth.getActiveBookings(bookings);
    const maxActive = window.RESERVATION_MAX_ACTIVE || 2;
    if (!active.length) {
      notice.hidden = true;
      notice.textContent = "";
      notice.classList.remove("stay-length-notice--limit");
      return;
    }
    const bookingLines = active
      .map((b) => {
        const range = window.SpotAvailability.formatDateRange(b.check_in, b.check_out);
        return `Confirmation #${confirmationId(b)} · ${range}`;
      })
      .join("; ");
    notice.hidden = false;
    if (active.length >= maxActive) {
      notice.classList.add("stay-length-notice--limit");
      notice.textContent =
        `You have ${active.length} upcoming reservations (maximum ${maxActive}): ${bookingLines}. ` +
        `Once you check in, or after deleting one, you can book again.`;
    } else {
      notice.classList.remove("stay-length-notice--limit");
      const remaining = maxActive - active.length;
      notice.textContent =
        `You have ${active.length} upcoming reservation${active.length === 1 ? "" : "s"} ` +
        `(${bookingLines}). You may book ${remaining} more before check-in.`;
    }
  }

  function renderBookings() {
    if (!list) return;
    if (!bookings.length) {
      list.innerHTML = `
        <p class="dashboard-empty">
          You have no reservations yet.
          <a href="reservation-book.html">Book a new stay</a>.
        </p>`;
      return;
    }

    list.innerHTML = bookings
      .map((b) => {
        const type = Auth.reservationTypeLabel(b.reservation_type) || "Reservation";
        const dates =
          b.check_in && b.check_out
            ? window.SpotAvailability.formatDateRange(b.check_in, b.check_out)
            : "Dates unavailable";
        const statusLabel = b.status || "unknown";
        const editable = bookingIsEditable(b);
        const statusClass =
          statusLabel === "confirmed"
            ? "available"
            : statusLabel === "cancelled"
              ? "booked"
              : "partial";
        const actions = `
          <div class="reservation-card-actions">
            <a class="btn btn-outline" href="reservation-view.html?id=${encodeURIComponent(b.id)}">View</a>
            ${
              editable
                ? `<a class="btn btn-primary" href="reservation-edit.html?id=${encodeURIComponent(b.id)}">Edit</a>
                   <a class="btn btn-outline" href="reservation-delete.html?id=${encodeURIComponent(b.id)}">Delete</a>`
                : ""
            }
          </div>
          <p class="reservation-card-hint">${
            editable
              ? "Selected — choose View, Edit, or Delete."
              : statusLabel === "cancelled"
                ? "Cancelled — you can still view details."
                : "Past stay — view only."
          }</p>`;

        return `
          <article
            class="reservation-booking-card is-manageable"
            data-booking-id="${escapeHtml(b.id)}"
            tabindex="0"
            role="button"
            aria-expanded="false"
          >
            <div class="reservation-booking-card-main">
              <div class="reservation-booking-card-top">
                <h3>${escapeHtml(type)}</h3>
                <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
              </div>
              <dl class="member-profile-summary reservation-booking-details">
                <div><dt>Booked by</dt><dd>${escapeHtml(bookedByLabel(b))}</dd></div>
                <div><dt>Booked</dt><dd>${formatBookedEditedLineHtml(b)}</dd></div>
                <div><dt>Confirmation #</dt><dd>${escapeHtml(confirmationId(b))}</dd></div>
                <div><dt>Stay dates</dt><dd>${escapeHtml(dates)}</dd></div>
                <div><dt>Site</dt><dd>${escapeHtml(formatSiteDetails(b.spot))}</dd></div>
                ${
                  b.notes
                    ? `<div><dt>Notes</dt><dd>${escapeHtml(b.notes)}</dd></div>`
                    : ""
                }
              </dl>
              <p class="reservation-card-tap">Tap or click this booking to View, Edit, or Delete</p>
            </div>
            <div class="reservation-booking-card-panel" hidden>${actions}</div>
          </article>`;
      })
      .join("");
  }

  function ensureOccupancyMap() {
    if (mapReady) return;
    CampgroundMap.init({
      layerId: "occupancy-spots-layer",
      detailId: "occupancy-unit-detail",
      svgId: "occupancy-campground-map",
      photoId: "occupancy-map-photo",
      requireDatesForSpots: true,
      unitFilter: "all",
      canBookSelect: () => true,
      onSpotSelect(unit) {
        showOccupancyDetail(unit);
      },
    });
    if (typeof MapZoom !== "undefined") {
      MapZoom.init({
        viewport: document.getElementById("occupancy-map-viewport"),
        stage: document.getElementById("occupancy-zoom-stage"),
        zoomInBtn: document.getElementById("occupancy-zoom-in"),
        zoomOutBtn: document.getElementById("occupancy-zoom-out"),
        resetBtn: document.getElementById("occupancy-zoom-reset"),
      });
    }
    mapReady = true;
  }

  function showOccupancyDetail(unit) {
    if (!occDetail || !unit) return;
    const from = occFrom.value;
    const to = occTo.value;
    const rows = occupancyRows.filter(
      (r) =>
        r.spot === unit.id &&
        window.SpotAvailability.datesOverlap(from, to, r.check_in, r.check_out)
    );
    const lengthBit = window.SpotAvailability?.formatUnitLengthBit?.(unit);
    const title =
      unit.category === "condo"
        ? `Condo ${unit.label}`
        : unit.category === "reunion"
          ? unit.name || `Family site ${unit.label}`
          : `Site ${unit.label}`;
    const titleWithLength = lengthBit ? `${title} · ${lengthBit}` : title;

    if (!rows.length) {
      occDetail.innerHTML = `<p><strong>${escapeHtml(titleWithLength)}</strong> is open for ${escapeHtml(
        window.SpotAvailability.formatDateRange(from, to)
      )}.</p>`;
      return;
    }

    const items = rows
      .map((r) => {
        const range = window.SpotAvailability.formatDateRange(r.check_in, r.check_out);
        if (!isAdmin) {
          return `<li>${escapeHtml(range)}</li>`;
        }
        const who = [r.full_name, r.member_id ? `ID ${r.member_id}` : "", r.email]
          .filter(Boolean)
          .join(" · ");
        const conf = r.id ? Auth.bookingConfirmationId(r.id) : "";
        return `<li>
          <strong>${escapeHtml(range)}</strong>
          ${conf ? ` · ${escapeHtml(conf)}` : ""}
          ${who ? `<br>${escapeHtml(who)}` : ""}
          ${r.notes ? `<br>Notes: ${escapeHtml(r.notes)}` : ""}
          ${r.booked_by_kind ? `<br>Booked by: ${escapeHtml(r.booked_by_kind === "admin" ? "ECR admin" : "Member")}` : ""}
        </li>`;
      })
      .join("");

    occDetail.innerHTML = `
      <p><strong>${escapeHtml(titleWithLength)}</strong> — booked dates in your range:</p>
      <ul class="occupancy-date-list">${items}</ul>`;
  }

  async function runOccupancyCheck() {
    showOccMsg("", "");
    const from = occFrom.value;
    const to = occTo.value;
    if (!from || !to || to <= from) {
      showOccMsg("Choose a valid from and to date.", "error");
      return;
    }
    occBtn.disabled = true;
    try {
      occupancyRows = await Auth.getSiteOccupancy(from, to);
      if (!window.BASE_SPOT_BOOKINGS) {
        window.BASE_SPOT_BOOKINGS = Array.isArray(window.SPOT_BOOKINGS)
          ? window.SPOT_BOOKINGS.slice()
          : [];
      }
      window.SPOT_BOOKINGS = occupancyRows.map((r) => ({
        spotId: r.spot,
        checkIn: r.check_in,
        checkOut: r.check_out,
      }));
      ensureOccupancyMap();
      CampgroundMap.setDates(from, to);
      CampgroundMap.render?.();
      occWrap.hidden = false;
      if (occDetail) {
        occDetail.innerHTML =
          '<p class="spot-detail-placeholder">Click a site to see booked dates in your selected range.</p>';
      }
      showOccMsg(
        `${occupancyRows.length} overlapping booking${occupancyRows.length === 1 ? "" : "s"} in that range.`,
        "success"
      );
    } catch (err) {
      showOccMsg(err.message, "error");
    } finally {
      occBtn.disabled = false;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const ok = params.get("ok");
  if (ok === "created") showStatus("Reservation booked.", "success");
  if (ok === "updated") showStatus("Reservation updated.", "success");
  if (ok === "deleted") showStatus("Reservation deleted.", "success");
  if (ok && window.history.replaceState) {
    window.history.replaceState(null, "", "reservations.html");
  }

  try {
    await Auth.ready();
  } catch {
    /* cached profile */
  }

  let current = Auth.getCurrentUser();
  if (!current) {
    window.location.href = "login.html?next=reservations.html";
    return;
  }
  try {
    isAdmin = await Auth.verifyAdmin();
  } catch {
    isAdmin = current.accountKind === "admin" || current.isAdmin === true;
  }
  if (!isAdmin && !Auth.canAccessMembers(current)) {
    window.location.href = "login.html?next=reservations.html";
    return;
  }

  if (adminNote) adminNote.hidden = !isAdmin;

  if (bookLink) bookLink.hidden = false;

  const today = window.SpotAvailability.getToday();
  const maxDay = window.SpotAvailability.addDays(today, 90);
  occFrom.min = today;
  occFrom.max = maxDay;
  occTo.min = today;
  occTo.max = maxDay;
  occFrom.value = today;
  occTo.value = window.SpotAvailability.addDays(today, 14);

  try {
    if (isAdmin) {
      // Admins use this page for occupancy; personal list may be empty
      bookings = await Auth.listBookings().catch(() => []);
    } else {
      bookings = await Auth.listBookings();
    }
  } catch (err) {
    showStatus(err.message, "error");
    list.innerHTML = `<p class="form-message error">${escapeHtml(err.message)}</p>`;
    return;
  }

  renderBookings();
  updateBookingNotice();

  list?.addEventListener("click", (event) => {
    const card = event.target.closest(".reservation-booking-card.is-manageable");
    if (!card) return;
    if (event.target.closest("a, button")) return;
    const wasOpen = card.classList.contains("is-selected");
    list.querySelectorAll(".reservation-booking-card.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
      el.setAttribute("aria-expanded", "false");
      const panel = el.querySelector(".reservation-booking-card-panel");
      if (panel) panel.hidden = true;
    });
    if (!wasOpen) {
      card.classList.add("is-selected");
      card.setAttribute("aria-expanded", "true");
      const panel = card.querySelector(".reservation-booking-card-panel");
      if (panel) panel.hidden = false;
    }
  });

  list?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".reservation-booking-card.is-manageable");
    if (!card) return;
    event.preventDefault();
    card.click();
  });

  occBtn?.addEventListener("click", runOccupancyCheck);
})();
