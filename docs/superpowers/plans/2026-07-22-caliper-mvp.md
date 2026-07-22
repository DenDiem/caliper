# Caliper MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome MV3 extension that turns a clicked DOM element into a machine-precise JSON annotation (stable selector, component name, design-token-matched styles) for an AI agent to fix.

**Architecture:** pnpm monorepo. `@caliper/core` holds pure logic with zero `chrome.*` and zero UI framework. `@caliper/overlay` renders in-page UI in a Shadow DOM. `apps/qa-extension` is the MV3 shell (content script, background, side panel, storage, export). A future Playwright shell reuses core + overlay unchanged.

**Tech Stack:** TypeScript strict, pnpm workspaces, vitest, zod, Preact + @preact/signals, WXT (wxt.dev), ESLint + Prettier.

## Global Constraints

- Node >= 20, pnpm >= 9.
- TypeScript `strict: true`. No `as` type assertions anywhere — fix types at the source instead.
- All files LF line endings.
- `packages/**` must not reference `chrome.*` or `browser.*`. Enforced by ESLint `no-restricted-globals`, not by convention.
- Code, comments, README, and all UI copy in **English**. Project design docs stay Ukrainian.
- `schemaVersion` is the literal `1` for the whole MVP.
- No inline comments explaining *what* code does. Only genuinely surprising constraints get a one-line note.
- Tests: **`packages/core` only** — pure functions where they are cheap and load-bearing. `packages/overlay` and `apps/qa-extension` are verified manually; no test files there. (This narrows the project's default "no tests unless asked" rule to the one place where untested code would be actively dangerous. Say the word and the test steps come out.)
- Commit after every task. Commit message format: `feat(scope): summary` / `chore(scope): summary`. No `Co-Authored-By` lines.

---

## File Structure

```
caliper/
├─ package.json                        # workspace root, scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.js
├─ .prettierrc
├─ packages/
│  ├─ core/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  ├─ vitest.config.ts
│  │  └─ src/
│  │     ├─ index.ts                   # public surface of the package
│  │     ├─ schema/annotation.schema.ts # zod schemas + inferred types
│  │     ├─ selector/is-generated-id.ts
│  │     ├─ selector/build-selector.ts
│  │     ├─ component/html-tags.ts
│  │     ├─ component/resolve-component.ts
│  │     ├─ styles/style-allowlist.ts
│  │     ├─ styles/collect-styles.ts
│  │     ├─ tokens/color.ts            # parseColor, deltaE
│  │     ├─ tokens/collect-tokens.ts
│  │     ├─ tokens/match-token.ts
│  │     ├─ context/extract-context.ts
│  │     ├─ picker/pick-target.ts      # pure: element → best annotation target
│  │     └─ session/sink.ts            # AnnotationSink interface + MemorySink
│  └─ overlay/
│     ├─ package.json
│     └─ src/
│        ├─ index.ts                   # mountOverlay(options)
│        ├─ overlay-host.ts            # shadow root + adopted stylesheet
│        ├─ highlight.tsx
│        ├─ popover.tsx
│        └─ overlay.css
└─ apps/
   └─ qa-extension/
      ├─ package.json
      ├─ wxt.config.ts
      └─ src/
         ├─ entrypoints/content.ts
         ├─ entrypoints/background.ts
         ├─ entrypoints/sidepanel/index.html
         ├─ entrypoints/sidepanel/main.tsx
         ├─ entrypoints/sidepanel/App.tsx
         ├─ messaging/messages.ts       # typed message contract
         ├─ sinks/chrome-storage.sink.ts
         ├─ screenshot/capture.ts
         └─ export/export-session.ts
```

---

## Phase 1 — `@caliper/core`

### Task 1: Monorepo skeleton and annotation schema

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/schema/annotation.schema.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/schema/annotation.schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CaliperAnnotation`, `CaliperSession`, `ElementContext`, `StyleValue`, `Severity`, `SelectorStrategy`, `ComponentSource`, and the zod schemas `caliperAnnotationSchema`, `caliperSessionSchema`. Every later task imports types from here.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "caliper",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {"node": ">=20"},
  "scripts": {
    "test": "pnpm -r test",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "eslint": "^9.12.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.8.0",
    "vitest": "^2.1.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

`.prettierrc`:

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "bracketSpacing": false,
  "trailingComma": "all",
  "endOfLine": "lf"
}
```

`eslint.config.js`:

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['**/dist/**', '**/.output/**', '**/.wxt/**', '**/node_modules/**']},
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    rules: {
      'no-restricted-globals': [
        'error',
        {name: 'chrome', message: 'packages/* must stay shell-agnostic. Move this to apps/*.'},
        {name: 'browser', message: 'packages/* must stay shell-agnostic. Move this to apps/*.'},
      ],
      '@typescript-eslint/consistent-type-assertions': ['error', {assertionStyle: 'never'}],
    },
  },
);
```

- [ ] **Step 2: Create the core package**

`packages/core/package.json`:

```json
{
  "name": "@caliper/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {".": "./src/index.ts"},
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

Add `jsdom` to the root devDependencies (`"jsdom": "^25.0.0"`).

- [ ] **Step 3: Write the failing schema test**

`packages/core/src/schema/annotation.schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {caliperAnnotationSchema, caliperSessionSchema} from './annotation.schema';

const validContext = {
  selector: '[data-testid="inform"]',
  selectorStrategy: 'testid',
  selectorConfidence: 'high',
  tagName: 'div',
  componentName: 'soa-inform-block',
  componentSource: 'tag-heuristic',
  componentChain: ['soa-inform-block', 'soa-menu-page'],
  text: 'Delivery is closed',
  attributes: {'data-testid': 'inform'},
  box: {x: 10, y: 20, width: 300, height: 48},
  styles: {color: {value: 'rgb(51, 51, 51)', token: '--color-text-primary', tokenMatch: 'exact'}},
};

const validAnnotation = {
  id: 'a1',
  createdAt: '2026-07-22T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  page: {url: 'https://app.test/menu', title: 'Menu', viewport: {width: 1440, height: 900, dpr: 2}},
  target: validContext,
};

describe('caliperAnnotationSchema', () => {
  it('accepts a minimal valid annotation', () => {
    expect(caliperAnnotationSchema.parse(validAnnotation).id).toBe('a1');
  });

  it('rejects an unknown severity', () => {
    const result = caliperAnnotationSchema.safeParse({...validAnnotation, severity: 'urgent'});
    expect(result.success).toBe(false);
  });

  it('rejects a non-url figmaUrl', () => {
    const result = caliperAnnotationSchema.safeParse({...validAnnotation, figmaUrl: 'not-a-url'});
    expect(result.success).toBe(false);
  });

  it('defaults an empty session to schemaVersion 1', () => {
    const session = caliperSessionSchema.parse({
      id: 's1',
      createdAt: '2026-07-22T10:00:00.000Z',
      caliperVersion: '0.1.0',
      annotations: [],
      assets: {},
    });
    expect(session.schemaVersion).toBe(1);
  });
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — `Failed to resolve import "./annotation.schema"`.

- [ ] **Step 5: Implement the schema**

`packages/core/src/schema/annotation.schema.ts`:

```ts
import {z} from 'zod';

export const severitySchema = z.enum(['blocker', 'major', 'minor', 'nitpick']);
export const selectorStrategySchema = z.enum(['testid', 'id', 'component-path', 'nth-path']);
export const selectorConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const componentSourceSchema = z.enum(['ng-devmode', 'tag-heuristic']).nullable();

export const styleValueSchema = z.object({
  value: z.string(),
  token: z.string().nullable(),
  tokenMatch: z.enum(['exact', 'nearest']).nullable(),
});

export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const elementContextSchema = z.object({
  selector: z.string(),
  selectorStrategy: selectorStrategySchema,
  selectorConfidence: selectorConfidenceSchema,
  tagName: z.string(),
  componentName: z.string().nullable(),
  componentSource: componentSourceSchema,
  componentChain: z.array(z.string()),
  text: z.string(),
  attributes: z.record(z.string()),
  box: boxSchema,
  styles: z.record(styleValueSchema),
});

export const caliperAnnotationSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  comment: z.string(),
  severity: severitySchema,
  figmaUrl: z.string().url().optional(),
  page: z.object({
    url: z.string(),
    title: z.string(),
    viewport: z.object({width: z.number(), height: z.number(), dpr: z.number()}),
  }),
  target: elementContextSchema,
  screenshotId: z.string().optional(),
});

