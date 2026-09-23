/**
 * Diagnose shader-program churn during a real run.
 *
 * The 2026-09-23 performance trace showed 661 synchronous shader-link stalls in
 * 91 s (13.8 s of blocked main thread, worst single stall 964 ms), all on the
 * setProgram -> getUniforms -> onFirstUse -> getProgramInfoLog path. That only
 * happens when three.js has to link a NEW program, so the question is what keeps
 * producing new ones after warm-up.
 *
 * three.js tags every WebGLProgram with a .cacheKey, and renderer.info.programs
 * is the live list. This drives a real run with the kite bot and diffs that list
 * every second, reporting which cache keys appear and disappear.
 *
 *   node tools/shader-churn.mjs [--minutes 3] [--map kingsfield] [--char dad] [--gpu]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.wav': 'audio/wav',
};
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = n => args.includes('--' + n);

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
function findBrowser() {
  for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found');
}

const BOT = `(() => { const cs = window.__cs, p = cs.playerPos; if (!p) return;
  let vx = 0, vz = 0; const es = cs.enemies;
  for (const e of es) { const dx = p.x - e.mesh.position.x, dz = p.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz) || 1; if (d < 14) { vx += dx / d / d * 8; vz += dz / d / d * 8; } }
  if (Math.abs(p.x) > 60 || Math.abs(p.z) > 60) { vx = -p.x; vz = -p.z; }
  const m = Math.hypot(vx, vz) || 1;
  cs.keys.w = vz / m < -0.3; cs.keys.s = vz / m > 0.3; cs.keys.a = vx / m < -0.3; cs.keys.d = vx / m > 0.3; })()`;

const main = async () => {
  const { srv, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !flag('headed'), protocolTimeout: 900000,
    args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
      '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cs, { timeout: 420000 });

  await page.evaluate((c, m) => window.__cs.startRun({ character: c, map: m, ogre: 0 }),
    opt('char', 'dad'), opt('map', 'kingsfield'));

  // Snapshot the program set right after the run starts (post warm-up baseline)
  const snap = () => page.evaluate(() => {
    const r = window.__cs.three.renderer;
    return { keys: r.info.programs.map(p => p.cacheKey), calls: r.info.render.calls, tris: r.info.render.triangles,
             geos: r.info.memory.geometries, texs: r.info.memory.textures };
  });

  const minutes = parseFloat(opt('minutes', '3'));
  let prev = await snap();
  console.log(`baseline at run start: ${prev.keys.length} programs, ${prev.geos} geometries, ${prev.texs} textures\n`);
  const born = new Map(), died = new Map();   // cacheKey -> times seen created / deleted
  let churnEvents = 0;

  for (let s = 0; s < minutes * 60; s++) {
    // one second of simulation, bot input every 250 ms, and REAL rendering
    for (let k = 0; k < 4; k++) {
      await page.evaluate(b => { eval(b); }, BOT);
      await new Promise(r => setTimeout(r, 250));
      const over = await page.evaluate(() => window.__cs.state.gameOver);
      if (over) { console.log('run ended early at', s, 's'); s = 1e9; break; }
      await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); });
    }
    if (s > 1e8) break;
    const cur = await snap();
    const pset = new Set(prev.keys), cset = new Set(cur.keys);
    const added = cur.keys.filter(k => !pset.has(k));
    const removed = prev.keys.filter(k => !cset.has(k));
    if (added.length || removed.length) {
      churnEvents++;
      console.log(`${String(s).padStart(4)}s  programs ${String(prev.keys.length).padStart(3)} -> ${String(cur.keys.length).padStart(3)}  (+${added.length} / -${removed.length})  geos ${cur.geos}  texs ${cur.texs}  calls ${cur.calls}`);
      for (const k of added) born.set(k, (born.get(k) || 0) + 1);
      for (const k of removed) died.set(k, (died.get(k) || 0) + 1);
    }
    prev = cur;
  }

  console.log(`\n=== churn summary: ${churnEvents} seconds with program changes ===`);
  const fmt = k => (k || '').replace(/\s+/g, ' ').slice(0, 220);
  console.log('\n--- cache keys CREATED most often (each one is a link stall) ---');
  [...born].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, n]) => console.log(`  x${String(n).padStart(3)}  ${fmt(k)}`));
  console.log('\n--- cache keys DELETED most often (the dispose that causes the next link) ---');
  [...died].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, n]) => console.log(`  x${String(n).padStart(3)}  ${fmt(k)}`));

  await browser.close(); srv.close();
};
main().catch(e => { console.error(e); process.exit(1); });
