---

description: "Task list for 001-playable-hosting"
---

# Tasks: Сервер для показа плееблов клиентам

**Input**: Design documents from `/specs/001-playable-hosting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http.md

**Tests**: обязательны по Принципу V конституции — интеграционные HTTP-тесты.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Создать `package.json` (ESM, `start`, `test`, engines node ≥ 20), `.gitignore`, `.editorconfig`
- [x] T002 Установить зависимость `busboy`

## Phase 2: Foundational

- [x] T003 `src/storage.js`: `safeName()`, `listFiles()`, `statFile()`, `saveStream()` (tmp + rename), `isHtml()`
- [x] T004 `src/app.js`: роутер, `404 page not found`, `/` → `/list`, `/files` → `/files/`, `/healthz`, статика `/assets/*` из `public/`
- [x] T005 `server.js`: чтение env (`PORT`, `HOST`, `DATA_DIR`, `MAX_UPLOAD_MB`, `ADMIN_*`), создание папок, запуск
- [x] T006 [P] `src/views.js`: `escapeHtml()`, общий layout с логотипом `<ArcStudio/>`
- [x] T007 [P] `public/app.css`: дизайн-токены Arc Studio, шрифты Golos Text / моноширинный

## Phase 3: US1 — Залить плеебл и получить ссылку (P1) 🎯 MVP

**Independent Test**: загрузить через форму → файл в списке → ссылка открывается.

- [x] T008 [P] [US1] Тесты: список, загрузка, кириллица в имени, пустая форма → 400, обход пути → 400, `405` на GET `/upload` в `tests/server.test.js`
- [x] T009 [US1] Страница `/list` в `src/views.js` (ссылки, размер, дата, форма, подсветка `?uploaded=`)
- [x] T010 [US1] `POST /upload` в `src/app.js` через busboy (`defParamCharset: 'utf8'`, лимит, 303 на список)
- [x] T011 [P] [US1] `public/list.js`: поиск-фильтр, отображение выбранного файла, drag&drop на зону загрузки

## Phase 4: US2 — Перезалив под тем же именем (P1)

**Independent Test**: перезалить → ссылка отдаёт новую версию, запись одна.

- [x] T012 [P] [US2] Тесты: перезапись, превышение лимита → 413 и старая версия цела, tmp пуст после ошибки
- [x] T013 [US2] Удаление tmp при ошибке/обрыве/лимите в `src/storage.js` / `src/app.js`

## Phase 5: US3 — Просмотр плеебла клиентом (P2)

**Independent Test**: открыть ссылку, прокликать контролы.

- [x] T014 [P] [US3] Тесты: viewer содержит `<title>`, `srcdoc` с экранированным кодом, кнопки пропорций
- [x] T015 [US3] Viewer-шаблон в `src/views.js` (левая колонка: лого + рестарт; центр: телефон + iframe; правая: тумблер фона, 9:16/16:9/3:4/4:3, fullscreen, бургер)
- [x] T016 [P] [US3] `public/viewer.js`: пропорции, рестарт, fullscreen, тема, бургер < 769px
- [x] T017 [P] [US3] Стили viewer'а в `public/app.css` (рамка телефона, адаптив до 375px)

## Phase 6: US4 — Не-HTML файлы (P3)

- [x] T018 [P] [US4] Тесты: `.zip` отдаётся байт-в-байт с `application/zip`, HEAD, 404 на отсутствующий
- [x] T019 [US4] Отдача файла потоком с типом, `Content-Length`, `Last-Modified` в `src/app.js`

## Phase 7: Polish & Cross-Cutting

- [x] T020 [P] `src/auth.js` + тесты: опциональный Basic для `/list` и `/upload` (FR-015)
- [x] T021 [P] `Dockerfile`, `.dockerignore`
- [x] T022 [P] `docs/DEPLOY-TIMEWEB.md` + `deploy/nginx.conf` + `docker-compose.yml` — VPS (Docker + том + nginx/HTTPS) и App Platform
- [x] T023 [P] `README.md` — гайд заливки для команды, запуск, конфигурация
- [x] T024 Прогон quickstart.md в браузере (десктоп + 375px)

## Dependencies & Execution Order

- Setup → Foundational → US1 → US2 (переиспользует upload) → US3 → US4 → Polish.
- US3 и US4 зависят только от Foundational и могут идти параллельно с US2.

## Parallel Example

```text
T006 views.js  ║  T007 app.css      (разные файлы)
T016 viewer.js ║  T017 стили viewer
T021 Dockerfile ║ T022 deploy doc ║ T023 README
```

## Implementation Strategy

MVP = Phase 1–3 (заливка + список + ссылка). Затем US2 (перезалив), US3 (viewer), US4,
Polish. После каждой фазы — `npm test`.
