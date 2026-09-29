# Research: Сервер для показа плееблов

## Реверс референса

- **Decision**: повторяем наблюдаемое поведение `79.137.204.81` (см. таблицу в spec.md).
- **Rationale**: по ответам (`404 page not found`, `301 /files → /files/`,
  `X-Content-Type-Options: nosniff`, экранирование `&#34;` в `srcdoc`) референс — Go
  `net/http` + `html/template`. Viewer — Vite-сборка: `index.js` переключает классы
  `screen-916/169/34/43` у `.phone`, `iframe.contentWindow.location.reload()` для рестарта,
  `iframe.requestFullscreen()`, `body.dark` для фона, бургер при `innerWidth < 769`.
- **Alternatives considered**: переписать на Go 1-в-1 — отклонено: Go не установлен в
  окружении студии, Node уже есть и нативно поддерживается Timeweb App Platform.

## Кракозябры в именах на референсе

- **Decision**: разбирать multipart с `defParamCharset: 'utf8'`.
- **Rationale**: на референсе есть пары `01_BG_BS_1пак_…` и `01_BG_BS_1���_…` — одно и то же
  имя, пришедшее в другой кодировке. Браузеры шлют `filename` в UTF-8 без `filename*`;
  парсеры по умолчанию читают его как latin1. Явный UTF-8 закрывает проблему.
- **Alternatives considered**: эвристика определения кодировки — избыточно.

## Атомарная перезапись

- **Decision**: стрим в `DATA_DIR/tmp/<random>`, по окончании — `fs.rename` в
  `DATA_DIR/files/<имя>`; при ошибке/обрыве/превышении лимита tmp удаляется.
- **Rationale**: `rename` в пределах одного тома атомарен на Linux и заменяет существующий
  файл на Windows (Node использует `MoveFileEx` с `REPLACE_EXISTING`).
- **Alternatives considered**: писать сразу в целевой файл — ломает ссылку при обрыве.

## Встраивание плеебла

- **Decision**: как на референсе — содержимое в атрибут `srcdoc` с HTML-экранированием
  (`& < > " '`).
- **Rationale**: паритет; single-file плееблы; один URL.
- **Alternatives considered**: `iframe src="/raw/…"` — добавляет незадокументированный
  маршрут; `sandbox` без `allow-same-origin` — ломает `localStorage` в части плееблов.

## Деплой на Timeweb

- **Decision** (обновлено по запросу «максимально дёшево и просто, без домена»): младший
  облачный сервер + `deploy/install.sh` — Node.js 22 из NodeSource, systemd-сервис от
  отдельного пользователя, порт 80 по IP (`CAP_NET_BIND_SERVICE`), данные в
  `/var/lib/pa-server`, повторный запуск = обновление. Docker/nginx/HTTPS — опционально.
- **Rationale**: App Platform Timeweb собирает из Dockerfile, но диск приложения не
  переживает редеплой — для постоянного хранения рекомендуется VPS или подключённый
  том/хранилище. Инструкция фиксирует оба пути.
- **Alternatives considered**: S3 (Timeweb Object Storage) — лишняя сложность для v1.

## Дизайн

- **Decision**: токены arc-studio.tech: фон `hsl(0 0% 6%)`, карточки `hsl(0 0% 10%)`,
  граница `hsl(0 0% 18%)`, текст `hsl(0 0% 95%)`, muted `hsl(0 0% 60%)`, primary
  `hsl(217 98% 58%)`, accent `hsl(45 100% 50%)`, радиус `.75rem`; моноширинные заголовки
  и навигация, текст — Golos Text; логотип `<ArcStudio/>`; стеклянные карточки
  (`hsl(0 0% 100% / .03)` + border `/ .08`); синее свечение.
