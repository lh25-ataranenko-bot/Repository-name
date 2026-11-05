# Розгортання AutoWise

Інструкція для одного сервера (VPS) з Docker. Після неї сайт працює на вашому домені
з HTTPS, API доступний за тією ж адресою (`https://домен/api/...`), база даних щодня
копіюється.

## Що знадобиться

- Сервер з Linux, 2 ГБ RAM і більше, Docker та Docker Compose.
- Домен. Його DNS-запис **A** (і **A** для `www`) має вказувати на IP сервера.
- Відкриті порти 80 і 443.
- Поштовий сервіс із SMTP (для підтвердження пошти й відновлення пароля).
- За бажанням — ключ Claude API для AI-помічника.

## 1. Налаштування

```bash
git clone https://github.com/lh25-ataranenko-bot/Repository-name.git autowise
cd autowise
cp .env.production.example .env
```

Заповніть `.env`. Довгі випадкові значення для `POSTGRES_PASSWORD` і `AUTOWISE_JWT_SECRET`:

```bash
openssl rand -base64 48
```

Сервер **не запуститься**, якщо секретний ключ, пароль адміністратора чи пароль бази
залишились стандартними, або якщо адреса сайту не `https://`. Повідомлення в журналі
назве, що саме треба виправити.

## 2. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Перший запуск: створюються таблиці, адміністратор і (якщо `AUTOWISE_SEED_DEMO=1`)
демо-каталог. Caddy сам отримує сертифікат HTTPS — це займає до хвилини.

Перевірка:

```bash
curl https://ваш-домен/api/health
docker compose -f docker-compose.prod.yml logs -f api
```

Увійдіть на сайті як адміністратор і **одразу змініть пароль** у кабінеті.

## 3. Резервні копії

Сервіс `backup` щодня зберігає дамп бази в `./backups` і видаляє копії, старші за
`BACKUP_KEEP_DAYS` днів. Копіюйте цю папку ще й за межі сервера (інший сервер, хмарне сховище).

Фото авто лежать в окремому томі `media`. Копіюйте його разом із базою:

```bash
docker run --rm -v autowise_media:/media -v "$PWD/backups":/out alpine tar czf /out/media-$(date +%F).tar.gz -C /media .
```

(назва тому — `<папка проєкту>_media`, див. `docker volume ls`).

Відновлення з копії:

```bash
gunzip -c backups/autowise-2026-11-04_0300.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U autowise autowise
docker compose -f docker-compose.prod.yml restart api
```

## 4. Оновлення

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Міграції бази застосовуються автоматично під час запуску `api`. Перед великим
оновленням зробіть позачергову копію:
`docker compose -f docker-compose.prod.yml exec db pg_dump -U autowise autowise | gzip > before-update.sql.gz`.

## 5. Мобільний застосунок

У `mobile/eas.json` замініть `https://autowise.example` на адресу вашого сайту
(той самий домен — API працює на ньому), потім:

```bash
cd mobile
npx eas-cli@latest build --platform android --profile preview
```

## Що де працює

| Сервіс | Призначення | Доступ ззовні |
|--------|-------------|---------------|
| `caddy` | HTTPS, перенаправлення `/api/*` на сервер, решту — на сайт | порти 80, 443 |
| `web` | Сайт (Next.js) | лише через Caddy |
| `api` | Сервер (FastAPI), 2 процеси | лише через Caddy |
| `db` | PostgreSQL | ні |
| `redis` | Спільний кеш, ліміти запитів і блокування входу для всіх процесів `api` | ні |
| `backup` | Щоденний дамп бази в `./backups` | ні |

У режимі production документація API (`/docs`) вимкнена.
