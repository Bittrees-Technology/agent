// Regenerates public/social-preview.png: the Open Graph / Twitter Card
// social-preview asset served by SOCIAL_PREVIEW_IMAGE_PATH. Written with a
// tiny dependency-free PNG encoder (zlib is a Node builtin) so the portal
// build has no image-processing dependency. Replace this generator (or the
// PNG directly) once an approved design asset exists; nothing else in the
// portal needs to change since the image is referenced by path.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

const BACKGROUND = hexToRgb('f6f7f2');
const GREEN = hexToRgb('1f6b4f');
const DARK = hexToRgb('17201c');
const GOLD = hexToRgb('8b5c10');
const MUTED = hexToRgb('5e6963');

// Minimal 5x7 bitmap font covering only the glyphs needed for the wordmark
// and tagline below (lowercase letters, space, and '.').
const FONT = {
  a: ['00000', '01110', '00001', '01111', '10001', '01111', '00000'],
  b: ['10000', '10000', '11110', '10001', '10001', '11110', '00000'],
  c: ['00000', '00000', '01111', '10000', '10000', '01111', '00000'],
  d: ['00001', '00001', '01111', '10001', '10001', '01111', '00000'],
  e: ['00000', '01110', '10001', '11111', '10000', '01111', '00000'],
  g: ['00000', '01111', '10001', '01111', '00001', '01110', '00000'],
  i: ['00100', '00000', '01100', '00100', '00100', '01110', '00000'],
  l: ['01100', '00100', '00100', '00100', '00100', '01110', '00000'],
  n: ['00000', '10110', '11001', '10001', '10001', '10001', '00000'],
  o: ['00000', '01110', '10001', '10001', '10001', '01110', '00000'],
  p: ['00000', '11110', '10001', '11110', '10000', '10000', '10000'],
  r: ['00000', '10110', '11001', '10000', '10000', '10000', '00000'],
  s: ['00000', '01111', '10000', '01110', '00001', '11110', '00000'],
  t: ['00100', '01110', '00100', '00100', '00100', '00011', '00000'],
  u: ['00000', '10001', '10001', '10001', '10001', '01111', '00000'],
  v: ['00000', '10001', '10001', '10001', '01010', '00100', '00000'],
  w: ['00000', '10001', '10001', '10101', '10101', '01010', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function makeCanvas() {
  return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => BACKGROUND));
}

function drawText(pixels, x0, y0, text, scale, color) {
  let cursor = x0;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((bit, colIndex) => {
        if (bit !== '1') return;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const px = cursor + colIndex * scale + sx;
            const py = y0 + rowIndex * scale + sy;
            if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) pixels[py][px] = color;
          }
        }
      });
    });
    cursor += 6 * scale;
  }
}

function fillRect(pixels, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, y0); y < Math.min(HEIGHT, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(WIDTH, x1); x += 1) pixels[y][x] = color;
  }
}

function fillCircle(pixels, cx, cy, radius, color) {
  for (let y = Math.max(0, cy - radius); y < Math.min(HEIGHT, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x < Math.min(WIDTH, cx + radius); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) pixels[y][x] = color;
    }
  }
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tag, data) {
  const tagBuf = Buffer.from(tag, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])), 0);
  return Buffer.concat([lengthBuf, tagBuf, data, crcBuf]);
}

function encodePng(pixels) {
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  let offset = 0;
  for (const row of pixels) {
    raw[offset] = 0; // no filter
    offset += 1;
    for (const [r, g, b] of row) {
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function buildSocialPreviewPng() {
  const pixels = makeCanvas();

  // Brand mark: a green roundel with a gold center, echoing the portal's
  // existing green/gold accent palette.
  fillCircle(pixels, 150, 195, 70, GREEN);
  fillCircle(pixels, 150, 195, 40, BACKGROUND);
  fillCircle(pixels, 150, 195, 18, GOLD);
  fillRect(pixels, 90, 260, 1110, 264, GOLD);

  drawText(pixels, 90, 300, 'agent.bittrees.org', 9, DARK);
  drawText(pixels, 90, 400, 'agent contribution portal', 5, MUTED);
  drawText(pixels, 90, 460, 'source grounded. review gated. preview.', 3, GREEN);

  return encodePng(pixels);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outPath = fileURLToPath(new URL('../public/social-preview.png', import.meta.url));
  writeFileSync(outPath, buildSocialPreviewPng());
  console.log(`wrote ${outPath}`);
}
