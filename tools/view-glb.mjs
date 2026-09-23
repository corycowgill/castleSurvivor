/**
 * Render a GLB to a PNG so a model can be eyeballed without opening a viewer.
 *
 *   node tools/view-glb.mjs Game3DAssets/parkerWizardAnimated.glb [out.png]
 */
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) { console.error('usage: node tools/view-glb.mjs <file.glb> [out.png]'); process.exit(1); }
const outPng = process.argv[3] || path.join('tools', 'shots', path.basename(target, '.glb') + '-view.png');

const MIME = { '.html':'text/html','.glb':'model/gltf-binary','.js':'text/javascript','.json':'application/json' };

const VIEWER = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#20242c;overflow:hidden}canvas{display:block}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const W = 1200, H = 800;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242c);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x40381f, 1.1));
const key = new THREE.DirectionalLight(0xfff0dd, 2.2); key.position.set(4, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x9fc0ff, 0.8); fill.position.set(-5, 3, -4); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(0, 3, -7); scene.add(rim);

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(draco);

window.__ready = false;
window.__info = {};

loader.load(window.__MODEL__, (gltf) => {
  const root = gltf.scene;
  // Same clamp the game applies, so the render matches in-game shading.
  root.traverse(c => {
    if (!c.isMesh) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    for (const m of mats) {
      if (m.metalness != null) m.metalness = Math.min(m.metalness, 0.3);
      if (m.roughness != null) m.roughness = Math.min(m.roughness, 0.85);
    }
  });
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  // Three-quarter front view, slightly above the model's mid height.
  const d = radius * 2.6;
  camera.position.set(center.x + d * 0.55, center.y + radius * 0.25, center.z + d * 0.85);
  camera.lookAt(center.x, center.y, center.z);

  window.__info = {
    animations: gltf.animations.map(a => a.name),
    skinned: (() => { let n = 0; root.traverse(c => { if (c.isSkinnedMesh) n++; }); return n; })(),
    size: [size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)],
  };

  // Pose it with the idle clip so it is not a T-pose.
  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(root);
    const pick = gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0];
    mixer.clipAction(pick).play();
    mixer.update(0.6);
    window.__info.posedWith = pick.name;
  }

  renderer.render(scene, camera);
  window.__ready = true;
}, undefined, (e) => { window.__info = { error: String(e) }; window.__ready = true; });
</script></body></html>`;

const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/view') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(VIEWER.replace('window.__MODEL__', JSON.stringify('/' + target.replace(/\\/g, '/'))));
    return;
  }
  const f = path.join(ROOT, url);
  try {
    const d = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end(); }
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--use-angle=d3d11', '--no-sandbox', '--disable-gpu-sandbox'],
    protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto(`http://localhost:${port}/view`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.__ready, { timeout: 120000 });
  const info = await page.evaluate(() => window.__info);
  console.log(JSON.stringify(info, null, 1));
  fs.mkdirSync(path.dirname(path.join(ROOT, outPng)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, outPng), await page.screenshot());
  console.log('saved ' + outPng);
  await browser.close();
  srv.close();
});
