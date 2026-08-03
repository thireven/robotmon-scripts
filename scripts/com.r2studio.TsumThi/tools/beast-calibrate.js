// Formal Beast harness.
//
//   node tools/beast-calibrate.js
//
// Two halves, both running the real code sliced out of src/ rather than a copy:
//
//   1. The gauge reader, against the reference frames in
//      doc/screenshots/FormalBeast. This is the part worth trusting -- it feeds
//      real pixels through the real Tsum.prototype.beastReadGauges, including
//      the logical->device coordinate mapping, and reports the margins and how
//      far the probes can drift before the read breaks.
//
//   2. The round loop, over a simulated board and a simulated gauge. The board
//      is a tidy grid, so chain lengths are optimistic and round counts from
//      this are an upper bound, not a measurement. What it does check is the
//      arithmetic: that both gauges arrive at the hold line together, that a
//      long chain is truncated rather than tipping one early, that the erasures
//      -> bar estimate converges, and that nothing deadlocks short of the line.
//
// Re-run after a game update: if the gauge moves, half 1 says so immediately.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src') + path.sep;
const SHOTS = path.join(ROOT, 'doc', 'screenshots', 'FormalBeast');

function slice(file, from, to) {
  const s = fs.readFileSync(SRC + file, 'utf8').replace(/\r\n/g, '\n');
  const a = s.indexOf(from), b = s.indexOf(to, a);
  if (a < 0 || b < 0) { throw new Error('marker not found in ' + file + ': ' + (a < 0 ? from : to)); }
  return s.slice(a, b);
}

// --- minimal PNG reader (8-bit, non-interlaced) ---------------------------
function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, colour = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; colour = data[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6)) {
        throw new Error(path.basename(file) + ': need 8-bit RGB or RGBA, got depth ' + depth + ' colour ' + colour);
      }
      if (data[12] !== 0) { throw new Error(path.basename(file) + ': interlaced PNGs are not supported'); }
    } else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') { break; }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colour === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 3);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[off++];
    const line = Buffer.from(raw.slice(off, off + stride));
    off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) { v += a; }
      else if (filter === 2) { v += b; }
      else if (filter === 3) { v += (a + b) >> 1; }
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 3] = line[x * bpp];
      out[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      out[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
    prev = line;
  }
  return {w: w, h: h, px: out};
}

// --- stand-ins for the device ---------------------------------------------
let vclock = 0;
Date.now = function() { return vclock; };
const Config = {tsumWidth: 16, screenResize: 200, debugLogs: false};
const Button = {gameBubblesFrom: {y: 632}, gameBubblesTo: {y: 1532}};
let logLines = [];
function log() { logLines.push(Array.prototype.join.call(arguments, ' ')); }
function debug() {}

// getScreenshotModify hands back a view on whatever image is mounted; each
// crop remembers its own origin so getImageColor can map back into the source.
let mounted = null;
function getScreenshotModify(x, y, w, h, ow, oh) {
  vclock += (w * h > 200 * 200) ? 300 : 40;
  return {x: x, y: y, w: w, h: h, sx: w / ow, sy: h / oh};
}
function getImageColor(im, px, py) {
  const x = Math.round(im.x + px * im.sx), y = Math.round(im.y + py * im.sy);
  if (!mounted || x < 0 || y < 0 || x >= mounted.w || y >= mounted.h) { return {r: 0, g: 0, b: 0}; }
  const i = (y * mounted.w + x) * 3;
  return {r: mounted.px[i], g: mounted.px[i + 1], b: mounted.px[i + 2]};
}
function releaseImage() {}
function findTsums() { return simFindTsums(); }
let simFindTsums = function() { return []; };

