# Деплой PA-Server на Timeweb Cloud

Сервер хранит плееблы **файлами на диске** (`/data/files` внутри контейнера). Главное при
деплое — чтобы эта папка **переживала перезапуски и обновления**. Поэтому рекомендуемый
вариант — облачный сервер (VPS) с Docker и томом.

---

## Вариант A (рекомендуется): облачный сервер + Docker

### 1. Создать сервер

Панель Timeweb Cloud → **Облачные серверы** → Создать:

- ОС: **Ubuntu 24.04**
- Конфигурация: 1 vCPU / 1–2 ГБ RAM / 15+ ГБ NVMe — хватит с запасом
  (600 плееблов по ~5 МБ ≈ 3 ГБ)
- Можно сразу выбрать образ из маркетплейса **Docker** — тогда шаг 2 пропустить.

Запомнить IP сервера и root-пароль (придут на почту / в панели).

### 2. Установить Docker

```bash
ssh root@<IP>
curl -fsSL https://get.docker.com | sh
```

### 3. Забрать код и запустить

```bash
git clone https://github.com/Arc-Stuido-Playables/PA-Server.git /opt/pa-server
cd /opt/pa-server
docker compose up -d --build
curl http://127.0.0.1:8080/healthz   # → ok
```

По умолчанию контейнер слушает только `127.0.0.1:8080` — наружу его отдаёт nginx
(шаг 4). **Если домен и HTTPS не нужны** (как на референсе — голый IP), в
`docker-compose.yml` поменяйте порт на `"80:8080"`, выполните
`docker compose up -d` — и сервер доступен по `http://<IP>/list`. Шаг 4 тогда пропустить.

### 4. Домен + HTTPS (nginx)

1. В DNS домена создайте A-запись, например `play.arc-studio.tech → <IP>`.
2. На сервере:

```bash
apt install -y nginx certbot python3-certbot-nginx
cp /opt/pa-server/deploy/nginx.conf /etc/nginx/sites-available/pa-server
sed -i 's/play.example.com/play.arc-studio.tech/' /etc/nginx/sites-available/pa-server
ln -s /etc/nginx/sites-available/pa-server /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d play.arc-studio.tech
```

> ⚠️ `client_max_body_size` в nginx должен быть не меньше `MAX_UPLOAD_MB`, иначе большие
> билды будут отбиваться ошибкой 413. В готовом конфиге стоит `100m`.

### 5. Обновление сервера

```bash
cd /opt/pa-server && git pull && docker compose up -d --build
```

Плееблы лежат в Docker-томе `pa-data` и при обновлении **не теряются**.

### Бэкап и перенос файлов

```bash
# бэкап всех плееблов в архив
docker run --rm -v pa-server_pa-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/playables-$(date +%F).tgz -C /data files

# залить пачку файлов со старого сервера / из папки
docker cp ./old-playables/. pa-server:/data/files/
```

Файлы, положенные в `/data/files` напрямую, сразу появляются в списке. Удаление —
тоже вручную: `docker exec pa-server rm "/data/files/<имя>"`.

---

## Вариант B: App Platform (Apps) из GitHub

Timeweb App Platform умеет собирать проект из `Dockerfile` в корне репозитория
(порт берётся из `EXPOSE 8080`).

1. Панель → **App Platform** → Создать → Dockerfile → подключить GitHub-репозиторий
   `Arc-Stuido-Playables/PA-Server`, ветка `main`.
2. Переменные окружения — по таблице ниже. Health check path: `/healthz`.

> ⚠️ **Риск потери файлов.** Файловая система контейнера в App Platform, как и на
> аналогичных PaaS, обычно не сохраняется между деплоями и перезапусками — залитые
> плееблы могут пропасть при каждом обновлении. Перед использованием уточните в поддержке
> Timeweb, можно ли подключить постоянный диск к `/data`. Если нельзя — используйте
> вариант A.

---

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `PORT` | `8080` | порт HTTP |
| `DATA_DIR` | `/data` (в Docker) | где хранятся файлы (`files/`) и временные загрузки (`tmp/`) |
| `MAX_UPLOAD_MB` | `100` | максимальный размер одного файла |
| `ADMIN_USER`, `ADMIN_PASSWORD` | — | если заданы оба, `/list` и загрузка закрываются логином/паролем; ссылки на плееблы для клиентов остаются открытыми |

## Проверка после деплоя

```bash
curl -I https://play.arc-studio.tech/list        # 200
curl -F "file=@test.html" https://play.arc-studio.tech/upload -i | head -3   # 303 → /list
```
