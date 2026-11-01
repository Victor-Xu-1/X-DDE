"""Bound only the disposable Actions runner's existing browser dependency downloads."""

import os
import re
from pathlib import Path

AZURE_MIRROR = re.compile(r"https?://azure\.archive\.ubuntu\.com/ubuntu(?=[/\s]|$)")
NETWORK = (
    'Acquire::Retries "1";\n'
    'Acquire::http::Timeout "30";\n'
    'Acquire::https::Timeout "30";\n'
    'APT::Update::Error-Mode "any";\n'
)


def configure(root):
    policy = root / "apt.conf.d/99-xdde-browser-ci"
    if policy.is_symlink() or (policy.exists() and policy.read_text() != NETWORK):
        raise ValueError("Preserve unknown browser CI network configuration.")
    sources = [root / "sources.list", root / "apt-mirrors.txt"]
    sources += sorted((root / "sources.list.d").glob("*.list"))
    sources += sorted((root / "sources.list.d").glob("*.sources"))
    updates = []
    for path in sources:
        if path.is_symlink():
            raise ValueError("Do not rewrite linked repository configuration.")
        if not path.is_file():
            continue
        old = path.read_text()
        new = AZURE_MIRROR.sub("https://archive.ubuntu.com/ubuntu", old)
        if new != old:
            updates.append((path, new))
    for path, new in updates:
        path.write_text(new)
    policy.parent.mkdir(exist_ok=True)
    policy.write_text(NETWORK)
    return len(updates)


def main():
    if (
        os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("RUNNER_OS") != "Linux"
        or not hasattr(os, "geteuid")
        or os.geteuid() != 0
    ):
        raise RuntimeError("Browser network preparation is limited to the isolated Actions runner.")
    print("Official Ubuntu mirrors normalized:", configure(Path("/etc/apt")))


if __name__ == "__main__":
    main()
