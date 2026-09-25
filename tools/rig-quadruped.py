"""
Auto-rig a Trellis quadruped mesh in Blender and bake a stylised clip set.

  blender-launcher.exe -b --python tools/rig-quadruped.py -- <in.glb> <out.glb> [options]

Options
  --faces N        decimate to about N faces (default 16000)
  --forward DIR    which way the nose points after import: auto | +x | -x | +y | -y
  --log FILE       progress log (the Store launcher swallows stdout)
  --dump FILE      write the landmark JSON (bounds, paws, spine) for inspection
  --clips a,b,c    keep only these clips (default: all seven)
  --scale-legs F   multiply leg swing amplitudes (a horse strides less than a terrier)

Built for Lupin (companion dog) but nothing in here is dog-specific: it measures the
mesh, drops a 22-bone armature on it, weights it by distance to bone segments (bone
heat fails on Trellis shells, this never does) and keys seven clips by formula:
Idle, Walk, Run, Jump, Attack, Howl, Bark. Blender convention: the animal faces -Y,
which the glTF exporter turns into +Z, the direction the game's atan2(dx, dz) faces.
"""
import bpy, sys, os, math, json
from mathutils import Vector, Matrix
import numpy as np

# ─── args ────────────────────────────────────────────────────────────────
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    raise SystemExit('usage: -- <in.glb> <out.glb> [--faces N] [--forward DIR] [--log FILE] [--dump FILE]')
IN, OUT = argv[0], argv[1]
def opt(k, d):
    return argv[argv.index(k) + 1] if k in argv else d
TARGET_FACES = int(opt('--faces', '16000'))
FORWARD = opt('--forward', 'auto')
LOG_PATH = opt('--log', None)
DUMP_PATH = opt('--dump', None)
CLIPS = opt('--clips', 'Idle,Walk,Run,Jump,Attack,Howl,Bark').split(',')
LEG_MUL = float(opt('--scale-legs', '1'))
_log = open(LOG_PATH, 'w', encoding='utf-8') if LOG_PATH else None
def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True)
    if _log: _log.write(s + '\n'); _log.flush()

FPS = 30

# ─── 1. import and flatten ───────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('no mesh in ' + IN)
for o in bpy.data.objects: o.select_set(False)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
mesh.select_set(True)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o != mesh: bpy.data.objects.remove(o, do_unlink=True)
mesh.name = 'Body'
log('imported', IN, 'verts', len(mesh.data.vertices), 'faces', len(mesh.data.polygons))

# ─── 2. decimate ─────────────────────────────────────────────────────────
nf = len(mesh.data.polygons)
if nf > TARGET_FACES * 1.1:
    mod = mesh.modifiers.new('dec', 'DECIMATE')
    mod.ratio = TARGET_FACES / nf
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    log('decimated to', len(mesh.data.polygons), 'faces')

# ─── 3. orientation ──────────────────────────────────────────────────────
def coords():
    n = len(mesh.data.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    mesh.data.vertices.foreach_get('co', a)
    return a.reshape(n, 3)

V = coords()
mn, mx = V.min(0), V.max(0)
ext = mx - mn
log('raw bounds', mn.round(3).tolist(), mx.round(3).tolist(), 'ext', ext.round(3).tolist())

# Long horizontal axis is the body axis. Decide which end is the nose.
axis = 0 if ext[0] >= ext[1] else 1
H = ext[2]
if FORWARD == 'auto':
    c = (mn[axis] + mx[axis]) / 2
    high = V[:, 2] > mn[2] + 0.55 * H
    lo_end = V[(V[:, axis] < mn[axis] + 0.3 * ext[axis]) & high].shape[0]
    hi_end = V[(V[:, axis] > mx[axis] - 0.3 * ext[axis]) & high].shape[0]
    # The head/chest end carries more mass up high than a tail does; the tail is
    # also thinner, so compare the count of high vertices at each end.
    nose_positive = hi_end > lo_end
    log('auto forward: high-vert counts lo/hi', lo_end, hi_end, '-> nose at', '+' if nose_positive else '-', 'xy'[axis])
else:
    nose_positive = FORWARD[0] == '+'
    axis = 0 if FORWARD[1] == 'x' else 1

# Rotate about Z so the nose points -Y.
if axis == 1:
    rot = 0.0 if not nose_positive else math.pi
else:
    rot = -math.pi / 2 if nose_positive else math.pi / 2   # +X -> -Y is a -90deg turn
R = Matrix.Rotation(rot, 4, 'Z')
mesh.data.transform(R)
V = coords()
mn, mx = V.min(0), V.max(0)
# Sit on the ground, centred in x and y.
shift = Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))
mesh.data.transform(Matrix.Translation(shift))
V = coords()
mn, mx = V.min(0), V.max(0)
ext = mx - mn
L, W, H = ext[1], ext[0], ext[2]
log('oriented bounds', mn.round(3).tolist(), mx.round(3).tolist(), 'L', round(L, 3), 'W', round(W, 3), 'H', round(H, 3))

