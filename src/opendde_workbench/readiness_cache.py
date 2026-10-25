"""One native readiness observation shared by concurrent HTTP consumers."""

import asyncio
import copy
import time


class ReadinessChanged(RuntimeError):
    """The installed source changed repeatedly during a bounded observation."""


class ReadinessTimedOut(ReadinessChanged):
    """No current native availability was confirmed within the observation budget."""


class ReadinessCache:
    def __init__(self, observe, *, ttl=10, clock=time.monotonic, observation_timeout=12):
        if observation_timeout <= 0:
            raise ValueError("The native observation timeout must be positive.")
        self.observe, self.ttl, self.clock = observe, ttl, clock
        self.observation_timeout = observation_timeout
        self._lock = asyncio.Lock()
        self._task = None
        self._key = None
        self._value = None
        self._expires = 0.0
        self._started = 0.0
        self._timed_out = False

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
            if self._task is not None and self._task.done() and self._timed_out:
                # Discard late results, including failures. They are neither fresh
                # availability nor a reason to launch overlapping native probes.
                if not self._task.cancelled():
                    self._task.exception()
                self._task = None
            if self._task is None:
                self._key = copy.deepcopy(key)
                self._value = None
                self._started = self.clock()
                self._timed_out = False
                self._task = asyncio.create_task(self.observe())
            task, observed_key = self._task, copy.deepcopy(self._key)
            started = self._started
            remaining = max(0, self.observation_timeout - (self.clock() - started))
        try:
            # Neither an HTTP timeout nor a disconnected reader owns the shared
            # native probe. Retain it until completion; never multiply hung checks.
            done, _ = await asyncio.wait({task}, timeout=remaining)
            if not done or self.clock() - started >= self.observation_timeout:
                async with self._lock:
                    if self._task is task:
                        self._timed_out = True
                raise ReadinessTimedOut(
                    "Backend availability could not be confirmed. Retry the availability check."
                )
            value = task.result()
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
