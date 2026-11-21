---
name: frontend-design
description: Візуальна частина frontend — верстка, SCSS / CSS Modules, дизайн-токени, адаптивність, доступність (a11y), UI-кіт компонентів, теми. Використовуй при створенні або зміні стилів, макетів сторінок, базових UI-компонентів і при перевірці вигляду інтерфейсу.
---

# Frontend Design

## Принципи

- **Mobile-first**: базові стилі для мобільного, `min-width` медіазапити для більших екранів.
- **Дизайн-токени** замість «магічних чисел»: кольори, відступи, радіуси, тіні, шрифти — лише через CSS-змінні.
- **Доступність — не опція**: семантичний HTML, клавіатура, контраст, фокус.
- **UI-кіт** (`shared/ui`) — презентаційні компоненти без бізнес-логіки та без запитів до API.
- Однакові речі виглядають однаково: перевикористовуй компоненти, не копіюй стилі.

## Токени

```scss
// styles/_tokens.scss — підключається один раз у global.scss
:root {
  --color-bg: #ffffff;
  --color-surface: #f6f7f9;
  --color-text: #1a1d21;
  --color-text-muted: #5b6470;
  --color-primary: #2557d6;
  --color-primary-hover: #1d47b3;
  --color-danger: #c62828;
  --color-border: #dfe3e8;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;

  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 16px;
  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --text-sm: 0.875rem; --text-md: 1rem; --text-lg: 1.25rem; --text-xl: 1.5rem;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --focus-ring: 0 0 0 3px rgb(37 87 214 / 0.4);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --color-bg: #121417;
    --color-surface: #1c1f24;
    --color-text: #e8eaed;
    --color-text-muted: #a0a7b1;
    --color-border: #2e333a;
  }
}
:root[data-theme='dark'] { /* ті самі значення, що вище */ }
```

```scss
// styles/_mixins.scss — брейкпоінти в одному місці
$breakpoints: (sm: 640px, md: 768px, lg: 1024px, xl: 1280px);
@mixin up($bp) { @media (min-width: map-get($breakpoints, $bp)) { @content; } }
```

У SCSS-модулях: `@use '@/styles/mixins' as *;` (змінні SCSS для брейкпоінтів, CSS-змінні — для всього, що може змінюватися в runtime).

## CSS Modules

```tsx
// shared/ui/Button/Button.tsx
import clsx from 'clsx';
import styles from './Button.module.scss';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...rest }: Props) {
  return (
    <button
      className={clsx(styles.button, styles[variant], styles[size], className)}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
```

```scss
// Button.module.scss
.button {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border: 1px solid transparent; border-radius: var(--radius-md);
  font: inherit; cursor: pointer;
  transition: background-color 0.15s ease;

  &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}
.primary { background: var(--color-primary); color: #fff;
  &:hover:not(:disabled) { background: var(--color-primary-hover); } }
.sm { padding: var(--space-1) var(--space-3); font-size: var(--text-sm); }
```

Правила:
- Класи — `camelCase` у модулях (`styles.cardTitle`).
- Без глобальних селекторів за тегами всередині модулів; `:global` — лише як виняток із коментарем.
- Вкладеність SCSS ≤ 3 рівнів.
- `!important` — заборонено (крім утиліт типу `.visually-hidden`).
- Глобальні стилі — лише reset, токени, типографіка базових тегів.

## Верстка

- Flexbox — одномірні розкладки, Grid — двомірні (картки, сторінкові макети).
- Відступи між елементами — через `gap`, а не `margin` на дочірніх елементах.
- Адаптивні сітки без медіазапитів: `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));`.
- Розміри шрифтів у `rem`, обмеження ширини тексту `max-width: 70ch`.
- Зображення: `max-width: 100%; height: auto;`, явні `width/height` або `aspect-ratio` проти стрибків верстки; `loading="lazy"` поза першим екраном.
- Без горизонтального скролу на 320px.

## Доступність (a11y)

- Семантика: `<button>` для дій, `<a href>` для навігації, `<nav> <main> <header> <footer>`, правильна ієрархія `h1–h6`.
- Кожен `input` має `<label>` (або `aria-label`); помилки пов'язані через `aria-describedby`, поле з помилкою — `aria-invalid`.
- Видимий фокус (`:focus-visible`), логічний порядок Tab, модалки утримують фокус і закриваються Esc.
- Контраст тексту ≥ 4.5:1 (великий текст ≥ 3:1).
- Іконки-кнопки мають `aria-label`; декоративні зображення `alt=""`.
- Повідомлення про стан (помилки, успіх) — `role="alert"` або `aria-live="polite"`.
- Поважай `prefers-reduced-motion`.

```tsx
// shared/ui/Input/Input.tsx — зв'язок label/помилки
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, id, ...rest }, ref) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} ref={ref} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} {...rest} />
      {error && <p id={errorId} className={styles.error}>{error}</p>}
    </div>
  );
});
```

## Базовий UI-кіт (створювати за потреби, не наперед)

Button, Input, Textarea, Select, Checkbox, Modal, Spinner, ErrorState, EmptyState, Pagination. Сповіщення — не компонент кіту, а `notifySuccess()` / `notifyError()` з `shared/lib/notify.ts` (Notiflix). Кожен — папка з `Component.tsx`, `Component.module.scss`, `index.ts`.

## Типові помилки

| Помилка | Правильно |
|---|---|
| `color: #2557d6` у компоненті | `var(--color-primary)` |
| `<div onClick>` як кнопка | `<button type="button">` |
| `outline: none` без заміни | `:focus-visible` з `box-shadow` |
| Фіксовані `width: 1200px` | `max-width` + `width: 100%` |
| Placeholder замість label | видимий `<label>` |
| Копія стилів кнопки в іншому модулі | використати `Button` з `variant` |
| Глибока вкладеність `.a .b .c .d span` | плоскі класи модуля |

## Перевірка результату

- Переглянь сторінку на ширинах 320, 768, 1280 px (Playwright або браузер).
- Пройди сторінку лише з клавіатури.
- Перевір світлу й темну теми.
- Playwright + `@axe-core/playwright` для автоматичної перевірки a11y на ключових сторінках.
