/**
 * Campground availability helpers — unit definitions live in map-units-generated.js.
 * Regenerate coordinates: node scripts/generate-map-coordinates.js
 * Fine-tune with map.html?mapEdit=1
 */
window.MAP_CONFIG = {
  image: "pix/map.png",
  baseWidth: 1013,
  baseHeight: 782,
};

/** Existing bookings — dates only; member identity is not exposed on the map. */
window.SPOT_BOOKINGS = [
  { spotId: "3", checkIn: "2026-08-15", checkOut: "2026-08-18" },
  { spotId: "7", checkIn: "2026-08-10", checkOut: "2026-08-14" },
  { spotId: "14", checkIn: "2026-08-20", checkOut: "2026-08-24" },
  { spotId: "42", checkIn: "2026-09-01", checkOut: "2026-09-05" },
  { spotId: "12A", checkIn: "2026-08-12", checkOut: "2026-08-15" },
  { spotId: "13C", checkIn: "2026-08-18", checkOut: "2026-08-22" },
];

window.SPOT_TYPE_LABELS = {
  "pull-through": "Pull-Through Full Hookup",
  "back-in": "Back-In Full Hookup",
  "drive-in": "Drive-In Full Hookup",
  partial: "Partial Hookup",
  tent: "Tent Site",
  condo: "Condominium",
};

window.STATUS_LABELS = {
  available: "Available",
  partial: "Partially booked",
  booked: "Booked",
  unknown: "Select dates",
  previewOpen: "Open (next 90 days)",
  previewBooked: "Bookings scheduled",
};

/** Maximum consecutive days per reservation (resort bylaws). */
window.RESERVATION_MAX_NIGHTS = 7;

/** How far in advance a reservation may be made (resort policy). */
window.RESERVATION_MAX_ADVANCE_DAYS = 60;

/** Maximum upcoming reservations (before check-in) a member may hold at one time. */
window.RESERVATION_MAX_ACTIVE = 2;

window.MEMBER_RESERVATIONS_STORAGE_KEY = "ecr-member-reservations";

