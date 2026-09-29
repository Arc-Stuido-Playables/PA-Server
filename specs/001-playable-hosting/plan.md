# Implementation Plan: Сервер для показа плееблов клиентам

**Branch**: `001-playable-hosting` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-playable-hosting/spec.md`

## Summary

Однопроцессный HTTP-сервер на Node.js, повторяющий маршруты референса (`/list`, `/upload`,
`/files/<имя>`). Файлы хранятся в папке на диске, загрузка стримится во временный файл и
атомарно переименовывается поверх старого. HTML-плееблы отдаются внутри viewer-страницы
(рамка телефона + `iframe srcdoc`), остальные файлы — как есть. UI — статический HTML/CSS/JS
в стиле arc-studio.tech. Деплой — Docker-образ на Timeweb Cloud с постоянным томом.

## Technical Context

**Language/Version**: Node.js 20+ (ESM), локально проверено на Node 24

**Primary Dependencies**: `busboy` (потоковый разбор multipart); остальное — `node:http`,
`node:fs`, `node:test`

**Storage**: файловая система — `DATA_DIR/files` (плееблы), `DATA_DIR/tmp` (незавершённые
загрузки, тот же том → атомарный `rename`)

**Testing**: `node --test` — интеграционные HTTP-тесты на временной папке

**Target Platform**: Linux-контейнер (Timeweb Cloud VPS / App Platform), локально Windows

**Project Type**: web-service (серверный рендер HTML + статика)

**Performance Goals**: список из 600+ файлов < 1 с; загрузка 5 МБ ограничена только сетью

**Constraints**: без БД; память не зависит от размера загрузки (стриминг); лимит загрузки
через `MAX_UPLOAD_MB` (по умолчанию 100)

**Scale/Scope**: одна студия, сотни–тысячи файлов, десятки одновременных просмотров

## Constitution Check

| Принцип | Как соблюдается | Статус |
|---------|-----------------|--------|
| I. Паритет с референсом | Те же маршруты, коды, тексты ошибок, контролы viewer'а; отклонения — FR-013..015, помечены в спеке | ✅ |
| II. Простота | Один процесс, без БД и сборщика, одна зависимость (`busboy`) | ✅ |
| III. Сохранность файлов | tmp-файл + `rename`; `defParamCharset: 'utf8'` для имён | ✅ |
| IV. Безопасность хранилища | `safeName()` → basename + запрет `.`/`..`/управляющих символов; `srcdoc` | ✅ |
| V. Проверяемость | `tests/server.test.js` покрывает каждый маршрут и edge case | ✅ |

Повторная проверка после Phase 1: нарушений нет, Complexity Tracking не требуется.

## Project Structure

### Documentation (this feature)

```text
specs/001-playable-hosting/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/http.md
└── tasks.md
```

### Source Code (repository root)

```text
server.js              # точка входа: env → createApp() → listen
src/
├── app.js             # роутинг и обработчики маршрутов
├── storage.js         # safeName, list, атомарное сохранение, чтение
├── views.js           # HTML страницы списка и viewer'а, экранирование
└── auth.js            # опциональный HTTP Basic (FR-015)
public/                # статика, отдаётся по /assets/*
├── app.css
├── list.js
├── viewer.js
└── favicon.svg
tests/
└── server.test.js
Dockerfile
.dockerignore
docker-compose.yml
deploy/install.sh      # основной деплой: VPS по IP, systemd
deploy/nginx.conf
docs/DEPLOY-TIMEWEB.md
```

**Structure Decision**: один проект; сервер и статика в одном репозитории, фронтенд без
сборки.

## Complexity Tracking

Не требуется.
