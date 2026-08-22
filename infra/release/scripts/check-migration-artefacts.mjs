#!/usr/bin/env node
/**
 * Validate Prisma migration artefacts without database connectivity.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} root
 */
export function checkMigrationArtefacts(root) {
  const errors = [];
  const migrationsDir = path.join(root, 'apps/api/prisma/migrations');
  const schemaPath = path.join(root, 'apps/api/prisma/schema.prisma');
  const lockPath = path.join(migrationsDir, 'migration_lock.toml');

  if (!fs.existsSync(schemaPath)) {
    errors.push('Missing apps/api/prisma/schema.prisma');
    return errors;
  }

  if (!fs.existsSync(migrationsDir)) {
    errors.push('Missing apps/api/prisma/migrations directory');
    return errors;
  }

  if (!fs.existsSync(lockPath)) {
    errors.push('Missing apps/api/prisma/migrations/migration_lock.toml');
  }

  const migrationFolders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrationFolders.length === 0) {
    errors.push('No Prisma migration folders found');
    return errors;
  }

  for (const folder of migrationFolders) {
    const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
    if (!fs.existsSync(sqlPath)) {
      errors.push(`Migration folder ${folder} missing migration.sql`);
    }
  }

  return errors;
}

/**
 * @param {string} root
 */
export function countMigrations(root) {
  const migrationsDir = path.join(root, 'apps/api/prisma/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return 0;
  }
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
}

function main() {
  const root = process.cwd();
  const errors = checkMigrationArtefacts(root);
  if (errors.length > 0) {
    console.error('Migration artefact check failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(`Migration artefacts OK (${countMigrations(root)} migrations).`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
