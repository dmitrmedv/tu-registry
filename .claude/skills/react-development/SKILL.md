---
name: react-development
description: Розробка frontend на React + Vite + TypeScript — компоненти, хуки, React Router, TanStack Query, React Hook Form, Axios. Використовуй при створенні або зміні компонентів, сторінок, маршрутів, роботі зі станом, формами та запитами до API.
---

# React Development

## Принципи

- Функціональні компоненти + хуки. Класи — лише для Error Boundary (або `react-error-boundary`).
- Компонент = одна відповідальність. Логіку виносимо в кастомні хуки, UI лишається простим.
- **Серверний стан** → TanStack Query. **Стан UI** → `useState`/`useReducer`. **Глобальний клієнтський стан** → Context.
- Не зберігай у стані те, що можна обчислити з props/іншого стану.
- `useEffect` — лише для синхронізації із зовнішнім світом (DOM API, підписки). Не для завантаження даних і не для похідного стану.

## Axios — один інстанс

```ts
// shared/api/http.ts
import axios from 'axios';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // refresh-token у httpOnly cookie
  timeout: 15_000,
});

// Нормалізуємо помилки, щоб UI завжди отримував { code, message }
export type ApiError = { code: string; message: string; details?: unknown };

export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err) && err.response?.data?.error) return err.response.data.error;
  return { code: 'NETWORK_ERROR', message: 'Не вдалося з\'єднатися з сервером' };
}
```

Логіку refresh-токена (інтерсептор 401) див. у skill `authentication`.

## TanStack Query — шар API фічі

```ts
// features/posts/api/postsApi.ts — лише HTTP
export const postsApi = {
  list: (params: PostListParams) => http.get<Paginated<Post>>('/posts', { params }).then(r => r.data),
  create: (dto: CreatePostDto) => http.post<Post>('/posts', dto).then(r => r.data),
};

// features/posts/api/queries.ts — ключі та хуки
export const postKeys = {
  all: ['posts'] as const,
  list: (p: PostListParams) => [...postKeys.all, 'list', p] as const,
  detail: (id: string) => [...postKeys.all, 'detail', id] as const,
};

export const usePosts = (params: PostListParams) =>
  useQuery({ queryKey: postKeys.list(params), queryFn: () => postsApi.list(params) });

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: postKeys.all }),
  });
}
```

Правила:
- Ключі запитів — у фабриці (`postKeys`), не рядками по коду.
- Після мутації — `invalidateQueries` (або `setQueryData` для оптимістичних оновлень).
- `QueryClient`: `staleTime` ≈ 30–60 с, `retry: 1`, без retry на 4xx.

## Компонент зі станами

```tsx
export function PostList() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = usePosts({ page, limit: 20 });

  if (isPending) return <Spinner />;
  if (isError) return <ErrorState message={toApiError(error).message} onRetry={refetch} />;
  if (data.data.length === 0) return <EmptyState text="Публікацій ще немає" />;

  return (
    <>
      <ul className={styles.list}>
        {data.data.map(post => <PostCard key={post.id} post={post} />)}
      </ul>
      <Pagination page={page} totalPages={data.meta.totalPages} onChange={setPage} />
    </>
  );
}
```

Завжди обробляй 4 стани: **loading, error, empty, success**.

## Форми — React Hook Form + Zod

```tsx
const schema = z.object({
  title: z.string().trim().min(3, 'Мінімум 3 символи').max(120),
  body: z.string().trim().min(1, 'Обов\'язкове поле'),
});
type FormValues = z.infer<typeof schema>;

export function PostForm({ onSuccess }: { onSuccess?: () => void }) {
  const { mutateAsync, isPending } = useCreatePost();
  const { register, handleSubmit, setError, formState: { errors } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async values => {
    try {
      await mutateAsync(values);
      onSuccess?.();
    } catch (e) {
      // Помилки дії — нотифікацією; помилки окремих полів — під полями
      notifyError(toApiError(e).message);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Input label="Заголовок" {...register('title')} error={errors.title?.message} />
      <Textarea label="Текст" {...register('body')} error={errors.body?.message} />
      <Button type="submit" disabled={isPending}>Зберегти</Button>
    </form>
  );
}
```

## React Router

```tsx
// app/router.tsx
const PostsPage = lazy(() => import('@/pages/PostsPage'));

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />, // перевіряє auth, інакше <Navigate to="/login" />
        children: [{ path: 'posts', element: <Suspense fallback={<Spinner />}><PostsPage /></Suspense> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
```

- Сторінки — `lazy` для code splitting.
- Фільтри/пагінація — у `useSearchParams` (посилання можна поділитися).
- Захищені маршрути — через layout-route, а не перевіркою в кожній сторінці.

## Продуктивність

- Спершу вимірюй (React DevTools Profiler), потім оптимізуй.
- `memo/useMemo/useCallback` — лише при підтвердженій проблемі або для стабільних залежностей.
- Списки > 200 елементів — віртуалізація.
- `key` — стабільний id, не індекс масиву.

## Безпека на клієнті

- Не зберігай access-token у `localStorage` — у пам'яті (змінна модуля / стан).
- Жодних секретів у `VITE_*` — вони потрапляють у бандл.
- `dangerouslySetInnerHTML` — лише після `DOMPurify.sanitize`.

## Типові помилки

| Помилка | Правильно |
|---|---|
| `useEffect(() => { fetch… setData… }, [])` | `useQuery` |
| `const [fullName, setFullName]` похідне від `first`+`last` | обчислити під час рендеру |
| Мутація без інвалідації кешу | `invalidateQueries` в `onSuccess` |
| Помилка запиту лише в `console.log` | `notifyError()` з `shared/lib/notify.ts` + кнопка «Повторити» на місці даних |
| Prop drilling на 4+ рівні | композиція (`children`) або Context |
| Компонент на 400 рядків | розбити на підкомпоненти + хук |
| Імпорт з `features/a/components/X` в `features/b` | через `features/a/index.ts` або перенести в `shared` |
| `axios` імпортується напряму в компонентах | лише `http` інстанс через api-шар фічі |

## Чек-лист перед завершенням
- [ ] 4 стани запиту оброблені
- [ ] форми валідуються, серверні помилки показуються
- [ ] немає `any`, немає попереджень ESLint (зокрема `react-hooks/exhaustive-deps`)
- [ ] тести для логіки хуків/компонентів (див. `testing-debugging`)
- [ ] `npm run lint && npm run typecheck && npm run test -w client` — пройдені