# ─── 4. landmarks ────────────────────────────────────────────────────────
yf, yr = mn[1], mx[1]   # nose end, tail end (y grows toward the rear)

def top_z(y, half=0.04):
    sel = V[(np.abs(V[:, 1] - y) < half * L) & (np.abs(V[:, 0]) < 0.35 * W)]
    return float(np.percentile(sel[:, 2], 95)) if len(sel) else H * 0.8

def bottom_z(y, half=0.04):
    sel = V[(np.abs(V[:, 1] - y) < half * L) & (np.abs(V[:, 0]) < 0.25 * W)]
    return float(np.percentile(sel[:, 2], 5)) if len(sel) else 0.0

# Paws: low vertices, split into a front and a back group along y, then by side.
low = V[V[:, 2] < 0.12 * H]
if len(low) < 20:
    low = V[V[:, 2] < 0.2 * H]
ys = low[:, 1]
c0, c1 = np.percentile(ys, 25), np.percentile(ys, 75)
for _ in range(20):
    a = ys[np.abs(ys - c0) <= np.abs(ys - c1)]
    b = ys[np.abs(ys - c0) > np.abs(ys - c1)]
    if len(a): c0 = a.mean()
    if len(b): c1 = b.mean()
y_front, y_back = min(c0, c1), max(c0, c1)
def paw(group_y, side):
    sel = low[(np.abs(low[:, 1] - group_y) < 0.15 * L) & ((low[:, 0] > 0) == (side > 0))]
    if len(sel) < 5:
        return np.array([side * 0.22 * W, group_y, 0.0])
    return np.array([float(np.median(sel[:, 0])), float(np.median(sel[:, 1])), 0.0])
paws = {'FL': paw(y_front, +1), 'FR': paw(y_front, -1), 'BL': paw(y_back, +1), 'BR': paw(y_back, -1)}
# Keep the stance symmetric: legs that merged in the mesh would otherwise pull to one side.
for f, s in (('FL', 'FR'), ('BL', 'BR')):
    x = (abs(paws[f][0]) + abs(paws[s][0])) / 2
    x = max(x, 0.12 * W)
    y = (paws[f][1] + paws[s][1]) / 2
    paws[f][:2] = (x, y); paws[s][:2] = (-x, y)
log('paws', {k: v.round(3).tolist() for k, v in paws.items()})

y_chest = paws['FL'][1]
y_pelvis = paws['BL'][1]
spine_z = lambda y: 0.78 * top_z(y) + 0.22 * bottom_z(y)
nose_sel = V[V[:, 1] < yf + 0.06 * L]
nose = np.array([0.0, yf + 0.01 * L, float(np.median(nose_sel[:, 2]))])
tail_sel = V[(V[:, 1] > yr - 0.08 * L)]
tail_tip = np.array([0.0, yr - 0.02 * L, float(np.percentile(tail_sel[:, 2], 70))])

