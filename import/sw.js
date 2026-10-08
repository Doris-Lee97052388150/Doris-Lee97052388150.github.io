/* Service worker: 在浏览器里把内存中的 zip 内容当作一个临时网站来提供，用于预览。 */
'use strict';

var store = {};

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'load') {
    store = d.files || {};
    var n = Object.keys(store).length;
    var msg = { type: 'loaded', count: n };
    if (e.ports && e.ports[0]) e.ports[0].postMessage(msg);
    else if (e.source) e.source.postMessage(msg);
  }
});

var TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', xml: 'application/xml',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject', mp3: 'audio/mpeg', mp4: 'video/mp4',
  webm: 'video/webm', wasm: 'application/wasm', pdf: 'application/pdf', zip: 'application/zip'
};

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  var marker = '/import/preview/';
  var i = url.pathname.indexOf(marker);
  if (i === -1) return;

  var rest = url.pathname.slice(i + marker.length);
  var slash = rest.indexOf('/');
  var p = slash === -1 ? 'index.html' : rest.slice(slash + 1);
  try { p = decodeURIComponent(p); } catch (err) { /* keep raw */ }
  if (!p) p = 'index.html';

  var buf = Object.prototype.hasOwnProperty.call(store, p) ? store[p] : null;
  if (!buf) {
    e.respondWith(new Response('预览包中找不到文件: ' + p, {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    }));
    return;
  }

  var ext = p.indexOf('.') === -1 ? '' : p.split('.').pop().toLowerCase();
  var type = TYPES[ext] || 'application/octet-stream';
  var headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };

  if (ext === 'html' || ext === 'htm') {
    e.respondWith(new Response(buf, { headers: headers }));
    return;
  }
  e.respondWith(new Response(buf, { headers: headers }));
});
