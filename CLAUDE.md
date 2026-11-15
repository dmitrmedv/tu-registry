# CLAUDE.md — Постійні правила розробки

Цей файл — контракт між розробником і Claude. Правила тут діють у кожній сесії та мають пріоритет над загальними звичками. Детальні інструкції за напрямами винесено в Skills (`.claude/skills/`).

---

## 1. Роль

Працюй як **Senior Full-Stack Architect / технічний керівник**:

1. **Аналізуй вимоги** — уточни, що саме потрібно, хто користувач, які обмеження. Якщо вимога неоднозначна — спитай, а не вгадуй.
2. **Пропонуй архітектуру** — коротко: модулі, моделі даних, ендпоінти, сторінки.
3. **Погоджуй важливі рішення** перед реалізацією (див. розділ 7).
4. **Розбивай роботу на невеликі етапи** — кожен етап закінчується робочим, перевіреним станом.
5. **Реалізуй етап** — тільки те, що входить в етап.
6. **Тестуй** — запускай lint, typecheck, тести; перевіряй вручну, якщо потрібно.
7. **Документуй** — що зроблено, як перевірено, що лишилось.

---

## 2. Технологічний стек (рішення за замовчуванням)

| Шар | Технологія | Примітка |
|---|---|---|
| Мова | **TypeScript** (strict) | JS — лише якщо явно погоджено |
| Frontend | React 18+, Vite, React Router | SPA |
| Серверний стан | **TanStack Query** | кеш, завантаження, інвалідація |
| Клієнтський стан | React state / Context; **Redux Toolkit** — лише для складного глобального стану | не дублювати серверні дані в Redux |
| Форми | **React Hook Form + Zod** | Formik — лише в наявних проєктах |
| Стилі | **CSS Modules + SCSS** | дизайн-токени як CSS-змінні |
| HTTP | Axios (один інстанс з інтерсепторами) | |
| Backend | Node.js 22 LTS, Express, REST | |
| Валідація API | **Zod** | схеми на вході кожного ендпоінта |
| БД | MongoDB + Mongoose | |
| Auth | JWT (access + refresh), bcrypt | refresh у httpOnly cookie |
| Файли | Multer | обмеження розміру й типу обов'язкові |
| Документація API | Swagger / OpenAPI 3 | |
| Тести | Vitest (+ Testing Library, Supertest), Playwright (E2E) | |
| Якість | ESLint (flat config), Prettier | |
| Інфраструктура | Docker / docker-compose — за потреби | |

Обґрунтування вибору — у skill `project-architect`.

---

## 3. Структура репозиторію

Frontend і backend **розділені** — окремі пакети, окремі залежності, окремі `.env`.

```
project/
├── CLAUDE.md
├── .claude/skills/          # Skills для Claude
├── client/                  # React + Vite
│   └── src/
│       ├── app/             # провайдери, роутер, глобальні стилі
│       ├── pages/           # сторінки (компонування фіч)
│       ├── features/        # модулі за доменами: auth/, posts/ ...
│       ├── shared/          # ui/, hooks/, lib/, api/, types/
│       └── styles/          # токени, міксини
├── server/                  # Express API
│   └── src/
│       ├── config/          # env, db, логер
│       ├── modules/         # users/, auth/, posts/ — кожен: routes, controller, service, model, schema
│       ├── middlewares/     # auth, validate, errorHandler, upload
│       ├── utils/           # ApiError, asyncHandler
│       ├── docs/            # OpenAPI
│       ├── app.ts           # створення Express app (без listen)
│       └── server.ts        # точка входу (listen)
├── e2e/                     # Playwright
├── docker-compose.yml       # за потреби
└── package.json             # npm workspaces
```

---

## 4. Обов'язкові правила

### 4.1 Мінімалізм
- **Не створюй зайвого коду.** Ні «на майбутнє», ні абстракцій під один випадок, ні непотрібних залежностей.
- Нова npm-залежність — лише з обґрунтуванням (чому не вистачає наявного).
- Не змінюй код поза межами задачі без запиту (рефакторинг — окремий етап).

### 4.2 Модульність і відсутність дублювання
- Код групується **за доменом** (feature/module), а не за типом файлу на верхньому рівні.
- Кожен модуль має чітку відповідальність і публічний інтерфейс (`index.ts`).
- **Не дублюй логіку**: перед написанням функції перевір `shared/`, `utils/`, наявні сервіси. Повторення втретє → винеси.
- Шари backend: `routes → controller → service → model`. Контролер не звертається до БД напряму, сервіс не знає про `req/res`.

### 4.3 Обробка помилок
- Кожна асинхронна операція має обробку помилок.
- Backend: єдиний `errorHandler` middleware, клас `ApiError`, `asyncHandler` для контролерів. Ніяких `try/catch`, що «ковтають» помилку.
- Єдиний формат відповіді з помилкою: `{ error: { code, message, details? } }`.
- Frontend: стани `loading / error / empty / success` для кожного запиту; Error Boundary на рівні роутів.
- Не показуй користувачу stack trace і внутрішні повідомлення.

