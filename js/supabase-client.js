// Supabase Client — single instance
const SUPABASE_URL = 'https://rgttddjqxumrfmaxzhnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndHRkZGpxeHVtcmZtYXh6aG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjk2MTcsImV4cCI6MjA5NjkwNTYxN30.yYeNrjYyD1H58tVkhT4DkvL6jScA2dIAdHbk5cQFxhU';
if (!window._sb) {
  function initSB() {
    if (typeof supabase !== 'undefined' && supabase.createClient && !window._sb) {
      window._sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.sb = window._sb;
      window.dispatchEvent(new Event('supabase-ready'));
    }
  }
  initSB();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSB);
}
