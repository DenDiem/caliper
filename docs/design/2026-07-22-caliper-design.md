# Caliper — дизайн

**Дата:** 2026-07-22
**Статус:** затверджено до імплементації
**Джерело ідеї:** `DOM-анотації → Claude Code: оцінка ідеї та AXI-дизайн` (2026-07-21)

---

## 1. Мета

Інструмент, що перетворює візуальний дефект, помічений людиною в браузері, на **машинно-точну задачу для агента**.

Первинний споживач виводу — **агент**, не людина. Це визначає всі рішення нижче: структура замість пікселів, токени замість значень, фільтрація до контексту, файл як транспорт.

Мотивація — тікети типу OM-4110: 11 візуальних дефектів, описаних руками в Jira зі скриншотами й Figma-лінками. Кожен такий опис агент мусить спершу розшифрувати назад у DOM — Caliper прибирає цей крок.

## 2. Два продукти, спільне ядро

| | Продукт | Аудиторія | Шел | Транспорт |
|---|---|---|---|---|
| **A** | `qa-extension` | мануальний QA | Chrome MV3 | clipboard / файл / (пізніше) HTTP |
| **B** | `pw-overlay` *(не зараз)* | розробник + агент | IIFE через `playwright-cli run-code` | `localStorage` |

Спільне — рівно одне: **ядро «елемент → структурована анотація»**. Різне — шели, транспорт, аудиторія.

## 3. Скоуп MVP

**Робимо:** MV3 extension. Alt+hover підсвічує елемент → клік відкриває popover → коментар, Figma URL, severity → анотація лягає в сесію → side panel показує список, дозволяє редагувати й експортувати JSON.

**Не робимо зараз, але не заважаємо:** дашборд-сервер, продукт B, автомапінг у Figma, інтеграція з Jira, дедуплікація дефектів.

**Чим відрізняємось від Marker.io / BugHerd / Usersnap:** їхній вихід — картинка + текст для людини. Наш — JSON для агента: стійкий селектор, ім'я компонента, computed styles із прив'язкою до дизайн-токенів. Скрін є, але це вторинний канал.

## 4. Структура репозиторію

Монорепа. Причина — контрибʼютори: `clone → pnpm i → pnpm dev` замість двох репо з `npm link`. PR, що чіпає ядро й шел, лишається одним PR.

```
caliper/
├─ packages/
│  ├─ core/          # чиста логіка. Нуль chrome.*, нуль UI-фреймворку
│  │  ├─ picker/        # hit-testing, hover/click state machine
│  │  ├─ selector/      # побудова стійкого селектора
│  │  ├─ context/       # витяг ElementContext
│  │  ├─ tokens/        # збір і матчинг CSS custom properties
│  │  ├─ schema/        # zod-схеми + типи + версіонування
│  │  └─ session/       # модель сесії, AnnotationSink інтерфейс
│  └─ overlay/       # in-page UI у Shadow DOM: highlight + popover
├─ apps/
│  └─ qa-extension/  # MV3: content script, side panel, background, storage, export
└─ docs/
```

**Межа, що робить продукт B дешевим:** ані `core`, ані `overlay` не знають про `chrome.*` і про транспорт. Продукт B — ті самі два пакети плюс інший шел. Перевіряється лінтом (`no-restricted-globals: chrome` для `packages/**`), не домовленістю.

## 5. Модель даних

Головний контракт. Переживе обидва продукти й дашборд, тому `schemaVersion` з першого дня.

