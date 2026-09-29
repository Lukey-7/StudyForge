"""Rate limiting + retry with exponential backoff for every external AI call.

Two separate ideas:
1. RateLimiter  -> stay UNDER the quota (proactive). Sliding window: remember the
   timestamps of recent calls; if we already made `rpm` calls in the last 60s,
   sleep until the oldest one falls out of the window.
2. with_retries -> recover when we still get throttled or the server hiccups
   (reactive). Wait 1s, 2s, 4s, 8s ... (+ random jitter so many clients don't
   retry in lock-step).
"""

import logging
import random
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)
T = TypeVar("T")


class RateLimiter:
    def __init__(self, rpm: int, window_s: float = 60.0) -> None:
        self.rpm = max(1, rpm)
        self.window_s = window_s
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """Block until one more call is allowed."""
        while True:
            with self._lock:
                now = time.monotonic()
                while self._calls and now - self._calls[0] >= self.window_s:
                    self._calls.popleft()
                if len(self._calls) < self.rpm:
                    self._calls.append(now)
                    return
                wait = self.window_s - (now - self._calls[0])
            logger.info("rate limiter: sleeping %.1fs", wait)
            time.sleep(max(wait, 0.05))


def with_retries(
    fn: Callable[[], T],
    *,
    is_retryable: Callable[[Exception], bool],
    max_attempts: int = 5,
    base_delay_s: float = 1.0,
    max_delay_s: float = 30.0,
) -> T:
    """Call fn(); on a retryable error wait base * 2^attempt (+ jitter) and try again."""
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - we re-raise non-retryable errors
            last_attempt = attempt == max_attempts - 1
            if last_attempt or not is_retryable(exc):
                raise
            delay = min(max_delay_s, base_delay_s * (2**attempt))
            delay += random.uniform(0, delay * 0.25)
            logger.warning(
                "retryable error (attempt %d/%d): %s; retrying in %.1fs",
                attempt + 1,
                max_attempts,
                str(exc)[:200],
                delay,
            )
            time.sleep(delay)
    raise RuntimeError("unreachable")