### 4.4 Валідація введених даних
- **Сервер — джерело істини.** Усі вхідні дані (`body`, `params`, `query`, файли) валідуються Zod-схемою до потрапляння в контролер.
- Клієнтська валідація — для UX, не для безпеки.
- Mongoose-схеми мають власні обмеження (`required`, `maxlength`, `enum`) як другий рубіж.

### 4.5 Безпека
- Паролі — лише bcrypt (cost ≥ 12). Ніколи не повертати `password` у відповідях (`select: false`).
- Секрети — лише в `.env` (у `.gitignore`); у репозиторії — `.env.example` без значень.
- `helmet`, CORS з явним списком origin, rate limiting на auth-ендпоінтах.
- Захист від NoSQL-ін'єкцій: валідація типів через Zod, `express-mongo-sanitize` або `sanitizeFilter`.
- Перевірка прав доступу (authorization) на рівні сервісу — користувач змінює лише свої ресурси.
- Multer: ліміт розміру, whitelist MIME-типів, генеровані імена файлів.
- Не логувати паролі, токени, персональні дані.
- `dangerouslySetInnerHTML` — заборонено без санітизації (DOMPurify).

### 4.6 Читабельність
- Зрозумілі імена замість коментарів. Коментар пояснює **чому**, а не **що**.
- Коментарі обов'язкові для: неочевидних бізнес-правил, обхідних рішень, безпекових нюансів.
- Функція — одна відповідальність; файл > ~250 рядків — сигнал розділити.
- Без `any` (виняток — з коментарем-обґрунтуванням). Без закоментованого мертвого коду.

### 4.7 Чесність щодо перевірок
- **Ніколи не вигадуй результати тестів, lint чи збірки.** Повідомляй лише те, що реально запущено, з реальним виводом.
- Якщо перевірку не вдалося запустити — так і скажи й поясни чому.
- Якщо тест падає — показати помилку, не приховувати, не послаблювати тест заради «зеленого» результату.

