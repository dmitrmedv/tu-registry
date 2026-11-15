---
name: authentication
description: Автентифікація й авторизація — реєстрація, логін, bcrypt, JWT access/refresh токени з ротацією, httpOnly cookie, logout, ролі та права доступу, захищені маршрути на backend і frontend, Axios-інтерсептор для оновлення токена. Використовуй при будь-якій роботі з користувачами, входом, токенами й доступом.
---

# Authentication & Authorization

## Обрана схема (за замовчуванням)

| Елемент | Рішення |
|---|---|
| Пароль | bcrypt, cost 12 |
| Access token | JWT, TTL 15 хв, у тілі відповіді → зберігається **в пам'яті** клієнта, передається в `Authorization: Bearer` |
| Refresh token | JWT, TTL 7–30 днів, **httpOnly + Secure + SameSite** cookie, path `/api/v1/auth` |
| Ротація | кожен `/refresh` видає новий refresh, старий інвалідується |
| Відкликання | у БД зберігається **хеш** refresh-токена (або `tokenVersion` у користувача) |
| Повторне використання | якщо прийшов уже використаний refresh — відкликати всі сесії користувача |

Чому так: access у пам'яті недоступний після XSS-перезавантаження; refresh в httpOnly cookie недоступний для JS; короткий TTL access обмежує шкоду від витоку.

Зміна цієї схеми — погоджується з користувачем.

## Модель користувача

```ts
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  tokenVersion: { type: Number, default: 0, select: false }, // інкремент = вихід з усіх пристроїв
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain: string) {
  return bcrypt.compare(plain, this.password);
};
```

## Валідація

```ts
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(60),
  // bcrypt враховує лише перші 72 байти
  password: z.string().min(8).max(72),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
}).strict();
```

## Сервіс

```ts
// modules/auth/auth.service.ts
const signAccess = (u: { id: string; role: string }) =>
  jwt.sign({ sub: u.id, role: u.role }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });

const signRefresh = (u: { id: string; tokenVersion: number }) =>
  jwt.sign({ sub: u.id, v: u.tokenVersion }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });

export async function login(dto: LoginDto) {
  const user = await User.findOne({ email: dto.email }).select('+password +tokenVersion');
  // Однакове повідомлення для «немає користувача» і «невірний пароль» — не розкриваємо наявність email
  if (!user || !(await user.comparePassword(dto.password))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Невірний email або пароль');
  }
  return issueTokens(user);
}

export async function refresh(token: string | undefined) {
  if (!token) throw ApiError.unauthorized();
  let payload: { sub: string; v: number };
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as typeof payload;
  } catch {
    throw ApiError.unauthorized('Сесія завершилась');
  }
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.v) throw ApiError.unauthorized('Сесія відкликана');
  return issueTokens(user);
}

export async function logoutAll(userId: string) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
```

Варіант із `tokenVersion` — найпростіший. Якщо потрібні окремі сесії на пристроях і детекція повторного використання — колекція `RefreshToken { user, tokenHash, expiresAt, revokedAt }` з TTL-індексом на `expiresAt` (погодити).

## Контролер і cookie

```ts
const REFRESH_COOKIE = 'refreshToken';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict', // якщо client і API на різних доменах — 'none' + secure + CSRF-захист
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.validated.body);
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ user, accessToken });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});
```

## Middleware

```ts
// middlewares/authenticate.ts
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(ApiError.unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: Role };
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'TOKEN_EXPIRED', 'Токен недійсний або прострочений'));
  }
};

// middlewares/authorize.ts — перевірка ролі
export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(ApiError.forbidden());

// Розширення типу Request — types/express.d.ts
declare global { namespace Express { interface Request { user?: { id: string; role: Role } } } }
```

**Ролі ≠ власність.** `authorize('admin')` перевіряє роль; перевірка «чи це мій ресурс» — у сервісі (`post.author.equals(userId)`).

## Rate limiting

```ts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
```

## Frontend

```ts
// shared/api/tokenStore.ts — access token лише в пам'яті
let accessToken: string | null = null;
export const tokenStore = { get: () => accessToken, set: (t: string | null) => { accessToken = t; } };
```

```ts
// shared/api/http.ts — інтерсептори
http.interceptors.request.use(cfg => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Один спільний refresh-проміс: якщо 5 запитів одночасно отримали 401 — refresh виконається один раз
let refreshing: Promise<string> | null = null;

http.interceptors.response.use(undefined, async error => {
  const original = error.config;
  const isAuthCall = original?.url?.includes('/auth/');
  if (error.response?.status !== 401 || original._retry || isAuthCall) throw error;

  original._retry = true;
  try {
    refreshing ??= http.post('/auth/refresh').then(r => r.data.accessToken).finally(() => { refreshing = null; });
    tokenStore.set(await refreshing);
    return http(original);
  } catch (e) {
    tokenStore.set(null);
    authEvents.emit('logout'); // AuthProvider скидає стан і перенаправляє на /login
    throw e;
  }
});
```

- При старті застосунку: `POST /auth/refresh` → якщо успішно, користувач залогінений (сесія переживає перезавантаження сторінки).
- `ProtectedRoute`: поки йде початкова перевірка — спінер; не залогінений → `<Navigate to="/login" state={{ from: location }} replace />`.
- Приховування кнопок за роллю — лише UX; доступ завжди перевіряє сервер.
- Після logout — `queryClient.clear()`, щоб дані попереднього користувача не лишились у кеші.

## Чек-лист безпеки

- [ ] паролі лише bcrypt, `select: false`, ніколи не в логах і відповідях
- [ ] секрети JWT ≥ 32 символи, різні для access і refresh, лише з env
- [ ] `jwt.verify` (не `decode`); алгоритм фіксований (HS256 за замовчуванням)
- [ ] однакова помилка для неіснуючого email і неправильного пароля
- [ ] rate limit на login/register
- [ ] refresh у httpOnly Secure cookie; access не в localStorage
- [ ] зміна пароля → `tokenVersion++` (вихід з усіх пристроїв)
- [ ] перевірка власника ресурсу в сервісі

## Типові помилки

| Помилка | Правильно |
|---|---|
| JWT у `localStorage` | access в пам'яті, refresh в httpOnly cookie |
| Access token на 30 днів | 15 хв + refresh |
| `jwt.decode` для перевірки | `jwt.verify` |
| «Користувача не знайдено» / «Невірний пароль» окремо | одне загальне повідомлення |
| Роль приходить з `req.body` при реєстрації | роль завжди `user`, змінює лише адмін |
| Кожен 401-запит робить свій refresh | один спільний проміс |
| Перевірка прав лише на frontend | сервер перевіряє завжди |

## Обов'язкові тести
register (успіх, дубль email → 409, невалідні дані → 400), login (успіх, невірний пароль → 401), доступ без токена → 401, з простроченим → 401, refresh (успіх, відкликаний → 401), чужий ресурс → 403, `password` відсутній у відповідях.