export const caliperSessionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string(),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  caliperVersion: z.string(),
  annotations: z.array(caliperAnnotationSchema),
  assets: z.record(z.string()),
});

export type Severity = z.infer<typeof severitySchema>;
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfidence = z.infer<typeof selectorConfidenceSchema>;
export type ComponentSource = z.infer<typeof componentSourceSchema>;
export type StyleValue = z.infer<typeof styleValueSchema>;
export type Box = z.infer<typeof boxSchema>;
export type ElementContext = z.infer<typeof elementContextSchema>;
export type CaliperAnnotation = z.infer<typeof caliperAnnotationSchema>;
export type CaliperSession = z.infer<typeof caliperSessionSchema>;
```

`packages/core/src/index.ts`:

```ts
export * from './schema/annotation.schema';
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): monorepo skeleton and annotation schema"
```

---

### Task 2: Stable selector builder

**Files:**
- Create: `packages/core/src/selector/is-generated-id.ts`
- Create: `packages/core/src/selector/build-selector.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/selector/build-selector.test.ts`

**Interfaces:**
- Consumes: `SelectorStrategy`, `SelectorConfidence` from Task 1.
- Produces: `buildSelector(element: Element): SelectorResult` where `SelectorResult = {selector: string; strategy: SelectorStrategy; confidence: SelectorConfidence}`. Also `isGeneratedId(id: string): boolean`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/selector/build-selector.test.ts`:

```ts
import {beforeEach, describe, expect, it} from 'vitest';
import {buildSelector} from './build-selector';
import {isGeneratedId} from './is-generated-id';

const render = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('render produced no element');
  return root;
};

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('isGeneratedId', () => {
  it('flags framework-generated ids', () => {
    expect(isGeneratedId('mat-input-3')).toBe(true);
    expect(isGeneratedId('cdk-overlay-0')).toBe(true);
    expect(isGeneratedId('a1b2c3d4e5')).toBe(true);
    expect(isGeneratedId('field-12345')).toBe(true);
  });

  it('accepts human-authored ids', () => {
    expect(isGeneratedId('delivery-address')).toBe(false);
    expect(isGeneratedId('main')).toBe(false);
  });
});

describe('buildSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers data-testid', () => {
    render('<div data-testid="inform"><p>text</p></div>');
    const result = buildSelector(query('[data-testid="inform"]'));
    expect(result).toEqual({
      selector: '[data-testid="inform"]',
      strategy: 'testid',
      confidence: 'high',
    });
  });

  it('uses a human-authored id when there is no testid', () => {
    render('<section id="delivery-address"></section>');
    const result = buildSelector(query('#delivery-address'));
    expect(result.selector).toBe('#delivery-address');
    expect(result.strategy).toBe('id');
    expect(result.confidence).toBe('high');
  });

  it('skips a generated id and falls through to the component path', () => {
    render('<soa-inform-block><p id="mat-text-4821">text</p></soa-inform-block>');
    const result = buildSelector(query('#mat-text-4821'));
    expect(result.selector).toBe('soa-inform-block p');
    expect(result.strategy).toBe('component-path');
    expect(result.confidence).toBe('medium');
  });

  it('includes a stable class in the component path when present', () => {
    render('<soa-inform-block><p class="info">text</p></soa-inform-block>');
    const result = buildSelector(query('.info'));
    expect(result.selector).toBe('soa-inform-block p.info');
    expect(result.strategy).toBe('component-path');
  });

  it('falls back to an nth-child path with low confidence', () => {
    render('<div><span>a</span><span>b</span></div>');
    const target = query('div').children[1];
    if (!target) throw new Error('missing second span');
    const result = buildSelector(target);
    expect(result.strategy).toBe('nth-path');
    expect(result.confidence).toBe('low');
    expect(document.querySelector(result.selector)?.textContent).toBe('b');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — cannot resolve `./build-selector`.

- [ ] **Step 3: Implement `isGeneratedId`**

`packages/core/src/selector/is-generated-id.ts`:

```ts
const GENERATED_ID_PATTERNS: readonly RegExp[] = [
  /^(mat|cdk|ng|mdc)-/i,
  /^:r[0-9a-z]+:$/i,
  /\d{4,}$/,
  /^[a-f0-9]{8,}$/i,
];

export const isGeneratedId = (id: string): boolean =>
  GENERATED_ID_PATTERNS.some((pattern) => pattern.test(id));
```

- [ ] **Step 4: Implement `buildSelector`**

`packages/core/src/selector/build-selector.ts`:

```ts
import type {SelectorConfidence, SelectorStrategy} from '../schema/annotation.schema';
import {isGeneratedId} from './is-generated-id';

export interface SelectorResult {
  selector: string;
  strategy: SelectorStrategy;
  confidence: SelectorConfidence;
}

const TESTID_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa'] as const;
const UTILITY_CLASS_PATTERN = /^(ng-|mat-|cdk-|is-|has-)|\d{3,}/;

const isCustomElement = (element: Element): boolean => element.tagName.includes('-');

const stableClass = (element: Element): string | null => {
  for (const className of Array.from(element.classList)) {
    if (!UTILITY_CLASS_PATTERN.test(className)) return className;
  }
  return null;
};

const localPart = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const className = stableClass(element);
  return className ? `${tag}.${className}` : tag;
};

const nearestCustomAncestor = (element: Element): Element | null => {
  let current = element.parentElement;
  while (current) {
    if (isCustomElement(current)) return current;
    current = current.parentElement;
  }
  return null;
};

const nthPath = (element: Element): string => {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(' > ');
};

export const buildSelector = (element: Element): SelectorResult => {
  for (const attribute of TESTID_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) {
      return {selector: `[${attribute}="${value}"]`, strategy: 'testid', confidence: 'high'};
    }
  }

  if (element.id && !isGeneratedId(element.id)) {
    return {selector: `#${element.id}`, strategy: 'id', confidence: 'high'};
  }

  const ancestor = nearestCustomAncestor(element);
  if (ancestor) {
    const selector = `${ancestor.tagName.toLowerCase()} ${localPart(element)}`;
    if (document.querySelectorAll(selector).length === 1) {
      return {selector, strategy: 'component-path', confidence: 'medium'};
    }
  }

  if (isCustomElement(element) && document.querySelectorAll(element.tagName.toLowerCase()).length === 1) {
    return {
      selector: element.tagName.toLowerCase(),
      strategy: 'component-path',
      confidence: 'medium',
    };
  }

  return {selector: nthPath(element), strategy: 'nth-path', confidence: 'low'};
};
```

- [ ] **Step 5: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export * from './selector/build-selector';
export * from './selector/is-generated-id';
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 7 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): stable selector builder with confidence levels"
```

---

### Task 3: Component resolution

**Files:**
- Create: `packages/core/src/component/html-tags.ts`
- Create: `packages/core/src/component/resolve-component.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/component/resolve-component.test.ts`

**Interfaces:**
- Consumes: `ComponentSource` from Task 1.
- Produces: `resolveComponent(element: Element): ComponentInfo` where `ComponentInfo = {name: string | null; source: ComponentSource}`, and `buildComponentChain(element: Element): string[]` (nearest component first).

- [ ] **Step 1: Write the failing test**

`packages/core/src/component/resolve-component.test.ts`:

