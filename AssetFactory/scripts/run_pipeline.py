"""
Castle Survivor Asset Factory Pipeline.

End-to-end: SD image generation → rembg → Trellis GLB → validation → optimization.
Uses ComfyUI API for both SD and Trellis (via ComfyUI-Trellis2 custom nodes).

Usage:
  python run_pipeline.py                   # Process batch 1 (10 test assets)
  python run_pipeline.py --batch 2         # Process batch N
  python run_pipeline.py --ids a,b,c       # Process specific asset IDs
  python run_pipeline.py --status          # Show progress
  python run_pipeline.py --images-only     # Only generate SD images
  python run_pipeline.py --glb-only        # Only generate GLBs from existing images
  python run_pipeline.py --optimize-only   # Only optimize existing raw GLBs
  python run_pipeline.py --resume          # Resume in-progress assets
"""

import os
import sys
import json
import time
import uuid
import shutil
import argparse
import subprocess
import urllib.request
import urllib.error

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ─── PATHS ────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FACTORY_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(FACTORY_DIR)

CATALOG_PATH = os.path.join(FACTORY_DIR, "catalog", "assets.json")
GENERATED_PATH = os.path.join(FACTORY_DIR, "catalog", "generated.json")
FAILED_PATH = os.path.join(FACTORY_DIR, "catalog", "failed.json")
CATEGORIES_PATH = os.path.join(FACTORY_DIR, "catalog", "categories.json")

SOURCE_IMAGES_DIR = os.path.join(FACTORY_DIR, "source_images")
GLB_RAW_DIR = os.path.join(FACTORY_DIR, "glb_raw")
GLB_OPTIMIZED_DIR = os.path.join(FACTORY_DIR, "glb_optimized")
THUMBNAILS_DIR = os.path.join(FACTORY_DIR, "thumbnails")
REPORTS_DIR = os.path.join(FACTORY_DIR, "reports")
PROMPTS_DIR = os.path.join(FACTORY_DIR, "prompts")

COMFYUI_DIR = r"C:\Users\coryc\ComfyUI"
COMFYUI_INPUT = os.path.join(COMFYUI_DIR, "input")
COMFYUI_OUTPUT = os.path.join(COMFYUI_DIR, "output")
COMFYUI_URL = "http://127.0.0.1:8188"

GAME_ASSETS_DIR = os.path.join(PROJECT_DIR, "Game3DAssets")

# ─── SD SETTINGS ──────────────────────────────────────

CHECKPOINT = "juggernautXL_v9.safetensors"
WIDTH = 1024
HEIGHT = 1024
STEPS = 30
CFG = 7.0
SAMPLER = "euler_ancestral"
SCHEDULER = "normal"
MAX_IMAGE_ATTEMPTS = 4

# ─── CATEGORY → SOURCE DIR MAPPING ───────────────────

CATEGORY_DIRS = {
    "village_clutter": "props",
    "village_infrastructure": "village",
    "blacksmith_kit": "village",
    "farm_kit": "village",
    "tavern_kit": "village",
    "nature": "vegetation",
    "combat": "combat",
    "terrain": "terrain",
    "landmarks": "landmarks",
}

# ═══════════════════════════════════════════════════════
# CATALOG
# ═══════════════════════════════════════════════════════

def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_catalog(assets):
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(assets, f, indent=2)

def update_asset(asset_id, updates):
    assets = load_catalog()
    for a in assets:
        if a["id"] == asset_id:
            a.update(updates)
            break
    save_catalog(assets)

def log_generated(asset_id, stage, metadata=None):
    path = GENERATED_PATH
    data = json.load(open(path, "r", encoding="utf-8")) if os.path.exists(path) else []
    data.append({"id": asset_id, "stage": stage, "metadata": metadata or {},
                 "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")})
    json.dump(data, open(path, "w", encoding="utf-8"), indent=2)

def log_failed(asset_id, reason, stage):
    update_asset(asset_id, {"status": f"{stage}_failed"})
    path = FAILED_PATH
    data = json.load(open(path, "r", encoding="utf-8")) if os.path.exists(path) else []
    data.append({"id": asset_id, "reason": reason, "stage": stage,
                 "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")})
    json.dump(data, open(path, "w", encoding="utf-8"), indent=2)


