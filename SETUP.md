# Установка и публикация

## Требования

- Node.js 22 или новее;
- pnpm 10;
- Docker Desktop для локального Supabase;
- проект Supabase для рабочей публикации;
- проект Cloudflare Pages для статического интерфейса.

## Локальный запуск

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
.\node_modules\.bin\supabase.cmd start
.\node_modules\.bin\supabase.cmd db reset
pnpm dev
```

После `supabase start` скопируйте `API URL`, `anon key` и `service_role key` в `.env.local`. Для интерфейса оставьте `VITE_DEMO_MODE=true`, если нужен автономный образец. Чтобы проверить настоящую базу и функции, задайте `VITE_DEMO_MODE=false`.

Для локальных функций создайте игнорируемый файл `supabase/.env.local`:

```dotenv
PUBLIC_SITE_URL=http://127.0.0.1:5173
ALLOWED_ORIGINS=http://127.0.0.1:5173
BOOKING_TOKEN_SECRET=replace-with-at-least-32-random-bytes
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=
LLM_DAILY_TOKEN_BUDGET=50000
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:owner@example.com
CRON_SECRET=replace-with-a-separate-random-secret
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY` локальная среда функций предоставляет сама. Запуск:

```powershell
.\node_modules\.bin\supabase.cmd functions serve --env-file supabase/.env.local
```

Локальные владельцы из `supabase/seed.sql`:

- `graphite.owner@example.test` / `DemoGraphite!2026`;
- `ember.owner@example.test` / `DemoEmber!2026`.

Эти учётные данные предназначены только для локальной разработки.

## Проверки

```powershell
pnpm lint
pnpm typecheck
pnpm check:functions
pnpm test
pnpm test:integration
.\node_modules\.bin\supabase.cmd test db
pnpm build
pnpm test:e2e
pnpm tenant:verify graphite
pnpm tenant:verify ember-garage
```

Для сетевого интеграционного теста задайте `RUN_SUPABASE_INTEGRATION=true`, `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`. SQL-тесты требуют запущенного локального Supabase.

## Подготовка Supabase

1. Свяжите каталог с проектом: `.\node_modules\.bin\supabase.cmd link --project-ref <PROJECT_REF>`.
2. Примените миграции: `.\node_modules\.bin\supabase.cmd db push`.
3. Отключите самостоятельную регистрацию пользователей в Auth. Это уже задано для локальной среды в `supabase/config.toml`.
4. Создайте владельца через административную панель Auth, не через публичный интерфейс.
5. Добавьте членство владельца:

```sql
insert into public.tenant_members (tenant_id, user_id, role)
select id, '<AUTH_USER_UUID>'::uuid, 'owner'
from public.tenants
where slug = '<TENANT_SLUG>';
```

6. Установите секреты функций:

```powershell
.\node_modules\.bin\supabase.cmd secrets set `
  PUBLIC_SITE_URL=https://booking.example.com `
  ALLOWED_ORIGINS=https://booking.example.com `
  BOOKING_TOKEN_SECRET=<RANDOM_SECRET> `
  LLM_BASE_URL=https://api.openai.com/v1 `
  LLM_API_KEY=<LLM_KEY> `
  LLM_MODEL=<MODEL> `
  LLM_DAILY_TOKEN_BUDGET=50000 `
  VAPID_PUBLIC_KEY=<PUBLIC_KEY> `
  VAPID_PRIVATE_KEY=<PRIVATE_KEY> `
  VAPID_SUBJECT=mailto:owner@example.com `
  CRON_SECRET=<CRON_SECRET>
```

Сгенерировать VAPID-пару можно командой `pnpm dlx web-push generate-vapid-keys`. Публичный ключ также укажите как `VITE_VAPID_PUBLIC_KEY` при сборке интерфейса. Закрытые ключи, `service_role` и ключ модели не должны начинаться с `VITE_`.

7. Опубликуйте функции:

```powershell
.\node_modules\.bin\supabase.cmd functions deploy public-api
.\node_modules\.bin\supabase.cmd functions deploy owner-api
.\node_modules\.bin\supabase.cmd functions deploy assistant
.\node_modules\.bin\supabase.cmd functions deploy notification-dispatch
```

8. В SQL Editor запланируйте обработчик очереди. Второе значение должно совпадать с `CRON_SECRET`:

```sql
select public.admin_schedule_notification_dispatch(
  'https://<PROJECT_REF>.supabase.co/functions/v1/notification-dispatch',
  '<CRON_SECRET>'
);
```

## Публикация студии

Сначала всегда публикуйте предварительную версию:

```powershell
pnpm tenant:validate graphite
pnpm tenant:publish graphite --dry-run
pnpm tenant:publish graphite
```

Проверьте адрес, телефон, часы, услуги, ресурсы, цены, часовой пояс и изображения. Только затем активируйте рабочий режим:

```powershell
pnpm tenant:publish graphite --live
```

Повторная публикация обновляет конфигурацию, но не удаляет записи, платежи и фотографии, загруженные владельцем.

## Cloudflare Pages

- команда сборки: `pnpm build`;
- каталог публикации: `dist`;
- версия Node.js: 22;
- рабочие переменные: все `VITE_*` из `.env.example`, но `VITE_DEMO_MODE=false`;
- `dist/_redirects` создаётся сборкой и направляет глубокие ссылки в оболочку нужной студии.

После публикации выполните:

```powershell
pnpm tenant:verify graphite --url https://booking.example.com
pnpm tenant:verify ember-garage --url https://booking.example.com
```

На iPhone push появляется только у установленного приложения. Проверьте установку, заставку, автономный режим, переходы по глубоким ссылкам и уведомления на реальных iOS и Android устройствах.

