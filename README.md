# Реєстр заяв на технічні умови

Внутрішній вебзастосунок для реєстрації та обліку заяв на отримання технічних умов для приєднання до газових мереж.

Архітектура та ухвалені рішення: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура

| Пакет | Що всередині |
|---|---|
| `client/` | React + Vite + TypeScript, TanStack Query, React Router, SCSS Modules |
| `server/` | Node.js + Express 5 + TypeScript, REST API |
| `packages/shared/` | спільні для клієнта й сервера enum-и та Zod-схеми |
| `e2e/` | Playwright-тести ключових сценаріїв |

## Вимоги

- Node.js ≥ 22.12 (див. `.nvmrc`)
- MongoDB 8.0 у режимі **replica set** — транзакції потрібні для нумерації заяв; без replica set сервер не стартує

## MongoDB локально

Встановлювати MongoDB окремо не потрібно. Скрипт запускає офіційний нативний `mongod` 8.0.38 (той самий, що в тестах) як replica set з одного вузла; бінарник завантажується один раз у `~/.cache/mongodb-binaries`.

| Команда | Дія |
|---|---|
| `npm run db:start -w server` | запустити (при першому запуску — ініціалізувати replica set `rs0`) |
| `npm run db:status -w server` | перевірити стан |
| `npm run db:stop -w server` | коректно зупинити |

- Дані: `~/.local/share/tu-registry/mongo/data`, лог: `~/.local/share/tu-registry/mongo/mongod.log`.
- База **не стартує автоматично** після перезавантаження Mac — запустіть `db:start` перед роботою.
- Слухає лише `127.0.0.1` і працює без пароля — **тільки для розробки**. У продакшені обов'язкові автентифікація MongoDB і TLS.

## Запуск для розробки

```bash
npm install
cp server/.env.example server/.env    # заповніть SEED_ADMIN_PASSWORD
cp client/.env.example client/.env
npm run db:start -w server
npm run db:seed -w server             # перший адміністратор (повторний запуск нічого не змінює)
npm run dev
```

- клієнт: http://localhost:5173
- API: http://localhost:4000/api/health (у dev також доступне через проксі http://localhost:5173/api/health)

## Скрипти

| Команда | Дія |
|---|---|
| `npm run dev` | сервер і клієнт у режимі розробки |
| `npm run lint` | ESLint (без попереджень) |
| `npm run typecheck` | перевірка типів у всіх пакетах |
| `npm test` | Vitest у всіх пакетах |
| `npm run test:e2e` | Playwright: ключові сценарії в Chromium (див. нижче) |
| `npm run build` | збірка сервера (`server/dist`) і клієнта (`client/dist`) |
| `npm run format` / `format:check` | Prettier |
| `npm run db:seed -w server` | створити першого адміністратора з `SEED_ADMIN_*` |
| `npm run db:indexes -w server` | синхронізувати індекси (продакшен, де `autoIndex` вимкнено) |
| `npm run db:demo -w server` | додати 60 демо-заяв (див. нижче) |

## Ролі й права

Відкритої реєстрації немає: облікові записи створює адміністратор, а користувач при першому вході замінює тимчасовий пароль. Усі бачать усі заяви; реєстр за замовчуванням показує «Мої заяви».

| Дія | Користувач | Уповноважений¹ | Адміністратор |
|---|---|---|---|
| Реєстрація з автоматичним номером | ✓ | ✓ | ✓ |
| Ручне внесення (дата в минулому, номер вручну) | — | ✓ | ✓ |
| Редагування даних заяви | свої | свої | усі |
| Зміна дати й номера | — | свої | усі |
| Анулювання з причиною | свої | свої | усі |
| Відновлення анульованої | — | — | ✓ |
| Користувачі, журнал аудиту | — | — | ✓ |

¹ Користувач із позначкою «Уповноважений користувач» (`canManageRegistration`). Анульовану заяву не можна редагувати, поки її не відновлено.

## Демо-дані

`npm run db:demo -w server` додає 60 заяв за **2020** рік із префіксом «ДЕМО» в імені замовника: зручно, щоб подивитися на пошук і сторінки. Записи вставляються напряму, без аудиту й історії, лічильник номерів не змінюється. Прибрати: `npm run db:demo -w server -- --remove`. У продакшені скрипт не запускається.

## E2E-тести (Playwright)

```bash
npx playwright install --only-shell chromium   # один раз, ~200 МБ у ~/Library/Caches/ms-playwright
npm run test:e2e
```

- Playwright сам піднімає API на порту **4100** з тимчасовою базою в пам'яті (`server/src/scripts/e2eServer.ts`) і клієнт на **5174**, тож не заважає `npm run dev` і не чіпає локальну базу.
- Адміністратор і паролі в тестах — тестові значення з `e2e/support/accounts.ts`.
- Звіт після прогону: `npx playwright show-report e2e/playwright-report`; при падінні там є скриншот і trace.
