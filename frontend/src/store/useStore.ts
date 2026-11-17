import { create } from "zustand";
import type {
  AgentName, AgentResult, Candle, CycleSummary, DeltaHealth, Instrument, Kpis, Mt5Deal, Mt5Health, Mt5LogRow, Mt5Position,
  PaperPosition, Params, Rules, SessionInfo, Toast, ViewId,
} from "../lib/types";
import { safeStorage } from "../config/social";

const store = safeStorage();
const persisted = (k: string, d: boolean) => {
  const v = store?.getItem(k);
  return v == null ? d : v === "1";
};

export interface AgentLive {
  last?: AgentResult;
  history: AgentResult[];
  pulse: number; // increments on every event (drives beam/orb animation)
  vetoAt: number;
}

interface State {
  // shell
  introDone: boolean;
  view: ViewId;
  beginner: boolean;
  sound: boolean;
  force2D: boolean;
  paletteOpen: boolean;
  wsConnected: boolean;
  selectedAgent: AgentName | null;
  instrument: Instrument;
  confettiKey: number;
  mt5Pulse: number;
  tourOpen: boolean;
  supportOpen: boolean;
  // data
  mode: string;
  dataSource: string;
  execution: string;
  banner: string | null;
  analystMode: string;
  model: string;
  kpis: Kpis | null;
  positions: (PaperPosition | Mt5Position)[];
  equity: { time: number; equity: number }[];
  session: SessionInfo | null;
  rules: Rules | null;
  params: Params | null;
  delta: DeltaHealth | null;
  mt5: Mt5Health | null;
  mt5Positions: Mt5Position[];
  mt5Deals: Mt5Deal[];
  mt5Log: Mt5LogRow[];
  confirmPhrase: string;
  mt5ModeEnv: string;
  lastCycle: Partial<Record<Instrument, CycleSummary>>;
  candles: Partial<Record<Instrument, Candle[]>>;
  agents: Record<AgentName, AgentLive>;
  ticker: AgentResult[];
  toasts: Toast[];
  backtestProgress: number;
  // actions
  set: (p: Partial<State>) => void;
  setView: (v: ViewId) => void;
  toggle: (k: "beginner" | "sound" | "force2D") => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  dropToast: (id: number) => void;
  onAgent: (r: AgentResult) => void;
  appendCandle: (i: Instrument, c: Candle) => void;
}

const emptyAgents = () =>
  Object.fromEntries(
    (["Scout", "Cartographer", "Hunter", "Analyst", "Guardian", "Executioner", "Chronicler"] as AgentName[]).map((n) => [
      n, { history: [], pulse: 0, vetoAt: 0 } as AgentLive,
    ]),
  ) as unknown as Record<AgentName, AgentLive>;

let toastId = 1;

export const useStore = create<State>((set, get) => ({
  introDone: true,
  view: "constellation",
  beginner: persisted("qp_beginner", true),
  sound: persisted("qp_sound", false),
  force2D: persisted("qp_force2d", false),
  paletteOpen: false,
  wsConnected: false,
  selectedAgent: null,
  instrument: "XAUUSD",
  confettiKey: 0,
  mt5Pulse: 0,
  tourOpen: false,
  supportOpen: false,
  mode: "DEMO",
  dataSource: "demo",
  execution: "paper",
  banner: null,
  analystMode: "mock",
  model: "",
  kpis: null,
  positions: [],
  equity: [],
  session: null,
  rules: null,
  params: null,
  delta: null,
  mt5: null,
  mt5Positions: [],
  mt5Deals: [],
  mt5Log: [],
  confirmPhrase: "I UNDERSTAND THE RISK",
  mt5ModeEnv: "demo_only",
  lastCycle: {},
  candles: {},
  agents: emptyAgents(),
  ticker: [],
  toasts: [],
  backtestProgress: 0,

  set: (p) => set(p),
  setView: (v) => set({ view: v, paletteOpen: false }),
  toggle: (k) => {
    const next = !get()[k];
    store?.setItem(k === "beginner" ? "qp_beginner" : k === "sound" ? "qp_sound" : "qp_force2d", next ? "1" : "0");
    set({ [k]: next } as Partial<State>);
  },
  pushToast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    window.setTimeout(() => get().dropToast(id), t.level === "error" ? 7000 : 4800);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  onAgent: (r) =>
    set((s) => {
      const cur = s.agents[r.agent];
      const live: AgentLive = {
        last: r,
        history: [r, ...cur.history].slice(0, 25),
        pulse: cur.pulse + 1,
        vetoAt: r.status === "veto" ? Date.now() : cur.vetoAt,
      };
      const interesting = r.status !== "skip" || r.agent === "Hunter";
      return {
        agents: { ...s.agents, [r.agent]: live },
        ticker: interesting ? [r, ...s.ticker].slice(0, 40) : s.ticker,
      };
    }),
  appendCandle: (i, c) =>
    set((s) => {
      const arr = s.candles[i];
      if (!arr) return {};
      const last = arr[arr.length - 1];
      if (last && last.time >= c.time) return {};
      return { candles: { ...s.candles, [i]: [...arr.slice(-1500), c] } };
    }),
}));