```ts
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {buildComponentChain, resolveComponent} from './resolve-component';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('resolveComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'ng');
  });

  it('reads the component name from the Angular dev-mode global when present', () => {
    document.body.innerHTML = '<div class="inner"></div>';
    Reflect.set(globalThis, 'ng', {
      getOwningComponent: () => ({constructor: {name: 'InformBlockComponent'}}),
    });
    expect(resolveComponent(query('.inner'))).toEqual({
      name: 'InformBlockComponent',
      source: 'ng-devmode',
    });
  });

  it('falls back to the custom element tag on a production build', () => {
    document.body.innerHTML = '<soa-inform-block></soa-inform-block>';
    expect(resolveComponent(query('soa-inform-block'))).toEqual({
      name: 'soa-inform-block',
      source: 'tag-heuristic',
    });
  });

  it('returns null for a plain HTML element', () => {
    document.body.innerHTML = '<div></div>';
    expect(resolveComponent(query('div'))).toEqual({name: null, source: null});
  });

  it('does not treat hyphenated built-in tags as components', () => {
    document.body.innerHTML = '<font-face></font-face>';
    expect(resolveComponent(query('font-face')).name).toBeNull();
  });
});

describe('buildComponentChain', () => {
  it('lists custom-element ancestors from nearest to furthest', () => {
    document.body.innerHTML =
      '<soa-menu-page><soa-inform-block><p class="t">x</p></soa-inform-block></soa-menu-page>';
    expect(buildComponentChain(query('.t'))).toEqual(['soa-inform-block', 'soa-menu-page']);
  });

  it('includes the element itself when it is a component', () => {
    document.body.innerHTML = '<soa-menu-page><soa-inform-block></soa-inform-block></soa-menu-page>';
    expect(buildComponentChain(query('soa-inform-block'))).toEqual([
      'soa-inform-block',
      'soa-menu-page',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — cannot resolve `./resolve-component`.

- [ ] **Step 3: Implement the built-in tag list**

`packages/core/src/component/html-tags.ts`:

```ts
export const HYPHENATED_BUILTIN_TAGS: ReadonlySet<string> = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);
```

- [ ] **Step 4: Implement the resolver**

`packages/core/src/component/resolve-component.ts`:

```ts
import type {ComponentSource} from '../schema/annotation.schema';
import {HYPHENATED_BUILTIN_TAGS} from './html-tags';

export interface ComponentInfo {
  name: string | null;
  source: ComponentSource;
}

const isCustomElementTag = (tag: string): boolean =>
  tag.includes('-') && !HYPHENATED_BUILTIN_TAGS.has(tag);

const readNgComponentName = (element: Element): string | null => {
  const ng = Reflect.get(globalThis, 'ng');
  if (!ng || typeof ng !== 'object') return null;
  const getOwningComponent = Reflect.get(ng, 'getOwningComponent');
  if (typeof getOwningComponent !== 'function') return null;
  try {
    const instance: unknown = getOwningComponent.call(ng, element);
    if (!instance || typeof instance !== 'object') return null;
    const name = instance.constructor?.name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    return null;
  }
};

export const resolveComponent = (element: Element): ComponentInfo => {
  const fromNg = readNgComponentName(element);
  if (fromNg) return {name: fromNg, source: 'ng-devmode'};

  const tag = element.tagName.toLowerCase();
  if (isCustomElementTag(tag)) return {name: tag, source: 'tag-heuristic'};

  return {name: null, source: null};
};

export const buildComponentChain = (element: Element): string[] => {
  const chain: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (isCustomElementTag(tag)) chain.push(tag);
    current = current.parentElement;
  }
  return chain;
};
```

- [ ] **Step 5: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export * from './component/resolve-component';
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 6 new tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): component resolution with prod-build fallback"
```

---

### Task 4: Curated computed-style collection

**Files:**
- Create: `packages/core/src/styles/style-allowlist.ts`
- Create: `packages/core/src/styles/collect-styles.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/styles/collect-styles.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `collectStyles(element: Element): Record<string, string>` (raw computed values, no token matching yet) and the `STYLE_ALLOWLIST: readonly string[]` constant.

- [ ] **Step 1: Write the failing test**

`packages/core/src/styles/collect-styles.test.ts`:

```ts
import {beforeEach, describe, expect, it} from 'vitest';
import {collectStyles} from './collect-styles';
import {STYLE_ALLOWLIST} from './style-allowlist';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('collectStyles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects only allowlisted properties', () => {
    document.body.innerHTML = '<div id="t" style="color: rgb(51,51,51); padding-top: 8px"></div>';
    const styles = collectStyles(query('#t'));
    for (const property of Object.keys(styles)) {
      expect(STYLE_ALLOWLIST).toContain(property);
    }
  });

  it('reads the computed value of an allowlisted property', () => {
    document.body.innerHTML = '<div id="t" style="padding-top: 8px"></div>';
    expect(collectStyles(query('#t'))['padding-top']).toBe('8px');
  });

  it('omits properties with an empty computed value', () => {
    document.body.innerHTML = '<div id="t"></div>';
    expect(Object.values(collectStyles(query('#t')))).not.toContain('');
  });

  it('keeps the allowlist under 50 properties so annotations stay small', () => {
    expect(STYLE_ALLOWLIST.length).toBeLessThan(50);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — cannot resolve `./collect-styles`.

- [ ] **Step 3: Implement the allowlist**

`packages/core/src/styles/style-allowlist.ts`:

```ts
export const STYLE_ALLOWLIST: readonly string[] = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
  'text-align',
  'text-transform',
  'text-decoration-line',
  'white-space',

  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'width',
  'height',
  'min-height',
  'max-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-radius',
  'gap',
  'row-gap',
  'column-gap',

  'display',
  'position',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'grid-template-columns',
  'overflow',

  'background-color',
  'box-shadow',
  'opacity',
  'z-index',
  'transform',
];
```

- [ ] **Step 4: Implement the collector**

`packages/core/src/styles/collect-styles.ts`:

```ts
import {STYLE_ALLOWLIST} from './style-allowlist';

export const collectStyles = (element: Element): Record<string, string> => {
  const computed = getComputedStyle(element);
  const styles: Record<string, string> = {};

  for (const property of STYLE_ALLOWLIST) {
    const value = computed.getPropertyValue(property).trim();
    if (value) styles[property] = value;
  }

  return styles;
};
```

- [ ] **Step 5: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export * from './styles/collect-styles';
export * from './styles/style-allowlist';
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 4 new tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(core): curated computed-style collection"
```

---

### Task 5: Design-token collection and matching

This is the feature no off-the-shelf visual bug reporter has. Get it right.

**Files:**
- Create: `packages/core/src/tokens/color.ts`
- Create: `packages/core/src/tokens/collect-tokens.ts`
- Create: `packages/core/src/tokens/match-token.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/tokens/color.test.ts`, `packages/core/src/tokens/match-token.test.ts`

**Interfaces:**
- Consumes: `StyleValue` from Task 1.
- Produces:
  - `parseColor(value: string): Rgb | null` where `Rgb = {r: number; g: number; b: number}`
  - `deltaE(a: Rgb, b: Rgb): number` (CIE76)
  - `collectTokens(doc: Document): TokenMap` where `TokenMap = Map<string, string>` mapping token name → resolved value
  - `matchToken(value: string, tokens: TokenMap): {token: string | null; tokenMatch: 'exact' | 'nearest' | null}`
  - `toStyleValues(styles: Record<string, string>, tokens: TokenMap): Record<string, StyleValue>`

- [ ] **Step 1: Write the failing colour test**

`packages/core/src/tokens/color.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {deltaE, parseColor} from './color';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#333333')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses 3-digit hex', () => {
    expect(parseColor('#333')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses rgb() with and without spaces', () => {
    expect(parseColor('rgb(51,51,51)')).toEqual({r: 51, g: 51, b: 51});
    expect(parseColor('rgb(51, 51, 51)')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses rgba() and drops alpha', () => {
    expect(parseColor('rgba(51, 51, 51, 0.5)')).toEqual({r: 51, g: 51, b: 51});
  });

  it('returns null for a non-colour', () => {
    expect(parseColor('8px')).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
  });
});

