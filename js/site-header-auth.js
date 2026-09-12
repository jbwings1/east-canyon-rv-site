/**
 * Puts Sign Out in the top header nav when a user is signed in.
 */
(function () {
  function logoutTarget(user) {
    if (user?.accountKind === "admin") return "admin-login.html";
    return "login.html";
  }

  function mount() {
    if (typeof Auth === "undefined") return;
    const nav = document.querySelector("nav.header-nav");
    if (!nav) return;

    const user = Auth.getCurrentUser?.();
    const existing = nav.querySelector("[data-site-sign-out]");

    if (!user) {
      existing?.remove();
      return;
    }

    if (existing) {
      existing.onclick = () => Auth.logout(logoutTarget(user));
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-nav-sign-out";
    btn.setAttribute("data-site-sign-out", "");
    btn.id = "site-header-sign-out";
    btn.textContent = "Sign Out";
    btn.addEventListener("click", () => Auth.logout(logoutTarget(user)));
    nav.appendChild(btn);
  }

  function run() {
    mount();
    if (typeof Auth?.ready === "function") {
      Auth.ready()
        .then(mount)
        .catch(() => mount());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  window.SiteHeaderAuth = { mount };
})();
