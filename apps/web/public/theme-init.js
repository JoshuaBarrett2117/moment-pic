// 首屏前设置主题，避免闪烁。CSP 为 script-src 'self'，必须是同源文件。
(function () {
  var themes = ['glass-dark'];
  var id = 'glass-dark';
  try {
    var saved = localStorage.getItem('moment-pic:theme');
    if (saved && themes.indexOf(saved) !== -1) id = saved;
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', id);
})();
