"""Compare source binding to exact pinned native helpers without importing a model."""

import ast
import hashlib
import json
import os
from collections.abc import Mapping
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal
from urllib.request import urlopen

import pytest
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from opendde_workbench.fold_review import FoldEnvelope
from opendde_workbench.harness_chains import fold_chains

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_NATIVE_CDR_GATE") != "1", reason="Pinned native-contract CI only."
)
URL = (
    "https://raw.githubusercontent.com/aurekaresearch/OpenDDE-Harness/v0.0.4/"
    "opendde_harness/plugin/protein_design/servers/harness.py"
)
BLOB = "38b14cfab3eaaadd74f59f2133370de711892e49"
CONTRACT_URL = (
    "https://raw.githubusercontent.com/aurekaresearch/OpenDDE-Harness/v0.0.4/"
    "opendde_harness/plugin/protein_design/core/contracts.py"
)
CONTRACT_BLOB = "9890c4b1fb24dd615be5691a3ebea830c8aca309"


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


def test_review_envelope_matches_the_pinned_browser_safe_fold_contract():
    with urlopen(CONTRACT_URL, timeout=30) as response:
        source = response.read(128 * 1024)
    assert (
        hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
        == CONTRACT_BLOB
    )
    classes = [
        node
        for node in ast.parse(source).body
        if isinstance(node, ast.ClassDef)
        and node.name in {"ContractModel", "Placement", "FoldRequest"}
    ]
    assert len(classes) == 3
    native = dict(
        BaseModel=BaseModel,
        ConfigDict=ConfigDict,
        Field=Field,
        model_validator=model_validator,
        Mapping=Mapping,
        Any=Any,
        Literal=Literal,
    )
    exec(compile(ast.Module(body=classes, type_ignores=[]), "pinned_fold_request", "exec"), native)
    payload = {"candidates": [{"candidate_id": "control", "chains": {"A": "ACDE"}}]}
    for settings in (
        {},
        {"backend": "opendde"},
        {"placement": {"fold": [0, 2]}},
        {"placement": {"fold": None, "cp_degree": 3}},
        {"backend": "boltz"},
        {"unknown": True},
        {"placement": {"fold": []}},
        {"placement": {"fold": [0, 0]}},
        {"placement": {"fold": [1], "cp_degree": 2}},
        {"placement": {"esm": -1}},
        {"options": None},
        {"candidates": []},
    ):
        candidate = {**payload, **settings}
        try:
            expected = native["FoldRequest"].model_validate(candidate)
        except ValidationError:
            with pytest.raises(ValidationError):
                FoldEnvelope.model_validate(candidate)
        else:
            assert FoldEnvelope.model_validate(candidate).model_dump() == expected.model_dump(
                exclude={"task_id"}
            )
