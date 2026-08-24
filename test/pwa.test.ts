import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..').replace(/%20/g, ' ');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8')
);

describe('PWA installability contract', () => {
  it('advertises PNG icons at 192 and 512 — desktop Chrome rejects SVG-only manifests', () => {
    const png = manifest.icons.filter((i: { type: string }) => i.type === 'image/png');
    assert.ok(png.some((i: { sizes: string }) => i.sizes.includes('192')));
    assert.ok(png.some((i: { sizes: string }) => i.sizes.includes('512')));
  });

  it('separates maskable icons so Android can safely crop them', () => {
    for (const purpose of ['any', 'maskable']) {
      assert.ok(
        manifest.icons.some((i: { purpose: string }) => i.purpose === purpose),
        `missing '${purpose}' icon`
      );
    }
    // Combined 'any maskable' defeats the point of a dedicated safe zone.
    assert.ok(!manifest.icons.some((i: { purpose: string }) => i.purpose.includes(' ')));
  });

  it('every referenced icon file exists on disk', () => {
    for (const icon of manifest.icons) {
      const p = path.join(ROOT, 'public', icon.src);
      assert.ok(fs.existsSync(p), `${icon.src} missing`);
    }
  });

  it("does not force 'portrait' orientation — hostile to desktop windows", () => {
    assert.equal(manifest.orientation, undefined);
  });

  it('service worker push handler references icons that exist', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    const refs = [...sw.matchAll(/['"]\/(icon[^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(refs.length > 0);
    for (const ref of refs) {
      assert.ok(fs.existsSync(path.join(ROOT, 'public', ref)), `sw.js references missing /${ref}`);
    }
  });
});
