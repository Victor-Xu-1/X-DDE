"""Write independent native locks from fixed registry metadata, without downloading artifacts."""

import json
import re
from urllib.request import urlopen


def write_lock(root, check=False):
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
    if check:
        if target.read_text() != body:
            raise SystemExit("Native lock differs from its fixed release metadata.")
    else:
        target.write_text(body, encoding="utf-8", newline="\n")
