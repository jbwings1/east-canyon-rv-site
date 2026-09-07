const form = document.getElementById("forgot-form");
const message = document.getElementById("forgot-message");
const demoLink = document.getElementById("demo-reset-link");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  demoLink.hidden = true;
  demoLink.innerHTML = "";

  try {
    const result = Auth.requestPasswordReset(
      document.getElementById("forgot-login").value.trim()
    );
    message.textContent =
      "If that login ID has an email on the profile, a temporary reset link has been sent.";
    message.className = "form-message success";

    // Demo only — remove when real email sending is connected.
    if (result.demoLink) {
      demoLink.hidden = false;
      demoLink.innerHTML = `<a href="${result.demoLink}">Open temporary reset link (demo)</a>`;
    }
  } catch (err) {
    message.textContent = err.message;
    message.className = "form-message error";
  }
});
