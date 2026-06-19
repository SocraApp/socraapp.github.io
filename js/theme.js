/**
 * Socra theme + accent color system — shared across all pages.
 *
 * This file is loaded in <head> BEFORE the page renders, so it applies the
 * theme + accent color immediately (anti-flicker). It reads from localStorage
 * which is synced from the server profile when the user signs in.
 *
 * Usage in HTML <head> (before any other scripts):
 *   <link rel="stylesheet" href="/css/style.css">
 *   <script src="/js/theme.js"></script>
 *
 * Then call SocraTheme.initProfile(profile) after loading the user's profile
 * to sync server preferences to localStorage + re-apply.
 */
(function () {
  'use strict';

  // ============================================
  // Color helpers
  // ============================================
  function hexToRgb(hex) {
    var m = hex && hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return null;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  function lightenRgb(rgb, amt) {
    return [
      Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * amt)),
      Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * amt)),
      Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * amt))
    ];
  }
  function darkenRgb(rgb, amt) {
    return [Math.round(rgb[0] * (1 - amt)), Math.round(rgb[1] * (1 - amt)), Math.round(rgb[2] * (1 - amt))];
  }
  function rgbStr(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }

  // ============================================
  // Theme (system / light / dark)
  // ============================================
  function isEffectivelyDark(theme) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme(theme) {
    var isDark = isEffectivelyDark(theme);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // Swap highlight.js theme stylesheet to match
    var hljsLink = document.getElementById('hljs-theme');
    if (hljsLink) {
      hljsLink.href = isDark
        ? 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css'
        : 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
    }
    // Re-apply accent color so it adapts to the new mode
    applyAccentColor(localStorage.getItem('socra_accent') || '');
    // Cache in localStorage for anti-flicker on next page load
    localStorage.setItem('socra_theme', theme);
  }

  // ============================================
  // Accent color
  // ============================================
  function applyAccentColor(hex) {
    if (!hex) {
      // Reset to default (clear inline styles so CSS defaults apply)
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-hover');
      document.documentElement.style.removeProperty('--primary-10');
      document.documentElement.style.removeProperty('--primary-06');
      return;
    }
    var rgb = hexToRgb(hex);
    if (!rgb) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    // In dark mode, lighten the accent for visibility; in light mode, use as-is
    var adapted = isDark ? lightenRgb(rgb, 0.4) : rgb;
    var hover = isDark ? lightenRgb(rgb, 0.6) : darkenRgb(rgb, 0.15);
    document.documentElement.style.setProperty('--primary', rgbStr(adapted));
    document.documentElement.style.setProperty('--primary-hover', rgbStr(hover));
    document.documentElement.style.setProperty('--primary-10', 'rgba(' + adapted.join(',') + ',0.10)');
    document.documentElement.style.setProperty('--primary-06', 'rgba(' + adapted.join(',') + ',0.06)');
  }

  // ============================================
  // Anti-flicker: apply theme + accent ASAP from localStorage
  // ============================================
  try {
    var theme = localStorage.getItem('socra_theme') || 'system';
    var isDark = isEffectivelyDark(theme);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    var hljsLink = document.getElementById('hljs-theme');
    if (hljsLink) {
      hljsLink.href = isDark
        ? 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css'
        : 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
    }
    var accent = localStorage.getItem('socra_accent') || '';
    if (accent) applyAccentColor(accent);
  } catch (e) { /* localStorage might be unavailable */ }

  // Listen for OS theme changes when in System mode
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      var current = localStorage.getItem('socra_theme') || 'system';
      if (current === 'system') applyTheme('system');
    });
  }

  // ============================================
  // Public API
  // ============================================
  window.SocraTheme = {
    applyTheme: applyTheme,
    applyAccentColor: applyAccentColor,
    isEffectivelyDark: isEffectivelyDark,
    /** Sync server profile preferences to localStorage + re-apply.
     *  Called after loadProfile(). Only overwrites localStorage if the server
     *  actually has a value — this prevents wiping a locally-set preference
     *  when the server column is null/missing. */
    initProfile: function (profile) {
      // Theme: server value takes precedence if present, otherwise keep localStorage
      var serverTheme = profile && profile.theme;
      var theme = serverTheme || localStorage.getItem('socra_theme') || 'system';
      localStorage.setItem('socra_theme', theme);
      applyTheme(theme);
      // Accent: only overwrite localStorage if the server has a non-empty value.
      // If the server value is null/undefined/empty, keep the existing localStorage
      // value (the user may have just set it via Settings and it hasn't synced yet).
      var serverAccent = profile && profile.accent_color;
      if (serverAccent) {
        localStorage.setItem('socra_accent', serverAccent);
      }
      var accent = localStorage.getItem('socra_accent') || '';
      applyAccentColor(accent);
    },
    /** Get the current theme preference from localStorage. */
    getTheme: function () { return localStorage.getItem('socra_theme') || 'system'; },
    /** Get the current accent color from localStorage (empty string = default). */
    getAccentColor: function () { return localStorage.getItem('socra_accent') || ''; }
  };
})();
