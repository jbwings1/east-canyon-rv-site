/**
 * Browser Supabase config — publishable/anon key only.
 * Never put the service_role key in frontend code or commit it here.
 *
 * Promote the first admin in the Supabase SQL editor (not from this site):
 *   update profiles set is_admin = true where email = 'you@example.com';
 */
window.SUPABASE_CONFIG = {
  url: "https://jmxlewxczfnxciamrtze.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpteGxld3hjemZueGNpYW1ydHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MTAzMTIsImV4cCI6MjEwNDM4NjMxMn0.Bskn6FYSmjf6kVbDoD9GD14PR0SKlOGrGNfxo2Eaapc",
};
