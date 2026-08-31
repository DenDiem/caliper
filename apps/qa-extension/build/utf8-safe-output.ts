// Chromium refuses to load an extension whose scripts are not `base::IsStringUTF8`, and that check is
// stricter than "decodes as UTF-8": it also rejects Unicode **non-characters**. rrweb bundles PostCSS,
// whose BOM test compares against a literal U+FFFE, and esbuild emits it as a raw character — which
// makes Chrome reject the whole extension with "It isn't UTF-8 encoded" and no hint of which character
// is at fault. Nothing in a build or a unit test catches this; only loading the extension does, which
// is why this both fixes the bytes and fails the build if any survive.
//
// Escaping the character back into a \uXXXX sequence is a no-op for the JavaScript — identical string
// value, valid inside string, template and regex literals — and makes the byte stream acceptable.
const NON_CHARACTER = /[﷐-﷯￾￿]/g;

// Structural stand-ins for Rollup's types: vite is a transitive dependency here, not a declared one,
// and importing its types would put a package in the extension's graph that nothing else needs.
interface OutputChunk {
  type: string;
  fileName: string;
  code: string;
}

interface PluginContext {
  error: (message: string) => never;
}

export interface OutputPlugin {
  name: string;
  generateBundle: (this: PluginContext, options: unknown, bundle: Record<string, unknown>) => void;
}

const isChunk = (value: unknown): value is OutputChunk =>
  typeof value === 'object' &&
  value !== null &&
  Reflect.get(value, 'type') === 'chunk' &&
  typeof Reflect.get(value, 'code') === 'string';

const escapeUnit = (unit: string): string =>
  `\\u${unit.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

export const escapeNonCharacters = (code: string): string => code.replace(NON_CHARACTER, escapeUnit);

export const findNonCharacter = (code: string): number => code.search(NON_CHARACTER);

export const utf8SafeOutput = (): OutputPlugin => ({
  name: 'caliper-utf8-safe-output',
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (!isChunk(file)) continue;

      file.code = escapeNonCharacters(file.code);

      const offending = findNonCharacter(file.code);
      if (offending !== -1) {
        this.error(
          `${file.fileName} still contains a Unicode non-character at index ${offending}; ` +
            'Chromium would refuse to load the extension.',
        );
      }
    }
  },
});
