"""Concurrency, source invalidation and failure semantics without native probes."""

import asyncio

import pytest

from opendde_workbench.readiness_cache import ReadinessCache


def test_concurrent_consumers_share_exactly_one_native_probe():
    async def scenario():
        gate = asyncio.Event()
        calls = 0

        async def observe():
            nonlocal calls
            calls += 1
            await gate.wait()
            return {"ready": True}

        cache = ReadinessCache(observe)
        readers = [asyncio.create_task(cache.read(("same",))) for _ in range(30)]
        await asyncio.sleep(0)
        gate.set()
        assert await asyncio.gather(*readers) == [{"ready": True}] * 30
        assert calls == 1

    asyncio.run(scenario())


def test_cancelled_http_reader_does_not_cancel_other_consumers():
    async def scenario():
        gate = asyncio.Event()

        async def observe():
            await gate.wait()
            return {"ready": True}

        cache = ReadinessCache(observe)
        cancelled = asyncio.create_task(cache.read("a"))
        retained = asyncio.create_task(cache.read("a"))
        await asyncio.sleep(0)
        cancelled.cancel()
        with pytest.raises(asyncio.CancelledError):
            await cancelled
        gate.set()
        assert await retained == {"ready": True}

    asyncio.run(scenario())


def test_changed_environment_and_expired_observations_recheck_native_state():
    async def scenario():
        calls = 0
        now = 0

        async def observe():
            nonlocal calls
            calls += 1
            return {"ready": calls == 1}

        cache = ReadinessCache(observe, clock=lambda: now)
        first = await cache.read("a")
        first["ready"] = False
        assert (await cache.read("a"))["ready"] is True
        assert (await cache.read("b"))["ready"] is False
        now = 11
        assert (await cache.read("b"))["ready"] is False
        assert calls == 3

    asyncio.run(scenario())


def test_failure_does_not_cache_or_fabricate_ready_state():
    async def scenario():
        calls = 0

        async def observe():
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("Native probe failed")
            return {"ready": False}

        cache = ReadinessCache(observe)
        with pytest.raises(RuntimeError, match="Native probe failed"):
            await cache.read("a")
        assert await cache.read("a") == {"ready": False}

    asyncio.run(scenario())


def test_changed_source_never_reuses_an_inflight_old_source_result():
    async def scenario():
        gate = asyncio.Event()
        calls = 0

        async def observe():
            nonlocal calls
            calls += 1
            number = calls
            await gate.wait()
            return {"revision": number}

        cache = ReadinessCache(observe)
        old = asyncio.create_task(cache.read("old"))
        new = asyncio.create_task(cache.read("new"))
        await asyncio.sleep(0)
        gate.set()
        assert await old == {"revision": 1}
        assert await new == {"revision": 2}

    asyncio.run(scenario())
