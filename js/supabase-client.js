// Supabase Client — guaranteed single instance
const SUPABASE_URL = 'https://rgttddjqxumrfmaxzhnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndHRkZGpxeHVtcmZtYXh6aG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjk2MTcsImV4cCI6MjA5NjkwNTYxN30.yYeNrjYyD1H58tVkhT4DkvL6jScA2dIAdHbk5cQFxhU';

function initSupabase() {
  if (window._sb) return; // Already initialized — prevent duplicate GoTrueClient
  if (typeof supabase === 'undefined' || !supabase.createClient) return; // CDN not loaded yet
  window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = window._sb;
  window.dispatchEvent(new Event('supabase-ready'));
}

// Try immediately (CDN may already be loaded)
initSupabase();

// Try again on DOMContentLoaded if CDN was slow
if (!window._sb && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
}

// Final safety net: try on window load
if (!window._sb) {
  window.addEventListener('load', initSupabase);
}
