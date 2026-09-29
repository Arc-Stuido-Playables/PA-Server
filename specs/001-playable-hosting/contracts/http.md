# HTTP Contract

| Метод, путь | Ответ |
|-------------|-------|
| `GET /` | `302 Location: /list` |
| `GET /list` | `200 text/html; charset=utf-8` — список ссылок `<a href="/files/<enc>">имя</a>`, форма `<form enctype="multipart/form-data" action="/upload" method="post">` с `<input type="file" name="file">` |
| `POST /upload` (multipart, поле `file`) | `303 Location: /list?uploaded=<enc>` |
| `POST /upload` без файла | `400` текст |
| `POST /upload` с недопустимым именем | `400` текст |
| `POST /upload` не `.html`/`.htm` | `415` «Можно загружать только .html файлы», ничего не сохраняется |
| `POST /upload` больше `MAX_UPLOAD_MB` | `413` текст, существующий файл не изменён |
| `GET/PUT/… /upload` | `405 text/plain` «Метод не поддерживается» |
| `GET\|HEAD /files/<name>` для `.html/.htm` | `200 text/html; charset=utf-8` — viewer; `<title>` = имя; `<iframe class="screen" srcdoc="…">` с экранированным содержимым |
| `GET\|HEAD /files/<name>` прочие | `200`, тип по расширению, `Content-Length`, `Last-Modified`, тело — файл как есть |
| `GET /files` | `301 Location: /files/` |
| `GET /files/`, отсутствующий файл, прочие пути | `404 text/plain` «404 page not found» |
| `GET /assets/<file>` | статика из `public/` |
| `GET /healthz` | `200 ok` (для проверок хостинга) |

## Опциональная авторизация (FR-015)

Если заданы `ADMIN_USER` и `ADMIN_PASSWORD`: `GET /list` и `POST /upload` без верных
Basic-кредов → `401` + `WWW-Authenticate: Basic realm="PA-Server"`. `/files/*`, `/assets/*`
всегда открыты.

## Конфигурация (env)

| Переменная | По умолчанию |
|------------|--------------|
| `PORT` | `8080` |
| `HOST` | `0.0.0.0` |
| `DATA_DIR` | `./data` |
| `MAX_UPLOAD_MB` | `100` |
| `ADMIN_USER`, `ADMIN_PASSWORD` | не заданы (авторизация выключена) |
