import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('metrics.manifest', () => {
  const repoRoot = resolve(__dirname, '../../../../');
  const manifestPath = resolve(
    repoRoot,
    'apps/api/src/observability/metrics.manifest.json',
  );
  const servicePath = resolve(
    repoRoot,
    'apps/api/src/observability/observability.service.ts',
  );

  it('lists every createCounter/createHistogram instrument in observability.service', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      metrics: string[];
    };
    const serviceSource = readFileSync(servicePath, 'utf8');

    const instrumentPattern =
      /create(?:Counter|Histogram)\(\s*['"]([a-z0-9_]+)['"]/g;
    const instrumentNames = new Set<string>();
    for (const match of serviceSource.matchAll(instrumentPattern)) {
      instrumentNames.add(match[1]);
    }

    const manifestSet = new Set(manifest.metrics);
    const missingFromManifest = [...instrumentNames].filter(
      (name) => !manifestSet.has(name),
    );
    const extraInManifest = manifest.metrics.filter(
      (name) => !instrumentNames.has(name),
    );

    expect(missingFromManifest).toEqual([]);
    expect(extraInManifest).toEqual([]);
  });
});
