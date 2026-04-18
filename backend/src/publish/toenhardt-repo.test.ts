import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readPagesJson, writePagesJson } from './toenhardt-repo';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'toenhardt-test-'));
});

describe('readPagesJson / writePagesJson', () => {
  it('reads existing pages.json', async () => {
    const fp = path.join(tmpDir, 'pages.json');
    await fs.writeFile(fp, JSON.stringify({ foo: { title: 'Foo' } }));
    const pages = await readPagesJson(tmpDir);
    expect(pages.foo.title).toBe('Foo');
  });

  it('returns empty object if pages.json missing', async () => {
    const pages = await readPagesJson(tmpDir);
    expect(pages).toEqual({});
  });

  it('writes pages.json with pretty JSON', async () => {
    await writePagesJson(tmpDir, { bar: { title: 'Bar' } });
    const content = await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8');
    expect(content).toContain('"bar"');
    expect(content).toContain('"Bar"');
    expect(JSON.parse(content).bar.title).toBe('Bar');
  });
});