function Tsum() {
  this.isRunning = true; this.debug = false; this.clearBubbles = false; this.skillLevel = 6;
  this.logs = new Proxy({}, {get: function(t, k) { return String(k); }});
}
Tsum.prototype.sleep = function(t) { vclock += t; };
Tsum.prototype.saveDebugScreenshot = function() {};
// The bubble sweep at its real cost. clearAllBubbles taps a 140-spaced grid
// from fromY down to gameBubblesTo.y, pausing delayBetweenLines after each row
// -- and that pause is most of the time it takes.
Tsum.prototype.clearAllBubbles = function(startDelay, endDelay, fromY, delayBetweenLines) {
  if (startDelay > 0) { vclock += startDelay; }
  const fy = typeof fromY === 'number' ? fromY : 632;
  let rows = 0;
  for (let by = fy; by <= 1532; by += 140) { rows++; }
  vclock += rows * 7 * 25 + rows * (delayBetweenLines || 0);
  // What a bubble clears is Beast and Belle, so it goes into both gauges --
  // which the loop has to cope with, since it moves them without a link.
  sim.fill[0] += 0.15 * sim.bubbles;
  sim.fill[1] += 0.15 * sim.bubbles;
  sim.popped += sim.bubbles;
  sim.bubbles = 0;
  if (endDelay > 0) { vclock += endDelay; }
};
Tsum.prototype.toRealXY = function(x, y) {
  return {x: Math.floor(x * this.captureGameRatio - this.gameOffsetX),
          y: Math.floor(y * this.captureGameRatio - this.gameOffsetY)};
};
Tsum.prototype.toRealXYs = function(p) { return this.toRealXY(p.x, p.y); };
Tsum.prototype.playScreenshotSquare = function() { return {x: 0, y: 0, w: 200, h: 200, sx: 1, sy: 1}; };

eval(slice('data.ts', 'var FormalBeastConfig = {', '\n};') + '\n};');
eval(slice('data.ts', 'var FormalBeastGauge = {', '\n};') + '\n};');
eval((slice('pathfinding.ts', 'function getDistance', 'function convertTo2DArray')
    + slice('pathfinding.ts', 'function distance3D', 'function detectOffsetYInGame'))
  .replace(/: TsumPath\[\]/g, '').replace(/: TsumPath/g, ''));
eval(slice('tsum.ts', '// Formal Beast\n//\n// FormalBeastConfig', 'Tsum.prototype.sampleMyTsumColor'));

// ==========================================================================
// 1. the gauge reader, against the reference frames
// ==========================================================================
function deviceFor(img) {
  const t = new Tsum();
  t.originScreenWidth = img.w; t.originScreenHeight = img.h;
  t.captureGameRatio = img.w / 1080;
  t.gameOffsetX = 0; t.gameOffsetY = 0;
  return t;
}
console.log('== Gauge reader vs doc/screenshots/FormalBeast');
const frames = fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS).filter(f => /\.png$/i.test(f)) : [];
if (!frames.length) { console.log('   no PNGs found in ' + SHOTS); }
const loaded = [];
for (const f of frames) {
  let img;
  try { img = readPng(path.join(SHOTS, f)); }
  catch (e) { console.log('   ' + f + ': ' + e.message); continue; }
  loaded.push({name: f, img: img});
  mounted = img;
  const t = deviceFor(img);
  const g = t.beastReadGauges();
  const note = img.w !== 1080
    ? '   [' + img.w + 'x' + img.h + ' -- doc/screenshots/README.md asks for 1080x1920]' : '';
  console.log('   ' + f.padEnd(26)
    + ' Beast ' + (100 * g.fill[0]).toFixed(0).padStart(3) + '%'
    + '   Belle ' + (100 * g.fill[1]).toFixed(0).padStart(3) + '%'
    + '   empty=' + (g.empty ? 'yes' : 'no ') + '  full=' + (g.full ? 'yes' : 'no ')
    + '  chrome=' + (g.chromeOk ? 'ok ' : 'DARK') + note);
}

