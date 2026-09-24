// @ts-check
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Next's own rules (core web vitals, React hooks, a11y basics) plus its
 * TypeScript set. The `@next/next` and `react-hooks` disable comments already
 * in the code were written against exactly this config.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default config;
