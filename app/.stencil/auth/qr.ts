// A byte-mode QR encoder (error correction level M) rendered as one SVG path, so
// an authenticator secret is never sent to an image service and no dependency is
// needed that apps built before it would lack.

const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
  1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761,
  2876, 3034, 3196, 3362, 3532, 3706,
];
const EC_PER_BLOCK = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const BLOCKS = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

function gfMul(a: number, b: number): number {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r;
}

function rsRemainder(data: number[], degree: number): number[] {
  let gen = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
    root = gfMul(root, 2);
  }
  const rem = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i + 1], factor);
  }
  return rem;
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

function bchFormat(ecAndMask: number): number {
  let rem = ecAndMask;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((ecAndMask << 10) | rem) ^ 0x5412;
}

function bchVersion(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

type Matrix = { size: number; modules: boolean[]; reserved: boolean[] };

function setModule(m: Matrix, x: number, y: number, dark: boolean): void {
  m.modules[y * m.size + x] = dark;
  m.reserved[y * m.size + x] = true;
}

function drawFunctionPatterns(m: Matrix, version: number): void {
  const { size } = m;
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setModule(m, x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) {
    setModule(m, 6, i, i % 2 === 0);
    setModule(m, i, 6, i % 2 === 0);
  }
  const align = alignmentPositions(version, size);
  for (let i = 0; i < align.length; i++)
    for (let j = 0; j < align.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === align.length - 1) ||
        (i === align.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          setModule(m, align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  drawFormatBits(m, 0);
  if (version >= 7) {
    const bits = bchVersion(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(m, a, b, dark);
      setModule(m, b, a, dark);
    }
  }
}

function drawFormatBits(m: Matrix, mask: number): void {
  const { size } = m;
  const bits = bchFormat((0 << 3) | mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setModule(m, 8, i, bit(i));
  setModule(m, 8, 7, bit(6));
  setModule(m, 8, 8, bit(7));
  setModule(m, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setModule(m, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setModule(m, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setModule(m, 8, size - 15 + i, bit(i));
  setModule(m, 8, size - 8, true);
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function placeData(m: Matrix, data: number[]): void {
  const { size } = m;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (m.reserved[y * size + x]) continue;
        m.modules[y * size + x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

function penalty(m: Matrix): number {
  const { size, modules } = m;
  const at = (x: number, y: number) => modules[y * size + x];
  let score = 0;
  const runs = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < size; i++) {
      let run = 1;
      const history = [0, 0, 0, 0, 0, 0, 0];
      const finderLike = () =>
        history[1] === history[0] && history[2] === history[0] && history[3] === history[0] * 3 &&
        history[4] === history[0] && history[5] === history[0] && history[0] > 0 &&
        (history[6] >= history[0] * 4);
      for (let j = 1; j <= size; j++) {
        if (j < size && get(i, j) === get(i, j - 1)) {
          run++;
          continue;
        }
        if (run >= 5) score += run - 2;
        history.unshift(run);
        history.pop();
        run = 1;
        if (finderLike()) score += 40;
      }
    }
  };
  runs((i, j) => at(j, i));
  runs((i, j) => at(i, j));
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  const dark = modules.filter(Boolean).length;
  const k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
  return score + k * 10;
}

/** Encode `text` (UTF-8) and return the dark modules as an SVG path in a
 *  `size`-unit coordinate space, for `<svg viewBox="0 0 size size">`. */
export function qrSvgPath(text: string): { size: number; path: string } {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  while (version <= 40) {
    const dataCodewords = TOTAL_CODEWORDS[version - 1] - EC_PER_BLOCK[version - 1] * BLOCKS[version - 1];
    const countBits = version <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords * 8) break;
    version++;
  }
  if (version > 40) throw new Error("Text too long for a QR code");

  const total = TOTAL_CODEWORDS[version - 1];
  const ecLen = EC_PER_BLOCK[version - 1];
  const blocks = BLOCKS[version - 1];
  const dataLen = total - ecLen * blocks;
  const countBits = version <= 9 ? 8 : 16;

  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < dataLen * 8; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

  const shortBlocks = blocks - (dataLen % blocks);
  const shortLen = Math.floor(dataLen / blocks);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0, offset = 0; b < blocks; b++) {
    const len = shortLen + (b < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, ecLen));
  }
  const interleaved: number[] = [];
  for (let i = 0; i <= shortLen; i++)
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]);
  for (let i = 0; i < ecLen; i++) for (const block of ecBlocks) interleaved.push(block[i]);

  const size = version * 4 + 17;
  const m: Matrix = {
    size,
    modules: new Array(size * size).fill(false),
    reserved: new Array(size * size).fill(false),
  };
  drawFunctionPatterns(m, version);
  placeData(m, interleaved);

  let best = -1;
  let bestScore = Infinity;
  const unmasked = m.modules.slice();
  for (let mask = 0; mask < 8; mask++) {
    m.modules = unmasked.slice();
    drawFormatBits(m, mask);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!m.reserved[y * size + x] && maskBit(mask, x, y)) m.modules[y * size + x] = !m.modules[y * size + x];
    const score = penalty(m);
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
  }
  m.modules = unmasked;
  drawFormatBits(m, best);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!m.reserved[y * size + x] && maskBit(best, x, y)) m.modules[y * size + x] = !m.modules[y * size + x];

  let path = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (m.modules[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
  return { size, path };
}
