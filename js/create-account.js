const form = document.getElementById("signup-form");
const message = document.getElementById("signup-message");

function showMessage(text, type) {
  message.textContent = text;
  message.className = type ? `form-message ${type}` : "form-message";
}

if (Auth.getCurrentUser()) {
  window.location.replace("member-home.html");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("", "");

  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const phone = document.getElementById("signup-phone").value.trim();
  const reservationType = document.getElementById("signup-type").value;
  const rv = document.getElementById("signup-rv").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-confirm").value;

  try {
    if (password !== confirm) {
      throw new Error("Passwords do not match.");
    }
    if (!reservationType) {
      throw new Error("Choose Condo, Family reunion, or RV.");
    }
    const result = await Auth.signUp({
      email,
      password,
      name,
      phone,
      reservationType,
      rv,
    });
    if (result.needsEmailConfirmation) {
      showMessage(
        "Account created. Check your email to confirm the address, then sign in.",
        "success"
      );
      form.reset();
      return;
    }
    showMessage("Account created. Opening members…", "success");
    window.location.replace("member-home.html");
  } catch (err) {
    showMessage(err.message, "error");
  }
});
