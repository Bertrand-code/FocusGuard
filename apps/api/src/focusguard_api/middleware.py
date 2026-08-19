from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store"
        return response


class LocalRateLimitMiddleware(BaseHTTPMiddleware):
    """Development-safe limiter. Production uses the same key policy backed by Redis."""

    def __init__(self, app, limit: int = 120, window_seconds: int = 60) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        client = request.client.host if request.client else "unknown"
        bucket = self.hits[f"{client}:{request.url.path}"]
        now = time.monotonic()
        while bucket and bucket[0] <= now - self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return Response(status_code=429, headers={"Retry-After": str(self.window_seconds)})
        bucket.append(now)
        return await call_next(request)


class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_url: str, limit: int = 120, window_seconds: int = 60) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.redis = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        self.limit = limit
        self.window_seconds = window_seconds

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        client = request.client.host if request.client else "unknown"
        principal = hashlib.sha256(client.encode("utf-8")).hexdigest()[:24]
        epoch_window = int(time.time()) // self.window_seconds
        key = f"focusguard:rate:{principal}:{request.url.path}:{epoch_window}"
        async with self.redis.pipeline(transaction=True) as pipeline:
            pipeline.incr(key)
            pipeline.expire(key, self.window_seconds + 5)
            count, _ = await pipeline.execute()
        if int(count) > self.limit:
            return Response(status_code=429, headers={"Retry-After": str(self.window_seconds)})
        return await call_next(request)
