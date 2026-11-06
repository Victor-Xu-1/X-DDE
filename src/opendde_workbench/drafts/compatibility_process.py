"""Bounded schema-probe output in the managed Linux/WSL application environment."""

import os
import selectors
import subprocess
import time

MAX_REPORT_BYTES = 65536


def run_probe(arguments, *, stdin, timeout=30):
    """Drain both pipes concurrently; never buffer or log an unlimited child stream."""
    deadline = time.monotonic() + timeout
    captured = {"stdout": bytearray(), "stderr": bytearray()}
    with subprocess.Popen(
        arguments, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    ) as child:
        try:
            with selectors.DefaultSelector() as selector:
                for name in captured:
                    stream = getattr(child, name)
                    os.set_blocking(stream.fileno(), False)
                    selector.register(stream, selectors.EVENT_READ, name)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(arguments, timeout)
                    for key, _ in selector.select(remaining):
                        data = os.read(
                            key.fd, min(8192, MAX_REPORT_BYTES + 1 - len(captured[key.data]))
                        )
                        if not data:
                            selector.unregister(key.fileobj)
                            continue
                        if len(captured[key.data]) + len(data) > MAX_REPORT_BYTES:
                            raise ValueError(
                                "The target draft validator exceeded its output budget."
                            )
                        captured[key.data].extend(data)
            child.wait(timeout=max(0, deadline - time.monotonic()))
            if child.returncode:
                # Do not attach target diagnostics or research data to an exception.
                raise subprocess.CalledProcessError(child.returncode, arguments)
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
            child.stdout.close()
            child.stderr.close()
    return bytes(captured["stdout"])
