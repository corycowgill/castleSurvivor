// ═══════════════════════════════════════════════════════════════════════════
// Castle Survivor — VFX System
// Runtime visual effects: particles, trails, decals, dynamic lights, shaders
// ═══════════════════════════════════════════════════════════════════════════

// This module receives THREE as a parameter since the game uses CDN import maps.
// Usage: const vfx = createVFXSystem(THREE, scene, camera, renderer);

export function createVFXSystem(THREE, scene, camera, renderer) {

// ─── VFX QUALITY SETTINGS ───
const VFX_QUALITY = {
  LOW:    { particleMul: 0.3, trailRes: 4,  maxDecals: 10, maxLights: 2,  bloom: false, envParticles: false },
  MEDIUM: { particleMul: 0.7, trailRes: 8,  maxDecals: 30, maxLights: 4,  bloom: true,  envParticles: true },
  HIGH:   { particleMul: 1.0, trailRes: 16, maxDecals: 60, maxLights: 6,  bloom: true,  envParticles: true },
};
let quality = VFX_QUALITY.HIGH;

function setQuality(level) {
  quality = VFX_QUALITY[level] || VFX_QUALITY.HIGH;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 15 — PROCEDURAL VFX TEXTURE ATLAS
// ═══════════════════════════════════════════════════════════════════════════

const VFXTextures = {};

function generateTextures() {
  // Sprites are authored against a 64-unit grid but rasterised at 4x that, because
  // world-space quads can fill a lot of screen on a big explosion and a 64px source
  // turns to mush. The context is pre-scaled so the drawing code below is unchanged.
  const RESOLUTION = 4;
  const size = 64;          // author units — every draw call below speaks this grid
  const pixels = size * RESOLUTION;

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = pixels; c.height = pixels;
    // getContext returns the same context object on every call, so the scale set
    // here is still in effect when each block below fetches it again.
    c.getContext('2d').scale(RESOLUTION, RESOLUTION);
    return c;
  }

  // Writes a tiling value-noise field into the red channel, leaving alpha alone.
  // The shader raises a threshold through this to dissolve a sprite in
  // irregular holes; RGB is otherwise unused, since every sprite is drawn white
  // and the particle colour comes from the instance attribute.
  function packErosionNoise(canvas, cells = 6, octaves = 3) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // Seeded lattices, one per octave, each tiling so the field has no seams
    const lattices = [];
    for (let o = 0; o < octaves; o++) {
      const n = cells << o;
      const grid = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) grid[i] = Math.random();
      lattices.push({ n, grid });
    }
    const smooth = (x) => x * x * (3 - 2 * x);
    const sample = (lat, u, v) => {
      const { n, grid } = lat;
      const fx = u * n, fy = v * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const xa = ((x0 % n) + n) % n, xb = (xa + 1) % n;
      const ya = ((y0 % n) + n) % n, yb = (ya + 1) % n;
      const a = grid[ya * n + xa], b = grid[ya * n + xb];
      const c = grid[yb * n + xa], e = grid[yb * n + xb];
      return (a + (b - a) * tx) + ((c + (e - c) * tx) - (a + (b - a) * tx)) * ty;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h;
        let sum = 0, amp = 1, norm = 0;
        for (let o = 0; o < octaves; o++) {
          sum += sample(lattices[o], u, v) * amp;
          norm += amp;
          amp *= 0.5;
        }
        d[(y * w + x) * 4] = Math.max(1, Math.min(255, Math.round((sum / norm) * 255)));
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function canvasToTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    // Straight alpha: the particle shader premultiplies itself. Letting the upload
    // premultiply too used to darken every particle edge twice over.
    tex.premultiplyAlpha = false;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Soft circle (gaussian falloff)
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    VFXTextures.softCircle = canvasToTexture(c);
  }

  // Hard circle
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    VFXTextures.hardCircle = canvasToTexture(c);
  }

  // Spark — a hot head with a tail fading along +V.
  // The shader stretches quads along their V axis, so the sprite is authored
  // pointing "up" and the stretch does the elongating. Baking a long shape into
  // the texture as well would double up and produce rubbery streaks.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    // Tail
    const tail = ctx.createLinearGradient(0, 8, 0, 56);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    tail.addColorStop(0.85, 'rgba(255,255,255,1)');
    tail.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.quadraticCurveTo(38, 34, 32, 58);
    ctx.quadraticCurveTo(26, 34, 32, 6);
    ctx.fill();
    // Hot head
    const head = ctx.createRadialGradient(32, 48, 0, 32, 48, 11);
    head.addColorStop(0, 'rgba(255,255,255,1)');
    head.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    head.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(32, 48, 11, 0, Math.PI * 2);
    ctx.fill();
    VFXTextures.spark = canvasToTexture(c);
  }

  // Vertical streak — same idea as `streak` but fading along V, for anything
  // that is stretched along its direction of travel.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.8, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(24, 0, 16, 64);
    // Soften the long edges
    const edge = ctx.createLinearGradient(24, 0, 40, 0);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(0.5, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = edge;
    ctx.fillRect(24, 0, 16, 64);
    ctx.globalCompositeOperation = 'source-over';
    VFXTextures.streakV = canvasToTexture(c);
  }

  // Star / sparkle (4-point, with faint diagonals).
  // The old version was a broad radial gradient with faint stubby rays, so it
  // read as a soft dot. A sparkle wants the opposite balance: a very tight,
  // very bright core with long rays that taper to nothing.
  // Note: no opaque backing fill. The particle shader blends on the texture's
  // own alpha, so a full-canvas fill would paint a box in alpha (non-glow) mode.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';

    // Tapered ray, built from stacked rows so the thickness profile is explicit
    const ray = (len, halfThick, peak) => {
      const rows = 16;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows;
        const across = 1 - Math.abs(t - 0.5) * 2;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(255,255,255,${(peak * across * across).toFixed(3)})`);
        g.addColorStop(0.15, `rgba(255,255,255,${(peak * across * across * 0.75).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -halfThick + t * halfThick * 2, len, (halfThick * 2) / rows + 0.4);
      }
    };

    // Four long primary rays
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(i * Math.PI / 2);
      ray(31, 2.4, 0.95);
      ctx.restore();
    }
    // Four short diagonals at a fraction of the intensity
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(32, 32);
      ctx.rotate(Math.PI / 4 + i * Math.PI / 2);
      ray(15, 1.6, 0.34);
      ctx.restore();
    }

    // Soft halo, deliberately low so it does not swallow the rays
    const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 17);
    halo.addColorStop(0, 'rgba(255,255,255,0.4)');
    halo.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    // Tight hot core
    const core = ctx.createRadialGradient(32, 32, 0, 32, 32, 5.5);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(32, 32, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    VFXTextures.star = canvasToTexture(c);
  }

  // Streak (horizontal gradient line)
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 32, 64, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 24, 64, 16);
    // Vertical falloff
    const vGrad = ctx.createLinearGradient(0, 24, 0, 40);
    vGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    vGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 24, 64, 16);
    VFXTextures.streak = canvasToTexture(c);
  }

  // Smoke puff — billowing clumps over a radial mask.
  // Two octaves of offset blobs give the silhouette lumps to catch light on;
  // the mask then guarantees the sprite fades to nothing before the quad edge,
  // which a plain stack of gradients does not.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');

    // Octave 1 — a few large lobes define the overall shape
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const d = 5 + Math.random() * 7;
      const ox = 32 + Math.cos(a) * d;
      const oy = 32 + Math.sin(a) * d;
      const r = 13 + Math.random() * 9;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Octave 2 — smaller curls break up the smooth gradient
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 18;
      const ox = 32 + Math.cos(a) * d;
      const oy = 32 + Math.sin(a) * d;
      const r = 3 + Math.random() * 6;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.18})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Radial mask — punch the corners out so the puff reads as round
    const mask = ctx.createRadialGradient(32, 32, 14, 32, 32, 32);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(0.75, 'rgba(0,0,0,0.65)');
    mask.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    VFXTextures.smokeSoft = canvasToTexture(c);
  }

  // Animated smoke — a 4x4 flipbook. Scaling one static puff up can only ever
  // read as a growing decal; smoke needs its internal shape to churn. The lobes
  // below persist across frames and drift, so consecutive cells are related and
  // the loop plays as continuous motion rather than as a shuffle.
  {
    const COLS = 4, ROWS = 4, CELLS = COLS * ROWS;
    const atlasRes = 2;   // the atlas is large; it does not need the full 4x
    const c = document.createElement('canvas');
    c.width = COLS * size * atlasRes;
    c.height = ROWS * size * atlasRes;
    const ctx = c.getContext('2d');
    ctx.scale(atlasRes, atlasRes);

    const lobes = [];
    for (let i = 0; i < 8; i++) {
      lobes.push({
        angle: (i / 8) * Math.PI * 2 + Math.random() * 0.7,
        spin: (Math.random() - 0.5) * 1.4,
        dStart: 2 + Math.random() * 5,
        dEnd: 6 + Math.random() * 8,
        rStart: 9 + Math.random() * 6,
        rEnd: 15 + Math.random() * 8,
        alpha: 0.26 + Math.random() * 0.22,
      });
    }

    for (let f = 0; f < CELLS; f++) {
      const t = f / CELLS;   // wraps, so the last frame flows back to the first
      const ox = (f % COLS) * size;
      const oy = Math.floor(f / COLS) * size;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, size, size);
      ctx.clip();
      ctx.translate(ox, oy);

      for (const b of lobes) {
        const ang = b.angle + b.spin * t * Math.PI * 2;
        const d = b.dStart + (b.dEnd - b.dStart) * t;
        const r = b.rStart + (b.rEnd - b.rStart) * t;
        const x = 32 + Math.cos(ang) * d;
        const y = 32 + Math.sin(ang) * d;
        // Fade lobes in and out over the loop so nothing pops at the wrap
        const env = Math.sin(Math.PI * ((t + b.angle / 6.283) % 1));
        const a = b.alpha * (0.35 + 0.65 * env);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
        g.addColorStop(0.55, `rgba(255,255,255,${(a * 0.45).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const cellMask = ctx.createRadialGradient(32, 32, 13, 32, 32, 31);
      cellMask.addColorStop(0, 'rgba(0,0,0,0)');
      cellMask.addColorStop(0.72, 'rgba(0,0,0,0.6)');
      cellMask.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = cellMask;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    packErosionNoise(c, 10, 3);
    const tex = new THREE.CanvasTexture(c);
    tex.premultiplyAlpha = false;
    // No mipmaps on an atlas: minification would bleed neighbouring cells
    // into each other and show as faint ghosting of the next frame.
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    VFXTextures.smoke = tex;
  }

  // Flame — a teardrop with a hot base and a licking, uneven tip.
  // The old version was a single gradient inside a symmetrical teardrop, which
  // read as a smooth orange leaf. Real flame is brightest low down and ragged
  // where it tapers, so the tip is built from a few offset tongues.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';

    // Body
    const body = ctx.createRadialGradient(32, 44, 1, 32, 40, 26);
    body.addColorStop(0, 'rgba(255,255,255,1)');
    body.addColorStop(0.25, 'rgba(255,255,255,0.78)');
    body.addColorStop(0.62, 'rgba(255,255,255,0.3)');
    body.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(32, 3);
    ctx.bezierCurveTo(15, 22, 7, 42, 32, 61);
    ctx.bezierCurveTo(57, 42, 49, 22, 32, 3);
    ctx.fill();

    // Tongues licking off the tip
    for (let i = 0; i < 3; i++) {
      const offX = (i - 1) * 7 + (Math.random() - 0.5) * 3;
      const topY = 6 + Math.random() * 10;
      const g = ctx.createLinearGradient(0, topY, 0, 46);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(32 + offX, topY);
      ctx.quadraticCurveTo(32 + offX - 6, 32, 32 + offX * 0.4, 48);
      ctx.quadraticCurveTo(32 + offX + 6, 32, 32 + offX, topY);
      ctx.fill();
    }

    // White-hot base
    const base = ctx.createRadialGradient(32, 47, 0, 32, 47, 12);
    base.addColorStop(0, 'rgba(255,255,255,0.85)');
    base.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(32, 47, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    packErosionNoise(c, 7, 3);
    VFXTextures.flame = canvasToTexture(c);
  }

  // Impact flash — an anamorphic flare rather than a plain radial blob.
  // Flashes are drawn as camera-facing sprites, so their axes are always
  // screen-aligned; a wide horizontal streak with a tight hot core is what makes
  // a hit read as a flash of light instead of a glowing ball.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';

    // Core
    const core = ctx.createRadialGradient(32, 32, 0, 32, 32, 13);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.28, 'rgba(255,255,255,0.55)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 64, 64);

    // Soft outer bloom
    const halo = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    halo.addColorStop(0, 'rgba(255,255,255,0.32)');
    halo.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 64, 64);

    // Anamorphic streaks: long horizontal, short vertical. Built from stacked
    // rows so the vertical falloff is explicit — scaling the context instead
    // would stretch the gradient along with the geometry.
    const streak = (halfLen, halfThick, peak) => {
      const g = ctx.createLinearGradient(32 - halfLen, 0, 32 + halfLen, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      const rows = 20;
      const rowH = (halfThick * 2) / rows;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows;
        const falloff = 1 - Math.abs(t - 0.5) * 2;
        ctx.globalAlpha = peak * falloff * falloff;
        ctx.fillRect(32 - halfLen, 32 - halfThick + i * rowH, halfLen * 2, rowH + 0.4);
      }
      ctx.globalAlpha = 1;
    };
    streak(31, 2.2, 0.9);
    ctx.save();
    ctx.translate(32, 32); ctx.rotate(Math.PI / 2); ctx.translate(-32, -32);
    streak(17, 1.6, 0.6);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    VFXTextures.flash = canvasToTexture(c);
  }

  // Impact burst (spiky radial)
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.translate(32, 32);
    const spikes = 8;
    for (let i = 0; i < spikes; i++) {
      ctx.save();
      ctx.rotate((i / spikes) * Math.PI * 2);
      const grad = ctx.createLinearGradient(0, 0, 28, 0);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(28, 0);
      ctx.lineTo(0, 3);
      ctx.fill();
      ctx.restore();
    }
    // Center glow
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
    cg.addColorStop(0, 'rgba(255,255,255,1)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(-8, -8, 16, 16);
    VFXTextures.burst = canvasToTexture(c);
  }

  // Blood splatter
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const x = 32 + (Math.random() - 0.5) * 24;
      const y = 32 + (Math.random() - 0.5) * 24;
      const r = 3 + Math.random() * 8;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    VFXTextures.bloodSplat = canvasToTexture(c);
  }

  // Blood droplet
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 10);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 10, 0, Math.PI * 2);
    ctx.fill();
    VFXTextures.bloodDrop = canvasToTexture(c);
  }

  // Dust
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    for (let i = 0; i < 4; i++) {
      const x = 32 + (Math.random() - 0.5) * 16;
      const y = 32 + (Math.random() - 0.5) * 16;
      const r = 8 + Math.random() * 10;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.4)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    packErosionNoise(c, 8, 3);
    VFXTextures.dust = canvasToTexture(c);
  }

  // Rune ring — concentric circles, tick marks and angular glyphs. Drawn white
  // so it can be tinted to whatever school of magic is casting it.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineCap = 'butt';

    const circle = (r, w, a) => {
      ctx.globalAlpha = a;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(32, 32, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    circle(30.0, 1.1, 0.95);
    circle(27.6, 0.5, 0.5);
    circle(18.5, 0.8, 0.7);
    circle(16.8, 0.4, 0.4);

    // Radial tick marks between the outer pair
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const long = i % 4 === 0;
      const r0 = long ? 27.6 : 28.6, r1 = 30.0;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0);
      ctx.lineTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1);
      ctx.stroke();
    }

    // Angular glyphs around the band. Deliberately abstract — they only need to
    // read as writing at a glance, not spell anything.
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'miter';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      ctx.save();
      ctx.translate(32 + Math.cos(a) * 23.2, 32 + Math.sin(a) * 23.2);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      const strokes = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < strokes; s++) {
        const x0 = (Math.random() - 0.5) * 4.6;
        const y0 = (Math.random() - 0.5) * 5.6;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (Math.random() - 0.5) * 4.4, y0 + (Math.random() - 0.5) * 5.2);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    VFXTextures.runeRing = canvasToTexture(c);
  }

  // Inner sigil — a star polygon inside a circle, counter-rotated against the
  // outer ring so the two layers never line up.
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.0;

    const POINTS = 7, SKIP = 3, R = 21;
    ctx.beginPath();
    for (let i = 0; i <= POINTS; i++) {
      const a = ((i * SKIP) % POINTS) / POINTS * Math.PI * 2 - Math.PI / 2;
      const x = 32 + Math.cos(a) * R, y = 32 + Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(32, 32, R, 0, Math.PI * 2);
    ctx.stroke();

    // Nodes at the star's vertices
    ctx.globalAlpha = 1;
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
      const x = 32 + Math.cos(a) * R, y = 32 + Math.sin(a) * R;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 3.2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    VFXTextures.runeSigil = canvasToTexture(c);
  }

  // Ring (for shockwaves)
  {
    const c = makeCanvas(), ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.stroke();
    // Slight glow
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();
    VFXTextures.ring = canvasToTexture(c);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — GPU INSTANCED PARTICLE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// Particles are instanced camera-facing quads rather than gl_Points. This buys us
// four things Points cannot do: sizes above the ~128px driver cap, quads that stay
// on screen when their centre leaves the frustum, velocity-stretched billboards,
// and per-fragment soft fading where a particle meets the ground.
const MAX_PARTICLES = 2000;

// Old code sized particles in screen pixels via `aSize * 300.0 / -z`. Instanced
// quads are sized in world units, so preset sizes are scaled by this factor to
// land at roughly the same on-screen size they had before. Exposed as a setter
// so it can be calibrated live in the VFX lab.
let PARTICLE_WORLD_SCALE = 0.28;

function setParticleScale(v) {
  PARTICLE_WORLD_SCALE = v;
}

// Camera basis, refreshed once per frame — billboarding happens in world space so
// the fragment shader can know each corner's true height above the ground.
const _camRight = new THREE.Vector3(1, 0, 0);
const _camUp = new THREE.Vector3(0, 1, 0);
// Key light for the fake volumetric shading, matching the scene's directional
// light. Normalised in sprite space rather than world space, since the shading
// is evaluated against a hemisphere fitted to the billboard.
const _lightDir = new THREE.Vector3(-0.45, 0.35, 0.82).normalize();

const particleVertexShader = `
  attribute vec3 iPos;
  attribute vec2 iScale;      // width, height in world units
  attribute float iRot;       // roll around the view axis
  attribute vec3 iColor;
  // x = opacity, y = additive mix (1 = glow, 0 = alpha),
  // z = erosion threshold, w = fake-lighting amount
  attribute vec4 iParams;
  attribute vec3 iStretch;    // world-space stretch vector; length = extra length
  attribute vec2 iFrame;      // x = flipbook frame, y = ground-aligned amount

  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec2 uAtlas;        // (cols, rows); (0,0) means a single-frame texture

  varying vec2 vUv;
  varying vec2 vLocalUv;      // always 0..1 within the sprite, atlas or not
  varying vec3 vColor;
  varying float vOpacity;
  varying float vAdditive;
  varying float vErode;
  varying float vLit;
  varying float vWorldY;

  void main() {
    vLocalUv = uv;
    if (uAtlas.x > 0.5) {
      // Remap into the flipbook cell. Rows are flipped because the atlas is
      // drawn top-down on a canvas while UV origin is bottom-left.
      float idx = floor(iFrame.x);
      float col = mod(idx, uAtlas.x);
      float row = floor(idx / uAtlas.x);
      vUv = (uv + vec2(col, (uAtlas.y - 1.0) - row)) / uAtlas;
    } else {
      vUv = uv;
    }
    vColor = iColor;
    vOpacity = iParams.x;
    vAdditive = iParams.y;
    vErode = iParams.z;
    vLit = iParams.w;

    vec2 corner = position.xy;
    float stretchLen = length(iStretch);
    vec2 planar;

    if (stretchLen > 0.0001) {
      // Project the stretch vector onto the billboard plane and lay the quad along
      // it, so sparks and debris trail behind their own motion.
      vec3 dir = iStretch / stretchLen;
      vec2 axis = vec2(dot(dir, uCamRight), dot(dir, uCamUp));
      float axisLen = length(axis);
      axis = axisLen > 0.0001 ? axis / axisLen : vec2(0.0, 1.0);
      vec2 perp = vec2(-axis.y, axis.x);
      planar = axis * (corner.y * (iScale.y + stretchLen)) + perp * (corner.x * iScale.x);
    } else {
      float c = cos(iRot), s = sin(iRot);
      planar = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * iScale;
    }

    // Billboard basis, or the ground plane for flat-lying quads. Ground fire,
    // scorch and ripples read far better lying on the terrain than standing up
    // facing the camera.
    vec3 right = mix(uCamRight, vec3(1.0, 0.0, 0.0), iFrame.y);
    vec3 up    = mix(uCamUp,    vec3(0.0, 0.0, 1.0), iFrame.y);

    vec3 worldPos = iPos + right * planar.x + up * planar.y;
    vWorldY = worldPos.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const particleFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uSoftRange;   // world height over which particles fade into the ground
  uniform vec3 uLightDir;     // key light direction, for the fake volumetric shading

  varying vec2 vUv;
  varying vec2 vLocalUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vAdditive;
  varying float vErode;
  varying float vLit;
  varying float vWorldY;

  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    float alpha = tex.a * vOpacity;

    // Erosion dissolve. Fading a sprite uniformly is the clearest tell of a
    // hobby particle system — real smoke and fire break apart as they thin out.
    // The texture's red channel carries a noise field; raising a threshold
    // through it eats the sprite away in irregular holes instead.
    if (vErode > 0.0) {
      float n = tex.r;
      alpha *= smoothstep(vErode, vErode + 0.28, n);
    }

    // Soft particles: rather than pay for a scene depth prepass, fade against the
    // ground plane at y = 0. In a top-down game that is where virtually all of the
    // hard intersection edges come from.
    if (uSoftRange > 0.0) {
      alpha *= smoothstep(0.0, uSoftRange, vWorldY);
    }
    if (alpha < 0.004) discard;

    vec3 col = vColor;

    // Fake volumetric shading. Treating the sprite as a hemisphere and lighting
    // it from the scene's key direction gives smoke and dust a lit side and a
    // shadowed side, which is most of what makes a puff read as having volume.
    if (vLit > 0.0) {
      vec3 n = normalize(vec3((vLocalUv - 0.5) * 2.0, 0.75));
      float ndl = dot(n, uLightDir) * 0.5 + 0.5;
      col *= mix(1.0, 0.45 + ndl * 1.15, vLit);
    }

    // Bright particles over-drive so the bloom pass catches them.
    float luminance = dot(col, vec3(0.299, 0.587, 0.114));
    col *= 1.0 + luminance * 0.9 * vAdditive;

    // Hot core — glow particles whiten toward the middle. Smoke and dust skip this.
    float dist = length(vLocalUv - 0.5) * 2.0;
    col += col * smoothstep(0.7, 0.0, dist) * 0.35 * vAdditive;

    // Premultiplied output. Writing alpha 0 with the colour intact gives pure
    // additive; writing the real alpha gives a normal blend. One material, both
    // modes, chosen per particle.
    gl_FragColor = vec4(col * alpha, alpha * (1.0 - vAdditive));
  }
`;

// A ParticleGroup owns one texture and one draw call. Blending is chosen per
// particle inside the shader, so a group can hold glowing embers and soft smoke
// side by side.
const _quadPositions = new Float32Array([
  -0.5, -0.5, 0,   0.5, -0.5, 0,   0.5, 0.5, 0,   -0.5, 0.5, 0,
]);
const _quadUvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const _quadIndices = [0, 1, 2, 0, 2, 3];

class ParticleGroup {
  constructor(texture, maxCount = 500, softRange = 0.35, atlas = null) {
    this.maxCount = maxCount;
    this.count = 0;
    this.particles = new Array(maxCount);
    this.defaultAdditive = 1;

    // Per-instance buffers
    const iPos = new Float32Array(maxCount * 3);
    const iScale = new Float32Array(maxCount * 2);
    const iRot = new Float32Array(maxCount);
    const iColor = new Float32Array(maxCount * 3);
    const iParams = new Float32Array(maxCount * 4);
    const iStretch = new Float32Array(maxCount * 3);
    const iFrame = new Float32Array(maxCount * 2);
    // How many flipbook frames this group's texture holds, 0 for a plain sprite
    this.frameCount = atlas ? atlas[0] * atlas[1] : 0;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(_quadPositions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(_quadUvs, 2));
    geo.setIndex(_quadIndices);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(iScale, 2));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 1));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iParams', new THREE.InstancedBufferAttribute(iParams, 4));
    geo.setAttribute('iStretch', new THREE.InstancedBufferAttribute(iStretch, 3));
    geo.setAttribute('iFrame', new THREE.InstancedBufferAttribute(iFrame, 2));
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: texture },
        uSoftRange: { value: softRange },
        uCamRight: { value: _camRight },
        uCamUp: { value: _camUp },
        uAtlas: { value: new THREE.Vector2(atlas ? atlas[0] : 0, atlas ? atlas[1] : 0) },
        uLightDir: { value: _lightDir },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      // Premultiplied-alpha blending — see the fragment shader for why.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    this.points = new THREE.Mesh(geo, mat);
    this.points.frustumCulled = false;
    this.points.matrixAutoUpdate = false;
    this.geo = geo;
    this.posAttr = geo.getAttribute('iPos');
    this.scaleAttr = geo.getAttribute('iScale');
    this.rotAttr = geo.getAttribute('iRot');
    this.colorAttr = geo.getAttribute('iColor');
    this.paramAttr = geo.getAttribute('iParams');
    this.stretchAttr = geo.getAttribute('iStretch');
    this.frameAttr = geo.getAttribute('iFrame');

    scene.add(this.points);
  }

  emit(config) {
    if (this.count >= this.maxCount) return null;
    const i = this.count++;
    const p = {
      // Position
      x: config.x || 0, y: config.y || 0, z: config.z || 0,
      // Velocity
      vx: config.vx || 0, vy: config.vy || 0, vz: config.vz || 0,
      // Acceleration
      ax: config.ax || 0, ay: config.ay || 0, az: config.az || 0,
      gravity: config.gravity || 0,
      drag: config.drag || 0,
      // Lifetime
      life: config.life || 1, maxLife: config.life || 1,
      // Size (world units)
      sizeStart: (config.sizeStart || 1) * PARTICLE_WORLD_SCALE,
      sizeEnd: (config.sizeEnd ?? config.sizeStart ?? 1) * PARTICLE_WORLD_SCALE,
      // Width relative to height — <1 gives slivers, >1 gives wide streaks
      aspect: config.aspect ?? 1,
      // Opacity
      opacityStart: config.opacityStart ?? 1, opacityEnd: config.opacityEnd ?? 0,
      // Fraction of life spent ramping in, so nothing pops into existence
      fadeIn: config.fadeIn ?? 0.08,
      // Shaping exponents: >1 holds the start value longer, <1 rushes away from it
      sizeEase: config.sizeEase ?? 1,
      opacityEase: config.opacityEase ?? 1,
      // Rotation
      rotation: config.rotation || 0, rotSpeed: config.rotSpeed || 0,
      // Blend mode, 1 = additive glow, 0 = alpha
      additive: config.additive ?? (config.blending !== undefined
        ? (config.blending === THREE.NormalBlending ? 0 : 1)
        : this.defaultAdditive),
      // Velocity stretching — world length added per unit of speed
      stretch: config.stretch || 0,
      // Swirling drift, gives smoke and embers a non-ballistic feel
      turbulence: config.turbulence || 0,
      turbPhase: Math.random() * 6.283,
      // Dissolve strength. The threshold sweeps up over the particle's life, so
      // it breaks apart in holes rather than fading out as a whole.
      erode: config.erode || 0,
      // How strongly the fake hemisphere lighting applies, 0 for glows
      lit: config.lit || 0,
      // 1 lies the quad flat on the ground instead of facing the camera
      flat: config.flat || 0,
      // Color
      r: 1, g: 1, b: 1,
      // Floor collision
      floorY: config.floorY ?? -Infinity,
      bounceDecay: config.bounceDecay || 0.3,
    };
    // Parse color
    if (config.color !== undefined) {
      if (typeof config.color === 'number') {
        p.r = ((config.color >> 16) & 0xff) / 255;
        p.g = ((config.color >> 8) & 0xff) / 255;
        p.b = (config.color & 0xff) / 255;
      } else if (config.color.r !== undefined) {
        p.r = config.color.r; p.g = config.color.g; p.b = config.color.b;
      }
    }
    // Optional end color for lerp
    if (config.colorEnd !== undefined) {
      const ce = config.colorEnd;
      p.rEnd = ((ce >> 16) & 0xff) / 255;
      p.gEnd = ((ce >> 8) & 0xff) / 255;
      p.bEnd = (ce & 0xff) / 255;
    }
    // Per-particle brightness variation. A burst where every particle is exactly
    // the same colour reads as flat and synthetic; a little spread makes the
    // same emitter look like many separate embers. Applied by default so every
    // effect benefits without touching its call site.
    const jitter = config.colorJitter ?? 0.13;
    if (jitter > 0) {
      const j = 1 + (Math.random() - 0.5) * 2 * jitter;
      p.r *= j; p.g *= j; p.b *= j;
      if (p.rEnd !== undefined) { p.rEnd *= j; p.gEnd *= j; p.bEnd *= j; }
    }
    // Multi-stop colour ramp. Two-point lerps cannot express how fire actually
    // behaves — white-hot, then yellow, then orange, then a dark smoky red —
    // and that progression is most of what sells a flame.
    if (config.colorStops) {
      p.stops = config.colorStops.map((hex) => {
        const j = jitter > 0 ? 1 + (Math.random() - 0.5) * 2 * jitter * 0.5 : 1;
        return {
          r: (((hex >> 16) & 0xff) / 255) * j,
          g: (((hex >> 8) & 0xff) / 255) * j,
          b: ((hex & 0xff) / 255) * j,
        };
      });
    }

    // Flipbook playback runs once across the particle's life
    p.frames = this.frameCount;
    this.particles[i] = p;
    return p;
  }

  update(dt, elapsed) {
    const pos = this.posAttr.array;
    const scl = this.scaleAttr.array;
    const rot = this.rotAttr.array;
    const col = this.colorAttr.array;
    const par = this.paramAttr.array;
    const str = this.stretchAttr.array;
    const frm = this.frameAttr.array;

    let writeIdx = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;

      // Physics
      if (p.drag > 0) {
        const d = 1 - p.drag * dt;
        p.vx *= d; p.vy *= d; p.vz *= d;
      }
      p.vx += p.ax * dt;
      p.vy += (p.ay - p.gravity) * dt;
      p.vz += p.az * dt;

      let mx = p.vx, my = p.vy, mz = p.vz;
      if (p.turbulence > 0) {
        // Cheap divergence-free-ish swirl: orthogonal sines on a per-particle phase.
        const ph = p.turbPhase + elapsed * 2.2;
        mx += Math.sin(ph * 1.3 + p.y * 1.7) * p.turbulence;
        my += Math.sin(ph * 0.9 + p.x * 1.1) * p.turbulence * 0.4;
        mz += Math.cos(ph * 1.1 + p.x * 1.5) * p.turbulence;
      }
      p.x += mx * dt;
      p.y += my * dt;
      p.z += mz * dt;

      // Floor bounce
      if (p.y < p.floorY) {
        p.y = p.floorY;
        p.vy = -p.vy * p.bounceDecay;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }

      p.rotation += p.rotSpeed * dt;

      // Normalised age, then shaped independently for size and opacity
      const t = 1 - (p.life / p.maxLife);
      const ts = p.sizeEase === 1 ? t : Math.pow(t, p.sizeEase);
      const to = p.opacityEase === 1 ? t : Math.pow(t, p.opacityEase);

      const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * ts;
      let opacity = p.opacityStart + (p.opacityEnd - p.opacityStart) * to;
      if (p.fadeIn > 0 && t < p.fadeIn) opacity *= t / p.fadeIn;

      const i2 = writeIdx * 2;
      const i3 = writeIdx * 3;
      const i4 = writeIdx * 4;
      pos[i3] = p.x;
      pos[i3 + 1] = p.y;
      pos[i3 + 2] = p.z;
      scl[i2] = size * p.aspect;
      scl[i2 + 1] = size;
      rot[writeIdx] = p.rotation;
      par[i4] = opacity;
      par[i4 + 1] = p.additive;
      // Sweep the dissolve threshold up over the back half of the life, so the
      // particle holds its shape first and then crumbles.
      par[i4 + 2] = p.erode > 0 ? Math.max(0, (t - 0.25) / 0.75) * p.erode : 0;
      par[i4 + 3] = p.lit;
      frm[i2] = p.frames > 0 ? Math.min(p.frames - 1, Math.floor(t * p.frames)) : 0;
      frm[i2 + 1] = p.flat;

      if (p.stretch > 0) {
        // Feed the shader the velocity scaled into world length. Longer = faster.
        str[i3] = p.vx * p.stretch;
        str[i3 + 1] = p.vy * p.stretch;
        str[i3 + 2] = p.vz * p.stretch;
      } else {
        str[i3] = 0; str[i3 + 1] = 0; str[i3 + 2] = 0;
      }

      // Colour: a multi-stop ramp if one was given, else the two-point lerp
      if (p.stops !== undefined) {
        const n = p.stops.length - 1;
        const f = t * n;
        const si = Math.min(n - 1, Math.floor(f));
        const k = f - si;
        const a = p.stops[si], b = p.stops[si + 1];
        col[i3] = a.r + (b.r - a.r) * k;
        col[i3 + 1] = a.g + (b.g - a.g) * k;
        col[i3 + 2] = a.b + (b.b - a.b) * k;
      } else if (p.rEnd !== undefined) {
        col[i3] = p.r + (p.rEnd - p.r) * t;
        col[i3 + 1] = p.g + (p.gEnd - p.g) * t;
        col[i3 + 2] = p.b + (p.bEnd - p.b) * t;
      } else {
        col[i3] = p.r;
        col[i3 + 1] = p.g;
        col[i3 + 2] = p.b;
      }

      if (writeIdx !== i) this.particles[writeIdx] = p;
      writeIdx++;
    }
    this.count = writeIdx;

    this.geo.instanceCount = writeIdx;
    this.points.visible = writeIdx > 0;
    if (writeIdx > 0) {
      this.posAttr.needsUpdate = true;
      this.scaleAttr.needsUpdate = true;
      this.rotAttr.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
      this.paramAttr.needsUpdate = true;
      this.stretchAttr.needsUpdate = true;
      this.frameAttr.needsUpdate = true;
    }
  }

  dispose() {
    scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}

// Named particle groups (lazy-created)
const particleGroups = {};

// How far above the ground each kind of particle fades out. Big soft puffs need a
// generous range or they slice into the terrain; hard little bits like sparks and
// debris actually rest on the ground, so they must not fade at all.
// Kept deliberately small. The camera looks down at roughly 50 degrees, so a
// billboard's world-Y extent is only about 0.6 of its height — a large range
// here dims ground-hugging effects like footstep dust into nothing rather than
// just softening where they meet the terrain.
const SOFT_RANGES = {
  smoke: 0.40,
  smokeSoft: 0.40,
  burst: 0,
  dust: 0.25,
  softCircle: 0.20,
  flame: 0.15,
  spark: 0,
  streakV: 0,
  star: 0,
  hardCircle: 0,
  bloodDrop: 0,
  streak: 0,
};

// Textures that are flipbook atlases, as [cols, rows]
const ATLASES = {
  smoke: [4, 4],
};

function getGroup(textureName, blending) {
  const key = textureName + '_' + (blending === THREE.NormalBlending ? 'N' : 'A');
  if (!particleGroups[key]) {
    const tex = VFXTextures[textureName] || VFXTextures.softCircle;
    const group = new ParticleGroup(tex, 800, SOFT_RANGES[textureName] ?? 0.15, ATLASES[textureName] || null);
    group.defaultAdditive = blending === THREE.NormalBlending ? 0 : 1;
    particleGroups[key] = group;
  }
  return particleGroups[key];
}

// Convenience: emit N particles with randomized config
function emitBurst(groupKey, count, baseConfig, randomize) {
  count = Math.ceil(count * quality.particleMul);
  const group = typeof groupKey === 'string'
    ? getGroup(groupKey, baseConfig.blending || THREE.AdditiveBlending)
    : groupKey;

  for (let i = 0; i < count; i++) {
    const cfg = { ...baseConfig };
    if (randomize) randomize(cfg, i, count);
    group.emit(cfg);
  }
}

// ─── PARTICLE PRESETS ───

function preset_sparks(pos, color = 0xffcc44, count = 8, speed = 6) {
  emitBurst('spark', count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color,
    sizeStart: 0.45, sizeEnd: 0.04,
    life: 0.3, gravity: 10,
    opacityStart: 1, opacityEnd: 0,
    floorY: 0.05,
    bounceDecay: 0.25,
    // Sparks draw as slivers smeared along their own velocity — the single
    // biggest readability win over round billboards.
    aspect: 0.3, stretch: 0.045,
    opacityEase: 2.2,   // hold full brightness, then drop off fast
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    const vy = speed * (0.5 + Math.random() * 0.8);
    cfg.vx = Math.cos(angle) * s;
    cfg.vy = vy;
    cfg.vz = Math.sin(angle) * s;
    cfg.life = 0.15 + Math.random() * 0.35;
    cfg.rotation = Math.random() * Math.PI * 2;
    cfg.rotSpeed = (Math.random() - 0.5) * 8;
    // Vary size for more natural look
    cfg.sizeStart = 0.3 + Math.random() * 0.3;
    // Occasional bright white-hot spark
    if (Math.random() < 0.2) {
      cfg.color = 0xffffff;
      cfg.sizeStart *= 0.7;
    }
  });
}

function preset_embers(pos, count = 5) {
  emitBurst('softCircle', count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color: 0xff9933, colorEnd: 0x551100,
    sizeStart: 0.2, sizeEnd: 0.05,
    life: 1.0, gravity: -0.5, drag: 1.5,
    opacityStart: 1, opacityEnd: 0,
    // Embers wander on thermals rather than rising in straight lines
    turbulence: 0.9, opacityEase: 1.8,
  }, (cfg) => {
    cfg.vx = (Math.random() - 0.5) * 2;
    cfg.vy = 1 + Math.random() * 2;
    cfg.vz = (Math.random() - 0.5) * 2;
    cfg.life = 0.5 + Math.random() * 1.0;
    // A few embers burn white-hot before cooling
    if (Math.random() < 0.25) { cfg.color = 0xffdd88; cfg.sizeStart = 0.13; }
  });
}

function preset_blood(pos, dir, count = 12, strength = 1) {
  const group = getGroup('bloodDrop', THREE.NormalBlending);
  emitBurst(group, count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color: 0xcc1111,
    sizeStart: 0.3 * strength, sizeEnd: 0.06,
    life: 0.5, gravity: 14,
    opacityStart: 1, opacityEnd: 0.2,
    floorY: 0.05,
    bounceDecay: 0.12,
    blending: THREE.NormalBlending,
    // Droplets elongate as they fly and round out as they slow
    aspect: 0.6, stretch: 0.03,
  }, (cfg) => {
    const spread = 0.5;
    cfg.vx = (dir ? dir.x * 5 : 0) + (Math.random() - 0.5) * spread * 10;
    cfg.vy = 2.5 + Math.random() * 5 * strength;
    cfg.vz = (dir ? dir.z * 5 : 0) + (Math.random() - 0.5) * spread * 10;
    cfg.life = 0.25 + Math.random() * 0.45;
    cfg.sizeStart = (0.18 + Math.random() * 0.25) * strength;
    // Vary color from bright red to dark
    const darkness = Math.random();
    if (darkness > 0.6) cfg.color = 0x881111;
    else if (darkness > 0.3) cfg.color = 0xbb1111;
  });

  // Blood mist — thicker, darker
  emitBurst('smoke', Math.ceil(count * 0.4), {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color: 0x550000, colorEnd: 0x220000,
    sizeStart: 0.6 * strength, sizeEnd: 1.5 * strength,
    life: 0.5, drag: 3,
    opacityStart: 0.45, opacityEnd: 0,
    blending: THREE.NormalBlending,
    sizeEase: 0.5, turbulence: 0.5,
  }, (cfg) => {
    cfg.rotation = Math.random() * 6.283;
    cfg.rotSpeed = (Math.random() - 0.5) * 2;
    cfg.vx = (dir ? dir.x * 2.5 : 0) + (Math.random() - 0.5) * 2.5;
    cfg.vy = 0.5 + Math.random() * 1.2;
    cfg.vz = (dir ? dir.z * 2.5 : 0) + (Math.random() - 0.5) * 2.5;
    cfg.life = 0.25 + Math.random() * 0.35;
  });
}

function preset_dust(pos, count = 4, color = 0x998866) {
  emitBurst('dust', count, {
    x: pos.x, y: pos.y + 0.1, z: pos.z,
    color,
    sizeStart: 0.5, sizeEnd: 1.8,
    life: 0.6, drag: 2, gravity: -0.3,
    opacityStart: 0.36, opacityEnd: 0,
    blending: THREE.NormalBlending,
    // Puff out quickly, then billow slowly — sizeEase < 1 front-loads the growth
    sizeEase: 0.45, turbulence: 0.35,
    erode: 0.8, lit: 0.7,
  }, (cfg) => {
    cfg.vx = (Math.random() - 0.5) * 3;
    cfg.vy = 0.3 + Math.random() * 0.5;
    cfg.vz = (Math.random() - 0.5) * 3;
    cfg.life = 0.4 + Math.random() * 0.4;
    cfg.rotation = Math.random() * 6.283;
    cfg.rotSpeed = (Math.random() - 0.5) * 1.5;
  });
}

function preset_magic(pos, color = 0x6688ff, count = 10) {
  emitBurst('star', count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color,
    sizeStart: 0.3, sizeEnd: 0.05,
    life: 0.6, gravity: -1, drag: 2,
    opacityStart: 1, opacityEnd: 0,
    turbulence: 0.8, opacityEase: 1.5,
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 3;
    cfg.vx = Math.cos(angle) * s;
    cfg.vy = 1 + Math.random() * 2;
    cfg.vz = Math.sin(angle) * s;
    cfg.life = 0.3 + Math.random() * 0.5;
    cfg.rotSpeed = (Math.random() - 0.5) * 4;
  });
}

function preset_heal(pos, count = 12) {
  emitBurst('softCircle', count, {
    x: pos.x, y: pos.y + 0.2, z: pos.z,
    color: 0x44ff66, colorEnd: 0xffdd44,
    sizeStart: 0.2, sizeEnd: 0.4,
    life: 1.0, gravity: -2,
    opacityStart: 0.8, opacityEnd: 0,
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.5;
    cfg.x = pos.x + Math.cos(angle) * r;
    cfg.z = pos.z + Math.sin(angle) * r;
    cfg.vy = 1.5 + Math.random() * 1.5;
    cfg.life = 0.6 + Math.random() * 0.6;
  });
}

function preset_xp(pos, count = 8) {
  emitBurst('star', count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color: 0xffd700,
    sizeStart: 0.25, sizeEnd: 0.1,
    life: 0.8, gravity: -1.5,
    opacityStart: 1, opacityEnd: 0,
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.5;
    cfg.x = pos.x + Math.cos(angle) * r;
    cfg.z = pos.z + Math.sin(angle) * r;
    cfg.vy = 1 + Math.random() * 2;
    cfg.life = 0.5 + Math.random() * 0.5;
    cfg.rotSpeed = (Math.random() - 0.5) * 6;
  });
}

function preset_fire(pos, count = 8) {
  // Bright inner core — white-hot center
  emitBurst('softCircle', Math.ceil(count * 0.3), {
    x: pos.x, y: pos.y + 0.3, z: pos.z,
    color: 0xffffcc, colorEnd: 0xffaa44,
    sizeStart: 0.35, sizeEnd: 0.05,
    life: 0.25, gravity: -4, drag: 0.8,
    opacityStart: 1, opacityEnd: 0,
  }, (cfg) => {
    cfg.vx = (Math.random() - 0.5) * 1.2;
    cfg.vy = 3 + Math.random() * 2;
    cfg.vz = (Math.random() - 0.5) * 1.2;
    cfg.life = 0.12 + Math.random() * 0.15;
  });
  // Flame body — orange/red outer layer
  emitBurst('flame', Math.ceil(count * 0.6), {
    x: pos.x, y: pos.y + 0.3, z: pos.z,
    // The full heat ramp: white-hot, gold, orange, deep ember red. A two-point
    // lerp can only ever cross the middle of this, which is why the old flame
    // read as uniformly orange.
    colorStops: [0xfff6d8, 0xffc23a, 0xff6a12, 0x7d1200],
    sizeStart: 0.7, sizeEnd: 0.15,
    life: 0.4, gravity: -3, drag: 1,
    opacityStart: 1, opacityEnd: 0,
    turbulence: 1.1, sizeEase: 0.7,
    erode: 0.85,
  }, (cfg) => {
    cfg.vx = (Math.random() - 0.5) * 2;
    cfg.vy = 2 + Math.random() * 3;
    cfg.vz = (Math.random() - 0.5) * 2;
    cfg.life = 0.2 + Math.random() * 0.3;
    cfg.rotation = (Math.random() - 0.5) * 0.6;
  });
  // Darker outer smoke — volumetric feel
  emitBurst('smoke', Math.ceil(count * 0.35), {
    x: pos.x, y: pos.y + 0.8, z: pos.z,
    colorStops: [0x6d6252, 0x4a4238, 0x2a251d, 0x121009],
    sizeStart: 0.4, sizeEnd: 1.4,
    life: 0.8, gravity: -0.5, drag: 2,
    opacityStart: 0.42, opacityEnd: 0,
    blending: THREE.NormalBlending,
    sizeEase: 0.5, turbulence: 0.6, fadeIn: 0.2,
    erode: 0.9, lit: 0.85,
  }, (cfg) => {
    cfg.vx = (Math.random() - 0.5) * 1.2;
    cfg.vy = 1 + Math.random() * 1.2;
    cfg.vz = (Math.random() - 0.5) * 1.2;
    cfg.life = 0.4 + Math.random() * 0.5;
    cfg.rotation = Math.random() * 6.283;
    cfg.rotSpeed = (Math.random() - 0.5) * 1.2;
  });
  // Embers
  preset_embers(pos, Math.ceil(count * 0.3));
}

function preset_frost(pos, count = 8) {
  emitBurst('star', count, {
    x: pos.x, y: pos.y + 0.5, z: pos.z,
    color: 0x88ddff, colorEnd: 0xffffff,
    sizeStart: 0.3, sizeEnd: 0.05,
    life: 0.8, gravity: 2, drag: 1.5,
    opacityStart: 0.9, opacityEnd: 0,
    aspect: 0.45, stretch: 0.035, opacityEase: 1.6,
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 3;
    cfg.vx = Math.cos(angle) * s;
    cfg.vy = 1 + Math.random() * 2;
    cfg.vz = Math.sin(angle) * s;
    cfg.life = 0.4 + Math.random() * 0.5;
    cfg.rotSpeed = (Math.random() - 0.5) * 8;
  });
}

function preset_poison(pos, count = 6) {
  emitBurst('smoke', count, {
    x: pos.x, y: pos.y + 0.3, z: pos.z,
    color: 0x55dd33, colorEnd: 0x0d4411,
    sizeStart: 0.4, sizeEnd: 1.0,
    life: 0.8, gravity: -0.5, drag: 2,
    opacityStart: 0.5, opacityEnd: 0,
    sizeEase: 0.5, turbulence: 0.7, fadeIn: 0.15,
  }, (cfg) => {
    const angle = Math.random() * Math.PI * 2;
    cfg.vx = Math.cos(angle) * 1.5;
    cfg.vy = 0.5 + Math.random();
    cfg.vz = Math.sin(angle) * 1.5;
    cfg.life = 0.4 + Math.random() * 0.5;
    cfg.rotation = Math.random() * 6.283;
    cfg.rotSpeed = (Math.random() - 0.5) * 1.8;
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — VFX SOCKET SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Standard bone mappings for Trellis-generated characters
const BONE_MAPS = {
  default: {
    HEAD: ['head', 'Head', 'mixamorigHead'],
    CHEST: ['spine2', 'Spine2', 'mixamorigSpine2', 'spine_02', 'Chest'],
    LEFT_HAND: ['hand_l', 'Hand_L', 'mixamorigLeftHand', 'LeftHand'],
    RIGHT_HAND: ['hand_r', 'Hand_R', 'mixamorigRightHand', 'RightHand'],
    LEFT_FOOT: ['foot_l', 'Foot_L', 'mixamorigLeftFoot', 'LeftFoot'],
    RIGHT_FOOT: ['foot_r', 'Foot_R', 'mixamorigRightFoot', 'RightFoot'],
    HIPS: ['hips', 'Hips', 'mixamorigHips', 'pelvis'],
  }
};

function findBone(mesh, socketName, mapName = 'default') {
  const candidates = BONE_MAPS[mapName]?.[socketName] || [];
  let found = null;
  mesh.traverse(c => {
    if (found) return;
    if (c.isBone && candidates.includes(c.name)) found = c;
  });
  return found;
}

function getSocketWorldPos(mesh, socketName, target) {
  const bone = findBone(mesh, socketName);
  if (bone) {
    bone.getWorldPosition(target || (target = new THREE.Vector3()));
    return target;
  }
  // Fallback: use mesh position with offset
  target = target || new THREE.Vector3();
  target.copy(mesh.position);
  if (socketName === 'HEAD') target.y += 2;
  else if (socketName === 'CHEST') target.y += 1.2;
  else if (socketName === 'LEFT_FOOT' || socketName === 'RIGHT_FOOT') target.y += 0.1;
  else target.y += 1;
  return target;
}

// Weapon tip/base tracking for trails
function getWeaponPoints(characterMesh) {
  let weaponBase = null, weaponTip = null;
  const handBone = findBone(characterMesh, 'RIGHT_HAND');
  if (handBone) {
    // The sword is attached to hand_r. Base = hand position, Tip = offset along weapon
    weaponBase = new THREE.Vector3();
    weaponTip = new THREE.Vector3();
    handBone.getWorldPosition(weaponBase);
    // Tip is approximately 0.8 units along the weapon direction from the hand
    // Since weapons are rotated, we compute tip in world space
    const tipLocal = new THREE.Vector3(0, 0, 0.8); // along local Z of sword
    const tipWorld = tipLocal.applyMatrix4(handBone.matrixWorld);
    weaponTip.copy(tipWorld);
  }
  return { base: weaponBase, tip: weaponTip };
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — WEAPON TRAIL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TRAIL_POINTS = 20;
const activeTrails = [];

class WeaponTrail {
  constructor(color = 0xffffff, width = 0.15, duration = 0.25, secondaryColor = null) {
    this.maxPoints = quality.trailRes || 12;
    this.positions = []; // Array of { base: Vec3, tip: Vec3, time: float }
    this.duration = duration;
    this.active = false;
    this.timer = 0;

    // Create ribbon geometry
    const vertCount = this.maxPoints * 2;
    const posArr = new Float32Array(vertCount * 3);
    const uvArr = new Float32Array(vertCount * 2);
    const indices = [];

    for (let i = 0; i < this.maxPoints; i++) {
      const t = i / (this.maxPoints - 1);
      uvArr[i * 4] = t;     uvArr[i * 4 + 1] = 0;
      uvArr[i * 4 + 2] = t; uvArr[i * 4 + 3] = 1;
    }

    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    this.geo.setIndex(indices);

    // Trail material with gradient fade + inner energy glow
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uSecondaryColor: { value: new THREE.Color(secondaryColor || color) },
        uOpacity: { value: 1.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uSecondaryColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // Fade along trail length (oldest = transparent)
          float lengthFade = 1.0 - vUv.x;
          float alpha = lengthFade * uOpacity;
          // Fade at edges — sharper outer, softer inner
          float edgeDist = abs(vUv.y - 0.5) * 2.0;
          float edgeFade = 1.0 - edgeDist;
          alpha *= edgeFade * edgeFade;
          // Color gradient base to tip
          vec3 col = mix(uColor, uSecondaryColor, vUv.y);
          // Inner energy core — bright white-hot center line
          float coreIntensity = smoothstep(0.35, 0.0, edgeDist);
          col = mix(col, vec3(1.0, 1.0, 0.95), coreIntensity * 0.6 * lengthFade);
          // Animated shimmer along trail length
          float shimmer = sin(vUv.x * 25.0 - uTime * 12.0) * 0.5 + 0.5;
          shimmer *= smoothstep(0.8, 0.2, vUv.x); // stronger near tip
          col += col * shimmer * 0.3;
          // Emissive boost
          col *= 1.6;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  start() {
    this.active = true;
    this.timer = this.duration;
    this.positions = [];
    this.mesh.visible = true;
    this.mat.uniforms.uOpacity.value = 1.0;
  }

  addPoint(base, tip) {
    if (!this.active && this.positions.length === 0) return;
    this.positions.unshift({
      base: base.clone(), tip: tip.clone(), time: performance.now()
    });
    if (this.positions.length > this.maxPoints) {
      this.positions.length = this.maxPoints;
    }
    this._updateGeometry();
  }

  _updateGeometry() {
    const posAttr = this.geo.getAttribute('position');
    const pts = this.positions;

    for (let i = 0; i < this.maxPoints; i++) {
      const idx = i * 2 * 3;
      if (i < pts.length) {
        // Smooth each sample against its neighbours with a 1-2-1 kernel. The
        // ribbon is sampled once per frame, so an uneven frame leaves a visible
        // kink in the arc; averaging removes it without needing more vertices.
        const prev = pts[i - 1] || pts[i];
        const next = pts[i + 1] || pts[i];
        const bx = (prev.base.x + pts[i].base.x * 2 + next.base.x) * 0.25;
        const by = (prev.base.y + pts[i].base.y * 2 + next.base.y) * 0.25;
        const bz = (prev.base.z + pts[i].base.z * 2 + next.base.z) * 0.25;
        const tx = (prev.tip.x + pts[i].tip.x * 2 + next.tip.x) * 0.25;
        const ty = (prev.tip.y + pts[i].tip.y * 2 + next.tip.y) * 0.25;
        const tz = (prev.tip.z + pts[i].tip.z * 2 + next.tip.z) * 0.25;

        // Narrow toward the tail so the trail closes to a point instead of
        // ending on a blunt edge the width of the blade.
        const taper = 1 - (i / (this.maxPoints - 1)) * 0.8;

        posAttr.array[idx]     = bx;
        posAttr.array[idx + 1] = by;
        posAttr.array[idx + 2] = bz;
        posAttr.array[idx + 3] = bx + (tx - bx) * taper;
        posAttr.array[idx + 4] = by + (ty - by) * taper;
        posAttr.array[idx + 5] = bz + (tz - bz) * taper;
      } else {
        // Collapse unused verts to last valid point
        const last = pts.length > 0 ? pts[pts.length - 1] : null;
        if (last) {
          posAttr.array[idx] = posAttr.array[idx + 3] = last.base.x;
          posAttr.array[idx + 1] = posAttr.array[idx + 4] = last.base.y;
          posAttr.array[idx + 2] = posAttr.array[idx + 5] = last.base.z;
        } else {
          posAttr.array[idx] = posAttr.array[idx + 1] = posAttr.array[idx + 2] = 0;
          posAttr.array[idx + 3] = posAttr.array[idx + 4] = posAttr.array[idx + 5] = 0;
        }
      }
    }
    posAttr.needsUpdate = true;
  }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    if (!this.active) {
      // Fade out
      if (this.positions.length > 0) {
        this.mat.uniforms.uOpacity.value -= dt * 6;
        if (this.mat.uniforms.uOpacity.value <= 0) {
          this.positions = [];
          this.mesh.visible = false;
          this._updateGeometry();
        }
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
    }
  }

  stop() {
    this.active = false;
  }

  dispose() {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// Per-projectile look. `meteor` and `storm` are the evolved Arrow Volley and
// Throwing Dagger, named for fire and lightning in their upgrade text.
const PROJECTILE_STYLES = {
  arrow:  { core: 0xffcc66, tail: 0x8a5a1e, spark: 0xffffff, coreSize: 0.18, sparkChance: 0.3, smoke: false },
  dagger: { core: 0xaaddff, tail: 0x2a6a9a, spark: 0xffffff, coreSize: 0.18, sparkChance: 0.3, smoke: false },
  meteor: { core: 0xff9a2e, tail: 0x8b1a00, spark: 0xffe08a, coreSize: 0.3,  sparkChance: 0.8, smoke: true  },
  storm:  { core: 0xbfe6ff, tail: 0x3355cc, spark: 0xffffff, coreSize: 0.26, sparkChance: 0.9, smoke: false },
};

// Crescent look per weapon. Heavier weapons get a wider, slower arc so the
// silhouette alone tells you what swung.
const ARC_STYLES = {
  sword:     { color: 0xeaf0ff, edgeColor: 0xbbaa66, radius: 2.0, duration: 0.22, tilt: -0.35, height: 1.0 },
  excalibur: { color: 0xfff4d0, edgeColor: 0xffb020, radius: 2.5, duration: 0.28, tilt: -0.30, height: 1.0 },
  axe:       { color: 0xdddddd, edgeColor: 0x886644, radius: 2.3, duration: 0.26, tilt: -0.40, height: 1.0 },
  spear:     { color: 0xe6e6e6, edgeColor: 0xaaaaaa, radius: 1.7, duration: 0.18, tilt: -0.20, height: 1.1 },
  club:      { color: 0xd8c3a0, edgeColor: 0x6b5843, radius: 2.6, duration: 0.30, tilt: -0.45, height: 0.9 },
  magic:     { color: 0xb08cff, edgeColor: 0x4488ff, radius: 2.2, duration: 0.26, tilt: -0.30, height: 1.1 },
  storm:     { color: 0xbfe6ff, edgeColor: 0x3355cc, radius: 2.2, duration: 0.22, tilt: -0.30, height: 1.0 },
  boss:      { color: 0xffb060, edgeColor: 0xff4400, radius: 3.4, duration: 0.32, tilt: -0.40, height: 1.4 },
  dragon:    { color: 0xffc070, edgeColor: 0xff2200, radius: 4.0, duration: 0.35, tilt: -0.40, height: 1.6 },
};

// Trail style presets
const TRAIL_STYLES = {
  sword:   { color: 0xeeeeff, secondary: 0xccaa44, width: 0.2,  duration: 0.6 },
  // "Excalibur — the legendary blade": gold and white instead of steel
  excalibur: { color: 0xfff4d0, secondary: 0xffc03a, width: 0.3, duration: 0.7 },
  storm:   { color: 0xbfe6ff, secondary: 0x3355cc, width: 0.25, duration: 0.6 },
  axe:     { color: 0xaaaaaa, secondary: 0x886644, width: 0.3,  duration: 0.6 },
  spear:   { color: 0xcccccc, secondary: 0xdddddd, width: 0.1,  duration: 0.55 },
  club:    { color: 0x8B7355, secondary: 0x665544, width: 0.35, duration: 0.6 },
  magic:   { color: 0x6644ff, secondary: 0x4488ff, width: 0.25, duration: 0.6 },
  boss:    { color: 0xff4400, secondary: 0xff8800, width: 0.4,  duration: 0.65 },
  dragon:  { color: 0xff2200, secondary: 0xffaa00, width: 0.45, duration: 0.7 },
};


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 — IMPACT FLASH SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const impactFlashes = [];

function spawnImpactFlash(pos, color = 0xffffff, size = 1.5, duration = 0.1) {
  const mat = new THREE.SpriteMaterial({
    map: VFXTextures.flash,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(pos);
  sprite.position.y += 0.5;
  // Slightly wider than tall — the texture is an anamorphic flare and this
  // exaggerates the horizontal streak a little further.
  sprite.scale.set(size * 1.25, size * 0.95, 1);
  scene.add(sprite);
  impactFlashes.push({ sprite, mat, life: duration, maxLife: duration, baseSize: size });
}

function updateImpactFlashes(dt) {
  for (let i = impactFlashes.length - 1; i >= 0; i--) {
    const f = impactFlashes[i];
    f.life -= dt;
    const t = f.life / f.maxLife;
    // Fade out fast rather than linearly, so the flash punches and vanishes
    f.mat.opacity = t * t;
    // Grow relative to the requested size. This used to be a fixed expression
    // that ignored `size` entirely, so a coin pickup flashed exactly as large
    // as a dragon's death.
    const grow = f.baseSize * (1 + (1 - t) * 0.9);
    f.sprite.scale.set(grow * 1.25, grow * 0.95, 1);
    if (f.life <= 0) {
      scene.remove(f.sprite);
      f.mat.dispose();
      impactFlashes.splice(i, 1);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 10 — DECAL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const decals = [];
const MAX_DECALS = 60;

function spawnGroundDecal(pos, color = 0x880000, size = 1, textureName = 'bloodSplat') {
  if (decals.length >= (quality.maxDecals || MAX_DECALS)) {
    // Remove oldest
    const old = decals.shift();
    scene.remove(old.mesh);
    old.geo.dispose();
    old.mat.dispose();
  }

  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({
    map: VFXTextures[textureName] || VFXTextures.bloodSplat,
    color,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.random() * Math.PI * 2;
  mesh.position.set(pos.x, 0.05, pos.z);
  scene.add(mesh);
  decals.push({ mesh, geo, mat, life: 15.0 }); // 15s lifetime
}

function updateDecals(dt) {
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i];
    d.life -= dt;
    // Fade out in last 3 seconds
    if (d.life < 3) {
      d.mat.opacity = Math.max(0, (d.life / 3) * 0.6);
    }
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.geo.dispose();
      d.mat.dispose();
      decals.splice(i, 1);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 11 — DYNAMIC VFX LIGHTING
// ═══════════════════════════════════════════════════════════════════════════

const vfxLights = [];
const _lightPool = [];
const MAX_VFX_LIGHTS = 6;

function spawnVFXLight(pos, color = 0xff8800, intensity = 2, range = 8, duration = 0.3) {
  const maxLights = quality.maxLights || MAX_VFX_LIGHTS;
  if (vfxLights.length >= maxLights) {
    // Remove oldest
    const old = vfxLights.shift();
    scene.remove(old.light);
    _lightPool.push(old.light);
  }

  let light = _lightPool.pop();
  if (!light) {
    light = new THREE.PointLight(0xffffff, 0, 0);
  }
  light.color.setHex(color);
  light.intensity = intensity;
  light.distance = range;
  light.position.copy(pos);
  light.position.y += 1;
  scene.add(light);
  vfxLights.push({ light, life: duration, maxLife: duration, peakIntensity: intensity });
}

function updateVFXLights(dt) {
  for (let i = vfxLights.length - 1; i >= 0; i--) {
    const l = vfxLights[i];
    l.life -= dt;
    const t = Math.max(0, l.life / l.maxLife);
    l.light.intensity = l.peakIntensity * t * t; // quadratic falloff
    if (l.life <= 0) {
      scene.remove(l.light);
      _lightPool.push(l.light);
      vfxLights.splice(i, 1);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 8 — SHOCKWAVE / RING EFFECTS
// ═══════════════════════════════════════════════════════════════════════════

const shockwaves = [];

const shockwaveVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const shockwaveFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uProgress;
  varying vec2 vUv;
  void main() {
    // RingGeometry gives planar UVs across the quad's bounding box, NOT
    // (radial, angular) — the old code read vUv.x as "inner to outer" and got a
    // left-to-right gradient across the ring instead of a radial one. Recover the
    // true radial coordinate from the UV centre.
    vec2 d = vUv - vec2(0.5);
    float r = length(d) * 2.0;                      // 0 at centre, 1 at outer edge
    float ang = atan(d.y, d.x);

    // Break the circle up. A perfectly even ring reads as a UI element; a blast
    // front is uneven, so the radius is perturbed by a couple of sine harmonics
    // that spin slowly as the wave expands.
    float wobble =
        sin(ang * 7.0 + uProgress * 5.0) * 0.030
      + sin(ang * 13.0 - uProgress * 3.0) * 0.016;
    float t = clamp((r - (0.6 + wobble)) / 0.4, 0.0, 1.0);

    // Glow gradient: bright at leading edge, soft falloff inward
    float edge = smoothstep(0.0, 0.3, t) * smoothstep(1.0, 0.7, t);
    // Hot leading edge
    float leading = smoothstep(0.5, 1.0, t);
    vec3 col = uColor * (1.0 + leading * 0.8);
    // Push leading edge toward white
    col = mix(col, vec3(1.0, 1.0, 0.95), leading * 0.35);

    // Thin the ring unevenly around its circumference so it does not look
    // stamped, and let the gaps open up as the wave loses energy.
    float breakup = 1.0 - 0.35 * uProgress * (0.5 + 0.5 * sin(ang * 9.0 + 1.7));
    float alpha = edge * uOpacity * breakup;

    // Emissive boost for bloom pickup
    col *= 1.5;
    gl_FragColor = vec4(col, alpha);
  }
`;

function spawnShockwave(pos, color = 0xffaa44, maxRadius = 5, duration = 0.5, yOffset = 0.15) {
  const geo = new THREE.RingGeometry(0.6, 1.0, 48);
  const c = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      uOpacity: { value: 0.8 },
      uProgress: { value: 0.0 },
    },
    vertexShader: shockwaveVertexShader,
    fragmentShader: shockwaveFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, yOffset, pos.z);
  scene.add(mesh);
  shockwaves.push({ mesh, geo, mat, life: duration, maxLife: duration, maxRadius });
}

// Staggered effects. Layering a second ring or burst a few frames behind the
// first is what makes a blast read as having force, but a setTimeout survives a
// game reset and fires into the fresh scene — so delays are counted in frames
// and the queue is cleared along with everything else.
const _pendingShockwaves = [];

function queueEffect(delay, fn) {
  _pendingShockwaves.push({ delay, fn });
}

function queueShockwave(delay, pos, color, maxRadius, duration, yOffset) {
  // Snapshot the position: the caller's vector may be a live mesh position.
  const x = pos.x, y = pos.y, z = pos.z;
  queueEffect(delay, () => spawnShockwave({ x, y, z }, color, maxRadius, duration, yOffset));
}

function updatePendingShockwaves(dt) {
  for (let i = _pendingShockwaves.length - 1; i >= 0; i--) {
    const q = _pendingShockwaves[i];
    q.delay -= dt;
    if (q.delay > 0) continue;
    q.fn();
    _pendingShockwaves[i] = _pendingShockwaves[_pendingShockwaves.length - 1];
    _pendingShockwaves.pop();
  }
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    const t = 1 - (s.life / s.maxLife);
    const radius = s.maxRadius * t;
    s.mesh.scale.setScalar(radius);
    s.mat.uniforms.uOpacity.value = 0.8 * (1 - t * t);
    s.mat.uniforms.uProgress.value = t;
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.geo.dispose();
      s.mat.dispose();
      shockwaves.splice(i, 1);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// RUNE CIRCLES
// Ground-aligned glyph rings that sweep into existence, spin, pulse and fade.
// Two counter-rotating layers so the pattern never sits still, and an optional
// clockwise reveal for anything that should read as "being cast".
// ═══════════════════════════════════════════════════════════════════════════

const runeCircles = [];
let runeGeo = null;

const runeFragmentShader = `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSweep;    // 1.0 = fully drawn; below that, a casting wipe
  uniform float uPulse;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.01) discard;

    float alpha = t.a * uOpacity;
    vec3 col = uColor;

    if (uSweep < 1.0) {
      // Reveal clockwise from the top, with a white-hot leading edge
      vec2 d = vUv - 0.5;
      float ang = fract(atan(d.x, d.y) / 6.2831853);
      if (ang > uSweep) discard;
      col = mix(col, vec3(1.0), smoothstep(uSweep - 0.045, uSweep, ang) * 0.9);
    }

    // Breathing glow so the sigil never looks like a static decal
    col *= 1.6 + uPulse * 0.5;
    gl_FragColor = vec4(col * alpha, alpha * 0.0);
  }
`;

function makeRuneLayer(textureName, color, radius, spin) {
  if (!runeGeo) runeGeo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: VFXTextures[textureName] },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uSweep: { value: 1 },
      uPulse: { value: 0 },
    },
    vertexShader: shockwaveVertexShader,
    fragmentShader: runeFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Premultiplied, matching the particle material: alpha 0 means pure additive
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(runeGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.renderOrder = 3;
  return { mesh, mat, spin, radius };
}

function spawnRuneCircle(pos, opts = {}) {
  const {
    color = 0xffd98a,
    radius = 4,
    duration = 1.2,
    sweep = 0.35,      // fraction of life spent drawing the ring on
    y = 0.06,
    peakOpacity = 1.0,
    sigil = true,
  } = opts;

  const layers = [makeRuneLayer('runeRing', color, radius, 0.55)];
  if (sigil) layers.push(makeRuneLayer('runeSigil', color, radius * 0.78, -0.9));
  for (const l of layers) {
    l.mesh.position.set(pos.x, y, pos.z);
    scene.add(l.mesh);
  }
  runeCircles.push({ layers, life: duration, maxLife: duration, sweep, peakOpacity, radius });
}

function updateRuneCircles(dt) {
  for (let i = runeCircles.length - 1; i >= 0; i--) {
    const rc = runeCircles[i];
    rc.life -= dt;
    if (rc.life <= 0) {
      for (const l of rc.layers) { scene.remove(l.mesh); l.mat.dispose(); }
      runeCircles.splice(i, 1);
      continue;
    }
    const t = 1 - rc.life / rc.maxLife;
    // Draw on, hold, then fade — the hold is what gives it presence
    const sweep = rc.sweep > 0 ? Math.min(1, t / rc.sweep) : 1;
    const fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    const pulse = Math.sin(t * Math.PI * 6) * 0.5 + 0.5;
    // Settle inward slightly as it appears, rather than a flat pop
    const scale = (0.86 + 0.14 * Math.min(1, t / 0.25)) * rc.radius * 2;

    for (const l of rc.layers) {
      l.mat.uniforms.uOpacity.value = rc.peakOpacity * fade;
      l.mat.uniforms.uSweep.value = sweep;
      l.mat.uniforms.uPulse.value = pulse;
      l.mesh.rotation.z += l.spin * dt;
      l.mesh.scale.setScalar(scale * (l.radius / rc.radius));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEAT DISTORTION
// Explosions and fire push the image around them. The quads here are never
// drawn into the beauty pass — they live on their own camera layer and render
// into a small offscreen buffer whose RG channels encode a screen-space UV
// offset. The post-processing chain then samples the scene through it.
// ═══════════════════════════════════════════════════════════════════════════

const DISTORT_LAYER = 5;
const distortions = [];
const MAX_DISTORTIONS = 10;
let distortGeo = null;
let distortRT = null;

const distortFragmentShader = `
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    // Strongest just inside the rim, nothing at the very centre — heat bends
    // light around a blast rather than smearing its middle.
    float mask = smoothstep(1.0, 0.45, r) * smoothstep(0.0, 0.25, r);
    vec2 dir = r > 0.001 ? p / r : vec2(0.0);
    // Ripple travelling outward
    float wave = sin(r * 16.0 - uTime * 11.0);
    vec2 offset = dir * (0.55 + 0.45 * wave);
    gl_FragColor = vec4(offset * 0.5 + 0.5, 0.5, mask * uStrength);
  }
`;

function spawnHeatDistortion(pos, radius = 3, duration = 0.45, strength = 1.0) {
  if (!distortRT || distortions.length >= MAX_DISTORTIONS) return;
  if (!distortGeo) distortGeo = new THREE.PlaneGeometry(1, 1);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: strength }, uTime: { value: 0 } },
    vertexShader: shockwaveVertexShader,
    fragmentShader: distortFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(distortGeo, mat);
  mesh.position.set(pos.x, pos.y + 0.6, pos.z);
  mesh.scale.setScalar(radius * 2);
  mesh.layers.set(DISTORT_LAYER);
  mesh.frustumCulled = false;
  scene.add(mesh);
  distortions.push({ mesh, mat, life: duration, maxLife: duration, radius, strength });
}

function updateDistortions(dt) {
  for (let i = distortions.length - 1; i >= 0; i--) {
    const d = distortions[i];
    d.life -= dt;
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mat.dispose();
      distortions.splice(i, 1);
      continue;
    }
    const t = 1 - d.life / d.maxLife;
    d.mat.uniforms.uTime.value += dt;
    // Expand and weaken
    d.mat.uniforms.uStrength.value = d.strength * (1 - t) * (1 - t);
    d.mesh.scale.setScalar(d.radius * 2 * (1 + t * 1.4));
    d.mesh.quaternion.copy(camera.quaternion);
  }
}

// Neutral value for the offset buffer. It must be built in linear space: passing
// 0x808080 to setClearColor would be read as sRGB and converted to ~0.216 linear,
// which is not the midpoint the decode in the post shader expects.
const _distortNeutral = new THREE.Color().setRGB(0.5, 0.5, 0.5, THREE.LinearSRGBColorSpace);
const _prevClear = new THREE.Color();

// Called by the game immediately before the main composer render.
function renderDistortion() {
  // Nothing distorting — skip the buffer entirely rather than paying for a
  // clear and a full-screen sample every quiet frame. Callers must treat null
  // as "apply no distortion"; a null texture binds as white and would decode to
  // a maximum offset.
  if (!distortRT || distortions.length === 0) return null;
  const prevTarget = renderer.getRenderTarget();
  const prevMask = camera.layers.mask;
  renderer.getClearColor(_prevClear);
  const prevAlpha = renderer.getClearAlpha();

  renderer.setRenderTarget(distortRT);
  renderer.setClearColor(_distortNeutral, 1);
  renderer.clear(true, false, false);
  if (distortions.length > 0) {
    // scene.background would be painted over the neutral clear, filling the
    // offset buffer with the sky colour and skewing the whole screen forever.
    const prevBg = scene.background;
    const prevFog = scene.fog;
    scene.background = null;
    scene.fog = null;
    camera.layers.set(DISTORT_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = prevMask;
    scene.background = prevBg;
    scene.fog = prevFog;
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(_prevClear, prevAlpha);
  return distortRT.texture;
}

function initDistortion() {
  const w = Math.max(1, Math.floor(renderer.domElement.width / 2));
  const h = Math.max(1, Math.floor(renderer.domElement.height / 2));
  distortRT = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function resizeDistortion(width, height) {
  if (distortRT) distortRT.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
}

// ═══════════════════════════════════════════════════════════════════════════
// SLASH ARCS
// A crescent that wipes along the swing. The bone-attached weapon trail follows
// the blade itself, which is accurate but thin and easy to miss in a crowd; the
// arc is the readable, stylised counterpart that tells the player where the
// attack actually landed.
// ═══════════════════════════════════════════════════════════════════════════

const slashArcs = [];
let _arcGeometry = null;

// Live lightning bolts. Storm Kunai chains fire these several times a second, so
// they are capped — past the limit new bolts are skipped rather than queued, since
// a dozen overlapping arcs read as noise anyway.
const lightningBolts = [];
const MAX_LIGHTNING_BOLTS = 10;

// Bolts are camera-facing ribbons, not GL lines (which are always one pixel wide).
// Each bolt is three stacked ribbons on the same path — a wide soft glow, a
// mid-blue body and a white-hot core — plus thinner forks. The path is midpoint-
// displacement noise and is re-rolled a few times over the bolt's life, because
// real lightning flickers between shapes rather than fading as one still image.
let _boltTex = null;
function getBoltTexture() {
  if (_boltTex) return _boltTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 4);
  _boltTex = new THREE.CanvasTexture(c);
  _boltTex.wrapS = _boltTex.wrapT = THREE.ClampToEdgeWrapping;
  return _boltTex;
}
const _bDir = new THREE.Vector3(), _bView = new THREE.Vector3(), _bPerp = new THREE.Vector3();
function boltPath(start, end, jag, levels = 4) {
  let pts = [new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)];
  const total = pts[0].distanceTo(pts[1]);
  let amp = total * 0.16 * jag;
  for (let l = 0; l < levels; l++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      _bDir.subVectors(b, a).normalize();
      _bPerp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(_bDir).normalize();
      m.addScaledVector(_bPerp, (Math.random() - 0.5) * 2 * amp);
      next.push(m, b);
    }
    pts = next; amp *= 0.55;
  }
  return pts;
}
function ribbonGeometry(pts, width, taper) {
  const n = pts.length;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    _bDir.subVectors(next, prev).normalize();
    _bView.subVectors(camera.position, p).normalize();
    _bPerp.crossVectors(_bDir, _bView).normalize();
    const t = i / (n - 1);
    const w = width * (taper ? (0.35 + 0.65 * (1 - t)) : 1) * 0.5;
    pos[i * 6] = p.x - _bPerp.x * w; pos[i * 6 + 1] = p.y - _bPerp.y * w; pos[i * 6 + 2] = p.z - _bPerp.z * w;
    pos[i * 6 + 3] = p.x + _bPerp.x * w; pos[i * 6 + 4] = p.y + _bPerp.y * w; pos[i * 6 + 5] = p.z + _bPerp.z * w;
    uv[i * 4] = 0; uv[i * 4 + 1] = t; uv[i * 4 + 2] = 1; uv[i * 4 + 3] = t;
    if (i > 0) { const a = (i - 1) * 2, b = i * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function ribbonMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ map: getBoltTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
}
// layers: [{ width, color, opacity }] from widest glow to the core
function spawnBolt(start, end, { layers, life = 0.22, jag = 1.0, forks = 3, forkLen = 0.35, rejitters = 3, taper = false } = {}) {
  if (lightningBolts.length >= MAX_LIGHTNING_BOLTS) return null;
  const pts = boltPath(start, end, jag);
  const b = { life, maxLife: life, start: { x: start.x, y: start.y, z: start.z }, end: { x: end.x, y: end.y, z: end.z }, jag, taper, layers: [], forks: [],
              rejitterAt: rejitters > 0 ? life * (1 - 1 / (rejitters + 1)) : -1, rejitters, forkLen, forkCount: forks };
  for (const L of layers) {
    const geo = ribbonGeometry(pts, L.width, taper), mat = ribbonMaterial(L.color, L.opacity);
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 40; mesh.frustumCulled = false;
    scene.add(mesh); b.layers.push({ mesh, geo, mat, width: L.width, opacity: L.opacity });
  }
  buildForks(b, pts);
  lightningBolts.push(b);
  return b;
}
function buildForks(b, pts) {
  for (const f of b.forks) { scene.remove(f.mesh); f.geo.dispose(); f.mat.dispose(); }
  b.forks.length = 0;
  const n = Math.ceil(b.forkCount * quality.particleMul);
  if (n <= 0 || pts.length < 6) return;
  const total = Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y, b.end.z - b.start.z);
  const w = b.layers[b.layers.length - 1].width;
  for (let i = 0; i < n; i++) {
    const at = pts[2 + Math.floor(Math.random() * (pts.length - 4))];
    const len = total * b.forkLen * (0.4 + Math.random() * 0.6);
    const dir = new THREE.Vector3(Math.random() - 0.5, -Math.random() * 0.6 - 0.2, Math.random() - 0.5).normalize();
    const to = new THREE.Vector3().copy(at).addScaledVector(dir, len);
    const fpts = boltPath(at, to, b.jag * 1.3, 3);
    for (const [width, color, opacity] of [[w * 2.2, 0x7fb0ff, 0.35], [w * 0.7, 0xe8f2ff, 0.9]]) {
      const geo = ribbonGeometry(fpts, width, true), mat = ribbonMaterial(color, opacity);
      const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 40; mesh.frustumCulled = false;
      scene.add(mesh); b.forks.push({ mesh, geo, mat, opacity });
    }
  }
}
function disposeBolt(b) {
  for (const l of b.layers) { scene.remove(l.mesh); l.geo.dispose(); l.mat.dispose(); }
  for (const f of b.forks) { scene.remove(f.mesh); f.geo.dispose(); f.mat.dispose(); }
}
function updateLightning(dt) {
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    const b = lightningBolts[i];
    b.life -= dt;
    if (b.life <= 0) { disposeBolt(b); lightningBolts.splice(i, 1); continue; }
    // Re-roll the path a few times, then let the last shape fade
    if (b.rejitterAt > 0 && b.life <= b.rejitterAt) {
      b.rejitters--;
      b.rejitterAt = b.rejitters > 0 ? b.life - b.maxLife / (b.rejitters + 2) : -1;
      const pts = boltPath(b.start, b.end, b.jag);
      for (const l of b.layers) { const g = ribbonGeometry(pts, l.width, b.taper); l.mesh.geometry = g; l.geo.dispose(); l.geo = g; }
      buildForks(b, pts);
    }
    const f = b.life / b.maxLife;
    const env = f > 0.35 ? 1 : f / 0.35;                        // hold, then drop
    const flick = 0.75 + Math.random() * 0.25;                  // strobe
    for (const l of b.layers) l.mat.opacity = l.opacity * env * flick;
    for (const fk of b.forks) fk.mat.opacity = fk.opacity * env * flick;
  }
}

