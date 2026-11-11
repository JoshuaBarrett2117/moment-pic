// 首屏前设置主题与背景，避免闪烁。CSP 为 script-src 'self'，必须是同源文件。
(function () {
  var themes = ['glass-dark', 'rose-paper'];
  var id = 'glass-dark';
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('moment-pic:theme');
    if (saved && themes.indexOf(saved) !== -1) id = saved;
  } catch (e) {}
  root.setAttribute('data-theme', id);
  if (id === 'rose-paper') root.style.colorScheme = 'light';

  var bg = 'default';
  try {
    var mode = localStorage.getItem('moment-pic:bg-mode');
    var url = localStorage.getItem('moment-pic:bg-url');
    var loggedIn = localStorage.getItem('auth_token') === 'authenticated';
    if (mode === 'none') bg = 'none';
    else if (mode === 'custom' && loggedIn && url && /^\/api\/v1\/account\/background\?v=[0-9a-f]{12}$/.test(url)) {
      bg = 'custom';
      root.style.setProperty('--mp-bg-image', 'url("' + url + '")');
    }
  } catch (e) {}
  root.setAttribute('data-bg', bg);
})();
