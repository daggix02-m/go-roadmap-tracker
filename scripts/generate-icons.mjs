/**
 * Rasterizes public/icon.svg into the PNG icon set required for reliable
 * PWA installability (Chrome desktop wants real PNG 192/512; maskable needs
 * its own safe-zone-padded variants). Outputs are committed to public/.
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const SVG = path.join(ROOT, 'public', 'icon.svg');

const TARGETS = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  // Apple's preferred home-screen icon size (apple-touch-icon).
  { file: 'icon-180.png', size: 180, purpose: 'any' },
  // Maskable icons get trimmed by the platform into arbitrary shapes —
  // render the full-bleed artwork at 80% inside a padded square.
  { file: 'icon-maskable-192.png', size: 192, scale: 0.8, purpose: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8, purpose: 'maskable' }
];

const svgSource = fs.readFileSync(SVG, 'utf8');

for (const t of TARGETS) {
  let input = svgSource;
  if (t.scale && t.scale < 1) {
    // Pad the artwork into a larger canvas so it never touches the edges.
    const pad = Math.round(512 / t.scale);
    input = svgSource.replace(
      /<svg([^>]*)>/,
      `<svg$1><g transform="translate(${(pad - 512) / 2}, ${(pad - 512) / 2})">`
    ).replace('</svg>', `</g></svg>`).replace(/width="512" height="512"/, `width="${pad}" height="${pad}"`);
    const buf = await sharp(Buffer.from(input)).resize(t.size, t.size).png().toBuffer();
    fs.writeFileSync(path.join(ROOT, 'public', t.file), buf);
  } else {
    const buf = await sharp(SVG, { density: 300 }).resize(t.size, t.size).png().toBuffer();
    fs.writeFileSync(path.join(ROOT, 'public', t.file), buf);
  }
  console.log(`✓ ${t.file} (${t.size}×${t.size}${t.purpose === 'maskable' ? ', maskable' : ''})`);
}
