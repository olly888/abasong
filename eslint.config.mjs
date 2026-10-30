import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/ios/**', '**/android/**', '**/.expo/**', '**/generated.ts'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.{ts,tsx,mjs}'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', AbortSignal: 'readonly' } } },
);