```ts
interface CaliperSession {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  label?: string;
  caliperVersion: string;
  annotations: CaliperAnnotation[];
  assets: Record<string, string>;   // screenshotId → dataUrl
}

interface CaliperAnnotation {
  id: string;
  createdAt: string;
  comment: string;
  severity: 'blocker' | 'major' | 'minor' | 'nitpick';
  figmaUrl?: string;
  page: {
    url: string;
    title: string;
    viewport: {width: number; height: number; dpr: number};
  };
  target: ElementContext;
  screenshotId?: string;
}

interface ElementContext {
  selector: string;
  selectorStrategy: 'testid' | 'id' | 'component-path' | 'nth-path';
  selectorConfidence: 'high' | 'medium' | 'low';
  tagName: string;
  componentName: string | null;
  componentSource: 'ng-devmode' | 'tag-heuristic' | null;
  componentChain: string[];
  text: string;                          // обрізаний до 120 символів
  attributes: Record<string, string>;    // id, class, data-*, aria-*
  box: {x: number; y: number; width: number; height: number};
  styles: Record<string, StyleValue>;
}

interface StyleValue {
  value: string;                 // computed: 'rgb(51, 51, 51)'
  token: string | null;          // '--color-text-primary' або null
  tokenMatch: 'exact' | 'nearest' | null;
}
```

### 5.1 Скріншот не лежить у тілі анотації

`assets` — окрема мапа `screenshotId → dataUrl`. Інакше один `Ctrl+C` з десятьма дефектами дає мегабайти base64 у буфері, а агент платить ~1.5k токенів за картинку, з якої йому потрібні три числа.

Експорт має два режими: `--with-assets` і без. За замовчуванням — без.

## 6. Ключові алгоритми

### 6.1 Стійкий селектор

Пріоритети, як у генератора Playwright:

1. `[data-testid]` / `[data-test]` → `confidence: high`
2. `#id`, якщо не схожий на згенерований хеш (regex на `^[a-z]+-?\d{4,}$`, `_ng`, base36-подібні) → `high`
3. Шлях через компонентні теги: `soa-inform-block > .info p` → `medium`
4. `nth-child` від найближчого стабільного предка → `low`

`selectorStrategy` і `selectorConfidence` пишемо в JSON — агент бачить, наскільки селектору можна довіряти, і чи варто його перевіряти перед правкою.

### 6.2 Ім'я компонента — graceful degradation

- Якщо `window.ng` є (dev-білд, `ngDevMode`): `ng.getOwningComponent(el)` → конструктор → `.name` → `componentSource: 'ng-devmode'`. Додатково дає ланцюг угору.
- Якщо немає (prod): тег-селектор компонента в DOM **зберігається завжди** — Angular не мінімізує селектори. `tagName` із дефісом і не з відомого списку HTML-тегів → `componentSource: 'tag-heuristic'`.
- `componentChain` будується підйомом по `parentElement` зі збором усіх тегів із дефісом.

Не витягується на проді лише директива з атрибутним селектором (`[soaButton]`) — це прийнятна втрата.

### 6.3 Computed styles — curated allowlist

Збираємо ~40 властивостей, не 340. Чотири групи:

- **типографіка:** `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`, `color`, `text-align`, `text-transform`
- **бокс:** `padding-*`, `margin-*`, `gap`, `row-gap`, `column-gap`, `width`, `height`, `border-*`, `border-radius`
- **лейаут:** `display`, `position`, `flex-direction`, `align-items`, `justify-content`, `grid-template-columns`, `overflow`
- **візуал:** `background-color`, `box-shadow`, `opacity`, `z-index`, `transform`

Це рівно ті властивості, де живуть візуальні дефекти. Тримає анотацію в межах ~400 токенів замість ~6k.

### 6.4 tokenMatch — головна дельта

Один раз на сторінку `core/tokens` обходить `document.styleSheets`, збирає всі оголошені `--*` з `:root` / `body` / `:host` у мапу `значення → ім'я токена`. Кросоріджинові стилі — `try/catch`, ігноруємо.

Далі кожне computed-значення зіставляється:
- точний збіг рядка → `tokenMatch: 'exact'`
- для кольорів: нормалізація у RGB і пошук найближчого за ΔE (CIE76), поріг ΔE < 3 — межа, за якою різницю не бачить око → `'nearest'`
- для відступів: точний збіг числа в px
- нема збігу → `token: null`