// UVs here are genuinely (angular, radial): u runs along the sweep, v from the
// inner edge to the outer edge. That is what lets the shader wipe the arc on.
function getArcGeometry() {
  if (_arcGeometry) return _arcGeometry;
  const SEGMENTS = 28;
  const INNER = 0.5;
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  const indices = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const theta = (u - 0.5) * Math.PI * 1.15;   // ~207 degrees of sweep
    const c = Math.cos(theta), s = Math.sin(theta);
    const p = i * 6, t = i * 4;
    positions[p] = c * INNER; positions[p + 1] = 0; positions[p + 2] = s * INNER;
    positions[p + 3] = c;     positions[p + 4] = 0; positions[p + 5] = s;
    uvs[t] = u; uvs[t + 1] = 0;
    uvs[t + 2] = u; uvs[t + 3] = 1;
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  _arcGeometry = new THREE.BufferGeometry();
  _arcGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  _arcGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  _arcGeometry.setIndex(indices);
  return _arcGeometry;
}

const slashArcFragmentShader = `
  uniform vec3 uColor;
  uniform vec3 uEdgeColor;
  uniform float uProgress;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // Wipe: only the part of the arc the blade has already passed is drawn, and
    // it trails off behind the leading edge.
    float head = uProgress;
    float along = smoothstep(head - 0.6, head, vUv.x) * step(vUv.x, head);
    // Soft inner and outer edges so the crescent has no hard boundary
    float edge = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.68, vUv.y);
    float alpha = along * edge * uOpacity;
    vec3 col = mix(uColor, uEdgeColor, vUv.y);
    // White-hot leading edge
    col = mix(col, vec3(1.0, 1.0, 0.96), smoothstep(0.75, 1.0, along) * 0.85);
    col *= 1.7;
    gl_FragColor = vec4(col, alpha);
    if (alpha < 0.004) discard;
  }
`;

