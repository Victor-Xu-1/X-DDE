"""Read the live physical Windows filesystem after the backing volume is identified."""

import re
from pathlib import Path


def _unescape(value):
    return re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), value)


def host_mount(location, mountinfo=Path("/proc/self/mountinfo")):
    """Resolve an actual root DrvFS/Plan9 mount; never infer a /mnt drive path."""
    if not re.fullmatch(r"[A-Za-z]:", location):
        return None
    try:
        text = mountinfo.read_text(encoding="utf-8")
    except OSError:
        return None
    matches = set()
    for line in text.splitlines():
        left, separator, right = line.partition(" - ")
        fields, filesystem = left.split(), right.split()
        if not separator or len(fields) < 6 or len(filesystem) < 3:
            continue
        kind, source = filesystem[:2]
        if kind not in {"9p", "drvfs"} or _unescape(fields[3]) != "/":
            continue
        if _unescape(source).rstrip("\\").upper() != location.upper():
            continue
        if kind == "9p" and "aname=drvfs;" not in filesystem[2]:
            continue
        target = Path(_unescape(fields[4]))
        if target.is_absolute() and ".." not in target.parts:
            matches.add(target)
    return next(iter(matches)) if len(matches) == 1 else None
