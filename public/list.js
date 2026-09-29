(() => {
  const list = document.getElementById('files');
  const rows = Array.from(list.querySelectorAll('.file'));
  const search = document.getElementById('search');
  const shown = document.getElementById('shown');
  const empty = document.getElementById('empty');
  const toast = document.getElementById('toast');
  const form = document.getElementById('upload-form');
  const input = document.getElementById('file-input');
  const dropzone = document.getElementById('dropzone');
  const picked = document.getElementById('picked');
  const progress = document.getElementById('progress');
  const submit = document.getElementById('submit');
  const existing = new Set(rows.map((r) => r.querySelector('.file-name').textContent));

  let toastTimer;
  function showToast(text, isError = false) {
    toast.textContent = text;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), isError ? 6000 : 3000);
  }

  // Local dates
  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  list.querySelectorAll('time[datetime]').forEach((t) => {
    t.textContent = dateFmt.format(new Date(t.getAttribute('datetime')));
  });

  // Search
  function filter() {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      const match = !q || row.dataset.name.includes(q);
      row.hidden = !match;
      if (match) visible++;
    });
    shown.textContent = q ? `найдено: ${visible}` : '';
    if (rows.length) empty.hidden = visible > 0;
  }
  search.addEventListener('input', filter);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search && !e.target.closest('input, textarea')) {
      e.preventDefault();
      search.focus();
    }
  });

  // Copy link
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy');
    if (!btn) return;
    const url = new URL(btn.dataset.url, location.origin).href;
    showToast((await copy(url)) ? 'Ссылка скопирована' : url);
  });

  // Freshly uploaded file
  const fresh = list.querySelector('.file.fresh');
  if (fresh) {
    fresh.scrollIntoView({ block: 'center' });
    showToast(`Загружено: ${fresh.querySelector('.file-name').textContent}`);
    history.replaceState(null, '', '/list');
  }

  // File picking and drag & drop
  function showPicked() {
    const file = input.files[0];
    if (!file) {
      picked.hidden = true;
      return;
    }
    const isUpdate = existing.has(file.name.normalize('NFC').trim());
    picked.textContent = file.name;
    const tag = document.createElement('span');
    tag.className = `tag ${isUpdate ? 'tag-update' : 'tag-new'}`;
    tag.textContent = isUpdate ? 'обновит существующий' : 'новый файл';
    picked.append(tag);
    picked.hidden = false;
  }
  input.addEventListener('change', showPicked);

  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, () => dropzone.classList.remove('drag')));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files.length) return;
    const dt = new DataTransfer();
    dt.items.add(e.dataTransfer.files[0]);
    input.files = dt.files;
    showPicked();
  });

  // Upload with progress; without JS the form still posts natively.
  form.addEventListener('submit', (e) => {
    if (!input.files.length || !window.FormData) return;
    e.preventDefault();
    const xhr = new XMLHttpRequest();
    const bar = progress.firstElementChild;
    progress.hidden = false;
    bar.style.width = '0';
    submit.disabled = true;
    submit.textContent = 'Загрузка…';

    const reset = () => {
      submit.disabled = false;
      submit.textContent = 'Загрузить';
      progress.hidden = true;
    };
    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) bar.style.width = `${(ev.loaded / ev.total) * 100}%`;
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 200 && xhr.responseURL.includes('/list')) {
        location.href = xhr.responseURL;
      } else {
        reset();
        showToast(`Ошибка ${xhr.status}: ${xhr.responseText || 'не удалось загрузить'}`, true);
      }
    });
    xhr.addEventListener('error', () => {
      reset();
      showToast('Сеть недоступна — загрузка не удалась', true);
    });
    xhr.open('POST', form.action);
    xhr.send(new FormData(form));
  });
})();
