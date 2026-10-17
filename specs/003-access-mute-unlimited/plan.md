# Implementation Plan: Пароль на список, кнопка звука, без лимита загрузки

**Branch**: `003-access-mute-unlimited` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

## Summary

- **Вход**: `createSessions()` в `src/auth.js` — cookie `pa_session=<exp>.<HMAC-SHA256(exp)>`,
  ключ из пароля. `POST /login` (форма), `GET /logout`. `requireAuth()` в `src/app.js`
  отдаёт страницу входа для `/list` и `401` для `/upload`, `/delete`. Лимитер попыток — тот же
  `createAttemptLimiter()`, отдельный экземпляр.
- **Звук**: `injectAudioControl()` в `src/views.js` вставляет в `srcdoc` скрипт сразу после
  `<head>` (или `<html>`, или `<!doctype>`). Скрипт оборачивает `AudioContext` — у каждого
  контекста `destination` заменяется на GainNode перед настоящим выходом; `HTMLMediaElement.play`
  отслеживает медиа. Плеер (`public/viewer.js`) вызывает `iframe.contentWindow.__paAudio.set()`;
  состояние — `window.__paMuted` + `localStorage`, после перезапуска скрипт читает `parent.__paMuted`.
- **Лимит**: `maxUploadBytes = 0` → `Infinity` в busboy, `requestTimeout = 0`.

## Constitution Check

| Принцип | Статус |
|---------|--------|
| I. Паритет — вход и кнопка звука — явные дополнения (фича 003) | ✅ |
| II. Простота — без зависимостей, сессии без хранилища | ✅ |
| III. Сохранность — без изменений | ✅ |
| IV. Безопасность — пароль из env, лимит попыток, HttpOnly cookie | ✅ |
| V. Проверяемость — тесты на вход, cookie, лимит, вставку скрипта | ✅ |

## Contract

| Запрос | Ответ |
|--------|-------|
| `GET /list` без входа | `401` + страница входа |
| `POST /login` `password=…` верно | `303 /list` + `Set-Cookie` |
| неверно | `403` + страница входа с ошибкой; 6-я попытка за 15 мин → `429` |
| `GET /logout` | `303 /list` + очистка cookie |
| `POST /upload`, `POST /delete` без входа | `401` |
| `GET /files/*` | без изменений, открыто |
