# Автономное развёртывание приложений на Supabase + Vercel с помощью Codex

Версия регламента: 1.0  
Дата проверки: 19 октября 2026 года  
Назначение: исполняемый регламент для LLM-агента, который получает неизвестный репозиторий и должен безопасно довести его до проверенного Preview, а после разрешения — до Production.

## Статусы достоверности и обозначения

- **ПОДТВЕРЖДЕНО:** проверено по текущему репозиторию, официальной документации или историческому журналу.
- **ШАБЛОН:** универсальная процедура, которую обязательно адаптируют после исследования нового репозитория.
- **УСЛОВНО:** применяется только при обнаружении указанной технологии или функции.
- **НЕ ПРОВЕРЕНО:** состояние внешнего сервиса или конкретного проекта не удалось проверить.
- `PASS` — проверка завершилась ожидаемым результатом и сохранила доказательство.
- `FAIL` — критерий не выполнен; переход к зависимому этапу запрещён.
- `BLOCKED` — отсутствует доступ, обязательное значение или человеческое решение.
- `SKIPPED_WITH_REASON` — проверка неприменима; причина записана. Молчаливый пропуск запрещён.

В командах переменные вида `$env:DEPLOY_*` должны быть заранее получены из разрешённого источника и проверены. Строки `<PROJECT_REF>`, `NEW_PROJECT_REF`, `YOUR_TOKEN` и подобные заполнители нельзя передавать CLI буквально.

## Основания руководства

Руководство построено на:

