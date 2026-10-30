/* Applies the saved appearance before first paint (kept out of index.html so the page can forbid inline scripts). */
// Apply the saved appearance before first paint to avoid a flash of the wrong theme.
(function () {
  try {
    var a = JSON.parse(localStorage.getItem('qubedu:appearance') || '{}');
    var d = document.documentElement;
    var dark = a.theme === 'dark' || (a.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    d.dataset.theme = dark ? 'dark' : 'light';
    if (a.design) d.dataset.design = a.design;
    if (a.skin) d.dataset.skin = a.skin;
    if (a.language) {
      d.lang = a.language;
      d.dir = a.language === 'ar' ? 'rtl' : 'ltr';
    }
  } catch (e) {}
})();
