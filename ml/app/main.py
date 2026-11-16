"""Private model service. Bind to localhost; set ML_INTERNAL_TOKEN before start."""

import asyncio
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.auth import configured_token
from app.inference.runtime import InferenceRuntime
from app.inference.orientation import RULE_VERSION
from app.inference.routes import AdmissionGate, router
from app.models.fetch import MODEL_DIR


def create_app(runtime_factory=None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.internal_token = configured_token(os.getenv("ML_INTERNAL_TOKEN"))
        app.state.runtime = None
        if app.state.internal_token is not None:
            try:
                runtime = (
                    runtime_factory() if runtime_factory is not None else
                    InferenceRuntime(Path(os.getenv("ML_MODEL_DIR", str(MODEL_DIR))))
                )
                app.state.runtime = runtime
                await asyncio.to_thread(runtime.start)
            except Exception:
                # No exception text: native/library errors may contain private paths.
                logging.getLogger(__name__).error("Model initialization failed; service is not ready")
        try:
            yield
        finally:
            if app.state.runtime is not None:
                await app.state.runtime.close()

    app = FastAPI(title="SLOTTY Studbot ML", version="0.1.0", lifespan=lifespan)
    app.state.internal_token = None
    app.state.runtime = None
    app.state.frame_gate = AdmissionGate()
    app.include_router(router)

    @app.get("/health/live")
    def liveness() -> dict[str, str]:
        return {"status": "alive"}

    @app.get("/health/ready")
    def readiness():
        runtime = app.state.runtime
        if app.state.internal_token is None or runtime is None or not runtime.ready:
            return JSONResponse(status_code=503, content={"ready": False})
        return {"ready": True, "modelVersion": runtime.model_version, "ruleVersion": RULE_VERSION}

    return app


app = create_app()
