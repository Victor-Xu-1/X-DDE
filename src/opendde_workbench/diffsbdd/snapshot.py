"""Freeze the platform native entry point without adding an execution authority."""

import hashlib
from pathlib import Path

FILES = {
    **{
        name: Path("diffsbdd") / name
        for name in (
            "runner.py",
            "chemistry.py",
            "fixed_core.py",
            "stereo.py",
            "verification.py",
        )
    },
    "molfile_stereo.py": Path("chemistry/molfile_stereo.py"),
}


def capture(directory: Path):
    source = Path(__file__).parent.parent
    target = directory / "adapter"
    target.mkdir(exist_ok=False)
    digests = {}
    for name, relative in FILES.items():
        file = source / relative
        if file.is_symlink() or not file.is_file() or file.stat().st_size > 2 * 1024**2:
            raise ValueError("DiffSBDD adapter must contain bounded regular source files.")
        content = file.read_bytes()
        (target / name).write_bytes(content)
        (target / name).chmod(0o444)
        digests[name] = hashlib.sha256(content).hexdigest()
    return target / "runner.py", digests
