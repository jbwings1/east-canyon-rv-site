if (!Auth.getCurrentUser()) {
  window.location.replace("login.html");
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
    await Auth.signOutQuiet();
    message.textContent = "Password saved. Sign in with your email and new password.";
    message.className = "form-message success";
    window.location.replace("login.html");
  } catch (err) {
    message.textContent = err.message;
    message.className = "form-message error";
  }
});
