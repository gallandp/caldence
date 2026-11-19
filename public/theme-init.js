// Applies the light or dark scheme and the language picked in this browser before the first paint
// (see src/ui/state/theme.ts and language.ts). A separate file because the Content Security Policy
// allows no inline scripts.
try {
  var theme = localStorage.getItem('caldence.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  var locale = localStorage.getItem('caldence.locale');
  if (locale === 'de' || locale === 'en') document.documentElement.lang = locale;
} catch {
  // Blocked storage: follow the system and the file.
}

// JavaScript runs: hide the static intro of index.html until the app replaces it (#135).
document.documentElement.classList.add('js');
