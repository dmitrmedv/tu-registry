---
name: mongodb-database
description: Робота з MongoDB через Mongoose — проєктування схем і зв'язків, валідація на рівні моделі, індекси, запити, пагінація, агрегації, транзакції, підключення. Використовуй при створенні або зміні моделей, написанні запитів до БД і оптимізації продуктивності.
---

# MongoDB + Mongoose

## Підключення

```ts
// config/db.ts
export async function connectDb() {
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true); // блокує $-оператори з користувацького вводу у фільтрах
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB connected');
}
export const disconnectDb = () => mongoose.disconnect();
```

- Сервер не стартує, якщо БД недоступна (лог + `process.exit(1)`).
- Окремі бази для `development` і `test`; у тестах — `mongodb-memory-server`.

## Проєктування схем

**Вбудовування (embed)** — коли дані читаються разом, належать батьку й обмежені за розміром (адреси користувача, налаштування).
**Посилання (reference)** — коли сутність самостійна, спільна або колекція необмежено росте (коментарі, замовлення, автор).

Правило: документ не повинен рости необмежено (ліміт 16 МБ, деградація продуктивності). Масив, що може перевищити сотні елементів → окрема колекція з посиланням.

```ts
// modules/posts/post.model.ts
import { Schema, model, InferSchemaType, Types } from 'mongoose';

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    body: { type: String, required: true, maxlength: 10_000 },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tags: { type: [String], default: [], validate: [(v: string[]) => v.length <= 10, 'Максимум 10 тегів'] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    coverUrl: String,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => { ret.id = ret._id.toString(); delete ret._id; return ret; },
    },
  },
);

// Складений індекс під основний запит: «опубліковані пости, нові спочатку»
postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ title: 'text', body: 'text' });

export type PostDoc = InferSchemaType<typeof postSchema> & { _id: Types.ObjectId };
export const Post = model('Post', postSchema);
```

Правила схем:
- Обмеження на рівні схеми (`required`, `maxlength`, `enum`, `min/max`) — другий рубіж після Zod.
- Чутливі поля — `select: false` (`password`, токени).
- `timestamps: true` завжди.
- Назва моделі — однина, PascalCase (`User`); колекція створиться як `users`.
- Типи — через `InferSchemaType`, не дублювати інтерфейс вручну.

## Індекси

- Індекс під кожен частий фільтр / сортування; складений індекс за правилом **ESR**: Equality → Sort → Range.
- `unique: true` створює індекс — не дублюй `index: true`.
- Перевіряй план запиту: `Model.find(q).explain('executionStats')` — шукай `IXSCAN`, а не `COLLSCAN`.
- У продакшені `autoIndex: false`, індекси створюються міграцією / `syncIndexes()` свідомо.
- Нові індекси на великих колекціях — погоджувати.

## Запити

```ts
// Читання для відповіді API: lean() + проєкція
const posts = await Post.find({ status: 'published' })
  .select('title slug author createdAt')
  .populate('author', 'name avatarUrl') // лише потрібні поля
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit)
  .lean();

// Пагінація з total — паралельно
const [data, total] = await Promise.all([
  Post.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
  Post.countDocuments(filter),
]);
return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
```

- `.lean()` — для читання (у 3–5 разів швидше, повертає plain object). Без `lean` — коли потрібні методи документа/`save()`.
- Великі колекції / нескінченний скрол — cursor-пагінація (`_id < lastId`) замість `skip`.
- Оновлення: `findByIdAndUpdate(id, dto, { new: true, runValidators: true })` — `runValidators` обов'язковий, інакше валідатори схеми не спрацюють.
- Атомарні операції замість read-modify-write: `$inc`, `$push`, `$addToSet`, `$pull`.
- Фільтри з користувацького вводу — лише з whitelist полів, ніколи `Model.find(req.query)`.
- Перевірка `ObjectId` — у Zod (`objectId`), а `CastError` обробляється в `errorHandler`.

## N+1 і populate

```ts
// ❌ N+1
for (const p of posts) p.author = await User.findById(p.author);
// ✅ один запит
await Post.find().populate('author', 'name');
```
Глибокий `populate` (3+ рівні) — сигнал переглянути схему або використати агрегацію.

## Агрегації

```ts
const stats = await Post.aggregate([
  { $match: { author: new Types.ObjectId(userId) } }, // $match — якомога раніше
  { $group: { _id: '$status', count: { $sum: 1 } } },
  { $project: { _id: 0, status: '$_id', count: 1 } },
]);
```
У `aggregate` рядкові id потрібно явно перетворювати на `ObjectId` (автокастинг не працює).

## Транзакції

Потрібні, коли кілька записів мають змінитися атомарно (переказ, замовлення + списання складу). Вимагають replica set (у docker-compose — `--replSet rs0`).

```ts
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await Order.create([{ user, items }], { session });
    await Product.updateOne({ _id: pid, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { session });
  });
} finally {
  await session.endSession();
}
```

## Хуки (middleware) моделі

- `pre('save')` — для похідних полів (хешування пароля, slug).
- Хуки `save` **не** спрацьовують на `updateOne/findByIdAndUpdate` — враховуй це.
- Не клади бізнес-логіку з побічними ефектами (email, інші колекції) у хуки — це робота сервісу.

## Типові помилки

| Помилка | Правильно |
|---|---|
| `Model.find(req.query)` | whitelist фільтр із провалідованих полів |
| Немає індексу під фільтр/сортування | складений індекс (ESR), перевірка `explain` |
| `findByIdAndUpdate` без `runValidators` | `{ new: true, runValidators: true }` |
| Необмежений масив у документі (коментарі) | окрема колекція |
| `populate` усіх полів користувача (разом із чутливими) | `populate('author', 'name')` |
| Повернення `password` в API | `select: false` + `toJSON.transform` |
| Порівняння `post.author === userId` | `post.author.equals(userId)` |

## Перевірки
Тести сервісів на `mongodb-memory-server` (див. `testing-debugging`), `explain()` для нових важких запитів.
