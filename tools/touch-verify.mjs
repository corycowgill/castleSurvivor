/**
 * Drive the on-screen touch controls the way a thumb does and report what the
 * game actually receives.
 *
 * Reproduces the two-thumb case that matters: hold the stick, drag it, then tap
 * DASH with a second finger. Prints touchState and the knight's dash flag at
 * each step, plus what document.elementFromPoint says is on top of the dash
 * button -- an overlapping element that swallows the tap looks identical to
 * broken input from the outside.
 *
 *   node tools/touch-verify.mjs [--gpu] [--headed]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.wav': 'audio/wav',
};
const args = process.argv.slice(2);
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

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

const main = async () => {
  const { srv, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(), headless: !flag('headed'), protocolTimeout: 900000,
    args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--headless=new']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  // isMobile + hasTouch already give a coarse pointer and ontouchstart; the CDP
  // media-feature override does not accept 'pointer' in this puppeteer build.
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?debug&lowq=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cs, { timeout: 420000 });
  await page.evaluate(() => window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }));
  await new Promise(r => setTimeout(r, 1500));

  // Geometry: where the controls actually are, and what sits on top of them.
  const geo = await page.evaluate(() => {
    const r = el => { const b = document.getElementById(el)?.getBoundingClientRect(); return b && { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
    const dash = r('touch-dash-btn'), mini = r('minimap');
    const topAt = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : null; };
    const overlap = dash && mini
      ? Math.max(0, Math.min(dash.x + dash.w, mini.x + mini.w) - Math.max(dash.x, mini.x)) *
        Math.max(0, Math.min(dash.y + dash.h, mini.y + mini.h) - Math.max(dash.y, mini.y))
      : 0;
    return {
      dash, mini, overlapPx: overlap,
      topOnDashCentre: dash && topAt(dash.cx, dash.cy),
      topOnDashEdge: dash && topAt(dash.cx, dash.y + 4),
      controlsVisible: getComputedStyle(document.getElementById('touch-controls')).display,
    };
  });
  console.log('\n=== layout ===');
  console.log('  dash button :', JSON.stringify(geo.dash));
  console.log('  minimap     :', JSON.stringify(geo.mini));
  console.log('  #touch-controls display:', geo.controlsVisible);
  console.log('  topmost element at dash centre:', geo.topOnDashCentre);
  console.log('  topmost element at dash top edge:', geo.topOnDashEdge);
  console.log('  dash/minimap overlap:', geo.overlapPx.toFixed(0), 'px^2');

  console.log('\n=== checks ===');
  check('dash button is the topmost element at its own centre', geo.topOnDashCentre === 'touch-dash-btn', `got ${geo.topOnDashCentre}`);
  check('dash button does not overlap the minimap', geo.overlapPx === 0, `${geo.overlapPx.toFixed(0)} px^2 overlap`);

  // Dispatch a real two-finger sequence.
  const touch = async (type, target, touches) => page.evaluate((type, target, touches) => {
    const el = document.getElementById(target);
    const mk = t => new Touch({ identifier: t.id, target: el, clientX: t.x, clientY: t.y, pageX: t.x, pageY: t.y });
    const list = touches.map(mk);
    el.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : list, targetTouches: type === 'touchend' ? [] : list, changedTouches: list,
    }));
  }, type, target, touches);

  const state = () => page.evaluate(() => {
    const p = window.__cs.players[0];
    return { stickX: +window.__cs.touchState?.stickX?.toFixed?.(2), dash: window.__cs.touchState?.dash,
             stickId: window.__cs.touchState?.stickId, dashId: window.__cs.touchState?.dashId,
             isDashing: p?.state?.isDashing, dashCooldown: +(p?.state?.dashCooldown ?? 0).toFixed(2) };
  });

  const hasState = await page.evaluate(() => !!window.__cs.touchState);
  if (!hasState) {
    console.log('\n  (touchState is not on the debug hook -- add it to inspect the input state)');
  } else {
    console.log('\n=== two-thumb sequence ===');
    await touch('touchstart', 'touch-stick-zone', [{ id: 0, x: 120, y: 600 }]);
    await touch('touchmove', 'touch-stick-zone', [{ id: 0, x: 120, y: 540 }]);
    await new Promise(r => setTimeout(r, 200));
    console.log('  after stick held+dragged:', JSON.stringify(await state()));
    const s1 = await state();
    check('stick registers movement', Math.abs(s1.stickX) > 0 || s1.stickId === 0, JSON.stringify(s1));

    // Second finger on DASH while the first is still down
    await touch('touchstart', 'touch-dash-btn', [{ id: 1, x: geo.dash.cx, y: geo.dash.cy }]);
    await new Promise(r => setTimeout(r, 120));
    const s2 = await state();
    console.log('  after dash tap (stick still held):', JSON.stringify(s2));
    check('dash flag set while the stick is held', s2.dash === true, JSON.stringify(s2));
    await new Promise(r => setTimeout(r, 400));
    const s3 = await state();
    check('knight actually dashed', s3.isDashing === true || s3.dashCooldown > 0, JSON.stringify(s3));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
};
main().catch(e => { console.error(e); process.exit(1); });
