import asyncio
from threading import Event

import pytest

from app.inference.runtime import InferenceRuntime, RuntimeBusy


class FakePipeline:
    def __init__(self, release=None):
        self.release = release
        self.entered = Event()
        self.closed = False

    def detect(self, image):
        self.entered.set()
        if self.release is not None:
            assert self.release.wait(5), "test did not release worker"
        return ("face-result", "pose-result")

    def close(self):
        self.closed = True


def runtime_with(monkeypatch, pipelines):
    runtime = InferenceRuntime()
    monkeypatch.setattr(runtime, "_verify_assets", lambda: "test-model-v1")
    iterator = iter(pipelines)
    monkeypatch.setattr(runtime, "_create_pipeline", lambda: next(iterator))
    runtime.start()
    return runtime


def test_partial_startup_closes_already_created_pipeline(monkeypatch):
    runtime = InferenceRuntime()
    first = FakePipeline()
    monkeypatch.setattr(runtime, "_verify_assets", lambda: "test-model-v1")

    def create():
        if not runtime._pipelines:
            return first
        raise ValueError("model load failed")

    monkeypatch.setattr(runtime, "_create_pipeline", create)
    with pytest.raises(ValueError):
        runtime.start()
    assert first.closed
    assert not runtime.ready


def test_pool_rejects_overload_and_same_session_without_blocking_loop(monkeypatch):
    async def scenario():
        release = Event()
        pipelines = [FakePipeline(release), FakePipeline(release)]
        runtime = runtime_with(monkeypatch, pipelines)
        tasks = []
        try:
            tasks.append(asyncio.create_task(runtime.infer("one", object())))
            assert await asyncio.to_thread(pipelines[0].entered.wait, 2)
            with pytest.raises(RuntimeBusy):
                await runtime.infer("one", object())
            tasks.append(asyncio.create_task(runtime.infer("two", object())))
            assert await asyncio.to_thread(pipelines[1].entered.wait, 2)
            with pytest.raises(RuntimeBusy):
                await runtime.infer("three", object())
            release.set()
            assert await asyncio.gather(*tasks) == [("face-result", "pose-result")] * 2
        finally:
            release.set()
            await asyncio.gather(*tasks, return_exceptions=True)
            await runtime.close()
        assert all(pipeline.closed for pipeline in pipelines)

    asyncio.run(scenario())


@pytest.mark.parametrize("cancel", [False, True])
def test_timeout_or_cancellation_keeps_pipeline_leased_until_worker_finishes(monkeypatch, cancel):
    async def scenario():
        release = Event()
        pipelines = [FakePipeline(release), FakePipeline()]
        runtime = runtime_with(monkeypatch, pipelines)
        try:
            task = asyncio.create_task(runtime.infer("one", object(), timeout=0.1 if not cancel else 3))
            assert await asyncio.to_thread(pipelines[0].entered.wait, 2)
            if cancel:
                task.cancel()
            with pytest.raises(asyncio.CancelledError if cancel else TimeoutError):
                await task
            with pytest.raises(RuntimeBusy):
                await runtime.infer("one", object())
            assert await runtime.infer("two", object()) == ("face-result", "pose-result")
        finally:
            release.set()
            await runtime.close()
        assert all(pipeline.closed for pipeline in pipelines)

    asyncio.run(scenario())
