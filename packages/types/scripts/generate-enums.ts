#!/usr/bin/env node
/**
 * Code generation script to extract enums from Prisma schema
 * and generate TypeScript enums for the @tamiym/types package.
 *
 * This ensures the types package stays in sync with the Prisma schema.
 *
 * Usage: pnpm --filter @tamiym/types generate:enums
 * Or: node packages/types/scripts/generate-enums.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Prisma schema (relative to this script)
const PRISMA_SCHEMA_PATH = join(__dirname, '../../../apps/api/prisma/schema.prisma');

// Path to output file
const OUTPUT_PATH = join(__dirname, '../src/enums.generated.ts');

interface EnumDefinition {
  name: string;
  values: string[];
  comment?: string;
}

/**
 * Parse Prisma schema and extract enum definitions
 */
function parsePrismaEnums(schemaContent: string): EnumDefinition[] {
  const enums: EnumDefinition[] = [];

  // Regex to match enum definitions with multiline support
  // Matches: enum EnumName { ... } including nested braces in comments
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/gs;

  let match;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];

    // Extract values (one per line, ignoring comments)
    const values: string[] = [];
    const lines = enumBody.split('\n');

    for (const line of lines) {
      // Remove comments (both // and /* */ styles)
      let cleanLine = line
        .replace(/\/\/.*$/, '') // Remove // comments
        .trim();

      // Handle inline /* */ comments
      cleanLine = cleanLine.replace(/\/\*[\s\S]*?\*\//g, '').trim();

      // Match enum values (uppercase with underscores, optionally followed by comma)
      const valueMatch = cleanLine.match(/^([A-Z_][A-Z0-9_]*)/);
      if (valueMatch) {
        const value = valueMatch[1];
        if (value && !values.includes(value)) {
          values.push(value);
        }
      }
    }

    if (values.length > 0) {
      // Try to find a comment above the enum (look for // comments in previous lines)
      const beforeEnum = schemaContent.substring(0, match.index);
      const linesBefore = beforeEnum.split('\n');
      let comment: string | undefined;

      // Look for comment in the last few lines before the enum
      // Supports both // and /// (Prisma doc comments in AST)
      for (let i = linesBefore.length - 1; i >= Math.max(0, linesBefore.length - 5); i--) {
        const commentMatch = linesBefore[i].match(/\/\/\/?\s*(.+)$/);
        if (commentMatch && !commentMatch[1].includes('enum')) {
          comment = commentMatch[1].trim();
          break;
        }
      }

      enums.push({
        name: enumName,
        values,
        comment,
      });
    }
  }

  return enums;
}

/**
 * Generate TypeScript enum code from enum definitions
 */
function generateTypeScriptEnums(enums: EnumDefinition[]): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY');
  lines.push(' *');
  lines.push(' * This file is generated from the Prisma schema.');
  lines.push(' * Run `pnpm --filter @tamiym/types generate:enums` to regenerate.');
  lines.push(' *');
  lines.push(' * Source: apps/api/prisma/schema.prisma');
  lines.push(' */');
  lines.push('');
  lines.push('/**');
  lines.push(' * Shared TypeScript enums generated from Prisma schema');
  lines.push(' *');
  lines.push(' * @see apps/api/prisma/schema.prisma for the source of truth');
  lines.push(' */');
  lines.push('');

  for (const enumDef of enums) {
    if (enumDef.comment) {
      lines.push(`// ${enumDef.comment}`);
    }
    lines.push(`export enum ${enumDef.name} {`);

    for (const value of enumDef.values) {
      // Generate: VALUE = 'VALUE'
      lines.push(`  ${value} = '${value}',`);
    }

    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('📖 Reading Prisma schema...');
    const schemaContent = readFileSync(PRISMA_SCHEMA_PATH, 'utf-8');

    console.log('🔍 Parsing enums...');
    const enums = parsePrismaEnums(schemaContent);

    if (enums.length === 0) {
      console.warn('⚠️  No enums found in Prisma schema');
      process.exit(1);
    }

    console.log(`✅ Found ${enums.length} enums:`);
    enums.forEach((e) => {
      console.log(`   - ${e.name} (${e.values.length} values)`);
    });

    console.log('📝 Generating TypeScript enums...');
    const generatedCode = generateTypeScriptEnums(enums);

    console.log('💾 Writing to file...');
    writeFileSync(OUTPUT_PATH, generatedCode, 'utf-8');

    console.log(`✅ Successfully generated ${enums.length} enums to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error('❌ Error generating enums:', error);
    process.exit(1);
  }
}

main();
