"""Compare source binding to exact pinned native helpers without importing a model."""

import ast
import hashlib
import json
import os
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any
from urllib.request import urlopen

import pytest

from opendde_workbench.harness_chains import fold_chains

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_NATIVE_CDR_GATE") != "1", reason="Pinned native-contract CI only."
)
URL = (
    "https://raw.githubusercontent.com/aurekaresearch/OpenDDE-Harness/v0.0.4/"
    "opendde_harness/plugin/protein_design/servers/harness.py"
)
BLOB = "38b14cfab3eaaadd74f59f2133370de711892e49"


def test_fold_source_chain_merges_match_reviewed_native_contract():
    with urlopen(URL, timeout=30) as response:
        source = response.read(128 * 1024)
    assert hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest() == BLOB
    original = next(
        n
        for n in ast.parse(source).body
        if isinstance(n, ast.ClassDef) and n.name == "PythonProteinDesignHarness"
    )
    methods = [
        n
        for n in original.body
        if isinstance(n, ast.FunctionDef) and n.name in {"_candidate_chains", "_chain_sequence"}
    ]
    assert len(methods) == 2
    isolated = ast.ClassDef(
        name=original.name, bases=[], keywords=[], body=methods, decorator_list=[], type_params=[]
    )
    module = ast.fix_missing_locations(ast.Module(body=[isolated], type_ignores=[]))
    namespace = {"Mapping": Mapping, "Any": Any}
    exec(compile(module, "reviewed_native_chain_helpers", "exec"), namespace)
    native = namespace[original.name]
    cases = [
        {
            "candidates": [{"chains": {"A": "EVQLVESGG", "B": "DIQMTQSPSS"}}],
            "options": {
                "target_chains": {
                    "C": {"sequence": "MKVLQEPTCVSDYMSISTCEWK", "unpairedMsaPath": "asset:target"}
                }
            },
        },
        {
            "candidates": [
                {"chains": {"A": {"sequence": "EVQLVESGG", "pairedMsaPath": "asset:direct"}}}
            ],
            "options": {
                "binder_chain_options": {
                    "A": {"sequence": "ignored", "unpairedMsaPath": "asset:effective"}
                }
            },
        },
        {"candidates": [{"metadata": {"chains": {"A": "EVQLVESGG"}}}]},
        {"candidates": [{"sequence": "EVQLVESGG"}], "options": {"binder_chain_ids": ["H"]}},
        {"candidates": [{"sequence": "EVQLVESGG"}]},
    ]
    before = deepcopy(cases)
    for case in cases:
        assert list(fold_chains(case)) == [
            native._candidate_chains(candidate, case.get("options", {}))
            for candidate in case["candidates"]
        ]
    assert cases == before
    evidence = Path("outputs/antibody-cdr")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "native-fold-source-contract.json").write_text(
        json.dumps(
            {
                "source_blob": BLOB,
                "source_url": URL,
                "matched_native_cases": len(cases),
                "isolated_pure_helpers_only": True,
                "models_loaded_or_run": False,
                "original_requests_unchanged": True,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