# ═══════════════════════════════════════════════════════
# PROMPT BUILDER
# ═══════════════════════════════════════════════════════

_prompt_cache = {}

def load_text(filepath):
    if filepath not in _prompt_cache:
        with open(filepath, "r", encoding="utf-8") as f:
            _prompt_cache[filepath] = f.read().strip()
    return _prompt_cache[filepath]

def build_prompt(asset):
    base = load_text(os.path.join(PROMPTS_DIR, "base_prompt.txt"))
    template_name = asset.get("promptTemplate", "PROP")
    template = load_text(os.path.join(PROMPTS_DIR, "category_prompts", f"{template_name}.txt"))

    prompt = template.replace("{base_prompt}", base)
    prompt = prompt.replace("{asset_description}", asset.get("promptDetails", asset["name"]))
    prompt = prompt.replace("{extra_details}", "")
    return prompt.strip()

def get_negative_prompt():
    return load_text(os.path.join(PROMPTS_DIR, "negative_prompt.txt"))


# ═══════════════════════════════════════════════════════
# COMFYUI CLIENT
# ═══════════════════════════════════════════════════════

def check_comfyui():
    try:
        urllib.request.urlopen(f"{COMFYUI_URL}/system_stats", timeout=5)
        return True
    except Exception:
        return False

def submit_workflow(workflow, client_id):
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result["prompt_id"]

def wait_for_completion(prompt_id, timeout=300, label=""):
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                status = history[prompt_id].get("status", {})
                outputs = history[prompt_id].get("outputs", {})
                if status.get("status_str") == "error":
                    msgs = status.get("messages", [])
                    return False, f"Error: {msgs}"
                # Check for any outputs (images for SD, gltf_files for Trellis, etc.)
                if outputs:
                    for node_id, node_out in outputs.items():
                        if "images" in node_out:
                            for img in node_out["images"]:
                                return True, img.get("filename", "completed")
                        # Trellis ExportMesh nodes produce gltf_files or other keys
                        if "gltf_files" in node_out or "mesh" in node_out:
                            return True, "completed"
                    # If outputs dict is non-empty, execution succeeded
                    return True, "completed"
                if status.get("completed", False) or status.get("status_str") == "success":
                    return True, "completed"
        except Exception:
            pass
        elapsed = time.time() - start
        print(f"    [{elapsed:.0f}s] Waiting... {label}", end="\r", flush=True)
        time.sleep(5)
    return False, "Timeout"

def find_comfyui_output(prefix, ext=".png"):
    """Find most recent file in ComfyUI output matching prefix.
    Handles ComfyUI counter suffixes like _00001_ in filenames."""
    if not os.path.exists(COMFYUI_OUTPUT):
        return None
    matches = []
    for f in os.listdir(COMFYUI_OUTPUT):
        if not f.endswith(ext):
            continue
        # Match exact prefix or prefix with ComfyUI counter suffix (_00001_)
        name_no_ext = f
        if f.startswith(prefix):
            full = os.path.join(COMFYUI_OUTPUT, f)
            matches.append((os.path.getmtime(full), full))
    if matches:
        matches.sort(reverse=True)
        return matches[0][1]
    return None


# ═══════════════════════════════════════════════════════
# SD IMAGE GENERATION
# ═══════════════════════════════════════════════════════

def build_sd_workflow(positive, negative, seed, filename_prefix):
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT}
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["1", 1]}
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["1", 1]}
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": STEPS,
                "cfg": CFG,
                "sampler_name": SAMPLER,
                "scheduler": SCHEDULER,
                "denoise": 1.0
            }
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]}
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": filename_prefix}
        }
    }

def hash_seed(s):
    h = 0
    for c in s:
        h = ((h << 5) - h + ord(c)) & 0xFFFFFFFF
    return h % 999999999

