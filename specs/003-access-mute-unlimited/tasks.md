# Tasks: Пароль на список, кнопка звука, без лимита загрузки

## US1 — список по паролю (P1)

- [x] T001 `createSessions()` в `src/auth.js`
- [x] T002 `requireAuth({page})`, `POST /login`, `GET /logout`, лимитер входа в `src/app.js`
- [x] T003 `loginPage()` и кнопка «Выйти» в `src/views.js`, стили входа в `public/app.css`
- [x] T004 `ACCESS_PASSWORD` (по умолчанию `DELETE_PASSWORD`) в `server.js`
- [x] T005 [P] Тесты: форма входа, неверный/верный пароль, cookie, 401 на загрузку/удаление, публичные плееблы, подделка cookie, выход, блокировка

## US2 — кнопка звука (P1)

- [x] T006 `injectAudioControl()` + скрипт `AUDIO_SHIM` в `src/views.js`
- [x] T007 Кнопка в плеере, `public/viewer.js` (переключение, localStorage, после перезапуска)
- [x] T008 [P] Тесты вставки скрипта; проверка в браузере на плеебле Jane (WebAudio + `<audio>`)

## US3 — без лимита (P2)

- [x] T009 `maxUploadBytes = 0` → без лимита, `requestTimeout = 0`, подпись в форме
- [x] T010 [P] Тест: загрузка 3 МБ при сервере без лимита, подпись «без ограничения размера»

## Polish

- [x] T011 README, docs/DEPLOY-TIMEWEB.md
