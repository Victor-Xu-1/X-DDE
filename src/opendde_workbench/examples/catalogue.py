"""One checked-in source manifest, never private account data or synthetic scores."""

import json
from pathlib import Path
from urllib.parse import urlsplit

from ..capabilities.definitions import CAPABILITIES
from .contracts import CaseStudy, ModuleExample, SourceFile

MANIFEST = json.loads(Path(__file__).with_name("catalogue.json").read_text())
FILES = {key: SourceFile.model_validate(value) for key, value in MANIFEST["files"].items()}
CASES = {case.id: case for case in map(CaseStudy.model_validate, MANIFEST["cases"])}
MODULES = {key: ModuleExample.model_validate(value) for key, value in MANIFEST["modules"].items()}
POLYMERS = MANIFEST["polymers"]


def validate_catalogue():
    expected = {key for key, capability in CAPABILITIES.items() if capability.frontend_form}
    if set(MODULES) != expected:
        raise ValueError("Every visible capability requires an explicitly reviewed example.")
    for key, module in MODULES.items():
        if module.capability_id != key or module.case_id not in CASES:
            raise ValueError("Example capability/case identity is inconsistent.")
        if any(name not in FILES for name in CASES[module.case_id].files):
            raise ValueError("An example refers to an unknown public file.")
    for file in FILES.values():
        url = urlsplit(file.url)
        if (
            url.scheme != "https"
            or url.hostname not in {"files.rcsb.org", "models.rcsb.org", "www.ebi.ac.uk"}
            or url.username
            or url.password
            or Path(file.name).name != file.name
            or any(character in file.name for character in ("/", "\\", "\x00"))
        ):
            raise ValueError("Public example sources must use reviewed archive addresses.")


validate_catalogue()
