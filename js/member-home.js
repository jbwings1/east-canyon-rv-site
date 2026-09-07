const user = Auth.redirectForAuth({ requireMember: true });
if (!user) {
  /* redirecting */
} else {
  const firstName = (user.name || "").trim().split(/\s+/)[0];
  document.getElementById("member-greeting").textContent = firstName
    ? `Welcome, ${firstName}`
    : "Welcome";

  const summary = document.getElementById("member-profile-summary");
  const cityLine = [user.city, user.state, user.zip].filter(Boolean).join(", ");
  const rows = [
    ["Name", user.name],
    ["Login ID", user.email],
    ["Email", user.profileEmail || user.email],
    ["Phone", user.phone],
    ["Address", user.address],
    ["City, state, zip", cityLine],
    ["RV / rig", user.rv],
    [
      "Account",
      user.accountType === "seasonal" ? "Seasonal member" : "Guest account",
    ],
  ].filter(([, value]) => String(value || "").trim());

  summary.innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><dt>${label}</dt><dd>${String(value).replace(/</g, "&lt;")}</dd></div>`
    )
    .join("");

  document.getElementById("member-logout").addEventListener("click", () => {
    Auth.logout();
  });
}
