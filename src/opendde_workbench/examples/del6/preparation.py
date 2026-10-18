"""Load authentic DEL materials or a sealed reviewed recipe without launching any calculation."""

from ..contracts import PreparedExample
from ..dataset_inputs import register_dataset_input
from ..pins import ExamplePins
from ..stat6.request_replay import reviewed_request
from .catalogue import CASE, FILES, MODULES, input_keys
from .guidance import PURPOSES, context
from .requests import study_request


def prepare_del6(capability, scientific, cache, *, records=None):
    module = MODULES[capability]
    study = context(capability)
    assets = {}
    request = reviewed_request(capability, scientific, records, modules=MODULES)
    if request is None:
        assets = {
            key: register_dataset_input(scientific.assets, cache, FILES[key], kind=FILES[key].kind)
            for key in input_keys(capability)
        }
        pins = ExamplePins(scientific.store, cache.parent, modules=MODULES)
        request, missing = study_request(capability, assets, scientific, records, pins)
        if missing:
            study["required_materials"] = [
                (
                    "先完成并核对上游步骤：" + "；".join(PURPOSES[item][0] for item in missing),
                    "First complete and review: " + " ".join(PURPOSES[item][1] for item in missing),
                )
            ]
    return PreparedExample(
        module=module,
        case=CASE,
        objects={},
        sequences={},
        data_assets=assets,
        sources=CASE.sources,
        request=request,
        study=study,
    )
