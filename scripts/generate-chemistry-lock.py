"""Regenerate the independent chemistry lock from exact PyPI release metadata only."""

import argparse
import json
import re
from pathlib import Path
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / "src/opendde_workbench/chemistry"
    lines = [
        "# Generated from native-requirements.in using immutable PyPI release metadata.",
        "# No package artifacts are downloaded by the generator.",
    ]
    for line in (root / "native-requirements.in").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        name, version = line.split("==")
        if not re.fullmatch(r"[a-z0-9-]+", name) or not re.fullmatch(r"[0-9.]+", version):
            raise ValueError("The runtime lock requires exact trusted package/version pins.")
        with urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=20) as response:
            data = json.load(response)
        hashes = sorted({row["digests"]["sha256"] for row in data["urls"]})
        if not hashes or any(not re.fullmatch(r"[a-f0-9]{64}", h) for h in hashes):
            raise ValueError("Package release metadata has invalid digests.")
        continuation = " " + chr(92) + chr(10)
        lines.append(
            line + continuation + continuation.join("    --hash=sha256:" + h for h in hashes)
        )
    body = "\n".join(lines) + "\n"
    target = root / "native-requirements.txt"
    if args.check:
        if target.read_text() != body:
            raise SystemExit("Chemistry lock differs from its fixed release metadata.")
    else:
        target.write_text(body, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