describe('deltaE', () => {
  it('is zero for identical colours', () => {
    expect(deltaE({r: 51, g: 51, b: 51}, {r: 51, g: 51, b: 51})).toBe(0);
  });

  it('is under 3 for imperceptibly close colours', () => {
    expect(deltaE({r: 51, g: 51, b: 51}, {r: 52, g: 51, b: 50})).toBeLessThan(3);
  });

  it('is well over 3 for clearly different colours', () => {
    expect(deltaE({r: 255, g: 0, b: 0}, {r: 0, g: 0, b: 255})).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — cannot resolve `./color`.

- [ ] **Step 3: Implement colour parsing and CIE76 distance**

`packages/core/src/tokens/color.ts`:

```ts
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

export const parseColor = (value: string): Rgb | null => {
  const input = value.trim();

  const hex = HEX_PATTERN.exec(input);
  if (hex?.[1]) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = RGB_PATTERN.exec(input);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return {r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3])};
  }

  return null;
};

const toLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

const pivot = (value: number): number => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);

const toLab = ({r, g, b}: Rgb): Lab => {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = pivot((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047);
  const y = pivot(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
  const z = pivot((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883);

  return {l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z)};
};

export const deltaE = (first: Rgb, second: Rgb): number => {
  const a = toLab(first);
  const b = toLab(second);
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
};
```

- [ ] **Step 4: Write the failing token-matching test**

`packages/core/src/tokens/match-token.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {matchToken, toStyleValues} from './match-token';

const tokens = new Map<string, string>([
  ['--color-text-primary', '#333333'],
  ['--color-surface-default', 'rgb(255, 255, 255)'],
  ['--spacing-2', '8px'],
]);

describe('matchToken', () => {
  it('matches an identical string exactly', () => {
    expect(matchToken('8px', tokens)).toEqual({token: '--spacing-2', tokenMatch: 'exact'});
  });

  it('matches a colour across notations exactly', () => {
    expect(matchToken('rgb(51, 51, 51)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
  });

  it('matches an imperceptibly close colour as nearest', () => {
    expect(matchToken('rgb(52, 51, 50)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'nearest',
    });
  });

  it('returns null when nothing is close', () => {
    expect(matchToken('rgb(255, 0, 0)', tokens)).toEqual({token: null, tokenMatch: null});
    expect(matchToken('13px', tokens)).toEqual({token: null, tokenMatch: null});
  });
});

describe('toStyleValues', () => {
  it('annotates each style with its token', () => {
    const result = toStyleValues({color: 'rgb(51, 51, 51)', 'font-size': '13px'}, tokens);
    expect(result['color']).toEqual({
      value: 'rgb(51, 51, 51)',
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
    expect(result['font-size']).toEqual({value: '13px', token: null, tokenMatch: null});
  });
});
```

- [ ] **Step 5: Implement matching**

`packages/core/src/tokens/match-token.ts`:

```ts
import type {StyleValue} from '../schema/annotation.schema';
import {deltaE, parseColor} from './color';

export type TokenMap = Map<string, string>;

const NEAREST_COLOR_THRESHOLD = 3;

export interface TokenMatch {
  token: string | null;
  tokenMatch: 'exact' | 'nearest' | null;
}

const NO_MATCH: TokenMatch = {token: null, tokenMatch: null};

export const matchToken = (value: string, tokens: TokenMap): TokenMatch => {
  const normalized = value.trim();

  for (const [name, tokenValue] of tokens) {
    if (tokenValue.trim() === normalized) return {token: name, tokenMatch: 'exact'};
  }

  const color = parseColor(normalized);
  if (!color) return NO_MATCH;

  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [name, tokenValue] of tokens) {
    const tokenColor = parseColor(tokenValue);
    if (!tokenColor) continue;
    const distance = deltaE(color, tokenColor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
    }
  }

  if (bestName === null) return NO_MATCH;
  if (bestDistance === 0) return {token: bestName, tokenMatch: 'exact'};
  if (bestDistance < NEAREST_COLOR_THRESHOLD) return {token: bestName, tokenMatch: 'nearest'};
  return NO_MATCH;
};

export const toStyleValues = (
  styles: Record<string, string>,
  tokens: TokenMap,
): Record<string, StyleValue> => {
  const result: Record<string, StyleValue> = {};
  for (const [property, value] of Object.entries(styles)) {
    const {token, tokenMatch} = matchToken(value, tokens);
    result[property] = {value, token, tokenMatch};
  }
  return result;
};
```

- [ ] **Step 6: Implement token collection**

`packages/core/src/tokens/collect-tokens.ts`:

```ts
import type {TokenMap} from './match-token';

const ROOT_SELECTOR_HINTS = [':root', 'html', 'body', ':host'];

const declaredTokenNames = (doc: Document): Set<string> => {
  const names = new Set<string>();

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!ROOT_SELECTOR_HINTS.some((hint) => rule.selectorText.includes(hint))) continue;
      for (let index = 0; index < rule.style.length; index += 1) {
        const property = rule.style.item(index);
        if (property.startsWith('--')) names.add(property);
      }
    }
  }

  return names;
};

export const collectTokens = (doc: Document): TokenMap => {
  const tokens: TokenMap = new Map();
  const sources = [doc.documentElement, doc.body].filter((element) => element !== null);

  for (const name of declaredTokenNames(doc)) {
    for (const source of sources) {
      const value = getComputedStyle(source).getPropertyValue(name).trim();
      if (value) {
        tokens.set(name, value);
        break;
      }
    }
  }

  return tokens;
};
```

Note the two non-obvious constraints this code encodes:
- Cross-origin stylesheets throw on `.cssRules` access — the `try/catch` degrades to fewer tokens instead of crashing.
- Token *names* come from the stylesheet text, but token *values* come from `getComputedStyle`. A token declared as `--x: var(--y)` only resolves to a real value through the cascade; reading the raw declaration would yield the unusable literal `var(--y)`.

- [ ] **Step 7: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export * from './tokens/collect-tokens';
export * from './tokens/color';
export * from './tokens/match-token';
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 13 new tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core): design-token collection and colour-aware matching"
```

---

### Task 6: Element context extraction

**Files:**
- Create: `packages/core/src/context/extract-context.ts`
- Create: `packages/core/src/picker/pick-target.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/context/extract-context.test.ts`

**Interfaces:**
- Consumes: `buildSelector` (Task 2), `resolveComponent` / `buildComponentChain` (Task 3), `collectStyles` (Task 4), `collectTokens` / `toStyleValues` (Task 5), `ElementContext` (Task 1).
- Produces: `extractContext(element: Element, tokens: TokenMap): ElementContext`, `elementAt(doc: Document, x: number, y: number): Element | null`, and the `AnnotationSink` interface.

- [ ] **Step 1: Write the failing test**

`packages/core/src/context/extract-context.test.ts`:

```ts
import {beforeEach, describe, expect, it} from 'vitest';
import {elementContextSchema} from '../schema/annotation.schema';
import {extractContext} from './extract-context';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

const tokens = new Map<string, string>([['--color-text-primary', 'rgb(51, 51, 51)']]);

describe('extractContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('produces an object that satisfies the schema', () => {
    document.body.innerHTML =
      '<soa-inform-block><p data-testid="msg" class="info">Closed today</p></soa-inform-block>';
    const context = extractContext(query('[data-testid="msg"]'), tokens);
    expect(() => elementContextSchema.parse(context)).not.toThrow();
  });

  it('carries the selector, component and chain', () => {
    document.body.innerHTML =
      '<soa-menu-page><soa-inform-block><p class="info">Closed</p></soa-inform-block></soa-menu-page>';
    const context = extractContext(query('.info'), tokens);
    expect(context.selector).toBe('soa-inform-block p.info');
    expect(context.componentName).toBe('soa-inform-block');
    expect(context.componentChain).toEqual(['soa-inform-block', 'soa-menu-page']);
  });

  it('truncates long text to 120 characters', () => {
    document.body.innerHTML = `<p class="long">${'x'.repeat(300)}</p>`;
    expect(extractContext(query('.long'), tokens).text).toHaveLength(120);
  });

  it('keeps only identifying attributes', () => {
    document.body.innerHTML =
      '<p class="info" data-testid="msg" aria-label="notice" style="color: red" onclick="x()"></p>';
    const attributes = extractContext(query('.info'), tokens).attributes;
    expect(Object.keys(attributes).sort()).toEqual(['aria-label', 'class', 'data-testid']);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — cannot resolve `./extract-context`.

- [ ] **Step 3: Implement context extraction**

`packages/core/src/context/extract-context.ts`:

```ts
import {buildComponentChain, resolveComponent} from '../component/resolve-component';
import type {ElementContext} from '../schema/annotation.schema';
import {buildSelector} from '../selector/build-selector';
import {collectStyles} from '../styles/collect-styles';
import type {TokenMap} from '../tokens/match-token';
import {toStyleValues} from '../tokens/match-token';

const MAX_TEXT_LENGTH = 120;
const IDENTIFYING_ATTRIBUTE_PREFIXES = ['data-', 'aria-'];
const IDENTIFYING_ATTRIBUTES = ['id', 'class', 'role', 'href', 'type', 'name', 'placeholder'];

const isIdentifying = (name: string): boolean =>
  IDENTIFYING_ATTRIBUTES.includes(name) ||
  IDENTIFYING_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));

const collectAttributes = (element: Element): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (isIdentifying(attribute.name)) attributes[attribute.name] = attribute.value;
  }
  return attributes;
};

export const extractContext = (element: Element, tokens: TokenMap): ElementContext => {
  const {selector, strategy, confidence} = buildSelector(element);
  const {name, source} = resolveComponent(element);
  const rect = element.getBoundingClientRect();

  return {
    selector,
    selectorStrategy: strategy,
    selectorConfidence: confidence,
    tagName: element.tagName.toLowerCase(),
    componentName: name,
    componentSource: source,
    componentChain: buildComponentChain(element),
    text: (element.textContent ?? '').trim().slice(0, MAX_TEXT_LENGTH),
    attributes: collectAttributes(element),
    box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    styles: toStyleValues(collectStyles(element), tokens),
  };
};
```

- [ ] **Step 4: Implement target picking**

`packages/core/src/picker/pick-target.ts`:

```ts
const IGNORED_TAGS: ReadonlySet<string> = new Set(['html', 'body']);

export const elementAt = (doc: Document, x: number, y: number): Element | null => {
  const found = doc.elementFromPoint(x, y);
  if (!found) return null;
  if (IGNORED_TAGS.has(found.tagName.toLowerCase())) return null;
  return found;
};
```

- [ ] **Step 5: Implement the sink contract**

`packages/core/src/session/sink.ts`:

```ts
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

export interface AnnotationSink {
  push(annotation: CaliperAnnotation, screenshot?: string): Promise<void>;
  read(): Promise<CaliperSession>;
  update(id: string, patch: Partial<CaliperAnnotation>): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
```

- [ ] **Step 6: Export from the package surface**

Append to `packages/core/src/index.ts`:

```ts
export * from './context/extract-context';
export * from './picker/pick-target';
export * from './session/sink';
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `pnpm --filter @caliper/core test`
Expected: PASS — 4 new tests, whole suite green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): element context extraction and sink contract"
```

---

## Phase 2 — `@caliper/overlay`

### Task 7: Shadow-DOM host and element highlight

**Files:**
- Create: `packages/overlay/package.json`
- Create: `packages/overlay/src/overlay-host.ts`
- Create: `packages/overlay/src/overlay.css`
- Create: `packages/overlay/src/highlight.tsx`
- Create: `packages/overlay/src/index.ts`

**Interfaces:**
- Consumes: `elementAt`, `extractContext`, `collectTokens` from `@caliper/core`.
- Produces: `mountOverlay(options: OverlayOptions): OverlayHandle` where `OverlayOptions = {onSubmit: (draft: AnnotationDraft) => void}`, `AnnotationDraft = {context: ElementContext; comment: string; severity: Severity; figmaUrl?: string}`, and `OverlayHandle = {destroy(): void; setActive(active: boolean): void}`.

- [ ] **Step 1: Create the package**

`packages/overlay/package.json`:

```json
{
  "name": "@caliper/overlay",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {".": "./src/index.ts"},
  "dependencies": {
    "@caliper/core": "workspace:*",
    "@preact/signals": "^1.3.0",
    "preact": "^10.24.0"
  }
}
```

Add to `packages/overlay/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Implement the shadow host**

`packages/overlay/src/overlay-host.ts`:

```ts
const HOST_ID = 'caliper-overlay-host';

export interface OverlayHost {
  root: ShadowRoot;
  destroy(): void;
}

export const createOverlayHost = (styles: string): OverlayHost => {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';
  document.documentElement.append(host);

  const root = host.attachShadow({mode: 'open'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  root.adoptedStyleSheets = [sheet];

  return {
    root,
    destroy: () => host.remove(),
  };
};
```

`adoptedStyleSheets` rather than an injected `<style>` tag is deliberate: pages with a strict `style-src` CSP block inline style elements, and a constructed stylesheet is not subject to that.

- [ ] **Step 3: Implement the highlight component**

`packages/overlay/src/highlight.tsx`:

```tsx
import type {Box} from '@caliper/core';

interface HighlightProps {
  box: Box | null;
  label: string | null;
}

export const Highlight = ({box, label}: HighlightProps) => {
  if (!box) return null;

  return (
    <div
      class="caliper-highlight"
      style={{left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px`}}
    >
      {label ? <span class="caliper-highlight__label">{label}</span> : null}
    </div>
  );
};
```

- [ ] **Step 4: Write the stylesheet**

`packages/overlay/src/overlay.css`:

```css
:host {
  all: initial;
}

.caliper-highlight {
  position: fixed;
  border: 2px solid #4f7cff;
  background: rgba(79, 124, 255, 0.12);
  pointer-events: none;
  box-sizing: border-box;
}

.caliper-highlight__label {
  position: absolute;
  top: -22px;
  left: 0;
  padding: 2px 6px;
  border-radius: 3px;
  background: #4f7cff;
  color: #fff;
  font: 500 11px/1.4 ui-monospace, monospace;
  white-space: nowrap;
}

.caliper-popover {
  position: fixed;
  width: 280px;
  padding: 12px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  font: 400 13px/1.5 system-ui, sans-serif;
  color: #1a1a1a;
  pointer-events: auto;
}

.caliper-popover__component {
  margin-bottom: 8px;
  font: 500 12px/1.4 ui-monospace, monospace;
  color: #4f7cff;
  word-break: break-all;
}

.caliper-popover__field {
  width: 100%;
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid #d8d8d8;
  border-radius: 4px;
  font: inherit;
  box-sizing: border-box;
}

.caliper-popover__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.caliper-popover__button {
  padding: 6px 12px;
  border: 0;
  border-radius: 4px;
  background: #4f7cff;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.caliper-popover__button--ghost {
  background: transparent;
  color: #666;
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(overlay): shadow-dom host and element highlight"
```

---

### Task 8: Annotation popover and picker wiring

**Files:**
- Create: `packages/overlay/src/popover.tsx`
- Create: `packages/overlay/src/index.ts`

**Interfaces:**
- Consumes: `Highlight` (Task 7), `createOverlayHost` (Task 7), `collectTokens` / `elementAt` / `extractContext` (Phase 1).
- Produces: `mountOverlay`, `AnnotationDraft`, `OverlayHandle` — consumed by the content script in Task 9.

- [ ] **Step 1: Implement the popover**

`packages/overlay/src/popover.tsx`:

```tsx
import type {ElementContext, Severity} from '@caliper/core';
import {useState} from 'preact/hooks';

export interface AnnotationDraft {
  context: ElementContext;
  comment: string;
  severity: Severity;
  figmaUrl?: string;
}

interface PopoverProps {
  context: ElementContext;
  onSubmit: (draft: AnnotationDraft) => void;
  onCancel: () => void;
}

const SEVERITIES: readonly Severity[] = ['blocker', 'major', 'minor', 'nitpick'];

export const Popover = ({context, onSubmit, onCancel}: PopoverProps) => {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity>('minor');
  const [figmaUrl, setFigmaUrl] = useState('');

  const submit = () => {
    if (!comment.trim()) return;
    onSubmit({
      context,
      comment: comment.trim(),
      severity,
      figmaUrl: figmaUrl.trim() || undefined,
    });
  };

  const top = Math.min(context.box.y + context.box.height + 8, window.innerHeight - 220);
  const left = Math.min(context.box.x, window.innerWidth - 300);

  return (
    <div class="caliper-popover" style={{top: `${top}px`, left: `${left}px`}}>
      <div class="caliper-popover__component">{context.componentName ?? context.selector}</div>

      <textarea
        class="caliper-popover__field"
        rows={3}
        placeholder="What is wrong?"
        value={comment}
        onInput={(event) => setComment(event.currentTarget.value)}
        autofocus
      />

      <input
        class="caliper-popover__field"
        type="url"
        placeholder="Figma URL (optional)"
        value={figmaUrl}
        onInput={(event) => setFigmaUrl(event.currentTarget.value)}
      />

      <select
        class="caliper-popover__field"
        value={severity}
        onChange={(event) => setSeverity(SEVERITIES.find((item) => item === event.currentTarget.value) ?? 'minor')}
      >
        {SEVERITIES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <div class="caliper-popover__actions">
        <button class="caliper-popover__button caliper-popover__button--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button class="caliper-popover__button" onClick={submit}>
          Save
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Implement the mount entry point**

`packages/overlay/src/index.ts`:

```ts
import {collectTokens, elementAt, extractContext} from '@caliper/core';
import type {Box, ElementContext} from '@caliper/core';
import {render} from 'preact';
import {Highlight} from './highlight';
import {createOverlayHost} from './overlay-host';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import overlayStyles from './overlay.css?inline';

export type {AnnotationDraft};

export interface OverlayOptions {
  onSubmit: (draft: AnnotationDraft) => void;
}

export interface OverlayHandle {
  destroy(): void;
  setActive(active: boolean): void;
}

export const mountOverlay = ({onSubmit}: OverlayOptions): OverlayHandle => {
  const host = createOverlayHost(overlayStyles);
  const container = document.createElement('div');
  host.root.append(container);

  const tokens = collectTokens(document);
  let active = true;
  let hovered: {box: Box; label: string | null} | null = null;
  let selected: ElementContext | null = null;

  const paint = () => {
    render(
      <>
        <Highlight box={selected ? selected.box : hovered?.box ?? null} label={hovered?.label ?? null} />
        {selected ? (
          <Popover
            context={selected}
            onSubmit={(draft) => {
              onSubmit(draft);
              selected = null;
              paint();
            }}
            onCancel={() => {
              selected = null;
              paint();
            }}
          />
        ) : null}
      </>,
      container,
    );
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active || selected) return;
    const element = elementAt(document, event.clientX, event.clientY);
    if (!element) {
      hovered = null;
      paint();
      return;
    }
    const rect = element.getBoundingClientRect();
    hovered = {
      box: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      label: element.tagName.toLowerCase(),
    };
    paint();
  };

  const onClick = (event: MouseEvent) => {
    if (!active || selected) return;
    const element = elementAt(document, event.clientX, event.clientY);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    selected = extractContext(element, tokens);
    hovered = null;
    paint();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    selected = null;
    hovered = null;
    paint();
  };

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  paint();

  return {
    destroy: () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      render(null, container);
      host.destroy();
    },
    setActive: (next: boolean) => {
      active = next;
      if (!next) {
        hovered = null;
        selected = null;
        paint();
      }
    },
  };
};
```

- [ ] **Step 3: Verify the package type-checks**

Run: `pnpm exec tsc --noEmit -p packages/overlay/tsconfig.json`
Expected: no errors. (`?inline` CSS imports need a `declarations.d.ts` in the package with `declare module '*.css?inline' {const css: string; export default css;}` — add it if tsc complains.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(overlay): annotation popover and picker wiring"
```

---

## Phase 3 — `apps/qa-extension`

### Task 9: WXT skeleton and content script

**Files:**
- Create: `apps/qa-extension/package.json`, `apps/qa-extension/wxt.config.ts`, `apps/qa-extension/tsconfig.json`
- Create: `apps/qa-extension/src/messaging/messages.ts`
- Create: `apps/qa-extension/src/entrypoints/content.ts`
- Create: `apps/qa-extension/src/entrypoints/background.ts`

**Interfaces:**
- Consumes: `mountOverlay`, `AnnotationDraft` (Task 8); `CaliperAnnotation` (Task 1).
- Produces: the message contract `CaliperMessage` used by every later extension task:
  - `{type: 'caliper/toggle'}` — background → content
  - `{type: 'caliper/annotation-created'; annotation: CaliperAnnotation; screenshot?: string}` — content → background
  - `{type: 'caliper/capture'; box: Box; dpr: number}` — content → background, resolves to a cropped data URL

- [ ] **Step 1: Create the app package**

`apps/qa-extension/package.json`:

```json
{
  "name": "@caliper/qa-extension",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip"
  },
  "dependencies": {
    "@caliper/core": "workspace:*",
    "@caliper/overlay": "workspace:*",
    "@preact/signals": "^1.3.0",
    "preact": "^10.24.0"
  },
  "devDependencies": {
    "wxt": "^0.19.0"
  }
}
```

`apps/qa-extension/wxt.config.ts`:

```ts
import {defineConfig} from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Caliper',
    description: 'Turn a clicked element into a machine-precise defect annotation.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'sidePanel', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {default_title: 'Toggle Caliper'},
    side_panel: {default_path: 'sidepanel.html'},
  },
});
```

- [ ] **Step 2: Define the message contract**

`apps/qa-extension/src/messaging/messages.ts`:

```ts
import type {Box, CaliperAnnotation} from '@caliper/core';

export interface ToggleMessage {
  type: 'caliper/toggle';
}

export interface AnnotationCreatedMessage {
  type: 'caliper/annotation-created';
  annotation: CaliperAnnotation;
  screenshot?: string;
}

export interface CaptureMessage {
  type: 'caliper/capture';
  box: Box;
  dpr: number;
}

export type CaliperMessage = ToggleMessage | AnnotationCreatedMessage | CaptureMessage;

export const isCaliperMessage = (value: unknown): value is CaliperMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type = Reflect.get(value, 'type');
  return (
    type === 'caliper/toggle' ||
    type === 'caliper/annotation-created' ||
    type === 'caliper/capture'
  );
};
```

- [ ] **Step 3: Implement the content script**

`apps/qa-extension/src/entrypoints/content.ts`:

```ts
import type {CaliperAnnotation} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {AnnotationDraft, OverlayHandle} from '@caliper/overlay';
import {isCaliperMessage} from '../messaging/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let handle: OverlayHandle | null = null;

    const toAnnotation = (draft: AnnotationDraft): CaliperAnnotation => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      comment: draft.comment,
      severity: draft.severity,
      ...(draft.figmaUrl ? {figmaUrl: draft.figmaUrl} : {}),
      page: {
        url: location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
      },
      target: draft.context,
    });

    const submit = async (draft: AnnotationDraft) => {
      const annotation = toAnnotation(draft);
      const screenshot: unknown = await chrome.runtime.sendMessage({
        type: 'caliper/capture',
        box: draft.context.box,
        dpr: window.devicePixelRatio,
      });
      await chrome.runtime.sendMessage({
        type: 'caliper/annotation-created',
        annotation,
        ...(typeof screenshot === 'string' ? {screenshot} : {}),
      });
    };

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isCaliperMessage(message) || message.type !== 'caliper/toggle') return;
      if (handle) {
        handle.destroy();
        handle = null;
        return;
      }
      handle = mountOverlay({onSubmit: (draft) => void submit(draft)});
    });
  },
});
```

- [ ] **Step 4: Implement the background skeleton**

`apps/qa-extension/src/entrypoints/background.ts`:

```ts
export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);

  chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== 'number') return;
    await chrome.sidePanel.open({tabId: tab.id});
    await chrome.tabs.sendMessage(tab.id, {type: 'caliper/toggle'});
  });
});
```

- [ ] **Step 5: Verify it loads**

Run: `pnpm --filter @caliper/qa-extension dev`
Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `apps/qa-extension/.output/chrome-mv3`.
Expected: clicking the toolbar icon on any page opens the side panel and draws a blue highlight that follows the cursor; clicking an element opens the popover.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(extension): wxt skeleton, content script and toggle"
```

---

### Task 10: Chrome storage sink

**Files:**
- Create: `apps/qa-extension/src/sinks/chrome-storage.sink.ts`
- Modify: `apps/qa-extension/src/entrypoints/background.ts`

**Interfaces:**
- Consumes: `AnnotationSink`, `CaliperSession`, `CaliperAnnotation` (Phase 1); `AnnotationCreatedMessage` (Task 9).
- Produces: `chromeStorageSink: AnnotationSink` — consumed by the side panel (Task 12) and the exporter (Task 13).

- [ ] **Step 1: Implement the sink**

`apps/qa-extension/src/sinks/chrome-storage.sink.ts`:

```ts
import type {AnnotationSink, CaliperAnnotation, CaliperSession} from '@caliper/core';
import {caliperSessionSchema} from '@caliper/core';

const STORAGE_KEY = 'caliper.session';
const CALIPER_VERSION = '0.1.0';

const emptySession = (): CaliperSession => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  caliperVersion: CALIPER_VERSION,
  annotations: [],
  assets: {},
});

const readSession = async (): Promise<CaliperSession> => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = caliperSessionSchema.safeParse(stored[STORAGE_KEY]);
  return parsed.success ? parsed.data : emptySession();
};

const writeSession = async (session: CaliperSession): Promise<void> => {
  await chrome.storage.local.set({[STORAGE_KEY]: session});
};

export const chromeStorageSink: AnnotationSink = {
  async push(annotation: CaliperAnnotation, screenshot?: string) {
    const session = await readSession();
    const assets = {...session.assets};
    let stored = annotation;

    if (screenshot) {
      const screenshotId = crypto.randomUUID();
      assets[screenshotId] = screenshot;
      stored = {...annotation, screenshotId};
    }

    await writeSession({...session, annotations: [...session.annotations, stored], assets});
  },

  read: readSession,

  async update(id: string, patch: Partial<CaliperAnnotation>) {
    const session = await readSession();
    await writeSession({
      ...session,
      annotations: session.annotations.map((item) => (item.id === id ? {...item, ...patch} : item)),
    });
  },

  async remove(id: string) {
    const session = await readSession();
    const target = session.annotations.find((item) => item.id === id);
    const assets = {...session.assets};
    if (target?.screenshotId) delete assets[target.screenshotId];

    await writeSession({
      ...session,
      annotations: session.annotations.filter((item) => item.id !== id),
      assets,
    });
  },

  async clear() {
    await writeSession(emptySession());
  },
};
```

- [ ] **Step 2: Wire it into the background**

Replace `apps/qa-extension/src/entrypoints/background.ts` with:

```ts
import {isCaliperMessage} from '../messaging/messages';
import {chromeStorageSink} from '../sinks/chrome-storage.sink';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);

  chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== 'number') return;
    await chrome.sidePanel.open({tabId: tab.id});
    await chrome.tabs.sendMessage(tab.id, {type: 'caliper/toggle'});
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCaliperMessage(message)) return false;

    if (message.type === 'caliper/annotation-created') {
      void chromeStorageSink.push(message.annotation, message.screenshot).then(() => sendResponse(true));
      return true;
    }

    return false;
  });
});
```

- [ ] **Step 3: Verify persistence**

Reload the extension, annotate one element, then in the background service worker console run:
`chrome.storage.local.get('caliper.session').then(console.log)`
Expected: an object with one entry in `annotations` and `schemaVersion: 1`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(extension): chrome storage sink"
```

