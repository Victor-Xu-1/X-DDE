"""Extend the existing DEL cohort with complete observed counts and exact source variants."""

import json
from pathlib import Path
from types import MappingProxyType

from ..catalogue import CASES as ARCHIVE_CASES
from ..catalogue import FILES as ARCHIVE_FILES
from ..catalogue import MODULES as ARCHIVE_MODULES
from ..contracts import CaseStudy, ModuleExample, SourceFile

ROOT = Path(__file__).parent
OVERRIDES = json.loads((ROOT / "current-inputs.json").read_text(encoding="utf-8"))
ORIGINAL = ARCHIVE_CASES["del-unc006-brd4"]
CASE = CaseStudy.model_validate({**ORIGINAL.model_dump(), **OVERRIDES["case"]})
FILES = {
    **{key: ARCHIVE_FILES[key] for key in ORIGINAL.files},
    **{key: SourceFile.model_validate(value) for key, value in OVERRIDES["files"].items()},
}
MODULES = MappingProxyType(
    {
        key: ModuleExample(
            case_id=CASE.id,
            capability_id=key,
            revision=value.revision + 3,
            pinned_run_required=True,
        )
        for key, value in ARCHIVE_MODULES.items()
        if key.startswith("del.")
    }
)
MANIFEST = {
    "case": CASE.model_dump(mode="json"),
    "files": {key: value.model_dump(mode="json") for key, value in FILES.items()},
    "modules": {key: value.model_dump(mode="json") for key, value in MODULES.items()},
    "source_revision": OVERRIDES["source_revision"],
}


def input_keys(capability):
    return {
        "del.library": ("del_definition",),
        "del.decode": ("del_reads",),
        "del.analyze": ("del_counts",),
        "del.followup": ("del_followup",),
    }.get(capability, ())
