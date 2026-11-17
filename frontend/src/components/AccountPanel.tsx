import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { Glass } from "./Glass";
import { CountUp, DrawdownGauge, EquityCurve } from "./Metrics";
import { KillSwitch } from "./KillSwitch";
import { usd } from "../lib/format";

/**
 * AEGIS shield: a layered 3D (CSS perspective) hex shield that glows emerald when all
 * checks pass and cracks rose on a veto or drawdown breach.
 */
function Shield({ state }: { state: "ok" | "veto" | "breach" | "killed" }) {
  const reduce = useReducedMotion();
  const bad = state !== "ok";
  const color = bad ? "#f43f5e" : "#10b981";
  return (
    <motion.div className="relative h-[86px] w-[76px] flex-none" style={{ perspective: 500 }}
      animate={state === "veto" && !reduce ? { x: [0, -5, 5, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.5 }}>
      <motion.div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}
        animate={reduce ? {} : { rotateY: [-18, 18, -18] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
        {[0, 1, 2].map((layer) => (
          <svg key={layer} viewBox="0 0 76 86" className="absolute inset-0" style={{ transform: `translateZ(${layer * 7}px)`, opacity: 1 - layer * 0.3 }}>
            <path d="M38 3 L71 15 L68 50 Q60 72 38 83 Q16 72 8 50 L5 15 Z" fill={layer === 0 ? `${color}22` : "none"}
              stroke={color} strokeWidth={layer === 0 ? 2.4 : 1} style={{ filter: `drop-shadow(0 0 ${8 - layer * 2}px ${color})` }} />
          </svg>
        ))}
        <svg viewBox="0 0 76 86" className="absolute inset-0" style={{ transform: "translateZ(22px)" }}>
          {bad ? (
            <motion.path d="M38 12 L32 30 L42 38 L30 54 L40 62 L35 76 M42 38 L54 44 M32 30 L20 34"
              fill="none" stroke="#fecdd3" strokeWidth="1.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
          ) : (
            <motion.path d="M25 44 L34 53 L52 33" fill="none" stroke="#a7f3d0" strokeWidth="3.5" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
          )}
        </svg>
      </motion.div>
    </motion.div>
  );
}

export function AccountPanel() {
  const { kpis, equity, agents, beginner, execution, mt5 } = useStore();
  const [vetoFlash, setVetoFlash] = useState(false);
  const vetoAt = agents.Guardian.vetoAt;
  useEffect(() => {
    if (!vetoAt) return;
    setVetoFlash(true);
    const t = window.setTimeout(() => setVetoFlash(false), 2600);
    return () => window.clearTimeout(t);
  }, [vetoAt]);

  if (!kpis) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
    );
  }
  const breach = kpis.drawdown_pct >= kpis.dd_limit_pct;
  const shieldState = kpis.kill_switch ? "killed" : breach ? "breach" : vetoFlash ? "veto" : "ok";
  const pnlColor = kpis.today_pnl >= 0 ? "text-profit" : "text-loss";
  const acct = execution === "mt5" ? mt5?.account : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Glass glow={shieldState === "ok" ? "profit" : "loss"} className="p-4" tour="kpis">
        <div className="flex items-start gap-4">
          <Shield state={shieldState} />
          <div className="min-w-0 flex-1">
            <div className="label">{acct ? `MT5 · ${acct.login}` : "Paper account"} · AEGIS {shieldState === "ok" ? "armed" : shieldState.toUpperCase()}</div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none text-white">
              <CountUp value={kpis.equity} format={(v) => usd(v)} />
            </div>
            <div className={`mt-1.5 text-sm font-semibold ${pnlColor}`}>
              <CountUp value={kpis.today_pnl} format={(v) => `${v >= 0 ? "+" : ""}${usd(v)}`} /> today
              <span className="ml-1.5 text-xs opacity-80">({kpis.today_pnl_pct >= 0 ? "+" : ""}{kpis.today_pnl_pct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { k: "Win rate", v: `${kpis.win_rate.toFixed(1)}%`, sub: `${kpis.trades} trades` },
            { k: "Open risk", v: usd(kpis.open_risk, kpis.open_risk < 10 ? 2 : 0), sub: `${kpis.open_risk_pct.toFixed(2)}%` },
            { k: "Balance", v: usd(kpis.balance, kpis.balance < 100 ? 2 : 0), sub: execution === "mt5" ? "MT5" : "paper" },
          ].map((x) => (
            <div key={x.k} className="rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{x.k}</div>
              <div className="num text-sm font-semibold text-slate-100">{x.v}</div>
              {!beginner && <div className="text-[10px] text-slate-500">{x.sub}</div>}
            </div>
          ))}
        </div>
      </Glass>

      <Glass className="px-4 pb-3 pt-3" title="Equity curve">
        <div className="mt-2"><EquityCurve points={equity.slice(-400)} color="auto" height={78} /></div>
      </Glass>

      <div className="grid grid-cols-[128px_1fr] gap-3">
        <Glass className="p-3" title="Daily drawdown">
          <div className="mt-2"><DrawdownGauge value={kpis.drawdown_pct} limit={kpis.dd_limit_pct} /></div>
        </Glass>
        <Glass glow="loss" className="p-3"><KillSwitch /></Glass>
      </div>
    </div>
  );
}