# Spine points from pelvis to chest, then neck and head toward the nose.
P_pelvis = np.array([0, y_pelvis + 0.03 * L, spine_z(y_pelvis + 0.03 * L)])
P_mid = np.array([0, 0.55 * y_pelvis + 0.45 * y_chest, spine_z(0.55 * y_pelvis + 0.45 * y_chest)])
P_chest = np.array([0, y_chest + 0.02 * L, spine_z(y_chest + 0.02 * L)])
P_neck0 = np.array([0, y_chest - 0.02 * L, spine_z(y_chest - 0.02 * L)])
# The skull sits ahead of the shoulders whatever the pose; a head landmark measured
# from the nose can land behind the neck root on a dog that holds its head high.
head_y = min(yf + 0.16 * L, y_chest - 0.10 * L)
P_head0 = np.array([0, head_y, 0.5 * top_z(head_y) + 0.5 * nose[2]])
P_head0[2] = max(P_head0[2], P_neck0[2] + 0.05 * H)
P_tail0 = np.array([0, y_pelvis + 0.07 * L, spine_z(y_pelvis + 0.07 * L) - 0.03 * H])
P_tail1 = (P_tail0 + tail_tip) / 2

landmarks = dict(L=L, W=W, H=H, paws={k: v.tolist() for k, v in paws.items()}, nose=nose.tolist(),
                 tail_tip=tail_tip.tolist(), pelvis=P_pelvis.tolist(), chest=P_chest.tolist(), head=P_head0.tolist())
log('landmarks', json.dumps({k: (np.round(v, 3).tolist() if isinstance(v, (list, float)) else v) for k, v in landmarks.items()}))
if DUMP_PATH:
    json.dump(landmarks, open(DUMP_PATH, 'w'), indent=1)

# ─── 5. armature ─────────────────────────────────────────────────────────
# name: (head, tail, parent, weight radius)
bones = {}
def B(name, head, tail, parent, radius):
    bones[name] = (np.array(head, dtype=float), np.array(tail, dtype=float), parent, radius)

B('root', (0, 0, 0), (0, 0, 0.1 * H), None, 0.0)
B('hips', P_pelvis, P_mid, 'root', 0.30 * H)
B('spine', P_mid, P_chest, 'hips', 0.32 * H)
B('chest', P_chest, P_neck0, 'spine', 0.30 * H)
B('neck', P_neck0, P_head0, 'chest', 0.22 * H)
B('head', P_head0, nose, 'neck', 0.30 * H)
B('tail1', P_tail0, P_tail1, 'hips', 0.12 * H)
B('tail2', P_tail1, tail_tip, 'tail1', 0.12 * H)
for side, sgn in (('L', +1), ('R', -1)):
    fp, bp = paws['F' + side], paws['B' + side]
    z_top_f, z_top_b = 0.56 * H, 0.52 * H
    x_f, x_b = fp[0] * 0.85, bp[0] * 0.85
    knee_f = (fp[0], fp[1] + 0.02 * L, 0.30 * H)
    knee_b = (bp[0], bp[1] - 0.03 * L, 0.30 * H)
    B('f_upper_' + side, (x_f, fp[1] + 0.02 * L, z_top_f), knee_f, 'chest', 0.15 * H)
    B('f_lower_' + side, knee_f, (fp[0], fp[1], 0.05 * H), 'f_upper_' + side, 0.12 * H)
    B('f_paw_' + side, (fp[0], fp[1], 0.05 * H), (fp[0], fp[1] - 0.07 * L, 0.0), 'f_lower_' + side, 0.10 * H)
    B('b_upper_' + side, (x_b, bp[1] + 0.03 * L, z_top_b), knee_b, 'hips', 0.16 * H)
    B('b_lower_' + side, knee_b, (bp[0], bp[1], 0.05 * H), 'b_upper_' + side, 0.12 * H)
    B('b_paw_' + side, (bp[0], bp[1], 0.05 * H), (bp[0], bp[1] - 0.07 * L, 0.0), 'b_lower_' + side, 0.10 * H)

arm_data = bpy.data.armatures.new('LupinRig')
arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, parent, r) in bones.items():
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = Vector(h), Vector(t)
    eb.roll = 0.0
for name, (h, t, parent, r) in bones.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
log('armature', len(bones), 'bones')

# ─── 6. weights by distance to bone segments ─────────────────────────────
names = [n for n in bones if bones[n][3] > 0]
Wm = np.zeros((len(V), len(names)))
for j, n in enumerate(names):
    h, t, _, r = bones[n]
    d = t - h
    ll = float(d @ d)
    tt = np.clip(((V - h) @ d) / ll, 0, 1) if ll > 1e-12 else np.zeros(len(V))
    proj = h + tt[:, None] * d
    dist = np.linalg.norm(V - proj, axis=1)
    Wm[:, j] = 1.0 / (1.0 + (dist / r) ** 4)
