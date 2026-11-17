export type AgentName = "Scout" | "Cartographer" | "Hunter" | "Analyst" | "Guardian" | "Executioner" | "Chronicler";
export type AgentStatus = "ok" | "skip" | "veto" | "error";
export type Instrument = "XAUUSD" | "BTCUSD";
export type ViewId = "constellation" | "chart" | "signals" | "backtest" | "journal" | "settings";

export interface AgentResult {
  agent: AgentName;
  status: AgentStatus;
  summary: string;
  data: Record<string, unknown>;
  confidence: number;
  timestamp: number;
  latency_ms: number;
  instrument?: Instrument;
  cycle_id?: string;
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export interface Level { name: string; price: number; side: "high" | "low"; strength: number }

export interface Setup {
  signal_id: string;
  instrument: Instrument;
  direction: "LONG" | "SHORT";
  level: Level;
  sweep_time: number;
  confirm_time: number;
  sweep_extreme: number;
  extension_depth: number;
  extension_unit: "pips" | "pct";
  displacement_ratio: number;
  volume_spike: boolean;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  risk_reward_ratio: number;
  session: string;
}

export interface Decision {
  instrument: string;
  bias: "BULLISH_SWEEP_LONG" | "BEARISH_SWEEP_SHORT" | "NO_TRADE";
  confidence_score: number;
  htf_level_targeted: string;
  sweep_details: { extension_depth: string; displacement_quality: string };
  trade_plan: { entry_price: number; stop_loss: number; take_profit_1: number; take_profit_2: number; risk_reward_ratio: number };
  reasoning: string;
  invalidation_conditions: string[] | string;
}

export interface Check { name: string; passed: boolean; detail: string }

export interface CycleSummary {
  instrument: Instrument;
  cycle_id: string;
  outcome: "none" | "skipped" | "vetoed" | "taken" | "error";
  ts: number;
  setup: Setup | null;
  decision: Decision | null;
  checks: Check[];
  levels: Level[];
  trace: AgentResult[];
  execution: Record<string, unknown>;
}

export interface Kpis {
  equity: number; balance: number; today_pnl: number; today_pnl_pct: number; win_rate: number; trades: number;
  open_risk: number; open_risk_pct: number; drawdown_pct: number; dd_limit_pct: number; kill_switch: boolean;
}

export interface PaperPosition {
  id: string; signal_id: string; instrument: Instrument; direction: "LONG" | "SHORT"; volume: number; initial_volume: number;
  entry_price: number; stop_loss: number; initial_stop: number; take_profit_1: number; take_profit_2: number; opened_at: number;
  unrealized_pnl: number; realized_pnl: number; tp1_hit: boolean; breakeven: boolean; venue: "paper" | "mt5"; ticket?: number | null;
}

export interface Mt5Position {
  ticket: number; symbol: string; type: "BUY" | "SELL"; volume: number; price_open: number; price_current: number;
  sl: number; tp: number; profit: number; magic: number; comment: string; time: number; quantpilot: boolean;
}

export interface Mt5Deal {
  ticket: number; position_id: number; symbol: string; type: string; entry: string; volume: number; price: number;
  profit: number; time: number; magic: number; comment: string; quantpilot: boolean;
}

export interface Mt5Issue { code: string; message: string; fix: string }

export interface Mt5Health {
  available: boolean; connected: boolean; issues: Mt5Issue[]; checked_at?: number; ping_ms?: number;
  symbol_map?: Record<string, string>; symbols?: Record<string, boolean>; live_unlocked?: boolean; allow_live_env?: boolean;
  terminal?: { name: string; company: string; trade_allowed: boolean; connected: boolean };
  account?: { login: number; name: string; server: string; currency: string; balance: number; equity: number;
    margin_free: number; leverage: number; trade_mode: "DEMO" | "REAL" | "CONTEST"; trade_allowed: boolean };
}

export interface DeltaHealth {
  connected: boolean;
  base_url: string;
  ping_ms: number;
  symbols: Record<string, string>;
  checked_at?: number;
}

export interface Mt5LogRow {
  ts: number; kind: string; symbol: string; retcode: number | null; ticket: number | null; price: number | null;
  volume: number | null; message: string; request?: string;
}

export interface SessionInfo { session: string; utc: string; ist: string; day_progress: number }

export interface Rules {
  risk_per_trade_pct: number; max_risk_per_trade_pct: number; daily_drawdown_kill_pct: number; max_open_trades: number;
  min_rr: number; min_confidence: number; spread_limit_xau_points: number; spread_limit_btc_points: number;
  session_filter: boolean; allowed_sessions_xau: string[]; cooldown_minutes: number; news_filter: boolean; news_hours_utc: number[];
}

export interface Params {
  xau_min_depth_pips: number; xau_max_depth_pips: number; btc_min_depth_pct: number; btc_max_depth_pct: number;
  displacement_mult: number; confirm_candles: number; xau_sl_buffer_pips: number; btc_sl_buffer_pct: number;
  tp1_rr: number; tp2_min_rr: number; body_lookback: number; volume_spike_mult: number; eq_tolerance_pips: number; eq_tolerance_pct: number;
}

export interface Toast { id: number; level: "success" | "info" | "warning" | "error"; title: string; message: string }

export interface JournalRow {
  id: number; ts: number; instrument: Instrument; signal_id: string | null; outcome: string; summary: string; trace: AgentResult[];
}

export interface BacktestResult {
  instrument: Instrument; days: number; candles: number; elapsed_s: number;
  stats: { trades: number; win_rate: number; profit_factor: number; max_drawdown_pct: number; net_pnl: number; return_pct: number;
    avg_win: number; avg_loss: number; expectancy: number; final_equity: number; starting_balance: number };
  decisions: { taken: number; vetoed: number; skipped: number };
  veto_reasons: Record<string, number>;
  equity_curve: { time: number; equity: number }[];
  markers: { time: number; type: "entry" | "exit"; direction?: string; price?: number; pnl?: number; reason?: string; level?: string }[];
  monthly: { month: string; pnl: number; pct: number }[];
  trades: { time: number; closed: number; direction: string; entry: number; exit: number; pnl: number; reason: string }[];
  disclaimer: string;
}

export const AGENTS: { name: AgentName; role: string; color: string; blurb: string }[] = [
  { name: "Scout", role: "Data", color: "#22d3ee", blurb: "Pulls 5M/15M/4H/Daily candles, spread and account state from MT5 or the demo feed." },
  { name: "Cartographer", role: "Liquidity Mapper", color: "#38bdf8", blurb: "Maps PDH/PDL, Asian range, 4H swings and equal highs/lows where stops rest." },
  { name: "Hunter", role: "Sweep Detector", color: "#a78bfa", blurb: "Detects a wick through a level plus a displacement close back inside the range." },
  { name: "Analyst", role: "Claude", color: "#8b5cf6", blurb: "Claude reviews the candidate and returns strict JSON. It can only refine or reject." },
  { name: "Guardian", role: "AEGIS Risk", color: "#10b981", blurb: "Hard vetoes: spread, drawdown, RR, confidence, session, cooldown, lot sizing." },
  { name: "Executioner", role: "Execution", color: "#f59e0b", blurb: "Sends approved orders to the paper engine or MT5 with SL/TP, BE and partials." },
  { name: "Chronicler", role: "Journal", color: "#f472b6", blurb: "Logs every decision with the full trace and writes the end-of-day review." },
];