Агент отримує `color: rgb(51,51,51) → --color-text-primary` замість пікселя. Це рівно те, чого вимагає `scss.md` («тільки змінні»), і чого не дає жоден готовий візуальний баг-репортер.

## 7. Потік даних і транспортний шов

```
content script → overlay (Shadow DOM) → core.pick(el) → ElementContext
       ↓ popover: comment / figmaUrl / severity
   background: captureVisibleTab → кроп по box в OffscreenCanvas
       ↓
   AnnotationSink.push()          ← ШОВ
       ↓
   chrome.storage.local (session) → side panel: список, редагування, експорт
```

```ts
interface AnnotationSink {
  push(annotation: CaliperAnnotation): Promise<void>;
  list(): Promise<CaliperSession>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
```

Реалізації: `ChromeStorageSink` зараз, `LocalStorageSink` для продукту B, `HttpSink` для дашборда. Дашборд після цього — один новий клас плюс екран налаштувань, а не переписування.

## 8. AXI-контракт споживання

Як агент це їсть — і чому саме так.

| AXI-принцип | Втілення в Caliper |
|---|---|
| Структуровані дані, не пікселі | JSON із селектором, компонентом, токенами. PNG — окремий канал, за замовчуванням не експортується |
| Файл як транспорт, нуль раунд-тріпів | Один `caliper-session.json`. Агент бере його одним `Read`. Жодного сервера, жодного нового MCP |
| Нуль нової тул-поверхні | Споживання через наявні примітиви: `Read` + `jq`. Нова можливість без нового тула в контексті |
| Фільтрація до контексту | ~400 токенів на анотацію. Плоский масив зі стабільними ключами — `jq` витягує по одному дефекту, агент не тягне сесію цілком |
| Композиція з наявним ланцюгом | `figmaUrl` → скіл `figma-to-code`; `componentName` → `Glob` до `.component.ts`; `token` → готова змінна зі `scss.md` |
| Lazy | Скрін вантажиться лише тоді, коли структури не вистачило |

**Індекси не зберігаємо.** Ніяких `byComponent: {...}` у файлі — це дублювання, яке розсинхронізується. Групування — робота `jq` на боці агента.

Одна сесія на 11 дефектів (масштаб OM-4110) ≈ 4.4k токенів без картинок. Прийнятно для одного `Read`.

## 9. Стек

- **pnpm workspaces** + TypeScript strict
- **WXT** (wxt.dev) для extension — MV3, side panel, HMR, активний, мінімум boilerplate. Знижує поріг входу для контрибʼюторів
- **Preact + @preact/signals** для overlay і side panel — 4kB, придатний для інжекту в Shadow DOM
- **zod** для схем — runtime-валідація і генерація JSON Schema для майбутнього дашборда з одного джерела
- **ESLint + Prettier**, LF
- Мова коду й публічних README — англійська (опенсорс). Проєктні документи — українська
- Ліцензія: **MIT**

## 10. Ризики та відкриті питання

| Ризик | Стан |
|---|---|
| CSP на цільовій сторінці блокує інжект стилів overlay | Shadow DOM + `adoptedStyleSheets` обходить більшість; перевірити на реальному стейджі |
| Кросоріджинові `styleSheets` недоступні для збору токенів | `try/catch`, деградуємо до `token: null`. Основні токени зазвичай у власному бандлі |
| `captureVisibleTab` не бачить елемент поза вьюпортом | Скрол до елемента перед захопленням, потім повернення позиції |
| Селектор `nth-path` ламкий на динамічних списках | `selectorConfidence: 'low'` чесно про це сигналізує агенту |
| WXT нав'язує конвенції (auto-imports, entrypoints) | Прийнятно; `core`/`overlay` від нього не залежать і лишаються портативними |

## 11. Явно поза скоупом

Дашборд-сервер. Продукт B. Автомапінг компонент → Figma-нода. Інтеграція з Jira. Дедуплікація схожих дефектів. Запис відео. Мережеві логи.