---

### Task 11: Screenshot capture and crop

**Files:**
- Create: `apps/qa-extension/src/screenshot/capture.ts`
- Modify: `apps/qa-extension/src/entrypoints/background.ts`

**Interfaces:**
- Consumes: `CaptureMessage` (Task 9), `Box` (Task 1).
- Produces: `captureElement(box: Box, dpr: number): Promise<string | null>` returning a PNG data URL cropped to the element plus padding.

- [ ] **Step 1: Implement capture**

`apps/qa-extension/src/screenshot/capture.ts`:

```ts
import type {Box} from '@caliper/core';

const PADDING = 16;

export const captureElement = async (box: Box, dpr: number): Promise<string | null> => {
  const dataUrl = await chrome.tabs.captureVisibleTab({format: 'png'});
  if (!dataUrl) return null;

  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());

  const sx = Math.max(0, (box.x - PADDING) * dpr);
  const sy = Math.max(0, (box.y - PADDING) * dpr);
  const sw = Math.min(bitmap.width - sx, (box.width + PADDING * 2) * dpr);
  const sh = Math.min(bitmap.height - sy, (box.height + PADDING * 2) * dpr);

  if (sw <= 0 || sh <= 0) return null;

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({type: 'image/png'});

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};
```

`OffscreenCanvas` is used because an MV3 service worker has no DOM — a regular `<canvas>` is unavailable there.

