// Applies a light or dark scheme picked in the app before the first paint (see src/ui/state/theme.ts).
// A separate file because the Content Security Policy allows no inline scripts.
try {
  var theme = localStorage.getItem('caldence.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Blocked storage: follow the system.
}
