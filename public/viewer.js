(() => {
  const body = document.body;
  const phone = document.querySelector('.phone');
  const iframe = phone.querySelector('iframe');
  const ratioButtons = document.querySelectorAll('.ratio-btn');
  const reloadBtn = document.querySelector('.action-btn.reload');
  const fullscreenBtn = document.querySelector('.action-btn.fullscreen');
  const themeInput = document.querySelector('.theme-toggle input');
  const burger = document.querySelector('.burger-menu');
  const navMenu = document.querySelector('.nav-menu');
  const leftSection = document.querySelector('.left-section');

  const RATIOS = ['916', '169', '34', '43'];
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  };

  // Aspect ratio
  function setRatio(ratio) {
    RATIOS.forEach((r) => phone.classList.remove(`screen-${r}`));
    phone.classList.add(`screen-${ratio}`);
    ratioButtons.forEach((b) => b.classList.toggle('active', b.dataset.ratio === ratio));
  }
  ratioButtons.forEach((btn) => btn.addEventListener('click', () => setRatio(btn.dataset.ratio)));

  // Restart the playable without reloading the page
  reloadBtn.addEventListener('click', () => {
    try {
      iframe.contentWindow.location.reload();
    } catch {
      iframe.srcdoc = iframe.getAttribute('srcdoc');
    }
    reloadBtn.classList.remove('spin');
    void reloadBtn.offsetWidth;
    reloadBtn.classList.add('spin');
  });

  // Fullscreen, with an overlay fallback where iframes cannot go fullscreen (iOS)
  let exitBtn = null;
  function exitPseudoFullscreen() {
    phone.classList.remove('pseudo-fullscreen');
    exitBtn?.remove();
    exitBtn = null;
  }
  function enterPseudoFullscreen() {
    phone.classList.add('pseudo-fullscreen');
    exitBtn = document.createElement('button');
    exitBtn.className = 'exit-fullscreen';
    exitBtn.type = 'button';
    exitBtn.setAttribute('aria-label', 'Выйти из полноэкранного режима');
    exitBtn.textContent = '×';
    exitBtn.addEventListener('click', exitPseudoFullscreen);
    document.body.append(exitBtn);
  }
  fullscreenBtn.addEventListener('click', async () => {
    closeMenu();
    const request = iframe.requestFullscreen || iframe.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(iframe);
        return;
      } catch { /* fall through */ }
    }
    enterPseudoFullscreen();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && exitBtn) exitPseudoFullscreen();
  });

  // Light / dark surroundings, remembered per browser
  function setLight(light) {
    body.classList.toggle('light', light);
    themeInput.checked = light;
  }
  themeInput.addEventListener('change', () => {
    setLight(themeInput.checked);
    store.set('pa-viewer-light', themeInput.checked ? '1' : '0');
  });
  setLight(store.get('pa-viewer-light') === '1');

  // Burger menu on narrow screens
  function toggleMenu() {
    const open = !navMenu.classList.contains('open');
    navMenu.classList.toggle('open', open);
    leftSection.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  function closeMenu() {
    navMenu.classList.remove('open');
    leftSection.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }
  function syncMobile() {
    body.classList.toggle('mobile', window.innerWidth < 769);
  }
  burger.addEventListener('click', toggleMenu);
  ratioButtons.forEach((btn) => btn.addEventListener('click', () => {
    if (body.classList.contains('mobile')) closeMenu();
  }));
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wasMobile = body.classList.contains('mobile');
      syncMobile();
      if (wasMobile !== body.classList.contains('mobile')) closeMenu();
    }, 150);
  });
  syncMobile();
})();
