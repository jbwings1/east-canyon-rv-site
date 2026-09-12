/**
 * Shared browser client. Uses the anon/publishable key from supabase-config.js.
 * Service role keys must stay server-side and never ship in this repo.
 *
 * Admin sessions use sessionStorage (cleared when the browser closes).
 * Member sessions stay in localStorage.
 */
(function () {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) {
    throw new Error("Load js/supabase-config.js before js/supabase-client.js.");
  }
  if (typeof supabase === "undefined" || !supabase.createClient) {
    throw new Error("Load js/supabase.js (Supabase JS UMD) before js/supabase-client.js.");
  }

  const ADMIN_SESSION_FLAG = "eastCanyonAdminSession";

  function adminSessionMode() {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_FLAG) === "1";
    } catch {
      return false;
    }
  }

  const dualStorage = {
    getItem(key) {
      try {
        const fromSession = sessionStorage.getItem(key);
        if (fromSession != null) return fromSession;
      } catch {
        /* ignore */
      }
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      if (adminSessionMode()) {
        try {
          sessionStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
        try {
          localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    removeItem(key) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };

  window.ecrSupabase = supabase.createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: dualStorage,
    },
  });
})();
