"""Delta Exchange Client: Public market data (Candles, Tickers, Orderbook spread) and contract specifications.

Supports Delta Exchange India (api.india.delta.exchange) and Delta Exchange Global (api.delta.exchange).
Used for live real-time market data in Paper Trading mode.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from .indicators import InstrumentSpec

log = logging.getLogger("quantpilot.delta")

# Delta Exchange micro-contract specifications
DELTA_SPECS: dict[str, InstrumentSpec] = {
    # Gold on Delta (XAUTUSD / PAXGUSD): 1 contract = 0.001 oz (~$3.85 value)
    "XAUUSD": InstrumentSpec("XAUUSD", pip_size=0.10, point=0.01, contract_size=0.001, volume_min=1.0, volume_step=1.0, volume_max=10000.0, digits=2, sessions_matter=True),
    # Bitcoin on Delta (BTCUSD): 1 contract = 0.001 BTC (~$64 value)
    "BTCUSD": InstrumentSpec("BTCUSD", pip_size=1.0, point=0.50, contract_size=0.001, volume_min=1.0, volume_step=1.0, volume_max=10000.0, digits=2, sessions_matter=False),
}

DEFAULT_SYMBOL_MAP: dict[str, str] = {
    "BTCUSD": "BTCUSD",
    "XAUUSD": "XAUTUSD",  # Tether Gold perpetual on Delta
}


class DeltaClient:
    """Client for Delta Exchange v2 REST API."""

    def __init__(
        self,
        base_url: str = "https://api.india.delta.exchange",
        fallback_url: str = "https://api.delta.exchange",
        symbol_map: Optional[dict[str, str]] = None,
        timeout: float = 6.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.fallback_url = fallback_url.rstrip("/")
        self.symbol_map = dict(symbol_map or DEFAULT_SYMBOL_MAP)
        self.timeout = timeout
        self.connected = False
        self.last_health: dict[str, Any] = {}
        self._cached_candles: dict[str, list[dict]] = {}
        self._last_candle_fetch: dict[str, float] = {}
        self._client: Optional[httpx.Client] = None

    def _get_client(self) -> httpx.Client:
        if self._client is None or self._client.is_closed:
            self._client = httpx.Client(
                timeout=self.timeout,
                headers={"User-Agent": "QuantPilot/1.0", "Accept": "application/json"},
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            self._client.close()
            self._client = None

    def spec(self, instrument: str) -> InstrumentSpec:
        """Return the Delta micro-contract specification for sizing and risk."""
        return DELTA_SPECS.get(instrument, DELTA_SPECS["BTCUSD"])

    def to_delta_symbol(self, instrument: str) -> str:
        return self.symbol_map.get(instrument, instrument)

    def _get(self, path: str, params: Optional[dict] = None) -> Optional[dict]:
        """Send GET request with automatic fallback to secondary URL if primary fails."""
        client = self._get_client()
        for base in [self.base_url, self.fallback_url]:
            try:
                url = f"{base}{path}"
                resp = client.get(url, params=params)
                if resp.status_code == 200:
                    return resp.json()
            except Exception as exc:
                log.debug("Delta request to %s failed: %s", base, exc)
        return None

    def health(self) -> dict:
        """Check API connectivity and ping latency."""
        t0 = time.time()
        res = self._get("/v2/tickers/BTCUSD")
        latency = round((time.time() - t0) * 1000, 1)
        ok = bool(res and res.get("success"))
        self.connected = ok
        self.last_health = {
            "connected": ok,
            "base_url": self.base_url,
            "ping_ms": latency if ok else 0.0,
            "symbols": self.symbol_map,
            "checked_at": int(time.time()),
        }
        return self.last_health

    def symbol_snapshot(self, instrument: str) -> dict:
        """Fetch real-time mark price, best bid/ask, and spread points."""
        sym = self.to_delta_symbol(instrument)
        res = self._get(f"/v2/tickers/{sym}")
        if not res or not res.get("success"):
            return {}
        data = res.get("result", {})
        quotes = data.get("quotes") or {}
        bid = float(quotes.get("best_bid") or data.get("close") or 0.0)
        ask = float(quotes.get("best_ask") or data.get("close") or 0.0)
        close = float(data.get("close") or (bid + ask) / 2 or 0.0)
        spread = max(0.0, ask - bid)
        spec = self.spec(instrument)
        spread_pts = round(spread / spec.point, 1) if spec.point else 0.0
        return {
            "symbol": instrument,
            "delta_symbol": sym,
            "price": close,
            "bid": bid,
            "ask": ask,
            "spread_points": spread_pts,
            "tick_size": spec.point,
            "tick_value": spec.point * spec.contract_size,
        }

    def spread_points(self, instrument: str) -> float:
        snap = self.symbol_snapshot(instrument)
        return snap.get("spread_points", 5.0)

    def rates(self, instrument: str, timeframe: str = "M5", count: int = 1500) -> list[dict]:
        """Fetch historical candlestick data from Delta Exchange in ascending order.
        
        Always retains a deep history buffer (>= 1000 candles) so indicators, swings,
        and agent pipelines have ample historical context.
        """
        now = time.time()
        cached = self._cached_candles.get(instrument, [])
        if (
            cached
            and len(cached) >= min(count, 300)
            and (now - self._last_candle_fetch.get(instrument, 0)) < 3.0
        ):
            return cached[-count:]

        sym = self.to_delta_symbol(instrument)
        resolution_map = {"M1": "1m", "M5": "5m", "15M": "15m", "H1": "1h", "4H": "4h", "D": "1d"}
        res_str = resolution_map.get(timeframe.upper(), "5m")

        seconds_per_candle = 300 if res_str == "5m" else 900
        end_time = int(now)
        fetch_count = max(count, 1000)
        start_time = end_time - (fetch_count + 20) * seconds_per_candle

        res = self._get("/v2/history/candles", params={"symbol": sym, "resolution": res_str, "start": start_time, "end": end_time})
        if not res or not res.get("success"):
            return cached[-count:]

        raw_candles = res.get("result", [])
        if not raw_candles:
            return cached[-count:]

        # Delta returns candles descending (newest first). Convert to ascending order.
        sorted_candles = sorted(raw_candles, key=lambda c: c["time"])
        formatted = []
        for c in sorted_candles:
            formatted.append({
                "time": int(c["time"]),
                "open": float(c["open"]),
                "high": float(c["high"]),
                "low": float(c["low"]),
                "close": float(c["close"]),
                "volume": float(c.get("volume", 0.0)),
            })

        self._cached_candles[instrument] = formatted
        self._last_candle_fetch[instrument] = now
        return formatted[-count:]