### 4.8 Перевірки після змін
Після кожної зміни коду запускай відповідні перевірки:

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test          # Vitest
npm run test:e2e      # Playwright — для змін у ключових сценаріях
npm run build         # перед завершенням етапу
```

Етап не вважається завершеним, поки перевірки не пройдені (або явно не задокументовано, чому це неможливо).

---

## 5. Стиль коду

- Prettier: `singleQuote: true`, `semi: true`, `trailingComma: 'all'`, `printWidth: 100`.
- Імена: компоненти `PascalCase`, хуки `useSomething`, функції/змінні `camelCase`, константи `UPPER_SNAKE_CASE`, файли компонентів `PascalCase.tsx`, решта `camelCase.ts`, Mongoose-моделі в однині (`User`).
- Імпорти: зовнішні → аліаси (`@/…`) → відносні. Без глибоких відносних шляхів (`../../../`).
- Іменовані експорти замість default (виняток — lazy-сторінки).
- `async/await` замість ланцюжків `.then`.

---

## 6. Git

- Гілки: `feature/…`, `fix/…`, `chore/…`.
- Коміти — Conventional Commits: `feat(auth): add refresh token rotation`.
- Один коміт — одна логічна зміна. Не комітити `.env`, `node_modules`, `dist`, `uploads`.
- Комітити/пушити лише за запитом користувача.

---

## 7. Рішення, які потрібно погоджувати

Перед реалізацією спитай, якщо зміна стосується:
- архітектури або структури проєкту;
- схеми БД (нові колекції, зміна наявних полів, індекси на великих колекціях);
- моделі автентифікації/авторизації;
- нових залежностей;
- публічного API (зміна контракту ендпоінтів);
- видалення даних або файлів;
- інфраструктури (Docker, CI, деплой).

Дрібні рішення в межах погодженої архітектури — приймай самостійно й коротко згадуй у звіті.

---

## 8. Формат звіту після етапу

```
## Етап N: <назва>
**Зроблено:** …
**Змінені файли:** …
**Перевірки:** (реальні команди та результат)
**Відомі обмеження / TODO:** …
**Наступний етап:** …
```

---

## 9. Skills

| Skill | Коли використовувати |
|---|---|
| `project-architect` | старт проєкту, нова фіча, архітектурні рішення, структура |
| `react-development` | компоненти, хуки, роутинг, стан, форми, запити |
| `frontend-design` | верстка, стилі, адаптивність, доступність, UI-компоненти |
| `nodejs-backend` | Express, REST, middleware, помилки, Swagger, Multer |
| `mongodb-database` | Mongoose-схеми, запити, індекси, агрегації |
| `authentication` | реєстрація, логін, JWT, refresh, ролі, захист маршрутів |
| `testing-debugging` | Vitest, Playwright, Supertest, налагодження помилок |

---

## 10. Особливості цього проєкту — реєстр заяв на ТУ

Джерело істини для бізнес-рішень — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Тут лише те, що відрізняється від загальних правил вище.

- **Пакети:** `@tu-registry/client`, `@tu-registry/server`, `@tu-registry/shared`. Zod-схеми, enum-и, формат номера і нормалізація телефону — **лише** в `packages/shared`. Пакет підключається як вихідний TS (`exports → src/index.ts`); `tsup` вбудовує його в збірку сервера.
- **Express 5:** помилки з `async`-обробників передаються в `errorHandler` автоматично — `asyncHandler` не потрібен.
- **Автентифікація:** вхід за **логіном** (не email), відкритої реєстрації немає, акаунти створює адміністратор. Права (`role`, `canManageRegistration`, `isActive`) і сесія читаються з БД на кожному запиті, а не з JWT. Деталі — `docs/ARCHITECTURE.md` §6.3.
- **Приватні маршрути:** `requireAuth` (= `authenticate` + `requirePasswordChanged`), за потреби `requireRole('ADMIN')` з `middlewares/authenticate.ts`. Поточний користувач — `req.user`.
- **Валідація запиту:** не middleware, а `parseRequest(req, { body, params, query })` з `utils/parseRequest.ts` на початку контролера — повертає типізовані дані зі спільних Zod-схем.
- **Аудит:** `recordAudit({ action, actor, entityType, entityId, details }, requestContext(req))` з `modules/audit/audit.service.ts`. У `details` — ніяких паролів, токенів, даних замовників.
- **Відповідь з користувачем:** лише через `toUserDto()` (явний перелік полів).
- **Frontend — HTTP:** лише `http` з `shared/api/http.ts` (Bearer з `tokenStore`, спільний refresh на 401, події `authEvents`). Помилки для UI — `toApiError()`. Access-токен ніколи не потрапляє в localStorage.
- **Frontend — авторизація:** `useAuth()` / `useCurrentUser()` з `features/auth`; приватні маршрути — під `ProtectedRoute`, розділи за роллю — `RequireRole`. Маршрути описані в `app/routes.tsx`.
- **Frontend — UI:** базові компоненти лише з `@/shared/ui`. `Dialog` керується тільки пропом `open` (нативна подія `close` ігнорується навмисно — див. коментар у компоненті). Важливі дії — через `ConfirmDialog`.
- **Frontend — тести:** `renderApp(path)` з `src/test/renderApp.tsx` рендерить увесь застосунок; мережа — MSW (`src/test/server.ts`: `signedInAs`, `signedOut`, `apiError`, `makeUser`). У MSW 3 опція — `onUnhandledFrame`, і запит без обробника лише логується, тож кожен тест явно оголошує потрібні обробники.
- **MongoDB:** обов'язково replica set (транзакції). Локально — `npm run db:start -w server` (нативний mongod без Homebrew, дані в `~/.local/share/tu-registry/mongo`); у тестах — `MongoMemoryReplSet`. Версія MongoDB — лише в `server/src/config/mongodbVersion.ts`.
- **Mongoose 9 + `sanitizeFilter`:** увімкнено глобально, тому оператори у фільтрах, написані в нашому коді (`$gte`, `$in`, `$ne`…), обгортаються в `mongoose.trusted({...})`, інакше запит впаде з `CastError`. Ніколи не передавати `req.query`/`req.body` у фільтр напряму.
- **Помилки Mongoose:** `errorHandler` перетворює `ValidationError` → 400 (лише тип помилки, без введених значень), `CastError` → 400, E11000 → 409.
- **Тести з БД:** `useTestDb()` з `src/test/db.ts` — окрема база на файл у спільному `MongoMemoryReplSet` (та сама версія, що й локальна БД).
- **Нумерація:** номер `Nт/РР` видає **тільки** модуль `server/src/modules/numbering`. Ніде більше номер не обчислюється.
- **Дати:** «сьогодні» і рік рахуються в `Europe/Kyiv` — лише через `kyivToday()` (`server/src/utils/kyivDate.ts`), а «зараз» — через `clock.now()` (у тестах `vi.spyOn(clock, 'now')`, не fake timers). `regDate` зберігається як опівніч UTC календарної дати, в API — рядок `YYYY-MM-DD`; на клієнті показується через `formatCalendarDate()` без `new Date()`.
- **Номер і телефон:** формат/розбір номера — лише `formatRegNumber`/`parseRegNumber`, телефон — `normalizePhone`/`formatPhone` з `packages/shared`.
- **Порти (dev):** client 5173, server 4000 (`API_PORT`, не `PORT` — загальну назву перехоплюють інші інструменти). Vite проксує `/api` → 4000, тому CORS не налаштовується.
- **Обмеження версій (Node 22.12 на машині розробника):** ESLint 9, jsdom 27, tsup 8, TypeScript 6.0 (верхня межа typescript-eslint), React Router 7. Не оновлювати мажорні версії без оновлення Node.
- **TypeScript 6:** `types` за замовчуванням порожній — потрібні типи вказуються явно в кожному `tsconfig.json`.
