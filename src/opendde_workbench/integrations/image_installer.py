"""Optional, hash-locked installer profiles for native dependency transport."""

import shutil


def prepare_installer(identifier, spec, destination, recipes, *, timeout, retries):
    profile = spec.get("pip_installer")
    if profile is None:
        return [], ""
    if not isinstance(profile, dict) or set(profile) != {"resume_retries"}:
        raise ValueError("The native pip installer profile is not supported.")
    budget = profile["resume_retries"]
    if type(budget) is not int or not 1 <= budget <= 10:
        raise ValueError("Native download resume attempts must be an integer from 1 to 10.")
    locked = recipes / (identifier + "-installer.txt")
    if not locked.is_file() or locked.is_symlink():
        raise ValueError("The reviewed native pip installer lock is missing or unsafe.")
    shutil.copyfile(locked, destination / "installer-requirements.txt")
    lines = [
        "COPY installer-requirements.txt /tmp/installer-requirements.txt",
        "RUN python -m pip install --no-cache-dir --no-deps --only-binary=:all: "
        "--require-hashes -r /tmp/installer-requirements.txt "
        f"--timeout {timeout} --retries {retries} "
        '--index-url "$XDDE_PYPI_INDEX" && python -m pip check',
    ]
    return lines, f"--resume-retries {budget} "
