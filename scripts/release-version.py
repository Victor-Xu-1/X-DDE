"""Prepare and verify one publication from pyproject.toml, the version authority."""

import argparse
import json
import re
import subprocess
import tomllib
from pathlib import Path

from opendde_workbench.versioning import ReleaseNumber


def read_version(root):
    return tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"]


def check(root, base=None):
    current = ReleaseNumber.parse(read_version(root))
    value = str(current)
    package = json.loads((root / "frontend/package.json").read_text())
    lock = json.loads((root / "frontend/package-lock.json").read_text())
    versions = [package["version"], lock["version"], lock["packages"][""]["version"]]
    installed = next(
        item["version"]
        for item in tomllib.loads((root / "uv.lock").read_text())["package"]
        if item["name"] == "x-dde"
    )
    versions.append(installed)
    windows = re.search(r"\$Release = 'v([^']+)'", (root / "install.ps1").read_text())
    linux = re.search(r'release="\$\{1:-v([^}]+)\}"', (root / "install.sh").read_text())
    if not windows or not linux or any(item != value for item in [*versions, windows[1], linux[1]]):
        raise ValueError("Version mirrors or installer defaults differ from pyproject.toml.")
    if base:
        if not re.fullmatch(r"[0-9a-f]{40}", base):
            raise ValueError("Base must be an exact commit SHA.")
        text = subprocess.check_output(
            ["git", "show", base + ":pyproject.toml"], cwd=root, text=True
        )
        previous = ReleaseNumber.parse(tomllib.loads(text)["project"]["version"], legacy=True)
        if current != previous.next():
            raise ValueError(f"Each publication must advance {previous} to {previous.next()}.")
    return current


def bump(root):
    old = read_version(root)
    target = str(ReleaseNumber.parse(old, legacy=True).next())
    paths = [
        root / name
        for name in (
            "pyproject.toml",
            "frontend/package.json",
            "frontend/package-lock.json",
            "install.sh",
            "install.ps1",
            "uv.lock",
        )
    ]
    saved = {path: path.read_bytes() for path in paths}
    try:
        path = root / "pyproject.toml"
        body, count = re.subn(
            r'(?m)^version = "[^"]+"$', f'version = "{target}"', path.read_text(), count=1
        )
        if count != 1:
            raise ValueError("Missing project version authority.")
        path.write_text(body)
        for name in ("frontend/package.json", "frontend/package-lock.json"):
            path = root / name
            value = json.loads(path.read_text())
            value["version"] = target
            if "packages" in value:
                value["packages"][""]["version"] = target
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        for name in ("install.sh", "install.ps1"):
            path = root / name
            path.write_text(path.read_text().replace("v" + old, "v" + target))
        subprocess.run(["uv", "lock", "--offline"], cwd=root, check=True)
        check(root)
    except Exception:
        for path, body in saved.items():
            path.write_bytes(body)
        raise
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["next", "bump", "check"])
    parser.add_argument(
        "--base", help="Previous published commit; verify an exact one-step increment."
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.action == "bump":
        value = bump(root)
    elif args.action == "next":
        value = ReleaseNumber.parse(read_version(root), legacy=True).next()
    else:
        value = check(root, args.base)
    print(value)


if __name__ == "__main__":
    main()
