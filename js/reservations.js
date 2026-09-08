const form = document.getElementById("reservation-form");
const message = document.getElementById("reservation-message");
const typeSelect = document.getElementById("res-type");
const checkIn = document.getElementById("res-checkin");
const checkOut = document.getElementById("res-checkout");
const mapSection = document.getElementById("rv-availability");
const mapTitle = document.getElementById("map-section-title");
const mapSummary = document.getElementById("map-date-summary");
const preferredSpotInput = document.getElementById("res-preferred-spot");
const preferredSpotDisplay = document.getElementById("preferred-spot-display");
const selectedSpotLabel = document.getElementById("selected-spot-label");
const clearSpotBtn = document.getElementById("clear-spot");
const rvDetailsGroup = document.getElementById("rv-details-group");
const rigSelect = document.getElementById("res-rig");
const stayLengthNotice = document.getElementById("stay-length-notice");
const memberIdInput = document.getElementById("res-member-id");
const memberReservationNotice = document.getElementById("member-reservation-notice");
const completeBookingBtn = document.getElementById("complete-booking-btn");
const bookingConfirmed = document.getElementById("booking-confirmed");
const bookAnotherBtn = document.getElementById("book-another-btn");
const bookingSigninNotice = document.getElementById("booking-signin-notice");
const myReservationsSection = document.getElementById("my-reservations");
const myReservationsBody = document.getElementById("my-reservations-body");
const myReservationsMessage = document.getElementById("my-reservations-message");
const bookingFormTitle = document.getElementById("booking-form-title");
const editingBanner = document.getElementById("editing-banner");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
let memberBookings = [];
let editingBookingId = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function showMyReservationsMessage(text, type) {
  if (!myReservationsMessage) return;
  myReservationsMessage.textContent = text || "";
  myReservationsMessage.className = type ? `form-message ${type}` : "form-message";
}

function setEditingMode(booking) {
  editingBookingId = booking?.id || null;
  if (bookingFormTitle) {
    bookingFormTitle.textContent = editingBookingId ? "Edit reservation" : "Book your stay";
  }
  if (editingBanner) editingBanner.hidden = !editingBookingId;
  if (cancelEditBtn) cancelEditBtn.hidden = !editingBookingId;
  if (completeBookingBtn) {
    completeBookingBtn.textContent = editingBookingId ? "Save changes" : "Complete Booking";
  }
}

function clearEditingMode() {
  setEditingMode(null);
}

async function refreshMemberBookings() {
  const user = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
  if (!user) {
    memberBookings = [];
    if (myReservationsSection) myReservationsSection.hidden = true;
    return;
  }
  if (myReservationsSection) myReservationsSection.hidden = false;
  try {
    memberBookings = await Auth.listBookings();
  } catch (err) {
    memberBookings = [];
    showMyReservationsMessage(err.message, "error");
  }
  renderMyReservations();
  rebuildSpotBookingsFromMembers();
  updateMapAvailability();
  updateMemberReservationNotice();
}

function renderMyReservations() {
  if (!myReservationsBody) return;
  if (!memberBookings.length) {
    myReservationsBody.innerHTML = `<tr><td colspan="5">No reservations yet.</td></tr>`;
    return;
  }

  myReservationsBody.innerHTML = memberBookings
    .map((b) => {
      const type = Auth.reservationTypeLabel(b.reservation_type) || "—";
      const dates =
        b.check_in && b.check_out
          ? window.SpotAvailability.formatDateRange(b.check_in, b.check_out)
          : "—";
      const status = b.status || "—";
      const editable = bookingIsEditable(b);
      const actions = editable
        ? `<button type="button" class="btn-link" data-action="edit" data-id="${escapeHtml(b.id)}">Edit</button>
           <button type="button" class="btn-link" data-action="delete" data-id="${escapeHtml(b.id)}">Delete</button>`
        : status === "cancelled"
          ? `<span class="label-optional">Cancelled</span>`
          : `<span class="label-optional">Past stay</span>`;
      return `<tr>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(formatSpotLabel(b.spot))}</td>
        <td>${escapeHtml(dates)}</td>
        <td><span class="status-pill ${
          status === "confirmed" ? "available" : status === "cancelled" ? "booked" : "partial"
        }">${escapeHtml(status)}</span></td>
        <td class="admin-actions">${actions}</td>
      </tr>`;
    })
    .join("");
}
