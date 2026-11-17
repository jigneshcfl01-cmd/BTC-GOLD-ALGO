import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import { Glass } from "../components/Glass";
import { Mt5StatusCard } from "../components/Mt5Panels";
import { SocialPills } from "../components/TopBar";
import { api, post, put } from "../lib/api";
import type { Params, Rules } from "../lib/types";

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-white/20 text-[9px] text-slate-400" data-cursor="Info">
      ?
      <span className="pointer-events-none absolute bottom-5 left-1/2 z-20 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-space-800 p-2 text-[11px] normal-case leading-snug tracking-normal text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

const RULE_FIELDS: { k: keyof Rules; label: string; tip: string; step: number; basic?: boolean }[] = [
  { k: "risk_per_trade_pct", label: "Risk per trade %", tip: "Share of equity risked between entry and stop. Lot size is computed from this. Max 2%.", step: 0.1, basic: true },
  { k: "max_risk_per_trade_pct", label: "Max risk per trade %", tip: "Hard ceiling. If the minimum lot would risk more than this, the trade is vetoed.", step: 0.1 },
  { k: "daily_drawdown_kill_pct", label: "Daily drawdown kill %", tip: "When today's equity drop reaches this, every new signal is vetoed until tomorrow.", step: 0.5, basic: true },
  { k: "max_open_trades", label: "Max open trades", tip: "Maximum simultaneous positions.", step: 1, basic: true },
  { k: "min_rr", label: "Minimum RR (1:x)", tip: "Reward to TP1 divided by risk to SL must be at least this.", step: 0.1, basic: true },
  { k: "min_confidence", label: "Minimum confidence", tip: "Analyst confidence (1-10) required to trade.", step: 1, basic: true },
  { k: "spread_limit_xau_points", label: "XAUUSD spread limit (pts)", tip: "Veto when gold's spread exceeds this many points (1 pt = $0.01).", step: 1 },
  { k: "spread_limit_btc_points", label: "BTCUSD spread limit (pts)", tip: "Veto when BTC's spread exceeds this many points.", step: 100 },
  { k: "cooldown_minutes", label: "Cooldown (minutes)", tip: "After a trade on a level, ignore that same level for this long (duplicate-signal protection).", step: 5 },
];

const PARAM_FIELDS: { k: keyof Params; label: string; tip: string; min: number; max: number; step: number; basic?: boolean }[] = [
  { k: "xau_min_depth_pips", label: "XAU min sweep depth (pips)", tip: "How far beyond the level the wick must reach to count as a stop hunt.", min: 2, max: 30, step: 1, basic: true },
  { k: "xau_max_depth_pips", label: "XAU max sweep depth (pips)", tip: "Deeper than this is treated as a genuine breakout, not a sweep.", min: 5, max: 60, step: 1, basic: true },
  { k: "btc_min_depth_pct", label: "BTC min sweep depth (%)", tip: "Minimum wick extension beyond the level for BTC.", min: 0.05, max: 1, step: 0.01 },
  { k: "btc_max_depth_pct", label: "BTC max sweep depth (%)", tip: "Maximum wick extension beyond the level for BTC.", min: 0.1, max: 2, step: 0.01 },
  { k: "displacement_mult", label: "Displacement × avg body", tip: "The confirmation candle's body must be at least this many times the 20-candle average.", min: 1, max: 4, step: 0.1, basic: true },
  { k: "confirm_candles", label: "Close back inside within (candles)", tip: "The displacement close must happen within this many candles of the sweep.", min: 1, max: 6, step: 1 },
  { k: "xau_sl_buffer_pips", label: "XAU SL buffer (pips)", tip: "Extra distance beyond the wick extreme for the stop.", min: 0, max: 20, step: 1 },
  { k: "btc_sl_buffer_pct", label: "BTC SL buffer (%)", tip: "Extra distance beyond the wick extreme for the stop.", min: 0, max: 0.5, step: 0.01 },
  { k: "tp1_rr", label: "TP1 RR", tip: "TP1 distance as a multiple of risk. Must be at or above the Guardian's minimum RR.", min: 1, max: 5, step: 0.1, basic: true },
  { k: "tp2_min_rr", label: "TP2 minimum RR", tip: "TP2 targets the next liquidity pool at least this many R away.", min: 2, max: 8, step: 0.1 },
];

