"""One explicit adapter source inventory for native tests and managed execution."""

from pathlib import Path

ROOT = Path(__file__).parent
FILES = (
    "runner.py",
    "options.py",
    "native_context.py",
    "native_execution.py",
    "caver_profiles.py",
    "pdb_frame.py",
    "manifest.py",
)
RECEPTORS = ROOT.parent / "receptors"
SHARED_SOURCES = {
    "native_io.py": RECEPTORS / "native_io.py",
    "structural_profile.py": RECEPTORS / "profiles.py",
    "native_preparation.py": RECEPTORS / "native_preparation.py",
    "preparation_options.py": RECEPTORS / "preparation_options.py",
}
