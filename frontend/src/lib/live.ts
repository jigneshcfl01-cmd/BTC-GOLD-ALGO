import { useStore } from "../store/useStore";
import { api } from "./api";
import { play } from "./sound";
import type { AgentResult, Candle, CycleSummary, DeltaHealth, Instrument, Kpis, Mt5Deal, Mt5Health, Mt5LogRow, Mt5Position, SessionInfo } from "./types";
import { SOCIAL_TOAST_KEY, safeStorage } from "../config/social";

const S = () => useStore.getState();

/** Load the full desk snapshot (called on boot and after reconnects). */
export async function loadState(): Promise<void> {
  const d = await api<Record<string, unknown>>("/api/state");
  S().set({
    mode: d.mode as string, dataSource: d.data_source as string, execution: d.execution as string,
    banner: (d.banner as string) ?? null, analystMode: d.analyst_mode as string, model: d.model as string,
    kpis: d.kpis as Kpis, positions: d.positions as never[], equity: d.equity_curve as never[],
    session: d.session as SessionInfo, rules: d.rules as never, params: d.params as never,
    delta: (d.delta as DeltaHealth) ?? null,
    mt5: d.mt5 as Mt5Health, confirmPhrase: d.confirm_phrase as string, mt5ModeEnv: d.mt5_mode_env as string,
    lastCycle: d.last_cycle as never,
    mt5Positions: ((d.mt5_sync as { positions: Mt5Position[] })?.positions ?? []),
    mt5Deals: ((d.mt5_sync as { deals: Mt5Deal[] })?.deals ?? []),
  });
}

export async function loadCandles(instrument: Instrument): Promise<void> {
  const d = await api<{ candles: Candle[]; last_cycle: CycleSummary | null }>(`/api/candles?instrument=${instrument}&n=500`);
  S().set({ candles: { ...S().candles, [instrument]: d.candles } });
}

export async function loadMt5Log(): Promise<void> {
  const d = await api<{ log: Mt5LogRow[] }>("/api/mt5/log?limit=80");
  S().set({ mt5Log: d.log });
}

function maybeSocialToast(): void {
  const st = safeStorage();
  if (st?.getItem(SOCIAL_TOAST_KEY)) return;
  st?.setItem(SOCIAL_TOAST_KEY, "1");
  window.setTimeout(() => S().pushToast({ level: "info", title: "Enjoying QUANT PILOT?",
    message: "Support the creator: Subscribe on YouTube or Follow on Instagram (top bar). Totally optional." }), 2500);
}
export { maybeSocialToast };

type Msg = { type: string; data: any; ts: number };

function handle(msg: Msg): void {
  const s = S();
  const d = msg.data;
  switch (msg.type) {
    case "agent":
      s.onAgent(d as AgentResult);
      if ((d as AgentResult).status === "veto") play("veto");
      break;
    case "cycle_end": {
      const c = d as CycleSummary;
      const prev = s.lastCycle[c.instrument];
      if (c.setup || !prev) s.set({ lastCycle: { ...s.lastCycle, [c.instrument]: c } });
      else s.set({ lastCycle: { ...s.lastCycle, [c.instrument]: { ...prev, levels: c.levels } } });
      break;
    }
    case "market": {
      Object.entries(d.candles as Record<Instrument, Candle>).forEach(([i, c]) => s.appendCandle(i as Instrument, c));
      const eq = [...s.equity, d.equity_point].slice(-800);
      s.set({ kpis: d.kpis, positions: d.positions, session: d.session, mode: d.mode, equity: eq });
      break;
    }
    case "toast":
      s.pushToast(d);
      break;
    case "trade_placed":
      play("trade");
      if (d.venue === "mt5") s.set({ mt5Pulse: s.mt5Pulse + 1 });
      maybeSocialToast();
      break;
    case "position_event":
      if (d.type === "tp1" || d.type === "tp2") {
        s.set({ confettiKey: s.confettiKey + 1 });
        play("tp");
      }
      break;
    case "mt5_status":
      s.set({ mt5: d as Mt5Health, mode: d.mode });
      break;
    case "delta_status":
      s.set({ delta: d as DeltaHealth });
      break;
    case "mt5_sync":
      s.set({ mt5Positions: d.positions, mt5Deals: d.deals });
      break;
    case "mt5_log":
      s.set({ mt5Log: [d as Mt5LogRow, ...s.mt5Log].slice(0, 120) });
      if ((d as Mt5LogRow).kind === "order_filled") s.set({ mt5Pulse: s.mt5Pulse + 1 });
      break;
    case "mode":
      s.set({ mode: d.mode, dataSource: d.data_source, execution: d.execution, banner: null });
      loadCandles(s.instrument).catch(() => undefined);
      break;
    case "settings":
      s.set({ rules: d.rules, params: d.params });
      break;
    case "kill_switch":
      play("kill");
      s.set({ kpis: s.kpis ? { ...s.kpis, kill_switch: d.engaged } : s.kpis });
      break;
    case "backtest_progress":
      s.set({ backtestProgress: d.progress });
      break;
    default:
      break;
  }
}

/** Connect to /ws with exponential-backoff reconnects. */
export function connectLive(): () => void {
  let ws: WebSocket | null = null;
  let retry = 0;
  let closed = false;
  let ping: number | undefined;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      if (retry > 0) S().pushToast({ level: "success", title: "Reconnected", message: "Live agent stream restored." });
      retry = 0;
      S().set({ wsConnected: true });
      loadState().catch(() => undefined);
      ping = window.setInterval(() => ws?.readyState === 1 && ws.send("ping"), 20000);
    };
    ws.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      window.clearInterval(ping);
      S().set({ wsConnected: false });
      if (closed) return;
      if (retry === 1) S().pushToast({ level: "warning", title: "Live stream lost", message: "Reconnecting to the agent desk..." });
      retry += 1;
      window.setTimeout(open, Math.min(8000, 500 * 2 ** retry));
    };
  };
  open();
  return () => {
    closed = true;
    ws?.close();
  };
}
