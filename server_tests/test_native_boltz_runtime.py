"""Official CLI parsing and native PyTorch operators; no checkpoints or prediction."""

import importlib
import importlib.util
import sys
from importlib.metadata import version
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]


def test_managed_command_selects_the_available_native_torch_operators(tmp_path, monkeypatch):
    from boltz.main import predict

    assert version("boltz") == "2.2.1"
    assert importlib.util.find_spec("cuequivariance_torch") is None
    monkeypatch.syspath_prepend(str(ROOT / "src/opendde_workbench/integrations"))
    monkeypatch.syspath_prepend(str(ROOT / "src/opendde_workbench"))
    monkeypatch.setitem(
        sys.modules, "native_alignment_files", importlib.import_module("alignment_files")
    )
    native = importlib.import_module("native_boltz")
    directory = tmp_path / "native"
    monkeypatch.setattr(
        native, "Path", lambda value: directory if str(value) == "/output/native" else Path(value)
    )
    captured = []

    class BeforeInference(Exception):
        pass

    def capture(arguments):
        captured.extend(str(value) for value in arguments)
        raise BeforeInference

    monkeypatch.setattr(native, "execute", capture)
    request = {
        "inputs": [],
        "payload": {
            "components": [{"id": "A", "kind": "protein", "value": "ACDE", "msa_mode": "single"}],
            "samples": 1,
            "recycling_steps": 3,
            "sampling_steps": 200,
            "affinity": False,
        },
        "options": {"seed": 101},
    }
    with pytest.raises(BeforeInference):
        native.run(request)
    assert captured[:2] == ["boltz", "predict"]
    with predict.make_context("predict", captured[2:]) as context:
        assert context.params["no_kernels"] is True
        assert context.params["model"] == "boltz2"
        assert context.params["use_msa_server"] is False
        assert context.params["sampling_steps"] == 200
        assert context.params["recycling_steps"] == 3
        assert context.params["seed"] == 101


@pytest.mark.parametrize(
    "name", ["TriangleMultiplicationOutgoing", "TriangleMultiplicationIncoming"]
)
def test_exact_provider_triangle_operator_runs_without_optional_accelerators(name):
    import torch
    from boltz.model.layers import triangular_mult

    assert importlib.util.find_spec("cuequivariance_torch") is None
    torch.set_num_threads(1)
    torch.manual_seed(101)
    operation = getattr(triangular_mult, name)(dim=8).eval()
    torch.nn.init.normal_(operation.p_out.weight, std=0.1)
    values = torch.randn(1, 4, 4, 8)
    with torch.inference_mode():
        result = operation(values, torch.ones(1, 4, 4), use_kernels=False)
        masked = operation(values, torch.zeros(1, 4, 4), use_kernels=False)
    assert result.shape == values.shape and torch.isfinite(result).all()
    assert torch.count_nonzero(result) > 0
    assert torch.count_nonzero(masked) == 0