// Per-probe brightness, which is what the thresholds actually sit between.
if (loaded.length) {
  console.log('\n   probe brightness by state (fillMinV ' + FormalBeastGauge.fillMinV
    + ', emptyMaxV ' + FormalBeastGauge.emptyMaxV + '):');
  const bins = {};
  for (const fr of loaded) {
    mounted = fr.img;
    const t = deviceFor(fr.img);
    const g = FormalBeastGauge;
    const origin = t.toRealXY(g.cropX, g.cropY);
    const span = Math.max(1, Math.round(g.probeSpan * t.captureGameRatio));
    for (const [bar, probes] of [['Beast', g.beastProbes], ['Belle', g.belleProbes]]) {
      for (const p of probes) {
        const rp = t.toRealXYs(p);
        let v = 255;
        for (let d = -1; d <= 1; d++) {
          mounted = fr.img;
          const c = getImageColor({x: origin.x, y: origin.y, sx: 1, sy: 1},
                                  rp.x - origin.x, rp.y - origin.y + d * span);
          const mx = Math.max(c.r, c.g, c.b);
          if (mx < v) { v = mx; }
        }
        const k = v >= g.fillMinV ? 'filled' : (v <= g.emptyMaxV ? 'empty track' : 'BETWEEN');
        (bins[k] = bins[k] || []).push(v);
      }
    }
  }
  for (const k of ['empty track', 'BETWEEN', 'filled']) {
    if (!bins[k]) { continue; }
    console.log('     ' + k.padEnd(12) + ' n=' + String(bins[k].length).padStart(3)
      + '   V ' + Math.min.apply(null, bins[k]) + '-' + Math.max.apply(null, bins[k]));
  }
  const empty = loaded.filter(f => /unfilled/i.test(f.name))[0];
  if (empty) {
    console.log('\n   probe drift tolerance (an empty gauge must never read as filled):');
    const g = FormalBeastGauge;
    const saved = [g.beastProbes, g.belleProbes].map(ps => ps.map(p => ({x: p.x, y: p.y})));
    let band = [];
    for (let dy = -24; dy <= 24; dy += 2) {
      g.beastProbes.forEach((p, i) => { p.y = saved[0][i].y + dy; });
      g.belleProbes.forEach((p, i) => { p.y = saved[1][i].y + dy; });
      mounted = empty.img;
      const r = deviceFor(empty.img).beastReadGauges();
      const ok = r.fill[0] === 0 && r.fill[1] === 0 && r.empty;
      if (ok) { band.push(dy); }
    }
    g.beastProbes.forEach((p, i) => { p.y = saved[0][i].y; });
    g.belleProbes.forEach((p, i) => { p.y = saved[1][i].y; });
    console.log('     clean read from dy=' + Math.min.apply(null, band)
      + ' to dy=+' + Math.max.apply(null, band) + ' logical px');

    // The activation poll runs through the skill's cut-in, so "every probe is
    // dark" must not be satisfiable by something drawn over the whole screen.
    const dark = {w: empty.img.w, h: empty.img.h, px: Buffer.alloc(empty.img.px.length, 12)};
    mounted = dark;
    const d = deviceFor(dark).beastReadGauges();
    console.log('     screen blacked out: empty=' + (d.empty ? 'yes -- GUARD FAILED' : 'no (chrome guard held)'));
  }
}

// ==========================================================================
// 2. the round loop, over a simulated board and gauge
// ==========================================================================
const COLS = 7, ROWS = 7, STEP = 26;
const HUE = [98, 22];   // Beast, Belle -- the centres measured off the frames
let cells = [], sim = {fill: [0, 0], perBar: 20, linked: [], tips: 0, gone: false,
                       bubbles: 0, popped: 0, swapMs: 0, tapAt: 0, firstLink: -1};
let rng = 12345;
function rand() { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }
function fillBoard() {
  cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    cells.push({x: 20 + c * STEP, y: 20 + r * STEP, k: rand() < 0.5 ? 0 : 1});
  }
}
simFindTsums = function() {
  vclock += 300;
  return cells.map(c => ({x: c.x, y: c.y, z: 10,
    b: HUE[c.k] + (rand() - 0.5) * 12, g: 90, r: 210}));
};
Tsum.prototype.beastReadGauges = function() {
  vclock += 120;   // a strip grab plus ~114 pixel reads
  const q = FormalBeastGauge.beastProbes.length;   // the gauge's real resolution
  // The cut-in and board swap play before the gauge is drawn; until then the
  // read sees no gauge at all, which is the same thing a skill that never fired
  // looks like. sim.swapMs is how long that takes on the device.
  if (!sim.gone && vclock - sim.tapAt < sim.swapMs) {
    return {fill: [0, 0], chromeOk: true, empty: false, full: false};
  }
  const f = sim.fill.map(v => Math.min(1, Math.round(v * q) / q));
  return {fill: f, chromeOk: true, empty: f[0] === 0 && f[1] === 0 && !sim.gone,
          full: sim.gone || (f[0] >= 1 && f[1] >= 1)};
};
Tsum.prototype.linkTsums = function(p) {
  vclock += 50 + 20 * p.length;
  if (sim.firstLink < 0) { sim.firstLink = vclock; }
  sim.linked.push(p.length);
  // Which character was linked, from where the path actually is on the board.
  const first = p[0];
  let k = 0;
  for (const c of cells) {
    if (Math.abs(c.x - (first.x + Config.tsumWidth / 2)) < 1 && Math.abs(c.y - (first.y + Config.tsumWidth / 2)) < 1) { k = c.k; break; }
  }
  sim.fill[k] += p.length / sim.perBar;
  if (sim.fill[k] >= 1) {
    sim.tips++;
    // The blast carries the other gauge over too, when it was close enough,
    // and the special animation leaves three magic bubbles behind.
    sim.fill[0] = 0; sim.fill[1] = 0;
    sim.bubbles = 3;
  }
  for (const q of p) for (const c of cells) {
    if (Math.abs(c.x - (q.x + Config.tsumWidth / 2)) < 1 && Math.abs(c.y - (q.y + Config.tsumWidth / 2)) < 1) { c.k = rand() < 0.5 ? 0 : 1; break; }
  }
};

