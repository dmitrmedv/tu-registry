---
name: testing-debugging
description: Тестування й налагодження — Vitest (unit/integration), React Testing Library, Supertest + mongodb-memory-server для API, Playwright для E2E, ESLint/Prettier/TypeScript-перевірки, системний підхід до пошуку причин помилок. Використовуй після будь-яких змін коду, при написанні тестів і при діагностиці багів.
---

# Testing & Debugging

## Головне правило

**Звітуй лише про реально запущені перевірки з реальним результатом.** Не пиши «тести пройдено», якщо їх не запускали. Не послаблюй і не видаляй тест, щоб він став зеленим — спершу з'ясуй, хто неправий: код чи тест. Якщо перевірку запустити неможливо (немає БД, браузера, залежностей) — так і скажи.

## Що і як тестувати

| Рівень | Інструмент | Що покриває |
|---|---|---|
| Unit | Vitest | чисті функції, утиліти, Zod-схеми, хуки |
| Component | Vitest + Testing Library + jsdom | поведінка компонентів очима користувача |
| API integration | Vitest + Supertest + mongodb-memory-server | ендпоінт повністю: валідація → сервіс → БД → відповідь |
| E2E | Playwright | 3–7 критичних сценаріїв (реєстрація, логін, головний CRUD) |

Пріоритет: інтеграційні тести API та тести поведінки компонентів дають найбільше впевненості за найменшу ціну. Не гонись за 100% покриттям — покривай бізнес-правила, межові випадки й помилки.

## Конфігурація

```ts
// server/vitest.config.ts
export default defineConfig({
  test: { environment: 'node', setupFiles: ['./src/test/setup.ts'], pool: 'forks' },
});

// client/vitest.config.ts (або секція test у vite.config.ts)
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: { modules: { classNameStrategy: 'non-scoped' } } },
});
```

```ts
// server/src/test/setup.ts
let mongo: MongoMemoryServer;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
afterEach(async () => {
  // Ізоляція тестів: чистимо всі колекції
  await Promise.all(Object.values(mongoose.connection.collections).map(c => c.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
```

## Тест API (Supertest)

```ts
// modules/posts/post.test.ts
const app = createApp();

async function authAs(email = 'a@test.dev') {
  const res = await request(app).post('/api/v1/auth/register')
    .send({ email, name: 'Test', password: 'password123' });
  return res.body.accessToken as string;
}

describe('POST /api/v1/posts', () => {
  it('створює пост для автентифікованого користувача', async () => {
    const token = await authAs();
    const res = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Hello world', body: 'Text' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Hello world', id: expect.any(String) });
  });

  it('повертає 401 без токена', async () => {
    const res = await request(app).post('/api/v1/posts').send({ title: 'Hello', body: 'x' });
    expect(res.status).toBe(401);
  });

  it('повертає 400 для невалідних даних і невідомих полів', async () => {
    const token = await authAs();
    const res = await request(app).post('/api/v1/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('не дає редагувати чужий пост (403)', async () => { /* … */ });
});
```

Для кожного ендпоінта мінімум: успіх, валідація (400), без автентифікації (401), чужий ресурс (403), неіснуючий (404).

## Тест компонента

```tsx
// Хелпер: рендер з провайдерами
export function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

it('показує помилки валідації і не відправляє форму', async () => {
  const user = userEvent.setup();
  renderWithProviders(<PostForm />);

  await user.click(screen.getByRole('button', { name: /зберегти/i }));

  expect(await screen.findByText(/мінімум 3 символи/i)).toBeInTheDocument();
});
```

- Запити — шукай елементи як користувач: `getByRole`, `getByLabelText`, `getByText`. `getByTestId` — останній варіант.
- Взаємодія — `userEvent`, не `fireEvent`.
- Мережа — мокай на рівні HTTP через **MSW**, а не мокаючи власні модулі api.
- Тестуй поведінку, не реалізацію (не перевіряй внутрішній state, кількість рендерів).

## E2E (Playwright)

