"""One checked-in source manifest, never private account data or synthetic scores."""

from pathlib import Path
from urllib.parse import urlsplit

from ..capabilities.definitions import CAPABILITIES
from .contracts import CaseStudy, ModuleExample, SourceFile
from .manifest import MANIFEST

FILES = {key: SourceFile.model_validate(value) for key, value in MANIFEST["files"].items()}
CASES = {case.id: case for case in map(CaseStudy.model_validate, MANIFEST["cases"])}
MODULES = {key: ModuleExample.model_validate(value) for key, value in MANIFEST["modules"].items()}
POLYMERS = MANIFEST["polymers"]


def validate_catalogue():
    expected = {key for key, capability in CAPABILITIES.items() if capability.frontend_form}
    internal = {key for key, module in MODULES.items() if module.parent_capability}
    if set(MODULES) != expected | internal:
        raise ValueError("Every visible capability requires an explicitly reviewed example.")
    for key, module in MODULES.items():
        if module.capability_id != key or module.case_id not in CASES:
            raise ValueError("Example capability/case identity is inconsistent.")
        if module.parent_capability:
            parent = MODULES.get(module.parent_capability)
            capability = CAPABILITIES.get(key)
            if (
                not parent
                or parent.parent_capability
                or parent.case_id != module.case_id
                or module.parent_capability not in expected
                or key in expected
                or not capability
                or not capability.operations
                or capability.frontend_form
                or not module.pinned_run_required
            ):
                raise ValueError("An internal analysis requires its visible reviewed parent case.")
        if any(name not in FILES for name in CASES[module.case_id].files):
            raise ValueError("An example refers to an unknown public file.")
    for file in FILES.values():
        url = urlsplit(file.url)
        if (
            url.scheme != "https"
            or not (
                url.hostname in {"files.rcsb.org", "models.rcsb.org", "www.ebi.ac.uk"}
                or url.hostname == "github.com"
                and url.path.startswith(
                    (
                        "/Victor-Xu-1/X-DDE/releases/download/examples-science-v1/",
                        "/Victor-Xu-1/X-DDE/releases/download/examples-datasets-v1/",
                    )
                )
            )
            or url.username
            or url.password
            or Path(file.name).name != file.name
            or any(character in file.name for character in ("/", "\\", "\x00"))
        ):
            raise ValueError("Public example sources must use reviewed archive addresses.")


validate_catalogue()
