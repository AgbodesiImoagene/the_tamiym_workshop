#!/usr/bin/env node
/**
 * Generate TypeScript types from the committed OpenAPI JSON artefact.
 *
 * Usage:
 *   pnpm --filter @tamiym/types generate:openapi
 *   pnpm --filter @tamiym/types generate:openapi -- --input path/to/openapi.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultInput = join(__dirname, '../../../docs/openapi/openapi.json');
const defaultOutput = join(__dirname, '../src/openapi.generated.ts');

function parseArg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return resolve(value);
}

function buildHeader(): string {
  return [
    '/**',
    ' * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY',
    ' *',
    ' * This file is generated from docs/openapi/openapi.json.',
    ' * Run `pnpm openapi:generate` to regenerate.',
    ' *',
    ' * Source: docs/openapi/openapi.json',
    ' */',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const inputPath = parseArg('--input', defaultInput);
  const outputPath = parseArg('--output', defaultOutput);

  const schema = JSON.parse(readFileSync(inputPath, 'utf8'));
  const ast = await openapiTS(schema);
  const generated = `${buildHeader()}${astToString(ast)}\n`;

  writeFileSync(outputPath, generated, 'utf8');
  console.log(`Generated OpenAPI types at ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error('OpenAPI type generation failed:', error);
  process.exit(1);
});
