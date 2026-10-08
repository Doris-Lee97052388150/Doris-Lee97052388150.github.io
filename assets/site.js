/* ===== Doris Lee personal site · shared helpers ===== */
(function () {
  'use strict';

  var SITE_ROOT = (function () {
    var s = document.currentScript;
    if (!s || !s.src) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf('assets/site.js') !== -1) { s = all[i]; break; }
      }
    }
    if (!s || !s.src) return './';
    return s.src.replace(/assets\/site\.js(\?.*)?$/, '');
  })();

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return map[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fmtSize(bytes) {
    if (bytes == null || bytes === '' || isNaN(bytes)) return '';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0, n = Number(bytes);
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? String(n) : n.toFixed(1)) + ' ' + u[i];
  }

  function loadManifest(cb) {
    fetch(SITE_ROOT + 'apps/manifest.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (m) { cb(null, (m && m.apps) ? m.apps : []); })
      .catch(function (e) { cb(e, []); });
  }

  function renderApps(el, apps) {
    if (!apps || !apps.length) {
      el.innerHTML = '<div class="empty">还没有导入任何网页包。<br>把 zip 放进仓库的 <code>_incoming/</code> 目录，' +
        '或直接到 <a href="' + esc(SITE_ROOT) + 'import/">导入页</a> 看操作步骤。</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < apps.length; i++) {
      var a = apps[i];
      var url = SITE_ROOT + 'apps/' + encodeURIComponent(a.slug) + '/';
      html += '<div class="appitem"><div class="meta"><b>' + esc(a.title || a.slug) + '</b>';
      if (a.description) html += '<span>' + esc(a.description) + '</span>';
      if (a.importedAt) html += '<span>导入于 ' + esc(fmtDate(a.importedAt)) + '</span>';
      if (a.fileCount) html += '<span> · ' + esc(a.fileCount) + ' 个文件</span>';
      if (a.size) html += '<span> · ' + esc(fmtSize(a.size)) + '</span>';
      html += '</div><div class="btnrow"><a class="btn small" href="' + esc(url) + '">打开</a></div></div>';
    }
    el.innerHTML = html;
  }

  window.DL = {
    root: SITE_ROOT,
    esc: esc,
    fmtDate: fmtDate,
    fmtSize: fmtSize,
    loadManifest: loadManifest,
    renderApps: renderApps
  };

  window.renderApps = function (elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    var counter = document.getElementById('appCount');
    loadManifest(function (err, apps) {
      if (err) {
        el.innerHTML = '<div class="empty">读取 apps/manifest.json 失败：' + esc(err.message) + '</div>';
        if (counter) counter.textContent = '读取失败';
        return;
      }
      renderApps(el, apps);
      if (counter) {
        if (!apps.length) { counter.textContent = '暂无导入的应用'; return; }
        var total = 0;
        for (var i = 0; i < apps.length; i++) { total += Number(apps[i].size || 0); }
        counter.textContent = '已导入 ' + apps.length + ' 个应用' + (total ? ' · ' + fmtSize(total) : '');
      }
    });
  };
})();
