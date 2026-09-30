"""Reviewed upstream releases. Updates never execute browser-supplied commands."""

import platform
import shutil
from dataclasses import asdict, dataclass

from ..diffsbdd.manifest import MODEL_URL, MODELS, SOURCE_COMMIT, SOURCE_SHA256, SOURCE_URL


@dataclass(frozen=True)
class Package:
    id: str
    version: str
    name: str
    description: str
    size: str
    dependencies: tuple[str, ...] = ()
    automatic: bool = False
    url: str = ""
    checksum: str = ""
    license: str = ""


PACKAGES = {
    p.id: p
    for p in [
        Package(
            "harness",
            "0.0.4",
            "OpenDDE Harness",
            "原生工具客户端与安装器 / Native tool client",
            "约150 MB",
            automatic=True,
            url="https://github.com/aurekaresearch/OpenDDE-Harness/releases/download/v0.0.4/opendde_harness-0.0.4-py3-none-any.whl",
            checksum="94d615786dcc8d65227696319f65dab43c8af9f89891ed7fc74c685e9efca59f",
            license="Apache-2.0",
        ),
        Package(
            "runtime",
            "0.0.4",
            "OpenDDE runtime",
            "OpenDDE、PLIP、MPNN 原生源码 / Native scientific code",
            "约300 MB",
            ("harness",),
            True,
            license="Upstream licenses",
        ),
        Package(
            "compute",
            "v1",
            "OpenDDE compute environment",
            "Docker 中的 PyTorch、RDKit、Biotite / Scientific dependencies",
            "数 GB / Several GB",
            ("harness", "runtime"),
            True,
            license="Upstream licenses",
        ),
        Package(
            "standard",
            "opendde-v1",
            "OpenDDE standard",
            "标准模型与 CCD 数据 / General model and CCD",
            "数 GB / Several GB",
            ("harness", "runtime", "compute"),
            license="Upstream model terms",
        ),
        Package(
            "abag",
            "opendde-v1",
            "OpenDDE ABAG",
            "抗体模型、ESM2 与 SolubleMPNN 权重 / Antibody and tool weights",
            "数 GB / Several GB",
            ("harness", "runtime", "compute"),
            license="Upstream model terms",
        ),
        Package(
            "ketcher",
            "3.18.0",
            "Ketcher",
            "二维分子与大分子绘图 / Molecular sketch editor",
            "35 MB 下载 / download",
            automatic=True,
            url="https://github.com/epam/ketcher/releases/download/v3.18.0/ketcher-standalone-3.18.0.zip",
            checksum="484e7f10a0e74808ae5f43f0e6448db6f4d884bdd2189aa271108474167a3e7e",
            license="Apache-2.0",
        ),
        Package(
            "molstar",
            "5.12.0",
            "Mol*",
            "蛋白、复合物、序列与三维结构检查 / Protein structure workspace",
            "约20 MB 下载 / download",
            automatic=True,
            url="https://registry.npmjs.org/molstar/-/molstar-5.12.0.tgz",
            checksum="sha512:KBwdn8ie42a6kqgp/zhCjBb8fIJdBcBq/AMc17iWdYLtGF4doxmaMe5Rf0cUUwMj7FiH+/1Hp7F2Px6ywQV/rg==",
            license="MIT",
        ),
    ]
}


PACKAGES["diffsbdd"] = Package(
    "diffsbdd",
    SOURCE_COMMIT[:12],
    "DiffSBDD",
    "小分子设计科学环境 / Small-molecule design runtime",
    "数 GB / Several GB",
    url=SOURCE_URL,
    checksum=SOURCE_SHA256,
    license="MIT / upstream licenses",
)
for identifier, model in MODELS.items():
    key = "diffsbdd-model-" + identifier
    PACKAGES[key] = Package(
        key,
        model["sha256"][:12],
        "DiffSBDD · " + identifier,
        "官方固定模型 / Official pinned checkpoint",
        f"{model['bytes'] / 1024**2:.1f} MiB",
        ("diffsbdd",),
        url=MODEL_URL + model["file"] + "?download=1",
        checksum=model["sha256"],
        license="Official DiffSBDD model terms",
    )


def prerequisites() -> dict:
    return {
        "platform": platform.system(),
        "architecture": platform.machine(),
        "supported": platform.system() == "Linux" and platform.machine() in {"x86_64", "AMD64"},
        "docker": bool(shutil.which("docker")),
        "uv": bool(shutil.which("uv")),
        "gpu_tool": bool(shutil.which("nvidia-smi")),
    }


def catalogue() -> list[dict]:
    return [asdict(p) for p in PACKAGES.values()]


def dependencies(identifier: str) -> list[str]:
    result = []

    def visit(key):
        for dep in PACKAGES[key].dependencies:
            visit(dep)
        if key not in result:
            result.append(key)

    visit(identifier)
    return result
