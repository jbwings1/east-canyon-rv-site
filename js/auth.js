/**
 * Auth module — demo uses localStorage.
 * Replace initSupabase() and the marked sections when connecting Supabase.
 */
const AUTH_STORAGE_KEY = "eastCanyonUser";
const RESET_STORAGE_KEY = "eastCanyonPasswordResets";
const DEMO_USERS_KEY = "eastCanyonDemoUsers";
const DEMO_SEED_KEY = "eastCanyonDemoSeed";
const DEMO_SEED_VERSION = "flow12-2026-08-13";
const RESET_LINK_HOURS = 1;

/** Default demo accounts — used once, then stored in localStorage. */
const DEFAULT_DEMO_USERS = [
  {
    email: "member@example.com",
    password: "demo1234",
    accountType: "seasonal",
    name: "Jane Miller",
    phone: "(801) 555-0101",
    profileEmail: "member@example.com",
    address: "120 Maple Street",
    city: "Morgan",
    state: "UT",
    zip: "84050",
    rv: "Airstream Classic 30 ft",
    assignedSpot: "1",
    mustChangePassword: false,
    passwordSetByUser: true,
    profileComplete: true,
  },
  {
    email: "guest@example.com",
    password: "demo1234",
    accountType: "guest",
    name: "Alex Rivera",
    phone: "(801) 555-0202",
    profileEmail: "guest@example.com",
    address: "88 River Road",
    city: "Henefer",
    state: "UT",
    zip: "84033",
    rv: "Winnebago View 24V — 25 ft",
    assignedSpot: null,
    mustChangePassword: false,
    passwordSetByUser: true,
    profileComplete: true,
    bookings: [
      { spot: "3", checkIn: "2026-08-15", checkOut: "2026-08-18", status: "confirmed" },
      { spot: "14", checkIn: "2026-06-02", checkOut: "2026-06-05", status: "completed" },
    ],
  },
  {
    email: "newmember1",
    password: "temp1234",
    accountType: "seasonal",
    name: "Pat Larson",
    phone: "(801) 555-0188",
    profileEmail: "pat.larson@example.com",
    address: "455 Canyon View Drive",
    city: "Morgan",
    state: "UT",
    zip: "84050",
    rv: "",
    assignedSpot: null,
    mustChangePassword: true,
    passwordSetByUser: false,
    profileComplete: false,
  },
  {
    email: "newmember2",
    password: "temp1234",
    accountType: "seasonal",
    name: "Chris Morgan",
    phone: "(801) 555-0199",
    profileEmail: "chris.morgan@example.com",
    address: "12 Pine Lane",
    city: "Henefer",
    state: "UT",
    zip: "84033",
    rv: "",
    assignedSpot: null,
    mustChangePassword: true,
    passwordSetByUser: false,
    profileComplete: false,
  },
];

function loadDemoUsers() {
  let users = [];
  let changed = false;

  try {
    const raw = localStorage.getItem(DEMO_USERS_KEY);
    users = raw ? JSON.parse(raw) : [];
    changed = !raw;
  } catch {
    users = [];
    changed = true;
  }

  if (!Array.isArray(users)) {
    users = [];
    changed = true;
  }

  let seedVersion = null;
  try {
    seedVersion = localStorage.getItem(DEMO_SEED_KEY);
  } catch {
    seedVersion = null;
  }

  const forceSeedReset = seedVersion !== DEMO_SEED_VERSION;

  if (forceSeedReset) {
    users = JSON.parse(JSON.stringify(DEFAULT_DEMO_USERS));
    changed = true;
    localStorage.setItem(DEMO_SEED_KEY, DEMO_SEED_VERSION);
    localStorage.removeItem(RESET_STORAGE_KEY);
    // Keep the signed-in member — only reset demo account records.
  } else {
    DEFAULT_DEMO_USERS.forEach((def) => {
      const index = users.findIndex((u) => u.email === def.email);
      if (index === -1) {
        users.push(JSON.parse(JSON.stringify(def)));
        changed = true;
        return;
      }

      const existing = users[index];
      let updated = { ...existing };
      let accountChanged = false;

      for (const [key, value] of Object.entries(def)) {
        if (key === "password") continue;
        if (updated[key] === undefined || updated[key] === null || updated[key] === "") {
          updated[key] = value;
          accountChanged = true;
        }
      }

      // Fix older saved demo accounts that couldn't complete sign-in.
      if (def.passwordSetByUser === true && updated.passwordSetByUser !== true) {
        updated.passwordSetByUser = true;
        updated.mustChangePassword = false;
        updated.password = def.password;
        accountChanged = true;
      }

      if (updated.passwordSetByUser === true) {
        updated.mustChangePassword = false;
      }

      if (accountChanged) {
        users[index] = updated;
        changed = true;
      }
    });
  }

  if (changed) {
    try {
      localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
    } catch {
      /* storage blocked */
    }
  }
  return users;
}

