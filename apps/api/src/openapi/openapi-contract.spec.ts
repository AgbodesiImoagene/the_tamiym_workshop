import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');

function runGeneration(outputPath: string): void {
  execFileSync(
    'pnpm',
    ['--filter', 'api', 'generate:openapi', '--', '--output', outputPath],
    {
      cwd: repoRoot,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        OTEL_SDK_DISABLED: 'true',
      },
    },
  );
}

describe('OpenAPI contract generation', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ttw-openapi-'));

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates a document containing representative mounted routes', () => {
    const outputPath = join(tempDir, 'openapi.json');
    runGeneration(outputPath);

    const document = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };

    expect(document.paths['/v1/health']?.get?.operationId).toBe(
      'AppController_getHealth',
    );
    expect(document.paths['/v1/auth/login']?.post?.operationId).toBe(
      'AuthController_login',
    );
    expect(document.paths['/v1/admin/users']?.get?.operationId).toBe(
      'AdminUsersController_search',
    );
  });

  it('produces byte-identical output across consecutive generations', () => {
    const firstPath = join(tempDir, 'first.json');
    const secondPath = join(tempDir, 'second.json');

    runGeneration(firstPath);
    runGeneration(secondPath);

    const first = readFileSync(firstPath, 'utf8');
    const second = readFileSync(secondPath, 'utf8');
    expect(second).toBe(first);
  });
});
