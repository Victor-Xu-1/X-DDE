"""Real pinned Boltz parsers and exact snapshot transport; no weights or inference."""

import hashlib
import importlib
import json
from importlib.metadata import version
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]


@pytest.mark.parametrize(
    "suffix,text,taxonomy",
    [
        (".a3m", "# metadata\n>query\nAC\nDE\n>homolog\nACa-E\n", [-1, -1]),
        (".csv", "sequence,key\nACDE,0\nACa-E,42\n", [0, 42]),
    ],
)
def test_exact_native_transport_into_official_boltz_221_parser(
    tmp_path, monkeypatch, suffix, text, taxonomy
):
    assert version("boltz") == "2.2.1"
    monkeypatch.syspath_prepend(str(ROOT / "src/opendde_workbench/integrations"))
    monkeypatch.syspath_prepend(str(ROOT / "src/opendde_workbench"))
    monkeypatch.setitem(
        __import__("sys").modules,
        "native_alignment_files",
        importlib.import_module("alignment_files"),
    )
    native_io = importlib.import_module("native_io")
    native = importlib.import_module("native_boltz_inputs")
    source = tmp_path / "input/assets" / ("exact" + suffix)
    source.parent.mkdir(parents=True)
    original = text.encode()
    source.write_bytes(original)
    reference = {
        "asset_id": "exact",
        "sha256": hashlib.sha256(original).hexdigest(),
        "record": 0,
        "conformer": 0,
    }
    (tmp_path / "input/bindings.json").write_text(
        json.dumps({"exact": "/job/assets/" + source.name})
    )
    monkeypatch.setattr(
        native_io,
        "Path",
        lambda value: (
            tmp_path / value.lstrip("/") if str(value).startswith("/input/") else Path(value)
        ),
    )
    request = {"inputs": [{"role": "msa", "source": reference}]}
    component = {"id": "A", "kind": "protein", "value": "ACDE", "msa": reference}
    output = tmp_path / "output/msas"
    target = Path(native.protein_msa(request, component, output))
    assert source.read_bytes() == original and target != source
    assert native.protein_msa(request, {**component, "id": "B"}, output) == str(target)
    if suffix == ".a3m":
        from boltz.data.parse.a3m import parse_a3m

        msa = parse_a3m(target, taxonomy=None)
    else:
        from boltz.data.parse.csv import parse_csv

        msa = parse_csv(target)
    assert msa.sequences["taxonomy"].tolist() == taxonomy
    assert (msa.sequences["res_end"] - msa.sequences["res_start"]).tolist() == [4, 4]
    assert msa.deletions["deletion"].tolist() == [1]
    assert msa.deletions["res_idx"].tolist() == [2]
    source.write_bytes(original.replace(b"AC", b"AD"))
    with pytest.raises(ValueError, match="bytes changed"):
        native.protein_msa(request, component, output)
    assert native.protein_msa({"inputs": []}, {"id": "C", "value": "MKT"}, output) == "empty"