```ts
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run dev -w server', url: 'http://localhost:5000/api/health', reuseExistingServer: true },
    { command: 'npm run dev -w client', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }, { name: 'mobile', use: devices['Pixel 7'] }],
});

// e2e/auth.spec.ts
test('користувач реєструється і бачить свій профіль', async ({ page }) => {
  const email = `u${Date.now()}@test.dev`; // унікальні дані — тести незалежні
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Ім\'я').fill('Test');
  await page.getByLabel('Пароль').fill('password123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: /профіль/i })).toBeVisible();
});
```

- Ніяких `page.waitForTimeout` — лише авто-очікування локаторів і `expect(...).toBeVisible()`.
- E2E працює з окремою тестовою БД.
- Тестові облікові дані — лише тестові, з `.env.test` / фікстур.

## Порядок перевірок після змін

```bash
npm run lint         # ESLint (0 errors)
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
npm run test:e2e     # якщо зачеплено ключові сценарії або UI-флоу
npm run build        # перед завершенням етапу
```

Звіт: які команди запущено, результат (кількість тестів passed/failed), повний текст першої помилки, якщо є.

## Налагодження — системний підхід

1. **Відтвори** — точні кроки, вхідні дані, очікуваний vs фактичний результат. Без відтворення не «виправляй навмання».
2. **Прочитай помилку повністю** — повідомлення, stack trace, перший рядок з *нашого* коду.
3. **Локалізуй шар**: браузер (Console/Network) → HTTP-запит (статус, тіло) → сервер (лог) → БД (запит, дані).
4. **Сформулюй гіпотезу** і перевір її мінімальним способом (лог, breakpoint, ізольований тест).
5. **Напиши тест, що падає**, на цей баг.
6. **Виправ причину**, а не симптом. Тест стає зеленим.
7. **Прожени всі перевірки** — виправлення нічого не зламало.
8. Прибери тимчасові `console.log`/debug-код.

### Швидка діагностика

| Симптом | Перевір |
|---|---|
| CORS error у браузері | `origin` у cors(), `credentials: true` на обох сторонах, реальний статус відповіді (CORS часто маскує 500) |
| Запит «висить» | async-контролер без `asyncHandler` (Express 4), відсутній `res.send`/`next` |
| 401 після логіну | заголовок `Authorization` в інтерсепторі, TTL, секрет у `.env` того середовища |
| Cookie не встановлюється | `withCredentials`, `sameSite`/`secure` на http, `path` cookie |
| Mongoose `CastError` | невалідний ObjectId — додати Zod `objectId` |
| `E11000 duplicate key` | унікальний індекс → обробка як 409 |
| Валідатори схеми не спрацювали | `runValidators: true` в update |
| Дані на UI не оновились після мутації | відсутня `invalidateQueries` / неправильний ключ |
| Нескінченний ре-рендер | об'єкт/функція в залежностях `useEffect`, `setState` під час рендеру |
| Тест проходить окремо, падає разом | спільний стан між тестами: БД не очищено, моки не скинуто (`vi.restoreAllMocks`) |
| Flaky E2E | `waitForTimeout`, залежність від даних інших тестів, відсутність `await` |

Інструменти: `node --inspect` + Chrome DevTools / VS Code debugger, `DEBUG=express:*`, `mongoose.set('debug', true)` (лише локально), React DevTools, TanStack Query Devtools, Playwright `--ui` і trace viewer.

## Типові помилки

| Помилка | Правильно |
|---|---|
| «Усі тести пройдено» без запуску | лише реальний вивід команди |
| `it.skip` / видалений assert, щоб пройти | знайти причину |
| Тести залежать від порядку виконання | очищення БД в `afterEach`, унікальні дані |
| Мок усього підряд у інтеграційному тесті | справжня БД у пам'яті, мок лише зовнішніх сервісів |
| Перевірка CSS-класів і внутрішнього стану | перевірка того, що бачить користувач |
| Тест лише «щасливого шляху» | помилки, межі, права доступу |
