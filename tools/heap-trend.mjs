/**
 * Heap trend across N runs, measured AFTER a forced GC.
 *
 *   node tools/heap-trend.mjs [--runs 5] [--gpu]
 *
 * The profile mode's leak check reads counters without collecting first, so
 * uncollected garbage reads as a leak. This forces GC between runs, so a rising
 * line here is a real retention and a flat line means the profile cried wolf.
 */
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav',
  '.mp3':'audio/mpeg','.css':'text/css','.ogg':'audio/ogg' };

const args = process.argv.slice(2);
const RUNS = parseInt((args[args.indexOf('--runs') + 1]) || '5', 10);
const GPU = args.includes('--gpu');

const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    const f = fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(f));
  } catch { res.writeHead(404); res.end(); }
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: [GPU ? '--use-angle=d3d11' : '--use-gl=swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/?debug`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.__cs, { timeout: 300000 });
  const client = await page.createCDPSession();

  const sample = async (label) => {
    await client.send('HeapProfiler.collectGarbage');
    await new Promise(r => setTimeout(r, 400));
    await client.send('HeapProfiler.collectGarbage');
    const m = await page.evaluate(() => {
      const r = window.__cs.three.renderer.info.memory;
      return { heap: Math.round(performance.memory.usedJSHeapSize / 1048576),
               tex: r.textures, geo: r.geometries,
               children: window.__cs.three.scene.children.length };
    });
    console.log(`  ${label.padEnd(10)} heap ${String(m.heap).padStart(5)} MB   textures ${String(m.tex).padStart(4)}   geometries ${String(m.geo).padStart(4)}   sceneChildren ${m.children}`);
    return m;
  };

  console.log(`Heap trend over ${RUNS} runs (forced GC before each sample, ${GPU ? 'GPU' : 'SwiftShader'}):\n`);
  const base = await sample('baseline');
  const rows = [];
  for (let i = 1; i <= RUNS; i++) {
    await page.evaluate(async () => { await window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); });
    // Simulate headlessly: no rendering, just advance the sim so enemies spawn and die.
    await page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
    for (let s = 0; s < 30; s++) {
      const paused = await page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
      if (paused) { await page.evaluate(() => { document.querySelector('.upgrade-btn')?.click(); }); continue; }
      await page.evaluate(() => { const cs = window.__cs; for (let j = 0; j < 8; j++) { cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } });
    }
    await page.evaluate(() => { window.__cs.setRendering(true); window.__cs.setLoopUpdates(true); window.__cs.returnToMenu(); });
    await new Promise(r => setTimeout(r, 1200));
    rows.push(await sample('after ' + i));
  }

  const first = rows[0], last = rows[rows.length - 1];
  const perRun = (last.heap - first.heap) / Math.max(1, rows.length - 1);
  console.log(`\n  baseline -> after ${RUNS}: heap ${base.heap} -> ${last.heap} MB`);
  console.log(`  steady-state growth (run 1 -> run ${RUNS}): ${(last.heap - first.heap >= 0 ? '+' : '')}${last.heap - first.heap} MB over ${rows.length - 1} runs = ${perRun.toFixed(1)} MB/run`);
  console.log(`  textures ${first.tex} -> ${last.tex}   geometries ${first.geo} -> ${last.geo}`);
  console.log(`\n  ${Math.abs(perRun) < 3 ? 'FLAT — no meaningful per-run retention.' : 'GROWING — real retention, investigate.'}`);

  await browser.close();
  srv.close();
});
