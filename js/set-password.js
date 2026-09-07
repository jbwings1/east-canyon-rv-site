const user = Auth.getCurrentUser();

if (!user || !user.tempVerified) {
  window.location.replace("create-account.html");
} else if (Auth.getDemoUser(user.email)?.passwordSetByUser === true) {
  window.location.replace("dashboard.html");
} else {
  document.getElementById("password-login").value = user.email || "";
}

document.getElementById("password-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const message = document.getElementById("password-message");
  message.textContent = "";
  message.className = "form-message";

  const newPassword = document.getElementById("setup-new-password").value;
  const confirmPassword = document.getElementById("setup-confirm-password").value;

  try {
    if (newPassword !== confirmPassword) {
      throw new Error("New passwords do not match.");
    }
    Auth.setNewPassword(newPassword);
    window.location.replace("dashboard.html");
  } catch (err) {
    message.textContent = err.message;
    message.className = "form-message error";
  }
});
