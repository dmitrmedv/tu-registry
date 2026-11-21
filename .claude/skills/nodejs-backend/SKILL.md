---
name: nodejs-backend
description: Backend на Node.js + Express + TypeScript — REST API, шари routes/controller/service, middleware, валідація Zod, централізована обробка помилок, Multer для файлів, логування й безпекові заголовки. Використовуй при створенні або зміні ендпоінтів, middleware та серверної конфігурації.
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
  static notFound = (message = 'Ресурс не знайдено') => new ApiError(404, 'NOT_FOUND', message);
  static conflict = (msg: string) => new ApiError(409, 'CONFLICT', msg);
}

```

Express 5 сам передає відхилені проміси async-обробників у `errorHandler` — обгортка `asyncHandler` не потрібна.

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

Вхідні дані розбирає контролер через `parseRequest(req, { body, params, query })` з `server/src/utils/parseRequest.ts` (там же `idParamsSchema`); схеми — з `packages/shared`. Окремого `validate`-middleware в проєкті немає.

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
export async function createPost(req: Request, res: Response) {
  const { body } = parseRequest(req, { body: createPostSchema });
  res.status(201).json(await postService.create(req.user!.id, body));
}

// post.service.ts
export async function update(userId: string, postId: string, dto: UpdatePostDto) {
  const post = await Post.findById(postId);
  if (!post) throw ApiError.notFound('Публікацію не знайдено');
  if (!post.author.equals(userId)) throw ApiError.forbidden(); // перевірка власника
  Object.assign(post, dto); // dto вже пройшов .strict()-валідацію
  return post.save();
}

// post.routes.ts
const router = Router();
router.get('/', requireAuth, postController.list);
router.post('/', requireAuth, postController.createPost);
router.patch('/:id', requireAuth, postController.update);
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

## Конфігурація та логування

Конфігурація валідується Zod у `server/src/config/env.ts` і падає на старті, якщо вона невалідна; перелік змінних — `server/.env.example`.

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
| `res.status(500).json({ message: err.message })` | централізований `errorHandler` |
| `Post.create(req.body)` | `Post.create(validatedDto)` |
| Логіка й запити до БД у контролері | сервіс |
| `app.listen` в `app.ts` | `server.ts`; `app.ts` експортує `createApp()` |
| Повернення `200` з `{ success: false }` | правильний HTTP-статус |
| Оригінальне `file.originalname` як ім'я на диску | UUID + розширення з whitelist |

## Перевірки
`npm run lint -w server && npm run typecheck -w server && npm run test -w server` + перевірка ендпоінта через Supertest-тест або Swagger UI.
