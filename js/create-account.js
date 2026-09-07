const SETUP_KEY = "eastCanyonNewAccountSetup";

const tempStep = document.getElementById("temp-step");
const passwordStep = document.getElementById("password-step");
const pageTitle = document.getElementById("page-title");
const tempForm = document.getElementById("temp-form");
const passwordForm = document.getElementById("password-form");
const tempMessage = document.getElementById("temp-message");
const passwordMessage = document.getElementById("password-message");

function showTempStep() {
  tempStep.hidden = false;
  passwordStep.hidden = true;
  pageTitle.textContent = "New Account";
  sessionStorage.removeItem(SETUP_KEY);
}

function showPasswordStep(loginId) {
  tempStep.hidden = true;
  passwordStep.hidden = false;
  pageTitle.textContent = "Create New Password";
  document.getElementById("password-login").value = loginId;
  document.getElementById("setup-new-password").value = "";
  document.getElementById("setup-confirm-password").value = "";
  sessionStorage.setItem(SETUP_KEY, JSON.stringify({ loginId, verified: true }));
  document.getElementById("setup-new-password").focus();
}

// Resume step 2 if this tab already verified temp login.
const savedSetup = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(SETUP_KEY) || "null");
  } catch {
    return null;
  }
})();

const current = Auth.getCurrentUser();
if (current?.tempVerified && current.passwordSetByUser !== true) {
  showPasswordStep(current.email);
} else if (savedSetup?.verified && savedSetup.loginId) {
  showPasswordStep(savedSetup.loginId);
} else {
  showTempStep();
}

tempForm.addEventListener("submit", (e) => {
  e.preventDefault();
  tempMessage.textContent = "";
  tempMessage.className = "form-message";

  try {
    const loginId = document.getElementById("setup-login").value.trim();
    const tempPassword = document.getElementById("setup-temp-password").value;
    const user = Auth.verifyTempLogin(loginId, tempPassword);
    showPasswordStep(user.email);
  } catch (err) {
    tempMessage.textContent = err.message;
    tempMessage.className = "form-message error";
  }
});

passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  passwordMessage.textContent = "";
  passwordMessage.className = "form-message";

  const newPassword = document.getElementById("setup-new-password").value;
  const confirmPassword = document.getElementById("setup-confirm-password").value;
  const loginId =
    document.getElementById("password-login").value ||
    savedSetup?.loginId ||
    Auth.getCurrentUser()?.email;

  try {
    if (newPassword !== confirmPassword) {
      throw new Error("New passwords do not match.");
    }
    Auth.setNewPassword(newPassword, loginId);
    sessionStorage.removeItem(SETUP_KEY);
    passwordMessage.textContent = "Password saved. Opening member profile…";
    passwordMessage.className = "form-message success";
    window.location.replace("member-home.html");
  } catch (err) {
    passwordMessage.textContent = err.message;
    passwordMessage.className = "form-message error";
  }
});
