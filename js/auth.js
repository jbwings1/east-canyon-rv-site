/**
 * Auth + member data via the official Supabase JS client.
 * Config/keys live in js/supabase-config.js — never put a service_role key in the frontend.
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

function getClient() {
  if (!window.ecrSupabase) {
    throw new Error("Supabase client is not ready. Load js/supabase-client.js before js/auth.js.");
  }
  return window.ecrSupabase;
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
  const adminTasks = Array.isArray(profile?.admin_tasks) ? profile.admin_tasks : [];
  return {
    id: authUser.id || profile?.id || "",
    email,
    name: profile?.full_name || authUser.user_metadata?.full_name || "",
    phone: profile?.phone || authUser.user_metadata?.phone || "",
    profileEmail: email,
    address: profile?.address || "",
    city: profile?.city || "",
    state: profile?.state || "",
    zip: profile?.zip || "",
    rv: profile?.rv_details || authUser.user_metadata?.rv_details || "",
    assignedSpot: profile?.assigned_spot || null,
    accountType: reservationType || profile?.reservation_type || "",
    reservationType,
    profileComplete: profile?.profile_complete === true,
    isAdmin: profile?.is_admin === true && profile?.account_kind === "admin",
    accountKind: profile?.account_kind || "member",
    accountStatus: profile?.account_status || "active",
    memberId: profile?.member_id || "",
    mustChangePassword: profile?.must_change_password === true,
    adminLevel: profile?.admin_level || null,
    adminSeat: profile?.admin_seat || "",
    staffCode: profile?.staff_code || "",
    adminTasks,
    accessToken: session?.access_token || "",
  };
}

function siteOrigin() {
  return window.location.origin + window.location.pathname.replace(/[^/]+$/, "");
}

function officialStorageKey() {
  try {
    const host = new URL(window.SUPABASE_CONFIG.url).hostname;
    const ref = host.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return "sb-jmxlewxczfnxciamrtze-auth-token";
  }
}

function readOfficialSession() {
  try {
    const raw = localStorage.getItem(officialStorageKey());
    if (!raw) return readJson(SESSION_KEY);
    const parsed = JSON.parse(raw);
    if (parsed?.access_token) return parsed;
    if (parsed?.currentSession?.access_token) return parsed.currentSession;
    return parsed || readJson(SESSION_KEY);
  } catch {
    return readJson(SESSION_KEY);
  }
}

function cacheSession(session) {
  if (!session?.access_token) {
    writeJson(SESSION_KEY, null);
    return;
  }
  writeJson(SESSION_KEY, {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: session.user,
  });
}

function formatClientError(error) {
  const code = error?.code || error?.error_code || "";
  const msg = error?.message || error?.msg || "";
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
  return msg || "Request failed.";
}

function throwIfError(error) {
  if (error) throw new Error(formatClientError(error));
}

const Auth = {
  storageAvailable,
  toDbReservationType,
  toUiReservationType,
  reservationTypeLabel,
  LAST_BOOKING_KEY,

  getSession() {
    return readOfficialSession();
  },

  getCurrentUser() {
    const session = this.getSession();
    if (!session?.access_token || !session.user) return null;
    const cached = readJson(PROFILE_CACHE_KEY);
    return mapProfile(session, cached);
  },

  needsPasswordChange(user = this.getCurrentUser()) {
    return Boolean(user?.mustChangePassword);
  },

  canAccessMembers(user = this.getCurrentUser()) {
    if (!user) return false;
    if (user.accountKind === "admin") return false;
    if (user.accountStatus === "suspended" || user.accountStatus === "closed") return false;
    return true;
  },

  isMemberAccount(user = this.getCurrentUser()) {
    return Boolean(user && user.accountKind === "member");
  },

  isAdmin(user = this.getCurrentUser()) {
    return Boolean(user?.isAdmin && user?.accountKind === "admin" && user?.accountStatus === "active");
  },

  hasAdminTask(task, user = this.getCurrentUser()) {
    if (!this.isAdmin(user)) return false;
    if (user.adminLevel === 1) return true;
    return Array.isArray(user.adminTasks) && user.adminTasks.includes(task);
  },

  async verifyAdmin() {
    try {
      const { data, error } = await getClient().rpc("is_admin");
      if (!error && data === true) return true;
    } catch {
      /* fall back to the cached profile flag */
    }
    try {
      await this.refreshProfile();
    } catch {
      /* keep cached profile */
    }
    return this.isAdmin();
  },

  showAdminLinks() {
    if (!this.isAdmin()) return;
    document.querySelectorAll("[data-admin-link]").forEach((el) => {
      el.hidden = false;
    });
  },

  async listAllProfiles() {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    const { data, error } = await getClient()
      .from("profiles")
      .select(
        "id,email,full_name,phone,address,city,state,zip,reservation_type,assigned_spot,profile_complete,is_admin,account_kind,account_status,member_id,must_change_password,admin_level,admin_seat,staff_code,admin_tasks"
      )
      .order("full_name", { ascending: true, nullsFirst: false });
    throwIfError(error);
    return data || [];
  },

  async listMemberProfiles() {
    const rows = await this.listAllProfiles();
    return rows.filter((p) => p.account_kind === "member");
  },

  async listStaffProfiles() {
    const rows = await this.listAllProfiles();
    return rows.filter((p) => p.account_kind === "admin");
  },

  async provisionUser(payload) {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    const session = this.getSession();
    if (!session?.access_token) throw new Error("Not signed in.");
    const response = await fetch(
      `${window.SUPABASE_CONFIG.url}/functions/v1/admin-provision-user`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: window.SUPABASE_CONFIG.anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(data.error || "Could not create the account.");
    }
    return data;
  },

  async createBookingForMember({
    memberUserId,
    reservationType,
    spot,
    checkIn,
    checkOut,
    notes,
  }) {
    if (!this.hasAdminTask("reservations_manage")) {
      throw new Error("You are not assigned the Reservations manage task.");
    }
    const admin = this.getCurrentUser();
    if (!admin?.id) throw new Error("Admin sign in required.");
    if (!memberUserId) throw new Error("Choose a member.");
    if (memberUserId === admin.id) {
      throw new Error("Admins cannot book for themselves. Use a member account.");
    }
    const dbType = toDbReservationType(reservationType);
    if (!dbType) throw new Error("Choose Condo, Family reunion, or RV.");
    const now = new Date().toISOString();
    const { data, error } = await getClient()
      .from("bookings")
      .insert({
        user_id: memberUserId,
        reservation_type: dbType,
        spot: spot || null,
        check_in: checkIn,
        check_out: checkOut,
        status: "confirmed",
        notes: notes || null,
        confirmed_at: now,
      })
      .select()
      .maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Booking could not be saved.");
    return data;
  },

  async clearMustChangePassword() {
    const { error } = await getClient().rpc("clear_must_change_password");
    throwIfError(error);
    await this.refreshProfile();
    return this.getCurrentUser();
  },

  async activateMemberAccount({ email, memberId, temporaryPassword }) {
    const user = await this.signIn(email, temporaryPassword);
    if (!user || user.accountKind !== "member") {
      await this.signOutQuiet();
      throw new Error("This is not a member account. Use Admin Sign In for staff.");
    }
    if (String(user.memberId || "").trim() !== String(memberId || "").trim()) {
      await this.signOutQuiet();
      throw new Error("Member ID does not match this email.");
    }
    if (user.accountStatus === "suspended" || user.accountStatus === "closed") {
      await this.signOutQuiet();
      throw new Error("This member account is not active. Contact the office.");
    }
    return user;
  },

  async listAllBookings() {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    const { data, error } = await getClient()
      .from("bookings")
      .select("id,user_id,reservation_type,spot,check_in,check_out,status,notes,created_at,confirmed_at")
      .order("check_in", { ascending: false });
    throwIfError(error);
    return data || [];
  },

  async updateBookingStatus(bookingId, status) {
    if (!this.isAdmin()) throw new Error("Admin access required.");
    if (status !== "confirmed" && status !== "cancelled") {
      throw new Error("Status must be confirmed or cancelled.");
    }
    const payload = { status };
    if (status === "confirmed") payload.confirmed_at = new Date().toISOString();
    const { data, error } = await getClient()
      .from("bookings")
      .update(payload)
      .eq("id", bookingId)
      .select()
      .maybeSingle();
    throwIfError(error);
    return data;
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
    try {
      localStorage.removeItem(officialStorageKey());
    } catch {
      /* ignore */
    }
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

  async signOutQuiet() {
    try {
      await getClient().auth.signOut();
    } catch {
      /* ignore */
    }
    this.clearSession();
  },

  logout(redirectTo = "login.html") {
    this.signOutQuiet().finally(() => {
      window.location.href = redirectTo || "login.html";
    });
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
    try {
      const { data, error } = await getClient().auth.getSession();
      if (!error && data?.session) cacheSession(data.session);
    } catch {
      /* keep cached session */
    }
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
    const { data, error } = await getClient()
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    throwIfError(error);
    if (data) writeJson(PROFILE_CACHE_KEY, data);
    await this._applyPendingProfile();
    return this.getCurrentUser();
  },

  async _waitForProfile(userId, attempts = 6) {
    for (let i = 0; i < attempts; i += 1) {
      const { data } = await getClient().from("profiles").select("*").eq("id", userId).maybeSingle();
      if (data) return data;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
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
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    throwIfError(error);
    cacheSession(data.session);
    try {
      await this.refreshProfile();
    } catch {
      writeJson(PROFILE_CACHE_KEY, null);
    }
    const user = this.getCurrentUser();
    if (user?.accountStatus === "suspended" || user?.accountStatus === "closed") {
      await this.signOutQuiet();
      throw new Error("This account is closed or suspended. Contact the office.");
    }
    return user;
  },

  async signInAsMember(email, password) {
    const user = await this.signIn(email, password);
    if (user?.accountKind === "admin") {
      await this.signOutQuiet();
      throw new Error("Use Admin Sign In for staff accounts. Member Sign In is for members only.");
    }
    return user;
  },

  async signInAsAdmin(email, password) {
    const user = await this.signIn(email, password);
    const isAdmin = await this.verifyAdmin();
    if (!isAdmin || user?.accountKind !== "admin") {
      await this.signOutQuiet();
      throw new Error("This account does not have administrator access.");
    }
    return user;
  },

  async signUp({ email, password, name, phone, reservationType, rv }) {
    const dbType = toDbReservationType(reservationType);
    const metadata = {
      full_name: name || "",
      phone: phone || "",
    };
    if (dbType) metadata.reservation_type = dbType;
    if (rv) metadata.rv_details = rv;

    const pending = {
      email,
      full_name: name || "",
      phone: phone || "",
    };
    if (dbType) pending.reservation_type = dbType;
    if (rv) pending.rv_details = rv;

    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${siteOrigin()}login.html`,
      },
    });
    throwIfError(error);

    try {
      sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(pending));
    } catch {
      /* ignore */
    }

    if (data?.user?.identities && data.user.identities.length === 0) {
      throw new Error("An account with this email already exists. Sign in instead.");
    }

    if (data?.session) {
      cacheSession(data.session);
      try {
        const profile = await this._waitForProfile(data.user.id);
        if (profile) writeJson(PROFILE_CACHE_KEY, profile);
        const profileUpdates = {
          name,
          phone,
          profileEmail: email,
        };
        if (reservationType) profileUpdates.reservationType = reservationType;
        if (rv) profileUpdates.rv = rv;
        await this.updateProfile(profileUpdates);
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
    const { data, error } = await getClient()
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id)
      .select()
      .maybeSingle();
    throwIfError(error);
    if (data) writeJson(PROFILE_CACHE_KEY, data);
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
    const { error } = await getClient().auth.updateUser({ password: newPassword });
    throwIfError(error);
    return this.getCurrentUser();
  },

  async requestPasswordReset(email) {
    const { error } = await getClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${siteOrigin()}reset-password.html`,
    });
    throwIfError(error);
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
    const { error } = await getClient().auth.updateUser({ password: newPassword });
    throwIfError(error);
    try {
      await this.clearMustChangePassword();
    } catch {
      /* profile flag may already be clear */
    }
    return true;
  },

  async createBooking({ reservationType, spot, checkIn, checkOut, notes }) {
    const user = this.getCurrentUser();
    if (!user?.id) throw new Error("Sign in to complete a booking.");
    if (user.accountKind === "admin") {
      throw new Error("Admins cannot book while signed in as admin. Use a member account.");
    }
    if (!this.canAccessMembers(user)) {
      throw new Error("Member access required to book.");
    }
    const dbType = toDbReservationType(reservationType);
    if (!dbType) throw new Error("Choose Condo, Family reunion, or RV.");
    const now = new Date().toISOString();
    const { data, error } = await getClient()
      .from("bookings")
      .insert({
        user_id: user.id,
        reservation_type: dbType,
        spot: spot || null,
        check_in: checkIn,
        check_out: checkOut,
        status: "confirmed",
        notes: notes || null,
        confirmed_at: now,
      })
      .select()
      .maybeSingle();
    throwIfError(error);
    if (!data) throw new Error("Booking could not be saved.");
    return data;
  },

  acceptRecoveryFromUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const accessToken = hash.get("access_token") || query.get("access_token");
    const refreshToken = hash.get("refresh_token") || query.get("refresh_token");
    const type = hash.get("type") || query.get("type");
    if (!accessToken) return Boolean(this.getCurrentUser());
    const payload = decodeJwt(accessToken);
    cacheSession({
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
    const { data, error } = await getClient()
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      .order("check_in", { ascending: false });
    throwIfError(error);
    return data || [];
  },

  getActiveBookings(bookings = []) {
    const today = new Date().toISOString().split("T")[0];
    return bookings.filter(
      (b) => b.status === "confirmed" && b.check_in && b.check_in > today
    );
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