- [ ] **Step 2: Handle the capture message**

Add to the `onMessage` listener in `background.ts`, before the final `return false`:

```ts
    if (message.type === 'caliper/capture') {
      void captureElement(message.box, message.dpr)
        .then((dataUrl) => sendResponse(dataUrl))
        .catch(() => sendResponse(null));
      return true;
    }
```

Add the import: `import {captureElement} from '../screenshot/capture';`

- [ ] **Step 3: Verify**

Annotate an element, then inspect storage:
`chrome.storage.local.get('caliper.session').then((r) => console.log(Object.keys(r['caliper.session'].assets)))`
Expected: one asset key; pasting its data URL into a new tab shows the element with 16px padding around it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(extension): element screenshot capture and crop"
```

---

### Task 12: Side panel — session list

**Files:**
- Create: `apps/qa-extension/src/entrypoints/sidepanel/index.html`
- Create: `apps/qa-extension/src/entrypoints/sidepanel/main.tsx`
- Create: `apps/qa-extension/src/entrypoints/sidepanel/App.tsx`
- Create: `apps/qa-extension/src/entrypoints/sidepanel/sidepanel.css`

**Interfaces:**
- Consumes: `chromeStorageSink` (Task 10), `CaliperSession` / `CaliperAnnotation` (Task 1).
- Produces: nothing consumed by later tasks except the mount point that Task 13 adds an export button to.

- [ ] **Step 1: Create the HTML entry**

`apps/qa-extension/src/entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Caliper</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the mount**

