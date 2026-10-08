#!/usr/bin/env node
/**
 * import-zip.mjs — 把一个静态网页 zip 包解压成 apps/<slug>/ 子页面，并更新 apps/manifest.json
 *
 * 用法：
 *   node tools/import-zip.mjs my-site.zip
 *   node tools/import-zip.mjs my-site.zip --slug my-app --title "我的应用" --desc "一句话说明"
 *   node tools/import-zip.mjs --all-incoming     # 处理 _incoming/ 下所有 zip（GitHub Actions 用）
 *   node tools/import-zip.mjs --list             # 列出已导入的应用
 *
 * 零依赖：内置最小 zip 解包器（store + deflate，含基础 zip64 支持）。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BS = String.fromCharCode(92); // 反斜杠，避免转义混乱

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const INCOMING_DIR = path.join(REPO_ROOT, '_incoming');
const MANIFEST_PATH = path.join(APPS_DIR, 'manifest.json');

/* ------------------------------------------------------------------ */
/* 最小 zip 解包器                                                      */
/* ------------------------------------------------------------------ */

function findEOCD(buf) {
  const stop = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) return i;
  }
  return -1;
}

function findZip64EOCD(buf, eocdOffset) {
  for (let i = eocdOffset - 20; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x06 && buf[i + 3] === 0x07) {
      return Number(buf.readBigUInt64LE(i + 8));
    }
  }
  return -1;
}

function decodeName(bytes, flags) {
  if (flags & 0x800) return new TextDecoder('utf-8').decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch (e) {
    return utf8;
  }
}

function isJunk(name) {
  const parts = name.split('/');
  const base = parts[parts.length - 1];
  if (base === '') return true;
  if (base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini') return true;
  if (parts.includes('__MACOSX')) return true;
  return false;
}

function normalizeName(name) {
  return name.split(BS).join('/');
}

function isUnsafe(name) {
  if (name.startsWith('/')) return true;
  const parts = normalizeName(name).split('/');
  return parts.includes('..');
}

function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const eocd = findEOCD(buf);
  if (eocd < 0) throw new Error('不是有效的 zip 文件（找不到中央目录结尾记录）');

  let total = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const z64 = findZip64EOCD(buf, eocd);
    if (z64 >= 0) {
      total = Number(buf.readBigUInt64LE(z64 + 32));
      cdSize = Number(buf.readBigUInt64LE(z64 + 40));
      cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
    }
  }

  const written = [];
  let p = cdOffset;

  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length) break;
    if (buf.readUInt32LE(p) !== 0x02014b50) break;

    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    let compSize = buf.readUInt32LE(p + 20);
    let uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);

    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    const name = decodeName(rawName, flags);

    if (uncompSize === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = buf.readUInt16LE(e);
        const sz = buf.readUInt16LE(e + 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompSize === 0xffffffff) { uncompSize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (compSize === 0xffffffff) { compSize = Number(buf.readBigUInt64LE(q)); q += 8; }
          if (localOffset === 0xffffffff) { localOffset = Number(buf.readBigUInt64LE(q)); q += 8; }
          break;
        }
        e += 4 + sz;
      }
    }

    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (isJunk(name)) continue;
    if (isUnsafe(name)) {
      console.warn('  跳过不安全路径: ' + name);
      continue;
    }
    if (localOffset + 30 > buf.length) continue;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) continue;

    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      data = zlib.inflateRawSync(raw);
    } else {
      throw new Error('不支持的压缩方式 ' + method + '（文件 ' + name + '）');
    }

    const outPath = path.join(destDir, normalizeName(name));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, data);
    written.push(normalizeName(name));
  }

  if (!written.length) throw new Error('zip 里没有可用文件');
  return written;
}

/* ------------------------------------------------------------------ */
/* 目录工具                                                            */
/* ------------------------------------------------------------------ */

function detectRoot(dir) {
  const entries = fs.readdirSync(dir).filter(function (n) { return n !== '.DS_Store'; });
  if (entries.length === 1) {
    const only = path.join(dir, entries[0]);
    try {
      if (fs.statSync(only).isDirectory()) return only;
    } catch (e) { /* ignore */ }
  }
  return dir;
}

function findEntry(root) {
  for (const cand of ['index.html', 'index.htm']) {
    if (fs.existsSync(path.join(root, cand))) return cand;
  }
  const found = [];
  (function walk(d, depth) {
    if (depth > 4) return;
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { return; }
    for (const n of names) {
      const f = path.join(d, n);
      let st;
      try { st = fs.statSync(f); } catch (e) { continue; }
      if (st.isDirectory()) walk(f, depth + 1);
      else if (n.toLowerCase().endsWith('.html') || n.toLowerCase().endsWith('.htm')) {
        found.push(path.relative(root, f).split(BS).join('/'));
      }
    }
  })(root, 0);
  found.sort(function (a, b) {
    const da = a.split('/').length, db = b.split('/').length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
  return found[0] || null;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n);
    const d = path.join(dest, n);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function dirStats(dir) {
  let files = 0, size = 0;
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      const st = fs.statSync(f);
      if (st.isDirectory()) walk(f);
      else { files++; size += st.size; }
    }
  })(dir);
  return { fileCount: files, size: size };
}

function slugify(s) {
  const src = String(s == null ? '' : s).trim();
  let out = '';
  for (const ch of src) {
    const bad = ('/' + BS + ':*?"<>|').includes(ch) || ch.trim() === '' || ch.charCodeAt(0) < 32;
    out += bad ? '-' : ch;
  }
  out = out.replace(/^-+/, '').replace(/-+$/, '');
  while (out.includes('--')) out = out.split('--').join('-');
  if (out.length > 60) out = out.slice(0, 60).replace(/-+$/, '');
  return out;
}

