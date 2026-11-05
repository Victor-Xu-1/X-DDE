"""Keep executor mutations alive until their scientific-file transactions finish."""

import asyncio


class AssetUploadWorkers:
    def __init__(self):
        self.pending = set()

    def start(self, function, *args):
        worker = asyncio.get_running_loop().run_in_executor(None, function, *args)
        self.pending.add(worker)
        worker.add_done_callback(self.completed)
        return worker

    def completed(self, worker):
        self.pending.discard(worker)
        # An interrupted request cannot retrieve a later executor exception.
        if not worker.cancelled():
            worker.exception()

    async def run(self, function, *args):
        return await asyncio.shield(self.start(function, *args))

    async def close(self):
        # HTTP task cancellation cannot stop a running executor mutation.
        # Drain these workers before Uvicorn replays its termination signal.
        while self.pending:
            await asyncio.gather(
                *(asyncio.shield(worker) for worker in tuple(self.pending)),
                return_exceptions=True,
            )
