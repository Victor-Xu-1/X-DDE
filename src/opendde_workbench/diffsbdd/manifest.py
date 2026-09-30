"""Pinned scientific source and eight official, hash-verified model releases."""

SOURCE_COMMIT = "55f365b195d126ec25f7e7ae00ff253fd4491dac"
SOURCE_URL = "https://codeload.github.com/Victor-Xu-1/diffsbdd-workbench/tar.gz/" + SOURCE_COMMIT
SOURCE_SHA256 = "aeeb12ed4719046b1e4a28c9952e3e5251a15ac4d63ca2e67cd23c076f1f9176"
UPSTREAM_COMMIT = "5d0d38d16c8932a0339fd2ce3f67ade98bbdff27"
UPSTREAM_URL = "https://github.com/arneschneuing/DiffSBDD.git"
MODEL_URL = "https://zenodo.org/records/8183747/files/"
PYTHON_VERSION = "3.10.20"
MODELS = {
    item["id"]: item
    for item in [
        {
            "id": "crossdocked_ca_cond",
            "file": "crossdocked_ca_cond.ckpt",
            "dataset": "crossdocked",
            "representation": "ca",
            "strategy": "cond",
            "bytes": 77536863,
            "sha256": "cc96a8cbb52c94db638a9d56c7b381bc7e517418fbed6cd7e1bf1df488e5ff20",
        },
        {
            "id": "moad_ca_joint",
            "file": "moad_ca_joint.ckpt",
            "dataset": "moad",
            "representation": "ca",
            "strategy": "joint",
            "bytes": 16351613,
            "sha256": "0b0fd3c9483afbe48f6717d3aa88fb216669c3f6e625646500f4db15331fd13c",
        },
        {
            "id": "crossdocked_fullatom_cond",
            "file": "crossdocked_fullatom_cond.ckpt",
            "dataset": "crossdocked",
            "representation": "fullatom",
            "strategy": "cond",
            "bytes": 17861341,
            "sha256": "07f86764bf569aafbc40a9c15fc02de8e2550437dd0f17f657eab3abe66c372c",
        },
        {
            "id": "crossdocked_ca_joint",
            "file": "crossdocked_ca_joint.ckpt",
            "dataset": "crossdocked",
            "representation": "ca",
            "strategy": "joint",
            "bytes": 77612671,
            "sha256": "b66cf6b6e61300c561c8d4c4418cb0e5474ed18a95524942460acb58449615f9",
        },
        {
            "id": "moad_ca_cond",
            "file": "moad_ca_cond.ckpt",
            "dataset": "moad",
            "representation": "ca",
            "strategy": "cond",
            "bytes": 16321821,
            "sha256": "ef5d62a07a031b9d2032f5ebf0835d9244706e71bb621fd36d9b305fec58e58f",
        },
        {
            "id": "moad_fullatom_cond",
            "file": "moad_fullatom_cond.ckpt",
            "dataset": "moad",
            "representation": "fullatom",
            "strategy": "cond",
            "bytes": 44720533,
            "sha256": "58bd5f6c532e64a727f92779c6d3d7f274e5df7b0d345e4900a99dd341192561",
        },
        {
            "id": "moad_fullatom_joint",
            "file": "moad_fullatom_joint.ckpt",
            "dataset": "moad",
            "representation": "fullatom",
            "strategy": "joint",
            "bytes": 44758069,
            "sha256": "b16aebaab0a71ee0295c990fbea50cfca23aadf410fc263c646483653e99f494",
        },
        {
            "id": "crossdocked_fullatom_joint",
            "file": "crossdocked_fullatom_joint.ckpt",
            "dataset": "crossdocked",
            "representation": "fullatom",
            "strategy": "joint",
            "bytes": 17875773,
            "sha256": "4e0f8727c7e4c9d8c8963927ac218a9b6f777104c396f0f8c7aa4a0b88e598bd",
        },
    ]
}
