import { isHtml } from './storage.js';

// Changes on every restart/deploy so browsers pick up new assets.
const V = Date.now().toString(36);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export const fileUrl = (name) => `/files/${encodeURIComponent(name)}`;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function extLabel(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toUpperCase() : 'FILE';
}

const LOGO = `<a class="logo" href="/list" aria-label="Arc Studio — к списку плееблов"><span class="logo-bracket">&lt;</span><span class="logo-arc">Arc</span><span class="logo-studio">Studio</span><span class="logo-bracket">/&gt;</span></a>`;

const ICONS = {
  reload: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>`,
  fullscreen: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z"/></svg>`,
  copy: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/></svg>`,
  upload: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`,
  sun: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM80-440v-80h160v80H80Zm640 0v-80h160v80H720ZM440-720v-160h80v160h-80Zm0 640v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Z"/></svg>`,
  moon: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z"/></svg>`,
};

function head(title) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/assets/app.css?v=${V}">`;
}

function fileRow(file, fresh) {
  const url = fileUrl(file.name);
  const html = isHtml(file.name);
  return `<li class="file${fresh ? ' fresh' : ''}" data-name="${escapeHtml(file.name.toLowerCase())}">
<a class="file-link" href="${escapeHtml(url)}"${html ? '' : ' download'}><span class="file-ext${html ? '' : ' file-ext-other'}">${escapeHtml(extLabel(file.name))}</span><span class="file-name">${escapeHtml(file.name)}</span></a>
<span class="file-meta"><span>${formatSize(file.size)}</span><time datetime="${file.mtime.toISOString()}">${file.mtime.toISOString().slice(0, 10)}</time></span>
<button class="icon-btn copy" type="button" data-url="${escapeHtml(url)}" title="Скопировать ссылку" aria-label="Скопировать ссылку на ${escapeHtml(file.name)}">${ICONS.copy}</button>
</li>`;
}

export function listPage(files, { uploaded, maxUploadMb }) {
  const rows = files.map((f) => fileRow(f, f.name === uploaded)).join('\n');
  const count = files.length;

  return `<!doctype html>
<html lang="ru">
<head>
${head('Плееблы — Arc Studio')}
<script src="/assets/list.js?v=${V}" defer></script>
</head>
<body class="page-list">
<div class="glow" aria-hidden="true"></div>
<header class="topbar">
  ${LOGO}
  <nav class="topbar-nav">
    <span class="topbar-count" id="count">${count} файлов</span>
    <a class="btn btn-primary btn-sm" href="#upload">${ICONS.upload}<span>Загрузить</span></a>
  </nav>
</header>

<main class="container">
  <section class="hero">
    <p class="eyebrow">// playable ads server</p>
    <h1>Доступные файлы<span class="accent">:</span></h1>
    <p class="lead">Нажмите на файл, чтобы открыть плеебл. Ссылку из адресной строки отправляйте на апрув.</p>
  </section>

  <div class="toolbar">
    <label class="search">
      <svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>
      <input type="search" id="search" placeholder="Поиск по имени…" autocomplete="off" spellcheck="false">
    </label>
    <span class="toolbar-note" id="shown"></span>
  </div>

  <ul class="files" id="files">
${rows}
  </ul>
  <p class="empty" id="empty"${count ? ' hidden' : ''}>${count ? 'Ничего не найдено' : 'Пока пусто — загрузите первый плеебл ниже.'}</p>

  <section class="upload card" id="upload">
    <div class="upload-head">
      <h2>Загрузка</h2>
      <span class="toolbar-note">до ${maxUploadMb} МБ</span>
    </div>
    <form enctype="multipart/form-data" action="/upload" method="post" id="upload-form">
      <label class="dropzone" id="dropzone">
        <input type="file" name="file" id="file-input" required>
        <span class="dz-icon">${ICONS.upload}</span>
        <span class="dz-title">Выбрать файл</span>
        <span class="dz-hint">или перетащите .html сюда</span>
        <span class="dz-picked" id="picked" hidden></span>
      </label>
      <div class="upload-actions">
        <div class="progress" id="progress" hidden><span></span></div>
        <button type="submit" class="btn btn-primary" id="submit">Загрузить</button>
      </div>
    </form>
    <ul class="rules">
      <li>Для правок заливайте билд <b>с тем же именем</b> — файл обновится по той же ссылке.</li>
      <li>Имя берите из таска, например <code>04_G5_31пак_EH1234i001v001.html</code>.</li>
    </ul>
  </section>
</main>

<footer class="footer"><span class="logo-bracket">&lt;</span>Arc Studio<span class="logo-bracket">/&gt;</span> · playable ads</footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>`;
}

export function viewerPage(name, content) {
  const ratios = [
    ['916', '9:16'],
    ['169', '16:9'],
    ['34', '3:4'],
    ['43', '4:3'],
  ];
  const ratioButtons = ratios
    .map(([id, label], i) => `<button class="ratio-btn${i === 0 ? ' active' : ''}" type="button" data-ratio="${id}">${label}</button>`)
    .join('\n          ');

  return `<!doctype html>
<html lang="ru">
<head>
${head(name)}
<script src="/assets/viewer.js?v=${V}" defer></script>
</head>
<body class="page-viewer">
<div class="glow" aria-hidden="true"></div>
<div id="app">
  <aside class="left-section">
    <div class="brand">
      ${LOGO}
      <p class="file-title" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
    </div>
    <section class="actions">
      <button class="action-btn reload" type="button" title="Перезапустить плеебл" aria-label="Перезапустить плеебл">${ICONS.reload}</button>
    </section>
  </aside>

  <main>
    <section class="iframe-wrapper">
      <div class="phone screen-916">
        <iframe class="screen" title="${escapeHtml(name)}" allow="autoplay; fullscreen; clipboard-write; accelerometer; gyroscope" allowfullscreen srcdoc="${escapeHtml(content)}"></iframe>
      </div>
    </section>
  </main>

  <aside class="right-section">
    <nav class="nav-menu">
      <button class="burger-menu" type="button" aria-label="Меню" aria-expanded="false">
        <span class="burger-line"></span>
        <span class="burger-line"></span>
        <span class="burger-line"></span>
      </button>
      <div class="controls">
        <label class="theme-toggle" title="Светлый / тёмный фон">
          <input type="checkbox" aria-label="Светлый фон">
          <span class="slider"><span class="slider-icon slider-moon">${ICONS.moon}</span><span class="slider-icon slider-sun">${ICONS.sun}</span></span>
        </label>

        <section class="screens-switcher" aria-label="Пропорции экрана">
          ${ratioButtons}
        </section>

        <button class="action-btn fullscreen" type="button" title="Во весь экран" aria-label="Во весь экран">${ICONS.fullscreen}</button>
      </div>
    </nav>
  </aside>
</div>
</body>
</html>`;
}