def generate_sd_image(asset, attempt=0):
    """Generate an SD image via ComfyUI. Returns path to the image or None."""
    asset_id = asset["id"]
    positive = build_prompt(asset)
    negative = get_negative_prompt()
    seed = hash_seed(asset_id) + attempt * 1000
    prefix = asset_id

    print(f"    Generating image (attempt {attempt+1}, seed {seed})...")

    client_id = str(uuid.uuid4())
    workflow = build_sd_workflow(positive, negative, seed, prefix)

    try:
        prompt_id = submit_workflow(workflow, client_id)
    except Exception as e:
        print(f"    Submit failed: {e}")
        return None

    ok, result = wait_for_completion(prompt_id, timeout=120, label=asset_id)
    print()  # Clear the waiting line

    if not ok:
        print(f"    Generation failed: {result}")
        return None

    # Find the output image
    time.sleep(1)
    img_path = find_comfyui_output(prefix, ".png")
    if not img_path:
        print(f"    Could not find output image for {prefix}")
        return None

    # Copy to source_images
    cat_dir = CATEGORY_DIRS.get(asset.get("category", ""), "props")
    dest_dir = os.path.join(SOURCE_IMAGES_DIR, cat_dir)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, f"{asset_id}.png")
    shutil.copy2(img_path, dest_path)
    print(f"    Saved: {dest_path}")
    return dest_path


# ═══════════════════════════════════════════════════════
# BACKGROUND REMOVAL (rembg)
# ═══════════════════════════════════════════════════════

def remove_background(image_path):
    """Remove background using rembg. Overwrites in-place."""
    print(f"    Removing background...")
    try:
        # Use rembg CLI
        temp_out = image_path + ".tmp.png"
        subprocess.run(
            ["rembg", "i", image_path, temp_out],
            capture_output=True, timeout=120, check=True
        )
        if os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
            shutil.move(temp_out, image_path)
            print(f"    Background removed OK")
            return True
        else:
            print(f"    rembg produced no output")
            return False
    except subprocess.CalledProcessError as e:
        print(f"    rembg error: {e.stderr.decode()[:200] if e.stderr else 'unknown'}")
        return False
    except FileNotFoundError:
        print(f"    rembg not found — skipping bg removal")
        return False
    except Exception as e:
        print(f"    rembg error: {e}")
        return False
    finally:
        if os.path.exists(image_path + ".tmp.png"):
            try: os.remove(image_path + ".tmp.png")
            except: pass


# ═══════════════════════════════════════════════════════
# TRELLIS GLB GENERATION (via ComfyUI-Trellis2 nodes)
# ═══════════════════════════════════════════════════════

