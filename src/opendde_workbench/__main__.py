"""Single-process localhost entry point."""

import argparse
import logging

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="OpenDDE Workbench (localhost only)")
    parser.add_argument("--port", type=int, default=4320)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    uvicorn.run(
        "opendde_workbench.api:create_app",
        factory=True,
        host="127.0.0.1",
        port=args.port,
        workers=1,
    )


if __name__ == "__main__":
    main()
