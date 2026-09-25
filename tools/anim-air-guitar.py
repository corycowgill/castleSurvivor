"""
Key an "Epic Air Guitar" clip onto the dad knight's skeleton in headless Blender.

  blender-launcher.exe -b --python tools/anim-air-guitar.py -- [--log FILE] [--preview FILE]

Reads Game3DAssets/dadwrig.glb, drops its Death_A clip, keys a 4-second loop by
formula (fretting hand out on the neck with vibrato, strumming hand at 4 Hz,
head-banging at 2 Hz, knees on the beat, one full windmill with a lean-back and a
hop) and writes Game3DAssets/dadAirGuitar.glb: the ARMATURE ONLY with the clip,
so the game applies it to whichever dad mesh is loaded (three.js binds animation
tracks by bone name). --preview also writes a copy with the mesh for view-anim.

Posing is by world direction, not euler: for each bone the script reads its
current direction in world space and rotates it onto the wanted one (the same
setFromUnitVectors idea as the game's ride pose), so the UE-mannequin rest axes
never matter. World here is Blender's: the knight faces -Y, his left is +X, up +Z.
"""
import bpy, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def opt(k, d): return argv[argv.index(k) + 1] if k in argv else d
ROOT = r'C:\Users\coryc\castleSurvivor'
IN = os.path.join(ROOT, 'Game3DAssets', 'dadwrig.glb')
OUT = os.path.join(ROOT, 'Game3DAssets', 'dadAirGuitar.glb')
PREVIEW = opt('--preview', None)
LOG_PATH = opt('--log', None)
_log = open(LOG_PATH, 'w', encoding='utf-8') if LOG_PATH else None
def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True)
    if _log: _log.write(s + '\n'); _log.flush()