def build_trellis_workflow(image_filename, asset_name):
    """Build the full Trellis2 workflow matching the proven batch_trellis.py pattern."""
    return {
        "6": {
            "class_type": "Trellis2LoadImageWithTransparency",
            "inputs": {"image": image_filename}
        },
        "39": {
            "class_type": "Trellis2LoadModel",
            "inputs": {
                "modelname": "microsoft/TRELLIS.2-4B",
                "backend": "sdpa",
                "device": "cuda",
                "low_vram": True,
                "keep_models_loaded": True,
                "conv_backend": "flex_gemm",
                "sparse_backend": "sdpa",
                "use_reconviagen": False,
                "pixal3d_multiview": False
            }
        },
        "194": {
            "class_type": "Trellis2PreProcessImage",
            "inputs": {
                "image": ["6", 2],
                "padding": 10,
                "remove_background": True,
                "max_size": 512
            }
        },
        "209": {
            "class_type": "PrimitiveInt",
            "inputs": {"value": 100000}
        },
        "213": {
            "class_type": "Trellis2ImageCondGenerator",
            "inputs": {
                "pipeline": ["39", 0],
                "image": ["194", 0],
                "max_views": 1
            }
        },
        "214": {
            "class_type": "Trellis2SparseGenerator",
            "inputs": {
                "pipeline": ["213", 2],
                "image_cond": ["213", 0],
                "seed": 12345,
                "sparse_structure_steps": 12,
                "sparse_structure_guidance_strength": 7.5,
                "sparse_structure_guidance_rescale": 0.01,
                "sparse_structure_rescale_t": 5,
                "sparse_structure_sampler": "heun",
                "sparse_structure_resolution": 32,
                "sparse_structure_guidance_interval_start": 0.1,
                "sparse_structure_guidance_interval_end": 1.0,
                "fill_holes": True,
                "hole_iterations": 1,
                "verbose": False,
                "dino_lock": 0,
                "dino_substeps": 8,
                "hole_fill_algorithm": "flood_fill",
                "dino_foundation_cap": 1,
                "keep_only_shell": True
            }
        },
        "215": {
            "class_type": "Trellis2ShapeGenerator",
            "inputs": {
                "pipeline": ["214", 2],
                "image_cond": ["213", 0],
                "coords": ["214", 0],
                "resolution": 512,
                "shape_steps": 16,
                "shape_guidance_strength": 7.5,
                "shape_guidance_rescale": 0.01,
                "shape_rescale_t": 3,
                "shape_sampler": "heun",
                "shape_guidance_interval_start": 0.1,
                "shape_guidance_interval_end": 1.0,
                "verbose": False,
                "dino_lock": 0,
                "dino_substeps": 9,
                "dino_foundation_cap": 1
            }
        },
        "217": {
            "class_type": "Trellis2DecodeLatents",
            "inputs": {
                "pipeline": ["215", 2],
                "shape_slat": ["215", 0],
                "resolution": ["215", 1],
                "use_tiled_decoder": True
            }
        },
        "193": {
            "class_type": "Trellis2FillHolesWithCuMesh",
            "inputs": {
                "mesh": ["217", 0],
                "max_permieters": 1
            }
        },
        "161": {
            "class_type": "Trellis2ReconstructMeshWithQuad",
            "inputs": {
                "mesh": ["193", 0],
                "remesh_band": 1.0,
                "resolution": 512,
                "remove_floaters": True,
                "remove_inner_faces": True
            }
        },
        "218": {
            "class_type": "Trellis2SimplifyMesh",
            "inputs": {
                "mesh": ["161", 0],
                "target_face_num": ["209", 0],
                "method": "Cumesh"
            }
        },
        "250": {
            "class_type": "Trellis2FillHolesNicelyWithMeshlib",
            "inputs": {"mesh": ["218", 0]}
        },
        "257": {
            "class_type": "Trellis2SimplifyMesh",
            "inputs": {
                "mesh": ["250", 0],
                "target_face_num": ["209", 0],
                "method": "Cumesh"
            }
        },
        "260": {
            "class_type": "PrimitiveInt",
            "inputs": {"value": 1024}
        },
        "264": {
            "class_type": "Trellis2MeshWithVoxelToTrimesh",
            "inputs": {
                "mesh": ["257", 0],
                "reorient_vertices": "90 degrees"
            }
        },
        "219": {
            "class_type": "PrimitiveString",
            "inputs": {"value": asset_name}
        },
        "265": {
            "class_type": "StringConcatenate",
            "inputs": {
                "string_a": ["219", 0],
                "string_b": "_WhiteMesh",
                "delimiter": ""
            }
        },
        "266": {
            "class_type": "StringConcatenate",
            "inputs": {
                "string_a": ["219", 0],
                "string_b": "_Textured",
                "delimiter": ""
            }
        },
        "203": {
            "class_type": "Trellis2ExportMesh",
            "inputs": {
                "trimesh": ["264", 0],
                "filename_prefix": ["265", 0],
                "file_format": "glb"
            }
        },
        "267": {
            "class_type": "Trellis2Continue",
            "inputs": {
                "input_1": ["264", 0],
                "input_2": ["203", 0]
            }
        },
        "261": {
            "class_type": "Trellis2MeshTexturing",
            "inputs": {
                "pipeline": ["217", 2],
                "image": ["194", 0],
                "trimesh": ["267", 0],
                "seed": 12345,
                "texture_steps": 16,
                "texture_guidance_strength": 5,
                "texture_guidance_rescale": 0.05,
                "texture_rescale_t": 3,
                "resolution": 512,
                "texture_size": ["260", 0],
                "texture_alpha_mode": "OPAQUE",
                "double_side_material": False,
                "texture_guidance_interval_start": 0.0,
                "texture_guidance_interval_end": 0.99,
                "max_views": 6,
                "bake_on_vertices": False,
                "use_custom_normals": False,
                "mesh_cluster_threshold_cone_half_angle_rad": 60,
                "sampler": "heun",
                "inpainting": "ns",
                "verbose": False,
                "dino_lock": 0,
                "dino_substeps": 4,
                "dino_foundation_cap": 1
            }
        },
        "262": {
            "class_type": "Trellis2ExportMesh",
            "inputs": {
                "trimesh": ["261", 0],
                "filename_prefix": ["266", 0],
                "file_format": "glb"
            }
        }
    }