console.log('\n== Round loop (simulated grid board: chain lengths are optimistic)');
console.log('   "swap" is how long the cut-in and board change take before the gauge');
console.log('   appears -- about 3000ms on a real device. The activation poll has to');
console.log('   outlast it, or the skill hands a live two-tsum board back to the play loop.');
function playthrough(name, level, truePerBar, swapMs, quiet) {
  logLines = []; vclock = 1000000;
  sim = {fill: [0, 0], perBar: truePerBar, linked: [], tips: 0, gone: false,
         firstLink: -1, swapMs: swapMs, tapAt: vclock, bubbles: 0, popped: 0};
  fillBoard();
  const t = new Tsum();
  t.skillLevel = level; t.debug = !quiet;
  t.captureGameRatio = 0.5; t.gameOffsetX = 0; t.gameOffsetY = 0;
  t.originScreenWidth = 540; t.originScreenHeight = 960;
  const t0 = vclock;
  const trace = [], realLog = console.log;
  console.log = function() { trace.push(Array.prototype.join.call(arguments, ' ')); };
  try { t.useFormalBeastSkill(); } finally { console.log = realLog; }
  console.log('   ' + name);
  const started = sim.firstLink < 0 ? 'never started' : ('first chain at ' + (sim.firstLink - t0) + 'ms'
    + ' (' + (sim.firstLink - t0 - swapMs) + 'ms after the board appeared)');
  console.log('     ' + started + ', window ' + (vclock - t0)
    + 'ms, tips ' + sim.tips + ', bubbles popped ' + sim.popped
    + ', chains ' + JSON.stringify(sim.linked));
  if (!quiet) { trace.forEach(l => console.log('     . ' + l)); }
  logLines.forEach(l => console.log('     > ' + l));
}
playthrough('level 6, 3s swap, estimate correct', 6, 20, 3000);
playthrough('level 6, 3s swap, estimate 40% low', 6, 28, 3000, true);
playthrough('level 1, 3s swap', 1, 20, 3000, true);
console.log('   -- swap длительность sweep: where does the activation poll give up? --'
  .replace('длительность', 'duration'));
for (const swap of [1000, 2000, 3000, 4000, 5000, 6000, 7000]) {
  playthrough('swap ' + swap + 'ms', 6, 20, swap, true);
}
(function () {
  logLines = []; vclock = 1000000;
  sim = {fill: [0, 0], perBar: 20, linked: [], tips: 0, gone: true, firstLink: -1,
         swapMs: 0, tapAt: vclock, bubbles: 0, popped: 0};
  fillBoard();
  const t = new Tsum();
  t.captureGameRatio = 0.5; t.gameOffsetX = 0; t.gameOffsetY = 0;
  const t0 = vclock;
  t.useFormalBeastSkill();
  console.log('   skill did not fire (no gauge ever appears)');
  console.log('     gave up after ' + (vclock - t0) + 'ms, chains ' + JSON.stringify(sim.linked));
  logLines.forEach(l => console.log('     > ' + l));
})();