window.SpotAvailability = {
  loadMemberReservations() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(window.MEMBER_RESERVATIONS_STORAGE_KEY) || "[]"
      );
      window.MEMBER_RESERVATIONS = Array.isArray(saved) ? saved : [];
    } catch {
      window.MEMBER_RESERVATIONS = [];
    }
  },

  saveMemberReservations() {
    localStorage.setItem(
      window.MEMBER_RESERVATIONS_STORAGE_KEY,
      JSON.stringify(window.MEMBER_RESERVATIONS || [])
    );
  },

  normalizeMemberId(memberId) {
    return String(memberId || "").trim();
  },

  /** Reservations not yet started — counts toward the 2-reservation limit until check-in day. */
  getActiveMemberReservations(memberId) {
    const id = this.normalizeMemberId(memberId);
    if (!id) return [];
    const today = this.getToday();
    return (window.MEMBER_RESERVATIONS || []).filter(
      (r) => this.normalizeMemberId(r.memberId) === id && r.checkIn > today
    );
  },

  canMemberAddReservation(memberId) {
    return (
      this.getActiveMemberReservations(memberId).length <
      (window.RESERVATION_MAX_ACTIVE || 2)
    );
  },

  addMemberReservation(record) {
    if (!window.MEMBER_RESERVATIONS) window.MEMBER_RESERVATIONS = [];
    window.MEMBER_RESERVATIONS.push(record);
    this.saveMemberReservations();
  },

  datesOverlap(checkIn, checkOut, bookingStart, bookingEnd) {
    return checkIn < bookingEnd && bookingStart < checkOut;
  },

  eachNight(checkIn, checkOut) {
    const nights = [];
    const d = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    while (d < end) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      nights.push(`${y}-${m}-${day}`);
      d.setDate(d.getDate() + 1);
    }
    return nights;
  },

  isNightBooked(night, bookings) {
    return bookings.some((b) => night >= b.checkIn && night < b.checkOut);
  },

  /** Drop one stay from a SPOT_BOOKINGS-style list (used while editing that stay). */
  excludeStay(bookings, spotId, checkIn, checkOut) {
    if (!spotId || !checkIn || !checkOut || !Array.isArray(bookings)) return bookings || [];
    let removed = false;
    return bookings.filter((b) => {
      if (
        !removed &&
        String(b.spotId) === String(spotId) &&
        b.checkIn === checkIn &&
        b.checkOut === checkOut
      ) {
        removed = true;
        return false;
      }
      return true;
    });
  },

  getStatusForDates(unit, checkIn, checkOut, options = {}) {
    if (!checkIn || !checkOut || checkOut <= checkIn) return "unknown";

    let unitBookings = (window.SPOT_BOOKINGS || []).filter(
      (b) => String(b.spotId) === String(unit.id)
    );
    if (options.excludeSpotId && options.excludeCheckIn && options.excludeCheckOut) {
      unitBookings = this.excludeStay(
        unitBookings,
        options.excludeSpotId,
        options.excludeCheckIn,
        options.excludeCheckOut
      );
    }
    const nights = this.eachNight(checkIn, checkOut);
    let bookedNights = 0;

    nights.forEach((night) => {
      if (this.isNightBooked(night, unitBookings)) bookedNights += 1;
    });

    if (bookedNights === 0) return "available";
    if (bookedNights === nights.length) return "booked";
    return "partial";
  },

  countAvailable(checkIn, checkOut, category = null) {
    if (!checkIn || !checkOut || checkOut <= checkIn) return null;
    let available = 0;
    const units = window.MAP_UNITS || [];
    units.forEach((unit) => {
      if (category && unit.category !== category) return;
      if (this.getStatusForDates(unit, checkIn, checkOut) === "available") available += 1;
    });
    return available;
  },

  findUnit(id) {
    return (window.MAP_UNITS || []).find((u) => u.id === id) || null;
  },

  formatDateRange(checkIn, checkOut) {
    const opts = { month: "short", day: "numeric", year: "numeric" };
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    return `${start.toLocaleDateString("en-US", opts)} \u2192 ${end.toLocaleDateString("en-US", opts)}`;
  },

  getStayNights(checkIn, checkOut) {
    if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
    return this.eachNight(checkIn, checkOut).length;
  },

  addDays(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  getToday() {
    return this.addDays(new Date().toISOString().split("T")[0], 0);
  },

  getMaxCheckInDate() {
    return this.addDays(this.getToday(), window.RESERVATION_MAX_ADVANCE_DAYS || 60);
  },

  isCheckInWithinAdvanceWindow(checkIn) {
    if (!checkIn) return true;
    return checkIn <= this.getMaxCheckInDate();
  },

  /** Bookings for a unit within the next N days — no member identity exposed. */
  getUpcomingBookingsForUnit(unitId, daysAhead = 90) {
    const today = this.getToday();
    const windowEnd = this.addDays(today, daysAhead);
    return (window.SPOT_BOOKINGS || [])
      .filter((b) => String(b.spotId) === String(unitId))
      .filter((b) => b.checkOut > today && b.checkIn < windowEnd)
      .map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  },

  /** Booked date ranges for a unit — never includes who made the booking. */
  getBookingsForUnit(unitId, checkIn, checkOut, options = {}) {
    let bookings = (window.SPOT_BOOKINGS || [])
      .filter((b) => String(b.spotId) === String(unitId))
      .map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }))
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    if (options.excludeSpotId && options.excludeCheckIn && options.excludeCheckOut) {
      bookings = this.excludeStay(
        bookings,
        options.excludeSpotId,
        options.excludeCheckIn,
        options.excludeCheckOut
      );
    }

    if (!checkIn || !checkOut || checkOut <= checkIn) {
      return bookings;
    }

    return bookings.filter((b) =>
      this.datesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
    );
  },
};

window.MEMBER_RESERVATIONS = [];
window.SpotAvailability.loadMemberReservations();