1. полном разборе [`01_DEPLOY_KNOWLEDGE_BASE.md`](./01_DEPLOY_KNOWLEDGE_BASE.md), содержащем `ERR-001`–`ERR-027` и `CHK-001`–`CHK-026`;
2. анализе текущего репозитория;
3. текущей официальной документации [Supabase CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows), [Supabase environments](https://supabase.com/docs/guides/deployment/managing-environments), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vercel CLI deployment](https://vercel.com/docs/projects/deploy-from-cli), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Vercel monorepos](https://vercel.com/docs/monorepos), [Vercel promotion](https://vercel.com/docs/deployments/promote-preview-to-production) и [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment).

Команды внешних CLI необходимо повторно сверять через `--help` установленной версии перед выполнением: интерфейсы облачных инструментов меняются.

---

## РАЗДЕЛ 1. Миссия автономного агента

### 1.1. Результат работы

Агент должен не просто получить зелёный build, а доказать всю цепочку:

```text
исходный код
  -> воспроизводимая локальная сборка
  -> согласованная схема и серверные компоненты Supabase
  -> корректная конфигурация Preview
  -> работающие пользовательские сценарии Preview
  -> разрешение на Production
  -> Production deployment
  -> Production smoke tests и проверка журналов
  -> отчёт с доказательствами и планом отката
```

Успех означает одновременно:

- выбран правильный deploy root и правильное приложение;
- зависимости установлены из lock-файла;
- обязательные статические проверки и тесты прошли;
- миграции, RLS, Auth, Storage и Functions проверены только если используются;
- клиентские и серверные переменные разделены;
- Preview проверен прямыми HTTP/API/browser-тестами;
- Production создан только после разрешённого контрольного шлюза;
- Production проверен по реальным URL и критическим сценариям;
- нет скрытых `FAIL`, утечек секретов или непроверенных утверждений;
- сохранён воспроизводимый отчёт без значений секретов.

### 1.2. Обязательные входные данные

Минимально агенту нужны:

| Вход | Как получить | Если отсутствует |
|---|---|---|
| Репозиторий и выбранная ревизия | локальная рабочая копия/Git | `BLOCKED` |
| Разрешённый режим | `preview` или `production` | по умолчанию только `preview` |
| Разрешения на изменение кода | явная задача пользователя | только чтение и отчёт |
| Доступ Supabase | авторизованный CLI/MCP/API или безопасно переданный token | выполнить локальную часть, внешний этап `BLOCKED` |
| Доступ Vercel | авторизованный CLI/API/интеграция Git | Preview/Production `BLOCKED` |
| Идентификаторы организации, проекта, команды | получить через API/CLI или от пользователя | не угадывать |
| Секреты | secret manager, CI protected variables, разрешённый `.env` вне Git | запросить одним консолидированным списком через безопасный канал |
| Домены и политика Preview | конфигурация/пользователь | использовать provider URL; DNS не менять |
| Допустимые тестовые действия | политика проекта | Production-тесты только read-only |
| Критерии готовности приложения | acceptance tests/README/задача | сформировать проектный список и запросить только критически недостающие решения |

### 1.3. Необходимые ресурсы

- файловый и Git-доступ к репозиторию;
- runtime и package manager, которые требует сам проект;
- при необходимости Docker для локального Supabase;
- Supabase CLI версии, совместимой с репозиторием;
- Vercel CLI или авторизованный Vercel API;
- средство HTTP-проверок (`curl`, `vercel curl` или эквивалент);
- браузерная автоматизация для маршрутов, Auth, Service Worker и пользовательских сценариев;
- secret scanner;
- безопасное временное хранилище журналов с редактированием секретов.

Отсутствие инструмента фиксируется как факт. Агент не заявляет, что проверка выполнена, если использовал только предположение.

### 1.4. Режимы Preview и Production

| Свойство | Preview | Production |
|---|---|---|
| Цель | проверить артефакт и интеграцию | обслуживать реальных пользователей |
| Supabase | отдельный preview/staging проект предпочтителен | production project |
| Данные | синтетические, без персональных данных | реальные данные; запись только по безопасному плану |
| Домены | provider URL/branch domain | production alias/custom domain |
| CORS/Auth redirects | конкретные разрешённые preview origins | только production origins и утверждённые callbacks |
| Деплой | разрешён в рамках задачи после preflight | требует явного разрешения, если заранее не предоставлено |
| Миграции | сначала здесь | только после review, backup readiness и успешного Preview |
| Smoke tests | полный набор, включая безопасные записи | read-only и заранее разрешённые canary-записи |
| Откат | удалить/не продвигать Preview | Vercel rollback + отдельный план для данных |

Preview не должен использовать production service-role key или production DB password. Если отдельного Supabase preview-проекта нет, агент обязан обозначить риск и не выполнять изменяющие БД тесты без разрешения.

### 1.5. Что агент выполняет самостоятельно

В рамках предоставленных доступов и задачи:

- исследует файлы, Git и package scripts;
- определяет стек, deploy root и архитектурную совместимость;
- запускает read-only диагностику, lint, typecheck, тесты и локальную сборку;
- находит контракт переменных окружения, не выводя значения;
- проверяет авторизацию CLI и существование целевых ресурсов;
- создаёт план изменений и rollback;
- исправляет локальные обратимые ошибки, если пользователь поручил развёртывание/исправление;
- создаёт Preview и тестирует его, если доступ и полномочия уже даны;
- повторяет только проверки, затронутые исправлением, затем полный критический набор;
- формирует отчёт с командами, exit codes, URL, commit SHA и статусами.

### 1.6. Когда требуется пользователь

Нужен один сгруппированный запрос, если требуется:

- создать платный Supabase/Vercel ресурс;
- выбрать организацию, проект или домен при неоднозначности;
- предоставить отсутствующий credential через безопасный канал;
- утвердить опасную/необратимую миграцию;
- изменить DNS, domain ownership, production Auth policy или расширить CORS;
- решить продуктовый конфликт, например demo/localStorage против общей production БД;
- разрешить Production deployment;
- разрешить отправку реального письма, SMS или push;
- решить судьбу неизвестных пользовательских файлов или незакоммиченных изменений.

### 1.7. Запрещённые действия без отдельного разрешения

- удаление проекта, БД, Storage bucket, домена или production deployment;
- `db reset`, `DROP`, `TRUNCATE`, массовый `DELETE/UPDATE` в удалённой среде;
- принудительный Git reset, удаление чужих изменений или secrets history rewrite;
- автоматический rollback данных;
- отключение RLS, JWT verification, тестов, типов или защит ради зелёного build;
- добавление `*` в CORS для чувствительного API без обоснования и разрешения;
- перенос service-role/secret/private key в браузерный bundle;
- публикация значений секретов в чате, логе, commit или документации;
- создание Production deployment, если разрешение не было явно дано заранее;
- создание нового Supabase-проекта как первая реакция на сетевой сбой.

### 1.8. Политика секретов

1. Найти точное имя из кода/документации.
2. Классифицировать: public client value, server secret, database credential или provider access token.
3. Проверить наличие без печати значения.
4. Получить из уже разрешённого secret manager/CI/локального игнорируемого файла.
5. Если отсутствуют несколько значений — запросить их один раз списком и только через безопасный механизм.
6. Передать через stdin, защищённый env store, CLI secret command или API body; не через аргумент, попадающий в process list/history, если есть более безопасный вариант.
7. В журналах сохранять только `CONFIGURED`, `MISSING`, `INVALID`, `VERIFIED`.
8. После настройки проверить функцию, не раскрывая значение.
9. Если секрет попал в историю — немедленно остановить зависимый этап, ротировать и проверить, затем отметить старое значение отозванным.

### 1.9. Критерий завершения

Задача имеет статус `COMPLETED` только если все обязательные этапы для выбранного режима имеют `PASS`, все неприменимые — `SKIPPED_WITH_REASON`, а оставшиеся `BLOCKED/FAIL` отсутствуют. Если Production не разрешён, корректный итог — `PREVIEW_VERIFIED_AWAITING_PRODUCTION_APPROVAL`, а не «деплой завершён».

---

## РАЗДЕЛ 2. Автоматическое определение стека

### 2.1. Правило исследования

Сначала факты, затем ветвление. Нельзя начинать с предположения «это Next.js», «это Vite» или «весь backend — Supabase». Каждый вывод должен иметь источник: файл, зависимость, script, точку входа или успешный build.

### 2.2. Базовая инвентаризация

PowerShell:

```powershell
$RepoRoot = git rev-parse --show-toplevel
Set-Location -LiteralPath $RepoRoot
git status --short
rg --files -g '!node_modules' -g '!dist' -g '!.next' -g '!build'
Get-ChildItem -Recurse -File -Include package.json,pnpm-lock.yaml,package-lock.json,yarn.lock,bun.lockb,bun.lock,vercel.json,netlify.toml,Dockerfile,compose.yaml,requirements.txt,pyproject.toml,go.mod,Cargo.toml | Select-Object FullName
```

POSIX:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git status --short
rg --files -g '!node_modules' -g '!dist' -g '!.next' -g '!build'
find . -type f \( -name package.json -o -name pnpm-lock.yaml -o -name package-lock.json -o -name yarn.lock -o -name bun.lock -o -name vercel.json -o -name Dockerfile -o -name pyproject.toml -o -name go.mod \)
```

Агент составляет таблицу кандидатов на deploy root:

| Кандидат | Manifest | Entry point | Build script | Output | Server runtime | Supabase usage | Доказательство назначения |
|---|---|---|---|---|---|---|---|

Если кандидатов несколько, выбор запрещён до доказательства. Доказательствами служат README, текущий `vercel.json`, Git-интеграция, основной entrypoint, импортируемая UI-логика, lock importer и успешная локальная сборка.

### 2.3. Определение package manager

Порядок:

1. прочитать `packageManager` в ближайшем `package.json`;
2. найти lock-файл в deploy root или workspace root;
3. проверить workspace manifest;
4. сопоставить CI и docs;
5. отклонить смешение нескольких lock-файлов без явной схемы monorepo.

| Признак | Выбор | Воспроизводимая установка |
|---|---|---|
| `pnpm-lock.yaml` + `packageManager: pnpm@X` | pnpm X | `pnpm install --frozen-lockfile` |
| `package-lock.json` | npm | `npm ci` |
| `yarn.lock` | Yarn; версию брать из Corepack/config | `yarn install --immutable` для modern Yarn, иначе команда из проекта |
| `bun.lock`/`bun.lockb` | Bun | `bun install --frozen-lockfile` |

Если lock отсутствует, Production блокируется до явного решения: установка без lock невоспроизводима.

### 2.4. Определение framework и режима рендеринга

| Признаки | Класс | Vercel-ветка |
|---|---|---|
| `vite.config.*`, `src/main.*`, `vite build` | SPA/static Vite | build output обычно `dist`; deep-link rewrites проверяются отдельно |
| `next.config.*`, `app/` или `pages/`, dependency `next` | Next.js SSR/SSG/API | Framework Preset Next.js; не добавлять SPA catch-all поверх Next routes |
| `astro.config.*` | Astro | определить `output: static/server/hybrid` и adapter |
| `nuxt.config.*` | Nuxt | проверить Nitro/Vercel preset |
| `svelte.config.*` + adapter | SvelteKit | нужен adapter Vercel или поддерживаемый auto-detect |
| только HTML/CSS/JS | static | Framework Preset Other; output — фактический каталог |
| `api/`, `vercel/functions`, framework server routes | serverless | проверить runtime, timeout, region, body limits |
| Docker daemon, постоянный TCP server, локальная файловая БД, фоновые бесконечные workers | несовместимость | остановиться и предложить отдельный hosting/архитектуру |

SSR определяется по серверным entrypoints, server components, loaders/actions, API routes и build output. Наличие React само по себе не означает SPA или Next.js.

### 2.5. Определение backend

Искать:

```powershell
rg -n -i "@supabase/supabase-js|createClient\(|supabase\.co|Deno\.serve|express\(|fastify|hono|prisma|drizzle|firebase|mongodb|postgres" . -g '!node_modules/**' -g '!dist/**'
```

Классифицировать:

- Supabase Data API/RPC из браузера;
- Supabase Edge Functions;
- Vercel Functions/API routes;
- отдельный внешний backend;
- только статический frontend;
- смешанная архитектура.

Если приложение требует долгоживущих соединений, постоянного локального диска, нестандартного TCP listener или stateful worker, агент фиксирует несовместимость с прямым serverless-развёртыванием и не «исправляет» её случайным переносом кода.

### 2.6. Обнаружение Supabase

Проверить:

```powershell
Test-Path supabase\config.toml
Get-ChildItem supabase\migrations -File -ErrorAction SilentlyContinue | Sort-Object Name
Get-ChildItem supabase\functions -Directory -ErrorAction SilentlyContinue | Where-Object Name -ne '_shared'
rg -n -i "enable row level security|create policy|grant |revoke |security definer|auth\.users|storage\.buckets|cron\.|net\.http" supabase -g '*.sql' -g '*.ts'
```

Зафиксировать отдельно:

- migrations/seed/declarative schema;
- tables, RPC, extensions;
- RLS policies и grants;
- Auth providers и redirects;
- Storage buckets/MIME/size;
- Realtime publications;
- Edge Functions и `verify_jwt`;
- server secrets;
- cron/queues/webhooks;
- data publication/import steps после migrations.

### 2.7. Обнаружение переменных окружения

Искать не только `.env.example`, но и все обращения:

```powershell
rg -n "import\.meta\.env|process\.env|Deno\.env|getenv\(|env\(" . -g '!node_modules/**' -g '!dist/**' -g '!.next/**'
Get-ChildItem -Force -File -Filter '.env*' | Select-Object Name
```

Создать контракт:

| Имя | Использователь | Public/server-only | Обязательно когда | Preview | Production | Источник значения | Валидация |
|---|---|---|---|---|---|---|---|

Префиксы `VITE_`, `NEXT_PUBLIC_`, `PUBLIC_` обычно означают включение в клиентский bundle, но это подтверждается документацией framework и сборкой. Любой service-role, DB password, private VAPID, provider token или signing secret в публичной категории — критический `FAIL`.

### 2.8. Выбор Vercel Root Directory

Алгоритм:

1. перечислить все manifests;
2. определить workspace root;
3. найти приложение, реализующее требуемый пользовательский продукт;
4. выполнить его build из предполагаемого root;
5. проверить output и маршруты;
6. только затем задавать Vercel Root Directory/Framework Preset.

В monorepo каждое независимо развёртываемое приложение обычно получает отдельный Vercel project или явно выбранный root. Наличие вложенного Next.js не делает его правильной целью, если production-код находится в корневом Vite SPA.

### 2.9. Ветви совместимости

| Ветка | Решение |
|---|---|
| Static/SPA frontend + Supabase | совместимо; настроить build/output, deep routes, public env, CORS |
| Next.js + Supabase | совместимо; разделить browser/server clients, cookies/session, server-only secrets |
| SSR framework с Vercel adapter | совместимо после локального build и runtime проверки |
| Frontend + отдельный long-running backend | frontend на Vercel, backend на подходящей платформе; URL/CORS контракт |
| Docker-only monolith | прямой deploy на Vercel обычно неприменим; нужен redesign или другой hosting |
| Desktop/mobile app | Vercel может хостить web/API, но не бинарный клиент как web app |
| Неизвестный framework без build docs | `BLOCKED`; не угадывать settings |

### 2.10. Проверенный профиль текущего репозитория

Этот профиль — пример результата discovery, не default для новых проектов.

| Параметр | ПОДТВЕРЖДЕНО |
|---|---|
| Production frontend | корневой React `19.3.0` + Vite `8.3.2` SPA/PWA |
| Вложенный кандидат | `apps/web` с Next.js `16.3.6`; `pnpm-workspace.yaml` отсутствует, lock содержит только root importer |
| Package manager | pnpm `10.32.1` |
| Runtime | `engines.node >=22.0.0`; локально обнаружен Node `v22.22.2` |
| Язык/компилятор | TypeScript `5.9.3`; SQL migrations; Deno-compatible TypeScript функций |
| Supabase SDK/CLI | `@supabase/supabase-js 2.117.2`; package CLI `2.119.0` |
| Edge runtime | Deno major `2`, локальный `deno-bin 2.2.7` |
| Проверки | ESLint `10.12.0`, Vitest `5.0.3`, Playwright `1.63.0`, SQL DB tests |
| Build | `pnpm build`: assets → Vite → tenant shells |
| Output | `dist` |
| Routes | BrowserRouter `/s/:slug/*`; Vercel rewrites в `vercel.json` |
| Backend | Supabase Postgres/PostgREST/Auth/Storage + 4 Edge Functions на Deno 2 |
| Миграции | шесть timestamped SQL migrations |
| Security | RLS на публичных таблицах, grants/revokes, service-role server RPC |
| Auth | email/password owner; локальный signup выключен; demo bypass существует |
| Особый release step | `tenant:publish`, не входит в `db push`/function deploy |
| Риски | глобальный demo mode, Cloudflare-oriented docs, MIME migration, push cron, два app roots |
| Vercel CLI в текущей среде | не установлен; это ограничение среды анализа, не свойство репозитория |

Профиль подтверждает структуру и конфигурацию исходников. В рамках создания этого руководства локальные tests/build и внешний deploy повторно не запускались, поэтому их текущий `PASS` не заявляется.

### 2.11. Детали текущего репозитория, которые нельзя переносить как defaults

**Языки и форматы:** TypeScript/TSX для клиента, scripts и Edge Functions; SQL для migrations/tests/seed; TOML для Supabase; JSON для tenant data и package metadata; CSS для оформления.

**Ключевая структура:**

```text
src/                         корневое Vite-приложение
src/booking, tenant, owner   доменные клиентские модули
scripts/                     tenant validation/assets/publish/verify
tenants/                     исходные tenant-конфигурации и изображения
supabase/migrations/         шесть migrations
supabase/functions/          public-api, owner-api, assistant, notification-dispatch
supabase/tests/              SQL database test
tests/unit|integration|e2e   Vitest и Playwright
apps/web                     отдельный Next.js-кандидат, не подтверждённый как production root
packages/                    UI и config packages для вложенной структуры
```

**Browser env, подтверждённые кодом:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_API_URL`, `VITE_OWNER_API_URL`, `VITE_ASSISTANT_API_URL`, `VITE_VAPID_PUBLIC_KEY`, `VITE_DEMO_MODE`.

**Server/function env, подтверждённые кодом:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL`, `ALLOWED_ORIGINS`, `BOOKING_TOKEN_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_DAILY_TOKEN_BUDGET`. Supabase может предоставлять часть системных переменных функциям автоматически; это проверяется по текущей платформе, а не дублируется вслепую.

**Проверочные scripts:** `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:db`, `check:functions`, `build`, `tenant:validate`, `tenant:publish`, `tenant:verify`.

**Auth/security:** owner использует email/password и Supabase session в real mode; membership хранится в `tenant_members`; signup локально выключен; `owner-api` настроен с `verify_jwt=true`, три другие функции — `false` и поэтому требуют собственной проверки безопасности. RLS включается migration для публичных таблиц.

**Неустранённые проектные риски:** `VITE_DEMO_MODE` по умолчанию `true`; production Node range задан как `>=22.0.0`; исходная Storage migration не отражает подтверждённое ручное MIME-исправление; документация всё ещё ориентирована на Cloudflare Pages; scheduled push delivery не подтверждена.

---

## РАЗДЕЛ 3. Preflight Checks

### 3.1. Fail-fast

Критические проверки выполняются по порядку. `FAIL` блокирует все зависимые действия. Например, при найденном service-role key в клиенте нельзя продолжать Preview; при неизвестном deploy root нельзя связывать Vercel project; при опасной миграции нельзя выполнять `db push`.

### 3.2. Реестр проверок

| ID | Проверка и команда | Ожидаемый результат | Действие при ошибке | Блокирует |
|---|---|---|---|---|
| PF-001 | `git rev-parse --show-toplevel` | точный root | выбрать правильную рабочую копию | всё |
| PF-002 | `git status --short` | изменения классифицированы | сохранить пользовательские изменения; неизвестные файлы не удалять | изменяющие действия |
| PF-003 | `rg --files` + поиск manifests | все app roots известны | построить таблицу кандидатов | Vercel link |
| PF-004 | проверить lock-файлы и `packageManager` | один согласованный manager на root | устранить неоднозначность, не генерировать новый lock молча | install |
| PF-005 | `node --version`, manager `--version`, engines | runtime удовлетворяет проекту | установить/выбрать совместимую версию; major не повышать во время инцидента | install/build |
| PF-006 | вывести `scripts` из выбранного manifest | команды существуют | использовать docs/CI или запросить решение | tests/build |
| PF-007 | reproducible install (`pnpm install --frozen-lockfile`, `npm ci` и т. п.) | exit 0 без изменения lock | расследовать lock/runtime/registry; не переходить к build | build |
| PF-008 | `git diff --exit-code -- <lock-files>` после install | lock не изменён | остановить и объяснить drift | deploy |
| PF-009 | project lint script | exit 0 | минимально исправить только при разрешении; не выключать правило | build |
| PF-010 | project typecheck script | exit 0 | исправить типы или остановиться | build |
| PF-011 | unit tests | exit 0 | сохранить failing tests; не удалять | deploy |
| PF-012 | integration tests | exit 0 или `SKIPPED_WITH_REASON` из-за внешнего доступа | подготовить зависимость/окружение | affected flows |
| PF-013 | локальный production build | exit 0 и ожидаемый artifact | диагностировать root/config/env/dependency | Vercel deploy |
| PF-014 | проверить output (`dist`, `.next`, `build` по framework) | существует и содержит entrypoint | исправить Build/Output settings | Vercel deploy |
| PF-015 | `rg` по env access | полный контракт env | добавить только имена в example/manifest; значения не печатать | config |
| PF-016 | secret scan (`gitleaks detect --redact` при наличии) | нет секретов | отозвать/ротировать, очистить неотправленный diff безопасно | любой внешний deploy |
| PF-017 | поиск server secrets в public prefixes/bundle | совпадений нет | удалить из клиента, заменить server proxy | deploy |
| PF-018 | parse Supabase URL | только origin, без `/rest/v1` | исправить значение в target env и пересобрать | API tests |
| PF-019 | Supabase CLI `--version`, `login/status/projects list` | версия известна, доступ подтверждён | авторизоваться безопасно или `BLOCKED` | Supabase changes |
| PF-020 | validate project ref `^[a-z]{20}$` для текущего формата | реальный ref, не placeholder | получить через API/dashboard; не угадывать | link |
| PF-021 | `supabase link` + `supabase migration list` | связан ожидаемый project; local/remote история понятна | остановиться при mismatch | db push |
| PF-022 | `supabase db push --dry-run` если поддерживается `--help` | только ожидаемые migrations | review SQL, destructive gate | db push |
| PF-023 | SQL/static audit RLS | чувствительные таблицы имеют RLS и policies | добавить policy/migration; не отключать RLS | production |
| PF-024 | audit grants и `security definer` | минимальные роли, фиксированный search_path где требуется | security review | production |
| PF-025 | Auth Site URL/redirect allowlist | exact Preview/Production callbacks | настроить через авторизованный API/dashboard | auth tests |
| PF-026 | inventory Storage/Realtime/cron/extensions | каждый используемый ресурс существует | создать идемпотентно после разрешения | relevant feature |
| PF-027 | список function dirs против deploy list/config | полное соответствие | исправить список, JWT policy и imports | functions deploy |
| PF-028 | `supabase secrets list` | все обязательные имена присутствуют | загрузить безопасно одним пакетом | function smoke |
| PF-029 | DB network test и IPv4/IPv6 выбор | выбран достижимый endpoint | использовать pooler для IPv4; не форсировать direct IPv6 | migrations |
| PF-030 | Vercel CLI/API auth (`vercel whoami`) | правильный account/team | авторизоваться или `BLOCKED` | Vercel changes |
| PF-031 | `vercel link`/project metadata | linked project, team и root совпадают с планом | relink только после подтверждения target | deploy |
| PF-032 | framework/build/output settings | соответствуют доказанной архитектуре | исправить настройки, не использовать случайные defaults | deploy |
| PF-033 | env name/scope inventory для Preview/Production | обязательные имена в нужных targets | добавить безопасно и создать новый deployment | runtime tests |
| PF-034 | SPA direct-route test локально/Preview | deep URL отдаёт app, не 404 | platform-specific rewrite; не применять к SSR вслепую | production |
| PF-035 | CORS OPTIONS + actual request с точными origins | корректный allow-origin | исправить allowlist; не ставить `*` для credentials | browser API |
| PF-036 | Auth/RLS negative tests | чужие/anon данные недоступны согласно модели | исправить policies/grants | production |
| PF-037 | optional SW/VAPID/cron chain | каждый этап отдельно `PASS` | feature-specific fix или не заявлять функцию готовой | feature release |
| PF-038 | backup/PITR readiness перед risk migration | восстановление доступно и проверен RPO/RTO | запросить разрешение/backup; остановиться | destructive migration |
| PF-039 | Preview E2E | критический сценарий работает | self-healing, затем повтор полного critical set | production approval |
| PF-040 | production approval packet | target, diff, risks, rollback, тесты известны | один запрос пользователю | production |

### 3.3. Исполнимые команды выбора package manager

Агент подставляет только одну ветку после PF-004:

```powershell
# pnpm
pnpm install --frozen-lockfile

# npm
npm ci

# modern Yarn — только если версия/config подтверждают --immutable
yarn install --immutable

# Bun
bun install --frozen-lockfile
```

Затем вызываются существующие project scripts, а не выдуманные команды:

```powershell
# Сначала вывести scripts без значений env
node -e "console.log(require('./package.json').scripts)"

# Пример только если scripts существуют
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### 3.4. Проверка env-контракта

Алгоритм:

1. извлечь обращения из source/server/config;
2. извлечь имена из `.env.example` и deployment config;
3. вычислить `used - documented`, `documented - used`;
4. классифицировать public/server-only;
5. определить условную обязательность по feature flags;
6. проверить наличие по target environment без печати;
7. пересобрать после изменения build-time variables.

Для Vite `VITE_*` попадает в клиентскую сборку. Для Next.js аналогично публичны `NEXT_PUBLIC_*`; остальные значения могут быть доступны server runtime/build в зависимости от использования. Конкретное поведение сверяется с framework docs.

### 3.5. Проверка миграций

Перед remote push агент создаёт отчёт:

- список новых migration files по порядку;
- объекты CREATE/ALTER/DROP;
- операции переписывания больших таблиц;
- lock risk;
- обратимость;
- требование расширений;
- data backfill;
- RLS/grants;
- backup/PITR readiness;
- ожидаемый postcondition query.

`supabase db push` применяет ещё не применённые migrations и отслеживает историю в remote migration table. `--include-seed` нельзя применять к Production: официальный Supabase workflow допускает seed для fresh dev/staging, но предупреждает не использовать его в production.

### 3.6. Уровни блокировки

- **P0 SECURITY:** раскрытый secret, public service role, отключённая RLS на чувствительных данных — немедленная остановка.
- **P1 DATA:** неизвестная/опасная migration, неверный project ref, отсутствие backup readiness — остановка до человека.
- **P2 FUNCTIONAL:** build/test/API/E2E fail — не продвигать.
- **P3 QUALITY:** warning/deprecation без доказанного runtime-влияния — записать; политика проекта определяет блокировку.

---

## РАЗДЕЛ 4. Автоматизированная подготовка Supabase

### 4.1. Авторизация и выбор цели

1. Проверить локальную версию CLI и `supabase --help`.
2. Проверить существующую авторизацию через безопасную list-команду.
3. Получить список доступных организаций/проектов.
4. Сопоставить project ref, имя, регион и environment label с deployment manifest.
5. Запретить продолжение, если target неоднозначен.
6. Проверить ref до link; literal placeholder запрещён.

```powershell
npx supabase --version
npx supabase projects list
```

В CI авторизация обычно предоставляется через защищённый `SUPABASE_ACCESS_TOKEN`; его значение не выводится. Если list-команда не подтверждает нужный project, агент не выполняет link.

PowerShell-шаблон валидации, исполняемый только после безопасного получения значения:

```powershell
if ($env:DEPLOY_SUPABASE_PROJECT_REF -notmatch '^[a-z]{20}$') {
  throw 'SUPABASE project ref отсутствует или имеет неожиданный формат'
}
npx supabase link --project-ref $env:DEPLOY_SUPABASE_PROJECT_REF
npx supabase migration list
```

Формат ref может измениться; если официальный CLI выдаёт другой формат, агент обновляет валидатор по документации, а не обходит его.

### 4.2. Создание проекта

Создавать проект можно только если:

- существующего подходящего проекта нет;
- выбранная организация подтверждена;
- регион, тариф, имя, budget/cost согласованы;
- создание разрешено пользователем или заранее предоставленным полномочием;
- есть план хранения DB password и project ref.

Сетевой `ERR_CONNECTION_CLOSED` сам по себе не является основанием создавать новый проект. Сначала выполняются DNS/TLS/RPC/provider-status проверки и собирается request ID.

### 4.3. Подключение к БД

1. Определить поддержку IPv6.
2. На IPv4 использовать предоставленный Supabase pooler.
3. Direct connection/`--skip-pooler` использовать только при подтверждённом IPv6 и необходимости.
4. Проверять DB password через безопасную env var, не печатать.
5. Различать auth error и `Connection terminated unexpectedly`.
6. При сетевом сбое не менять schema/code.

Диагностика Windows:

```powershell
Resolve-DnsName $env:DEPLOY_DB_HOST
Test-NetConnection $env:DEPLOY_DB_HOST -Port 5432
```

Host берётся из проекта; не использовать host другого региона из примера.

### 4.4. Анализ и применение миграций

Безопасная последовательность:

```powershell
npx supabase migration list
npx supabase db push --help
# Выполнить только если установленная версия показывает поддержку опции:
npx supabase db push --dry-run
```

Далее:

1. review SQL и risk classification;
2. применить в локальной БД;
3. запустить DB/RLS tests;
4. применить в Preview;
5. проверить postconditions;
6. подготовить Production approval packet;
7. выполнить `db push` в Production;
8. немедленно проверить migration list и postconditions.

Идемпотентность обеспечивается migration history, а не бесконечным повтором DDL. Если migration частично выполнилась, запрещено просто повторять её без проверки фактической схемы.

### 4.5. RLS и права

Для каждой exposed table:

- RLS включена;
- есть явные policies для ожидаемых ролей;
- anon не получает доступ «по умолчанию»;
- authenticated user не видит/не меняет чужие строки;
- service-role используется только server-side;
- `SECURITY DEFINER` имеет минимальный scope, безопасный `search_path` и отозванный `PUBLIC EXECUTE`, если требуется;
- grants и policies проверяются вместе: одного RLS недостаточно, одного GRANT недостаточно.

Обязательные тесты:

1. anon positive для действительно публичных данных;
2. anon negative для закрытых данных;
3. user A positive для своих данных;
4. user B negative для данных A;
5. server operation positive через server boundary;
6. попытка передать чужой tenant/resource id.

Тесты предпочтительно выполнять в local/Preview с уникальными UUID. Официальная Supabase документация рекомендует изолированные тестовые users и проверку поведения RLS на уровне приложения.

### 4.6. Auth

Если Auth используется:

1. определить providers и signup policy из кода/config;
2. определить session mechanism: browser storage, cookies/SSR, PKCE, magic link;
3. составить exact Site URL и redirect/callback URLs для Preview/Production;
4. не добавлять wildcard шире необходимого;
5. проверить email confirmation, SMTP, rate limits, CAPTCHA/MFA согласно риску;
6. создать test users только в Preview или изолированном namespace;
7. проверить sign-in, refresh, logout и denied access;
8. удалить test users точечно по сохранённым IDs.

Hosted Auth settings не следует считать применёнными только потому, что они есть в локальном `supabase/config.toml`. Необходима проверка удалённого проекта через авторизованный Management API/dashboard.

### 4.7. Storage, Realtime, cron и другие компоненты

Активировать только обнаруженные функции:

| Компонент | Проверка до deploy | Проверка после deploy |
|---|---|---|
| Storage | bucket, public/private, size, MIME, policies | upload/download/delete canary object |
| Realtime | publication, RLS, replica identity | разрешённая и запрещённая подписки |
| Edge Functions | dirs, imports, runtime, JWT mode | OPTIONS + functional request + logs |
| pg_cron/pg_net | extensions, schedule, secret transport | job exists, invocation log, side effect |
| Webhooks | destination, signing secret, retries | signed canary event |
| AI provider | server-only key, model, budget | bounded test request without logging prompt secrets |

Producer и consumer должны иметь единый контракт. Например, MIME-типы, которые publisher загружает в Storage, обязаны входить в `allowed_mime_types` migration.

### 4.8. Edge Functions и secrets

1. Получить список функций из файловой системы.
2. Сопоставить с `supabase/config.toml` и frontend URLs.
3. Review `verify_jwt`; public endpoint требует отдельной защиты/валидации/rate limit.
4. Проверить имена secrets командой list без вывода значений.
5. Загрузить отсутствующие secrets из защищённого env-file/secret manager.
6. Deploy только изменённые функции либо все по утверждённой политике.
7. Изменение function secret не считать автоматически требующим redeploy: текущая документация Supabase говорит, что secrets становятся доступны функциям сразу. После изменения нужен функциональный тест.

`secrets list` используется для пользовательских function secrets. Системные переменные, которые Supabase предоставляет функции автоматически, могут не входить в этот список; их готовность проверяется безопасным функциональным health/smoke, а не попыткой установить дубликат.

```powershell
npx supabase secrets list
if ([string]::IsNullOrWhiteSpace($env:DEPLOY_FUNCTION_NAME)) { throw 'Имя функции не задано' }
npx supabase functions deploy $env:DEPLOY_FUNCTION_NAME --project-ref $env:DEPLOY_SUPABASE_PROJECT_REF
```

`DEPLOY_FUNCTION_NAME` сначала сопоставляется с точным списком обнаруженных директорий. Агент строит отдельную команду для каждого подтверждённого имени и проверяет exit code перед следующей.

Если отсутствующие secrets уже собраны в защищённый файл, не находящийся в Git и не выводимый в лог:

```powershell
if (-not (Test-Path -LiteralPath $env:DEPLOY_SECRET_FILE)) { throw 'Защищённый env-файл не найден' }
npx supabase secrets set --env-file $env:DEPLOY_SECRET_FILE --project-ref $env:DEPLOY_SUPABASE_PROJECT_REF
```

Перед вызовом агент проверяет ACL/расположение файла и имена переменных, после вызова — `secrets list` и функциональный smoke. Значения не читаются в отчёт.

### 4.9. Проверка Supabase после подготовки

Минимум:

- remote migration list совпадает с ожидаемым;
- ключевые tables/RPC/functions существуют;
- RLS negative tests проходят;
- public key выполняет только разрешённые операции;
- service-role отсутствует в клиентских файлах и bundle;
- Auth redirects соответствуют среде;
- Storage contract согласован;
- конкретный API/RPC smoke отвечает, а не только корень `/rest/v1/`;
- function logs не содержат новых 4xx/5xx для smoke run;
- дополнительные publish/seed/import steps выполнены только если обнаружены.

---

## РАЗДЕЛ 5. Автоматизированная подготовка Vercel

### 5.1. Проверка CLI/API и авторизации

```powershell
vercel --version
vercel whoami
```

Если CLI отсутствует, агент может использовать approved project dependency (`pnpm dlx vercel`, `npx vercel`) только если разрешена установка/сеть, либо авторизованный Vercel API/SDK. Он не делает вид, что доступ есть.

Проверяются account, team scope и существующие проекты. При одинаковых именах нужен project ID/team ID.

### 5.2. Project linking

1. Найти `.vercel/project.json`, если существует; IDs не считать доказательством прав.
2. Сопоставить Git repository, team и project.
3. При отсутствии проекта создать только после проверки имени, тарифа и root.
4. `vercel link` выполнять из доказанного deploy root.
5. Сохранить project/org IDs в локальном служебном state, не секреты.

```powershell
Set-Location -LiteralPath $env:DEPLOY_APP_ROOT
vercel link
```

Интерактивный выбор допустим только при присутствии пользователя; для автономной CI-схемы используются заранее проверенные IDs/API.

### 5.3. Framework Preset, Root, Build и Output

Настройки выводятся из Section 2:

| Архитектура | Framework | Build | Output | Особая проверка |
|---|---|---|---|---|
| Vite SPA | Vite | script из manifest, часто manager `build` | фактический `dist`/config | direct deep links/rewrites |
| Next.js | Next.js | `next build` через project script | управляется Vercel | SSR/API/cookies, не SPA rewrite |
| Static | Other/static | project script или none | каталог с `index.html` | cache headers/404 |
| Monorepo | по app | script выбранного package | app-specific | dependencies доступны из workspace root |
| SSR adapter | framework preset | documented build | adapter output | runtime compatibility |

Нельзя одновременно задавать Root Directory на вложенный app и запускать build-команду, рассчитанную на workspace root, без проверки. Для monorepo проверяется install scope и доступ к внутренним packages.

### 5.4. Environment variables

Для каждого имени задаются targets отдельно:

- Development — только локальная разработка, если используется Vercel env pull;
- Preview — branch/preview deployments;
- Production — production deployments.

Правила:

1. значения не передаются через чат или командную строку;
2. public framework variables не являются секретами, но их значения всё равно проверяются;
3. server secrets помечаются как защищённые и недоступны клиенту;
4. Production и Preview Supabase projects не смешиваются;
5. после изменения build-time variable нужен новый deployment;
6. статус переменной проверяется как `CONFIGURED/MISSING/INVALID/VERIFIED`;
7. старый deployment не получает новое значение автоматически.

Полезные текущие команды из официального workflow:

```powershell
vercel env ls
vercel env pull .env.vercel.preview.local --environment=preview
```

Перед `env pull` агент проверяет, что выбранный путь не существует либо является специально разрешённым временным файлом. Файл должен быть в `.gitignore`, иметь ограниченный доступ и удаляться после проверки. Его содержимое нельзя выводить. Для CI предпочтительны project env и secret manager без локального файла.

Интерактивное добавление одного значения выполняется только после валидации имени и target; CLI запрашивает value без включения его в саму команду:

```powershell
if ([string]::IsNullOrWhiteSpace($env:DEPLOY_ENV_NAME)) { throw 'Имя переменной не задано' }
vercel env add $env:DEPLOY_ENV_NAME preview
```

Для пакетной автоматизации используется Vercel API/SDK с credential из secret manager; values не включаются в deployment log.

### 5.5. Preview deployment

```powershell
vercel deploy
vercel inspect $env:DEPLOY_PREVIEW_URL
vercel logs --deployment $env:DEPLOY_PREVIEW_ID --level error --limit 50
```

Перед deploy должен быть зафиксирован commit SHA и clean/understood worktree. Полученный URL не считается успешным результатом до Section 9.

### 5.6. Анализ build/runtime logs

Классификация:

- install/lock/runtime error;
- build/type/static generation error;
- missing env at build;
- route/function runtime error;
- upstream Supabase/API error;
- warning без влияния.

Warning не повышается до root cause без доказательства. Например, широкий Node range или deprecated option записываются отдельно; runtime `Failed to fetch` диагностируется по Network/API, а не по несвязанному warning.

### 5.7. Production deployment

Допустимы две стратегии:

1. deploy той же проверенной revision: `vercel deploy --prod`;
2. promotion уже проверенного immutable Preview: `vercel promote $env:DEPLOY_PREVIEW_URL`.

Вторая уменьшает расхождение артефактов, если Vercel project и политика позволяют promotion. Перед действием проверить `vercel inspect`, commit SHA, env target и логи. Не пытаться redeploy устаревшую production-карточку, если уже есть более новый production deployment.

### 5.8. URL и домены

После Production:

- получить фактический production URL и alias через Vercel;
- проверить apex/www/subdomain policy;
- проверить DNS только если custom domain входит в задачу;
- проверить TLS;
- обновить Supabase Auth redirects/CORS/public site URL только по утверждённому exact URL;
- повторно создать deployment, если build-time env зависел от финального URL;
- проверить canonical/absolute URLs, OAuth callbacks, email links и PWA scope.

---

## РАЗДЕЛ 6. Интеграция Supabase + Vercel

### 6.1. Контракт окружений

Создать матрицу и не продолжать при перекрёстном подключении:

| Vercel target | Supabase target | Public URL/key | Server secrets | Auth redirects | CORS |
|---|---|---|---|---|---|
| Preview | Preview/Staging | только Preview | только Preview | конкретные preview callbacks | конкретные preview origins |
| Production | Production | только Production | только Production | production callbacks | production origins |

Project URL должен быть базовым origin. SDK сам формирует `/rest/v1`, `/auth/v1` и другие пути. В значение нельзя добавлять `/rest/v1`.

### 6.2. Ключи и границы доверия

| Тип | Где допустим | Где запрещён |
|---|---|---|
| publishable/anon key | browser client, если RLS корректна | не считать секретом или средством авторизации владельца |
| user access token | browser/session/cookie по framework policy | logs, URL query без необходимости |
| service-role/secret key | Edge/server/CI secret store | browser prefix, static bundle, Git |
| DB password | migration job/secure CLI | app runtime/browser/log |
| Vercel/Supabase access token | CI/authorized agent | repository/browser |
| VAPID public | browser и server | — |
| VAPID private/signing secret | server only | browser/Git |

После build выполняется scan артефакта на известные secret prefixes и exact fingerprints, если fingerprints можно получить безопасно.

### 6.3. Auth и сессии

- SPA: проверить `detectSessionInUrl`, storage persistence, redirect path и logout cleanup.
- SSR: использовать framework-approved server client/cookies; не полагаться только на browser localStorage.
- OAuth/magic link: callback должен существовать как route и входить в allowlist.
- Preview domains: динамический wildcard допускается только если модель риска это позволяет; предпочтительны stable branch aliases.
- Owner/admin UI: наличие формы не доказывает membership/role; нужна positive и negative проверка.
- Demo bypass: должен быть отдельным deployment mode, не скрытым fallback production.

### 6.4. API, RLS и CORS

1. Browser → Supabase Data API: CORS Supabase обычно управляется платформой, но RLS/grants обязательны.
2. Browser → Edge Function: функция должна корректно отвечать на OPTIONS и возвращать exact `Access-Control-Allow-Origin`.
3. Server → Supabase: CORS не участвует; проверяются credentials/network/runtime.
4. Credentials/cookies: wildcard origin несовместим с безопасной credential policy.
5. RPC smoke должен вызывать конкретную функцию с нужной ролью.
6. Public endpoint с `verify_jwt=false` требует собственной валидации, rate limit и минимальных service-role операций.

Пример безопасного preflight запроса без секретов в команде возможен только если header берётся процессом из защищённой env var. Вывод команды должен редактировать headers.

### 6.5. Runtime и serverless ограничения

Проверить:

- Node/Deno/browser compatibility;
- запрещённые native binaries;
- cold starts и timeout;
- размер request/response;
- stateless filesystem;
- region latency между Vercel и Supabase;
- WebSocket/Realtime support;
- фоновые задачи вынесены в cron/queue;
- отсутствие предположения о долгоживущем процессе.

### 6.6. Проверка до Production

Обязательные несовместимости, выявляемые заранее:

- неправильный app root;
- public secret;
- двойной API path;
- Preview frontend → Production DB;
- отсутствующий callback;
- SPA deep-link 404;
- CORS hostname mismatch;
- RLS cross-tenant access;
- missing function secret;
- Storage MIME mismatch;
- Service Worker scope mismatch;
- cron subscription есть, а dispatch отсутствует;
- build-time env изменён без нового deployment.

---

## РАЗДЕЛ 7. Автоматическое исправление ошибок

### 7.1. State machine инцидента

```text
DETECTED
  -> FROZEN (дальнейший этап остановлен)
  -> EVIDENCE_CAPTURED
  -> CLASSIFIED
  -> HYPOTHESIS_TESTED
  -> MINIMAL_FIX_APPLIED
  -> ORIGINAL_CHECK_REPEATED
  -> REGRESSION_SET_REPEATED
  -> RESOLVED или BLOCKED
```

### 7.2. Что сохранять

- run ID, timestamp, stage;
- commit SHA и deploy ID;
- команда с отредактированными аргументами;
- exit code;
- последние релевантные строки лога;
- HTTP status, request ID, route, origin;
- изменённые файлы/settings;
- hypothesis и evidence before/after;
- статус secrets только словами.

Запрещено сохранять Authorization headers, cookies, DB URLs с паролем, service-role, access tokens и private keys.

### 7.3. Классификация

| Класс | Признаки | Первая проверка | Не делать |
|---|---|---|---|
| Repository/root | не тот framework/app | manifests, entrypoint, build artifact | менять Vercel settings наугад |
| Dependency/runtime | install/build fail | lock, engines, exact version | обновлять всё сразу |
| Environment | missing/invalid URL/key | env contract и target scope | печатать значения |
| Network/provider | timeout/EOF/connection closed | DNS/TCP/status/request ID | менять код без evidence |
| Database migration | SQL/migration mismatch | migration list, dry-run, schema | reset production |
| RLS/Auth | 401/403/cross-tenant | role-specific test | отключать RLS/JWT |
| Routing | direct URL 404 | provider route config | применять SPA rewrite к SSR |
| CORS | browser blocked, server request works | OPTIONS + Origin | разрешать `*` вслепую |
| Function runtime | 5xx/function log | exact function log/config | redeploy всех функций без scope |
| Browser/PWA | SW/push-specific | browser support/registration | обвинять backend без isolation |

### 7.4. Сопоставление с исторической базой

1. Нормализовать ошибку: stage, command, status, path, role.
2. Найти ERR по техническому признаку, не только тексту.
3. Проверить условия применимости.
4. Использовать только `VERIFIED` решение, если текущие факты совпадают.
5. `PARTIALLY_VERIFIED`, `PROPOSED`, `UNRESOLVED` использовать как гипотезу, а не команду.
6. После fix повторить исходную проверку; исчезновение текста без восстановления функции не считается решением.

### 7.5. Ограничение циклов

Операционная политика по умолчанию: один исходный запуск и не более двух корректирующих попыток для одного и того же нормализованного симптома. Это не техническая константа, а предохранитель от бесконечных циклов. Каждая попытка обязана иметь новую проверяемую гипотезу и наблюдаемый критерий.

Остановка раньше лимита обязательна, если:

- повтор не дал нового evidence;
- требуется расширение прав или destructive action;
- та же ошибка повторилась после двух разных исправлений;
- provider недоступен;
- secret отсутствует;
- изменился target или появились новые пользовательские изменения.

После остановки агент выдаёт один пакет: evidence, выполненные попытки, почему не помогли, минимальный запрос человеку.

### 7.6. Правила минимального исправления

- менять только слой, где доказана причина;
- не объединять dependency upgrade, refactor и deploy fix;
- не удалять feature ради build;
- не отключать проверки;
- сохранить rollback path;
- сначала Preview;
- если изменён код — повторить lint/type/tests/build;
- если изменён env — создать новый deployment и повторить runtime tests;
- если изменена migration — повторить local/Preview DB tests;
- если изменён CORS/Auth — повторить browser flow и negative security test.

### 7.7. Типовые алгоритмы

**Двойной `/rest/v1`:** проверить base URL → удалить path → новый build → Network confirms single path.  
**SPA 404:** доказать SPA → добавить platform rewrite → direct GET → browser refresh deep route.  
**CORS:** сравнить exact `Origin` → OPTIONS → изменить минимальный allowlist → повторить actual request.  
**DB connection:** отделить credentials от DNS/TCP/IPv6 → выбрать pooler/direct по сети → повторить read-only/list → затем migration.  
**Missing function secret:** подтвердить имя из кода → безопасно set → функциональный тест; redeploy только если изменён код/требует платформа.  
**Provider EOF:** повторить скачивание ограниченно на стабильной сети → не менять application code.  
**RLS denial:** подтвердить ожидаемую роль и policy → исправить migration → positive+negative tests; не использовать service role в браузере.  
**Unknown 5xx:** request ID + provider logs + минимальный reproduction; при отсутствии evidence — `BLOCKED`, не угадывать.

---

## РАЗДЕЛ 8. Пошаговый Deployment Pipeline

### 8.1. Общий граф

```text
REPOSITORY ANALYSIS
  -> ARCHITECTURE DETECTION
  -> PREFLIGHT
  -> DEPENDENCY VALIDATION
  -> LOCAL BUILD
  -> SUPABASE VALIDATION
  -> CONFIGURATION
  -> PREVIEW DEPLOYMENT
  -> PREVIEW TESTS
  -> PRODUCTION APPROVAL
  -> PRODUCTION DEPLOYMENT
  -> PRODUCTION SMOKE TESTS
  -> FINAL REPORT
```

Каждый этап создаёт checkpoint. Повторный запуск начинает не с нуля, а проверяет fingerprint входов: commit SHA, lock hash, migration hashes, environment name inventory, linked project IDs и deployment IDs. Изменившийся fingerprint делает зависимые checkpoints устаревшими.

### 8.2. P-01 REPOSITORY ANALYSIS

**Предусловия:** репозиторий доступен; задача и границы изменений известны.

**Действия:**

1. определить Git root, branch, SHA, remotes и dirty state;
2. прочитать `AGENTS.md`, README, setup/deploy/acceptance docs;
3. перечислить manifests, lock-файлы, CI, hosting configs;
4. отметить незакоммиченные пользовательские изменения;
5. запустить secret scan до вывода файлов.

**Команды:** PF-001–PF-004, PF-016.

**Критерий успеха:** один репозиторий и его состояние однозначно идентифицированы; существующие изменения сохранены; секретов в tracked content не найдено.

**Критерий неудачи:** нет Git root/доступа, секрет в истории, неизвестные конфликтующие изменения.

**Восстановление:** остановить mutation; ротировать раскрытые secrets; запросить решение только для конфликтующего файла.

**Переход:** только в P-02 с сохранённым inventory.

### 8.3. P-02 ARCHITECTURE DETECTION

**Предусловия:** P-01 `PASS`.

**Действия:** построить таблицу app roots; определить frontend/backend/rendering/package manager/build/output; выявить Supabase и дополнительные сервисы; классифицировать совместимость.

**Команды:** Section 2 discovery-команды, чтение manifests/config/entrypoints.

**Критерий успеха:** выбран deploy root с доказательствами; сформирована architecture decision record.

**Критерий неудачи:** несколько равноправных app roots, отсутствует build path, архитектура требует неподдерживаемый runtime.

**Восстановление:** проверить CI/history/current hosting; если продуктовый выбор всё ещё неоднозначен — один вопрос пользователю.

**Переход:** только совместимая или явно разделённая архитектура.

### 8.4. P-03 PREFLIGHT

**Предусловия:** stack profile завершён.

**Действия:** выполнить PF-001–PF-040 с применимостью; построить env contract, migration risk report и approval requirements.

**Команды:** только обнаруженные scripts и проверенные CLI flags.

**Критерий успеха:** критические проверки `PASS`; неприменимые имеют причину.

**Критерий неудачи:** любой P0/P1/P2 `FAIL`.

**Восстановление:** Section 7; исправить минимальный слой и повторить зависимые checks.

**Переход:** нет скрытых `FAIL`.

### 8.5. P-04 DEPENDENCY VALIDATION

**Предусловия:** manager/runtime определены, lock существует.

**Действия:** воспроизводимая установка; проверка lock drift; audit уязвимостей согласно политике проекта; проверка native/runtime compatibility.

**Команды:** одна ветка из Section 3.3; project-specific audit command.

**Критерий успеха:** install exit 0, lock неизменён, блокирующих несовместимостей нет.

**Критерий неудачи:** resolver drift, unsupported engine, missing private registry access.

**Восстановление:** подтвердить runtime/registry credentials; не обновлять все зависимости автоматически.

**Переход:** P-05.

### 8.6. P-05 LOCAL BUILD

**Предусловия:** dependencies `PASS`, безопасные local/test env доступны.

**Действия:** lint → typecheck → unit → integration по применимости → build; проверить artifact и bundle secret scan.

**Команды:** только scripts из выбранного manifest.

**Критерий успеха:** все обязательные exit 0; artifact соответствует architecture profile; no secret in bundle.

**Критерий неудачи:** test/build fail, artifact отсутствует, build использует production secret.

**Восстановление:** классифицировать; минимальная правка; повторить изменённый тест и полный критический набор.

**Переход:** P-06.

### 8.7. P-06 SUPABASE VALIDATION

**Предусловия:** Supabase обнаружен; доступ подтверждён. Если Supabase не используется — `SKIPPED_WITH_REASON`.

**Действия:** link target; migration list/dry-run; RLS/grants/Auth/Storage/Functions inventory; network test; backup readiness для рискованных изменений.

**Команды:** Section 4 и PF-018–PF-029.

**Критерий успеха:** target доказан; migration plan известен; security tests готовы; secrets inventory без значений.

**Критерий неудачи:** target mismatch, migration conflict, missing access, security gap.

**Восстановление:** не делать push; исправить migration в local/Preview; получить минимальный доступ.

**Переход:** P-07.

### 8.8. P-07 CONFIGURATION

**Предусловия:** env contract и targets определены.

**Действия:** применить Preview migrations/functions/resources; настроить Preview secrets/env/Auth redirects/CORS; выполнить app-specific publication/import; сохранить только statuses и resource IDs.

**Команды:** `supabase db push`, `functions deploy`, `secrets set/list`, Vercel env/API — только с подтверждёнными targets.

**Критерий успеха:** server и frontend configuration согласованы; конкретный RPC/function smoke проходит.

**Критерий неудачи:** missing secret, CORS/Auth mismatch, Storage contract fail.

**Восстановление:** Section 7; не переходить к Vercel Preview с неготовым backend.

**Переход:** P-08.

### 8.9. P-08 PREVIEW DEPLOYMENT

**Предусловия:** local build и Preview backend `PASS`; Vercel link/settings подтверждены.

**Действия:** deploy exact revision; получить deployment ID/URL; inspect build; собрать error logs.

**Команды:**

```powershell
vercel deploy
vercel inspect $env:DEPLOY_PREVIEW_URL
vercel logs --deployment $env:DEPLOY_PREVIEW_ID --level error --limit 50
```

**Критерий успеха:** deployment READY, SHA/settings соответствуют плану, нет блокирующих build/runtime errors.

**Критерий неудачи:** wrong root/framework, failed build, missing env.

**Восстановление:** исправить доказанную причину; новый Preview, старый не «чинится» изменением env задним числом.

**Переход:** P-09.

### 8.10. P-09 PREVIEW TESTS

**Предусловия:** Preview URL READY.

**Действия:** выполнить Section 9: HTTP, routes, API, Supabase, Auth/RLS, safe data roundtrip, critical E2E, logs, optional features.

**Команды/API:** project E2E/smoke scripts, `vercel curl`, HTTP-клиент и browser automation. Конкретные endpoints берутся из route/API inventory.

**Критерий успеха:** весь required suite `PASS`, test data очищены точечно, logs clean.

**Критерий неудачи:** пользовательский сценарий не завершён, security negative test нарушен, ошибки 4xx/5xx неизвестного происхождения.

**Восстановление:** Section 7; новый Preview; повтор всего набора, затронутого исправлением.

**Переход:** P-10.

### 8.11. P-10 PRODUCTION APPROVAL

**Предусловия:** Preview полностью проверен.

**Действия:** сформировать один approval packet:

- repository/SHA/Preview URL;
- Supabase/Vercel target IDs и team/org;
- миграции и risk class;
- env/secrets statuses без значений;
- домены/CORS/Auth redirects;
- тесты и доказательства;
- ожидаемые изменения/стоимость;
- rollback plan;
- операции, требующие разрешения.

**Команды/API:** только read-only `vercel inspect`, Supabase migration/function/resource inventory и Git diff/status; mutation на этом этапе запрещена.

**Критерий успеха:** явное разрешение или ранее выданное полномочие покрывает конкретные действия.

**Критерий неудачи:** target/risk изменились после согласования; разрешение неоднозначно.

**Восстановление:** обновить пакет и запросить только изменившуюся часть.

**Переход:** P-11 только после approval.

### 8.12. P-11 PRODUCTION DEPLOYMENT

**Предусловия:** P-10 `PASS`; production backup/readiness `PASS`.

**Действия:** выполнять в порядке зависимостей:

1. зафиксировать before-state;
2. применить approved migrations;
3. проверить postconditions/RLS;
4. настроить function secrets/resources;
5. deploy functions;
6. выполнить project-specific publish/import;
7. проверить backend;
8. deploy/promote Vercel artifact;
9. назначить alias/domain, если разрешено.

**Команды/API:** approved `supabase db push`, отдельные `supabase functions deploy`, project-specific publish script, затем `vercel deploy --prod` или `vercel promote $env:DEPLOY_PREVIEW_URL`. Запускается только применимая ветка и только после проверки target.

**Критерий успеха:** каждый шаг exit 0 и postcondition `PASS`; production URL указывает на нужный deployment.

**Критерий неудачи:** любой шаг fail; последующие зависимые шаги не выполняются.

**Восстановление:** Section 10. Frontend rollback не откатывает данные.

**Переход:** P-12.

### 8.13. P-12 PRODUCTION SMOKE TESTS

**Предусловия:** production alias активен.

**Действия:** ограниченный безопасный Section 9 suite; реальные provider logs; проверки с внешней сети/целевого устройства при необходимости.

**Команды/API:** `vercel curl`, `vercel logs --environment production`, project smoke runner, read-only Supabase/function logs и browser automation.

**Критерий успеха:** доступность, критические routes/API/Auth и read-only data operations `PASS`; нет новых ошибок.

**Критерий неудачи:** regression, security failure, wrong backend/environment.

**Восстановление:** немедленный app rollback при user impact; data forward-fix по утверждённому плану.

**Переход:** P-13.

### 8.14. P-13 FINAL REPORT

**Предусловия:** P-12 завершён либо pipeline остановлен с `FAILED/BLOCKED`; все evidence и created resource IDs собраны.

**Действия:** сформировать redacted отчёт и сверить его с remote reality.

**Команды/API:** read-only `git status`, deployment/function inspect и logs; команда зависит от обнаруженного стека. Повторный deploy для отчёта запрещён.

**Отчёт обязан содержать:**

- итоговый статус;
- revision и immutable deployment IDs;
- URLs без credential query;
- фактически выполненные stages/checks;
- migration/function versions;
- env/secret statuses без values;
- smoke results;
- исправленные инциденты и retries;
- skipped/unverified items;
- rollback target;
- ручные последующие действия;
- фактические изменения файлов/облака.

**Критерий успеха:** числа и статусы согласованы; секретов нет; каждое утверждение имеет evidence; unresolved items названы.

**Критерий неудачи:** потеряно происхождение ресурса, есть необъяснённый `FAIL`, cleanup не зафиксирован или отчёт содержит credential.

**Восстановление:** перечитать checkpoints/provider state, выполнить только read-only проверку, повторно редактировать секреты.

**Условие завершения:** `COMPLETED`, `PREVIEW_VERIFIED_AWAITING_PRODUCTION_APPROVAL`, `BLOCKED` или `FAILED` с точной причиной. Других размытых статусов нет.

### 8.15. Повторный запуск

Повторный запуск:

- повторно использует существующие projects/link IDs;
- не создаёт project, bucket, user или cron job, если ресурс уже соответствует declarative state;
- применяет только pending migrations;
- обновляет только изменённые env/secrets;
- создаёт новый Preview для нового SHA/env fingerprint;
- не повторяет Production без нового approval, если changed scope вышел за прошлое разрешение;
- не удаляет старые deployment/data автоматически;
- проверяет stale checkpoints по input hash.

---

## РАЗДЕЛ 9. Тестирование после деплоя

### 9.1. Общие правила

- Build success не равен working application.
- Проверять deployed URL, а не локальную копию.
- Для каждого теста хранить request/run ID.
- Проверять положительные и отрицательные сценарии.
- Не использовать реальные персональные данные.
- Cleanup выполняется по IDs, созданным текущим run, а не широким условием.
- Production side effects запрещены без разрешения.

### 9.2. Smoke suite

| Test ID | Проверка | Метод | PASS | FAIL |
|---|---|---|---|---|
| SMK-001 | DNS/TLS | HTTPS GET/provider inspect | валидный TLS, ожидаемый host | DNS/TLS/redirect loop |
| SMK-002 | Главная | GET `/` + content marker | 2xx/ожидаемый redirect и marker | provider error/чужое приложение |
| SMK-003 | Основные страницы | прямой GET каждой critical route | app HTML/SSR response | 404/500 |
| SMK-004 | SPA deep link | открыть route в новой сессии и refresh | та же страница | 404/catch-all ошибка |
| SMK-005 | Статика | JS/CSS/fonts/images | 2xx, правильный MIME | 404/MIME/CSP fail |
| SMK-006 | API health | documented endpoint | ожидаемый schema/status | 5xx/timeout |
| SMK-007 | Supabase RPC/Data API | конкретная разрешённая операция | валидное тело | только gateway root отвечает |
| SMK-008 | CORS | OPTIONS + actual browser request | exact allowed origin | browser block/wildcard risk |
| SMK-009 | Auth sign-in | test user/flow | session создана | redirect/credential error |
| SMK-010 | Auth refresh/logout | refresh + logout + protected route | корректная сессия/denial | stale access |
| SMK-011 | RLS anon negative | запрещённый read/write | denied/no rows согласно contract | data disclosure/change |
| SMK-012 | RLS cross-user/tenant | user B против data A | denied/no-op | доступ получен |
| SMK-013 | Safe write/read | canary create → read | exact record | lost/incorrect data |
| SMK-014 | Idempotency | повтор с тем же idempotency key | один результат | duplicate |
| SMK-015 | Cleanup | delete/cancel by recorded ID | только canary удалён | broad/failed cleanup |
| SMK-016 | Critical E2E | основной пользовательский путь | бизнес-результат достигнут | только UI click без результата |
| SMK-017 | Server logs | deployment/function logs | нет новых unexplained error | 4xx/5xx/exception |
| SMK-018 | Environment identity | safe health metadata/project fingerprint | expected target | Preview↔Production mix |
| SMK-019 | Service Worker | `/sw.js`, registration, scope | active in timeout | hang/404/wrong scope |
| SMK-020 | Push subscription | supported browser | subscription persisted | registration error |
| SMK-021 | Scheduled delivery | cron → function → receipt | полный trace | только subscription success |
| SMK-022 | Storage | canary MIME upload/read/delete | policy contract | MIME/policy error |
| SMK-023 | Mobile/target browser | critical flow | usable result | browser-specific failure |

Применимость `SMK-009`–`SMK-023` определяется features. Неприменимые тесты помечаются, а не исчезают.

### 9.3. Безопасные тестовые данные

Формат:

```text
run_id = deploy-<UTC timestamp>-<short commit SHA>-<random suffix>
email = e2e+<run_id>@example.invalid или утверждённый test domain
metadata = { source: "deployment-smoke", run_id: "..." }
```

Правила:

1. использовать отдельный preview tenant/project;
2. в Production предпочитать read-only;
3. если write необходим и разрешён — создавать одну запись с уникальным marker;
4. сохранить все returned IDs;
5. cleanup только по ID + run_id;
6. перед delete повторно прочитать объект и сверить marker;
7. при cleanup fail оставить точный ID в отчёте, не запускать массовое удаление;
8. пользователей Auth удалять через admin API только по сохранённому UUID;
9. Storage object помещать в `deployment-smoke/<run_id>/...` и удалять только этот prefix после проверки;
10. не отправлять реальные email/SMS/push без разрешения.

### 9.4. PASS/FAIL выпуска

Production `PASS`, если:

- SMK-001–SMK-008 и SMK-016–SMK-018 прошли;
- security tests применимого Auth/data режима прошли;
- все обещанные optional features прошли свои end-to-end tests;
- cleanup подтверждён;
- ошибки logs объяснены или отсутствуют.

Любой cross-tenant data leak, service-role в bundle, неправильный project target, 5xx критического пути или невозможность rollback — release `FAIL` независимо от зелёного Vercel build.

---

## РАЗДЕЛ 10. Recovery и Rollback

### 10.1. Главное разделение

**Application rollback** переключает frontend/functions на известную рабочую версию.  
**Data rollback** меняет schema/data и требует отдельного анализа. Откат приложения не отменяет уже применённую migration или созданные записи.

### 10.2. Build failure

1. Production не тронут — rollback не нужен.
2. Сохранить build log и settings.
3. Воспроизвести локально тем же runtime/manager.
4. Исправить минимально.
5. Новый Preview.

Запрещено отключать lint/type/tests или удалять feature ради deploy.

### 10.3. Runtime failure Preview

1. Не продвигать Preview.
2. Сопоставить route/request ID/log.
3. Проверить env target, backend target, CORS/Auth.
4. Исправить и создать новый immutable Preview.
5. Повторить suite.

### 10.4. Runtime failure Production

Если пользовательский ущерб текущего frontend-release подтверждён и есть известный хороший deployment:

```powershell
vercel logs --environment production --status-code 5xx --since 30m
vercel rollback $env:DEPLOY_KNOWN_GOOD_ID
vercel rollback status
vercel logs --environment production --status-code 5xx --since 5m
```

Rollback требует полномочия, покрывающего production. После восстановления плохой release исследуется отдельно. Если причина — backend/schema, frontend rollback может не помочь.

### 10.5. Environment mismatch

1. Зафиксировать deployment ID и target env.
2. Не печатая values, сравнить names/scopes/fingerprints.
3. Восстановить предыдущую известную конфигурацию.
4. Создать новый deployment: build-time env не меняется в старом артефакте.
5. Повторить environment identity, API и critical E2E.

### 10.6. Function failure

- secrets-only change: вернуть/исправить secret и functional test;
- code regression: deploy function из known-good commit;
- JWT/CORS config: вернуть known-good config и повторить negative tests;
- не redeploy все функции, если изменена одна, без project policy.

### 10.7. Migration failure

1. Остановить frontend promotion и следующие migrations.
2. Получить точную remote migration history и schema state.
3. Определить: транзакция откатилась полностью или остались partial effects.
4. Не редактировать уже применённый migration как будто его не было.
5. Для production предпочтителен forward-fix новой migration.
6. Down migration допустима только после доказательства обратимости, backup/PITR readiness и разрешения.
7. Восстановление backup/PITR — отдельная аварийная операция с оценкой потери данных.
8. После recovery — schema/RLS/data integrity tests.

### 10.8. Auth failure

- проверить exact Site URL/callback/provider settings;
- восстановить предыдущий redirect list;
- проверить cookies/domain/same-site для SSR;
- не отключать email confirmation/MFA/RLS ради входа;
- если owner membership отсутствует — создать/исправить точечно после подтверждения личности и роли.

### 10.9. Потеря соединения с Supabase

1. проверить provider status, DNS, TLS, HTTP gateway и конкретный RPC;
2. проверить IPv4/pooler против IPv6/direct;
3. проверить Network/Firewall/VPN;
4. собрать request ID/log;
5. ограниченно повторить transient request;
6. не создавать новый проект и не менять URL без доказанной необходимости;
7. при длительном provider incident — сообщить `BLOCKED`, сохранить production на known-good state.

### 10.10. Некорректное поведение релиза

| Изменённый слой | Быстрый rollback | Долгосрочное исправление |
|---|---|---|
| Vercel frontend | `vercel rollback`/promote good deployment | fix → Preview → Production |
| Edge Function code | redeploy known-good function | fix + function tests |
| Vercel env | restore previous + new deployment | env contract/CI validation |
| Function secret | restore/rotate securely | secret inventory and smoke |
| CORS/Auth config | restore exact previous list | declarative config + tests |
| DB schema | не автоматический rollback | forward migration/approved restore |
| Data corruption | остановить writes | forensic scope + backup/PITR plan |

---

## РАЗДЕЛ 11. Минимизация участия пользователя

### 11.1. Полностью автономно при имеющихся правах

- читать repository/docs/history;
- определять stack/root/build/output;
- запускать безопасные локальные checks;
- исследовать logs и HTTP responses;
- проверять наличие env/secrets без значений;
- проверять link и resource inventory;
- создавать Preview, если это уже разрешено;
- выполнять Preview smoke/E2E с синтетическими данными;
- применять минимальные локальные исправления в пределах задачи;
- готовить Production plan и final report.

### 11.2. Требует credentials, но не отдельного подтверждения каждого использования

Если задача и scope уже разрешены:

- list/inspect Supabase/Vercel resources;
- link к утверждённому project;
- получать env из approved secret store;
- задавать approved Preview variables/secrets;
- deploy Preview/functions;
- читать logs;
- выполнять авторизованные API smoke tests.

Credential используется безопасно и никогда не публикуется.

### 11.3. Требует подтверждения человека

- создание/изменение платного ресурса;
- production deployment без заранее выданного разрешения;
- destructive или lock-heavy migration;
- production data write/delete test;
- расширение доступа, CORS, Auth providers или RLS;
- домены/DNS;
- ротация ключа, влияющая на другие системы;
- rollback Production;
- отправка реальных уведомлений;
- удаление чужих файлов/ресурсов.

### 11.4. Группировка запроса

Вместо серии вопросов агент выдаёт один пакет:

```text
Нужно подтвердить:
1. Production target: <name/id, без секретов>
2. Изменения: <список>
3. Миграционный риск: <уровень и причина>
4. Стоимость/ресурсы: <если есть>
5. Домены/CORS/Auth: <точные изменения>
6. Тестовые side effects: <email/SMS/push/data>
7. Rollback: <known-good deployment и data plan>

Отсутствующие credentials через безопасный канал:
- NAME — назначение — target — статус MISSING
```

---

## РАЗДЕЛ 12. Автоматизируемые компоненты

### 12.1. Предлагаемая структура

Эти файлы сейчас не создаются; это проект будущей автоматизации:

```text
deployment/
  manifest.schema.json
  manifest.example.yaml
  environments/
    preview.example.yaml
    production.example.yaml
  policies/
    approvals.yaml
    security.yaml
  scripts/
    discover.mjs
    env-contract.mjs
    secret-scan.mjs
    preflight.mjs
    supabase-plan.mjs
    supabase-apply.mjs
    vercel-plan.mjs
    vercel-deploy.mjs
    smoke.mjs
    cleanup.mjs
    redact.mjs
    report.mjs
  tests/
    rls/
    api/
    browser/
  state/                 # gitignored или CI artifact
    <run-id>.json
  logs/                  # gitignored, redacted
```

### 12.2. Deployment manifest

Содержит несекретные намерения:

```yaml
schemaVersion: 1
application:
  root: discovered-not-hardcoded
  packageManager: discovered
  framework: discovered
  buildCommand: discovered
  outputDirectory: discovered
environments:
  preview:
    vercelProjectId: resolved-securely
    supabaseProjectRef: resolved-securely
  production:
    approvalRequired: true
features:
  auth: detected
  storage: detected
  edgeFunctions: detected-list
  push: detected
checks:
  required: [lint, typecheck, build, smoke]
```

Идентификаторы могут храниться, секретные values — нет. Для секретов хранятся только name, target и status.

### 12.3. Назначение скриптов

| Скрипт | Вход | Выход | Mutation |
|---|---|---|---|
| `discover` | repo | stack profile | нет |
| `env-contract` | source/config | env manifest | нет |
| `secret-scan` | repo/artifact/log | redacted findings | нет |
| `preflight` | profile/policy | PASS/FAIL matrix | local tests only |
| `supabase-plan` | migrations/config/remote metadata | change plan | нет |
| `supabase-apply` | approved plan/credentials | migration/function/resource status | да |
| `vercel-plan` | profile/env inventory | project settings plan | нет |
| `vercel-deploy` | approved target/SHA | deployment ID/URL | да |
| `smoke` | deployment URL/test policy | evidence | bounded writes |
| `cleanup` | run-created IDs | cleanup proof | точечное удаление |
| `redact` | raw logs | safe logs | local output |
| `report` | state/evidence | final report | нет |

### 12.4. CI gates

На pull request:

- discovery drift;
- lock/runtime;
- lint/type/unit;
- local build;
- migration lint/dry-run against ephemeral/local;
- RLS tests;
- env contract;
- secret scan;
- Preview deploy и smoke.

На main/Production:

- immutable SHA;
- manual/protected environment approval;
- pending migrations plan;
- backup readiness;
- approved secrets available;
- promote exact tested artifact;
- production smoke;
- rollback target captured.

### 12.5. Supabase CLI automation

Подходит для:

- link/list projects;
- migration list/diff/push;
- local start/reset/test;
- function serve/deploy/list/log workflow согласно версии;
- secrets set/list;
- type generation;
- DB lint/tests.

Не все hosted Auth/project/billing settings управляются тем же CLI. Для них нужен Management API или dashboard; наличие доступа проверяется, не предполагается.

### 12.6. Vercel CLI/API automation

Подходит для:

- link/pull/env inventory;
- Preview/Production deploy;
- inspect/logs/http tests;
- promotion/rollback;
- domains при разрешении;
- SDK/API project creation и settings.

Project/team IDs фиксируются в state. Access token остаётся в CI secret store.

### 12.7. Безопасные журналы

Redactor должен удалять:

- Authorization/Cookie headers;
- значения переменных с `TOKEN`, `SECRET`, `PASSWORD`, `PRIVATE`, `SERVICE_ROLE`;
- credentials в URLs;
- `.env` contents;
- JWT и известные provider key formats.

Сохраняются: имя переменной, статус, длина/format validity без value, hash только для достаточно энтропийных значений и только если политика это разрешает.

### 12.8. Checkpoints и повторный запуск

State на этап:

```json
{
  "runId": "...",
  "stage": "PREVIEW_TESTS",
  "status": "PASS",
  "inputs": {
    "commitSha": "...",
    "lockHash": "...",
    "migrationSetHash": "...",
    "envNameSetHash": "..."
  },
  "resources": {
    "vercelDeploymentId": "...",
    "supabaseProjectRef": "..."
  },
  "evidence": ["redacted-log-path"],
  "createdResourceIds": []
}
```

Значения секретов не сохраняются. При changed input инвалидируются только зависимые stages.

### 12.9. Обработка остановок

- process exit code сохраняется;
- SIGINT/timeout переводит active stage в `INTERRUPTED`, не `PASS`;
- частично созданные resources перечисляются;
- cleanup запускается только для ресурсов, созданных данным run, и только если безопасен;
- resume сначала проверяет remote reality, затем state;
- provider state всегда важнее локального флага «успешно».

---

## РАЗДЕЛ 13. Исторические ошибки и их предотвращение

| ERR ID | Историческая проблема | Профилактика | Автоматическая проверка | Этап pipeline |
|---|---|---|---|---|
| ERR-001 | Неточная навигация и неверное env-имя | source-first env contract; UI/docs после кода | PF-015: used/documented/target diff | P-01–P-03 |
| ERR-002 | `Secret` ошибочно назван причиной Vite | проверять актуальное поведение Vercel, scope и build | PF-033 + новый Preview; presence test без value | P-07–P-09 |
| ERR-003 | `/rest/v1/rest/v1` | URL только origin | PF-018 parse pathname + SMK-007 | P-03, P-09 |
| ERR-004 | `ERR_CONNECTION_CLOSED` старого проекта | concrete RPC smoke, request ID, provider/network isolation | PF-029, SMK-007, provider logs | P-06/P-07 |
| ERR-005 | широкий Node range | зафиксировать совместимый major по проекту | PF-005, compare local/Vercel runtime | P-03/P-04 |
| ERR-006 | deprecated `inlineDynamicImports` | найти источник warning; не путать с runtime | build stderr rule + source/dependency search | P-05/P-08 |
| ERR-007 | literal `NEW_PROJECT_REF` | запрещать placeholders; валидировать ref | PF-020 regex + project list match | P-06 |
| ERR-008 | повторные pooler connection failures | разделить auth/network; определить IPv4/IPv6 | PF-029 DNS/TCP/pooler check | P-06 |
| ERR-009 | `--skip-pooler` без IPv6 | direct connection только после IPv6 proof | PF-029 | P-06 |
| ERR-010 | `public-apinpx` | одна команда/имя из discovered dirs | PF-027 exact function name set | P-07 |
| ERR-011 | Docker image EOF | классифицировать как network/pull, ограничить retry | pull readiness + exit code; no code change | P-04/P-07 |
| ERR-012 | раскрытие DB/service-role secrets | redaction, secure input, rotation gate | PF-016 + log scanner | P-01 и каждый этап |
| ERR-013 | tenant не опубликован | обнаружить post-migration publication steps | repository script graph + domain smoke | P-02/P-07 |
| ERR-014 | Storage MIME не совпал с publisher | producer/Storage contract test | PF-026, SMK-022 | P-06/P-09 |
| ERR-015 | SPA deep route 404 | platform-specific routing после architecture detection | PF-034, SMK-003/004 | P-08/P-09 |
| ERR-016 | redeploy устаревшего production | inspect SHA/current alias; deploy/promote exact artifact | PF-040 + deployment metadata | P-10/P-11 |
| ERR-017 | CORS не включал фактический Preview host | exact origin inventory; stable aliases | PF-035, SMK-008 | P-07/P-09 |
| ERR-018 | отсутствует booking signing secret | обязательные server secret names | PF-028 + функциональный create/read test | P-07/P-09 |
| ERR-019 | отсутствуют VAPID параметры | feature-specific secret/public pair contract | PF-028/PF-037, SMK-020 | P-07/P-09 |
| ERR-020 | Service Worker ждёт tenant path | scope/URL test с timeout | PF-037, SMK-019 | P-05/P-09 |
| ERR-021 | Brave push service error | browser capability matrix; отделить provider/browser | SMK-020/023 | P-09 |
| ERR-022 | owner account/membership не готов | Auth provisioning и role test либо явный demo | PF-025/PF-036, SMK-009/012 | P-06/P-09 |
| ERR-023 | global demo mode переводит данные в localStorage | fail closed в Production; разделить data/access flags | PF-024, SMK-013/018 cross-session | P-03/P-09/P-12 |
| ERR-024 | subscription не доказывает scheduled delivery | тестировать cron → dispatch → receipt | PF-037, SMK-021 | P-07/P-09 |
| ERR-025 | Cloudflare docs применены к Vercel | platform profile и отдельный config | PF-032/PF-034 | P-02/P-08 |
| ERR-026 | CLI patch warning | approved toolchain; обновлять отдельно | version manifest + release-note gate | P-03/P-04 |
| ERR-027 | случайный файл `npx` | before/after Git inventory; не удалять автоматически | PF-002/PF-008 | P-01/P-13 |

### 13.1. Ограничения автоматического применения исторических решений

- `vercel.json` SPA rewrite нельзя применять к Next.js/SSR без доказательства.
- `VITE_SUPABASE_ANON_KEY` — имя данного проекта; новый repo может использовать `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` или другое имя.
- `^[a-z]{20}$` отражает исторически наблюдаемый project ref; формат сверяется с текущим CLI.
- `tenant:publish`, MIME manifest, VAPID, cron и четыре функции специфичны для этого приложения и активируются только при обнаружении.
- создание нового Supabase project было обходом ERR-004, а не универсальным исправлением.
- browser switch исправил конкретный push incident, но не заменяет диагностику Service Worker/VAPID/provider.
- pin Node `22.x` применим только после проверки engines/dependencies нового проекта.
- статусы `PARTIALLY_VERIFIED`, `PROPOSED`, `UNRESOLVED` из исторической базы никогда не применяются автоматически как окончательное решение.

---

## РАЗДЕЛ 14. MASTER PROMPT ДЛЯ БУДУЩЕГО CODEX

Ниже расположен готовый prompt. Его можно передать новой сессии вместе с репозиторием и этим руководством.

```text
# РОЛЬ

Ты — автономный Principal DevOps Engineer и Incident Investigator. Твоя задача — исследовать данный репозиторий и безопасно развернуть совместимое приложение с Supabase и Vercel. Работай до реально проверенного результата, но не скрывай ошибки и не обещай невозможной гарантии.

# ПРИОРИТЕТЫ

Надёжность → Безопасность → Воспроизводимость → Минимальное участие человека → Скорость.

# ОБЯЗАТЕЛЬНЫЕ ИСТОЧНИКИ

1. Полностью прочитай `docs/deployment-knowledge/02_AUTONOMOUS_DEPLOY_GUIDE.md`.
2. Если существует `docs/deployment-knowledge/01_DEPLOY_KNOWLEDGE_BASE.md`, прочитай его полностью и используй матрицу ERR как базу известных инцидентов.
3. Прочитай все применимые `AGENTS.md`, README, setup/deploy/acceptance документы репозитория.
4. Для изменчивых команд и облачных требований используй актуальную официальную документацию Supabase/Vercel. Не полагайся только на память.
5. Если источник недоступен, напиши `НЕ ПРОВЕРЕНО` и не утверждай, что он изучен.

# ГРАНИЦЫ

- Не выполняй Production deployment без явного разрешения пользователя, если оно не было предоставлено заранее в этой задаче.
- Не создавай платные ресурсы, не меняй DNS/домены, не применяй destructive migrations, не удаляй данные и не расширяй security access без разрешения.
- Не выполняй `db reset`, `DROP`, `TRUNCATE`, массовый `DELETE/UPDATE` на удалённой production БД.
- Не отключай RLS, JWT verification, lint, typecheck или тесты ради зелёного результата.
- Не удаляй и не перезаписывай пользовательские изменения.
- Не угадывай project ref, team, app root, framework, URL, key или secret.
- Не используй literal placeholders вроде `NEW_PROJECT_REF`.
- Не считай успешный build доказательством работающего приложения.

# СЕКРЕТЫ

Работай с credentials, если они нужны и входят в полномочия, но безопасно:

1. Определи точное имя из кода.
2. Классифицируй public/server-only.
3. Проверь наличие без вывода value.
4. Используй авторизованный CLI/API, secret manager, CI protected variable или разрешённый игнорируемый env-файл.
5. Никогда не публикуй values в чате, логе, Git или документации.
6. Никогда не помещай service-role, DB password, private/signing key или provider token в browser bundle.
7. Если credentials отсутствуют, собери один список и запроси их однократно через безопасный механизм.
8. В отчёте используй только CONFIGURED / MISSING / INVALID / VERIFIED.
9. При обнаружении утечки останови зависимый этап, потребуй/выполни ротацию в рамках полномочий и проверь отзыв старого значения.

# РЕЖИМ РАБОТЫ

Если пользователь не указал Production, выполняй до статуса PREVIEW_VERIFIED_AWAITING_PRODUCTION_APPROVAL.

Выполняй pipeline строго:

REPOSITORY ANALYSIS
→ ARCHITECTURE DETECTION
→ PREFLIGHT
→ DEPENDENCY VALIDATION
→ LOCAL BUILD
→ SUPABASE VALIDATION
→ CONFIGURATION
→ PREVIEW DEPLOYMENT
→ PREVIEW TESTS
→ PRODUCTION APPROVAL
→ PRODUCTION DEPLOYMENT
→ PRODUCTION SMOKE TESTS
→ FINAL REPORT

# ШАГ 1. REPOSITORY ANALYSIS

- Определи Git root, branch, commit SHA, remote и dirty state.
- Найди все manifests, lock-файлы, workspace configs, hosting configs, CI и app entrypoints.
- Прочитай project docs.
- Выполни secret scan с redaction.
- Сохрани пользовательские изменения.
- Не делай mutation до завершения inventory.

# ШАГ 2. ARCHITECTURE DETECTION

- Построй таблицу всех кандидатов deploy root.
- Определи framework, package manager, runtime, build script, output, SSR/SPA/static/serverless.
- Определи backend: Supabase Data API/RPC, Edge Functions, Vercel Functions или внешний backend.
- Найди `supabase/config.toml`, migrations, functions, Auth, Storage, RLS, Realtime, cron и дополнительные publish/import scripts.
- Найди все env accesses (`import.meta.env`, `process.env`, `Deno.env`, framework config) и создай env contract.
- Не выбирай первый найденный `package.json` и не доверяй Vercel auto-detect без доказательства.
- Если нужны постоянный process/TCP/local disk/Docker runtime, остановись и опиши несовместимость с Vercel serverless.

# ШАГ 3. PREFLIGHT

Выполни применимые PF-001–PF-040 из руководства. Для каждого сохрани:

COMMAND / METHOD → EXPECTED → ACTUAL → PASS/FAIL/SKIPPED_WITH_REASON → EVIDENCE.

Критический FAIL блокирует зависимые этапы.

Обязательно:

- reproducible install из lock;
- runtime/version match;
- lint/typecheck/tests/build по scripts;
- artifact/output check;
- bundle secret scan;
- env name/scope validation;
- Supabase URL только origin;
- migration/RLS/grants/Auth/Storage/functions review;
- Preview/Production isolation;
- Vercel root/framework/build/output validation;
- CORS и direct-route plan;
- backup readiness для рискованных migrations.

# ШАГ 4. SUPABASE

Если Supabase не обнаружен — отметь SKIPPED_WITH_REASON и не навязывай его.

Если обнаружен:

1. Проверь CLI/API auth и доступные projects.
2. Однозначно выбери target; validate ref; link.
3. Определи IPv4/IPv6 и pooler/direct connection по реальной сети.
4. Сравни local/remote migration history.
5. Выполни dry-run только если установленный CLI подтверждает flag через `--help`.
6. Review destructive/locking/data operations.
7. Проверь local/Preview migration и DB tests.
8. Проверь RLS positive/negative, grants и SECURITY DEFINER.
9. Проверь hosted Auth Site URL/redirects, не только local config.
10. Проверь Storage bucket/MIME/policies, Realtime, cron/queues только если используются.
11. Проверь function dirs/config/JWT mode/secrets.
12. Примени Preview changes идемпотентно.
13. Выполни конкретный RPC/API/function smoke, не только GET `/rest/v1/`.
14. Выполни отдельные app publication/import steps, если они найдены.

Не создавай новый Supabase project только из-за первого network error. Сначала собери DNS/TCP/TLS/request ID/provider evidence.

# ШАГ 5. VERCEL

1. Проверь CLI/API auth, account/team.
2. Link из доказанного app root.
3. Проверь Framework Preset, Root Directory, Install, Build и Output по репозиторию.
4. Сопоставь env names и scopes Development/Preview/Production без вывода values.
5. Убедись, что Preview использует Preview Supabase, Production — Production.
6. Создай Preview (`vercel deploy` или эквивалент API).
7. Сохрани deployment ID/URL/SHA/settings.
8. Проверь build и runtime logs.
9. Не продвигай Preview до полного тестирования.

Для Vite SPA проверь direct deep links и platform rewrites. Для Next.js/SSR не применяй SPA catch-all вслепую.

# ШАГ 6. PREVIEW TESTS

Выполни применимые SMK-001–SMK-023:

- DNS/TLS/HTTP и content marker;
- основные страницы и direct deep routes;
- assets/MIME;
- API/RPC/Supabase;
- CORS;
- Auth session/refresh/logout;
- RLS anon и cross-user negative;
- safe canary create/read/idempotency/cleanup;
- главный пользовательский E2E;
- runtime/function logs;
- environment identity;
- Service Worker/push/cron/Storage, если обещаны.

Тестовые данные помечай уникальным run_id. Удаляй только объекты по IDs текущего run. Если cleanup не удался, не запускай broad delete — сообщи exact ID.

# ШАГ 7. SELF-HEALING

При ошибке:

1. Останови следующий этап.
2. Сохрани redacted evidence.
3. Классифицируй слой.
4. Сопоставь с ERR-001–ERR-027.
5. Проверь применимость к найденному стеку.
6. VERIFIED fix применяй только при совпадении фактов; остальные статусы — гипотеза.
7. Примени минимальное обратимое исправление.
8. Повтори исходную проверку и regression subset.
9. Не скрывай ошибку и не ослабляй защиту.

Ограничение по умолчанию: исходная попытка + не более двух корректирующих попыток с разными проверяемыми гипотезами для одного симптома. Это operational guardrail. При отсутствии нового evidence остановись раньше и запроси минимальное действие человека.

# ШАГ 8. PRODUCTION

После полного PASS Preview сформируй единый approval packet:

- target IDs/team/org;
- commit SHA и Preview URL;
- migration plan/risk;
- env/secret statuses;
- domains/CORS/Auth changes;
- test results;
- costs/side effects;
- rollback plan.

Если разрешение получено:

1. Зафиксируй before-state и known-good deployment.
2. Примени только approved Production changes.
3. После каждого migration/function/config шага проверь postcondition.
4. Deploy или promote exact tested artifact.
5. Проверь actual production alias/domain.
6. Выполни Production smoke tests; по умолчанию read-only.
7. При user-impact regression выполни approved Vercel rollback; не считай это rollback данных.

# ШАГ 9. ОТЧЁТ

Верни:

- финальный статус: COMPLETED / PREVIEW_VERIFIED_AWAITING_PRODUCTION_APPROVAL / BLOCKED / FAILED;
- stack profile и app root;
- commit SHA, project IDs, deployment IDs/URLs без credentials;
- executed/skipped checks;
- migration/function/config changes;
- env/secret statuses без values;
- smoke/E2E results;
- incidents, hypotheses, retries и evidence;
- cleanup result;
- rollback target;
- unresolved risks и минимальные действия пользователя.

Не пиши «всё работает», если не проверены production URL, API и критический пользовательский результат. Не выполняй повторный деплой только ради зелёной карточки.
```

---

## Строгая самопроверка данного руководства

| Требование | Результат |
|---|---|
| Все этапы pipeline описаны | ПОДТВЕРЖДЕНО: P-01–P-13 |
| Исторические ошибки покрыты | ПОДТВЕРЖДЕНО: ERR-001–ERR-027 в Section 13 |
| Нет жёсткой привязки к одному framework | ПОДТВЕРЖДЕНО: Vite/Next/static/SSR/monorepo/incompatible branches |
| Есть конкретные команды | ПОДТВЕРЖДЕНО; commands условны по обнаруженному stack |
| Проверка после каждого critical action | ПОДТВЕРЖДЕНО: postconditions и smoke suite |
| Повторный запуск безопасен | ПОДТВЕРЖДЕНО концептуально: fingerprints/checkpoints/idempotency; tooling ещё не создан |
| Доступы не предполагаются | ПОДТВЕРЖДЕНО: auth checks и `BLOCKED` states |
| Секреты защищены | ПОДТВЕРЖДЕНО: classification, redaction, no-values reporting |
| Опасные операции ограничены | ПОДТВЕРЖДЕНО: approval gates и запреты |
| Работает без старой переписки | ПОДТВЕРЖДЕНО: matrix и Master Prompt встроены; файл 01 усиливает evidence |
| Актуальные требования сервисов сверены | ПОДТВЕРЖДЕНО на дату документа по официальным Supabase/Vercel docs |
| Фактический deploy выполнен | НЕТ: по задаче создавался только регламент |

### Что является проверенным, а что требует адаптации

**ПОДТВЕРЖДЕНО для текущего репозитория:** профиль Section 2.10, историческая матрица, package scripts, Vite/Vercel routing, Supabase migrations/functions/Auth/RLS structure.

**ПОДТВЕРЖДЕНО официальной документацией:** базовые CLI workflows, incremental migration tracking, запрет production seed, RLS testing principles, Vercel Preview/Production deploy, promotion и rollback.

**ШАБЛОН, требующий адаптации:** app root, framework preset, build/output, обязательные env names, Auth providers, migration risk policy, test endpoints, data cleanup, domain policy, approval model и optional feature checks.

**НЕ СОЗДАНО:** предложенные automation scripts/CI manifests/state storage. Они описаны в Section 12 и должны быть реализованы отдельной задачей.

