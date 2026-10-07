"""Source and output notices describe only the archived scientific case scope."""

import json

from .catalogue import CASES, FILES, MODULES


def bundle_notices(selected, rows):
    cases = {MODULES[key].case_id for key in selected}
    files = {key for case in cases for key in CASES[case].files}
    operations = {json.loads(row["request"]).get("operation", "predict") for row in rows["jobs"]}
    licenses = sorted({FILES[key].license for key in files})
    if any(operation.startswith("drugclip_") for operation in operations):
        licenses.append("Official DrugCLIP computed outputs: CC-BY-NC-4.0; noncommercial research")
    methods = [
        "Retained native computational measurements and predictions; not experimental affinity."
    ]
    if "regions" in selected:
        methods.append("MZ1 regions are geometric annotations.")
    if "campaign" in selected:
        methods.append("Campaign is native configuration validation only.")
    if "surface_exposure" in operations:
        methods.append("SASA is geometric accessibility, not energy, affinity or linker passage.")
    return {
        "sources": sorted({url for case in cases for url in CASES[case].sources}),
        "licenses": licenses,
        "methods": " ".join(methods),
    }
