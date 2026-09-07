const user = Auth.syncSessionUser() || Auth.requireAuth();
if (!user) throw new Error("Unauthorized");

document.getElementById("welcome-name").textContent = user.name
  ? `Hello, ${user.name.split(" ")[0]}`
  : "My Account";
document.getElementById("account-type-label").textContent =
  user.accountType === "seasonal" ? "Seasonal Member" : "Guest Account";

document.getElementById("profile-login").value = user.email || "";
document.getElementById("profile-name").value = user.name || "";
document.getElementById("profile-email").value = user.profileEmail || "";
document.getElementById("profile-phone").value = user.phone || "";
document.getElementById("profile-address").value = user.address || "";
document.getElementById("profile-city").value = user.city || "";
document.getElementById("profile-state").value = user.state || "";
document.getElementById("profile-zip").value = user.zip || "";
document.getElementById("profile-rv").value = user.rv || "";

const spotContent = document.getElementById("spot-content");
const bookingsContent = document.getElementById("bookings-content");
const bookingsCard = document.getElementById("bookings-card");

if (user.accountType === "seasonal") {
  if (user.assignedSpot) {
    const spot = window.CAMPGROUND_SPOTS.find((s) => s.id === user.assignedSpot);
    spotContent.innerHTML = `
      <p class="dashboard-spot-number">Site <strong>${user.assignedSpot}</strong></p>
      <p>${spot ? window.SPOT_TYPE_LABELS[spot.type] : "Full hookup pad"}</p>
      <a href="map.html?spot=${user.assignedSpot}" class="btn btn-outline">View on Map</a>
    `;
  } else {
    spotContent.innerHTML = `
      <p class="dashboard-empty">No spot assigned yet. Contact the office to complete your seasonal setup.</p>
      <a href="tel:+18013599030" class="btn btn-outline">Call Office</a>
    `;
  }
  bookingsCard.querySelector("h2").textContent = "Membership";
  bookingsContent.innerHTML = `
    <dl class="detail-list">
      <div><dt>Season</dt><dd>April – October 2026</dd></div>
      <div><dt>Status</dt><dd><span class="status-pill member">Active</span></dd></div>
      <div><dt>Next renewal</dt><dd>March 1, 2027</dd></div>
    </dl>
  `;
} else {
  spotContent.innerHTML = `
    <p>No assigned spot — browse the map to book your next stay.</p>
    <a href="map.html" class="btn btn-primary">View Site Map</a>
  `;

  const bookings = user.bookings || [];
  if (bookings.length === 0) {
    bookingsContent.innerHTML = `<p class="dashboard-empty">No bookings yet.</p>`;
  } else {
    bookingsContent.innerHTML = bookings
      .map(
        (b) => `
      <article class="booking-item">
        <p><strong>Site ${b.spot}</strong> · ${b.checkIn} → ${b.checkOut}</p>
        <span class="status-pill ${b.status === "confirmed" ? "available" : "reserved"}">${b.status}</span>
      </article>`
      )
      .join("");
  }
}

document.getElementById("password-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = document.getElementById("password-message");
  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  try {
    if (newPassword !== confirmPassword) {
      throw new Error("New passwords do not match.");
    }
    Auth.changePassword(currentPassword, newPassword);
    msg.textContent = "Password updated.";
    msg.className = "form-message success";
    e.target.reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "form-message error";
  }
});

document.getElementById("profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = document.getElementById("profile-message");
  const updated = Auth.updateProfile({
    name: document.getElementById("profile-name").value.trim(),
    profileEmail: document.getElementById("profile-email").value.trim(),
    phone: document.getElementById("profile-phone").value.trim(),
    address: document.getElementById("profile-address").value.trim(),
    city: document.getElementById("profile-city").value.trim(),
    state: document.getElementById("profile-state").value.trim().toUpperCase(),
    zip: document.getElementById("profile-zip").value.trim(),
    rv: document.getElementById("profile-rv").value.trim(),
  });
  msg.textContent = "Profile saved.";
  msg.className = "form-message success";
  document.getElementById("welcome-name").textContent = updated.name
    ? `Hello, ${updated.name.split(" ")[0]}`
    : "My Account";
});

document.getElementById("logout-btn").addEventListener("click", () => Auth.logout());