function ModeSwitch() {
  const { dataSource, execution, mt5 } = useStore();
  const ready = !!mt5?.connected && !(mt5?.issues ?? []).some((i) => ["algo", "account_trade", "terminal", "account_mismatch"].includes(i.code));
  const setMode = async (body: Record<string, string>) => {
    const r = await post<{ ok: boolean; message?: string }>("/api/mode", body);
    useStore.getState().pushToast({ level: r.ok ? "success" : "warning", title: r.ok ? "Mode updated" : "Mode unchanged", message: r.message ?? "The desk switched modes." });
  };
  const Btn = ({ on, label, onClick, disabled, title }: { on: boolean; label: string; onClick: () => void; disabled?: boolean; title?: string }) => (
    <button disabled={disabled} title={title} onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${on ? "bg-cyan-500/20 text-white shadow-glow" : "btn-ghost"}`}>{label}</button>
  );
  return (
    <Glass className="p-4" title="Mode">
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-24 text-xs text-slate-400">Market data</span>
          <Btn on={dataSource === "delta"} label="Delta Exchange" onClick={() => setMode({ data_source: "delta" })} disabled={execution === "mt5"} />
          <Btn on={dataSource === "demo"} label="Demo (synthetic)" onClick={() => setMode({ data_source: "demo" })} disabled={execution === "mt5"} />
          <Btn on={dataSource === "mt5"} label="MT5 live data" onClick={() => setMode({ data_source: "mt5" })} disabled={!mt5?.connected} title={!mt5?.connected ? "Connect MT5 first" : ""} />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-24 text-xs text-slate-400">Execution</span>
          <Btn on={execution === "paper"} label="Paper engine" onClick={() => setMode({ execution: "paper" })} />
          <Btn on={execution === "mt5"} label="MT5 orders" onClick={() => setMode({ execution: "mt5" })} disabled={!ready}
            title={!ready ? "MT5 must be connected, Algo Trading enabled and the configured account logged in" : ""} />
        </div>
        <p className="text-[11.5px] text-slate-400">
          Delta Exchange streams live BTCUSD and XAUTUSD data directly into the seven-agent desk and Paper engine.
        </p>
        <p className="text-[11.5px] text-slate-400">Paper is the default. MT5 orders go to a <b className="text-emerald-300">DEMO account only</b> unless Live is unlocked below.</p>
      </div>
    </Glass>
  );
}

function Mt5Config() {
  const { mt5, confirmPhrase, mt5ModeEnv } = useStore();
  const [cands, setCands] = useState<Record<string, string[]>>({ XAUUSD: [], BTCUSD: [] });
  const [map, setMap] = useState<Record<string, string>>(mt5?.symbol_map ?? { XAUUSD: "XAUUSD", BTCUSD: "BTCUSD" });
  const [phrase, setPhrase] = useState("");
  const [liveOn, setLiveOn] = useState(!!mt5?.live_unlocked);
  useEffect(() => {
    if (!mt5?.connected) return;
    api<{ candidates: Record<string, string[]>; mapping: Record<string, string> }>("/api/mt5/symbols")
      .then((d) => { setCands(d.candidates); setMap(d.mapping); }).catch(() => undefined);
  }, [mt5?.connected]);
  const saveMap = async () => {
    await put("/api/mt5/symbols", { mapping: map });
    useStore.getState().pushToast({ level: "success", title: "Symbol mapping saved", message: `XAUUSD → ${map.XAUUSD}, BTCUSD → ${map.BTCUSD}` });
  };
  const live = async (enable: boolean) => {
    const r = await post<{ ok: boolean; live_unlocked: boolean; message: string }>("/api/mt5/live", { enable, phrase });
    setLiveOn(r.live_unlocked);
    useStore.getState().pushToast({ level: r.ok ? (enable ? "error" : "success") : "warning", title: "Live trading", message: r.message });
  };
  return (
    <Glass className="p-4" title="MT5 symbols & live trading">
      <div className="mt-3 grid grid-cols-2 gap-3">
        {(["XAUUSD", "BTCUSD"] as const).map((k) => (
          <label key={k} className="text-xs text-slate-400">
            {k} broker symbol
            <div className="mt-1 flex gap-1.5">
              <input className="input py-1.5" value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value })} list={`c-${k}`} />
              <datalist id={`c-${k}`}>{(cands[k] ?? []).map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            {!!cands[k]?.length && <div className="mt-1 text-[10.5px] text-slate-500">Detected: {cands[k].slice(0, 5).join(", ")}</div>}
            {mt5?.symbols && <div className={`mt-0.5 text-[10.5px] ${mt5.symbols[k] ? "text-emerald-300" : "text-rose-300"}`}>{mt5.symbols[k] ? "✓ available" : "✕ not available"}</div>}
          </label>
        ))}
      </div>
      <button className="btn-ghost mt-3 px-3 py-1.5 text-xs" onClick={saveMap} disabled={!mt5?.available}>Confirm mapping</button>
      <div className="mt-4 rounded-xl border border-loss/30 bg-loss/[0.06] p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-sm font-semibold text-rose-200">Live (real-money) trading</div>
            <div className="text-[11px] text-slate-400">{mt5ModeEnv !== "live" ? "Hard-disabled: MT5_MODE=demo_only in .env." : "Requires the typed confirmation phrase."}</div>
          </div>
          <span className={`chip ${liveOn ? "border-loss bg-loss/70 text-white" : "border-profit/50 text-emerald-300"}`}>{liveOn ? "LIVE UNLOCKED" : "DEMO ONLY"}</span>
        </div>
        {!liveOn ? (
          <div className="mt-2 flex gap-2">
            <input className="input py-1.5" placeholder={`Type: ${confirmPhrase}`} value={phrase} onChange={(e) => setPhrase(e.target.value)} disabled={mt5ModeEnv !== "live"} />
            <button className="btn-danger whitespace-nowrap px-3 py-1.5 text-xs" disabled={mt5ModeEnv !== "live" || phrase.trim() !== confirmPhrase} onClick={() => live(true)}>Enable Live</button>
          </div>
        ) : (
          <button className="btn-ghost mt-2 px-3 py-1.5 text-xs" onClick={() => live(false)}>Lock back to DEMO ONLY</button>
        )}
      </div>
    </Glass>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Guardrails() {
  const rules = useStore((s) => s.rules);
  const params = useStore((s) => s.params);
  const beginner = useStore((s) => s.beginner);
  const [r, setR] = useState<Rules | null>(rules);
  const [p, setP] = useState<Params | null>(params);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const first = useRef(true);
  useEffect(() => { if (rules && !r) setR(rules); if (params && !p) setP(params); }, [rules, params, r, p]);
  const dr = useDebounced(r, 300);
  const dp = useDebounced(p, 300);
  useEffect(() => {
    if (!dr || !dp) return;
    if (first.current) { first.current = false; return; }
    put<{ ok: boolean; errors: string[] }>("/api/settings", { rules: dr, params: dp, validate_only: true }).then((x) => setErrors(x.errors)).catch(() => undefined);
  }, [dr, dp]);
  if (!r || !p) return <div className="skeleton h-80 rounded-2xl" />;
  const save = async () => {
    setSaving(true);
    try {
      const x = await put<{ ok: boolean; errors: string[] }>("/api/settings", { rules: r, params: p });
      setErrors(x.errors);
      if (x.ok) useStore.getState().pushToast({ level: "success", title: "Guardrails saved", message: "AEGIS and the Hunter use the new rules from the next candle." });
    } catch { /* toast shown */ } finally { setSaving(false); }
  };
  return (
    <Glass className="p-4" title="AEGIS guardrails & strategy" glow="profit" right={
      <button onClick={save} disabled={saving || errors.length > 0} className="btn-primary px-4 py-1.5 text-xs">{saving ? "Saving…" : "Save rules"}</button>}>
      {errors.length > 0 && (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-1 rounded-lg border border-loss/40 bg-loss/10 p-2.5 text-[12px] text-rose-200">
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </motion.ul>
      )}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
        {RULE_FIELDS.filter((f) => !beginner || f.basic).map((f) => (
          <label key={f.k} className="text-[11.5px] text-slate-400">
            <span className="flex items-center">{f.label}<Tip text={f.tip} /></span>
            <input type="number" step={f.step} className="input mt-1 py-1.5" value={r[f.k] as number}
              onChange={(e) => setR({ ...r, [f.k]: Number(e.target.value) })} />
          </label>
        ))}
        <label className="flex items-center gap-2 text-[12px] text-slate-300">
          <input type="checkbox" checked={r.session_filter} onChange={(e) => setR({ ...r, session_filter: e.target.checked })} className="accent-emerald-500" />
          Gold session filter (London/NY)<Tip text="Gold respects sessions: setups outside London and New York are vetoed. BTC trades 24/7 with session tags as context only." />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-slate-300">
          <input type="checkbox" checked={r.news_filter} onChange={(e) => setR({ ...r, news_filter: e.target.checked })} className="accent-emerald-500" />
          News-hour filter<Tip text="Vetoes setups whose candle hour (UTC) is in the news hours list below." />
        </label>
        {!beginner && (
          <label className="text-[11.5px] text-slate-400">
            <span className="flex items-center">News hours UTC (comma list)<Tip text="e.g. 12,13 for 12:30 UTC US data releases." /></span>
            <input className="input mt-1 py-1.5" value={r.news_hours_utc.join(",")}
              onChange={(e) => setR({ ...r, news_hours_utc: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => !Number.isNaN(x) && x >= 0 && x < 24) })} />
          </label>
        )}
      </div>
      <div className="label mt-5">Liquidity sweep strategy</div>
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {PARAM_FIELDS.filter((f) => !beginner || f.basic).map((f) => (
          <label key={f.k} className="text-[11.5px] text-slate-400">
            <span className="flex items-center justify-between">
              <span className="flex items-center">{f.label}<Tip text={f.tip} /></span>
              <span className="num text-cyan-200">{p[f.k]}</span>
            </span>
            <input type="range" min={f.min} max={f.max} step={f.step} value={p[f.k]} onChange={(e) => setP({ ...p, [f.k]: Number(e.target.value) })} className="mt-1 w-full accent-cyan-400" />
          </label>
        ))}
      </div>
    </Glass>
  );
}

function Display() {
  const { force2D, sound, beginner, toggle, set } = useStore();
  const Row = ({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-200 hover:bg-white/[0.04]">
      {label}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-cyan-500/70" : "bg-white/10"}`}>
        <motion.span layout className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ left: on ? 18 : 2 }} />
      </span>
    </button>
  );
  return (
    <Glass className="p-4" title="Display & help">
      <div className="mt-2">
        <Row label="Beginner mode (simplified)" on={beginner} onClick={() => toggle("beginner")} />
        <Row label="Sound effects" on={sound} onClick={() => toggle("sound")} />
        <Row label="2D low-power layout" on={force2D} onClick={() => toggle("force2D")} />
        <button className="btn-ghost mt-2 w-full text-xs" onClick={() => set({ tourOpen: true })}>Replay onboarding tour</button>
      </div>
      <div className="label mt-4">Support the creator (optional)</div>
      <div className="mt-2"><SocialPills small /></div>
    </Glass>
  );
}

export function SettingsView() {
  return (
    <div className="grid h-full gap-3 overflow-y-auto pb-2 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-3">
        <ModeSwitch />
        <Guardrails />
      </div>
      <div className="space-y-3">
        <Mt5StatusCard />
        <Mt5Config />
        <Display />
      </div>
    </div>
  );
}
