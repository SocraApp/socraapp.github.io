// Supabase Client Initialization
const SUPABASE_URL = 'https://rgttddjqxumrfmaxzhnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndHRkZGpxeHVtcmZtYXh6aG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjk2MTcsImV4cCI6MjA5NjkwNTYxN30.yYeNrjYyD1H58tVkhT4DkvL6jScA2dIAdHbk5cQFxhU';

let sb;

function initSB() {
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sb = sb;
    // Dispatch event so other scripts know Supabase is ready
    window.dispatchEvent(new Event('supabase-ready'));
  }
}

// Try to init immediately (works if CDN script loaded first)
initSB();

// Also try on DOMContentLoaded as fallback
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSB);
}