def copy_image_to_comfyui_input(image_path, asset_id):
    """Copy/resize image to ComfyUI input folder for Trellis."""
    from PIL import Image
    os.makedirs(COMFYUI_INPUT, exist_ok=True)
    dest = os.path.join(COMFYUI_INPUT, f"{asset_id}.png")

    img = Image.open(image_path)
    w, h = img.size
    target = 512
    if max(w, h) > target:
        ratio = target / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    img.save(dest, "PNG")
    return f"{asset_id}.png"

def generate_trellis_glb(asset, image_path):
    """Generate GLB via ComfyUI Trellis2 workflow. Returns path or None."""
    asset_id = asset["id"]

    print(f"    Copying image to ComfyUI input...")
    comfyui_filename = copy_image_to_comfyui_input(image_path, asset_id)

    print(f"    Submitting Trellis workflow...")
    client_id = str(uuid.uuid4())
    workflow = build_trellis_workflow(comfyui_filename, asset_id)

    try:
        prompt_id = submit_workflow(workflow, client_id)
        print(f"    Prompt ID: {prompt_id}")
    except Exception as e:
        print(f"    Submit failed: {e}")
        return None

    # Trellis takes ~8-10 min per asset on RTX 4060; 20 min timeout
    ok, result = wait_for_completion(prompt_id, timeout=2400, label=f"Trellis: {asset_id}")
    print()

    if not ok:
        print(f"    Trellis generation failed: {result}")
        return None

    # Find the textured GLB output — ComfyUI appends _00001_ counter
    time.sleep(3)
    glb_path = find_comfyui_output(f"{asset_id}_Textured", ".glb")
    if not glb_path:
        # Try without _Textured suffix
        glb_path = find_comfyui_output(asset_id, ".glb")

    if not glb_path:
        print(f"    Could not find output GLB for {asset_id}")
        return None

    # Copy to glb_raw
    os.makedirs(GLB_RAW_DIR, exist_ok=True)
    dest = os.path.join(GLB_RAW_DIR, f"{asset_id}.glb")
    shutil.copy2(glb_path, dest)
    print(f"    Raw GLB saved: {dest} ({os.path.getsize(dest)/1024:.0f}KB)")
    return dest


# ═══════════════════════════════════════════════════════
# GLB OPTIMIZATION (via Node.js glb-optimizer)
# ═══════════════════════════════════════════════════════

def optimize_glb(asset, raw_glb_path):
    """Optimize GLB using the Node.js optimizer scripts."""
    asset_id = asset["id"]
    os.makedirs(GLB_OPTIMIZED_DIR, exist_ok=True)
    dest = os.path.join(GLB_OPTIMIZED_DIR, f"{asset_id}.glb")

    print(f"    Optimizing GLB...")
    try:
        result = subprocess.run(
            ["node", os.path.join(SCRIPT_DIR, "optimize-single.mjs"), raw_glb_path, dest, asset.get("category", "")],
            capture_output=True, text=True, timeout=120,
            cwd=PROJECT_DIR
        )
        if result.returncode == 0 and os.path.exists(dest):
            raw_size = os.path.getsize(raw_glb_path)
            opt_size = os.path.getsize(dest)
            reduction = (1 - opt_size / raw_size) * 100 if raw_size > 0 else 0
            print(f"    Optimized: {raw_size/1024:.0f}KB -> {opt_size/1024:.0f}KB ({reduction:.1f}% reduction)")
            return dest
        else:
            print(f"    Optimization failed: {result.stderr[:200]}")
            # Fall back to just copying the raw GLB
            shutil.copy2(raw_glb_path, dest)
            print(f"    Copied raw GLB as fallback")
            return dest
    except Exception as e:
        print(f"    Optimization error: {e}")
        shutil.copy2(raw_glb_path, dest)
        return dest