# Legs only own vertices below the body line; the belly and flanks stay on the spine.
for j, n in enumerate(names):
    if n.startswith(('f_', 'b_')):
        cutoff = 0.6 * H if 'upper' in n else 0.4 * H
        Wm[V[:, 2] > cutoff, j] *= 0.15
# Keep the strongest four influences per vertex.
order = np.argsort(-Wm, axis=1)[:, :4]
keep = np.zeros_like(Wm)
rows = np.arange(len(V))[:, None]
keep[rows, order] = Wm[rows, order]
keep[keep < 1e-3] = 0
keep /= np.maximum(keep.sum(1, keepdims=True), 1e-9)
groups = {n: mesh.vertex_groups.new(name=n) for n in names}
for j, n in enumerate(names):
    idx = np.nonzero(keep[:, j] > 0)[0]
    g = groups[n]
    for i in idx:
        g.add([int(i)], float(keep[i, j]), 'REPLACE')
mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm
log('weights assigned; top owners', {n: int((order[:, 0] == j).sum()) for j, n in enumerate(names)})

import traceback
try:
    # ─── 7. animation helpers ────────────────────────────────────────────────
    bpy.context.scene.render.fps = FPS
    rest = {b.name: b.matrix_local.to_3x3() for b in arm_data.bones}
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    def local_rot(bone, rots):
        """rots: list of (axis, degrees) applied in world (rest) space, in order."""
        Rw = Matrix.Identity(3)
        for ax, deg in rots:
            Rw = Rw @ Matrix.Rotation(math.radians(deg), 3, ax)
        Rr = rest[bone]
        return (Rr.inverted() @ Rw @ Rr).to_quaternion()

    def local_loc(bone, world_offset):
        return rest[bone].inverted() @ Vector(world_offset)

    # Sign conventions (bone faces -Y, up is +Z, left is +X):
    #   P(d): rotate about X so a downward leg swings its tip FORWARD by d degrees,
    #         a forward-pointing head/neck tips its nose UP by d, a rearward tail tips DOWN.
    #   Y(d): yaw about Z, tip moves toward +X (the animal's left) for a forward bone.
    #   R(d): roll about the forward axis.
    P = lambda d: ('X', -d)
    Y = lambda d: ('Z', d)
    R = lambda d: ('Y', d)

    def pose(frame, rot=None, loc=None):
        rot = rot or {}
        loc = loc or {}
        for pb in arm.pose.bones:
            q = local_rot(pb.name, rot.get(pb.name, []))
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            if pb.name == 'root':
                pb.location = local_loc('root', loc.get('root', (0, 0, 0)))
                pb.keyframe_insert('location', frame=frame)

    def new_action(name):
        act = bpy.data.actions.new(name)
        adt = arm.animation_data or arm.animation_data_create()
        adt.action = act
        if hasattr(act, 'slots'):
            slot = act.slots.new(id_type='OBJECT', name=arm.name)
            adt.action_slot = slot
        return act

    def finish_action(act, frames, loop):
        adt = arm.animation_data
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, frames
        if loop:
            act.use_cyclic = True
        # Blender 4.4+ keeps F-curves inside layer/strip channelbags; older builds on the action.
        fcurves = list(act.fcurves) if hasattr(act, 'fcurves') else [fc for ly in act.layers for st in ly.strips for cb in st.channelbags for fc in cb.fcurves]
        for fc in fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        track = adt.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, 0, act)
        try:
            strip.action_slot = adt.action_slot
        except Exception:
            pass
        strip.name = act.name
        adt.action = None

    def legs(t, amp_u, amp_l, phases, gallop=False):
        """Cyclic leg rotations at normalised time t (0..1)."""
        out = {}
        for leg, ph in phases.items():
            s = math.sin(2 * math.pi * (t + ph))
            lift = max(0.0, math.sin(2 * math.pi * (t + ph) + 0.6))
            up = 'f_upper_' if leg[0] == 'F' else 'b_upper_'
            lo = 'f_lower_' if leg[0] == 'F' else 'b_lower_'
            pw = 'f_paw_' if leg[0] == 'F' else 'b_paw_'
            side = leg[1]
            out[up + side] = [P(amp_u * LEG_MUL * s)]
            out[lo + side] = [P(-amp_l * LEG_MUL * lift)]
            out[pw + side] = [P(amp_l * LEG_MUL * 0.5 * lift)]
        return out

    def merge(*ds):
        out = {}
        for d in ds:
            for k, v in d.items():
                out[k] = out.get(k, []) + v
        return out

    # ─── 8. clips ────────────────────────────────────────────────────────────
    clips = []

    # Idle: breathing, a lazy tail wag, small head turns. 2.4 s loop.
    act = new_action('Idle'); F = 72
    for f in range(0, F + 1, 6):
        t = f / F
        br = math.sin(2 * math.pi * t)
        wag = math.sin(2 * math.pi * 3 * t)
        pose(f, merge(
            {'chest': [P(1.2 * br)], 'spine': [P(-0.8 * br)]},
            {'head': [Y(5 * math.sin(2 * math.pi * t + 1.0)), P(2 * br)], 'neck': [P(-1.5 * br)]},
            {'tail1': [Y(22 * wag)], 'tail2': [Y(26 * math.sin(2 * math.pi * 3 * t - 0.9))]},
        ))
    finish_action(act, F, True); clips.append('Idle'); log('clip Idle ok')

    # Walk: diagonal gait, 1.0 s loop.
    act = new_action('Walk'); F = 30
    ph = {'FL': 0.0, 'BR': 0.0, 'FR': 0.5, 'BL': 0.5}
    for f in range(0, F + 1, 3):
        t = f / F
        bob = 0.012 * L * abs(math.sin(2 * math.pi * 2 * t))
        pose(f, merge(
            legs(t, 24, 30, ph),
            {'head': [P(2 * math.sin(2 * math.pi * 2 * t)), Y(3 * math.sin(2 * math.pi * t))]},
            {'tail1': [Y(18 * math.sin(2 * math.pi * t)), P(5)], 'tail2': [Y(20 * math.sin(2 * math.pi * t - 0.8))]},
            {'hips': [R(4 * math.sin(2 * math.pi * t))], 'spine': [R(-2 * math.sin(2 * math.pi * t))]},
        ), loc={'root': (0, 0, bob)})
    finish_action(act, F, True); clips.append('Walk')

    # Run: gallop, 0.5 s loop, spine arch and a real bounce.
    act = new_action('Run'); F = 15
    ph = {'FL': 0.0, 'FR': 0.12, 'BL': 0.5, 'BR': 0.62}
    for f in range(0, F + 1, 3):
        t = f / F
        arch = math.sin(2 * math.pi * t)
        bob = 0.035 * L * max(0.0, math.sin(2 * math.pi * t + 0.4))
        pose(f, merge(
            legs(t, 42, 55, ph, gallop=True),
            {'hips': [P(9 * arch)], 'spine': [P(-7 * arch)], 'chest': [P(-6 * arch)]},
            {'neck': [P(6 * arch)], 'head': [P(-5 * arch)]},
            {'tail1': [P(-25 + 8 * arch)], 'tail2': [P(-10 + 6 * arch)]},
        ), loc={'root': (0, 0, bob)})
    finish_action(act, F, True); clips.append('Run')

    # Jump: crouch, spring, tuck, land. 0.8 s.
    act = new_action('Jump'); F = 24
    def jump_pose(f):
        if f <= 5:      # crouch
            k = f / 5
            return dict(loc=(0, 0, -0.06 * L * k), rot=merge(
                {'f_upper_L': [P(-14 * k)], 'f_upper_R': [P(-14 * k)], 'f_lower_L': [P(-20 * k)], 'f_lower_R': [P(-20 * k)]},
                {'b_upper_L': [P(16 * k)], 'b_upper_R': [P(16 * k)], 'b_lower_L': [P(-26 * k)], 'b_lower_R': [P(-26 * k)]},
                {'head': [P(8 * k)], 'chest': [P(-4 * k)], 'tail1': [P(-10 * k)]}))
        if f <= 13:     # spring up and forward
            k = (f - 5) / 8
            h = math.sin(k * math.pi * 0.5)
            return dict(loc=(0, -0.05 * L * k, 0.32 * L * h), rot=merge(
                {'f_upper_L': [P(38 * h)], 'f_upper_R': [P(38 * h)], 'f_lower_L': [P(-30 * h)], 'f_lower_R': [P(-30 * h)]},
                {'b_upper_L': [P(-34 * h)], 'b_upper_R': [P(-34 * h)], 'b_lower_L': [P(-10 * h)], 'b_lower_R': [P(-10 * h)]},
                {'hips': [P(10 * h)], 'chest': [P(-6 * h)], 'head': [P(12 * h)], 'tail1': [P(-30 * h)], 'tail2': [P(-15 * h)]}))
        if f <= 19:     # fall
            k = (f - 13) / 6
            h = math.cos(k * math.pi * 0.5)
            return dict(loc=(0, -0.05 * L * (1 - k), 0.32 * L * h), rot=merge(
                {'f_upper_L': [P(38 * h - 10 * (1 - h))], 'f_upper_R': [P(38 * h - 10 * (1 - h))], 'f_lower_L': [P(-30 * h)], 'f_lower_R': [P(-30 * h)]},
                {'b_upper_L': [P(-34 * h + 12 * (1 - h))], 'b_upper_R': [P(-34 * h + 12 * (1 - h))], 'b_lower_L': [P(-10 * h - 18 * (1 - h))], 'b_lower_R': [P(-10 * h - 18 * (1 - h))]},
                {'hips': [P(10 * h)], 'head': [P(12 * h - 4 * (1 - h))], 'tail1': [P(-30 * h)], 'tail2': [P(-15 * h)]}))
        k = (f - 19) / 5    # land and settle
        s = 1 - k
        return dict(loc=(0, 0, -0.04 * L * s), rot=merge(
            {'f_upper_L': [P(-10 * s)], 'f_upper_R': [P(-10 * s)], 'f_lower_L': [P(-16 * s)], 'f_lower_R': [P(-16 * s)]},
            {'b_upper_L': [P(12 * s)], 'b_upper_R': [P(12 * s)], 'b_lower_L': [P(-18 * s)], 'b_lower_R': [P(-18 * s)]},
            {'head': [P(-4 * s)], 'chest': [P(-3 * s)]}))
    for f in (0, 3, 5, 9, 13, 16, 19, 22, 24):
        jp = jump_pose(f)
        pose(f, jp['rot'], loc={'root': jp['loc']})
    finish_action(act, F, False); clips.append('Jump')

    # Attack: rear back, lunge and snap, recover. 0.5 s.
    act = new_action('Attack'); F = 15
    attack = {
        0: dict(loc=(0, 0, 0), rot={}),
        4: dict(loc=(0, 0.06 * L, -0.02 * L), rot=merge(
            {'chest': [P(6)], 'neck': [P(8)], 'head': [P(18)]},
            {'f_upper_L': [P(-12)], 'f_upper_R': [P(-12)], 'f_lower_L': [P(-14)], 'f_lower_R': [P(-14)]},
            {'b_upper_L': [P(14)], 'b_upper_R': [P(14)], 'b_lower_L': [P(-22)], 'b_lower_R': [P(-22)]},
            {'tail1': [P(-20)]})),
        8: dict(loc=(0, -0.14 * L, 0.04 * L), rot=merge(
            {'hips': [P(-6)], 'spine': [P(-8)], 'chest': [P(-10)], 'neck': [P(-12)], 'head': [P(-22), Y(6)]},
            {'f_upper_L': [P(34)], 'f_upper_R': [P(26)], 'f_lower_L': [P(-28)], 'f_lower_R': [P(-20)]},
            {'b_upper_L': [P(-26)], 'b_upper_R': [P(-26)], 'b_lower_L': [P(-8)], 'b_lower_R': [P(-8)]},
            {'tail1': [P(-30)], 'tail2': [P(-10)]})),
        11: dict(loc=(0, -0.08 * L, 0.0), rot=merge(
            {'chest': [P(-4)], 'neck': [P(-4)], 'head': [P(-10), Y(-8)]},
            {'f_upper_L': [P(12)], 'f_upper_R': [P(8)], 'f_lower_L': [P(-16)], 'f_lower_R': [P(-12)]},
            {'b_upper_L': [P(-8)], 'b_upper_R': [P(-8)], 'b_lower_L': [P(-12)], 'b_lower_R': [P(-12)]},
            {'tail1': [P(-16)]})),
        15: dict(loc=(0, 0, 0), rot={}),
    }
    for f, d in attack.items():
        pose(f, d['rot'], loc={'root': d['loc']})
    finish_action(act, F, False); clips.append('Attack')

    # Howl: sit back a touch, nose to the sky, hold with a quaver, come down. 2.0 s.
    act = new_action('Howl'); F = 60
    def howl_pose(f):
        if f <= 12:
            k = math.sin((f / 12) * math.pi / 2)
        elif f <= 46:
            k = 1.0
        else:
            k = math.cos(((f - 46) / 14) * math.pi / 2)
        quaver = math.sin(f * 1.3) * 2.5 if 12 < f < 46 else 0
        return dict(loc=(0, 0.02 * L * k, -0.03 * L * k), rot=merge(
            {'hips': [P(-5 * k)], 'spine': [P(6 * k)], 'chest': [P(14 * k)], 'neck': [P(34 * k)], 'head': [P(58 * k + quaver), Y(quaver * 0.6)]},
            {'b_upper_L': [P(10 * k)], 'b_upper_R': [P(10 * k)], 'b_lower_L': [P(-16 * k)], 'b_lower_R': [P(-16 * k)]},
            {'f_upper_L': [P(-6 * k)], 'f_upper_R': [P(-6 * k)]},
            {'tail1': [P(-16 * k)], 'tail2': [P(-8 * k)]}))
    for f in list(range(0, 13, 4)) + list(range(16, 47, 5)) + [50, 55, 60]:
        hp = howl_pose(f)
        pose(f, hp['rot'], loc={'root': hp['loc']})
    finish_action(act, F, False); clips.append('Howl')

    # Bark: two sharp head thrusts with a stiff tail and a tiny hop. 0.6 s.
    act = new_action('Bark'); F = 18
    def bark_pose(f):
        thrust = 0.0
        for c in (3, 10):
            if abs(f - c) <= 3:
                thrust = max(thrust, math.cos((f - c) / 3 * math.pi / 2))
        return dict(loc=(0, -0.02 * L * thrust, 0.012 * L * thrust), rot=merge(
            {'chest': [P(-3 * thrust)], 'neck': [P(-6 * thrust)], 'head': [P(-14 * thrust)]},
            {'f_upper_L': [P(6 * thrust)], 'f_upper_R': [P(6 * thrust)]},
            {'b_upper_L': [P(4 * thrust)], 'b_upper_R': [P(4 * thrust)]},
            {'tail1': [P(-24)], 'tail2': [P(-8)]}))
    for f in (0, 1, 3, 6, 8, 10, 13, 15, 18):
        bp = bark_pose(f)
        pose(f, bp['rot'], loc={'root': bp['loc']})
    finish_action(act, F, False); clips.append('Bark')

    # Drop the clips the caller did not ask for (their NLA tracks and actions).
    adt = arm.animation_data
    for tr in list(adt.nla_tracks):
        if tr.name not in CLIPS:
            adt.nla_tracks.remove(tr)
    for a in list(bpy.data.actions):
        if a.name not in CLIPS:
            bpy.data.actions.remove(a)
    clips = [c for c in clips if c in CLIPS]
    log('clips', clips)

    # ─── 9. export ───────────────────────────────────────────────────────────
    for o in bpy.data.objects: o.select_set(True)
    want = dict(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                export_force_sampling=True, export_frame_range=False, export_optimize_animation_size=False,
                export_anim_single_armature=True, export_reset_pose_bones=True, export_bake_animation=True,
                export_materials='EXPORT', export_image_format='AUTO', export_texcoords=True, export_normals=True,
                export_def_bones=False, export_rest_position_armature=True, use_selection=False)
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kw = {k: v for k, v in want.items() if k in props}
    log('export kwargs dropped', sorted(set(want) - props))
    bpy.ops.export_scene.gltf(**kw)
    log('exported', OUT, os.path.getsize(OUT), 'bytes')

except Exception:
    log("TRACEBACK " + traceback.format_exc())
    raise
