// Supabase connection.
//
// SUPABASE_ANON_KEY is the "publishable" key from Project Settings ->
// API. It is SAFE to expose in client-side code — access is gated
// entirely by the Row Level Security policies and SECURITY DEFINER
// functions defined in supabase/schema.sql, not by keeping this key
// secret. Never put the "secret" (service_role) key here or in any
// file that ships to the browser — it bypasses every security rule
// this project relies on.
const SUPABASE_URL = "https://bympsaslhwtbzeuwnrev.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pNl1eYD7aIjemuX34UNaKg_PJZWTdIA";