/* ------------------------------------------------------------------ */
/* manifest                                                            */
/* ------------------------------------------------------------------ */

function loadManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const m = JSON.parse(raw);
    if (!Array.isArray(m.apps)) m.apps = [];
    return m;
  } catch (e) {
    return { version: 1, updatedAt: null, apps: [] };
  }
}

function saveManifest(m) {
  m.version = 1;
  m.apps.sort(function (a, b) {
    return String(b.importedAt || '').localeCompare(String(a.importedAt || ''));
  });
  // 内容没变就不写文件，否则 GitHub Actions 每次都会产出无意义的空提交
  let prevApps = null;
  try {
    prevApps = JSON.stringify(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).apps);
  } catch (e) { /* 文件不存在或损坏，按需要写入处理 */ }
  if (prevApps === JSON.stringify(m.apps)) return false;
  m.updatedAt = new Date().toISOString();
  fs.mkdirSync(APPS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n', 'utf8');
  return true;
}

function uniqueSlug(manifest, baseSlug, sourceName) {
  const map = new Map();
  for (const a of manifest.apps) map.set(a.slug, a);
  if (!map.has(baseSlug)) return baseSlug;
  if (map.get(baseSlug).source === sourceName) return baseSlug;
  let i = 2;
  while (map.has(baseSlug + '-' + i)) i++;
  return baseSlug + '-' + i;
}

/* ------------------------------------------------------------------ */
/* 导入                                                                */
/* ------------------------------------------------------------------ */

function importOne(zipPath, opts, manifest) {
  const sourceName = path.basename(zipPath);
  const base = sourceName.replace(/\.zip$/i, '');
  let baseSlug = slugify(opts.slug || base);
  if (!baseSlug) baseSlug = 'app-' + Date.now().toString(36);
  const slug = uniqueSlug(manifest, baseSlug, sourceName);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stzip-'));
  let result;
  try {
    extractZip(zipPath, tmp);
    const root = detectRoot(tmp);
    const entry = findEntry(root);
    if (!entry) throw new Error('zip 里没有找到任何 .html 文件，无法生成子页面');

    const dest = path.join(APPS_DIR, slug);
    if (!path.resolve(dest).startsWith(path.resolve(APPS_DIR))) {
      throw new Error('非法的目标路径: ' + dest);
    }
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(root, dest);

    const stats = dirStats(dest);
    result = { slug: slug, entry: entry, fileCount: stats.fileCount, size: stats.size };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const prev = manifest.apps.find(function (a) { return a.slug === result.slug; });
  const sameSource = prev && prev.source === sourceName;
  const entryObj = {
    slug: result.slug,
    title: opts.title || (prev && sameSource && prev.title) || base,
    description: opts.desc || (prev && sameSource && prev.description) || '',
    entry: result.entry,
    source: sourceName,
    importedAt: (prev && sameSource && prev.importedAt) ? prev.importedAt : new Date().toISOString(),
    fileCount: result.fileCount,
    size: result.size
  };

  const idx = manifest.apps.findIndex(function (a) { return a.slug === result.slug; });
  if (idx >= 0) manifest.apps[idx] = entryObj;
  else manifest.apps.push(entryObj);

  return entryObj;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { files: [], incoming: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all-incoming' || a === '--incoming') args.incoming = true;
    else if (a === '--list') args.list = true;
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--desc' || a === '--description') args.desc = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--')) throw new Error('未知参数: ' + a);
    else args.files.push(a);
  }
  return args;
}

function printHelp() {
  console.log([
    '用法:',
    '  node tools/import-zip.mjs <包.zip> [--slug 名称] [--title 标题] [--desc 说明]',
    '  node tools/import-zip.mjs --all-incoming',
    '  node tools/import-zip.mjs --list'
  ].join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const manifest = loadManifest();

  if (args.list) {
    if (!manifest.apps.length) { console.log('还没有导入任何应用。'); return; }
    for (const a of manifest.apps) {
      console.log('- ' + a.slug.padEnd(28) + ' ' + (a.title || '') + '  [' + a.fileCount + ' 文件, ' + Math.round((a.size || 0) / 1024) + ' KB]');
    }
    return;
  }

  let zips = args.files.slice();

  if (args.incoming) {
    if (!fs.existsSync(INCOMING_DIR)) fs.mkdirSync(INCOMING_DIR, { recursive: true });
    const found = fs.readdirSync(INCOMING_DIR)
      .filter(function (n) { return n.toLowerCase().endsWith('.zip'); })
      .sort();
    if (!found.length) console.log('_incoming/ 里没有 zip 文件，跳过。');
    for (const n of found) zips.push(path.join(INCOMING_DIR, n));
  }

  if (!zips.length) {
    if (args.incoming) { console.log('没有需要导入的 zip，正常结束。'); return; }
    printHelp();
    process.exitCode = 1;
    return;
  }

  let ok = 0, failed = 0;
  for (const z of zips) {
    try {
      if (!fs.existsSync(z)) throw new Error('文件不存在');
      const e = importOne(z, args, manifest);
      ok++;
      console.log('✓ ' + path.basename(z) + ' -> apps/' + e.slug + '/  (入口 ' + e.entry + ', ' + e.fileCount + ' 个文件, ' + Math.round(e.size / 1024) + ' KB)');
    } catch (err) {
      failed++;
      console.error('✗ ' + path.basename(z) + ' 导入失败: ' + err.message);
    }
  }

  const changed = saveManifest(manifest);
  console.log(changed
    ? 'manifest 已更新: apps/manifest.json（共 ' + manifest.apps.length + ' 个应用）'
    : 'manifest 无变化，未写入。');
  if (failed) { console.error(failed + ' 个包导入失败，' + ok + ' 个成功。'); process.exitCode = 1; }
}

main();
