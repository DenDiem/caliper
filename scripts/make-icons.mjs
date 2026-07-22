import {deflateSync} from 'node:zlib';
import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const EXTENSION_ICONS = 'apps/qa-extension/src/public/icon';
const MEDIA_ICON = 'docs/media/icon.png';
const EXTENSION_SIZES = [16, 32, 48, 128];
const MEDIA_SIZE = 512;

const BG = [0x13, 0x16, 0x1d, 0xff];
const INK = [0x4f, 0xd1, 0xc5, 0xff];
const DIM = [0x2b, 0x6f, 0x6a, 0xff];

const crcTable = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const png = (size, pixels) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixels(x, y);
      const at = rowStart + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// A caliper: a beam, a fixed jaw on the left, a sliding jaw on the right, scale ticks between them.
const draw = (size) => (x, y) => {
  const u = size / 16;
  const fx = x / u;
  const fy = y / u;

  const beamTop = 7;
  const beamBottom = 9;
  const inJaw = (jawX, top, bottom) => fx >= jawX && fx < jawX + 1.4 && fy >= top && fy < bottom;

  if (fy >= beamTop && fy < beamBottom && fx >= 1.5 && fx < 14.5) return INK;
  if (inJaw(2.2, 2.5, beamTop)) return INK;
  if (inJaw(2.2, beamBottom, 13)) return INK;
  if (inJaw(10.5, 2.5, beamTop)) return INK;
  if (inJaw(10.5, beamBottom, 11.5)) return INK;

  if (size >= 32 && fy >= 4.5 && fy < 6 && fx >= 4.5 && fx < 10) {
    const tick = Math.round((fx - 4.5) * 2);
    if (tick % 2 === 0) return DIM;
  }

  return BG;
};

mkdirSync(EXTENSION_ICONS, {recursive: true});
for (const size of EXTENSION_SIZES) {
  writeFileSync(join(EXTENSION_ICONS, `${size}.png`), png(size, draw(size)));
  console.log(`${EXTENSION_ICONS}/${size}.png`);
}

writeFileSync(MEDIA_ICON, png(MEDIA_SIZE, draw(MEDIA_SIZE)));
console.log(MEDIA_ICON);
