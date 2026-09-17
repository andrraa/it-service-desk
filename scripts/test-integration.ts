import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabaseUrl } from '../tests/database';

testDatabaseUrl(process.env); // Refuse unsafe targets before starting any test.
const uploads = await mkdtemp(join(tmpdir(), 'service-desk-test-'));
try {
  const files = [...new Bun.Glob('tests/*.integration.ts').scanSync('.')].map(file => `./${file}`);
  const child = Bun.spawn([process.execPath, 'test', ...files], {
    env: { ...process.env, UPLOADS_DIR: uploads },
    stdout: 'inherit', stderr: 'inherit',
  });
  process.exitCode = await child.exited;
} finally {
  await rm(uploads, { recursive: true, force: true });
}
