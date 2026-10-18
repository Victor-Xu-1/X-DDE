"""Private Torch CLI identity/cache settings shared by install and execution."""


def torch_cache_arguments(program):
    if program not in {"openfe", "gromacs", "reinvent", "ligandmpnn"}:
        return []
    return [
        "--env",
        "USER=xdde",
        "--env",
        "LOGNAME=xdde",
        "--env",
        "TORCHINDUCTOR_CACHE_DIR=/tmp/torch-inductor",
    ]
