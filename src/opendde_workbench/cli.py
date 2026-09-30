"""Human-facing commands; scientific OpenDDE remains a separate runtime."""

import argparse
import json
import sys
import webbrowser

from . import __version__
from .locations import home


def parser():
    p = argparse.ArgumentParser(prog="X-DDE", description="X-DDE research workbench")
    p.add_argument(
        "command",
        nargs="?",
        default="ui",
        type=str.lower,
        choices=[
            "ui",
            "dashboard",
            "start",
            "stop",
            "close",
            "restart",
            "status",
            "logs",
            "doctor",
            "setup",
            "version",
            "help",
        ],
    )
    p.add_argument(
        "action",
        nargs="?",
        type=str.lower,
        choices=["start", "stop", "close", "restart", "status", "system"],
    )
    p.add_argument("--port", type=int, default=4320)
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--no-auto-deploy", action="store_true")
    p.add_argument("--version", action="version", version=__version__)
    return p


def main():
    p = parser()
    # Normalize commands and option names, never paths or option values.
    args = p.parse_args([v.lower() if v.startswith("--") else v for v in sys.argv[1:]])
    if not 1024 <= args.port <= 65535:
        p.error("Port must be between 1024 and 65535.")
    command = args.action if args.command in {"ui", "dashboard"} and args.action else args.command
    if args.action and args.command not in {"ui", "dashboard", "setup"}:
        p.error("Use xdde COMMAND, or xdde ui start|stop|restart|status.")
    if args.action == "system" and args.command != "setup":
        p.error("Use xdde setup system.")
    from .service_control import logs, start, status, stop

    try:
        if command == "help":
            p.print_help()
        elif command == "version":
            print(__version__)
        elif command == "status":
            print(json.dumps(status(), ensure_ascii=False, indent=2))
        elif command == "logs":
            print(logs())
        elif command in {"stop", "close"}:
            stop()
            print("X-DDE UI stopped. Your data is retained.")
        elif command == "doctor":
            from .deployment.catalog import prerequisites

            print(
                json.dumps(
                    {
                        "version": __version__,
                        "home": str(home()),
                        "service": status(),
                        "prerequisites": prerequisites(),
                    },
                    indent=2,
                )
            )
        elif command == "setup" and args.action == "system":
            from .deployment.system import install_system

            install_system()
        else:
            if command == "restart":
                stop()
            url = start(args.port, not args.no_auto_deploy)
            print(f"X-DDE {__version__}: {url}")
            print("Stop: xdde stop | Status: xdde status | Logs: xdde logs")
            if not args.no_browser:
                webbrowser.open(url)
    except (ValueError, RuntimeError, OSError, TimeoutError) as exc:
        print(f"X-DDE: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
