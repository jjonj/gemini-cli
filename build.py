import argparse
import subprocess
import sys
from pathlib import Path


def run_command(command, cwd=None):
    cwd_label = f" in {cwd}" if cwd else ""
    print(f"Running: {' '.join(command)}{cwd_label}")
    if sys.platform == "win32":
        result = subprocess.run(" ".join(command), text=True, shell=True, cwd=cwd)
    else:
        result = subprocess.run(command, text=True, cwd=cwd)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Build Gemini CLI for local launcher usage. "
            "By default this compiles and bundles without reinstalling deps."
        )
    )
    parser.add_argument(
        "--install",
        action="store_true",
        help="Run npm install before build (slower, can fail on lockfile-dependent hooks).",
    )
    parser.add_argument(
        "--no-omni",
        action="store_true",
        help="Skip building Omni components (Hub and Android).",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    package_json = root / "package.json"
    if not package_json.exists():
        print(f"Error: package.json not found at {package_json}")
        sys.exit(1)

    print("Building omni-gemini-cli...")

    steps = []
    if args.install:
        steps.append(("npm install", ["npm", "install"], None))
    
    steps.extend(
        [
            ("npm run build", ["npm", "run", "build"], None),
            ("npm run bundle", ["npm", "run", "bundle"], None),
        ]
    )

    total_steps = len(steps)
    for idx, (label, command, cwd) in enumerate(steps, start=1):
        print(f"Step {idx}/{total_steps}: {label}")
        if not run_command(command, cwd=cwd):
            print(f"Failed: {label}")
            sys.exit(1)

    bundle_path = root / "bundle" / "gemini.js"
    if not bundle_path.exists():
        print(f"Build finished but bundle is missing: {bundle_path}")
        sys.exit(1)

    print(f"Build completed successfully. Bundle updated: {bundle_path}")


if __name__ == "__main__":
    main()
