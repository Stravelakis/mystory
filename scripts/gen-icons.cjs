/* Draws the app mark straight to PNG. iOS will not take an SVG for
   apple-touch-icon, and adding a build-time image dependency to a journal app
   is not worth it, so the mark is drawn in code from the same geometry as the
   SVG: an oxblood ground, a brass chevron stack, and the chamfer on the
   top-left / bottom-right corners that is the Deco Noir signature. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const OUT = process.argv[2] || 'public';

// Deco Noir, colourway oxblood.
const GROUND = [26, 10, 13];
const BRASS = [198, 154, 88];
const INK = [240, 230, 218];

function png(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4, 0);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const src = a / 255;
    const dst = px[i + 3] / 255;
    const out = src + dst * (1 - src);
    if (out === 0) return;
    for (let c = 0; c < 3; c++) {
      px[i + c] = Math.round((([r, g, b][c] / 255) * src + (px[i + c] / 255) * dst * (1 - src)) / out * 255);
    }
    px[i + 3] = Math.round(out * 255);
  };

  // Ground. A maskable icon must survive being cropped to a circle, so it
  // fills the square; the plain one keeps the chamfer.
  const chamfer = maskable ? 0 : Math.round(size * 0.17);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!maskable) {
        if (x + y < chamfer) continue;
        if (x + y > 2 * (size - 1) - chamfer) continue;
      }
      set(x, y, GROUND);
    }
  }

  // The safe area inside a maskable icon is the middle 80%.
  const inset = maskable ? size * 0.2 : size * 0.16;
  const w = size - inset * 2;

  // Chevron stack — three strokes, brass, narrowing upward.
  const stroke = Math.max(2, Math.round(size * 0.062));
  for (let k = 0; k < 3; k++) {
    const half = w * (0.34 - k * 0.075);
    const apexY = inset + w * (0.26 + k * 0.175);
    const cx = size / 2;
    for (let t = -half; t <= half; t += 0.35) {
      const y = apexY + Math.abs(t) * 0.78;
      for (let s = 0; s < stroke; s++) {
        const colour = k === 0 ? INK : BRASS;
        set(Math.round(cx + t), Math.round(y + s), colour, k === 0 ? 255 : 235 - k * 45);
      }
    }
  }

  // Baseline rule.
  const ry = Math.round(inset + w * 0.90);
  for (let x = Math.round(inset + w * 0.28); x < Math.round(inset + w * 0.72); x++) {
    for (let s = 0; s < Math.max(1, Math.round(size * 0.018)); s++) set(x, ry + s, BRASS, 200);
  }

  // Encode.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, png(size, { maskable }));
  console.log(`${file} ${fs.statSync(file).size} bytes`);
}
