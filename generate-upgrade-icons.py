"""
Generate upgrade item icons for Castle Survivor using local ComfyUI + JuggernautXL.
Each icon is a 256x256 medieval fantasy game icon with transparent-style dark background.
"""

import json
import urllib.request
import urllib.error
import time
import os
import sys

COMFYUI_URL = "http://localhost:8188"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images", "upgrades")

UPGRADES = [
    {
        "id": "damage",
        "title": "Whetstone of the Forge",
        "prompt": "medieval fantasy game icon, a glowing magical whetstone sharpening stone on an anvil, sparks flying, orange glow, forge fire background, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "speed",
        "title": "Boots of the Courier",
        "prompt": "medieval fantasy game icon, enchanted leather boots with wind swirls and speed lines, glowing blue magical aura, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "attackSpeed",
        "title": "Berserker's Fury",
        "prompt": "medieval fantasy game icon, a berserker's spiked gauntlet clenched fist with red rage aura and lightning crackling, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "maxHp",
        "title": "Champion's Resolve",
        "prompt": "medieval fantasy game icon, a golden champion's shield with a heart emblem glowing with green vitality energy, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "range",
        "title": "Reach of the Halberd",
        "prompt": "medieval fantasy game icon, a long ornate halberd polearm weapon with extended magical reach aura, purple energy trail, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "armor",
        "title": "Blessed Chainmail",
        "prompt": "medieval fantasy game icon, a piece of blessed silver chainmail armor with holy golden light radiating from it, divine protection aura, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "regen",
        "title": "Healer's Blessing",
        "prompt": "medieval fantasy game icon, a glowing green healing crystal with swirling nature vines and restoration magic, soft green light, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "heal",
        "title": "Apothecary's Draught",
        "prompt": "medieval fantasy game icon, a glass potion bottle with glowing red healing liquid inside, bubbling elixir, cork stopper, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "crit",
        "title": "Assassin's Eye",
        "prompt": "medieval fantasy game icon, a sinister glowing eye amulet with a dagger crosshair pupil, purple and red shadows, assassin theme, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
    {
        "id": "critDmg",
        "title": "Executioner's Might",
        "prompt": "medieval fantasy game icon, a massive executioner's axe dripping with crimson energy, skull motif on blade, dark power aura, RPG item icon, dark vignette border, stylized game art, detailed illustration"
    },
]

NEGATIVE_PROMPT = "text, words, letters, watermark, signature, blurry, low quality, deformed, ugly, photo, realistic, 3d render, human, person, face, fingers, hands"

def build_workflow(prompt_text, negative_text, seed):
    """Build a ComfyUI API workflow for JuggernautXL."""
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 30,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "juggernautXL_v9.safetensors"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 512,
                "height": 512,
                "batch_size": 1
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt_text,
                "clip": ["4", 1]
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_text,
                "clip": ["4", 1]
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "upgrade_icon",
                "images": ["8", 0]
            }
        }
    }


def queue_prompt(workflow):
    """Send a prompt to ComfyUI and return the prompt_id."""
    payload = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result["prompt_id"]


def wait_for_completion(prompt_id, timeout=120):
    """Poll ComfyUI history until the prompt completes."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                return history[prompt_id]
        except urllib.error.URLError:
            pass
        time.sleep(2)
    raise TimeoutError(f"Prompt {prompt_id} did not complete within {timeout}s")


def download_image(filename, subfolder, dest_path):
    """Download a generated image from ComfyUI."""
    url = f"{COMFYUI_URL}/view?filename={filename}&subfolder={subfolder}&type=output"
    urllib.request.urlretrieve(url, dest_path)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating {len(UPGRADES)} upgrade icons...")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Model: juggernautXL_v9.safetensors")
    print()

    for i, upg in enumerate(UPGRADES):
        print(f"[{i+1}/{len(UPGRADES)}] Generating: {upg['title']} ({upg['id']})...")

        seed = hash(upg['id']) % (2**32)
        workflow = build_workflow(upg['prompt'], NEGATIVE_PROMPT, seed)

        try:
            prompt_id = queue_prompt(workflow)
            print(f"  Queued (prompt_id: {prompt_id}), waiting...")

            result = wait_for_completion(prompt_id, timeout=180)

            # Find the output image
            outputs = result.get("outputs", {})
            for node_id, node_out in outputs.items():
                if "images" in node_out:
                    for img in node_out["images"]:
                        src_filename = img["filename"]
                        subfolder = img.get("subfolder", "")
                        dest_path = os.path.join(OUTPUT_DIR, f"{upg['id']}.png")
                        download_image(src_filename, subfolder, dest_path)
                        print(f"  Saved: {dest_path}")
                        break
                    break

        except Exception as e:
            print(f"  ERROR: {e}")
            continue

    print()
    print("Done! All icons saved to images/upgrades/")


if __name__ == "__main__":
    main()