function spawnSlashArc(position, facing, opts = {}) {
  const {
    color = 0xeeeeff,
    edgeColor = 0xccaa44,
    radius = 2.0,
    duration = 0.22,
    tilt = -0.35,
    height = 1.0,
  } = opts;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uEdgeColor: { value: new THREE.Color(edgeColor) },
      uProgress: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: shockwaveVertexShader,
    fragmentShader: slashArcFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(getArcGeometry(), mat);
  mesh.position.set(position.x, position.y + height, position.z);
  mesh.scale.setScalar(radius);
  // The arc's midpoint sits at local +X, while a character's facing vector is
  // (sin ry, 0, cos ry) — hence the quarter-turn offset. Then tip the plane so
  // the crescent reads as an arc rather than a flat disc.
  mesh.rotation.set(0, facing - Math.PI / 2, 0);
  mesh.rotateX(tilt);
  scene.add(mesh);

  slashArcs.push({ mesh, mat, life: duration, maxLife: duration });
}

function updateSlashArcs(dt) {
  for (let i = slashArcs.length - 1; i >= 0; i--) {
    const a = slashArcs[i];
    a.life -= dt;
    const t = 1 - a.life / a.maxLife;
    // Wipe on fast, then hold briefly while fading
    a.mat.uniforms.uProgress.value = Math.min(1.35, t * 2.1);
    a.mat.uniforms.uOpacity.value = t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
    a.mesh.scale.setScalar(a.mesh.scale.x * (1 + dt * 0.45));
    if (a.life <= 0) {
      scene.remove(a.mesh);
      a.mat.dispose();
      slashArcs.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9 — PERSISTENT AURA EFFECTS (power-ups)
// ═══════════════════════════════════════════════════════════════════════════

const activeAuras = new Map(); // characterMesh -> [{ type, ... }]

function addAura(characterMesh, type, config) {
  if (!activeAuras.has(characterMesh)) activeAuras.set(characterMesh, []);
  const auras = activeAuras.get(characterMesh);
  // Remove existing aura of same type
  removeAura(characterMesh, type);

  const aura = { type, timer: 0, ...config };

  if (type === 'defense') {
    // Shield sphere
    const geo = new THREE.SphereGeometry(1.2, 16, 12);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(config.color || 0x4488ff) },
        uOpacity: { value: 0.15 },
        uHitFlash: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = -normalize(mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uHitFlash;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
          fresnel = pow(fresnel, 2.5);
          float noise = sin(vNormal.x * 10.0 + uTime * 3.0) * sin(vNormal.y * 8.0 + uTime * 2.0) * 0.15;
          float alpha = (fresnel * 0.5 + noise + 0.05) * uOpacity + uHitFlash * 0.4;
          vec3 col = uColor * (1.0 + fresnel * 0.5);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shieldMesh = new THREE.Mesh(geo, mat);
    shieldMesh.frustumCulled = false;
    characterMesh.add(shieldMesh);
    // Position relative to character
    shieldMesh.position.set(0, 0.4, 0);
    aura.mesh = shieldMesh;
    aura.geo = geo;
    aura.mat = mat;
  }

  auras.push(aura);
}

function removeAura(characterMesh, type) {
  const auras = activeAuras.get(characterMesh);
  if (!auras) return;
  for (let i = auras.length - 1; i >= 0; i--) {
    if (auras[i].type === type) {
      const a = auras[i];
      if (a.mesh) { characterMesh.remove(a.mesh); a.geo?.dispose(); a.mat?.dispose(); }
      auras.splice(i, 1);
    }
  }
}

function flashShield(characterMesh) {
  const auras = activeAuras.get(characterMesh);
  if (!auras) return;
  for (const a of auras) {
    if (a.type === 'defense' && a.mat) {
      a.mat.uniforms.uHitFlash.value = 1;
    }
  }
}

function updateAuras(dt) {
  for (const [mesh, auras] of activeAuras) {
    for (const a of auras) {
      a.timer += dt;

      if (a.type === 'defense' && a.mat) {
        a.mat.uniforms.uTime.value = a.timer;
        // Decay hit flash
        if (a.mat.uniforms.uHitFlash.value > 0) {
          a.mat.uniforms.uHitFlash.value = Math.max(0, a.mat.uniforms.uHitFlash.value - dt * 5);
        }
      }

      // Persistent particle auras (attack boost, speed, xp, etc)
      if (a.particleInterval && a.timer > a._nextParticle) {
        a._nextParticle = a.timer + a.particleInterval;
        const pos = new THREE.Vector3();
        mesh.getWorldPosition(pos);
        if (a.particlePreset) a.particlePreset(pos);
      }
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — VFX MANAGER (semantic API)
// ═══════════════════════════════════════════════════════════════════════════

// Temp vectors for internal calculations
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpBasisZ = new THREE.Vector3();
let _vfxElapsed = 0;
// Emission-rate accumulators for the continuous wave-event ambience
const _ambienceAcc = { t: 0 };
const _trailBase = new THREE.Vector3();
const _trailTipLocal = new THREE.Vector3();
const _trailTipWorld = new THREE.Vector3();

const trailInstances = new Map(); // characterMesh -> WeaponTrail

const manager = {
  // Set by the game: (hexColor, strength) → brief full-screen flash in the post pass
  onScreenFlash: null,
  // ─── Initialization ───
  init() {
    generateTextures();
    initDistortion();
  },

  // Heat haze — see the HEAT DISTORTION section. The game calls
  // renderDistortion() just before its composer render and feeds the returned
  // texture to the post-processing pass.
  renderDistortion,
  resizeDistortion,
  heatDistortion: spawnHeatDistortion,
  get distortionTexture() { return distortRT ? distortRT.texture : null; },

  // ─── Per-frame update ───
  update(dt) {
    _vfxElapsed += dt;

    // Refresh the camera basis once, then every particle billboards against it.
    // updateMatrixWorld is needed because matrixWorld is otherwise only refreshed
    // during render, which would leave billboards a frame behind the camera.
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(_camRight, _camUp, _tmpBasisZ);

    // Update all particle groups
    for (const group of Object.values(particleGroups)) {
      group.update(dt, _vfxElapsed);
    }
    updateImpactFlashes(dt);
    updateDecals(dt);
    updateVFXLights(dt);
    updatePendingShockwaves(dt);
    updateShockwaves(dt);
    updateSlashArcs(dt);
    updateLightning(dt);
    updateRuneCircles(dt);
    updateDistortions(dt);
    updateAuras(dt);

    // Update trails
    for (const trail of trailInstances.values()) {
      trail.update(dt);
    }
  },

  // ─── Quality ───
  setQuality,
  setParticleScale,

  // Live particle counts, for the lab's readout
  stats() {
    let live = 0, groups = 0;
    for (const g of Object.values(particleGroups)) { live += g.count; groups++; }
    return { live, groups, decals: decals.length, lights: vfxLights.length, arcs: slashArcs.length };
  },

  // Run a VFX call after a delay, measured in frames rather than wall time so a
  // game reset cancels it instead of letting it fire into the new run.
  after(delay, fn) {
    queueEffect(delay, fn);
  },

  // ─── MELEE COMBAT ───

  meleeSwing(characterMesh, weaponType = 'sword') {
    // Start weapon trail
    let trail = trailInstances.get(characterMesh);
    const style = TRAIL_STYLES[weaponType] || TRAIL_STYLES.sword;
    // Rebuild when the weapon changes look — otherwise an evolved blade would
    // keep the trail colour it was first created with.
    if (trail && trail._styleKey !== weaponType) {
      trail.dispose();
      trailInstances.delete(characterMesh);
      trail = null;
    }
    if (!trail) {
      trail = new WeaponTrail(style.color, style.width, style.duration, style.secondary);
      trail._styleKey = weaponType;
      trailInstances.set(characterMesh, trail);
    }
    trail.start();

    // Stylised crescent in the swing direction
    const arc = ARC_STYLES[weaponType] || ARC_STYLES.sword;
    spawnSlashArc(characterMesh.position, characterMesh.rotation.y, arc);
  },

  // Call every frame during attack animation to update trail
  updateTrail(characterMesh) {
    const trail = trailInstances.get(characterMesh);
    if (!trail) return;
    const handBone = findBone(characterMesh, 'RIGHT_HAND');
    if (!handBone) return;

    handBone.getWorldPosition(_trailBase);

    _trailTipLocal.set(0, 0.8, 0);
    _trailTipWorld.copy(_trailTipLocal).applyMatrix4(handBone.matrixWorld);

    const base = _trailBase;
    const tipWorld = _trailTipWorld;

    trail.addPoint(base, tipWorld);

    // Emit trail sparkles along the sweep
    if (trail.active && Math.random() < 0.6) {
      const sparkGroup = getGroup('spark', THREE.AdditiveBlending);
      const mid = _tmpV1.lerpVectors(base, tipWorld, 0.3 + Math.random() * 0.5);
      sparkGroup.emit({
        x: mid.x + (Math.random() - 0.5) * 0.2,
        y: mid.y + (Math.random() - 0.5) * 0.2,
        z: mid.z + (Math.random() - 0.5) * 0.2,
        color: 0xffeedd,
        sizeStart: 0.12, sizeEnd: 0.02,
        life: 0.1 + Math.random() * 0.08,
        opacityStart: 0.7, opacityEnd: 0,
        gravity: 3,
      });
    }
  },

  meleeImpact(position, normal, type = 'sword') {
    // Bright impact flash
    const flashColor = type === 'club' ? 0xffaa44 : 0xffffff;
    spawnImpactFlash(position, flashColor, type === 'club' ? 2.5 : 1.8, 0.1);

    // Sparks burst — more particles, wider spread
    const sparkColor = type === 'club' ? 0xffaa44 : 0xffffcc;
    preset_sparks(position, sparkColor, type === 'club' ? 16 : 10, type === 'club' ? 10 : 7);

    // Directional slash particles — emit along the hit direction
    if (normal) {
      const group = getGroup('streak', THREE.AdditiveBlending);
      const slashCount = Math.ceil(6 * quality.particleMul);
      for (let i = 0; i < slashCount; i++) {
        const spread = (Math.random() - 0.5) * 2;
        const perpX = -normal.z;
        const perpZ = normal.x;
        group.emit({
          x: position.x + normal.x * 0.3 + perpX * spread * 0.5,
          y: position.y + 0.3 + Math.random() * 0.8,
          z: position.z + normal.z * 0.3 + perpZ * spread * 0.5,
          vx: normal.x * (3 + Math.random() * 4) + perpX * spread * 2,
          vy: 0.5 + Math.random() * 1.5,
          vz: normal.z * (3 + Math.random() * 4) + perpZ * spread * 2,
          color: 0xffeedd,
          sizeStart: 0.25 + Math.random() * 0.15, sizeEnd: 0.02,
          life: 0.12 + Math.random() * 0.15,
          opacityStart: 0.9, opacityEnd: 0,
          drag: 3,
          rotation: Math.atan2(normal.x, normal.z) + spread * 0.3,
        });
      }
    }

    // Hot embers on hit
    preset_embers(position, 3);

    // Dust + ground crack for heavy weapons
    if (type === 'club' || type === 'boss') {
      preset_dust(position, 8, 0x887766);
      manager.groundCrack(position, type === 'boss' ? 1.5 : 1.0);
    }

    // Dynamic light — brighter, wider
    spawnVFXLight(position, flashColor, 2.5, 8, 0.18);
  },

  bloodImpact(position, direction, strength = 1) {
    // More blood droplets with wider spread
    preset_blood(position, direction, Math.ceil(14 * strength), strength);

    // Blood streaks — fast directional trails
    if (direction && strength > 0.4) {
      const streakGroup = getGroup('streak', THREE.NormalBlending);
      const streakCount = Math.ceil(4 * strength * quality.particleMul);
      for (let i = 0; i < streakCount; i++) {
        const spread = (Math.random() - 0.5) * 0.6;
        streakGroup.emit({
          x: position.x, y: position.y + 0.4 + Math.random() * 0.4, z: position.z,
          vx: direction.x * (5 + Math.random() * 6) + spread * 3,
          vy: 1 + Math.random() * 3,
          vz: direction.z * (5 + Math.random() * 6) + spread * 3,
          color: 0xcc2211, colorEnd: 0x440000,
          sizeStart: 0.2 * strength, sizeEnd: 0.04,
          life: 0.15 + Math.random() * 0.12,
          opacityStart: 0.8, opacityEnd: 0.1,
          gravity: 14,
          rotation: Math.atan2(direction.x, direction.z),
        });
      }
    }

    // Ground blood decal — more frequent, varies size
    if (Math.random() < 0.45 * strength) {
      spawnGroundDecal(position, 0x770000, 0.6 + Math.random() * 1.0, 'bloodSplat');
    }
  },

  // ─── PROJECTILES ───

  // Each projectile variant gets its own read. The two evolved forms are named
  // after fire and lightning in the upgrade text, so they look like fire and
  // lightning rather than like brighter versions of the base shot.
  projectileTrail(projectile, type = 'arrow') {
    const pos = projectile.mesh.position;
    const dir = projectile.direction;
    const style = PROJECTILE_STYLES[type] || PROJECTILE_STYLES.arrow;

    // Core glow riding with the projectile
    getGroup('softCircle', THREE.AdditiveBlending).emit({
      x: pos.x, y: pos.y, z: pos.z,
      color: style.core, colorEnd: style.tail,
      sizeStart: style.coreSize, sizeEnd: 0.02,
      life: 0.13,
      opacityStart: 0.85, opacityEnd: 0,
      drag: 6,
    });

    // The streak is stretched along the actual direction of travel. The old code
    // rolled a flat sprite by the world heading, which only lined up when the
    // projectile happened to fly across the screen.
    getGroup('streakV', THREE.AdditiveBlending).emit({
      x: pos.x, y: pos.y, z: pos.z,
      color: style.core, colorEnd: style.tail,
      sizeStart: 0.34, sizeEnd: 0.06,
      aspect: 0.3,
      stretch: 0.22,
      vx: dir.x, vy: dir.y || 0, vz: dir.z,
      life: 0.2,
      opacityStart: 0.65, opacityEnd: 0,
      drag: 4,
    });

    if (style.smoke && Math.random() < 0.5) {
      getGroup('smoke', THREE.NormalBlending).emit({
        x: pos.x, y: pos.y, z: pos.z,
        color: 0x4a3a30, colorEnd: 0x181410,
        sizeStart: 0.3, sizeEnd: 0.9,
        life: 0.5, sizeEase: 0.5, turbulence: 0.5,
        opacityStart: 0.3, opacityEnd: 0,
        rotation: Math.random() * 6.283, rotSpeed: (Math.random() - 0.5) * 2,
      });
    }

    if (Math.random() < style.sparkChance) {
      getGroup('spark', THREE.AdditiveBlending).emit({
        x: pos.x + (Math.random() - 0.5) * 0.3,
        y: pos.y + (Math.random() - 0.5) * 0.2,
        z: pos.z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3,
        color: style.spark,
        sizeStart: 0.13, sizeEnd: 0.02,
        aspect: 0.35, stretch: 0.04,
        life: 0.1 + Math.random() * 0.1,
        opacityStart: 0.8, opacityEnd: 0,
      });
    }
  },

  // ─── MAGIC ───

  fireball(origin, target) {
    preset_fire(origin, 15);
    spawnVFXLight(origin, 0xff6600, 3, 10, 0.5);
  },

  // A real blast is a sequence, not a single frame: a white flash, then the
  // fireball, then debris, then a smoke plume that outlives all of it. Firing
  // every layer on the same frame is what made this read as a coloured puff.
  explosion(position, size = 3) {
    const s = size / 3;
    const p = { x: position.x, y: position.y, z: position.z };

    // ── t=0 — the flash and the pressure wave
    spawnImpactFlash(p, 0xfff0c0, size * 2.2, 0.09);
    spawnVFXLight(p, 0xffaa44, 6, size * 4.5, 0.12);
    spawnHeatDistortion(p, size * 1.3, 0.5, 1.0);
    spawnShockwave(p, 0xffcc66, size * 2.5, 0.42);

    // White-hot core, gone almost immediately
    emitBurst('softCircle', Math.ceil(10 * s), {
      x: p.x, y: p.y + 0.4, z: p.z,
      color: 0xfffbe8, colorEnd: 0xffa030,
      sizeStart: 1.1 * size * 0.4, sizeEnd: 0.2,
      life: 0.14, drag: 4, opacityStart: 1, opacityEnd: 0, sizeEase: 0.5,
    }, (cfg) => {
      const a = Math.random() * 6.283, sp = (1 + Math.random() * 4) * s;
      cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp;
      cfg.vy = 1 + Math.random() * 3;
      cfg.life = 0.08 + Math.random() * 0.12;
    });

    // ── t=0 — debris flung outward, stretched along its own travel
    preset_sparks(p, 0xffc040, Math.ceil(22 * s), 13);

    // ── t≈1 frame — the fireball proper, after the flash has peaked
    queueEffect(0.035, () => {
      preset_fire(p, Math.ceil(24 * s));
      spawnVFXLight(p, 0xff6600, 4, size * 4, 0.45);
      spawnShockwave(p, 0xff7722, size * 1.6, 0.3, 0.2);
    });

    // ── t≈0.1s — dust kicked off the ground, outward and low
    queueEffect(0.1, () => {
      preset_dust(p, Math.ceil(12 * s), 0x6b5b45);
      preset_embers(p, Math.ceil(9 * s));
    });

    // ── t≈0.18s — the plume, which outlasts everything else by a second
    queueEffect(0.18, () => {
      emitBurst('smoke', Math.ceil(11 * s), {
        x: p.x, y: p.y + 0.5, z: p.z,
        colorStops: [0x7a6b55, 0x4e4538, 0x2a241b, 0x100e0a],
        sizeStart: 0.8 * size * 0.45, sizeEnd: 2.6 * size * 0.45,
        life: 1.6, drag: 1.4,
        opacityStart: 0.46, opacityEnd: 0,
        sizeEase: 0.45, turbulence: 0.7, fadeIn: 0.15,
        erode: 0.95, lit: 0.9,
      }, (cfg) => {
        const a = Math.random() * 6.283, sp = (0.6 + Math.random() * 1.8) * s;
        cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp;
        cfg.vy = 1.4 + Math.random() * 1.8;
        cfg.life = 1.1 + Math.random() * 0.9;
        cfg.rotation = Math.random() * 6.283;
        cfg.rotSpeed = (Math.random() - 0.5) * 1.1;
      });
    });

    // Scorch stays behind
    spawnGroundDecal(p, 0x1c1713, size * 1.1, 'smoke');
  },

  lightning(start, end) {
    preset_sparks(start, 0x88ccff, 4, 4);
    preset_sparks(end, 0xaaddff, 8, 6);
    spawnImpactFlash(end, 0x88ccff, 2.2, 0.12);
    spawnVFXLight(end, 0x88ccff, 4, 12, 0.22);
    const b = spawnBolt(start, end, {
      layers: [{ width: 0.9, color: 0x5f8fff, opacity: 0.45 }, { width: 0.36, color: 0xbcd6ff, opacity: 0.9 }, { width: 0.13, color: 0xffffff, opacity: 1 }],
      life: 0.18, jag: 0.9, forks: 2, forkLen: 0.3, rejitters: 2,
    });
    if (!b) return;
    const sparkGroup = getGroup('spark', THREE.AdditiveBlending);
    const n = Math.ceil(6 * quality.particleMul);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      sparkGroup.emit({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t + (Math.random() - 0.5) * 0.4, z: start.z + (end.z - start.z) * t,
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4,
        color: 0xaaddff, sizeStart: 0.12, sizeEnd: 0.02, life: 0.1 + Math.random() * 0.15, opacityStart: 0.8, opacityEnd: 0, drag: 5 });
    }
  },

  // Storm Call's strike: a bolt from the clouds, not an arc between two heads.
  // Sky flash → thick forked column → impact flash, ground arcs, ring, sparks,
  // scorch and a brief screen flash. `evolved` (Wrath of Heaven) is wider, forks
  // to the ground and hits the screen harder.
  thunderStrike(pos, evolved = false) {
    const top = { x: pos.x + (Math.random() - 0.5) * 4, y: pos.y + 26, z: pos.z + (Math.random() - 0.5) * 4 };
    const hit = { x: pos.x, y: pos.y + 0.5, z: pos.z };
    const w = evolved ? 1.5 : 1.0;
    spawnImpactFlash({ x: top.x, y: top.y - 4, z: top.z }, 0x9fbfff, 14 * w, 0.16);
    spawnVFXLight({ x: pos.x, y: pos.y + 6, z: pos.z }, 0xbfd8ff, evolved ? 14 : 10, 26, 0.32);
    spawnBolt(top, hit, {
      layers: [{ width: 2.6 * w, color: 0x3f7bff, opacity: 0.4 }, { width: 1.1 * w, color: 0x9ec4ff, opacity: 0.85 }, { width: 0.32 * w, color: 0xffffff, opacity: 1 }],
      life: evolved ? 0.36 : 0.3, jag: 0.9, forks: evolved ? 6 : 4, forkLen: 0.35, rejitters: 3, taper: true,
    });
    if (evolved) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.283, d = 2.5 + Math.random() * 3;
        spawnBolt({ x: top.x, y: top.y - 8 - Math.random() * 6, z: top.z }, { x: pos.x + Math.cos(a) * d, y: pos.y + 0.3, z: pos.z + Math.sin(a) * d },
          { layers: [{ width: 1.2, color: 0x3f7bff, opacity: 0.35 }, { width: 0.4, color: 0xbcd6ff, opacity: 0.9 }], life: 0.22, jag: 1.1, forks: 1, rejitters: 2, taper: true });
      }
    }
    spawnImpactFlash(hit, 0xdde9ff, 4.5 * w, 0.14);
    spawnHeatDistortion(hit, 2.2 * w, 0.35, 0.8);
    spawnShockwave(hit, 0xbfe0ff, (evolved ? 7 : 5.5), 0.42, 0.12);
    queueShockwave(0.05, hit, 0xffffff, 2.6 * w, 0.28, 0.15);
    const arcs = Math.ceil((evolved ? 8 : 5) * quality.particleMul);
    for (let i = 0; i < arcs; i++) {
      const a = (i / arcs) * 6.283 + Math.random() * 0.8, d = (1.5 + Math.random() * 2.5) * w;
      spawnBolt({ x: pos.x, y: pos.y + 0.25, z: pos.z }, { x: pos.x + Math.cos(a) * d, y: pos.y + 0.15, z: pos.z + Math.sin(a) * d },
        { layers: [{ width: 0.5, color: 0x5f8fff, opacity: 0.4 }, { width: 0.14, color: 0xe8f2ff, opacity: 1 }], life: 0.16 + Math.random() * 0.08, jag: 1.4, forks: 0, rejitters: 1, taper: true });
    }
    preset_sparks(hit, 0xcfe4ff, Math.ceil(24 * w), 12);
    preset_dust(hit, Math.ceil(10 * w), 0x8899aa);
    emitBurst('softCircle', Math.ceil(10 * w), {
      x: pos.x, y: pos.y + 0.3, z: pos.z, color: 0xdde9ff, colorEnd: 0x4f7fff,
      sizeStart: 0.3, sizeEnd: 0.05, life: 0.6, opacityStart: 0.9, opacityEnd: 0, turbulence: 0.8, drag: 1.2,
    }, (cfg) => { const a = Math.random() * 6.283, r = Math.random() * 1.2 * w; cfg.x += Math.cos(a) * r; cfg.z += Math.sin(a) * r; cfg.vy = 2 + Math.random() * 4; cfg.life = 0.35 + Math.random() * 0.4; });
    spawnGroundDecal(hit, 0x0a0c16, 2.4 * w, 'smoke');
    if (manager.onScreenFlash) manager.onScreenFlash(0xdde8ff, evolved ? 0.42 : 0.28);
  },

  heal(characterMesh) {
    const pos = new THREE.Vector3();
    characterMesh.getWorldPosition(pos);
    preset_heal(pos, 15);

    // Rising heal column — green particles streaming upward
    const colGroup = getGroup('softCircle', THREE.AdditiveBlending);
    const colCount = Math.ceil(14 * quality.particleMul);
    for (let i = 0; i < colCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.3;
      colGroup.emit({
        x: pos.x + Math.cos(angle) * r,
        y: pos.y + Math.random() * 0.5,
        z: pos.z + Math.sin(angle) * r,
        vy: 4 + Math.random() * 4,
        vx: Math.cos(angle) * 0.3,
        vz: Math.sin(angle) * 0.3,
        color: 0x66ff88, colorEnd: 0xaaffcc,
        sizeStart: 0.2, sizeEnd: 0.04,
        life: 0.3 + Math.random() * 0.4,
        opacityStart: 0.7, opacityEnd: 0,
        drag: 1,
      });
    }

    // Cross shape — 4 directional bursts
    const crossGroup = getGroup('star', THREE.AdditiveBlending);
    for (let d = 0; d < 4; d++) {
      const a = d * Math.PI / 2;
      for (let j = 0; j < 3; j++) {
        crossGroup.emit({
          x: pos.x + Math.cos(a) * (0.3 + j * 0.4),
          y: pos.y + 1.2,
          z: pos.z + Math.sin(a) * (0.3 + j * 0.4),
          vx: Math.cos(a) * (1 + j), vy: 0.5, vz: Math.sin(a) * (1 + j),
          color: 0x88ffaa,
          sizeStart: 0.18 - j * 0.03, sizeEnd: 0.02,
          life: 0.2 + j * 0.05,
          opacityStart: 0.8, opacityEnd: 0,
          rotSpeed: 3,
        });
      }
    }

    // Ground glow ring
    spawnGroundDecal(pos, 0x22aa44, 1.5, 'ring');
    spawnImpactFlash(pos, 0x66ff88, 2.0, 0.12);
    spawnVFXLight(pos, 0x44ff66, 2.5, 12, 0.6);
  },

  // ─── POWER-UP EFFECTS ───

  attackBoost(characterMesh) {
    addAura(characterMesh, 'attackBoost', {
      color: 0xff4444,
      particleInterval: 0.15,
      _nextParticle: 0,
      particlePreset: (pos) => {
        const group = getGroup('spark', THREE.AdditiveBlending);
        group.emit({
          x: pos.x + (Math.random() - 0.5) * 1.5,
          y: pos.y + 0.5 + Math.random(),
          z: pos.z + (Math.random() - 0.5) * 1.5,
          color: 0xff6644,
          sizeStart: 0.15, sizeEnd: 0.03,
          life: 0.3, vy: 1,
          opacityStart: 0.8, opacityEnd: 0,
        });
      }
    });
  },

  rangedBoost(characterMesh) {
    addAura(characterMesh, 'rangedBoost', {
      color: 0x44aaff,
      particleInterval: 0.2,
      _nextParticle: 0,
      particlePreset: (pos) => {
        const group = getGroup('softCircle', THREE.AdditiveBlending);
        group.emit({
          x: pos.x + (Math.random() - 0.5) * 1.2,
          y: pos.y + Math.random() * 1.5,
          z: pos.z + (Math.random() - 0.5) * 1.2,
          color: 0x44aaff,
          sizeStart: 0.15, sizeEnd: 0.05,
          life: 0.4, vy: 0.5,
          opacityStart: 0.6, opacityEnd: 0,
        });
      }
    });
  },

  attackSpeedBoost(characterMesh) {
    addAura(characterMesh, 'attackSpeed', {
      color: 0xffaa00,
      particleInterval: 0.1,
      _nextParticle: 0,
      particlePreset: (pos) => {
        const group = getGroup('streak', THREE.AdditiveBlending);
        const angle = Math.random() * Math.PI * 2;
        group.emit({
          x: pos.x + Math.cos(angle) * 0.8,
          y: pos.y + 0.5 + Math.random() * 1.5,
          z: pos.z + Math.sin(angle) * 0.8,
          color: 0xffcc44,
          sizeStart: 0.2, sizeEnd: 0.05,
          life: 0.2, vy: 2,
          opacityStart: 0.7, opacityEnd: 0,
          rotation: angle,
        });
      }
    });
  },

  movementSpeedBoost(characterMesh) {
    addAura(characterMesh, 'speed', {
      color: 0xffcc00,
      particleInterval: 0.06,
      _nextParticle: 0,
      particlePreset: (pos) => {
        const group = getGroup('dust', THREE.NormalBlending);
        group.emit({
          x: pos.x + (Math.random() - 0.5) * 0.5,
          y: pos.y + 0.05,
          z: pos.z + (Math.random() - 0.5) * 0.5,
          color: 0xddcc88,
          sizeStart: 0.3, sizeEnd: 0.6,
          life: 0.3, vy: 0.3, drag: 3,
          opacityStart: 0.3, opacityEnd: 0,
        });
      }
    });
  },

  defenseBoost(characterMesh, color = 0x4488ff) {
    addAura(characterMesh, 'defense', { color });
  },

  xpBoost(characterMesh) {
    addAura(characterMesh, 'xpBoost', {
      color: 0xffd700,
      particleInterval: 0.12,
      _nextParticle: 0,
      particlePreset: (pos) => {
        const group = getGroup('star', THREE.AdditiveBlending);
        const angle = Math.random() * Math.PI * 2;
        const r = 0.8 + Math.random() * 0.3;
        group.emit({
          x: pos.x + Math.cos(angle) * r,
          y: pos.y + 0.3 + Math.random() * 1.5,
          z: pos.z + Math.sin(angle) * r,
          color: 0xffd700,
          sizeStart: 0.12, sizeEnd: 0.06,
          life: 0.5, gravity: -0.5,
          opacityStart: 0.8, opacityEnd: 0,
          rotSpeed: 3,
        });
      }
    });
  },

  removeBoost(characterMesh, type) {
    removeAura(characterMesh, type);
  },

  // ─── ENEMY DEATH ───

  enemyDeath(position, type = 'goblin') {
    const configs = {
      goblin:      { color: 0x44aa44, count: 14, sparkColor: 0x88cc88, flashColor: 0x66dd66, soulColor: 0x88ff88 },
      rat:         { color: 0x666666, count: 5,  sparkColor: 0x999999, flashColor: 0x888888, soulColor: 0xaaaaaa },
      goblinBomb:  { color: 0xff6600, count: 25, sparkColor: 0xffaa44, flashColor: 0xff4400, soulColor: 0xff8844 },
      wolf:        { color: 0x667788, count: 8,  sparkColor: 0x8899aa, flashColor: 0x7799bb, soulColor: 0xaabbcc },
      bat:         { color: 0x553388, count: 6,  sparkColor: 0x7744aa, flashColor: 0x6633bb, soulColor: 0x9966dd },
      ogre:        { color: 0x884422, count: 20, sparkColor: 0xaa8844, flashColor: 0xcc8844, soulColor: 0xddaa66 },
      boss:        { color: 0xcc4444, count: 35, sparkColor: 0xff6644, flashColor: 0xff4444, soulColor: 0xff8866 },
      dragonOgre:  { color: 0xff6622, count: 40, sparkColor: 0xffaa44, flashColor: 0xff8800, soulColor: 0xffcc44 },
    };
    const cfg = configs[type] || configs.goblin;
    const isBig = type === 'boss' || type === 'dragonOgre';

    // Blood burst
    preset_blood(position, null, cfg.count, isBig ? 1.5 : 1.0);

    // Sparks — more and faster
    preset_sparks(position, cfg.sparkColor, Math.ceil(cfg.count * 0.6), isBig ? 10 : 7);

    // Bright flash — bigger
    const flashSize = type === 'boss' ? 4 : type === 'dragonOgre' ? 5 : type === 'ogre' ? 2.5 : 1.6;
    spawnImpactFlash(position, cfg.flashColor, flashSize, 0.14);

    // Soul-release particles — upward rising wisps
    const soulGroup = getGroup('softCircle', THREE.AdditiveBlending);
    const soulCount = Math.ceil((isBig ? 12 : 6) * quality.particleMul);
    for (let i = 0; i < soulCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      soulGroup.emit({
        x: position.x + Math.cos(angle) * r,
        y: position.y + 0.3 + Math.random() * 0.5,
        z: position.z + Math.sin(angle) * r,
        vy: 2 + Math.random() * 3,
        // Drift inward rather than outward — wisps gathering as they rise reads
        // as a soul leaving the body, where a straight spray reads as debris.
        vx: -Math.cos(angle) * 0.9 + (Math.random() - 0.5) * 0.8,
        vz: -Math.sin(angle) * 0.9 + (Math.random() - 0.5) * 0.8,
        color: cfg.soulColor, colorEnd: cfg.color,
        sizeStart: isBig ? 0.4 : 0.25, sizeEnd: 0.03,
        life: 0.5 + Math.random() * 0.5,
        opacityStart: 0.8, opacityEnd: 0, opacityEase: 1.7,
        turbulence: 0.7, drag: 1.5,
      });
    }

    // Dust cloud
    preset_dust(position, Math.ceil(cfg.count * 0.4));

    // Embers
    if (type !== 'wolf') preset_embers(position, isBig ? 6 : 3);

    // Boss/dragon shockwave + ground decal
    if (isBig) {
      spawnShockwave(position, cfg.flashColor, type === 'dragonOgre' ? 10 : 6, 0.6);
      spawnVFXLight(position, cfg.flashColor, 4, 15, 0.5);
      spawnGroundDecal(position, 0x333333, 2 + Math.random() * 1.5, 'smoke');
      // Second delayed shockwave for boss grandeur
      queueShockwave(0.1, position, cfg.soulColor, type === 'dragonOgre' ? 6 : 4, 0.4);
    } else {
      // Small ground scorch for regular enemies
      if (Math.random() < 0.3) {
        spawnGroundDecal(position, 0x442222, 0.4 + Math.random() * 0.5, 'bloodSplat');
      }
      spawnVFXLight(position, cfg.flashColor, 1.5, 6, 0.2);
      // A quick, tight ring. Ordinary kills are the most repeated moment in the
      // game, so they need a crisp punctuation mark rather than a big one.
      spawnShockwave(position, cfg.soulColor, type === 'ogre' ? 3 : 1.8, 0.22, 0.1);
    }
  },

  // ─── BOSS-SPECIFIC ───

  bossImpact(position, type = 'boss') {
    const size = type === 'dragonOgre' ? 4 : 3;
    this.explosion(position, size);
    // Extra debris
    preset_sparks(position, 0x886644, 10, 12);
  },

  bossSlam(position) {
    // Primary shockwave — large
    spawnShockwave(position, 0xffaa44, 10, 0.6);
    spawnHeatDistortion(position, 5, 0.6, 1.1);
    // Secondary shockwave — delayed, smaller, different color
    queueShockwave(0.08, position, 0xff6622, 6, 0.4);

    // Massive dust cloud
    preset_dust(position, 18, 0x776655);

    // Debris sparks — faster, more numerous
    preset_sparks(position, 0xddaa44, 14, 12);

    // Flying rock debris particles
    const debrisGroup = getGroup('hardCircle', THREE.NormalBlending);
    const debrisCount = Math.ceil(10 * quality.particleMul);
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      debrisGroup.emit({
        x: position.x + (Math.random() - 0.5) * 2,
        y: position.y + 0.5 + Math.random(),
        z: position.z + (Math.random() - 0.5) * 2,
        vx: Math.cos(angle) * speed,
        vy: 4 + Math.random() * 6,
        vz: Math.sin(angle) * speed,
        color: 0x887766,
        sizeStart: 0.15 + Math.random() * 0.15, sizeEnd: 0.05,
        life: 0.4 + Math.random() * 0.4,
        opacityStart: 0.9, opacityEnd: 0.3,
        gravity: 18,
        floorY: 0.05,
        bounceDecay: 0.2,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }

    // Bright flash
    spawnImpactFlash(position, 0xffcc44, 4, 0.18);

    // Strong light
    spawnVFXLight(position, 0xff8800, 5, 15, 0.5);

    // Ground crack decal
    spawnGroundDecal(position, 0x333333, 2.5 + Math.random() * 1.5, 'dust');

    // Embers rising from crater
    preset_embers(position, 8);
  },

  bossFireBreath(position, direction) {
    preset_fire(position, 25);
    preset_embers(position, 12);
    // Directional flame particles
    if (direction) {
      const flameGroup = getGroup('flame', THREE.AdditiveBlending);
      const count = Math.ceil(10 * quality.particleMul);
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 1.5;
        flameGroup.emit({
          x: position.x, y: position.y + 0.5 + Math.random() * 0.5, z: position.z,
          vx: direction.x * (6 + Math.random() * 6) + spread,
          vy: 1 + Math.random() * 2,
          vz: direction.z * (6 + Math.random() * 6) + spread,
          color: 0xff6600, colorEnd: 0xff2200,
          sizeStart: 0.6 + Math.random() * 0.4, sizeEnd: 0.1,
          life: 0.2 + Math.random() * 0.2,
          opacityStart: 0.9, opacityEnd: 0,
          drag: 2,
        });
      }
    }
    spawnVFXLight(position, 0xff4400, 5, 18, 0.7);
    // Scorch ground
    if (Math.random() < 0.5) {
      spawnGroundDecal(position, 0x222222, 1 + Math.random(), 'smoke');
    }
  },

  // Danger zone marker. A rune circle sweeping closed reads as a countdown:
  // the player can see how much time is left from how far round it has drawn.
  //
  // The previous version pushed a *copy* of its state object into `shockwaves`,
  // so the original's `life` never decremented and the setInterval feeding it
  // particles never cleared — it leaked one timer per telegraph for the rest of
  // the session. Everything here is frame-driven and owned by the rune system.
  bossTelegraph(position, radius = 3, duration = 1.0) {
    spawnRuneCircle(position, {
      color: 0xff3311,
      radius,
      duration,
      sweep: 0.8,          // still drawing as the attack lands
      peakOpacity: 1.1,
      y: 0.07,
    });
    // Solid inner wash so the area reads as dangerous, not decorative
    spawnShockwave(position, 0xff2200, radius * 0.95, duration * 0.9, 0.05);
    const embers = Math.ceil(10 * quality.particleMul);
    for (let i = 0; i < embers; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      getGroup('softCircle', THREE.AdditiveBlending).emit({
        x: position.x + Math.cos(a) * r, y: 0.1, z: position.z + Math.sin(a) * r,
        vy: 1.1 + Math.random() * 1.3,
        color: 0xff6622, colorEnd: 0x551100,
        sizeStart: 0.2, sizeEnd: 0.04,
        life: duration * (0.5 + Math.random() * 0.5),
        opacityStart: 0.85, opacityEnd: 0,
        turbulence: 0.5,
      });
    }
  },

  // ─── MISC ───

  shieldHit(characterMesh) {
    flashShield(characterMesh);
  },

  collectEffect(position, type = 'coin') {
    if (type === 'coin') {
      preset_xp(position, 8);
      // Picking up a coin is the most repeated single moment in a run, so it gets
      // a short, bright pop rather than a lingering cloud: a quick flash, then
      // stars that fling out and snap away.
      spawnImpactFlash(position, 0xffe58a, 1.0, 0.07);
      const group = getGroup('star', THREE.AdditiveBlending);
      const count = Math.ceil(6 * quality.particleMul);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const s = 2.5 + Math.random() * 2;
        group.emit({
          x: position.x, y: position.y + 0.5, z: position.z,
          vx: Math.cos(angle) * s, vy: 2.5 + Math.random() * 2, vz: Math.sin(angle) * s,
          color: 0xfff0b0, colorEnd: 0xd9a020,
          sizeStart: 0.2, sizeEnd: 0.03,
          aspect: 0.6, stretch: 0.02,
          life: 0.22 + Math.random() * 0.15,
          opacityStart: 1, opacityEnd: 0, opacityEase: 2.4,
          rotSpeed: (Math.random() - 0.5) * 12, drag: 3,
        });
      }
    } else if (type === 'food') {
      preset_heal(position, 8);
      // Green sparkle burst upward
      spawnImpactFlash(position, 0x44ff66, 0.8, 0.08);
    } else if (type === 'chest') {
      preset_xp(position, 15);
      preset_sparks(position, 0xffd700, 12, 5);
      spawnImpactFlash(position, 0xffd700, 2.5, 0.15);
      spawnVFXLight(position, 0xffd700, 2.5, 8, 0.3);
      // Treasure sparkle spiral
      const spiralGroup = getGroup('star', THREE.AdditiveBlending);
      const spiralCount = Math.ceil(8 * quality.particleMul);
      for (let i = 0; i < spiralCount; i++) {
        const a = (i / spiralCount) * Math.PI * 3;
        spiralGroup.emit({
          x: position.x + Math.cos(a) * 0.5,
          y: position.y + 0.3 + (i / spiralCount) * 2,
          z: position.z + Math.sin(a) * 0.5,
          vx: Math.cos(a) * 1.5, vy: 3 + Math.random(), vz: Math.sin(a) * 1.5,
          color: 0xffd700, sizeStart: 0.2, sizeEnd: 0.04,
          life: 0.3 + Math.random() * 0.2, opacityStart: 0.8, opacityEnd: 0, rotSpeed: 6,
        });
      }
    } else if (type === 'health') {
      preset_heal(position, 12);
      spawnImpactFlash(position, 0x44ff66, 1.5, 0.12);
      spawnVFXLight(position, 0x44ff66, 2.5, 10, 0.4);
      // Green cross shimmer
      const crossGroup = getGroup('softCircle', THREE.AdditiveBlending);
      for (let i = 0; i < 4; i++) {
        crossGroup.emit({
          x: position.x, y: position.y + 0.5 + i * 0.4, z: position.z,
          vy: 2 + Math.random(), color: 0x66ff88,
          sizeStart: 0.3, sizeEnd: 0.05,
          life: 0.3 + Math.random() * 0.2, opacityStart: 0.6, opacityEnd: 0,
        });
      }
    } else if (type === 'speed') {
      preset_sparks(position, 0xffcc00, 10, 6);
      spawnImpactFlash(position, 0xffcc00, 1.8, 0.12);
      spawnVFXLight(position, 0xffcc00, 1.5, 6, 0.2);
    }
  },

  levelUp(characterMesh) {
    const pos = new THREE.Vector3();
    characterMesh.getWorldPosition(pos);

    // Gilded sigil under the hero, with energy drawn up out of it. Levelling is
    // one of the two moments a run stops for, so it gets the full staging.
    spawnRuneCircle(pos, { color: 0xffd257, radius: 3.2, duration: 1.5, sweep: 0.22, peakOpacity: 1.2 });
    manager.vortex(pos, 0xffe08a, { radius: 2.0, height: 4.5, count: 46, duration: 0.9 });

    // Golden magic burst
    preset_magic(pos, 0xffd700, 25);

    // Upward sparks
    preset_sparks(pos, 0xffee88, 16, 6);

    // Ground shockwave
    spawnShockwave(pos, 0xffd700, 5, 0.5);

    // Pillar of light — vertical column of particles
    const pillarGroup = getGroup('softCircle', THREE.AdditiveBlending);
    const pillarCount = Math.ceil(20 * quality.particleMul);
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.2;
      const h = Math.random() * 4;
      pillarGroup.emit({
        x: pos.x + Math.cos(angle) * r,
        y: pos.y + h,
        z: pos.z + Math.sin(angle) * r,
        vy: 4 + Math.random() * 4,
        color: 0xffd700, colorEnd: 0xffffff,
        sizeStart: 0.3, sizeEnd: 0.05,
        life: 0.4 + Math.random() * 0.4,
        opacityStart: 0.8, opacityEnd: 0,
        drag: 1,
      });
    }

    // Spiral particles orbiting upward
    const spiralGroup = getGroup('star', THREE.AdditiveBlending);
    const spiralCount = Math.ceil(12 * quality.particleMul);
    for (let i = 0; i < spiralCount; i++) {
      const a = (i / spiralCount) * Math.PI * 4; // two full rotations
      const r2 = 1.0 + i * 0.05;
      spiralGroup.emit({
        x: pos.x + Math.cos(a) * r2,
        y: pos.y + 0.5 + (i / spiralCount) * 3,
        z: pos.z + Math.sin(a) * r2,
        vx: -Math.sin(a) * 3,
        vy: 3 + Math.random() * 2,
        vz: Math.cos(a) * 3,
        color: 0xffee44,
        sizeStart: 0.2, sizeEnd: 0.04,
        life: 0.3 + Math.random() * 0.3,
        opacityStart: 0.9, opacityEnd: 0,
        rotSpeed: 5,
      });
    }

    // Ground ring glow
    spawnGroundDecal(pos, 0xffd700, 2.5, 'ring');

    // Bright dynamic light
    spawnVFXLight(pos, 0xffd700, 5, 14, 0.7);

    // Bright central flash
    spawnImpactFlash(pos, 0xffffff, 3, 0.15);
  },

  dashEffect(characterMesh, dirX, dirZ) {
    const pos = new THREE.Vector3();
    characterMesh.getWorldPosition(pos);

    // Speed lines — long streaks trailing behind
    const streakGroup = getGroup('streak', THREE.AdditiveBlending);
    const streakCount = Math.ceil(10 * quality.particleMul);
    for (let i = 0; i < streakCount; i++) {
      const offset = i * 0.4;
      streakGroup.emit({
        x: pos.x - dirX * offset + (Math.random() - 0.5) * 0.8,
        y: pos.y + 0.2 + Math.random() * 1.4,
        z: pos.z - dirZ * offset + (Math.random() - 0.5) * 0.8,
        vx: -dirX * 2, vz: -dirZ * 2,
        color: 0xaaccff,
        sizeStart: 0.35 + Math.random() * 0.15, sizeEnd: 0.03,
        life: 0.15 + i * 0.03,
        opacityStart: 0.6, opacityEnd: 0,
        rotation: Math.atan2(dirX, dirZ),
        drag: 4,
      });
    }

    // Ghost afterimage — larger transparent softCircles in player shape
    const ghostGroup = getGroup('softCircle', THREE.AdditiveBlending);
    for (let i = 0; i < 3; i++) {
      const t = i * 0.3;
      ghostGroup.emit({
        x: pos.x - dirX * t,
        y: pos.y + 0.8,
        z: pos.z - dirZ * t,
        color: 0x6688cc,
        sizeStart: 1.2 - i * 0.2, sizeEnd: 0.3,
        life: 0.15 + i * 0.05,
        opacityStart: 0.25 - i * 0.06, opacityEnd: 0,
        drag: 2,
      });
    }

    // Ground dust burst
    preset_dust(pos, 5, 0x998866);

    // Bright flash at dash origin
    spawnImpactFlash(pos, 0xaaccff, 1.0, 0.06);
  },

  // ─── HOLY AURA PULSE (replaces existing ring) ───
  auraPulse(position, radius, color = 0x66ccff) {
    // Expanding ring shockwave
    spawnShockwave(position, color, radius, 0.35);

    // Ring of magic particles around the pulse edge
    const count = Math.ceil(14 * quality.particleMul);
    const group = getGroup('star', THREE.AdditiveBlending);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = radius * (0.8 + Math.random() * 0.4);
      group.emit({
        x: position.x + Math.cos(angle) * r,
        y: position.y + 0.2 + Math.random() * 0.4,
        z: position.z + Math.sin(angle) * r,
        vx: Math.cos(angle) * 2.5,
        vy: 1.5 + Math.random() * 1.5,
        vz: Math.sin(angle) * 2.5,
        color,
        sizeStart: 0.25, sizeEnd: 0.04,
        life: 0.25 + Math.random() * 0.2,
        opacityStart: 0.9, opacityEnd: 0,
        rotSpeed: 4,
      });
    }

    // Inner glow flash
    spawnImpactFlash(position, color, radius * 0.4, 0.08);

    // Ground-level soft glow particles
    const glowGroup = getGroup('softCircle', THREE.AdditiveBlending);
    const glowCount = Math.ceil(6 * quality.particleMul);
    for (let i = 0; i < glowCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      glowGroup.emit({
        x: position.x + Math.cos(a) * dist,
        y: position.y + 0.1,
        z: position.z + Math.sin(a) * dist,
        vy: 0.5 + Math.random() * 0.5,
        color, sizeStart: 0.4, sizeEnd: 0.1,
        life: 0.15 + Math.random() * 0.1,
        opacityStart: 0.4, opacityEnd: 0,
      });
    }
  },

  // "A divine ring smites those who draw near" — gold and white rather than the
  // generic blue magic pulse, with vertical shafts of light so it reads as holy.
  holyPulse(position, radius, evolved = false) {
    // A blast of flame off the sun: white core flash, a ring of fire racing out
    // to the aura's edge, corona rays along the ground, prominences standing up
    // at the rim, and embers drifting down after. Gold-white through orange —
    // the same warm palette as before, with heat behind it.
    const core = evolved ? 0xfff6dc : 0xfff0c0, gold = evolved ? 0xffd77a : 0xffc860, fire = 0xff8a1a, deep = 0xd94a10;
    const q = quality.particleMul;
    spawnImpactFlash(position, core, radius * (evolved ? 0.45 : 0.35), 0.12);
    spawnVFXLight(position, gold, evolved ? 7 : 4.5, radius * 2.6, 0.38);
    spawnHeatDistortion(position, radius * 0.75, 0.4, evolved ? 1.1 : 0.7);
    spawnShockwave(position, gold, radius, evolved ? 0.42 : 0.34, 0.12);
    queueShockwave(0.05, position, fire, radius * 0.9, 0.3, 0.2);
    if (evolved) spawnRuneCircle(position, { color: fire, radius: radius * 0.7, duration: 0.7, sweep: 0.15, peakOpacity: 0.55 });

    const ringN = Math.ceil((evolved ? 40 : 26) * q), travel = 0.28, speed = radius / travel;
    const flame = getGroup('flame', THREE.AdditiveBlending);
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * 6.283 + Math.random() * 0.2;
      flame.emit({
        x: position.x + Math.cos(a) * 0.5, y: position.y + 0.35 + Math.random() * 0.3, z: position.z + Math.sin(a) * 0.5,
        vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 0.6 + Math.random() * 1.2,
        colorStops: [gold, fire, fire, deep, 0x4a1206],
        sizeStart: 2.6 + Math.random() * 1.2, sizeEnd: 0.8, sizeEase: 0.8,
        life: travel + 0.14 + Math.random() * 0.1, opacityStart: 1, opacityEnd: 0, opacityEase: 1.8,
        rotation: a, rotSpeed: (Math.random() - 0.5) * 4, turbulence: 0.6,
      });
    }
    const rays = getGroup('streak', THREE.AdditiveBlending), rayN = Math.ceil((evolved ? 16 : 10) * q);
    for (let i = 0; i < rayN; i++) {
      const a = (i / rayN) * 6.283 + (Math.random() - 0.5) * 0.3;
      rays.emit({
        x: position.x, y: 0.12, z: position.z, vx: Math.cos(a) * radius * 5, vz: Math.sin(a) * radius * 5, vy: 0,
        color: gold, colorEnd: fire, sizeStart: 0.6 * radius, sizeEnd: 0.1, life: 0.16 + Math.random() * 0.08,
        opacityStart: 1, opacityEnd: 0, drag: 9, rotation: a,
      });
    }
    const promN = Math.ceil((evolved ? 18 : 12) * q);
    for (let i = 0; i < promN; i++) {
      const a = (i / promN) * 6.283 + (Math.random() - 0.5) * 0.25, r = radius * 0.94;
      flame.emit({
        x: position.x + Math.cos(a) * r, y: position.y + 0.3, z: position.z + Math.sin(a) * r,
        vy: 4.5 + Math.random() * 3, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6,
        colorStops: [gold, fire, deep], sizeStart: 2.2, sizeEnd: 0.3, aspect: 0.32,
        life: 0.42 + Math.random() * 0.22, opacityStart: 1, opacityEnd: 0, opacityEase: 1.6, turbulence: 1.0, drag: 1.5,
      });
    }
    preset_sparks(position, gold, Math.ceil((evolved ? 22 : 14) * q), 10);
    queueEffect(0.1, () => {
      emitBurst('softCircle', Math.ceil((evolved ? 20 : 12) * q), {
        x: position.x, y: position.y + 1.6, z: position.z, color: gold, colorEnd: fire,
        sizeStart: 0.5, sizeEnd: 0.08, life: 0.7, opacityStart: 1, opacityEnd: 0, opacityEase: 2, turbulence: 1.2, drag: 1.4, gravity: 2.5,
      }, (cfg) => { const a = Math.random() * 6.283, d = Math.random() * radius; cfg.x += Math.cos(a) * d; cfg.z += Math.sin(a) * d; cfg.y += Math.random() * 1.5; cfg.life = 0.45 + Math.random() * 0.5; });
    });
    if (evolved && manager.onScreenFlash) manager.onScreenFlash(0xffe6b0, 0.16);
  },

  // A ground sigil. Tinted per school of magic — gold for holy, violet for
  // arcane, red for a boss telegraph.
  runeCircle: spawnRuneCircle,

  // Energy drawn up out of the ground in a tightening helix. Paired with a rune
  // circle this is the classic "something big is happening here" read.
  vortex(position, color = 0xc46cff, opts = {}) {
    const {
      radius = 2.2,
      height = 4.0,
      count = 42,
      duration = 0.85,
      turns = 2.2,
      inward = true,
    } = opts;

    const n = Math.ceil(count * quality.particleMul);
    const group = getGroup('star', THREE.AdditiveBlending);
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const a = f * Math.PI * 2 * turns + Math.random() * 0.25;
      const r = radius * (inward ? 1 - f * 0.75 : 0.25 + f * 0.75);
      // Tangential motion plus lift traces the helix out over the particle's life
      const tangential = 3.4 * (inward ? 1 : -1);
      group.emit({
        x: position.x + Math.cos(a) * r,
        y: position.y + 0.12 + f * 0.5,
        z: position.z + Math.sin(a) * r,
        vx: -Math.sin(a) * tangential - Math.cos(a) * (inward ? 1.5 : -1.5),
        vz: Math.cos(a) * tangential - Math.sin(a) * (inward ? 1.5 : -1.5),
        vy: height / duration * (0.55 + Math.random() * 0.5),
        color, colorEnd: 0xffffff,
        sizeStart: 0.34 + Math.random() * 0.16, sizeEnd: 0.03,
        rotSpeed: (Math.random() - 0.5) * 8,
        life: duration * (0.55 + Math.random() * 0.45),
        opacityStart: 1, opacityEnd: 0, opacityEase: 1.7,
        drag: 0.7, turbulence: 0.35,
      });
    }

    // Column of light up the middle
    const core = getGroup('softCircle', THREE.AdditiveBlending);
    const coreCount = Math.ceil(10 * quality.particleMul);
    for (let i = 0; i < coreCount; i++) {
      core.emit({
        x: position.x + (Math.random() - 0.5) * 0.5,
        y: position.y + 0.15 + Math.random() * 0.6,
        z: position.z + (Math.random() - 0.5) * 0.5,
        vy: height / duration * (0.7 + Math.random() * 0.5),
        color, colorEnd: 0xffffff,
        sizeStart: 0.85, sizeEnd: 0.12,
        aspect: 0.32,
        life: duration * 0.75,
        opacityStart: 0.8, opacityEnd: 0, opacityEase: 1.5,
      });
    }
    spawnVFXLight(position, color, 3.5, radius * 5, duration * 0.6);
  },

  // Golden motes circling a held enemy, so a stun is legible at a glance in a
  // crowd. Called on a throttle, not every frame.
  stunSpark(position) {
    const a = Math.random() * 6.283;
    const r = 0.55 + Math.random() * 0.25;
    getGroup('star', THREE.AdditiveBlending).emit({
      x: position.x + Math.cos(a) * r,
      y: position.y + 1.5 + Math.random() * 0.35,
      z: position.z + Math.sin(a) * r,
      vx: -Math.sin(a) * 2.2, vz: Math.cos(a) * 2.2,
      vy: 0.3,
      color: 0xfff0b0, colorEnd: 0xd9a020,
      sizeStart: 0.2, sizeEnd: 0.04,
      rotSpeed: (Math.random() - 0.5) * 9,
      life: 0.4, opacityStart: 1, opacityEnd: 0, opacityEase: 1.6,
    });
  },

  // Violet energy trail for the falling Arcane Bomb.
  arcaneBombTrail(position) {
    getGroup('softCircle', THREE.AdditiveBlending).emit({
      x: position.x + (Math.random() - 0.5) * 0.25,
      y: position.y,
      z: position.z + (Math.random() - 0.5) * 0.25,
      vy: 1.2 + Math.random(),
      color: 0xb266ff, colorEnd: 0x3d1170,
      sizeStart: 0.5, sizeEnd: 0.1,
      life: 0.4, opacityStart: 0.8, opacityEnd: 0,
      turbulence: 0.6,
    });
  },

  // "Arcane Bomb" — a violet detonation with a rune-ring, distinct from the
  // orange fireball used by the ogre boss.
  arcaneExplosion(position, size = 3) {
    // A stack of dynamite: blinding flash, pressure rings, a fireball that
    // goes UP, burning debris on ballistic arcs, a crater, and a smoke column
    // that keeps rising after the fire is gone. The arcane identity stays in the
    // violet sigil, the violet outer ring and the purple-edged smoke.
    const p = { x: position.x, y: position.y, z: position.z };
    const s = size / 3, q = quality.particleMul;
    spawnImpactFlash(p, 0xfff4dc, size * 1.6, 0.1);
    spawnVFXLight(p, 0xffb060, 10, size * 6, 0.16);
    spawnHeatDistortion(p, size * 1.8, 0.55, 1.4);
    spawnShockwave(p, 0xff8a2a, size * 2.0, 0.36, 0.12);
    queueShockwave(0.04, p, 0xa855f7, size * 1.6, 0.32, 0.18);
    spawnRuneCircle(p, { color: 0xb96cff, radius: size * 1.5, duration: 0.6, sweep: 0.1, peakOpacity: 1.1 });
    if (manager.onScreenFlash) manager.onScreenFlash(0xffe2b8, 0.34);
    emitBurst('softCircle', Math.ceil(14 * s * q), {
      x: p.x, y: p.y + 0.5, z: p.z, color: 0xfffbe8, colorEnd: 0xffa030,
      sizeStart: 1.8 * size, sizeEnd: 0.5, life: 0.14, drag: 3, opacityStart: 1, opacityEnd: 0, sizeEase: 0.5,
    }, (cfg) => { const a = Math.random() * 6.283, sp = (1 + Math.random() * 3) * s; cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp; cfg.vy = 3 + Math.random() * 6; cfg.life = 0.08 + Math.random() * 0.12; });
    queueEffect(0.03, () => {
      const body = getGroup('softCircle', THREE.NormalBlending), heart = getGroup('flame', THREE.AdditiveBlending);
      const n = Math.ceil(22 * s * q);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, r = Math.random() * 1.0 * size * 0.4;
        const up = 2.5 + Math.random() * 5;
        body.emit({
          x: p.x + Math.cos(a) * r, y: p.y + 0.5, z: p.z + Math.sin(a) * r,
          vx: Math.cos(a) * (1.5 + Math.random() * 3) * s, vz: Math.sin(a) * (1.5 + Math.random() * 3) * s, vy: up,
          colorStops: [0xffb050, 0xff7018, 0xd0400c, 0x2a0a06],
          sizeStart: (7 + Math.random() * 5) * size * 0.45, sizeEnd: 2.5, sizeEase: 0.6,
          life: 0.6 + Math.random() * 0.4, opacityStart: 1, opacityEnd: 0, opacityEase: 1.3,
          turbulence: 1.0, drag: 2.2, rotation: Math.random() * 6.283, rotSpeed: (Math.random() - 0.5) * 4, lit: 0.3,
        });
        if (i % 2 === 0) heart.emit({
          x: p.x + Math.cos(a) * r * 0.6, y: p.y + 0.6, z: p.z + Math.sin(a) * r * 0.6,
          vx: Math.cos(a) * (1 + Math.random() * 2) * s, vz: Math.sin(a) * (1 + Math.random() * 2) * s, vy: up * 0.9,
          colorStops: [0xffe0a0, 0xff9a2a, 0xff5010],
          sizeStart: (4 + Math.random() * 2.5) * size * 0.45, sizeEnd: 1, sizeEase: 0.6,
          life: 0.35 + Math.random() * 0.25, opacityStart: 0.5, opacityEnd: 0, opacityEase: 1.5,
          turbulence: 1.0, drag: 2.2, rotSpeed: (Math.random() - 0.5) * 4,
        });
      }
      spawnVFXLight(p, 0xff7a20, 6, size * 5, 0.5);
    });
    emitBurst('spark', Math.ceil(26 * s * q), {
      x: p.x, y: p.y + 0.4, z: p.z, color: 0xffd080, colorEnd: 0xff4a10,
      sizeStart: 0.9, sizeEnd: 0.15, aspect: 0.28, stretch: 0.06,
      life: 0.9, gravity: 16, floorY: 0.06, bounceDecay: 0.35, opacityStart: 1, opacityEnd: 0,
    }, (cfg) => { const a = Math.random() * 6.283, sp = (3 + Math.random() * 8) * s; cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp; cfg.vy = 8 + Math.random() * 12; cfg.life = 0.5 + Math.random() * 0.6; });
    emitBurst('hardCircle', Math.ceil(16 * s * q), {
      blending: THREE.NormalBlending, x: p.x, y: 0.2, z: p.z, color: 0x4a3a2a, colorEnd: 0x1a1410,
      sizeStart: 0.4, sizeEnd: 0.25, life: 0.9, gravity: 18, floorY: 0.05, bounceDecay: 0.25, opacityStart: 1, opacityEnd: 0.6, rotSpeed: 8,
    }, (cfg) => { const a = Math.random() * 6.283, sp = (2 + Math.random() * 5) * s; cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp; cfg.vy = 6 + Math.random() * 9; cfg.sizeStart = 0.25 + Math.random() * 0.4; cfg.life = 0.6 + Math.random() * 0.5; });
    manager.groundCrack(p, size * 0.8);
    spawnGroundDecal(p, 0x14100e, size * 1.9, 'smoke');
    spawnGroundDecal(p, 0x3b1063, size * 1.2, 'bloodSplat');
    queueEffect(0.08, () => preset_dust(p, Math.ceil(16 * s * q), 0x7a6a55));
    for (const [delay, vy0] of [[0.12, 5], [0.24, 4], [0.4, 3]]) queueEffect(delay, () => {
      emitBurst('smoke', Math.ceil(9 * s * q), {
        blending: THREE.NormalBlending, x: p.x, y: p.y + 0.6, z: p.z, colorStops: [0x2e241e, 0x261a26, 0x18121a, 0x0c090e],
        sizeStart: 2.5 * size * 0.45, sizeEnd: 9 * size * 0.45, life: 1.8, drag: 1.2,
        opacityStart: 0.75, opacityEnd: 0, sizeEase: 0.45, turbulence: 0.8, fadeIn: 0.12, erode: 0.95, lit: 0.15,
      }, (cfg) => { const a = Math.random() * 6.283, sp = (0.4 + Math.random() * 1.2) * s; cfg.vx = Math.cos(a) * sp; cfg.vz = Math.sin(a) * sp; cfg.vy = vy0 + Math.random() * 3; cfg.life = 1.3 + Math.random() * 1.0; cfg.rotation = Math.random() * 6.283; cfg.rotSpeed = (Math.random() - 0.5) * 1.2; });
    });
  },

  // "Bombs leave burning ground for 4s" — Armageddon's lingering fire patch.
  burningGround(position, radius, dt) {
    // Stateless emission count — several patches can burn at once without
    // sharing (and starving) a single accumulator.
    const want = 22 * quality.particleMul * dt;
    let n = Math.floor(want);
    if (Math.random() < want - n) n++;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const r = Math.sqrt(Math.random()) * radius;
      getGroup('flame', THREE.AdditiveBlending).emit({
        x: position.x + Math.cos(a) * r, y: 0.1, z: position.z + Math.sin(a) * r,
        vy: 1.8 + Math.random() * 1.8,
        color: 0xff9a2e, colorEnd: 0x7a1400,
        sizeStart: 0.35 + Math.random() * 0.2, sizeEnd: 0.06,
        life: 0.45 + Math.random() * 0.3,
        opacityStart: 0.85, opacityEnd: 0,
        turbulence: 1.2, drag: 1.0,
      });
    }
  },

  // ─── ENVIRONMENT ───
  torchFlame(pos) {
    preset_fire(pos, 3);
  },

  // Ambient floating dust motes around the player
  ambientDust(playerPos) {
    if (!quality.envParticles) return;
    const group = getGroup('dust', THREE.NormalBlending);
    const count = Math.ceil(2 * quality.particleMul);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 15;
      group.emit({
        x: playerPos.x + Math.cos(angle) * dist,
        y: 0.5 + Math.random() * 4,
        z: playerPos.z + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.1 + Math.random() * 0.2,
        vz: (Math.random() - 0.5) * 0.3,
        color: 0xbbaa88,
        sizeStart: 0.08 + Math.random() * 0.12, sizeEnd: 0.04,
        life: 2 + Math.random() * 3,
        opacityStart: 0.15 + Math.random() * 0.1, opacityEnd: 0,
        drag: 0.5,
      });
    }
    // Occasional firefly-like bright speck
    if (Math.random() < 0.15) {
      const sparkGroup = getGroup('softCircle', THREE.AdditiveBlending);
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 12;
      sparkGroup.emit({
        x: playerPos.x + Math.cos(a) * d,
        y: 1 + Math.random() * 2.5,
        z: playerPos.z + Math.sin(a) * d,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.3 + Math.random() * 0.3,
        vz: (Math.random() - 0.5) * 0.5,
        color: 0xffeeaa,
        sizeStart: 0.06, sizeEnd: 0.03,
        life: 1.5 + Math.random() * 2,
        opacityStart: 0.5, opacityEnd: 0,
      });
    }
  },

  // Footstep dust puff
  footstepDust(position, speed = 1) {
    const group = getGroup('dust', THREE.NormalBlending);
    const count = Math.ceil(2 * quality.particleMul);
    for (let i = 0; i < count; i++) {
      group.emit({
        x: position.x + (Math.random() - 0.5) * 0.3,
        y: 0.05,
        z: position.z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 1.5 * speed,
        vy: 0.3 + Math.random() * 0.5 * speed,
        vz: (Math.random() - 0.5) * 1.5 * speed,
        color: 0x998877,
        sizeStart: 0.15 + Math.random() * 0.15, sizeEnd: 0.4,
        life: 0.2 + Math.random() * 0.2,
        opacityStart: 0.2, opacityEnd: 0,
        drag: 4,
      });
    }
  },

  // ─── CRITICAL HIT BURST ───
  criticalHit(position) {
    // Golden starburst
    const starGroup = getGroup('star', THREE.AdditiveBlending);
    const count = Math.ceil(10 * quality.particleMul);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 5 + Math.random() * 4;
      starGroup.emit({
        x: position.x, y: position.y + 0.5, z: position.z,
        vx: Math.cos(angle) * speed,
        vy: 1 + Math.random() * 3,
        vz: Math.sin(angle) * speed,
        color: 0xffd700, colorEnd: 0xff8800,
        sizeStart: 0.3 + Math.random() * 0.15, sizeEnd: 0.02,
        life: 0.15 + Math.random() * 0.12,
        opacityStart: 1, opacityEnd: 0,
        rotSpeed: (Math.random() - 0.5) * 12,
        drag: 3,
      });
    }
    // A single spiked burst sprite snapping open at the point of impact. One
    // sharp shape at the contact point reads harder than any number of
    // particles, because the eye resolves it before the spray registers.
    getGroup('burst', THREE.AdditiveBlending).emit({
      x: position.x, y: position.y + 0.5, z: position.z,
      color: 0xfff4cc, colorEnd: 0xffaa22,
      sizeStart: 1.4, sizeEnd: 3.4,
      rotation: Math.random() * 6.283,
      rotSpeed: (Math.random() - 0.5) * 3,
      life: 0.17, sizeEase: 0.4,
      opacityStart: 1, opacityEnd: 0, opacityEase: 2.2, fadeIn: 0,
      colorJitter: 0,
    });

    // Hard radial shards — stretched along their own velocity, which is what
    // makes a crit read as a sharp strike rather than a golden puff.
    const shardGroup = getGroup('spark', THREE.AdditiveBlending);
    const shards = Math.ceil(8 * quality.particleMul);
    for (let i = 0; i < shards; i++) {
      const angle = (i / shards) * Math.PI * 2 + 0.4;
      const speed = 11 + Math.random() * 7;
      shardGroup.emit({
        x: position.x, y: position.y + 0.5, z: position.z,
        vx: Math.cos(angle) * speed,
        vy: (Math.random() - 0.3) * 4,
        vz: Math.sin(angle) * speed,
        color: 0xfff6d0, colorEnd: 0xff9a00,
        sizeStart: 0.4, sizeEnd: 0.04,
        aspect: 0.22, stretch: 0.05,
        life: 0.12 + Math.random() * 0.1,
        opacityStart: 1, opacityEnd: 0, opacityEase: 2.5,
        drag: 5,
      });
    }
    // White-hot core flash
    spawnImpactFlash(position, 0xffffff, 2.5, 0.08);
    // Secondary golden flash
    spawnImpactFlash(position, 0xffd700, 1.8, 0.12);
    // Brief bright light
    spawnVFXLight(position, 0xffdd44, 3, 12, 0.15);
    // Mini shockwave
    spawnShockwave(position, 0xffd700, 2.5, 0.2);
  },

  // ─── ENEMY SPAWN SMOKE ───
  enemySpawn(position, type = 'goblin') {
    const isBig = type === 'ogre' || type === 'boss' || type === 'dragonOgre';
    const isBat = type === 'bat';
    const smokeColor = isBat ? 0x332244 : 0x222222;
    const smokeCount = isBig ? 10 : isBat ? 4 : 6;

    // Dark smoke poof
    const smokeGroup = getGroup('smoke', THREE.NormalBlending);
    for (let i = 0; i < Math.ceil(smokeCount * quality.particleMul); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2;
      smokeGroup.emit({
        x: position.x + (Math.random() - 0.5) * 0.5,
        y: position.y + 0.2 + Math.random() * 0.5,
        z: position.z + (Math.random() - 0.5) * 0.5,
        vx: Math.cos(angle) * speed,
        vy: 0.5 + Math.random() * 1.5,
        vz: Math.sin(angle) * speed,
        color: smokeColor, colorEnd: 0x111111,
        sizeStart: isBig ? 0.8 : 0.4, sizeEnd: isBig ? 2.0 : 1.0,
        life: 0.5 + Math.random() * 0.5,
        opacityStart: 0.4, opacityEnd: 0,
        drag: 2,
      });
    }

    // Ground shadow burst
    if (!isBat) {
      spawnGroundDecal(position, 0x111111, isBig ? 1.8 : 0.8, 'smoke');
    }

    // Colored sparks based on type
    const sparkColor = isBat ? 0x7744aa : type === 'rat' ? 0x666666 : type === 'goblinBomb' ? 0xff6600 : type === 'wolf' ? 0x556677 : type === 'ogre' ? 0x884422 : 0x44aa44;
    const sparkGroup = getGroup('spark', THREE.AdditiveBlending);
    const sparkCount = Math.ceil((isBig ? 5 : 3) * quality.particleMul);
    for (let i = 0; i < sparkCount; i++) {
      sparkGroup.emit({
        x: position.x + (Math.random() - 0.5) * 0.8,
        y: position.y + 0.3 + Math.random() * 0.5,
        z: position.z + (Math.random() - 0.5) * 0.8,
        vy: 1 + Math.random() * 2,
        color: sparkColor,
        sizeStart: 0.1, sizeEnd: 0.02,
        life: 0.2 + Math.random() * 0.2,
        opacityStart: 0.7, opacityEnd: 0,
      });
    }
  },

  // ─── HEAVY IMPACT GROUND CRACK ───
  groundCrack(position, size = 1) {
    // Multiple radial crack lines using streak particles on the ground
    const crackGroup = getGroup('streak', THREE.NormalBlending);
    const crackCount = Math.ceil(8 * quality.particleMul);
    for (let i = 0; i < crackCount; i++) {
      const angle = (i / crackCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = size * (0.4 + Math.random() * 0.6);
      crackGroup.emit({
        x: position.x, y: 0.08, z: position.z,
        vx: Math.cos(angle) * dist * 8,
        vy: 0,
        vz: Math.sin(angle) * dist * 8,
        color: 0x333333, colorEnd: 0x111111,
        sizeStart: 0.12 * size, sizeEnd: 0.03,
        life: 0.08 + Math.random() * 0.05,
        opacityStart: 0.8, opacityEnd: 0.3,
        drag: 12,
        rotation: angle,
      });
    }
    // Debris chips flying up
    const chipGroup = getGroup('hardCircle', THREE.NormalBlending);
    const chipCount = Math.ceil(5 * quality.particleMul);
    for (let i = 0; i < chipCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      chipGroup.emit({
        x: position.x + (Math.random() - 0.5) * size,
        y: 0.1,
        z: position.z + (Math.random() - 0.5) * size,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: 3 + Math.random() * 4,
        vz: Math.sin(angle) * (2 + Math.random() * 3),
        color: 0x776655,
        sizeStart: 0.06 + Math.random() * 0.06, sizeEnd: 0.02,
        life: 0.3 + Math.random() * 0.3,
        opacityStart: 0.8, opacityEnd: 0.2,
        gravity: 14,
        floorY: 0.05,
        bounceDecay: 0.15,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }
    // Dark scorch decal
    spawnGroundDecal(position, 0x222211, 0.8 * size + Math.random() * 0.5, 'dust');
  },

  // ─── BOSS ENTRANCE ───
  bossEntrance(position, isDragonOgre = false) {
    const size = isDragonOgre ? 1.5 : 1.0;

    // Summoning sigil tearing open, then the portal ring
    spawnRuneCircle(position, {
      color: isDragonOgre ? 0xff5511 : 0xdd2222,
      radius: 5 * size, duration: 2.2, sweep: 0.3, peakOpacity: 1.3,
    });
    manager.vortex(position, isDragonOgre ? 0xff6622 : 0xcc2233, {
      radius: 3.2 * size, height: 6 * size, count: 60, duration: 1.2, inward: false,
    });
    spawnHeatDistortion(position, 4 * size, 0.9, 1.2);
    // Dark portal ring expanding
    spawnShockwave(position, isDragonOgre ? 0xff4400 : 0xcc2222, 8 * size, 0.8);
    queueShockwave(0.15, position, isDragonOgre ? 0xff8800 : 0xff4444, 5 * size, 0.5);

    // Massive smoke eruption
    const smokeGroup = getGroup('smoke', THREE.NormalBlending);
    const smokeCount = Math.ceil(20 * size * quality.particleMul);
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      smokeGroup.emit({
        x: position.x + (Math.random() - 0.5) * 2,
        y: position.y + 0.2,
        z: position.z + (Math.random() - 0.5) * 2,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 4,
        vz: Math.sin(angle) * speed,
        color: isDragonOgre ? 0x331100 : 0x220000, colorEnd: 0x111111,
        sizeStart: 0.8 * size, sizeEnd: 3.0 * size,
        life: 0.6 + Math.random() * 0.8,
        opacityStart: 0.5, opacityEnd: 0,
        drag: 1.5,
      });
    }

    // Fire/ember eruption
    if (isDragonOgre) {
      preset_fire(position, 20);
      preset_embers(position, 15);
    }
    preset_sparks(position, isDragonOgre ? 0xff6600 : 0xff4444, Math.ceil(16 * size), 10);

    // Upward pillar of dark energy
    const pillarGroup = getGroup('softCircle', THREE.AdditiveBlending);
    const pillarCount = Math.ceil(12 * quality.particleMul);
    for (let i = 0; i < pillarCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.5;
      pillarGroup.emit({
        x: position.x + Math.cos(angle) * r,
        y: position.y,
        z: position.z + Math.sin(angle) * r,
        vy: 6 + Math.random() * 6,
        color: isDragonOgre ? 0xff4400 : 0xcc2222,
        sizeStart: 0.5 * size, sizeEnd: 0.05,
        life: 0.5 + Math.random() * 0.5,
        opacityStart: 0.8, opacityEnd: 0,
        drag: 0.5,
      });
    }

    // Ground scorch
    spawnGroundDecal(position, 0x221100, 3 * size, 'smoke');

    // Big flash + strong light
    spawnImpactFlash(position, isDragonOgre ? 0xff6600 : 0xff2222, 5 * size, 0.2);
    spawnVFXLight(position, isDragonOgre ? 0xff4400 : 0xff2222, 6, 20, 0.8);
  },

  // ─── PROJECTILE HIT IMPACT ───
  projectileHit(position, type = 'arrow') {
    // Impact sparks in the projectile's own colour, so an evolved shot lands
    // looking like the thing that was in flight a moment ago.
    const color = (PROJECTILE_STYLES[type] || PROJECTILE_STYLES.arrow).core;
    // Small spark burst
    const sparkGroup = getGroup('spark', THREE.AdditiveBlending);
    const count = Math.ceil(5 * quality.particleMul);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      sparkGroup.emit({
        x: position.x, y: position.y + 0.5, z: position.z,
        vx: Math.cos(angle) * (3 + Math.random() * 3),
        vy: 1 + Math.random() * 2,
        vz: Math.sin(angle) * (3 + Math.random() * 3),
        color,
        sizeStart: 0.1, sizeEnd: 0.02,
        life: 0.1 + Math.random() * 0.1,
        opacityStart: 0.8, opacityEnd: 0,
        gravity: 8,
        drag: 4,
      });
    }
    // Brief flash
    spawnImpactFlash(position, color, 0.8, 0.06);
    spawnVFXLight(position, color, 1.5, 5, 0.1);
  },

  // ─── WAVE START FLASH ───
  waveFlash(playerPos) {
    // Outward pulse shockwave centered on player
    spawnShockwave(playerPos, 0xffffff, 12, 0.6);
    // Brief white flash light
    spawnVFXLight(playerPos, 0xffffff, 5, 10, 0.3);
    // Radial dust burst
    preset_dust(playerPos, 8, 0xbbaa88);
  },

  // ─── DEATH DISSOLVE (call per-frame on dying enemies) ───
  deathDissolve(enemy, progress) {
    // progress: 0 = just died, 1 = about to be removed
    // Darken and fade all materials
    const mats = enemy._materials;
    if (!mats) return;
    const fade = 1 - progress;
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (mat.opacity !== undefined) {
        mat.transparent = true;
        mat.opacity = Math.max(0, fade);
      }
      if (mat.emissive) {
        // Shift emissive to dark red as enemy fades
        mat.emissive.setHex(0x330000);
        mat.emissiveIntensity = progress * 0.5;
      }
    }
    // Rising soul wisps during dissolve
    if (Math.random() < progress * 0.4) {
      const pos = enemy.mesh.position;
      const group = getGroup('softCircle', THREE.AdditiveBlending);
      group.emit({
        x: pos.x + (Math.random() - 0.5) * 1.5,
        y: pos.y + Math.random() * 2,
        z: pos.z + (Math.random() - 0.5) * 1.5,
        vy: 2 + Math.random() * 3,
        color: 0x553333,
        sizeStart: 0.15, sizeEnd: 0.03,
        life: 0.3 + Math.random() * 0.3,
        opacityStart: 0.4, opacityEnd: 0,
        drag: 1,
      });
    }
  },

  // ─── AMBIENT ASH / LEAVES ───
  ambientAsh(playerPos) {
    if (!quality.envParticles) return;
    // Drifting ash particles — darker, float sideways with wind
    const group = getGroup('smoke', THREE.NormalBlending);
    const count = Math.ceil(2 * quality.particleMul);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 18;
      group.emit({
        x: playerPos.x + Math.cos(angle) * dist,
        y: 1 + Math.random() * 5,
        z: playerPos.z + Math.sin(angle) * dist,
        vx: 0.5 + Math.random() * 0.5, // wind drift
        vy: -0.1 - Math.random() * 0.15, // slowly falling
        vz: (Math.random() - 0.5) * 0.3,
        color: 0x444433,
        sizeStart: 0.05 + Math.random() * 0.08, sizeEnd: 0.03,
        life: 3 + Math.random() * 4,
        opacityStart: 0.2, opacityEnd: 0,
        drag: 0.3,
        rotSpeed: (Math.random() - 0.5) * 2,
      });
    }
  },

  // ─── ELITE ENEMY AURA (call per-frame for living elites) ───
  eliteAura(enemy, dt) {
    if (!enemy.mesh || enemy.isDying) return;
    enemy._eliteVfxTimer = (enemy._eliteVfxTimer || 0) + dt;
    // Emit subtle rising embers every ~0.15s
    if (enemy._eliteVfxTimer < 0.15) return;
    enemy._eliteVfxTimer = 0;
    const pos = enemy.mesh.position;
    const group = getGroup('softCircle', THREE.AdditiveBlending);
    const angle = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.5;
    group.emit({
      x: pos.x + Math.cos(angle) * r,
      y: pos.y + 0.1,
      z: pos.z + Math.sin(angle) * r,
      vy: 1.5 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.3,
      vz: (Math.random() - 0.5) * 0.3,
      color: enemy.type === 'ogre' ? 0xff6622 : 0xddaa33,
      colorEnd: enemy.type === 'ogre' ? 0x441100 : 0x553300,
      sizeStart: 0.12 + Math.random() * 0.08,
      sizeEnd: 0.02,
      life: 0.5 + Math.random() * 0.4,
      opacityStart: 0.6,
      opacityEnd: 0,
      drag: 0.5,
    });
  },

  eliteSpawnBurst(position) {
    preset_sparks(position, 0xddaa33, 12, 8);
    spawnShockwave(position, 0xddaa33, 3, 0.4);
    spawnVFXLight(position, 0xffcc44, 3, 6, 0.5);
  },

  deathBurst(position) {
    const group = getGroup('softCircle', THREE.AdditiveBlending);
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      group.emit({
        x: position.x, y: position.y + 0.5, z: position.z,
        vx: Math.cos(angle) * speed, vy: 2 + Math.random() * 6, vz: Math.sin(angle) * speed,
        color: 0xff2200, colorEnd: 0x440000,
        sizeStart: 0.3 + Math.random() * 0.2, sizeEnd: 0.02,
        life: 1.0 + Math.random() * 0.8,
        opacityStart: 1.0, opacityEnd: 0, drag: 1.0,
      });
    }
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      group.emit({
        x: position.x, y: position.y + 0.3, z: position.z,
        vx: Math.cos(angle) * speed, vy: 1 + Math.random() * 2, vz: Math.sin(angle) * speed,
        color: 0xffaa00, colorEnd: 0xff2200,
        sizeStart: 0.15 + Math.random() * 0.1, sizeEnd: 0.01,
        life: 0.6 + Math.random() * 0.4,
        opacityStart: 1.0, opacityEnd: 0, drag: 2.0,
      });
    }
    spawnShockwave(position, 0xff2200, 6, 0.8);
    spawnVFXLight(position, 0xff4400, 6, 12, 1.0);
    preset_sparks(position, 0xff6600, 20, 12);
  },

  groundSlam(position, radius) {
    spawnShockwave(position, 0xff6600, radius, 0.4);
    spawnVFXLight(position, 0xff4400, 4, radius * 1.5, 0.5);
    const group = getGroup('softCircle', THREE.AdditiveBlending);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      group.emit({
        x: position.x + Math.cos(angle) * 0.5,
        y: position.y + 0.1,
        z: position.z + Math.sin(angle) * 0.5,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: 1 + Math.random() * 2,
        vz: Math.sin(angle) * (2 + Math.random() * 3),
        color: 0xff6600, colorEnd: 0x442200,
        sizeStart: 0.3, sizeEnd: 0.05,
        life: 0.5 + Math.random() * 0.3,
        opacityStart: 0.8, opacityEnd: 0, drag: 2.0,
      });
    }
    preset_sparks(position, 0xcc6633, 8, 5);
  },

  levelUpBurst(position) {
    const group = getGroup('softCircle', THREE.AdditiveBlending);
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const r = 0.3 + Math.random() * 0.3;
      group.emit({
        x: position.x + Math.cos(angle) * r,
        y: position.y + 0.3,
        z: position.z + Math.sin(angle) * r,
        vx: Math.cos(angle) * (3 + Math.random() * 2),
        vy: 4 + Math.random() * 4,
        vz: Math.sin(angle) * (3 + Math.random() * 2),
        color: 0xffdd44,
        colorEnd: 0x4488ff,
        sizeStart: 0.2 + Math.random() * 0.15,
        sizeEnd: 0.02,
        life: 0.8 + Math.random() * 0.5,
        opacityStart: 0.9,
        opacityEnd: 0,
        drag: 1.5,
      });
    }
    spawnShockwave(position, 0x4488ff, 4, 0.5);
    spawnVFXLight(position, 0x88bbff, 4, 8, 0.6);
    preset_sparks(position, 0xffdd44, 15, 10);
  },

  // ─── Reset (game restart — clear active effects, keep particle groups) ───
  // ═══════════════════════════════════════════════════════════════════════════
  // WAVE EVENT AMBIENCE
  // One visual per wave event, built to read as the line of text the player is
  // shown when it fires. Called every frame while an event is active.
  // ═══════════════════════════════════════════════════════════════════════════

  waveAmbience(eventId, pos, dt) {
    if (!eventId || !pos) return;
    const acc = _ambienceAcc;
    acc.t += dt;

    // Helper: run `fn` roughly `rate` times per second, quality-scaled.
    const every = (key, rate, fn) => {
      const step = 1 / (rate * quality.particleMul);
      acc[key] = (acc[key] || 0) + dt;
      let guard = 4;
      while (acc[key] >= step && guard-- > 0) { acc[key] -= step; fn(); }
    };

    switch (eventId) {
      // "Coins rain from the sky!"
      case 'goldRush': {
        every('gold', 18, () => {
          const a = Math.random() * 6.283;
          const r = Math.random() * 13;
          const g = getGroup('star', THREE.AdditiveBlending);
          g.emit({
            x: pos.x + Math.cos(a) * r, y: 11 + Math.random() * 3, z: pos.z + Math.sin(a) * r,
            vy: -7 - Math.random() * 4,
            vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
            color: 0xffd24a, colorEnd: 0xfff3b0,
            sizeStart: 0.32, sizeEnd: 0.22,
            aspect: 0.5, stretch: 0.02,
            rotSpeed: (Math.random() - 0.5) * 14,
            life: 1.5 + Math.random() * 0.6,
            opacityStart: 0.95, opacityEnd: 0, opacityEase: 3,
            floorY: 0.08, bounceDecay: 0.35,
          });
        });
        // Occasional glint close to the player so the effect reads even when
        // the camera is zoomed in.
        every('goldGlint', 3, () => {
          const a = Math.random() * 6.283, r = 1 + Math.random() * 3;
          spawnImpactFlash({ x: pos.x + Math.cos(a) * r, y: 0.4, z: pos.z + Math.sin(a) * r }, 0xffd24a, 0.9, 0.22);
        });
        break;
      }

      // "Foes grow fierce, but yield greater power"
      case 'bloodMoon': {
        every('bmAsh', 14, () => {
          const a = Math.random() * 6.283, r = Math.random() * 15;
          getGroup('softCircle', THREE.AdditiveBlending).emit({
            x: pos.x + Math.cos(a) * r, y: 6 + Math.random() * 4, z: pos.z + Math.sin(a) * r,
            vy: -1.1 - Math.random(), vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8,
            color: 0xcc1822, colorEnd: 0x3a0206,
            sizeStart: 0.13 + Math.random() * 0.1, sizeEnd: 0.03,
            life: 3.5 + Math.random() * 2,
            opacityStart: 0.75, opacityEnd: 0,
            turbulence: 0.5, fadeIn: 0.25,
          });
        });
        // Slow crimson pulse on the ground under the player
        every('bmPulse', 0.55, () => {
          spawnShockwave(pos, 0x8b0010, 9, 1.8, 0.06);
        });
        break;
      }

      // "The wind carries thee swiftly"
      case 'blessedWind': {
        every('wind', 26, () => {
          // Streaks blow across the arena on a single shared heading that
          // slowly rotates, so it reads as wind rather than as an explosion.
          const heading = acc.t * 0.35;
          const hx = Math.cos(heading), hz = Math.sin(heading);
          const side = (Math.random() - 0.5) * 16;
          const speed = 13 + Math.random() * 9;
          getGroup('streakV', THREE.AdditiveBlending).emit({
            x: pos.x - hx * 11 - hz * side,
            y: 0.35 + Math.random() * 2.4,
            z: pos.z - hz * 11 + hx * side,
            vx: hx * speed, vz: hz * speed, vy: (Math.random() - 0.5) * 0.5,
            color: 0x9fe8ff, colorEnd: 0x3aa7d8,
            sizeStart: 0.5, sizeEnd: 0.16,
            aspect: 0.22, stretch: 0.08,
            life: 1.1 + Math.random() * 0.5,
            opacityStart: 0.55, opacityEnd: 0, fadeIn: 0.25,
          });
        });
        break;
      }

      // "A divine shield protects thee"
      case 'armorOfLight': {
        every('aolMote', 11, () => {
          const a = Math.random() * 6.283, r = 0.9 + Math.random() * 0.9;
          getGroup('star', THREE.AdditiveBlending).emit({
            x: pos.x + Math.cos(a) * r, y: 3.8 + Math.random() * 1.6, z: pos.z + Math.sin(a) * r,
            vy: -1.9 - Math.random(),
            color: 0xfff0c0, colorEnd: 0xffc84a,
            sizeStart: 0.26, sizeEnd: 0.05,
            rotSpeed: (Math.random() - 0.5) * 3,
            life: 1.4, opacityStart: 0.9, opacityEnd: 0, opacityEase: 2,
          });
        });
        every('aolRing', 0.8, () => {
          spawnShockwave(pos, 0xffd98a, 2.6, 1.0, 0.1);
        });
        break;
      }

      // "Fury courses through thy veins!"
      case 'berserkerRage': {
        every('rage', 30, () => {
          const a = Math.random() * 6.283, r = Math.random() * 0.85;
          getGroup('flame', THREE.AdditiveBlending).emit({
            x: pos.x + Math.cos(a) * r, y: 0.15 + Math.random() * 0.5, z: pos.z + Math.sin(a) * r,
            vy: 2.4 + Math.random() * 2.2,
            vx: (Math.random() - 0.5) * 0.7, vz: (Math.random() - 0.5) * 0.7,
            color: 0xff7a1e, colorEnd: 0x8b1000,
            sizeStart: 0.42 + Math.random() * 0.25, sizeEnd: 0.08,
            life: 0.4 + Math.random() * 0.25,
            opacityStart: 0.85, opacityEnd: 0,
            turbulence: 1.3, sizeEase: 0.7, drag: 1.2,
          });
        });
        every('rageEmber', 7, () => preset_embers({ x: pos.x, y: pos.y + 0.2, z: pos.z }, 1));
        break;
      }

      // "Weapons hum with magical energy!"
      case 'arcanBlessing': {
        // Motes on a slowly rising, counter-rotating double helix around the player
        every('arc', 22, () => {
          const idx = acc.arcIdx = ((acc.arcIdx || 0) + 1) % 2;
          const dir = idx === 0 ? 1 : -1;
          const a = acc.t * 2.4 * dir + idx * Math.PI;
          const r = 1.15;
          getGroup('star', THREE.AdditiveBlending).emit({
            x: pos.x + Math.cos(a) * r, y: 0.25, z: pos.z + Math.sin(a) * r,
            vy: 1.7 + Math.random() * 0.5,
            vx: -Math.sin(a) * 1.5 * dir, vz: Math.cos(a) * 1.5 * dir,
            color: 0xc46cff, colorEnd: 0x5a1e9e,
            sizeStart: 0.27, sizeEnd: 0.04,
            rotSpeed: (Math.random() - 0.5) * 5,
            life: 1.25, drag: 1.2,
            opacityStart: 1, opacityEnd: 0, opacityEase: 1.8,
          });
        });
        every('arcRune', 0.9, () => {
          spawnShockwave(pos, 0xa855f7, 2.2, 0.9, 0.12);
          spawnVFXLight(pos, 0x9933ff, 1.6, 7, 0.45);
        });
        break;
      }

      // "Treasures fly to thy hands!"
      case 'magneticField': {
        every('magRing', 1.6, () => {
          spawnShockwave(pos, 0x3ee6b4, 8, 1.1, 0.08);
        });
        // Motes converging inward sell the "pulled toward you" idea
        every('magMote', 20, () => {
          const a = Math.random() * 6.283, r = 6 + Math.random() * 3;
          const sp = 6 + Math.random() * 3;
          getGroup('spark', THREE.AdditiveBlending).emit({
            x: pos.x + Math.cos(a) * r, y: 0.3 + Math.random() * 1.4, z: pos.z + Math.sin(a) * r,
            vx: -Math.cos(a) * sp, vz: -Math.sin(a) * sp,
            color: 0x66ffd0, colorEnd: 0x18a37c,
            sizeStart: 0.3, sizeEnd: 0.06,
            aspect: 0.3, stretch: 0.05,
            life: r / sp, opacityStart: 0.9, opacityEnd: 0.2, fadeIn: 0.15,
          });
        });
        break;
      }
    }
  },

  // One-shot flourish when a wave event begins.
  waveEventStart(eventId, pos, colorHex) {
    _ambienceAcc.t = 0;
    if (!pos) return;
    const color = colorHex ?? 0xffffff;
    spawnShockwave(pos, color, 14, 0.9, 0.12);
    spawnVFXLight(pos, color, 4, 16, 0.7);
    emitBurst('star', 30, {
      x: pos.x, y: pos.y + 0.8, z: pos.z,
      color, sizeStart: 0.5, sizeEnd: 0.05,
      life: 0.9, drag: 1.5, opacityStart: 1, opacityEnd: 0,
    }, (cfg) => {
      const a = Math.random() * 6.283, s = 5 + Math.random() * 7;
      cfg.vx = Math.cos(a) * s;
      cfg.vz = Math.sin(a) * s;
      cfg.vy = 1.5 + Math.random() * 3;
      cfg.rotSpeed = (Math.random() - 0.5) * 8;
    });
  },

  // Dust wall rolling in from the direction a swarm or stampede is arriving from.
  incomingDust(pos, angle) {
    const dx = Math.sin(angle), dz = Math.cos(angle);
    for (let i = 0; i < 26; i++) {
      const side = (Math.random() - 0.5) * 22;
      preset_dust({
        x: pos.x + dx * 18 - dz * side,
        y: 0.1,
        z: pos.z + dz * 18 + dx * side,
      }, 2, 0x9a8a70);
    }
  },

  reset() {
    _ambienceAcc.t = 0;
    for (const key of Object.keys(_ambienceAcc)) if (key !== 't') _ambienceAcc[key] = 0;
    for (const group of Object.values(particleGroups)) {
      group.count = 0;
      group.geo.instanceCount = 0;
      group.points.visible = false;
    }
    for (const d of decals) { scene.remove(d.mesh); d.geo.dispose(); d.mat.dispose(); }
    decals.length = 0;
    for (const l of vfxLights) { scene.remove(l.light); _lightPool.push(l.light); }
    vfxLights.length = 0;
    for (const f of impactFlashes) { scene.remove(f.sprite); f.mat.dispose(); }
    impactFlashes.length = 0;
    for (const s of shockwaves) { scene.remove(s.mesh); s.geo.dispose(); s.mat.dispose(); }
    shockwaves.length = 0;
    _pendingShockwaves.length = 0;
    for (const a of slashArcs) { scene.remove(a.mesh); a.mat.dispose(); }
    slashArcs.length = 0;
    for (const b of lightningBolts) disposeBolt(b);
    lightningBolts.length = 0;
    for (const d of distortions) { scene.remove(d.mesh); d.mat.dispose(); }
    distortions.length = 0;
    for (const rc of runeCircles) for (const l of rc.layers) { scene.remove(l.mesh); l.mat.dispose(); }
    runeCircles.length = 0;
    for (const trail of trailInstances.values()) trail.dispose();
    trailInstances.clear();
    for (const [mesh, auras] of activeAuras) {
      for (const a of auras) {
        if (a.mesh) { mesh.remove(a.mesh); a.geo?.dispose(); a.mat?.dispose(); }
      }
    }
    activeAuras.clear();
  },

  // ─── Cleanup (full teardown) ───
  dispose() {
    for (const group of Object.values(particleGroups)) group.dispose();
    for (const trail of trailInstances.values()) trail.dispose();
    for (const d of decals) { scene.remove(d.mesh); d.geo.dispose(); d.mat.dispose(); }
    for (const l of vfxLights) { scene.remove(l.light); }
    for (const f of impactFlashes) { scene.remove(f.sprite); f.mat.dispose(); }
    for (const s of shockwaves) { scene.remove(s.mesh); s.geo.dispose(); s.mat.dispose(); }
    for (const a of slashArcs) { scene.remove(a.mesh); a.mat.dispose(); }
    for (const b of lightningBolts) disposeBolt(b);
    lightningBolts.length = 0;
    _arcGeometry?.dispose();
    _arcGeometry = null;
  },

  // Expose sub-systems for direct access if needed
  particles: { getGroup, emitBurst, presets: {
    sparks: preset_sparks, embers: preset_embers, blood: preset_blood,
    dust: preset_dust, magic: preset_magic, heal: preset_heal,
    xp: preset_xp, fire: preset_fire, frost: preset_frost, poison: preset_poison,
  }},
  trails: { WeaponTrail, TRAIL_STYLES },
  textures: VFXTextures,
  sockets: { findBone, getSocketWorldPos },
  lighting: { spawnVFXLight },
  decals: { spawnGroundDecal },
  flashes: { spawnImpactFlash },
  shockwaves: { spawnShockwave },
};

return manager;
}
