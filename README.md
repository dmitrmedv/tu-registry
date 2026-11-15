# Реєстр заяв на технічні умови

Внутрішній вебзастосунок для реєстрації та обліку заяв на отримання технічних умов для приєднання до газових мереж.

Архітектура та ухвалені рішення: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура

| Пакет | Що всередині |
|---|---|
| `client/` | React + Vite + TypeScript, TanStack Query, React Router, SCSS Modules |
| `server/` | Node.js + Express 5 + TypeScript, REST API |
| `packages/shared/` | спільні для клієнта й сервера enum-и та Zod-схеми |

## Вимоги

- Node.js ≥ 22.12 (див. `.nvmrc`)
- MongoDB 8 у режимі replica set (з'явиться на етапі 3)

## Запуск для розробки

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
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
| `npm run build` | збірка сервера (`server/dist`) і клієнта (`client/dist`) |
| `npm run format` / `format:check` | Prettier |
