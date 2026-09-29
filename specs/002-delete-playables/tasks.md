# Tasks: Удаление плееблов по паролю

## Phase 1: Foundational

- [x] T001 `src/auth.js`: `createSecretCheck()` (sha256 + timingSafeEqual), `createAttemptLimiter()`
- [x] T002 `src/storage.js`: `remove(name)` → true/false

## Phase 2: US1 — удалить плеебл (P1) 🎯

- [x] T003 [P] [US1] Тесты: верный пароль удаляет, неверный — нет, 404, 400, 405, выключено без пароля
- [x] T004 [US1] `POST /delete` в `src/app.js`, конфиг `DELETE_PASSWORD` в `server.js`
- [x] T005 [US1] Кнопка-корзина + `<dialog>` в `src/views.js`
- [x] T006 [P] [US1] `public/list.js`: диалог, fetch, удаление строки, sessionStorage
- [x] T007 [P] [US1] Стили диалога и кнопки в `public/app.css`

## Phase 3: US2 — защита от подбора (P1)

- [x] T008 [P] [US2] Тесты: 5 неудач → 429 даже с верным паролем; успех сбрасывает счётчик
- [x] T009 [US2] Подключить лимитер в `/delete`

## Phase 4: Polish

- [x] T010 README + docs/DEPLOY-TIMEWEB.md: как задать `DELETE_PASSWORD`
- [x] T011 Конституция 1.1.0: правило про деструктивные операции
- [x] T012 Проверка в браузере: удаление через UI
