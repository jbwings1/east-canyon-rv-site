const signinForm = document.getElementById("signin-form");
const message = document.getElementById("auth-message");
const signinPanel = document.getElementById("signin-panel");
const signedInPanel = document.getElementById("signed-in-panel");
const signedInMessage = document.getElementById("signed-in-message");
const signedInLogout = document.getElementById("signed-in-logout");
const resetSiteData = document.getElementById("reset-site-data");

function showMessage(text, type) {
  if (!message) return;
  message.textContent = text;
  message.className = type ? `form-message ${type}` : "form-message";
}

function getSafeNextUrl() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && /^[a-z0-9./_-]+\.html$/i.test(next) && !next.includes("..")) {
    return next;
  }
  return null;
}

const nextUrl = getSafeNextUrl();
const signedInContinue = document.getElementById("signed-in-continue");
if (signedInContinue && nextUrl) {
  signedInContinue.href = nextUrl;
  signedInContinue.textContent = "Continue to Reservations";
}

function showSignedIn(user) {
  if (!signinPanel || !signedInPanel) return;
  signinPanel.hidden = true;
  signedInPanel.hidden = false;
  if (signedInMessage) {
    signedInMessage.textContent = `Signed in as ${user.name || user.email}.`;
  }
}

function showSignInForm() {
  if (!signinPanel || !signedInPanel) return;
  signinPanel.hidden = false;
  signedInPanel.hidden = true;
}

if (typeof Auth === "undefined") {
  showMessage("Login could not start. Make sure js/auth.js loaded correctly.", "error");
} else if (!Auth.storageAvailable()) {
  showMessage(
    "This browser is not saving login data. Use a normal window (not private browsing).",
    "error"
  );
} else {
  const currentUser = Auth.getCurrentUser();
  if (currentUser) {
    if (Auth.needsPasswordChange(currentUser)) {
      showSignInForm();
      showMessage(
        "Finish account setup on the New account page, or reset site data below and use the demo login.",
        "error"
      );
    } else {
      window.location.href = nextUrl || "member-home.html";
    }
  }
}

if (resetSiteData) {
  resetSiteData.addEventListener("click", () => {
    Auth.clearAllSiteData();
    showSignInForm();
    showMessage("Site data cleared. Try signing in again with the demo account.", "success");
    if (signinForm) signinForm.reset();
  });
}

if (signedInLogout) {
  signedInLogout.addEventListener("click", () => Auth.logout());
}

if (signinForm && typeof Auth !== "undefined") {
  signinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    showMessage("", "");

    const loginId = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;

    if (!loginId || !password) {
      showMessage("Enter your login ID and password.", "error");
      return;
    }

    try {
      Auth.signIn(loginId, password);
      window.location.href = nextUrl || "member-home.html";
    } catch (err) {
      showMessage(err.message, "error");
    }
  });
}
