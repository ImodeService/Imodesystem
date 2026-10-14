/* Settings shared by every module. The anon key is public by design (every browser gets it);
   Supabase RLS is what protects the data. Never put the service_role key here. */
window.IMODE_CONFIG = {
  supabaseUrl: 'https://cwrkquzuuyhfhesozqnb.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cmtxdXp1dXloZmhlc296cW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NTgwNzAsImV4cCI6MjEwNjEzNDA3MH0.JhWDk3su9Pf9XZSPTDe4sWJiHKE3Pl2OPKHvTj0QTgw',
  // Staff sign in with a username; it maps to <username>@<usernameDomain>, same as the old app.
  usernameDomain: 'imode.local',
  // One session key for the whole platform so a login carries across modules.
  storageKey: 'imode-platform-auth'
};
