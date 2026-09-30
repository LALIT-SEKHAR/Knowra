(function () {
  var theme = 'system';
  try {
    var stored = localStorage.getItem('knowra_theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') theme = stored;
  } catch (e) {}
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var resolved = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f3f0e8' : '#0a0a0a');
})();