# ═══════════════════════════════════════════════════════
# FULL PIPELINE
# ═══════════════════════════════════════════════════════

def find_source_image(asset_id, category=""):
    """Find existing source image for an asset."""
    cat_dir = CATEGORY_DIRS.get(category, "props")
    path = os.path.join(SOURCE_IMAGES_DIR, cat_dir, f"{asset_id}.png")
    if os.path.exists(path):
        return path
    # Check all subdirs
    for d in CATEGORY_DIRS.values():
        path = os.path.join(SOURCE_IMAGES_DIR, d, f"{asset_id}.png")
        if os.path.exists(path):
            return path
    return None

def process_asset(asset, images_only=False, glb_only=False, optimize_only=False):
    """Process a single asset through all pipeline stages."""
    asset_id = asset["id"]
    status = asset.get("status", "pending")
    category = asset.get("category", "")

    # ── Stage 1: SD Image ──
    image_path = find_source_image(asset_id, category)

    if not glb_only and not optimize_only and not image_path:
        update_asset(asset_id, {"status": "image_generating"})

        for attempt in range(MAX_IMAGE_ATTEMPTS):
            image_path = generate_sd_image(asset, attempt)
            if image_path:
                break

        if not image_path:
            log_failed(asset_id, "All image generation attempts failed", "image")
            return False

        update_asset(asset_id, {"status": "image_complete", "image": image_path})
        log_generated(asset_id, "image", {"path": image_path})

    if not image_path:
        print(f"    No source image found — skipping")
        return False

    if images_only:
        return True

    # ── Stage 2: Background Removal ──
    if not optimize_only:
        update_asset(asset_id, {"status": "bg_removing"})
        remove_background(image_path)
        update_asset(asset_id, {"status": "bg_complete"})

    # ── Stage 3: Trellis GLB ──
    raw_glb = os.path.join(GLB_RAW_DIR, f"{asset_id}.glb")

    if not optimize_only and not os.path.exists(raw_glb):
        update_asset(asset_id, {"status": "trellis_generating"})
        raw_glb = generate_trellis_glb(asset, image_path)

        if not raw_glb:
            log_failed(asset_id, "Trellis generation failed", "trellis")
            return False

        update_asset(asset_id, {"status": "glb_complete", "glb": raw_glb})
        log_generated(asset_id, "glb")

    if glb_only and not os.path.exists(raw_glb):
        print(f"    No raw GLB found — skipping optimization")
        return False

    # ── Stage 4: Optimize ──
    if os.path.exists(raw_glb):
        update_asset(asset_id, {"status": "optimizing"})
        optimized = optimize_glb(asset, raw_glb)

        if optimized:
            game_dest = os.path.join(GAME_ASSETS_DIR, f"{asset_id}.glb")
            shutil.copy2(optimized, game_dest)
            update_asset(asset_id, {
                "status": "glb_optimized",
                "glbRaw": f"AssetFactory/glb_raw/{asset_id}.glb",
                "glbOptimized": f"AssetFactory/glb_optimized/{asset_id}.glb",
                "glbGame": f"Game3DAssets/{asset_id}.glb"
            })
            log_generated(asset_id, "optimize")
            print(f"    [OK] READY -> {game_dest}")
            return True

    return False


# ═══════════════════════════════════════════════════════
# STATUS
# ═══════════════════════════════════════════════════════

