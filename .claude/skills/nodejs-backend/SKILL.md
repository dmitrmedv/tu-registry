---
name: nodejs-backend
description: Backend на Node.js + Express + TypeScript — REST API, шари routes/controller/service, middleware, валідація Zod, централізована обробка помилок, Multer для файлів, Swagger/OpenAPI, логування й безпекові заголовки. Використовуй при створенні або зміні ендпоінтів, middleware та серверної конфігурації.
---

# Node.js Backend

## Архітектура модуля

```
modules/posts/
├── post.model.ts       # Mongoose-схема (див. mongodb-database)
├── post.schema.ts      # Zod-схеми запитів + типи DTO
├── post.service.ts     # бізнес-логіка, доступ до БД, перевірка прав
├── post.controller.ts  # req → service → res; без логіки
├── post.routes.ts      # маршрути + middleware + JSDoc для Swagger
└── post.test.ts
```

| Шар | Знає про | Не знає про |
|---|---|---|
| routes | middleware, controller | БД |
| controller | `req`, `res`, service | Mongoose |
| service | model, інші сервіси, `ApiError` | `req`, `res` |
| model | Mongoose | HTTP |

## app.ts — порядок middleware

```ts
// app.ts — створює app без listen(), щоб Supertest міг його імпортувати
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // якщо за reverse proxy — для коректного IP у rate limit
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/posts', postRoutes);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use(notFoundHandler);  // 404 для невідомих маршрутів
  app.use(errorHandler);     // завжди останній
  return app;
}
```

## Помилки

```ts
// utils/ApiError.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message); }

  static badRequest = (msg: string, details?: unknown) => new ApiError(400, 'BAD_REQUEST', msg, details);
  static unauthorized = (msg = 'Потрібна автентифікація') => new ApiError(401, 'UNAUTHORIZED', msg);
  static forbidden = (msg = 'Недостатньо прав') => new ApiError(403, 'FORBIDDEN', msg);
  static notFound = (entity = 'Ресурс') => new ApiError(404, 'NOT_FOUND', `${entity} не знайдено`);
  static conflict = (msg: string) => new ApiError(409, 'CONFLICT', msg);
}

// utils/asyncHandler.ts — передає відхилені проміси в errorHandler
// (Express 5 робить це сам; для Express 4 — обов'язково)
export const asyncHandler =
  (fn: RequestHandler): RequestHandler => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

```ts
// middlewares/errorHandler.ts
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Некоректні дані', details: err.errors } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Некоректний ідентифікатор' } });
  }
  if (err?.code === 11000) { // duplicate key
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Запис уже існує' } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: err.code, message: err.message } });
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  // У відповідь — без stack trace і внутрішніх деталей
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера' } });
};
```

Також у `server.ts`: обробники `unhandledRejection` / `uncaughtException` (лог + коректне завершення) і graceful shutdown по `SIGTERM` (закрити HTTP-сервер та з'єднання з MongoDB).

## Валідація

```ts
// middlewares/validate.ts
type Schemas = { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny };

export const validate = (schemas: Schemas): RequestHandler => (req, _res, next) => {
  for (const key of ['body', 'params', 'query'] as const) {
    const schema = schemas[key];
    if (!schema) continue;
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      return next(ApiError.badRequest('Помилка валідації', result.error.flatten()));
    }
    // Зберігаємо очищені й приведені дані (у Express 5 req.query тільки для читання)
    (req as any).validated = { ...(req as any).validated, [key]: result.data };
  }
  next();
};
```

```ts
// modules/posts/post.schema.ts
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний id');

export const createPostSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(10_000),
  tags: z.array(z.string().trim().max(30)).max(10).default([]),
}).strict(); // невідомі поля → помилка (захист від mass assignment)

export const listPostsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', '-createdAt', 'title']).default('-createdAt'),
});
export type CreatePostDto = z.infer<typeof createPostSchema>;
```

## Контролер, сервіс, маршрути

```ts
// post.controller.ts
export const createPost = asyncHandler(async (req, res) => {
  const post = await postService.create(req.user!.id, req.validated.body);
  res.status(201).json(post);
});

