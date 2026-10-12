"""One native readiness observation shared by concurrent HTTP consumers."""

import asyncio
import copy
import time


class ReadinessChanged(RuntimeError):
    """The installed source changed repeatedly during a bounded observation."""


class ReadinessCache:
    def __init__(self, observe, *, ttl=10, clock=time.monotonic):
        self.observe, self.ttl, self.clock = observe, ttl, clock
        self._lock = asyncio.Lock()
        self._task = None
        self._key = None
        self._value = None
        self._expires = 0.0

    async def close(self):
        async with self._lock:
            task, self._task = self._task, None
            self._value = None
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def read(self, key):
        for _ in range(2):
            observed_key, value = await self._read(key)
            if observed_key == key:
                return value
        raise ReadinessChanged("Backend configuration changed; recheck availability.")

    async def _read(self, key):
        async with self._lock:
            if self._key == key and self._value is not None and self.clock() < self._expires:
                return copy.deepcopy(key), copy.deepcopy(self._value)
            if self._task is None:
                self._key = copy.deepcopy(key)
                self._value = None
                self._task = asyncio.create_task(self.observe())
            task, observed_key = self._task, copy.deepcopy(self._key)
        try:
            # A cancelled browser request must not cancel everybody else's observation.
            value = await asyncio.shield(task)
        except BaseException:
            if task.done():
                async with self._lock:
                    if self._task is task:
                        self._task = None
                        self._value = None
            raise
        async with self._lock:
            if self._task is task:
                self._task = None
                self._value = copy.deepcopy(value)
                self._expires = self.clock() + self.ttl
        return observed_key, copy.deepcopy(value)