`apps/qa-extension/src/entrypoints/sidepanel/main.tsx`:

```tsx
import {render} from 'preact';
import {App} from './App';
import './sidepanel.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
```

- [ ] **Step 3: Implement the list**

`apps/qa-extension/src/entrypoints/sidepanel/App.tsx`:

```tsx
import type {CaliperSession} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {chromeStorageSink} from '../../sinks/chrome-storage.sink';

export const App = () => {
  const [session, setSession] = useState<CaliperSession | null>(null);

  const refresh = () => {
    void chromeStorageSink.read().then(setSession);
  };

  useEffect(() => {
    refresh();
    const listener = () => refresh();
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  if (!session) return <p class="empty">Loading…</p>;

  if (session.annotations.length === 0) {
    return <p class="empty">No defects yet. Click the toolbar icon, then click an element.</p>;
  }

  return (
    <div class="panel">
      <header class="panel__header">
        <strong>{session.annotations.length} defects</strong>
        <button onClick={() => void chromeStorageSink.clear().then(refresh)}>Clear</button>
      </header>

      <ul class="list">
        {session.annotations.map((annotation) => (
          <li key={annotation.id} class="item">
            <div class={`item__severity item__severity--${annotation.severity}`}>
              {annotation.severity}
            </div>
            <div class="item__component">
              {annotation.target.componentName ?? annotation.target.tagName}
            </div>
            <p class="item__comment">{annotation.comment}</p>
            <code class="item__selector">{annotation.target.selector}</code>
            {annotation.screenshotId && session.assets[annotation.screenshotId] ? (
              <img class="item__shot" src={session.assets[annotation.screenshotId]} alt="" />
            ) : null}
            <button class="item__remove" onClick={() => void chromeStorageSink.remove(annotation.id).then(refresh)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

- [ ] **Step 4: Write the panel stylesheet**

`apps/qa-extension/src/entrypoints/sidepanel/sidepanel.css`:

```css
body {
  margin: 0;
  font: 400 13px/1.5 system-ui, sans-serif;
  color: #1a1a1a;
}

