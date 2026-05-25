# Verstak — Landing

Production-ready landing page for **Verstak** — vendor-agnostic AI coding assistant for Russian-speaking developers.

Stack: vanilla HTML + CSS, minimal JS (sticky navbar, mobile burger). Никаких фреймворков, без сборки.

## Структура

```
verstak/
├── index.html        ← основной лендинг (single page, все секции)
├── assets/
│   ├── logo.svg      ← плейсхолдер логотипа (V с засечкой-молотком)
│   └── og-cover.svg  ← Open Graph cover 1200x630
└── README.md         ← этот файл
```

## Запуск локально

```bash
cd landings/verstak
python -m http.server 8000
# открой http://localhost:8000
```

Или просто открой `index.html` двойным кликом — работает и так, шрифты подтянутся из Google Fonts.

## Деплой

**GitHub Pages** — самый простой вариант:
1. Запушь в `verstak/landing` репо (или ветку `gh-pages` в основной).
2. Settings → Pages → Source = ветка с этой папкой.
3. Готово через 30 секунд по `https://verstak.github.io/landing/`.

**Cloudflare Pages** — drag-drop:
1. dash.cloudflare.com → Pages → Create → Upload assets.
2. Перетащи папку `verstak/` целиком.
3. Привяжи домен `verstak.io`.

**Netlify drag-drop**:
1. app.netlify.com/drop
2. Перетащи папку `verstak/`.
3. Получи `*.netlify.app` URL, далее можно прицепить домен.

## Что заменить руками

| Что | Где | Зачем |
|---|---|---|
| **Логотип** | `assets/logo.svg` (28 строк) | Сейчас плейсхолдер V+молоток. Заменить на финальный SVG от дизайнера. Используется в navbar, footer, favicon. |
| **OG-cover** | `assets/og-cover.svg` | Сейчас SVG; для лучшей совместимости с соцсетями экспортнуть в PNG 1200×630 и обновить `og:image` в `<head>`. |
| **Скриншоты приложения** | hero-секция, блок IDE | Сейчас CSS-моки. Когда будет финальный UI — заменить на скриншоты в `assets/screen-hero.png` + `<img>`. |
| **Реальный GitHub URL** | поиск `github.com/verstak` | Сейчас все ссылки ведут на `https://github.com/verstak` — заменить, когда репо будет создан. |
| **Кнопки скачивания** | секция `#download` + hero | Сейчас `href="#"`. Подключить реальные ссылки на `.exe` / `.dmg` / `.AppImage`. |
| **Favicon** | `<link rel="icon">` в `<head>` | Сейчас использует `logo.svg`. Можно добавить `favicon.ico` 32×32 для старых браузеров. |
| **Email** | `hello@verstak.io`, `sales@verstak.io` | Подключить почту на домене. |
| **Аналитика** | `<head>` | Добавить Yandex.Metrika / Plausible перед запуском. |
| **Forms** | waitlist / контактные | Сейчас нет формы — подключить Tally / Formspree / собственный endpoint. |

## SEO / Open Graph

Уже настроено в `<head>`:
- `<title>` + `<meta description>` (под РФ-аудиторию)
- `og:*` + `twitter:*` теги
- `<link rel="canonical">`
- `lang="ru"`, `theme-color`
- Семантика: `<header>`, `<nav>`, `<main>`-секции, `<footer>`

При смене домена — обновить `og:url`, `og:image`, `<link rel="canonical">`.

## Адаптив

Брейкпоинты: **1200 / 900 / 600**.
- ≤900px — навбар-бургер, фичи 2×, цены и аудитории в 1 колонку.
- ≤600px — всё в 1 колонку, таблица сравнения скроллится горизонтально.

Проверял в Chrome DevTools — iPhone SE, iPad, desktop 1440.

## Performance

- Inline CSS (нет внешних стилей кроме Google Fonts)
- Preconnect к Google Fonts
- SVG-иконки и логотип (без растровых картинок)
- JS — ~20 строк, без библиотек
- Ожидаемый Lighthouse: 95+ Performance, 100 Accessibility, 100 SEO