const DEMO_USERS = loadDemoUsers();

function persistDemoUsers() {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEMO_USERS));
}

function storageAvailable() {
  try {
    const key = "__eastCanyonStorageTest";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const Auth = {
  storageAvailable,

  getCurrentUser() {
    if (!storageAvailable()) return null;
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearAllSiteData() {
    if (!storageAvailable()) return;
    [
      AUTH_STORAGE_KEY,
      RESET_STORAGE_KEY,
      DEMO_USERS_KEY,
      DEMO_SEED_KEY,
    ].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
    try {
      sessionStorage.removeItem("eastCanyonNewAccountSetup");
    } catch {
      /* ignore */
    }
  },

  saveUser(user) {
    if (!storageAvailable()) {
      throw new Error(
        "This browser blocked saved login data. Try a normal window (not private browsing) or use http://localhost instead of opening the file directly."
      );
    }
    const { password, ...safe } = user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(safe));
    return safe;
  },

  clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  logout() {
    this.clearSession();
    window.location.href = "login.html";
  },

  requireAuth(redirectTo = "login.html") {
    if (!this.getCurrentUser()) {
      window.location.href = redirectTo;
      return null;
    }
    return this.getCurrentUser();
  },

  getDemoUser(loginId) {
    return (
      DEMO_USERS.find(
        (u) => u.email.toLowerCase() === String(loginId || "").toLowerCase()
      ) || null
    );
  },

  needsPasswordChange(user = this.getCurrentUser()) {
    if (!user) return false;

    // Trust the active session after a successful sign-in or password setup.
    if (user.passwordSetByUser === true && user.mustChangePassword !== true) {
      return false;
    }

    const demo = this.getDemoUser(user.email);
    if (demo) {
      return demo.passwordSetByUser !== true || user.mustChangePassword === true;
    }

    return user.passwordSetByUser !== true || user.mustChangePassword === true;
  },

  canAccessMembers(user = this.getCurrentUser()) {
    return Boolean(user) && !this.needsPasswordChange(user);
  },

  redirectForAuth(options = {}) {
    const {
      requireMember = false,
      loginPage = "login.html",
      setupPage = "create-account.html",
    } = options;

    const user = this.getCurrentUser();

    if (!requireMember) {
      return user;
    }

    if (!user) {
      window.location.href = loginPage;
      return null;
    }

    if (this.needsPasswordChange(user)) {
      window.location.href = setupPage;
      return null;
    }

    return user;
  },

  /** Step 1: check login ID + temporary password, then continue to create password. */
  verifyTempLogin(loginId, tempPassword) {
    const demo = this.getDemoUser(loginId);
    if (!demo) {
      throw new Error("Login ID not found.");
    }
    if (demo.passwordSetByUser === true) {
      throw new Error(
        "This login already has a password. Use Sign In with the password you created."
      );
    }
    if (demo.password !== tempPassword) {
      throw new Error("Temporary password is incorrect.");
    }
    return this.saveUser({
      ...demo,
      mustChangePassword: true,
      passwordSetByUser: false,
      tempVerified: true,
    });
  },

  /** Step 2: save the new password, then go to member profile. */
  setNewPassword(newPassword, loginId) {
    const id = loginId || this.getCurrentUser()?.email;
    if (!id) {
      throw new Error("Please enter your login ID and temporary password first.");
    }

    const demo = this.getDemoUser(id);
    if (!demo) {
      throw new Error("Account not found.");
    }
    if (demo.passwordSetByUser === true) {
      throw new Error("This login already has a password. Use Sign In.");
    }
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    if (newPassword === demo.password) {
      throw new Error("Choose a new password that is different from the temporary password.");
    }

    demo.password = newPassword;
    demo.mustChangePassword = false;
    demo.passwordSetByUser = true;
    persistDemoUsers();

    return this.saveUser({
      ...demo,
      mustChangePassword: false,
      passwordSetByUser: true,
      tempVerified: false,
    });
  },

  needsAccountSetup(user = this.getCurrentUser()) {
    if (!user) return false;
    return this.needsPasswordChange(user);
  },

  isProfileComplete(user = this.getCurrentUser()) {
    if (!user) return false;
    if (user.profileComplete === true) return true;
    if (user.profileComplete === false) return false;
    return Boolean(
      user.name &&
        user.profileEmail &&
        user.phone &&
        user.address &&
        user.city &&
        user.state &&
        user.zip
    );
  },

  /** Refresh session flags/fields from the stored demo account record. */
  syncSessionUser() {
    const session = this.getCurrentUser();
    if (!session) return null;
    const demo = this.getDemoUser(session.email);
    if (!demo) return session;

    const {
      password,
      mustChangePassword,
      passwordSetByUser,
      tempVerified,
      ...profileFields
    } = demo;

    return this.saveUser({
      ...session,
      ...profileFields,
      mustChangePassword: session.mustChangePassword ?? mustChangePassword,
      passwordSetByUser: session.passwordSetByUser ?? passwordSetByUser,
      tempVerified: session.tempVerified ?? tempVerified,
    });
  },

  /** TODO: Replace with Supabase Auth signInWithPassword */
  signIn(email, password) {
    const demo = this.getDemoUser(email);
    if (!demo) {
      throw new Error("Invalid login ID or password.");
    }

    if (demo.passwordSetByUser !== true) {
      throw new Error(
        "This is a new account. Use New account below — enter the temporary password and your new password there first."
      );
    }

    if (demo.password !== password) {
      throw new Error("Invalid login ID or password.");
    }

    return this.saveUser({
      ...demo,
      mustChangePassword: false,
      passwordSetByUser: true,
    });
  },

  /** TODO: Replace with Supabase Auth signUp + profiles insert */
  signUp({ email, password, name, phone, accountType, rv }) {
    if (DEMO_USERS.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with this email already exists.");
    }
    const user = {
      email,
      password,
      name,
      phone,
      accountType,
      rv: rv || "",
      profileEmail: email,
      assignedSpot: accountType === "seasonal" ? null : null,
      passwordSetByUser: true,
      mustChangePassword: false,
      profileComplete: false,
      bookings: accountType === "guest" ? [] : undefined,
    };
    DEMO_USERS.push(user);
    persistDemoUsers();
    return this.saveUser(user);
  },

  /** TODO: Replace with Supabase profiles table update */
  updateProfile(updates) {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Not signed in.");
    const merged = { ...user, ...updates };
    const complete = Boolean(
      merged.name &&
        merged.profileEmail &&
        merged.phone &&
        merged.address &&
        merged.city &&
        merged.state &&
        merged.zip
    );
    merged.profileComplete = complete;
    const demo = DEMO_USERS.find((u) => u.email === user.email);
    if (demo) {
      Object.assign(demo, merged);
      persistDemoUsers();
    }
    return this.saveUser(merged);
  },

  /** TODO: Replace with Supabase Auth updateUser */
  changePassword(currentPassword, newPassword) {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Not signed in.");
    const demo = DEMO_USERS.find((u) => u.email === user.email);
    if (!demo) throw new Error("Account not found.");
    if (demo.password !== currentPassword) {
      throw new Error("Current password is incorrect.");
    }
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    demo.password = newPassword;
    demo.mustChangePassword = false;
    persistDemoUsers();
    return this.saveUser({ ...user, mustChangePassword: false });
  },

  /** First-time setup after temp password login — no need to re-enter temp password. */
  setPasswordAfterTempLogin(newPassword) {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Not signed in.");
    const demo = this.getDemoUser(user.email);
    if (!demo) throw new Error("Account not found.");
    if (!this.needsPasswordChange(user)) {
      throw new Error("Password was already set. Use Change Password on your account page.");
    }
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    demo.password = newPassword;
    demo.mustChangePassword = false;
    persistDemoUsers();
    return this.saveUser({ ...user, mustChangePassword: false });
  },

  _readResetTokens() {
    const raw = localStorage.getItem(RESET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  _writeResetTokens(tokens) {
    localStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(tokens));
  },

  getResetToken(token) {
    const entry = this._readResetTokens()[token];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      const tokens = this._readResetTokens();
      delete tokens[token];
      this._writeResetTokens(tokens);
      return null;
    }
    return entry;
  },

  /**
   * TODO: Replace with Supabase Auth resetPasswordForEmail (real email link).
   * Demo: creates a temporary link and returns it so the flow can be tested.
   */
  requestPasswordReset(loginId) {
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === loginId.toLowerCase());
    if (!user || !user.profileEmail) {
      return { demoLink: null };
    }

    const token = crypto.randomUUID();
    const tokens = this._readResetTokens();
    tokens[token] = {
      loginId: user.email,
      expiresAt: Date.now() + RESET_LINK_HOURS * 60 * 60 * 1000,
    };
    this._writeResetTokens(tokens);

    const demoLink = `reset-password.html?token=${encodeURIComponent(token)}`;
    return { demoLink, email: user.profileEmail };
  },

  /** TODO: Replace with Supabase Auth updateUser from recovery session */
  resetPasswordWithToken(token, newPassword) {
    const entry = this.getResetToken(token);
    if (!entry) throw new Error("This reset link is invalid or has expired.");
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    const demo = DEMO_USERS.find((u) => u.email === entry.loginId);
    if (!demo) throw new Error("Account not found.");

    demo.password = newPassword;
    demo.mustChangePassword = false;
    persistDemoUsers();

    const tokens = this._readResetTokens();
    delete tokens[token];
    this._writeResetTokens(tokens);

    return true;
  },
};

window.Auth = Auth;