def show_status():
    assets = load_catalog()
    counts = {}
    for a in assets:
        s = a.get("status", "pending")
        counts[s] = counts.get(s, 0) + 1

    # Count batches
    batches = {}
    for a in assets:
        b = a.get("batch", 0)
        batches.setdefault(b, {"total": 0, "ready": 0, "failed": 0, "pending": 0})
        batches[b]["total"] += 1
        s = a.get("status", "pending")
        if s == "ready":
            batches[b]["ready"] += 1
        elif "failed" in s:
            batches[b]["failed"] += 1
        elif s == "pending":
            batches[b]["pending"] += 1

    print("=" * 60)
    print("Castle Survivor — Asset Factory Status")
    print("=" * 60)
    print(f"  Total assets: {len(assets)}")
    for s, c in sorted(counts.items()):
        print(f"    {s}: {c}")

    print(f"\n  Batches:")
    for b in sorted(batches.keys()):
        info = batches[b]
        print(f"    Batch {b}: {info['ready']}/{info['total']} ready, {info['failed']} failed, {info['pending']} pending")

    # Disk counts
    def count_files(d, ext):
        if not os.path.exists(d):
            return 0
        count = 0
        for root, dirs, files in os.walk(d):
            count += sum(1 for f in files if f.endswith(ext))
        return count

    print(f"\n  Files on disk:")
    print(f"    Source images: {count_files(SOURCE_IMAGES_DIR, '.png')}")
    print(f"    Raw GLBs:      {count_files(GLB_RAW_DIR, '.glb')}")
    print(f"    Optimized GLBs:{count_files(GLB_OPTIMIZED_DIR, '.glb')}")
    print(f"    Thumbnails:    {count_files(THUMBNAILS_DIR, '.png')}")


# ═══════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Castle Survivor Asset Factory Pipeline")
    parser.add_argument("--status", action="store_true", help="Show pipeline status")
    parser.add_argument("--batch", type=int, default=1, help="Batch number to process (default: 1)")
    parser.add_argument("--ids", type=str, help="Comma-separated asset IDs to process")
    parser.add_argument("--images-only", action="store_true", help="Only generate SD images")
    parser.add_argument("--glb-only", action="store_true", help="Only generate GLBs from existing images")
    parser.add_argument("--optimize-only", action="store_true", help="Only optimize existing raw GLBs")
    parser.add_argument("--resume", action="store_true", help="Resume in-progress assets")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    print("\n" + "=" * 60)
    print("Castle Survivor — Asset Factory Pipeline")
    print("=" * 60)

    # Check ComfyUI
    if not args.optimize_only:
        if not check_comfyui():
            print("\nERROR: ComfyUI is not running!")
            print(f"  Expected at: {COMFYUI_URL}")
            print("  Start ComfyUI first, then re-run this script.")
            sys.exit(1)
        print("ComfyUI: CONNECTED")

    # Select assets
    catalog = load_catalog()

    if args.ids:
        ids = [x.strip() for x in args.ids.split(",")]
        assets = [a for a in catalog if a["id"] in ids]
    elif args.resume:
        in_progress_statuses = [
            "image_generating", "bg_removing", "trellis_generating", "optimizing",
            "image_complete", "bg_complete", "glb_complete"
        ]
        assets = [a for a in catalog if a.get("status") in in_progress_statuses]
    elif args.optimize_only:
        assets = [a for a in catalog if a.get("status") == "glb_complete"]
    elif args.glb_only:
        assets = [a for a in catalog
                  if a.get("status") in ("image_complete", "bg_complete")
                  or find_source_image(a["id"], a.get("category", ""))]
        assets = [a for a in assets if a.get("batch", 99) == args.batch]
    else:
        assets = [a for a in catalog
                  if a.get("batch") == args.batch and a.get("status") == "pending"]

    if not assets:
        print("\nNo assets to process.")
        show_status()
        return

    print(f"\nProcessing {len(assets)} assets (batch {args.batch})...\n")

    success = 0
    failed = 0

    for i, asset in enumerate(assets, 1):
        print(f"\n[{i}/{len(assets)}] {asset['id']} — {asset['name']}")
        print(f"  Category: {asset['category']}, Template: {asset.get('promptTemplate', 'PROP')}")

        try:
            ok = process_asset(
                asset,
                images_only=args.images_only,
                glb_only=args.glb_only,
                optimize_only=args.optimize_only
            )
            if ok:
                success += 1
            else:
                failed += 1
        except Exception as e:
            print(f"    ERROR: {e}")
            log_failed(asset["id"], str(e), "pipeline")
            failed += 1

    print("\n" + "=" * 60)
    print(f"DONE! Processed {len(assets)} assets.")
    print(f"  Success: {success}")
    print(f"  Failed:  {failed}")
    print("=" * 60)
    show_status()


if __name__ == "__main__":
    main()
