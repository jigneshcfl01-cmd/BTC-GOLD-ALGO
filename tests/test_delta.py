from unittest.mock import MagicMock, patch
from backend.core.delta_client import DeltaClient, DELTA_SPECS


def test_delta_client_specs():
    client = DeltaClient()
    btc_spec = client.spec("BTCUSD")
    gold_spec = client.spec("XAUUSD")
    assert btc_spec.contract_size == 0.001
    assert gold_spec.contract_size == 0.001
    assert btc_spec.volume_min == 1.0
    assert gold_spec.volume_min == 1.0


def test_delta_rates_ascending_order():
    client = DeltaClient()
    fake_descending_candles = [
        {"time": 1794914400, "open": 64399.0, "high": 64412.0, "low": 64350.0, "close": 64376.5, "volume": 48099.0},
        {"time": 1794914100, "open": 64350.0, "high": 64400.0, "low": 64330.0, "close": 64399.0, "volume": 32000.0},
        {"time": 1794913800, "open": 64300.0, "high": 64360.0, "low": 64290.0, "close": 64350.0, "volume": 25000.0},
    ]
    with patch.object(client, "_get", return_value={"success": True, "result": fake_descending_candles}):
        rates = client.rates("BTCUSD", "M5", 3)
        assert len(rates) == 3
        # Must be reversed to ascending order
        assert rates[0]["time"] == 1794913800
        assert rates[-1]["time"] == 1794914400


def test_delta_symbol_snapshot():
    client = DeltaClient()
    fake_ticker = {
        "success": True,
        "result": {
            "close": "64350.0",
            "quotes": {
                "best_bid": "64349.5",
                "best_ask": "64350.5",
            }
        }
    }
    with patch.object(client, "_get", return_value=fake_ticker):
        snap = client.symbol_snapshot("BTCUSD")
        assert snap["price"] == 64350.0
        assert snap["bid"] == 64349.5
        assert snap["ask"] == 64350.5
        assert snap["spread_points"] == 2.0  # 1.0 spread / 0.50 point = 2.0 pts
