const form = document.getElementById("reset-form");
const message = document.getElementById("reset-message");
const intro = document.getElementById("reset-intro");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";

if (!token || !Auth.getResetToken(token)) {
  form.hidden = true;
  intro.textContent = "This reset link is invalid or has expired. Request a new one from Forgot password.";
  message.textContent = "";
} else {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    try {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }
      Auth.resetPasswordWithToken(token, newPassword);
      message.textContent = "Password updated. You can sign in with your new password.";
      message.className = "form-message success";
      form.hidden = true;
      intro.textContent = "Your password has been changed.";
    } catch (err) {
      message.textContent = err.message;
      message.className = "form-message error";
    }
  });
}
