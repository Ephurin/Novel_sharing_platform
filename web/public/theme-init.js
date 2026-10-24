/* Run before styles/app to prevent a flash of the wrong color scheme. */
(function () {
  var key = 'storycraft-theme';
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var memory = null;
  function valid(value) { return value === 'light' || value === 'dark' || value === 'auto'; }
  function read() {
    if (memory) return memory;
    try {
      var value = localStorage.getItem(key);
      if (value !== null) return valid(value) ? value : 'auto';
      var legacy = localStorage.getItem('mantine-color-scheme-value');
      return valid(legacy) ? legacy : 'auto';
    } catch (_) { return 'auto'; }
  }
  function apply() {
    var preference = read();
    var resolved = preference === 'auto' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.mantineColorScheme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
  }
  function write(value) {
    memory = valid(value) ? value : 'auto';
    try { localStorage.setItem(key, memory); } catch (_) {}
    apply();
  }
  window.storycraftTheme = { read: read, write: write, apply: apply };
  media.addEventListener('change', apply);
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) { memory = null; apply(); }
  });
  apply();
})();
