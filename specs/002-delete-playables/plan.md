# Implementation Plan: Удаление плееблов по паролю

**Branch**: `002-delete-playables` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

## Summary

`POST /delete` (JSON `{name, password}`) удаляет файл из хранилища. Пароль — env
`DELETE_PASSWORD`, сравнение через SHA-256 + `timingSafeEqual`. Ограничитель попыток в
памяти процесса: 5 неудач / 15 мин на IP → блок 15 мин. В списке — кнопка-корзина у каждой
строки и `<dialog>` с подтверждением и полем пароля.

## Technical Context

**Language/Version**: Node.js 20+ (как 001) · **Dependencies**: без новых ·
**Storage**: `fs.rm` файла в `DATA_DIR/files` · **Testing**: `node:test`

## Constitution Check

| Принцип | Статус |
|---------|--------|
| I. Паритет — удаление отсутствует на референсе; добавляется как явная фича 002 | ✅ |
| II. Простота — без зависимостей, лимитер в памяти | ✅ |
| III. Сохранность — удаляется только по верному паролю, с подтверждением | ✅ |
| IV. Безопасность — пароль вне репо, лимит попыток, `safeName` для имени | ✅ (конституция 1.1.0) |
| V. Проверяемость — тесты на все ветки | ✅ |

## Contract

| Запрос | Ответ |
|--------|-------|
| `POST /delete` `{"name","password"}`, верно | `200` «Удалено» |
| неверный пароль | `403` «Неверный пароль» |
| удаление выключено | `403` «Удаление отключено» |
| > 5 неудач / 15 мин | `429` «Слишком много попыток…» + `Retry-After` |
| файла нет | `404` |
| плохое имя / тело | `400` |
| не POST | `405` |

## Project Structure

```text
src/auth.js      + checkSecret(), createAttemptLimiter()
src/storage.js   + remove()
src/app.js       + POST /delete
src/views.js     + кнопка удаления и <dialog> (если включено)
public/list.js   + диалог, запрос, удаление строки
public/app.css   + стили диалога
tests/server.test.js + сценарии удаления
```