.empty {
  padding: 16px;
  color: #666;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e6e6e6;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.item__severity {
  display: inline-block;
  margin-bottom: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  text-transform: uppercase;
}

.item__severity--blocker {
  background: #ffe0e0;
  color: #a10000;
}

.item__severity--major {
  background: #ffeccc;
  color: #a55200;
}

.item__severity--minor {
  background: #e8f0ff;
  color: #204a99;
}

.item__severity--nitpick {
  background: #f0f0f0;
  color: #555;
}

.item__component {
  font: 500 12px/1.4 ui-monospace, monospace;
  color: #4f7cff;
}

.item__comment {
  margin: 4px 0;
}

.item__selector {
  display: block;
  font: 400 11px/1.4 ui-monospace, monospace;
  color: #888;
  word-break: break-all;
}

.item__shot {
  display: block;
  max-width: 100%;
  margin-top: 8px;
  border: 1px solid #e6e6e6;
  border-radius: 4px;
}

.item__remove {
  margin-top: 8px;
}
```

- [ ] **Step 5: Verify**

Reload the extension, annotate two elements, open the side panel.
Expected: both defects listed with severity chip, component name, comment, selector and cropped screenshot; Remove deletes one; Clear empties the list.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(extension): side panel session list"
```

---

### Task 13: Export and project documentation

**Files:**
- Create: `apps/qa-extension/src/export/export-session.ts`
- Modify: `apps/qa-extension/src/entrypoints/sidepanel/App.tsx`
- Create: `README.md`, `LICENSE`
- Create: `packages/core/README.md`, `apps/qa-extension/README.md`

**Interfaces:**
- Consumes: `CaliperSession` (Task 1), `chromeStorageSink` (Task 10).
- Produces: `exportSession(session: CaliperSession, options: {withAssets: boolean}): string` and `copyToClipboard` / `downloadJson` helpers.

- [ ] **Step 1: Implement the exporter**

`apps/qa-extension/src/export/export-session.ts`:

```ts
import type {CaliperSession} from '@caliper/core';

export interface ExportOptions {
  withAssets: boolean;
}

export const exportSession = (session: CaliperSession, {withAssets}: ExportOptions): string => {
  const payload: CaliperSession = withAssets ? session : {...session, assets: {}};
  return JSON.stringify(payload, null, 2);
};

export const copyToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

export const downloadJson = (text: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
```

Assets are dropped by default: a session with ten screenshots is megabytes of base64, and the agent reading the JSON needs three numbers from each defect, not the picture.

- [ ] **Step 2: Add the export controls to the panel header**

In `App.tsx`, add the import:

```tsx
import {copyToClipboard, downloadJson, exportSession} from '../../export/export-session';
```

Replace the `<header>` block with:

```tsx
      <header class="panel__header">
        <strong>{session.annotations.length} defects</strong>
        <div class="panel__actions">
          <button onClick={() => void copyToClipboard(exportSession(session, {withAssets: false}))}>
            Copy JSON
          </button>
          <button
            onClick={() =>
              downloadJson(exportSession(session, {withAssets: true}), `caliper-${session.id}.json`)
            }
          >
            Download
          </button>
          <button onClick={() => void chromeStorageSink.clear().then(refresh)}>Clear</button>
        </div>
      </header>
```

Add to `sidepanel.css`:

```css
.panel__actions {
  display: flex;
  gap: 6px;
}
```

- [ ] **Step 3: Write the root README**

`README.md`:

````markdown
# Caliper

Turn a clicked DOM element into a machine-precise defect annotation for an AI coding agent.

Visual bug reporters produce a screenshot and a sentence. Caliper produces a stable selector, the
owning component name, and computed styles already matched against your design tokens — so an agent
can go straight to the file and the variable instead of decoding a picture.

## What is here

| Package | Description |
| --- | --- |
| `packages/core` | Element → annotation logic. No `chrome.*`, no UI framework, portable to any shell. |
| `packages/overlay` | In-page picker UI rendered in a Shadow DOM. |
| `apps/qa-extension` | Chrome MV3 extension for manual QA. |

## Quick start

```bash
pnpm install
pnpm --filter @caliper/qa-extension dev
```

Then load `apps/qa-extension/.output/chrome-mv3` via `chrome://extensions` → Load unpacked.

Click the toolbar icon to arm the picker, click an element, describe the defect, save. Open the side
panel to review and export.

## Output

```json
{
  "schemaVersion": 1,
  "annotations": [
    {
      "comment": "Padding is too small",
      "severity": "minor",
      "target": {
        "selector": "soa-inform-block p.info",
        "selectorConfidence": "medium",
        "componentName": "soa-inform-block",
        "componentSource": "tag-heuristic",
        "styles": {
          "padding-top": {"value": "4px", "token": "--spacing-1", "tokenMatch": "exact"},
          "color": {"value": "rgb(51, 51, 51)", "token": "--color-text-primary", "tokenMatch": "exact"}
        }
      }
    }
  ]
}
```

Screenshots live in a separate `assets` map keyed by `screenshotId`, and are omitted from
`Copy JSON` by default.

## License

MIT
````

- [ ] **Step 4: Add the license**

`LICENSE` — standard MIT text, copyright holder `Caliper contributors`, year `2026`.

- [ ] **Step 5: Verify the full flow**

Annotate three elements on a real Angular app, click **Copy JSON**, paste into an editor.
Expected: valid JSON, no `assets` payload, every annotation carries a selector and at least one
token-matched style property.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(extension): session export and project documentation"
```

---

## Self-Review Notes

**Spec coverage:** §3 scope → Tasks 9–13. §4 structure → Task 1. §5 model → Task 1. §6.1 selector → Task 2. §6.2 component → Task 3. §6.3 styles → Task 4. §6.4 tokens → Task 5. §7 flow and sink → Tasks 6, 10. §8 AXI output → Task 13. §9 stack → Tasks 1, 7, 9.

**Not covered by any task, intentionally deferred:** the scroll-into-view fallback for elements outside the viewport (spec §10 risk table). `captureElement` returns `null` when the crop lands outside the captured bitmap, so the annotation is still saved without a screenshot. Add the scroll pass only if this turns out to hurt in real use.
