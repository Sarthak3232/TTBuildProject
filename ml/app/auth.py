"""Private service authentication; this does not authenticate application users."""

import secrets

from fastapi import HTTPException, Request
from fastapi.security.utils import get_authorization_scheme_param


def configured_token(value: str | None) -> str | None:
    if not value or not value.isascii() or len(value) < 32:
        return None
    if value == "replace-with-a-generated-secret":
        return None
    return value


async def require_internal_token(request: Request) -> None:
    expected = request.app.state.internal_token
    if expected is None:
        raise HTTPException(status_code=503, detail="Service not configured")
    scheme, supplied = get_authorization_scheme_param(request.headers.get("Authorization"))
    if scheme.lower() != "bearer" or not supplied.isascii() or not secrets.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=401,
            detail="Invalid service credential",
            headers={"WWW-Authenticate": "Bearer"},
        )
