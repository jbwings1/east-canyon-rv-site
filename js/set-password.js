if (!Auth.getCurrentUser()) {
  window.location.replace("reset-password.html" + window.location.hash);
} else {
  document.getElementById("password-login").value = Auth.getCurrentUser().email || "";
}

document.getElementById("password-form").addEventListener("submit", async (e) => {
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
    await Auth.updatePassword(newPassword);
    window.location.replace("member-home.html");
  } catch (err) {
    message.textContent = err.message;
    message.className = "form-message error";
  }
});
