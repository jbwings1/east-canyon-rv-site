/**
 * Admin reports: reservations, current members, and counts by type.
 * Date helpers are on AdminReports so they can be checked without a browser.
 */
(function (root) {
  const TYPE_ROWS = [
    {
      label: "RV",
      match(type) {
        return type === "rv" || type === "travel-trailer" || type === "motorhome";
      },
    },
    {
      label: "Condo",
      match(type) {
        return type === "condo";
      },
    },
    {
      label: "Family reunion",
      match(type) {
        return type === "family_reunion" || type === "family-reunion" || type === "reunion";
      },
    },
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toIso(year, month, day) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function isoDate(value) {
    const text = String(value || "").trim();
    return text.length >= 10 ? text.slice(0, 10) : "";
  }

  function todayIso(now = new Date()) {
    return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function calendarPreset(kind, today) {
    const year = Number(String(today).slice(0, 4));
    if (kind === "past-year") {
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, mode: "overlap" };
    }
    if (kind === "current-year") {
      return { from: `${year}-01-01`, to: `${year}-12-31`, mode: "overlap" };
    }
    if (kind === "upcoming") {
      return { from: today, to: "", mode: "upcoming" };
    }
    return null;
  }

  function monthsAgo(today, months) {
    const [year, month, day] = String(today).split("-").map(Number);
    const cursor = new Date(year, month - 1, 1);
    cursor.setMonth(cursor.getMonth() - Number(months));
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return toIso(cursor.getFullYear(), cursor.getMonth() + 1, Math.min(day, last));
  }

  function isCancelled(booking) {
    return String(booking?.status || "").toLowerCase() === "cancelled";
  }

  function stayOverlapsRange(checkIn, checkOut, from, to) {
    if (!checkIn || !checkOut) return false;
    if (from && checkOut <= from) return false;
    if (to && checkIn > to) return false;
    return true;
  }

  function rangeError(from, to) {
    if (from && to && from > to) return "The start date is after the end date.";
    return "";
  }

  function reservationMatches(booking, range) {
    const checkIn = isoDate(booking?.check_in);
    const checkOut = isoDate(booking?.check_out);
    if (range?.mode === "upcoming") {
      const from = range.from || range.today || "";
      if (!checkIn || (from && checkIn < from)) return false;
      if (range.to && checkIn > range.to) return false;
      return true;
    }
    return stayOverlapsRange(checkIn, checkOut, range?.from || "", range?.to || "");
  }

  function stayInLookback(booking, today, months) {
    if (isCancelled(booking)) return false;
    const start = monthsAgo(today, months);
    return stayOverlapsRange(isoDate(booking?.check_in), isoDate(booking?.check_out), start, today);
  }

  function isCurrentMember(profile) {
    if (!String(profile?.member_id || "").trim()) return false;
    const status = String(profile?.account_status || "active").toLowerCase();
    return status === "active" || status === "pending_activation";
  }

  function passwordStatus(profile) {
    return profile?.must_change_password ? "Temp / change required" : "Set";
  }

  function memberSinceIso(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return isoDate(text);
    return toIso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  function countByType(bookings, range) {
    const matched = (bookings || []).filter((booking) => reservationMatches(booking, range));
    const active = matched.filter((booking) => !isCancelled(booking));
    const rows = TYPE_ROWS.map((row) => ({
      label: row.label,
      count: active.filter((booking) => row.match(String(booking.reservation_type || ""))).length,
    }));
    const known = active.filter((booking) =>
      TYPE_ROWS.some((row) => row.match(String(booking.reservation_type || "")))
    ).length;
    return {
      rows,
      other: active.length - known,
      cancelled: matched.length - active.length,
      total: active.length,
    };
  }

  root.AdminReports = {
    TYPE_ROWS,
    todayIso,
    calendarPreset,
    monthsAgo,
    isCancelled,
    stayOverlapsRange,
    rangeError,
    reservationMatches,
    stayInLookback,
    isCurrentMember,
    passwordStatus,
    memberSinceIso,
    countByType,
    isoDate,
  };

  if (typeof document === "undefined") return;

  const escapeHtml =
    root.AdminCommon?.escapeHtml ||
    function (value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    };

  function formatStayDate(value) {
    const iso = isoDate(value);
    if (typeof root.SpotAvailability?.formatStayDate === "function") {
      return root.SpotAvailability.formatStayDate(iso) || iso || "—";
    }
    return iso || "—";
  }

  function formatMemberSince(value) {
    const iso = memberSinceIso(value);
    return iso ? formatStayDate(iso) : "—";
  }

  function typeLabel(value) {
    if (typeof root.Auth?.reservationTypeLabel === "function") {
      const label = root.Auth.reservationTypeLabel(value);
      if (label) return label;
    }
    const raw = String(value || "");
    const row = TYPE_ROWS.find((item) => item.match(raw));
    return row ? row.label : raw || "—";
  }

  function statusLabel(booking) {
    if (typeof root.Auth?.bookingDisplayStatus === "function") {
      return root.Auth.bookingDisplayStatus(booking);
    }
    return booking?.status || "—";
  }

  function statusClass(label) {
    if (label === "Cancelled") return "booked";
    if (label === "Active" || label === "Confirmed") return "available";
    return "partial";
  }

  function memberName(profiles, userId) {
    if (typeof root.AdminCommon?.memberLabel === "function") {
      return root.AdminCommon.memberLabel(profiles, userId);
    }
    return userId || "—";
  }

  function setPressed(report, preset) {
    document.querySelectorAll(`[data-report="${report}"][data-preset]`).forEach((button) => {
      button.setAttribute("aria-pressed", button.getAttribute("data-preset") === preset ? "true" : "false");
    });
  }

  function matchingPreset(range) {
    const today = todayIso();
    return ["past-year", "current-year", "upcoming"].find((kind) => {
      const preset = calendarPreset(kind, today);
      return (
        preset.from === (range.from || "") &&
        preset.to === (range.to || "") &&
        preset.mode === range.mode
      );
    }) || "";
  }

  function setDateValue(id, iso) {
    const input = document.getElementById(id);
    if (input) input.value = iso || "";
  }

  const REPORT_PANELS = ["reservations", "members", "types"];

  function showReport(id) {
    const next = REPORT_PANELS.includes(id) ? id : "reservations";
    document.querySelectorAll("[data-report-panel]").forEach((panel) => {
      panel.hidden = panel.getAttribute("data-report-panel") !== next;
    });
    document.querySelectorAll("[data-report-picker]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.getAttribute("data-report-picker") === next ? "true" : "false"
      );
    });
    const hash = next === "reservations" ? "" : `#${next}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
    return next;
  }

  function describeRange(range) {
    if (range?.mode === "upcoming") {
      const from = formatStayDate(range.from);
      const to = range.to ? formatStayDate(range.to) : "";
      if (to && to !== "—") return `Upcoming stays from ${from} through ${to}.`;
      return from && from !== "—" ? `Upcoming stays starting ${from}.` : "Upcoming stays.";
    }
    const from = range?.from ? formatStayDate(range.from) : "";
    const to = range?.to ? formatStayDate(range.to) : "";
    if (from && from !== "—" && to && to !== "—") return `${from} through ${to}.`;
    if (from && from !== "—") return `From ${from}.`;
    if (to && to !== "—") return `Through ${to}.`;
    return "All dates.";
  }

  function setPrintRange(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  (async function () {
    document.getElementById("report-print-btn")?.addEventListener("click", () => {
      window.print();
    });
    document.querySelectorAll("[data-report-picker]").forEach((button) => {
      button.addEventListener("click", () => {
        showReport(button.getAttribute("data-report-picker"));
      });
    });
    showReport(String(window.location.hash || "").replace(/^#/, ""));

    const me = await root.AdminCommon.requireAdmin("reports");
    if (!me) return;

    const message = document.getElementById("admin-message");
    const resBody = document.getElementById("report-res-body");
    const resSummary = document.getElementById("report-res-summary");
    const membersBody = document.getElementById("report-members-body");
    const membersSummary = document.getElementById("report-members-summary");
    const staysHeading = document.getElementById("report-stays-heading");
    const typeBody = document.getElementById("report-type-body");
    const typeSummary = document.getElementById("report-type-summary");

    let profiles = [];
    let bookings = [];
    let stayMonths = 12;
    const ranges = {
      reservations: { from: "", to: "", mode: "overlap" },
      types: { from: "", to: "", mode: "overlap" },
    };

    function readRange(report, fromId, toId) {
      const from = document.getElementById(fromId)?.value || "";
      const to = document.getElementById(toId)?.value || "";
      const current = ranges[report];
      if (current.mode === "upcoming" && from === current.from && to === current.to) {
        return current;
      }
      return { from, to, mode: "overlap" };
    }

    function applyPreset(report, kind, fromId, toId) {
      const preset = calendarPreset(kind, todayIso());
      if (!preset) return;
      ranges[report] = preset;
      setDateValue(fromId, preset.from);
      setDateValue(toId, preset.to);
      setPressed(report, kind);
    }

    function renderReservations() {
      const range = readRange("reservations", "report-res-from", "report-res-to");
      ranges.reservations = range;
      setPressed("reservations", matchingPreset(range));
      setPrintRange("report-res-print-range", describeRange(range));
      const error = range.mode === "overlap" ? rangeError(range.from, range.to) : "";
      if (error) {
        resSummary.textContent = error;
        resBody.innerHTML = `<tr><td colspan="7">${escapeHtml(error)}</td></tr>`;
        return;
      }
      const rows = bookings
        .filter((booking) => reservationMatches(booking, range))
        .sort((a, b) => {
          const start = isoDate(b.check_in).localeCompare(isoDate(a.check_in));
          if (start) return start;
          return memberName(profiles, a.user_id).localeCompare(memberName(profiles, b.user_id));
        });
      const cancelled = rows.filter(isCancelled).length;
      if (!rows.length) {
        resSummary.textContent = "No reservations in this range.";
        resBody.innerHTML = `<tr><td colspan="7">No reservations in this range.</td></tr>`;
        return;
      }
      const cancelNote = cancelled ? ` (${cancelled} cancelled)` : "";
      resSummary.textContent = `${rows.length} reservation${rows.length === 1 ? "" : "s"}${cancelNote}.`;
      resBody.innerHTML = rows
        .map((booking) => {
          const display = statusLabel(booking);
          const conf =
            typeof root.Auth?.bookingConfirmationId === "function"
              ? root.Auth.bookingConfirmationId(booking)
              : booking.id || "—";
          return `<tr>
            <td><code>${escapeHtml(conf)}</code></td>
            <td>${escapeHtml(memberName(profiles, booking.user_id))}</td>
            <td>${escapeHtml(typeLabel(booking.reservation_type))}</td>
            <td>${escapeHtml(booking.spot || "—")}</td>
            <td>${escapeHtml(formatStayDate(booking.check_in))}</td>
            <td>${escapeHtml(formatStayDate(booking.check_out))}</td>
            <td><span class="status-pill ${statusClass(display)}">${escapeHtml(display)}</span></td>
          </tr>`;
        })
        .join("");
    }

    function renderMembers() {
      const today = todayIso();
      const members = profiles
        .filter(isCurrentMember)
        .map((profile) => ({
          profile,
          stays: bookings.filter(
            (booking) => booking.user_id === profile.id && stayInLookback(booking, today, stayMonths)
          ).length,
        }))
        .sort((a, b) =>
          String(a.profile.full_name || a.profile.email || "").localeCompare(
            String(b.profile.full_name || b.profile.email || ""),
            undefined,
            { numeric: true, sensitivity: "base" }
          )
        );
      if (staysHeading) staysHeading.textContent = `Stays (past ${stayMonths} months)`;
      setPrintRange(
        "report-members-print-range",
        `Stays in the past ${stayMonths} months, through ${formatStayDate(today)}.`
      );
      if (!members.length) {
        membersSummary.textContent = "No current members.";
        membersBody.innerHTML = `<tr><td colspan="5">No current members.</td></tr>`;
        return;
      }
      membersSummary.textContent = `${members.length} current member${members.length === 1 ? "" : "s"}.`;
      membersBody.innerHTML = members
        .map(({ profile, stays }) => {
          const name = profile.full_name || profile.email || "Member";
          return `<tr>
            <td>${escapeHtml(profile.member_id || "—")}</td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(passwordStatus(profile))}</td>
            <td>${escapeHtml(formatMemberSince(profile.created_at))}</td>
            <td>${stays}</td>
          </tr>`;
        })
        .join("");
    }

    function renderTypes() {
      const range = readRange("types", "report-type-from", "report-type-to");
      ranges.types = range;
      setPressed("types", matchingPreset(range));
      setPrintRange("report-type-print-range", describeRange(range));
      const error = range.mode === "overlap" ? rangeError(range.from, range.to) : "";
      if (error) {
        typeSummary.textContent = error;
        typeBody.innerHTML = `<tr><td colspan="2">${escapeHtml(error)}</td></tr>`;
        return;
      }
      const counts = countByType(bookings, range);
      const rows = counts.rows.slice();
      if (counts.other) rows.push({ label: "Other", count: counts.other });
      typeSummary.textContent = counts.cancelled
        ? `${counts.total} reservation${counts.total === 1 ? "" : "s"}. ${counts.cancelled} cancelled left out of the counts.`
        : `${counts.total} reservation${counts.total === 1 ? "" : "s"}.`;
      typeBody.innerHTML =
        rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td>${row.count}</td></tr>`
          )
          .join("") +
        `<tr class="report-total"><td>Total</td><td>${counts.total}</td></tr>`;
    }

    function renderAll() {
      const printed = document.getElementById("report-printed-on");
      if (printed) printed.textContent = `Printed ${formatStayDate(todayIso())}`;
      renderReservations();
      renderMembers();
      renderTypes();
    }

    document.querySelectorAll("[data-report][data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const report = button.getAttribute("data-report");
        const preset = button.getAttribute("data-preset");
        if (report === "reservations") applyPreset(report, preset, "report-res-from", "report-res-to");
        if (report === "types") applyPreset(report, preset, "report-type-from", "report-type-to");
        renderAll();
      });
    });

    document.querySelectorAll("[data-report='members'][data-months]").forEach((button) => {
      button.addEventListener("click", () => {
        stayMonths = Number(button.getAttribute("data-months")) || 12;
        document.querySelectorAll("[data-report='members'][data-months]").forEach((item) => {
          item.setAttribute("aria-pressed", item === button ? "true" : "false");
        });
        renderMembers();
      });
    });

    ["report-res-from", "report-res-to"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        ranges.reservations = { mode: "overlap", from: "", to: "" };
        setPressed("reservations", "");
        renderReservations();
      });
    });
    ["report-type-from", "report-type-to"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        ranges.types = { mode: "overlap", from: "", to: "" };
        setPressed("types", "");
        renderTypes();
      });
    });

    try {
      [profiles, bookings] = await Promise.all([
        root.Auth.listAllProfiles(),
        root.Auth.listAllBookings(),
      ]);
      applyPreset("reservations", "current-year", "report-res-from", "report-res-to");
      applyPreset("types", "current-year", "report-type-from", "report-type-to");
      renderAll();
    } catch (err) {
      root.AdminCommon.showMessage(message, err.message, "error");
      const text = escapeHtml(err.message || "Could not load reports.");
      resBody.innerHTML = `<tr><td colspan="7">${text}</td></tr>`;
      membersBody.innerHTML = `<tr><td colspan="5">${text}</td></tr>`;
      typeBody.innerHTML = `<tr><td colspan="2">${text}</td></tr>`;
    }
  })();
})(typeof globalThis !== "undefined" ? globalThis : window);
