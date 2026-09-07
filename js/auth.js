/**
 * Auth + member data via Supabase (email/password, profiles, bookings).
 * Uses the publishable/anon key from js/supabase-config.js only — never a service_role key.
 */
const SESSION_KEY = "eastCanyonSupabaseSession";
const PROFILE_CACHE_KEY = "eastCanyonProfileCache";
const PENDING_PROFILE_KEY = "eastCanyonPendingProfile";
const LAST_BOOKING_KEY = "ecr-last-booking-confirmation";

const RESERVATION_TYPE_LABELS = {
  condo: "Condo",
  rv: "RV",
  "family-reunion": "Family reunion",
  family_reunion: "Family reunion",
  reunion: "Family reunion",
  "travel-trailer": "RV",
  motorhome: "RV",
  seasonal: "Member",
  guest: "Member",
};

function getConfig() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) {
    throw new Error("Supabase is not configured. Load js/supabase-config.js before js/auth.js.");
  }
  return cfg;
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

function readJson(key, fallback = null) {
  if (!storageAvailable()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!storageAvailable()) return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

function toDbReservationType(value) {
  if (value === "family-reunion" || value === "reunion") return "family_reunion";
  if (value === "travel-trailer" || value === "motorhome") return "rv";
  if (value === "condo" || value === "rv" || value === "family_reunion") return value;
  return null;
}

function toUiReservationType(value) {
  if (value === "family_reunion" || value === "reunion") return "family-reunion";
  if (value === "travel-trailer" || value === "motorhome") return "rv";
  if (value === "condo" || value === "rv" || value === "family-reunion") return value;
  return "";
}

function reservationTypeLabel(value) {
  return RESERVATION_TYPE_LABELS[value] || "";
}

function mapProfile(session, profile) {
  const authUser = session?.user || {};
  const email = profile?.email || authUser.email || "";
  const reservationType = toUiReservationType(profile?.reservation_type);
  return {
    id: authUser.id || profile?.id || "",
    email,
    name: profile?.full_name || authUser.user_metadata?.full_name || "",
    phone: profile?.phone || "",
    profileEmail: email,
    address: profile?.address || "",
    city: profile?.city || "",
    state: profile?.state || "",
    zip: profile?.zip || "",
    rv: profile?.rv_details || "",
    assignedSpot: profile?.assigned_spot || null,
    accountType: reservationType || profile?.reservation_type || "",
    reservationType,
    profileComplete: profile?.profile_complete === true,
    isAdmin: profile?.is_admin === true,
    accessToken: session?.access_token || "",
  };
}

function authHeaders(accessToken) {
  const { anonKey } = getConfig();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken || anonKey}`,
    "Content-Type": "application/json",
  };
  return headers;
}

async function api(path, options = {}) {
  const { url } = getConfig();
  const session = readJson(SESSION_KEY);
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      ...authHeaders(options.accessToken || session?.access_token),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!res.ok) {
    const err = new Error(formatApiError(body, res.status));
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function formatApiError(body, status) {
  const code = body?.error_code || body?.code || "";
  const msg = body?.msg || body?.error_description || body?.message || body?.error || "";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) {
    return "Confirm your email before signing in. Check your inbox for the East Canyon link.";
  }
  if (code === "invalid_credentials" || /invalid login/i.test(msg)) {
    return "Invalid email or password.";
  }
  if (code === "user_already_exists" || /already registered/i.test(msg)) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (code === "email_address_invalid") {
    return "Enter a real email address.";
  }
  if (code === "over_email_send_rate_limit") {
    return "Too many emails were sent. Wait a minute and try again.";
  }
  return msg || `Request failed (${status}).`;
}

function siteOrigin() {
  return window.location.origin + window.location.pathname.replace(/[^/]+$/, "");
}

const Auth = {
  storageAvailable,
  toDbReservationType,
  toUiReservationType,
  reservationTypeLabel,
  LAST_BOOKING_KEY,

  getSession() {
    return readJson(SESSION_KEY);
  },

  getCurrentUser() {
    const session = this.getSession();
    if (!session?.access_token || !session.user) return null;
    const cached = readJson(PROFILE_CACHE_KEY);
    return mapProfile(session, cached);
  },

  needsPasswordChange() {
    return false;
  },

  canAccessMembers(user = this.getCurrentUser()) {
    return Boolean(user);
  },

  isAdmin(user = this.getCurrentUser()) {
    return Boolean(user?.isAdmin);
  },

  showAdminLinks() {
    if (!this.isAdmin()) return;
    document.querySelectorAll("[data-admin-link]").forEach((el) => {
      el.hidden = false;
    });
  },

  async listAllProfiles() {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    const rows = await api(
      "/rest/v1/profiles?select=id,email,full_name,phone,reservation_type,assigned_spot,profile_complete,is_admin&order=full_name.asc.nullslast"
    );
    return Array.isArray(rows) ? rows : [];
  },

  async listAllBookings() {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    const rows = await api(
      "/rest/v1/bookings?select=id,user_id,reservation_type,spot,check_in,check_out,status,notes,created_at,confirmed_at&order=check_in.desc"
    );
    return Array.isArray(rows) ? rows : [];
  },

  async updateBookingStatus(bookingId, status) {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    if (status !== "confirmed" && status !== "cancelled") {
      throw new Error("Status must be confirmed or cancelled.");
    }
    const payload = { status };
    if (status === "confirmed") payload.confirmed_at = new Date().toISOString();
    const rows = await api(`/rest/v1/bookings?id=eq.${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },

  isProfileComplete(user = this.getCurrentUser()) {
    if (!user) return false;
    if (user.profileComplete === true) return true;
    return Boolean(
      user.name && user.profileEmail && user.phone && user.address && user.city && user.state && user.zip
    );
  },

  clearSession() {
    writeJson(SESSION_KEY, null);
    writeJson(PROFILE_CACHE_KEY, null);
  },

  clearAllSiteData() {
    this.clearSession();
    try {
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      sessionStorage.removeItem(LAST_BOOKING_KEY);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LAST_BOOKING_KEY);
    } catch {
      /* ignore */
    }
  },

  logout() {
    const session = this.getSession();
    if (session?.access_token) {
      api("/auth/v1/logout", { method: "POST" }).catch(() => {});
    }
    this.clearSession();
    window.location.href = "login.html";
  },

  requireAuth(redirectTo = "login.html") {
    const user = this.getCurrentUser();
    if (!user) {
      window.location.href = redirectTo;
      return null;
    }
    return user;
  },

  redirectForAuth(options = {}) {
    const { requireMember = false, loginPage = "login.html" } = options;
    const user = this.getCurrentUser();
    if (!requireMember) return user;
    if (!user) {
      window.location.href = loginPage;
      return null;
    }
    return user;
  },

  async ready() {
    const session = this.getSession();
    if (!session?.access_token) return this.getCurrentUser();
    try {
      await this.refreshProfile();
    } catch {
      /* keep cached profile */
    }
    return this.getCurrentUser();
  },

  async refreshProfile() {
    const session = this.getSession();
    if (!session?.user?.id) return null;
    const rows = await api(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`
    );
    const profile = Array.isArray(rows) ? rows[0] : rows;
    if (profile) writeJson(PROFILE_CACHE_KEY, profile);
    await this._applyPendingProfile();
    return this.getCurrentUser();
  },

  async _applyPendingProfile() {
    const session = this.getSession();
    if (!session?.user?.id) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_PROFILE_KEY) || "null");
    } catch {
      pending = null;
    }
    if (!pending || (pending.email && pending.email !== session.user.email)) return;

    const cached = readJson(PROFILE_CACHE_KEY) || {};
    const updates = {};
    if (pending.full_name && !cached.full_name) updates.full_name = pending.full_name;
    if (pending.phone && !cached.phone) updates.phone = pending.phone;
    if (pending.reservation_type && !cached.reservation_type) {
      updates.reservation_type = pending.reservation_type;
    }
    if (pending.rv_details && !cached.rv_details) updates.rv_details = pending.rv_details;
    if (!Object.keys(updates).length) {
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      return;
    }
    await this.updateProfileRaw(updates);
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
  },

  async signIn(email, password) {
    const body = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      accessToken: getConfig().anonKey,
      body: JSON.stringify({ email, password }),
    });
    const session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at,
      user: body.user,
    };
    writeJson(SESSION_KEY, session);
    try {
      await this.refreshProfile();
    } catch {
      writeJson(PROFILE_CACHE_KEY, null);
    }
    return this.getCurrentUser();
  },

  async signUp({ email, password, name, phone, reservationType, rv }) {
    const dbType = toDbReservationType(reservationType);
    const metadata = {
      full_name: name || "",
      phone: phone || "",
      reservation_type: dbType,
      rv_details: rv || "",
    };
    const redirectTo = `${siteOrigin()}login.html`;
    const body = await api(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      accessToken: getConfig().anonKey,
      body: JSON.stringify({
        email,
        password,
        data: metadata,
      }),
    });

    try {
      sessionStorage.setItem(
        PENDING_PROFILE_KEY,
        JSON.stringify({
          email,
          full_name: name || "",
          phone: phone || "",
          reservation_type: dbType,
          rv_details: rv || "",
        })
      );
    } catch {
      /* ignore */
    }

    if (body?.identities && body.identities.length === 0) {
      throw new Error("An account with this email already exists. Sign in instead.");
    }

    if (body?.access_token && body.user) {
      writeJson(SESSION_KEY, {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: body.expires_at,
        user: body.user,
      });
      try {
        await this.refreshProfile();
        await this.updateProfile({
          name,
          phone,
          reservationType,
          rv,
          profileEmail: email,
        });
      } catch {
        /* profile trigger may still be running */
      }
      return { user: this.getCurrentUser(), needsEmailConfirmation: false };
    }

    return { user: null, needsEmailConfirmation: true, email };
  },

  async updateProfileRaw(updates) {
    const session = this.getSession();
    if (!session?.user?.id) throw new Error("Not signed in.");
    const rows = await api(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(updates),
      }
    );
    const profile = Array.isArray(rows) ? rows[0] : rows;
    if (profile) writeJson(PROFILE_CACHE_KEY, profile);
    return this.getCurrentUser();
  },

  async updateProfile(updates) {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Not signed in.");
    const mergedName = updates.name ?? user.name;
    const mergedEmail = updates.profileEmail ?? user.profileEmail;
    const mergedPhone = updates.phone ?? user.phone;
    const mergedAddress = updates.address ?? user.address;
    const mergedCity = updates.city ?? user.city;
    const mergedState = updates.state ?? user.state;
    const mergedZip = updates.zip ?? user.zip;
    const complete = Boolean(
      mergedName && mergedEmail && mergedPhone && mergedAddress && mergedCity && mergedState && mergedZip
    );
    const payload = {
      full_name: mergedName || "",
      email: mergedEmail || user.email,
      phone: mergedPhone || "",
      address: mergedAddress || "",
      city: mergedCity || "",
      state: mergedState || "",
      zip: mergedZip || "",
      rv_details: updates.rv ?? user.rv ?? "",
      profile_complete: complete,
    };
    const dbType = toDbReservationType(updates.reservationType ?? user.reservationType);
    if (dbType) payload.reservation_type = dbType;
    return this.updateProfileRaw(payload);
  },

  async changePassword(currentPassword, newPassword) {
    const user = this.getCurrentUser();
    if (!user) throw new Error("Not signed in.");
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    await this.signIn(user.email, currentPassword);
    await api("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password: newPassword }),
    });
    return this.getCurrentUser();
  },

  async requestPasswordReset(email) {
    const redirectTo = `${siteOrigin()}reset-password.html`;
    await api(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      accessToken: getConfig().anonKey,
      body: JSON.stringify({ email }),
    });
    return { email };
  },

  async updatePassword(newPassword) {
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    const session = this.getSession();
    if (!session?.access_token) {
      throw new Error("This reset link is invalid or has expired.");
    }
    await api("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password: newPassword }),
    });
    return true;
  },

  acceptRecoveryFromUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const accessToken = hash.get("access_token") || query.get("access_token");
    const refreshToken = hash.get("refresh_token") || query.get("refresh_token");
    const type = hash.get("type") || query.get("type");
    if (!accessToken) return false;
    const payload = decodeJwt(accessToken);
    writeJson(SESSION_KEY, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: payload?.exp,
      user: {
        id: payload?.sub,
        email: payload?.email,
      },
    });
    if (window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return type === "recovery" || Boolean(accessToken);
  },

  async listBookings() {
    const user = this.getCurrentUser();
    if (!user?.id) return [];
    const rows = await api(
      `/rest/v1/bookings?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=check_in.desc`
    );
    return Array.isArray(rows) ? rows : [];
  },

  getActiveBookings(bookings = []) {
    const today = new Date().toISOString().split("T")[0];
    return bookings.filter(
      (b) => b.status === "confirmed" && b.check_in && b.check_in > today
    );
  },

  async createBooking({ reservationType, spot, checkIn, checkOut, notes }) {
    const user = this.getCurrentUser();
    if (!user?.id) throw new Error("Sign in to complete a booking.");
    const dbType = toDbReservationType(reservationType);
    if (!dbType) throw new Error("Choose Condo, Family reunion, or RV.");
    const now = new Date().toISOString();
    const rows = await api("/rest/v1/bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.id,
        reservation_type: dbType,
        spot: spot || null,
        check_in: checkIn,
        check_out: checkOut,
        status: "confirmed",
        notes: notes || null,
        confirmed_at: now,
      }),
    });
    const booking = Array.isArray(rows) ? rows[0] : rows;
    if (!booking) throw new Error("Booking could not be saved.");
    return booking;
  },

  saveLastBooking(record) {
    const payload = JSON.stringify(record);
    try {
      localStorage.setItem(LAST_BOOKING_KEY, payload);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.setItem(LAST_BOOKING_KEY, payload);
    } catch {
      /* ignore */
    }
  },

  getLastBooking() {
    try {
      const local = localStorage.getItem(LAST_BOOKING_KEY);
      if (local) return JSON.parse(local);
    } catch {
      /* ignore */
    }
    try {
      return JSON.parse(sessionStorage.getItem(LAST_BOOKING_KEY) || "null");
    } catch {
      return null;
    }
  },

  clearLastBooking() {
    try {
      localStorage.removeItem(LAST_BOOKING_KEY);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(LAST_BOOKING_KEY);
    } catch {
      /* ignore */
    }
  },
};

function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

window.Auth = Auth;
