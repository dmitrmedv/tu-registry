---
name: project-architect
description: Архітектура full-stack застосунку (React + Vite / Node + Express + MongoDB). Використовуй на старті проєкту, перед новою великою фічею, при виборі технологій, проєктуванні структури папок, моделей даних і API-контрактів, а також при плануванні роботи на етапи.
---

# Project Architect

Мета — отримати узгоджену, мінімальну й розширювану архітектуру **до** написання коду.

## Процес

1. **Збір вимог** — сформулюй коротко:
   - ролі користувачів і їхні основні сценарії (user stories);
   - сутності та зв'язки між ними;
   - нефункціональні вимоги: обсяг даних, файли, real-time, SEO, мови, доступність;
   - що **поза межами** MVP.
   Невідомі моменти — питання до користувача, не припущення.
2. **Пропозиція архітектури** (одне повідомлення, без коду):
   - модулі (домени) frontend і backend;
   - моделі даних (поля, зв'язки, індекси);
   - перелік ендпоінтів (метод, шлях, доступ);
   - сторінки й маршрути;
   - ключові рішення з альтернативами й рекомендацією.
3. **Погодження** — чекай підтвердження на значущі архітектурні рішення (нові залежності, колекції, індекси, API-контракти — див. CLAUDE.md).
4. **План етапів** — кожен етап ≤ 1 логічної фічі, закінчується перевіреним робочим станом.
5. **Реалізація етапами → перевірки → звіт.**

## Обґрунтування стеку

| Рішення | Чому | Коли інакше |
|---|---|---|
| TypeScript | контракти між шарами, безпечний рефакторинг | маленький прототип — за погодженням |
| TanStack Query для серверних даних | кеш, retry, інвалідація, стани «з коробки» | — |
| Redux Toolkit | лише складний клієнтський стан (кошик, багатокроковий редактор) | у більшості CRUD-застосунків не потрібен |
| React Hook Form + Zod | мало ре-рендерів, одна схема для типів і валідації | Formik — якщо вже є в проєкті |
| CSS Modules + SCSS | ізоляція стилів без runtime, токени через CSS-змінні | — |
| Zod на backend | одна мова схем, автоматичні TS-типи | — |
| JWT access у пам'яті + випадковий refresh у httpOnly cookie (хеш у `refreshSessions`) | короткий access, миттєве відкликання сесій, захист від XSS-крадіжки refresh | — |
| npm workspaces | один репозиторій, окремі залежності client/server | — |

**Не додавай** за замовчуванням: GraphQL, мікросервіси, Redis, черги, SSR, монорепо-інструменти (Nx/Turbo). Лише коли вимоги цього справді потребують.

## Еталонна структура

```
project/
├── client/src/
│   ├── app/            # App.tsx, router.tsx, providers.tsx, queryClient.ts
│   ├── pages/          # HomePage/, LoginPage/ — лише компонування
│   ├── features/
│   │   └── posts/
│   │       ├── api/         # postsApi.ts, queries.ts (useQuery/useMutation)
│   │       ├── components/  # PostCard/, PostForm/
│   │       ├── model/       # types.ts, schemas.ts (Zod)
│   │       └── index.ts     # публічний API фічі
│   ├── shared/
│   │   ├── api/        # axios instance, interceptors
│   │   ├── ui/         # Button, Input, Modal — без бізнес-логіки
│   │   ├── hooks/ lib/ types/
│   └── styles/         # _tokens.scss, _mixins.scss, global.scss
├── server/src/
│   ├── config/         # env.ts (Zod-валідація env), db.ts, logger.ts
│   ├── modules/
│   │   └── posts/
│   │       ├── post.model.ts
│   │       ├── post.schema.ts      # Zod: create/update/query
│   │       ├── post.service.ts     # бізнес-логіка
│   │       ├── post.controller.ts  # HTTP ↔ service
│   │       ├── post.routes.ts
│   │       └── post.test.ts
│   ├── middlewares/    # authenticate (requireAuth, requireRole), rateLimit, upload, errorHandler
│   ├── utils/          # ApiError, parseRequest, clock, kyivDate
│   ├── app.ts
│   └── server.ts
└── e2e/
```

### Правила залежностей
- `pages → features → shared` (ніколи навпаки). Фічі не імпортують одна одну напряму — через `index.ts`, а спільне виносять у `shared`.
- Backend: `routes → controller → service → model`. Модулі спілкуються через сервіси, не через моделі один одного.
- Типи API-відповідей описуються один раз (Zod-схема або спільний тип), не копіюються вручну в кількох місцях.

## Проєктування API

- Ресурси — іменники в множині: `GET /api/v1/posts`, `GET /api/v1/posts/:id`, `POST`, `PATCH`, `DELETE`.
- Версіонування: префікс `/api/v1`.
- Статуси: 200, 201 (створено), 204 (без тіла), 400 (валідація), 401, 403, 404, 409 (конфлікт), 422 (бізнес-правило), 500.
- Пагінація: `?page=1&limit=20` → `{ data, meta: { page, limit, total, totalPages } }`.
- Фільтри та сортування — через query з whitelist полів.
- Формат помилки: `{ error: { code: 'VALIDATION_ERROR', message, details } }`.

## Конфігурація середовища

- Перелік змінних — `server/.env.example` і `client/.env.example`; нова змінна додається туди й у `server/src/config/env.ts`.
- `client/.env.example`: `VITE_API_URL`.
- Env валідується Zod при старті сервера — застосунок падає одразу, якщо змінної немає.

## Типові помилки

| Помилка | Правильно |
|---|---|
| Структура `components/ containers/ services/` на весь проєкт | групування за доменом (`features/`, `modules/`) |
| Бізнес-логіка в контролерах або React-компонентах | сервіси / хуки фіч |
| Серверні дані копіюються в Redux | TanStack Query — єдине джерело серверних даних |
| «Універсальний» generic-репозиторій для всіх моделей з першого дня | прямі Mongoose-виклики в сервісі, абстракція — коли з'явиться реальне дублювання |
| Велика фіча одним етапом | етапи по 1 вертикальному зрізу (модель → API → UI → тест) |
| Зміна контракту API без оновлення клієнта й Swagger | контракт змінюється в одному коміті всюди |

## Шаблон плану етапів

```
Етап 0: Ініціалізація — workspaces, ESLint/Prettier, TS, Vitest, .env.example, health-check.
Етап 1: Backend-каркас — app.ts, errorHandler, validate, підключення БД, Swagger.
Етап 2: Auth — User, register/login/refresh/logout, тести.
Етап 3: Frontend-каркас — роутер, axios, QueryClient, layout, захищені маршрути.
Етап 4+: Фічі — по одному вертикальному зрізу.
Фінал: E2E ключових сценаріїв, Docker (за потреби), README.
```
