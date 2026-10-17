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
  trash: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>`,
  copy: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/></svg>`,
  upload: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`,
  sun: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM80-440v-80h160v80H80Zm640 0v-80h160v80H720ZM440-720v-160h80v160h-80Zm0 640v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Z"/></svg>`,
  moon: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z"/></svg>`,
  soundOn: `<svg class="icon-sound-on" viewBox="0 -960 960 960" aria-hidden="true"><path d="M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320Z"/></svg>`,
  soundOff: `<svg class="icon-sound-off" viewBox="0 -960 960 960" aria-hidden="true"><path d="M792-56 671-177q-25 16-53 27.5T560-131v-82q14-5 27.5-10t25.5-12L480-368v208L280-360H120v-240h128L56-792l56-56 736 736-56 56Zm-8-232-58-58q17-31 25.5-65t8.5-70q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 53-14.5 102T784-288ZM650-422l-90-90v-130q47 22 73.5 66t26.5 96q0 15-2.5 29.5T650-422ZM480-592 376-696l104-104v208Z"/></svg>`,
  download: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`,
  lock: `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/></svg>`,
};

/**
 * Runs inside the playable before its own scripts so the viewer can mute it:
 * every AudioContext gets a master gain in front of its destination, and
 * <audio>/<video> elements are tracked when they start playing.
 */
const AUDIO_SHIM = `(function(){
if (window.__paAudio) return;
var muted = false;
try { muted = window.parent !== window && window.parent.__paMuted === true; } catch (e) {}
var gains = [], media = new Set();
function applyMedia(el) {
  if (muted) { if (!el.__paMuted) { el.__paPrev = el.muted; el.muted = true; el.__paMuted = true; } }
  else if (el.__paMuted) { el.muted = el.__paPrev; el.__paMuted = false; }
}
['AudioContext', 'webkitAudioContext'].forEach(function (name) {
  var Native = window[name];
  if (!Native) return;
  var Wrapped = function () {
    var ctx = new (Function.prototype.bind.apply(Native, [null].concat([].slice.call(arguments))))();
    try {
      var real = ctx.destination, g = ctx.createGain();
      g.gain.value = muted ? 0 : 1;
      g.connect(real);
      try { g.maxChannelCount = real.maxChannelCount; } catch (e) {}
      Object.defineProperty(ctx, 'destination', { value: g, configurable: true });
      gains.push(g);
    } catch (e) {}
    return ctx;
  };
  Wrapped.prototype = Native.prototype;
  try { Object.setPrototypeOf(Wrapped, Native); } catch (e) {}
  window[name] = Wrapped;
});
if (window.HTMLMediaElement) {
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { media.add(this); applyMedia(this); return play.apply(this, arguments); };
}
window.__paAudio = {
  set: function (m) {
    muted = !!m;
    gains.forEach(function (g) { try { g.gain.value = muted ? 0 : 1; } catch (e) {} });
    media.forEach(applyMedia);
    try { document.querySelectorAll('audio,video').forEach(applyMedia); } catch (e) {}
  }
};
})();`;

/** Insert the audio shim as early as possible without breaking the doctype. */
export function injectAudioControl(html) {
  const tag = `<script>${AUDIO_SHIM}</script>`;
  for (const re of [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /^\s*<!doctype[^>]*>/i]) {
    const m = re.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
  }
  return tag + html;
}

export function loginPage({ error } = {}) {
  return `<!doctype html>
<html lang="ru">
<head>
${head('Вход — Arc Studio')}
</head>
<body class="page-list page-login">
<div class="glow" aria-hidden="true"></div>
<main class="login">
  <form class="login-card card" method="post" action="/login">
    ${LOGO}
    <div class="login-icon">${ICONS.lock}</div>
    <h1>Вход для команды</h1>
    <p class="lead">Список плееблов и загрузка доступны по паролю. Ссылки на сами плееблы открываются без пароля.</p>
    <label class="field">
      <span>Пароль</span>
      <input type="password" name="password" autocomplete="current-password" inputmode="numeric" required autofocus>
    </label>
    ${error ? `<p class="dialog-error">${escapeHtml(error)}</p>` : ''}
    <button type="submit" class="btn btn-primary">Войти</button>
  </form>