import traceback
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=IN)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    log('imported', arm.name, 'bones', len(arm.data.bones), 'meshes', len(meshes))

    # Drop the imported clip(s) so only ours exports
    adt = arm.animation_data or arm.animation_data_create()
    for tr in list(adt.nla_tracks): adt.nla_tracks.remove(tr)
    adt.action = None
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)

    FPS = 30; F = 120
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 0; bpy.context.scene.frame_end = F
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    act = bpy.data.actions.new('Air_Guitar')
    adt.action = act
    if hasattr(act, 'slots'):
        slot = act.slots.new(id_type='OBJECT', name=arm.name)
        adt.action_slot = slot

    MW = arm.matrix_world
    MW3 = MW.to_3x3()
    def update(): bpy.context.view_layer.update()

    def world_dir(pb):
        return (MW3 @ (pb.tail - pb.head)).normalized()

    def aim(name, d, roll=0.0):
        """Rotate bone `name` so it points along world direction d (then roll about it)."""
        pb = arm.pose.bones[name]
        update()
        d = Vector(d).normalized()
        cur = world_dir(pb)
        R = cur.rotation_difference(d).to_matrix().to_4x4()
        if roll:
            R = Matrix.Rotation(math.radians(roll), 4, d) @ R
        M = MW @ pb.matrix
        head = M.to_translation()
        newW = Matrix.Translation(head) @ R @ M.to_3x3().to_4x4()
        pb.matrix = MW.inverted() @ newW
        update()

    def lift(name, dz):
        pb = arm.pose.bones[name]
        update()
        M = MW @ pb.matrix
        newW = Matrix.Translation(Vector((0, 0, dz))) @ M
        pb.matrix = MW.inverted() @ newW
        update()

    def reset():
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
        update()

    def key(frame, names):
        for n in names:
            pb = arm.pose.bones[n]
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            if n == 'pelvis': pb.keyframe_insert('location', frame=frame)

    TAU = math.tau
    POSED = ['pelvis', 'spine_02', 'spine_03', 'neck_01', 'head',
             'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
             'thigh_l', 'calf_l', 'thigh_r', 'calf_r']

    for f in range(0, F + 1, 2):
        t = f / F
        reset()
        # The beat: strum 4 Hz, head-bang 2 Hz, vibrato 6 Hz (all whole cycles in 4 s)
        strum = math.sin(TAU * 4 * t)
        bang = max(0.0, math.sin(TAU * 2 * t)) ** 1.5
        vib = math.sin(TAU * 6 * t)
        # The windmill: t 0.66 .. 0.86, one full circle, straight right arm
        wm = 0.0
        if 0.66 <= t <= 0.86:
            wm = (t - 0.66) / 0.20
        lean = math.sin(wm * math.pi) * 0.7 if wm else 0.0      # lean back through the windmill
        hop = math.sin(wm * math.pi) ** 2 * 0.09 if wm else 0.0
        kb = 0.35 + 0.4 * bang                                  # knee bend on the beat
        bob = -0.012 * bang - 0.01 * kb + hop

        # Hips and spine
        lift('pelvis', bob)
        aim('spine_02', (0.06 * math.sin(TAU * t), 0.06 + 0.15 * lean, 1.0), roll=8 * math.sin(TAU * t))
        aim('spine_03', (0.0, -0.05 - 0.45 * bang + 0.7 * lean, 1.0))
        # Head-bang: sharp nods, and up to the sky on the windmill
        aim('neck_01', (0.05 * math.sin(TAU * 2 * t), -0.15 - 0.5 * bang + 0.5 * lean, 1.0))
        aim('head', (0.12 * math.sin(TAU * 2 * t + 0.5), -0.35 - 1.0 * bang + 0.8 * lean, 0.95 - 0.75 * bang))
        # Fretting arm: out to the left on the neck, wrist vibrato
        # The neck of the guitar runs out to his left and up about 25 degrees
        aim('upperarm_l', (0.9, -0.32, -0.22 + 0.2 * lean))
        aim('lowerarm_l', (0.76, -0.55, 0.3 + 0.06 * vib))
        aim('hand_l', (0.72, -0.6, 0.32 + 0.14 * vib), roll=30 * vib)
        # Strumming arm, or the windmill
        if wm:
            th = wm * TAU
            d = (-0.22, -math.sin(th), -math.cos(th))
            aim('upperarm_r', d); aim('lowerarm_r', d); aim('hand_r', d)
        else:
            aim('upperarm_r', (-0.18, -0.3, -0.93))
            aim('lowerarm_r', (0.78, -0.55, 0.05 + 0.5 * strum))
            aim('hand_r', (0.7, -0.45, 0.0 + 0.85 * strum), roll=25 * strum)
        # Legs: wide stance, knees pumping on the beat
        aim('thigh_l', (0.3, -0.22 * kb, -0.95))
        aim('calf_l', (0.24, 0.28 * kb, -0.93))
        aim('thigh_r', (-0.3, -0.22 * kb, -0.95))
        aim('calf_r', (-0.24, 0.28 * kb, -0.93))
        key(f, POSED)

    act.use_frame_range = True; act.frame_start, act.frame_end = 0, F
    act.use_cyclic = True
    fcurves = list(act.fcurves) if hasattr(act, 'fcurves') else [fc for ly in act.layers for st in ly.strips for cb in st.channelbags for fc in cb.fcurves]
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
    track = adt.nla_tracks.new(); track.name = act.name
    strip = track.strips.new(act.name, 0, act)
    try: strip.action_slot = adt.action_slot
    except Exception: pass
    adt.action = None
    log('keyed', len(fcurves), 'curves')

    common = dict(export_format='GLB', export_yup=True, export_apply=True, export_skins=True,
                  export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                  export_frame_range=False, export_optimize_animation_size=False, export_anim_single_armature=True,
                  export_reset_pose_bones=True, export_bake_animation=True, export_def_bones=False,
                  export_rest_position_armature=True, export_materials='EXPORT', export_image_format='AUTO')
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kw = {k: v for k, v in common.items() if k in props}
    if PREVIEW:
        for o in bpy.data.objects: o.select_set(True)
        bpy.ops.export_scene.gltf(filepath=PREVIEW, use_selection=False, **kw)
        log('preview', PREVIEW, os.path.getsize(PREVIEW))
    for o in bpy.data.objects: o.select_set(o == arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, **kw)
    log('exported', OUT, os.path.getsize(OUT), 'bytes')
except Exception:
    log('TRACEBACK ' + traceback.format_exc()); raise
