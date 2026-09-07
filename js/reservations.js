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

function syncDateLimits() {
  const today = window.SpotAvailability.getToday();
  const maxCheckIn = window.SpotAvailability.getMaxCheckInDate();
  checkIn.min = today;
  checkIn.max = maxCheckIn;
  if (checkIn.value && checkIn.value > maxCheckIn) {
    checkIn.value = "";
    checkOut.value = "";
  }
  syncCheckoutMin();
}

syncDateLimits();

function isCheckInTooFarOut(checkInValue) {
  return checkInValue && !window.SpotAvailability.isCheckInWithinAdvanceWindow(checkInValue);
}

function advanceBookingMessage() {
  const latest = window.SpotAvailability.getMaxCheckInDate();
  const latestFormatted = new Date(`${latest}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Reservations can only be made up to ${window.RESERVATION_MAX_ADVANCE_DAYS} days in advance. Latest check-in: ${latestFormatted}.`;
}

function isRvReservationType(value) {
  return value === "motorhome" || value === "travel-trailer";
}

function isCondoReservationType(value) {
  return value === "condo";
}

function isReunionReservationType(value) {
  return value === "reunion";
}

function getMapUnitFilter(type) {
  if (isRvReservationType(type)) return "rv";
  if (isCondoReservationType(type)) return "condo";
  if (isReunionReservationType(type)) return "reunion";
  return "all";
}

function formatSelectedUnit(unit) {
  if (unit.category === "condo") {
    return `Condo ${unit.label} (${unit.bedrooms}-bedroom)`;
  }
  if (unit.category === "reunion") {
    return unit.name || `Family site ${unit.label}`;
  }
  return `Site ${unit.label} (${window.SPOT_TYPE_LABELS[unit.type]})`;
}

function unitMatchesReservationType(unit, type) {
  if (isRvReservationType(type)) return unit.category === "rv";
  if (isCondoReservationType(type)) return unit.category === "condo";
  if (isReunionReservationType(type)) return unit.category === "reunion";
  return false;
}

function canBookSelectUnit(unit) {
  const type = typeSelect.value;
  if (!type) return false;
  return unitMatchesReservationType(unit, type);
}

CampgroundMap.init({
  layerId: "spots-layer",
  detailId: "map-unit-detail",
  svgId: "campground-map",
  photoId: "campground-map-photo",
  requireDatesForSpots: false,
  unitFilter: "all",
  canBookSelect: canBookSelectUnit,
  onSpotSelect(unit) {
    if (!canBookSelectUnit(unit)) return;
    preferredSpotInput.value = unit.id;
    selectedSpotLabel.textContent = formatSelectedUnit(unit);
    preferredSpotDisplay.hidden = false;
  },
});

MapZoom.init({
  viewport: document.getElementById("map-viewport"),
  stage: document.getElementById("map-zoom-stage"),
  zoomInBtn: document.getElementById("map-zoom-in"),
  zoomOutBtn: document.getElementById("map-zoom-out"),
  resetBtn: document.getElementById("map-zoom-reset"),
});

function syncCheckoutMin() {
  if (!checkIn.value) return;
  const next = new Date(checkIn.value + "T12:00:00");
  next.setDate(next.getDate() + 1);
  checkOut.min = next.toISOString().split("T")[0];
  if (checkOut.value && checkOut.value <= checkIn.value) {
    checkOut.value = "";
  }
}

function clearPreferredSpot() {
  preferredSpotInput.value = "";
  preferredSpotDisplay.hidden = true;
  selectedSpotLabel.textContent = "";
  CampgroundMap.clearSelection();
}

function updateRvFields() {
  const showRvLength = isRvReservationType(typeSelect.value);
  rvDetailsGroup.hidden = !showRvLength;
  if (!showRvLength) {
    rigSelect.value = "";
  }
}

function updateStayLengthNotice() {
  if (!stayLengthNotice) return;

  const inDate = checkIn.value;
  const outDate = checkOut.value;
  const maxNights = window.RESERVATION_MAX_NIGHTS || 7;
  const nights = window.SpotAvailability.getStayNights(inDate, outDate);

  if (!inDate || !outDate || outDate <= inDate || nights <= maxNights) {
    stayLengthNotice.hidden = true;
    stayLengthNotice.textContent = "";
    return;
  }

  const bookingsNeeded = Math.ceil(nights / maxNights);
  const firstCheckout = window.SpotAvailability.addDays(inDate, maxNights);
  const firstRange = window.SpotAvailability.formatDateRange(inDate, firstCheckout);

  stayLengthNotice.hidden = false;
  stayLengthNotice.textContent =
    `Your stay is ${nights} nights. Resort bylaws allow up to ${maxNights} consecutive days per reservation, ` +
    `so you will need ${bookingsNeeded} separate bookings. Complete this form for ${firstRange}, ` +
    `then submit a new booking for the remaining nights of your trip.`;
}

function formatActiveReservationRanges(active) {
  return active
    .map((r) => window.SpotAvailability.formatDateRange(r.checkIn, r.checkOut))
    .join("; ");
}

function updateMemberReservationNotice() {
  if (!memberReservationNotice) return;

  const memberId = window.SpotAvailability.normalizeMemberId(memberIdInput?.value);
  if (!memberId) {
    memberReservationNotice.hidden = true;
    memberReservationNotice.textContent = "";
    memberReservationNotice.classList.remove("stay-length-notice--limit");
    return;
  }

  const maxActive = window.RESERVATION_MAX_ACTIVE || 2;
  const active = window.SpotAvailability.getActiveMemberReservations(memberId);

  if (active.length >= maxActive) {
    memberReservationNotice.hidden = false;
    memberReservationNotice.classList.add("stay-length-notice--limit");
    memberReservationNotice.textContent =
      `You already have ${active.length} upcoming reservations (maximum ${maxActive}): ` +
      `${formatActiveReservationRanges(active)}. Once you check in, or after canceling one, you can book again.`;
    return;
  }

  memberReservationNotice.classList.remove("stay-length-notice--limit");
  if (active.length > 0) {
    const remaining = maxActive - active.length;
    memberReservationNotice.hidden = false;
    memberReservationNotice.textContent =
      `You have ${active.length} upcoming reservation${active.length === 1 ? "" : "s"} ` +
      `(${formatActiveReservationRanges(active)}). You may book ${remaining} more before check-in.`;
    return;
  }

  memberReservationNotice.hidden = true;
  memberReservationNotice.textContent = "";
}

function updateMapAvailability() {
  const inDate = checkIn.value;
  const outDate = checkOut.value;
  const type = typeSelect.value;
  const isRv = isRvReservationType(type);
  const isCondo = isCondoReservationType(type);
  const isReunion = isReunionReservationType(type);
  const filter = getMapUnitFilter(type);

  CampgroundMap.setUnitFilter(filter);

  if (mapTitle) {
    mapTitle.textContent = isCondo
      ? "Condo map"
      : isReunion
        ? "Family reunion sites"
        : "Booking Map";
  }

  if (isCheckInTooFarOut(inDate)) {
    updateStayLengthNotice();
    mapSummary.textContent = advanceBookingMessage();
    CampgroundMap.setDates("", "");
    clearPreferredSpot();
    return;
  }

  if (!inDate || !outDate || outDate <= inDate) {
    updateStayLengthNotice();
    mapSummary.textContent = !type
      ? "Click any RV site, condo, or family reunion site to see upcoming bookings. Pick dates and reservation type above to book."
      : isCondo
        ? "Click any brown condo on the map. Pick check-in and check-out dates above to see availability."
        : isReunion
          ? "Click a family reunion site on the map. Pick check-in and check-out dates above to see availability."
          : "Click any green RV site on the map. Pick check-in and check-out dates above to see availability.";
    CampgroundMap.setDates("", "");
    return;
  }

  updateStayLengthNotice();

  CampgroundMap.setDates(inDate, outDate);

  if (isRv) {
    const available = window.SpotAvailability.countAvailable(inDate, outDate, "rv");
    mapSummary.textContent = `${available} RV site${available === 1 ? "" : "s"} open for your full stay (${inDate} to ${outDate}). Green = available, yellow = partially booked, red = fully booked.`;
  } else if (isCondo) {
    const available = window.SpotAvailability.countAvailable(inDate, outDate, "condo");
    mapSummary.textContent = `${available} condo${available === 1 ? "" : "s"} open for your full stay (${inDate} to ${outDate}). Green = available, yellow = partially booked, red = fully booked.`;
  } else if (isReunion) {
    const available = window.SpotAvailability.countAvailable(inDate, outDate, "reunion");
    mapSummary.textContent = `${available} family site${available === 1 ? "" : "s"} open for your full stay (${inDate} to ${outDate}). Green = available, yellow = partially booked, red = fully booked.`;
  } else {
    const rvOpen = window.SpotAvailability.countAvailable(inDate, outDate, "rv");
    const condoOpen = window.SpotAvailability.countAvailable(inDate, outDate, "condo");
    const reunionOpen = window.SpotAvailability.countAvailable(inDate, outDate, "reunion");
    mapSummary.textContent =
      `${rvOpen} RV site${rvOpen === 1 ? "" : "s"}, ${condoOpen} condo${condoOpen === 1 ? "" : "s"}, and ${reunionOpen} family site${reunionOpen === 1 ? "" : "s"} open for ${inDate} to ${outDate}. Click any unit to view its schedule, or choose a reservation type above to book.`;
    clearPreferredSpot();
  }

  if (preferredSpotInput.value) {
    const unit = window.SpotAvailability.findUnit(preferredSpotInput.value);
    const status = unit
      ? window.SpotAvailability.getStatusForDates(unit, inDate, outDate)
      : "booked";
    const wrongCategory = unit && type && !unitMatchesReservationType(unit, type);

    if (status !== "available" || wrongCategory) {
      clearPreferredSpot();
    } else {
      CampgroundMap.selectUnit(preferredSpotInput.value, { force: true });
    }
  }
}

checkIn.addEventListener("change", () => {
  syncDateLimits();
  updateMapAvailability();
});

checkOut.addEventListener("change", updateMapAvailability);
memberIdInput?.addEventListener("input", updateMemberReservationNotice);
memberIdInput?.addEventListener("change", updateMemberReservationNotice);
typeSelect.addEventListener("change", () => {
  updateRvFields();
  clearPreferredSpot();
  updateMapAvailability();
  updateMemberReservationNotice();
});

updateRvFields();
updateMapAvailability();
updateMemberReservationNotice();

clearSpotBtn.addEventListener("click", clearPreferredSpot);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  message.textContent = "";
  message.className = "form-message";

  if (checkOut.value <= checkIn.value) {
    message.textContent = "Check-out must be after check-in.";
    message.className = "form-message error";
    checkOut.focus();
    return;
  }

  if (isCheckInTooFarOut(checkIn.value)) {
    message.textContent = advanceBookingMessage();
    message.className = "form-message error";
    checkIn.focus();
    return;
  }

  const maxNights = window.RESERVATION_MAX_NIGHTS || 7;
  const stayNights = window.SpotAvailability.getStayNights(checkIn.value, checkOut.value);
  if (stayNights > maxNights) {
    const firstCheckout = window.SpotAvailability.addDays(checkIn.value, maxNights);
    const firstRange = window.SpotAvailability.formatDateRange(checkIn.value, firstCheckout);
    message.textContent =
      `Each reservation is limited to ${maxNights} consecutive days. Shorten your dates to ${firstRange} for this booking, then submit a separate reservation for the rest of your stay.`;
    message.className = "form-message error";
    stayLengthNotice?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const memberId = window.SpotAvailability.normalizeMemberId(data.memberId);

  if (!window.SpotAvailability.canMemberAddReservation(memberId)) {
    const maxActive = window.RESERVATION_MAX_ACTIVE || 2;
    const active = window.SpotAvailability.getActiveMemberReservations(memberId);
    message.textContent =
      `You already have ${active.length} upcoming reservations (maximum ${maxActive}): ` +
      `${formatActiveReservationRanges(active)}. Once you check in, or after canceling one, you can book again.`;
    message.className = "form-message error";
    updateMemberReservationNotice();
    memberReservationNotice?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const typeLabels = {
    condo: "Condo",
    "travel-trailer": "Travel trailer",
    motorhome: "Motorhome",
    reunion: "Reunion",
  };

  const needsMapUnit =
    isRvReservationType(data.type) ||
    isCondoReservationType(data.type) ||
    isReunionReservationType(data.type);

  if (needsMapUnit) {
    if (!data.preferredSpot) {
      message.textContent = isCondoReservationType(data.type)
        ? "Select an open (green) condo on the map before completing your booking."
        : isReunionReservationType(data.type)
          ? "Select an open (green) family reunion site on the map before completing your booking."
          : "Select an open (green) RV site on the map before completing your booking.";
      message.className = "form-message error";
      mapSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    const unit = window.SpotAvailability.findUnit(data.preferredSpot);
    const expectedCategory = isCondoReservationType(data.type)
      ? "condo"
      : isReunionReservationType(data.type)
        ? "reunion"
        : "rv";

    if (!unit || unit.category !== expectedCategory) {
      message.textContent = "That unit could not be found. Please select another open unit on the map.";
      message.className = "form-message error";
      clearPreferredSpot();
      return;
    }

    const status = window.SpotAvailability.getStatusForDates(unit, data.checkIn, data.checkOut);
    if (status !== "available") {
      const conflicts = window.SpotAvailability.getBookingsForUnit(
        unit.id,
        data.checkIn,
        data.checkOut
      );
      const datesNote = conflicts.length
        ? ` Booked ${conflicts.map((b) => window.SpotAvailability.formatDateRange(b.checkIn, b.checkOut)).join("; ")}.`
        : "";
      message.textContent = `${
        unit.category === "condo"
          ? "Condo"
          : unit.category === "reunion"
            ? "Family site"
            : "Site"
      } ${unit.label} is no longer open for those dates.${datesNote} Please choose another green unit on the map.`;
      message.className = "form-message error";
      clearPreferredSpot();
      updateMapAvailability();
      return;
    }

    window.SPOT_BOOKINGS.push({
      spotId: unit.id,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
    });
    updateMapAvailability();
  }

  const confirmationId = `ECR-${Date.now().toString(36).toUpperCase()}`;

  window.SpotAvailability.addMemberReservation({
    memberId,
    spotId: data.preferredSpot || null,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    type: data.type,
    confirmationId,
  });

  let unitNote = "";
  if (needsMapUnit && data.preferredSpot) {
    const unit = window.SpotAvailability.findUnit(data.preferredSpot);
    if (unit) {
      unitNote =
        unit.category === "condo"
          ? ` Condo ${unit.label} is reserved for you.`
          : unit.category === "reunion"
            ? ` ${unit.name || `Family site ${unit.label}`} is reserved for you.`
            : ` Site ${unit.label} is reserved for you.`;
    }
  }

  message.textContent =
    `You're booked, ${data.name.split(" ")[0]}! Your ${typeLabels[data.type] || "reservation"} for ` +
    `${data.checkIn} to ${data.checkOut} is confirmed.${unitNote} Confirmation #${confirmationId} was sent to ${data.email}.`;
  message.className = "form-message success";

  form.reset();
  syncDateLimits();
  typeSelect.value = "";
  clearPreferredSpot();
  updateRvFields();
  updateMapAvailability();
});