</main>
</body>
</html>`;
}

const DELETE_DIALOG = `
<dialog class="dialog card" id="delete-dialog">
  <form method="dialog" id="delete-form">
    <h2>Удалить плеебл?</h2>
    <p class="dialog-name" id="delete-name"></p>
    <p class="dialog-note">Файл пропадёт с сервера, ссылка у клиентов перестанет работать.</p>
    <label class="field">
      <span>Пароль удаления</span>
      <input type="password" id="delete-password" autocomplete="off" inputmode="numeric" required>
    </label>
    <p class="dialog-error" id="delete-error" hidden></p>
    <div class="dialog-actions">
      <button type="button" class="btn" id="delete-cancel">Отмена</button>
      <button type="submit" class="btn btn-danger" id="delete-confirm">Удалить</button>
    </div>
  </form>
</dialog>`;

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

function fileRow(file, fresh, canDelete) {
  const url = fileUrl(file.name);
  const html = isHtml(file.name);
  return `<li class="file${fresh ? ' fresh' : ''}" data-name="${escapeHtml(file.name.toLowerCase())}">
<a class="file-link" href="${escapeHtml(url)}"${html ? '' : ' download'}><span class="file-ext${html ? '' : ' file-ext-other'}">${escapeHtml(extLabel(file.name))}</span><span class="file-name">${escapeHtml(file.name)}</span></a>
<span class="file-meta"><span>${formatSize(file.size)}</span><time datetime="${file.mtime.toISOString()}">${file.mtime.toISOString().slice(0, 10)}</time></span>
<a class="icon-btn download" href="${escapeHtml(`/download/${encodeURIComponent(file.name)}`)}" download="${escapeHtml(file.name)}" title="Скачать файл" aria-label="Скачать ${escapeHtml(file.name)}">${ICONS.download}</a>
<button class="icon-btn copy" type="button" data-url="${escapeHtml(url)}" title="Скопировать ссылку" aria-label="Скопировать ссылку на ${escapeHtml(file.name)}">${ICONS.copy}</button>${canDelete ? `
<button class="icon-btn delete" type="button" title="Удалить" aria-label="Удалить ${escapeHtml(file.name)}">${ICONS.trash}</button>` : ''}
</li>`;
}

export function listPage(files, { uploaded, maxUploadMb, canDelete = false, canLogout = false }) {
  const rows = files.map((f) => fileRow(f, f.name === uploaded, canDelete)).join('\n');
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
    <a class="btn btn-primary btn-sm" href="#upload">${ICONS.upload}<span>Загрузить</span></a>${canLogout ? `
    <a class="btn btn-sm" href="/logout">Выйти</a>` : ''}
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

  <ul class="files" id="files">${rows}</ul>
  <p class="empty" id="empty"${count ? ' hidden' : ''}>${count ? 'Ничего не найдено' : 'Пока пусто — загрузите первый плеебл ниже.'}</p>

  <section class="upload card" id="upload">
    <div class="upload-head">
      <h2>Загрузка</h2>
      <span class="toolbar-note">${maxUploadMb ? `до ${maxUploadMb} МБ` : 'без ограничения размера'}</span>
    </div>
    <form enctype="multipart/form-data" action="/upload" method="post" id="upload-form">
      <label class="dropzone" id="dropzone">
        <input type="file" name="file" id="file-input" accept=".html,.htm,text/html" required>
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
<div class="toast" id="toast" role="status" aria-live="polite"></div>${canDelete ? DELETE_DIALOG : ''}
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
<script>try { window.__paMuted = localStorage.getItem('pa-viewer-muted') === '1'; } catch (e) {}</script>
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
      <button class="action-btn mute" type="button" title="Выключить звук" aria-label="Выключить звук" aria-pressed="false">${ICONS.soundOn}${ICONS.soundOff}</button>
      <button class="action-btn reload" type="button" title="Перезапустить плеебл" aria-label="Перезапустить плеебл">${ICONS.reload}</button>
    </section>
  </aside>

  <main>
    <section class="iframe-wrapper">
      <div class="phone screen-916">
        <iframe class="screen" title="${escapeHtml(name)}" allow="autoplay; fullscreen; clipboard-write; accelerometer; gyroscope" allowfullscreen srcdoc="${escapeHtml(injectAudioControl(content))}"></iframe>
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
