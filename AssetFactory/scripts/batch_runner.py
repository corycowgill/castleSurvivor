"""
Resilient batch runner — processes assets one at a time.
Skips already-completed and failed assets on restart.
Usage: python batch_runner.py --batch 3
"""
import os, sys, json, subprocess, time

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FACTORY_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(FACTORY_DIR)
CATALOG_PATH = os.path.join(FACTORY_DIR, "catalog", "assets.json")
SKIP_LOG = os.path.join(FACTORY_DIR, "catalog", "skipped.json")

def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def load_skipped():
    if os.path.exists(SKIP_LOG):
        with open(SKIP_LOG, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()

def save_skipped(skipped):
    with open(SKIP_LOG, "w", encoding="utf-8") as f:
        json.dump(sorted(skipped), f, indent=2)

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, required=True)
    parser.add_argument("--max-fails", type=int, default=2, help="Skip after N consecutive fails")
    args = parser.parse_args()

    skipped = load_skipped()
    catalog = load_catalog()
    todo = [a for a in catalog
            if a.get("batch") == args.batch
            and a.get("status") not in ("glb_optimized",)
            and a["id"] not in skipped]

    print(f"=== Batch {args.batch}: {len(todo)} assets to process ===")
    if skipped:
        print(f"  (skipping {len(skipped)} previously failed)")

    done = 0
    failed = 0

    for i, asset in enumerate(todo, 1):
        aid = asset["id"]
        print(f"\n[{i}/{len(todo)}] {aid} -- {asset['name']}")

        try:
            result = subprocess.run(
                [sys.executable, os.path.join(SCRIPT_DIR, "run_pipeline.py"), "--ids", aid],
                timeout=1200,
                cwd=PROJECT_DIR,
                capture_output=False
            )
            if result.returncode == 0:
                # Verify GLB actually exists
                glb = os.path.join(PROJECT_DIR, "Game3DAssets", f"{aid}.glb")
                if os.path.exists(glb):
                    done += 1
                    print(f"  >> OK ({done} done, {failed} failed)")
                    continue

            print(f"  >> FAILED (exit {result.returncode}), skipping")
            skipped.add(aid)
            save_skipped(skipped)
            failed += 1

        except subprocess.TimeoutExpired:
            print(f"  >> TIMEOUT after 20min, skipping")
            skipped.add(aid)
            save_skipped(skipped)
            failed += 1
        except Exception as e:
            print(f"  >> ERROR: {e}, skipping")
            skipped.add(aid)
            save_skipped(skipped)
            failed += 1

    print(f"\n=== Batch {args.batch} complete ===")
    print(f"  Done: {done}")
    print(f"  Failed/Skipped: {failed}")
    print(f"  Previously skipped: {len(skipped) - failed}")

if __name__ == "__main__":
    main()