// post.service.ts
export async function update(userId: string, postId: string, dto: UpdatePostDto) {
  const post = await Post.findById(postId);
  if (!post) throw ApiError.notFound('Публікацію');
  if (!post.author.equals(userId)) throw ApiError.forbidden(); // перевірка власника
  Object.assign(post, dto); // dto вже пройшов .strict()-валідацію
  return post.save();
}

// post.routes.ts
const router = Router();
router.get('/', validate({ query: listPostsQuery }), postController.list);
router.post('/', authenticate, validate({ body: createPostSchema }), postController.createPost);
router.patch('/:id', authenticate, validate({ params: idParams, body: updatePostSchema }), postController.update);
export default router;
```

## Завантаження файлів (Multer)

```ts
// middlewares/upload.ts
const ALLOWED = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp']]);

export const uploadImage = multer({
  storage: multer.diskStorage({
    destination: env.UPLOAD_DIR,
    // Ніколи не використовуємо оригінальне ім'я файлу — path traversal / перезапис
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED.get(file.mimetype)}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest('Недопустимий тип файлу')),
});

router.post('/:id/cover', authenticate, uploadImage.single('cover'), postController.setCover);
```

- MIME від клієнта можна підробити: для критичних випадків перевіряй сигнатуру (`file-type`).
- Папка завантажень — поза `src`, у `.gitignore`; віддається через `express.static` з `{ dotfiles: 'deny' }` або CDN.
- При видаленні сутності — видаляй і файл. Якщо операція з БД впала після збереження файлу — прибери файл.
- Для продакшену з кількома інстансами — S3-сумісне сховище (за погодженням).

## Swagger / OpenAPI

- `swagger-jsdoc` + `swagger-ui-express`, специфікація OpenAPI 3.
- Кожен ендпоінт документується JSDoc-коментарем `@openapi` поруч із маршрутом (або генерація з Zod через `zod-to-openapi` — щоб не дублювати схеми; вибір погодити).
- Опиши `securitySchemes` (bearerAuth), спільні схеми `Error`, `Pagination`.
- Зміна контракту → оновлення документації в тому ж коміті.

```ts
/**
 * @openapi
 * /posts:
 *   post:
 *     tags: [Posts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CreatePost' } } }
 *     responses:
 *       201: { description: Створено, content: { application/json: { schema: { $ref: '#/components/schemas/Post' } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
```

## Конфігурація та логування

```ts
// config/env.ts — падаємо на старті, якщо конфігурація невалідна
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url(),
});
export const env = envSchema.parse(process.env);
```

- Логер — `pino` (структуровані логи). `console.log` у коді — заборонено (крім скриптів).
- Не логуй `req.body` для auth-маршрутів, паролі, токени, cookie.

## Безпека (чек-лист)

- [ ] `helmet`, CORS з конкретним origin, `express.json({ limit })`
- [ ] rate limit (`express-rate-limit`) на `/auth/*` та чутливих ендпоінтах
- [ ] усі входи валідуються Zod, `.strict()` для body
- [ ] захист від NoSQL-ін'єкцій (`mongoose.set('sanitizeFilter', true)` + Zod-типи)
- [ ] перевірка власника/ролі в сервісі
- [ ] жодних секретів у коді; `.env` у `.gitignore`
- [ ] у відповідях немає `password`, внутрішніх полів, stack trace

## Типові помилки

| Помилка | Правильно |
|---|---|
| `async` контролер без `asyncHandler` (Express 4) | обгорнути — інакше запит «зависає» |
| `res.status(500).json({ message: err.message })` | централізований `errorHandler` |
| `Post.create(req.body)` | `Post.create(validatedDto)` |
| Логіка й запити до БД у контролері | сервіс |
| `app.listen` в `app.ts` | `server.ts`; `app.ts` експортує `createApp()` |
| Повернення `200` з `{ success: false }` | правильний HTTP-статус |
| Оригінальне `file.originalname` як ім'я на диску | UUID + розширення з whitelist |

## Перевірки
`npm run lint -w server && npm run typecheck -w server && npm run test -w server` + перевірка ендпоінта через Supertest-тест або Swagger UI.
