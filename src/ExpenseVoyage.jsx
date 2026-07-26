import { useState, useEffect, useMemo, createContext, useContext } from "react";
import {
  Plane, MapPin, Calendar, Users, Wallet, Receipt,
  ArrowRightLeft, Plus, X, Trash2, ChevronLeft, Check,
  TrendingUp, TrendingDown, Download, Loader2, Compass, ScrollText,
  AlertCircle, Search, SlidersHorizontal, RefreshCw, UserCheck, Repeat, NotebookPen, Globe, Camera, LogIn, Link
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { createPortfolioDemo } from "./demoData";

/* ---------------------------------------------------------------- */
/*  Constants & helpers                                             */
/* ---------------------------------------------------------------- */

const CATEGORIES = [
  { id: "food", label: "Food & Drink", color: "#c1552c" },
  { id: "stay", label: "Stay", color: "#1f4741" },
  { id: "transport", label: "Transport", color: "#b8860b" },
  { id: "activities", label: "Activities", color: "#6b4c9a" },
  { id: "shopping", label: "Shopping", color: "#2d7a8c" },
  { id: "other", label: "Other", color: "#8a8578" },
];
const catInfo = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[5];

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 5);
const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
const yearOf = (iso) => new Date(iso + "T00:00:00").getFullYear();

const CURRENCIES = [
  { code: "INR", symbol: "₹" }, { code: "USD", symbol: "$" }, { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" }, { code: "JPY", symbol: "¥" }, { code: "AED", symbol: "AED " },
  { code: "THB", symbol: "฿" }, { code: "AUD", symbol: "A$" },
];
const CurrencyContext = createContext("₹");
function useMoney() {
  const symbol = useContext(CurrencyContext);
  return (n) => `${symbol}${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function computeBalances(participants, expenses, settlements) {
  const bal = {};
  participants.forEach((p) => (bal[p.id] = 0));
  expenses.forEach((e) => {
    bal[e.paidBy] = (bal[e.paidBy] || 0) + Number(e.amount);
    (e.splits || []).forEach(({ id, amount }) => (bal[id] = (bal[id] || 0) - Number(amount)));
  });
  settlements.forEach((s) => {
    bal[s.from] = (bal[s.from] || 0) + Number(s.amount);
    bal[s.to] = (bal[s.to] || 0) - Number(s.amount);
  });
  return bal;
}

function directDebts(expenses) {
  const pair = {};
  expenses.forEach((e) => {
    (e.splits || []).forEach(({ id, amount }) => {
      if (id === e.paidBy) return;
      const key = `${id}->${e.paidBy}`;
      pair[key] = (pair[key] || 0) + Number(amount);
    });
  });
  return Object.entries(pair)
    .filter(([, v]) => v > 0.5)
    .map(([key, amount]) => {
      const [from, to] = key.split("->");
      return { from, to, amount };
    });
}

function simplifyDebts(balanceMap) {
  const creditors = Object.entries(balanceMap)
    .filter(([, v]) => v > 0.5)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = Object.entries(balanceMap)
    .filter(([, v]) => v < -0.5)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt);
  const tx = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    tx.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.5) i++;
    if (creditors[j].amt < 0.5) j++;
  }
  return tx;
}

/* Updated local storage helpers */
async function storageGet(key) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

async function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Storage set failed", e);
  }
}

async function storageDelete(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error("Storage delete failed", e);
  }
}

function compressImage(file, maxSide = 640, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSide) { height = (height * maxSide) / width; width = maxSide; }
        else if (height > maxSide) { width = (width * maxSide) / height; height = maxSide; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------- */
/*  Root Component: ExpenseVoyage                                   */
/* ---------------------------------------------------------------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genTripCode() {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

export default function ExpenseVoyage() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [trips, setTrips] = useState([]);
  const [tripData, setTripData] = useState({});
  const [activeTripId, setActiveTripId] = useState(null);
  const [tab, setTab] = useState("overview");
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [prefillCode, setPrefillCode] = useState("");
  const [yearFilter, setYearFilter] = useState("All");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    (async () => {
      const acc = await storageGet("account");
      setAccount(acc || null);
      const list = await storageGet("trips-list");
      setTrips(list || []);
      const prefs = await storageGet("ui-prefs");
      if (prefs?.dark) setDark(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) { setPrefillCode(code.toUpperCase()); setShowJoin(true); }
      } catch { /* URL not accessible */ }
      setLoading(false);
    })();
  }, []);

  const toggleDark = () => {
    setDark((prev) => {
      storageSet("ui-prefs", { dark: !prev });
      return !prev;
    });
  };

  const login = async (acc) => {
    setAccount(acc);
    await storageSet("account", acc);
  };

  const logout = async () => {
    setAccount(null);
    setActiveTripId(null);
    await storageDelete("account");
  };

  const loadPortfolioDemo = async () => {
    const demoAccount = account || { id: "portfolio-alex", name: "Alex Johnson", email: "alex@expensevoyage.demo" };
    const { trip, data } = createPortfolioDemo(demoAccount);
    const latest = (await storageGet("trips-list")) || trips;
    const next = [...latest.filter((item) => item.id !== trip.id), trip];
    setAccount(demoAccount);
    await storageSet("account", demoAccount);
    await persistTrips(next);
    await persistTripData(trip.id, data);
    setActiveTripId(trip.id);
    setTab("overview");
  };

  useEffect(() => {
    if (!activeTripId) return;
    if (tripData[activeTripId]) return;
    (async () => {
      const d = await storageGet(`trip-data:${activeTripId}`);
      setTripData((prev) => ({
        ...prev,
        [activeTripId]: d || { expenses: [], settlements: [] },
      }));
    })();
  }, [activeTripId, tripData]);

  const refresh = async () => {
    const list = await storageGet("trips-list");
    setTrips(list || []);
    if (activeTripId) {
      const d = await storageGet(`trip-data:${activeTripId}`);
      setTripData((prev) => ({ ...prev, [activeTripId]: d || { expenses: [], settlements: [] } }));
    }
  };

  const persistTrips = async (next) => {
    setTrips(next);
    await storageSet("trips-list", next);
  };

  const persistTripData = async (tripId, next) => {
    setTripData((prev) => ({ ...prev, [tripId]: next }));
    await storageSet(`trip-data:${tripId}`, next);
  };

  const createTrip = async (trip) => {
    const owner = { id: account.id, name: account.name, email: account.email };
    const full = { ...trip, code: genTripCode(), ownerEmail: account.email, participants: [owner, ...trip.participants] };
    const latest = (await storageGet("trips-list")) || trips;
    const next = [...latest, full];
    await persistTrips(next);
    await persistTripData(full.id, { expenses: [], settlements: [] });
    setActiveTripId(full.id);
    setTab("overview");
    setShowNewTrip(false);
  };

  const joinTrip = async (tripId) => {
    const latest = (await storageGet("trips-list")) || trips;
    const target = latest.find((t) => t.id === tripId || t.code === tripId);
    if (!target) return;
    const already = target.participants.some((p) => p.email && p.email === account.email);
    const next = already
      ? latest
      : latest.map((t) => t.id === target.id ? { ...t, participants: [...t.participants, { id: account.id, name: account.name, email: account.email }] } : t);
    await persistTrips(next);
    setShowJoin(false);
    setPrefillCode("");
    setActiveTripId(target.id);
    setTab("overview");
    try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ }
  };

  const myTrips = useMemo(
    () => trips.filter((t) => account && t.participants.some((p) => p.email === account.email)),
    [trips, account]
  );

  const activeTrip = myTrips.find((t) => t.id === activeTripId);
  const activeData = tripData[activeTripId] || { expenses: [], settlements: [] };

  const years = useMemo(() => {
    const ys = new Set(myTrips.map((t) => yearOf(t.startDate)));
    return ["All", ...Array.from(ys).sort((a, b) => b - a)];
  }, [myTrips]);

  const filteredTrips = myTrips.filter(
    (t) => yearFilter === "All" || yearOf(t.startDate) === Number(yearFilter)
  );

  if (loading) {
    return (
      <Shell dark={dark}>
        <div className="flex items-center justify-center h-64 gap-3" style={{ color: "var(--ink-soft)" }}>
          <Loader2 className="animate-spin" size={20} />
          <span style={{ fontFamily: "var(--font-body)" }}>Opening the ledger…</span>
        </div>
      </Shell>
    );
  }

  if (!account) {
    return (
      <Shell dark={dark}>
        <LoginScreen onLogin={login} onLoadDemo={loadPortfolioDemo} />
      </Shell>
    );
  }

  return (
    <Shell dark={dark}>
      {!activeTrip ? (
        <Dashboard
          trips={filteredTrips}
          allTrips={myTrips}
          tripData={tripData}
          years={years}
          yearFilter={yearFilter}
          setYearFilter={setYearFilter}
          onOpen={(id) => { setActiveTripId(id); setTab("overview"); }}
          onNewTrip={() => setShowNewTrip(true)}
          onLoadDemo={loadPortfolioDemo}
          onJoin={() => setShowJoin(true)}
          dark={dark}
          onToggleDark={toggleDark}
          onRefresh={refresh}
          account={account}
          onLogout={logout}
        />
      ) : (
        <TripView
          trip={activeTrip}
          data={activeData}
          tab={tab}
          setTab={setTab}
          account={account}
          onBack={() => setActiveTripId(null)}
          onUpdateData={(next) => persistTripData(activeTrip.id, next)}
          onUpdateTrip={(next) => persistTrips(trips.map((t) => (t.id === next.id ? next : t)))}
          onRefresh={refresh}
        />
      )}

      {showNewTrip && (
        <NewTripModal onClose={() => setShowNewTrip(false)} onCreate={createTrip} />
      )}
      {showJoin && (
        <JoinTripModal
          initialCode={prefillCode}
          onClose={() => { setShowJoin(false); setPrefillCode(""); }}
          onJoin={joinTrip}
        />
      )}
    </Shell>
  );
}

/* ---------------------------------------------------------------- */
/*  Missing Component Implementations                               */
/* ---------------------------------------------------------------- */

function LoginScreen({ onLogin, onLoadDemo }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim() && email.trim()) {
      onLogin({ id: uid(), name: name.trim(), email: email.trim().toLowerCase() });
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", background: "var(--paper)", padding: 28, borderRadius: 20, border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--terracotta)", marginBottom: 8 }}>
        <Compass size={24} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>Expense Voyage</span>
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--teal)", margin: "0 0 8px" }}>Welcome Back</h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>Enter your details to manage your trip expenses.</p>
      <form onSubmit={handleSubmit}>
        <Field label="Your Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Johnson" style={inputStyle} required />
        </Field>
        <Field label="Email Address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@example.com" style={inputStyle} required />
        </Field>
        <button type="submit" className="tl-btn" style={{
          width: "100%", marginTop: 10, background: "var(--teal)", color: "white", border: "none",
          padding: "12px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 15,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8
        }}>
          <LogIn size={16} /> Start Exploring
        </button>
      </form>
      <button type="button" onClick={onLoadDemo} className="tl-btn" style={{
        width: "100%", marginTop: 10, background: "transparent", color: "var(--terracotta)", border: "1px solid var(--terracotta)",
        padding: "11px", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 14,
      }}>Load portfolio demo</button>
    </div>
  );
}

function JoinTripModal({ initialCode, onClose, onJoin }) {
  const [code, setCode] = useState(initialCode || "");

  return (
    <ModalShell onClose={onClose} title="Join a Trip" icon={<Link size={18} />}>
      <Field label="Trip Code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. X7K9P2"
          style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}
        />
      </Field>
      <button
        disabled={!code.trim()}
        onClick={() => onJoin(code.trim())}
        className="tl-btn"
        style={{
          width: "100%", marginTop: 8, background: code.trim() ? "var(--teal)" : "var(--line)",
          color: "var(--paper)", border: "none", padding: "12px", borderRadius: 12, fontWeight: 700,
          cursor: code.trim() ? "pointer" : "not-allowed", fontSize: 15,
        }}
      >
        Join Trip
      </button>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/*  Shell / theme                                                   */
/* ---------------------------------------------------------------- */

function Shell({ children, dark }) {
  const light = {
    "--cream": "#f4efe3", "--paper": "#fbf8f0", "--ink": "#20302c", "--ink-soft": "#5f6b60",
    "--teal": "#1f4741", "--terracotta": "#c1552c", "--gold": "#b8860b", "--line": "#d9d0ba",
  };
  const darkVars = {
    "--cream": "#161f1c", "--paper": "#1c2622", "--ink": "#eee7d6", "--ink-soft": "#9aa39a",
    "--teal": "#5fb8a8", "--terracotta": "#e0794a", "--gold": "#d4a12f", "--line": "#33403a",
  };
  return (
    <div
      style={{
        ...(dark ? darkVars : light),
        "--font-display": "'Fraunces', serif",
        "--font-body": "'Instrument Sans', sans-serif",
        "--font-mono": "'Space Mono', monospace",
        background: "var(--cream)",
        minHeight: "100vh",
        color: "var(--ink)",
        fontFamily: "var(--font-body)",
        position: "relative",
        transition: "background .2s ease, color .2s ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Instrument+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        .tl-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .tl-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }
        .tl-btn { transition: transform .12s ease, box-shadow .12s ease; }
        .tl-btn:active { transform: scale(0.97); }
        .tl-card { transition: box-shadow .18s ease, transform .18s ease; }
        .tl-card:hover { box-shadow: 0 10px 24px -12px rgba(31,71,65,0.35); transform: translateY(-2px); }
        .tl-fade-in { animation: tlFadeIn .35s ease both; }
        @keyframes tlFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        input, select, textarea { font-family: var(--font-body); }
      `}</style>
      <div style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(31,71,65,0.06) 1px, transparent 0)",
        backgroundSize: "18px 18px",
        minHeight: "100vh",
        padding: "28px 20px 60px",
      }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Dashboard                                                        */
/* ---------------------------------------------------------------- */

function Dashboard({ trips, allTrips, tripData, years, yearFilter, setYearFilter, onOpen, onNewTrip, onLoadDemo, onJoin, dark, onToggleDark, onRefresh, account, onLogout }) {
  const totalSpent = allTrips.reduce((sum, t) => {
    const d = tripData[t.id];
    if (!d) return sum;
    return sum + d.expenses.reduce((s, e) => s + Number(e.amount), 0);
  }, 0);

  return (
    <div className="tl-fade-in">
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--terracotta)" }}>
            <Compass size={20} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase" }}>Expense Voyage</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 600, margin: "6px 0 0", color: "var(--teal)" }}>
            Where the money went
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 6, maxWidth: 480 }}>
            Logged in as <b>{account.name}</b>. Track your journeys, splits, and balances effortlessly.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onRefresh} className="tl-btn" title="Refresh" style={{
            width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--paper)",
            color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><RefreshCw size={16} /></button>
          <button onClick={onToggleDark} className="tl-btn" title="Toggle dark mode" style={{
            width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--paper)",
            color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>{dark ? "☀" : "☾"}</button>
          <button onClick={onJoin} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", color: "var(--ink)",
            border: "1px solid var(--line)", padding: "12px 18px", borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 14
          }}>
            <Link size={16} /> Join Trip
          </button>
          <button onClick={onNewTrip} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 8, background: "var(--teal)", color: "var(--paper)",
            border: "none", padding: "12px 20px", borderRadius: 999, fontWeight: 600, cursor: "pointer",
            fontSize: 14, boxShadow: "0 6px 18px -6px rgba(31,71,65,0.5)",
          }}>
            <Plus size={17} /> New Trip
          </button>
          <button onClick={onLogout} className="tl-btn" style={{
            background: "none", border: "none", color: "var(--terracotta)", cursor: "pointer", fontSize: 13, fontWeight: 600, marginLeft: 6
          }}>Logout</button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 26 }}>
        <StatCard icon={<Plane size={18} />} label="Trips logged" value={allTrips.length} accent="var(--teal)" />
        <StatCard icon={<Wallet size={18} />} label="Total spent" value={`₹${totalSpent.toLocaleString("en-IN")}`} accent="var(--terracotta)" mono />
        <StatCard icon={<Users size={18} />} label="Travellers tracked" value={new Set(allTrips.flatMap((t) => t.participants.map((p) => p.name))).size} accent="var(--gold)" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, overflowX: "auto" }} className="tl-scroll">
        {years.map((y) => (
          <button key={y} onClick={() => setYearFilter(y)} style={{
            padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${yearFilter === y ? "var(--teal)" : "var(--line)"}`,
            background: yearFilter === y ? "var(--teal)" : "transparent",
            color: yearFilter === y ? "var(--paper)" : "var(--ink-soft)", whiteSpace: "nowrap",
          }}>{y}</button>
        ))}
      </div>

      {trips.length === 0 ? (
        <EmptyState onNewTrip={onNewTrip} onLoadDemo={onLoadDemo} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 16 }}>
          {trips.map((t) => {
            const d = tripData[t.id];
            const spent = d ? d.expenses.reduce((s, e) => s + Number(e.amount), 0) : null;
            const sym = t.currency?.symbol || "₹";
            return (
              <button key={t.id} onClick={() => onOpen(t.id)} className="tl-card tl-btn" style={{
                textAlign: "left", background: "var(--paper)", border: "1px solid var(--line)",
                borderRadius: 16, padding: 18, cursor: "pointer", position: "relative", overflow: "hidden",
              }}>
                <div style={{ position: "absolute", top: 12, right: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>
                  {yearOf(t.startDate)}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--teal)", marginBottom: 4 }}>{t.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", fontSize: 13, marginBottom: 12 }}>
                  <MapPin size={13} /> {t.destination || "Unnamed destination"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", fontSize: 12.5, marginBottom: 14 }}>
                  <Calendar size={13} /> {fmtDate(t.startDate)} — {fmtDate(t.endDate)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: -6 }}>
                    {t.participants.slice(0, 4).map((p, idx) => (
                      <Avatar key={p.id} name={p.name} style={{ marginLeft: idx === 0 ? 0 : -8 }} />
                    ))}
                    {t.participants.length > 4 && (
                      <span style={{ marginLeft: -8, fontSize: 11, color: "var(--ink-soft)", alignSelf: "center" }}>+{t.participants.length - 4}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--terracotta)" }}>
                    {spent === null ? "…" : `${sym}${spent.toLocaleString("en-IN")}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onNewTrip, onLoadDemo }) {
  return (
    <div style={{
      border: "2px dashed var(--line)", borderRadius: 18, padding: "60px 24px", textAlign: "center", color: "var(--ink-soft)",
    }}>
      <Plane size={26} style={{ marginBottom: 10, color: "var(--terracotta)" }} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--teal)", margin: "0 0 6px" }}>No trips logged yet</p>
      <p style={{ marginBottom: 16, fontSize: 14 }}>Start a trip to begin tracking who paid, who owes, and how much.</p>
      <button onClick={onNewTrip} className="tl-btn" style={{
        background: "var(--terracotta)", color: "white", border: "none", padding: "10px 18px",
        borderRadius: 999, fontWeight: 600, cursor: "pointer",
      }}>Log your first trip</button>
      <button onClick={onLoadDemo} className="tl-btn" style={{
        marginLeft: 10, background: "transparent", color: "var(--teal)", border: "1px solid var(--teal)", padding: "10px 18px",
        borderRadius: 999, fontWeight: 600, cursor: "pointer",
      }}>Load sample trip</button>
    </div>
  );
}

function StatCard({ icon, label, value, accent, mono }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: accent, marginBottom: 8 }}>{icon}
        <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-soft)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

function Avatar({ name, style }) {
  const colors = ["#c1552c", "#1f4741", "#b8860b", "#6b4c9a", "#2d7a8c"];
  const idx = (name || "?").charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", background: colors[idx], color: "white",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
      border: "2px solid var(--paper)", ...style,
    }} title={name}>{(name || "?")[0]?.toUpperCase()}</div>
  );
}

function NewTripModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [budget, setBudget] = useState("");
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [people, setPeople] = useState([]);
  const [personInput, setPersonInput] = useState("");

  const addPerson = () => {
    const val = personInput.trim();
    if (!val) return;
    setPeople([...people, { id: uid(), name: val }]);
    setPersonInput("");
  };

  const canCreate = name.trim() && people.length > 0;

  return (
    <ModalShell onClose={onClose} title="Log a new trip" icon={<Plane size={18} />}>
      <Field label="Trip name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa with the crew" style={inputStyle} />
      </Field>
      <Field label="Destination">
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Goa, India" style={inputStyle} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Start date" style={{ flex: 1 }}>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="End date" style={{ flex: 1 }}>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Budget (optional)" style={{ flex: 1 }}>
          <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 25000" style={inputStyle} />
        </Field>
        <Field label="Currency" style={{ width: 130 }}>
          <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} style={inputStyle}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Travellers">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={personInput}
            onChange={(e) => setPersonInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPerson())}
            placeholder="Add a name and hit enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addPerson} className="tl-btn" style={smallBtnStyle}><Plus size={16} /></button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {people.map((p) => (
            <span key={p.id} style={chipStyle}>
              <Avatar name={p.name} />
              {p.name}
              <X size={13} style={{ cursor: "pointer" }} onClick={() => setPeople(people.filter((x) => x.id !== p.id))} />
            </span>
          ))}
        </div>
      </Field>

      <button
        disabled={!canCreate}
        onClick={() => onCreate({ id: uid(), name: name.trim(), destination: destination.trim(), startDate, endDate, budget: Number(budget) || 0, currency: CURRENCIES.find((c) => c.code === currencyCode), participants: people, createdAt: Date.now() })}
        className="tl-btn"
        style={{
          width: "100%", marginTop: 8, background: canCreate ? "var(--teal)" : "var(--line)",
          color: "var(--paper)", border: "none", padding: "12px", borderRadius: 12, fontWeight: 700,
          cursor: canCreate ? "pointer" : "not-allowed", fontSize: 15,
        }}
      >
        Start tracking
      </button>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/*  Trip view                                                        */
/* ---------------------------------------------------------------- */

function TripView({ trip, data, tab, setTab, onBack, onUpdateData, onUpdateTrip, onRefresh }) {
  const balances = useMemo(
    () => computeBalances(trip.participants, data.expenses, data.settlements),
    [trip.participants, data.expenses, data.settlements]
  );
  const suggestions = useMemo(() => simplifyDebts(balances), [balances]);
  const nameOf = (id) => trip.participants.find((p) => p.id === id)?.name || "—";
  const totalSpent = data.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const symbol = trip.currency?.symbol || "₹";

  const [whoAmI, setWhoAmI] = useState(null);
  const [showIdentity, setShowIdentity] = useState(false);
  const [identityLoaded, setIdentityLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storageGet(`whoami:${trip.id}`);
      if (saved && trip.participants.some((p) => p.id === saved)) setWhoAmI(saved);
      else setShowIdentity(true);
      setIdentityLoaded(true);
    })();
  }, [trip.id, trip.participants]);

  const chooseIdentity = async (participantId) => {
    setWhoAmI(participantId);
    setShowIdentity(false);
    await storageSet(`whoami:${trip.id}`, participantId);
  };

  const addExpense = (exp) => onUpdateData({ ...data, expenses: [...data.expenses, exp] });
  const deleteExpense = (id) => onUpdateData({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });
  const addSettlement = (s) => onUpdateData({ ...data, settlements: [...data.settlements, s] });
  const addPerson = (name, id = uid()) => onUpdateTrip({ ...trip, participants: [...trip.participants, { id, name }] });
  const updateNotes = (notes) => onUpdateData({ ...data, notes });
  const addItineraryItem = (item) => onUpdateData({ ...data, itinerary: [...(data.itinerary || []), item] });
  const deleteItineraryItem = (id) => onUpdateData({ ...data, itinerary: (data.itinerary || []).filter((i) => i.id !== id) });

  return (
    <CurrencyContext.Provider value={symbol}>
      <div className="tl-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <button onClick={onBack} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
            color: "var(--ink-soft)", cursor: "pointer", fontSize: 13, padding: 0,
          }}>
            <ChevronLeft size={16} /> All trips
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onRefresh} className="tl-btn" title="Pull in changes" style={{
              width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--paper)",
              color: "var(--ink-soft)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}><RefreshCw size={14} /></button>
            <button onClick={() => setShowIdentity(true)} className="tl-btn" style={{
              display: "flex", alignItems: "center", gap: 6, background: "var(--paper)", border: "1px solid var(--line)",
              borderRadius: 999, padding: "5px 12px 5px 5px", cursor: "pointer", fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600,
            }}>
              {identityLoaded && whoAmI ? (
                <><Avatar name={nameOf(whoAmI)} style={{ width: 20, height: 20, fontSize: 10 }} /> {nameOf(whoAmI)} · switch</>
              ) : (
                <><UserCheck size={14} /> Who are you?</>
              )}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--teal)", margin: 0, fontWeight: 600 }}>{trip.name}</h1>
            <div style={{ display: "flex", gap: 14, color: "var(--ink-soft)", fontSize: 13, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><MapPin size={13} />{trip.destination || "—"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Calendar size={13} />{fmtDate(trip.startDate)} – {fmtDate(trip.endDate)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Globe size={13} />{trip.currency?.code || "INR"}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Link size={13} />Code: <b>{trip.code}</b></span>
            </div>
          </div>
          <div style={{ display: "flex", gap: -6 }}>
            {trip.participants.map((p, idx) => (
              <Avatar key={p.id} name={p.name} style={{ marginLeft: idx === 0 ? 0 : -8 }} />
            ))}
            <AddPersonInline onAdd={addPerson} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid var(--line)", overflowX: "auto" }} className="tl-scroll">
          {[
            { id: "overview", label: "Overview", icon: <TrendingUp size={14} /> },
            { id: "ledger", label: "Ledger", icon: <ScrollText size={14} /> },
            { id: "settle", label: "Settle Up", icon: <ArrowRightLeft size={14} /> },
            { id: "notes", label: "Notes & Itinerary", icon: <NotebookPen size={14} /> },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid var(--terracotta)" : "2px solid transparent", whiteSpace: "nowrap",
              color: tab === t.id ? "var(--teal)" : "var(--ink-soft)", fontWeight: 600, cursor: "pointer", fontSize: 13.5,
            }}>{t.icon}{t.label}</button>
          ))}
        </div>

        {tab === "overview" && <Overview trip={trip} data={data} balances={balances} nameOf={nameOf} totalSpent={totalSpent} />}
        {tab === "ledger" && (
          <Ledger trip={trip} data={data} nameOf={nameOf} whoAmI={whoAmI} onAddExpense={addExpense} onDeleteExpense={deleteExpense} />
        )}
        {tab === "settle" && (
          <SettleUp trip={trip} data={data} balances={balances} suggestions={suggestions} nameOf={nameOf} onSettle={addSettlement} />
        )}
        {tab === "notes" && (
          <NotesTab data={data} onUpdateNotes={updateNotes} onAddItem={addItineraryItem} onDeleteItem={deleteItineraryItem} />
        )}

        {showIdentity && (
          <IdentityModal
            trip={trip}
            current={whoAmI}
            onClose={() => setShowIdentity(false)}
            onChoose={chooseIdentity}
            onAddPerson={addPerson}
          />
        )}
      </div>
    </CurrencyContext.Provider>
  );
}

function IdentityModal({ trip, current, onClose, onChoose, onAddPerson }) {
  const [newName, setNewName] = useState("");
  return (
    <ModalShell onClose={onClose} title="Who are you?" icon={<UserCheck size={18} />}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -6, marginBottom: 14 }}>
        This trip is shared — pick your name so expenses you add are logged under you.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {trip.participants.map((p) => (
          <button key={p.id} onClick={() => onChoose(p.id)} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, cursor: "pointer",
            border: `1.5px solid ${current === p.id ? "var(--teal)" : "var(--line)"}`,
            background: current === p.id ? "var(--teal)" : "transparent",
            color: current === p.id ? "white" : "var(--ink)", fontWeight: 600, fontSize: 14, textAlign: "left",
          }}>
            <Avatar name={p.name} /> {p.name} {current === p.id && <Check size={14} style={{ marginLeft: "auto" }} />}
          </button>
        ))}
      </div>
      <Field label="Not on the list? Add yourself">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Your name" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={() => {
            if (!newName.trim()) return;
            const id = uid();
            onAddPerson(newName.trim(), id);
            onChoose(id);
            setNewName("");
          }} className="tl-btn" style={smallBtnStyle}><Plus size={16} /></button>
        </div>
      </Field>
    </ModalShell>
  );
}

function AddPersonInline({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="tl-btn" style={{
        width: 26, height: 26, borderRadius: "50%", border: "1.5px dashed var(--line)", background: "transparent",
        color: "var(--ink-soft)", cursor: "pointer", marginLeft: -8, display: "flex", alignItems: "center", justifyContent: "center",
      }} title="Add traveller"><Plus size={13} /></button>
    );
  return (
    <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
      <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="Name"
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); setOpen(false); } }}
        style={{ ...inputStyle, width: 100, padding: "5px 8px", fontSize: 12 }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } setOpen(false); }} style={smallBtnStyle}><Check size={14} /></button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Overview tab                                                     */
/* ---------------------------------------------------------------- */

function Overview({ trip, data, balances, nameOf, totalSpent }) {
  const fmt = useMoney();
  const perPerson = trip.participants.length ? totalSpent / trip.participants.length : 0;
  const catTotals = CATEGORIES.map((c) => ({
    name: c.label, value: data.expenses.filter((e) => e.category === c.id).reduce((s, e) => s + Number(e.amount), 0), color: c.color,
  })).filter((c) => c.value > 0);

  const byDate = {};
  data.expenses.forEach((e) => { byDate[e.date] = (byDate[e.date] || 0) + Number(e.amount); });
  const barData = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, amt]) => ({
    date: fmtDate(date).slice(0, 6), amt,
  }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 18 }}>
        <StatCard icon={<Wallet size={16} />} label="Total spent" value={fmt(totalSpent)} accent="var(--terracotta)" mono />
        <StatCard icon={<Users size={16} />} label="Avg per person" value={fmt(perPerson)} accent="var(--teal)" mono />
        <StatCard icon={<Receipt size={16} />} label="Expenses logged" value={data.expenses.length} accent="var(--gold)" />
      </div>

      {trip.budget > 0 && (
        <BudgetBar spent={totalSpent} budget={trip.budget} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, marginBottom: 24 }}>
        <Panel title="Spend by category">
          {catTotals.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catTotals} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {catTotals.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, justifyContent: "center" }}>
            {catTotals.map((c) => (
              <span key={c.name} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 5, color: "var(--ink-soft)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, display: "inline-block" }} />{c.name}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Spend over time">
          {barData.length === 0 ? <NoData /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-soft)" }} width={40} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="amt" fill="var(--teal)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Who stands where">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {trip.participants.map((p) => {
            const b = balances[p.id] || 0;
            const positive = b >= 0;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", borderBottom: "1px dashed var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={p.name} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontWeight: 700, color: positive ? "var(--teal)" : "var(--terracotta)" }}>
                  {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {fmt(Math.abs(b))} {positive ? "to receive" : "owes"}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function BudgetBar({ spent, budget }) {
  const fmt = useMoney();
  const pct = Math.min((spent / budget) * 100, 100);
  const over = spent > budget;
  const nearLimit = !over && pct >= 85;
  const barColor = over ? "var(--terracotta)" : nearLimit ? "var(--gold)" : "var(--teal)";
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "var(--teal)" }}>Budget</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: barColor }}>
          {fmt(spent)} / {fmt(budget)}
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "var(--cream)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 999, transition: "width .3s ease" }} />
      </div>
      {over && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--terracotta)", fontSize: 12.5, fontWeight: 600 }}>
          <AlertCircle size={14} /> Over budget by {fmt(spent - budget)}
        </div>
      )}
      {nearLimit && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--gold)", fontSize: 12.5, fontWeight: 600 }}>
          <AlertCircle size={14} /> Close to the limit — {fmt(budget - spent)} left
        </div>
      )}
    </div>
  );
}

function NoData() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "var(--ink-soft)", fontSize: 13 }}>No expenses yet</div>;
}

function Panel({ title, children }) {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "var(--teal)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Ledger tab                                                      */
/* ---------------------------------------------------------------- */

function exportCSV(trip, rows) {
  const header = ["Year", "Date", "Time", "For what", "Category", "Spent", "Received", "Running Balance"];
  const lines = rows.map((r) => [
    r.year, r.date, r.time || "", `"${(r.title || "").replace(/"/g, '""')}"`,
    r.category ? catInfo(r.category).label : "", r.spent || 0, r.received || 0, r.running.toFixed(2),
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.name.replace(/\s+/g, "_")}_ledger.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Ledger({ trip, data, nameOf, whoAmI, onAddExpense, onDeleteExpense }) {
  const fmt = useMoney();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const allRows = useMemo(() => {
    const expenseRows = data.expenses.map((e) => {
      const isEqual = !e.splitMode || e.splitMode === "equal";
      const breakdown = (e.splits || [])
        .map((s) => `${nameOf(s.id)} ${fmt(s.amount)}`)
        .join(" · ");
      const loggedBy = e.addedBy && e.addedBy !== e.paidBy ? ` · logged by ${nameOf(e.addedBy)}` : "";
      return {
        id: e.id, kind: "expense", date: e.date, time: e.time, title: e.title,
        category: e.category, spent: Number(e.amount), received: 0, receipt: e.receipt || null,
        detail: `Paid by ${nameOf(e.paidBy)} · ${isEqual ? `split equally ${e.splitAmong.length} ways` : `split unequally — ${breakdown}`}${loggedBy}`,
        raw: e,
      };
    });
    const settleRows = data.settlements.map((s) => ({
      id: s.id, kind: "settlement", date: s.date, time: s.time || "—", title: `${nameOf(s.from)} settled up with ${nameOf(s.to)}`,
      category: null, spent: 0, received: Number(s.amount), detail: "Settlement", raw: s,
    }));
    const all = [...expenseRows, ...settleRows].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    let running = 0;
    return all.map((r) => { running += r.received - r.spent; return { ...r, running, year: yearOf(r.date) }; });
  }, [data, nameOf, fmt]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (search.trim() && !r.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (catFilter !== "all" && r.category !== catFilter) return false;
      if (personFilter !== "all") {
        const involved = r.kind === "expense"
          ? [r.raw.paidBy, ...(r.raw.splits || []).map((s) => s.id)]
          : [r.raw.from, r.raw.to];
        if (!involved.includes(personFilter)) return false;
      }
      return true;
    });
  }, [allRows, search, catFilter, personFilter]);

  const totalSpent = data.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalReceived = data.settlements.reduce((s, e) => s + Number(e.amount), 0);
  const filtersActive = search.trim() || catFilter !== "all" || personFilter !== "all";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--ink-soft)" }}>
          <span>Total spent: <b style={{ fontFamily: "var(--font-mono)", color: "var(--terracotta)" }}>{fmt(totalSpent)}</b></span>
          <span>Total received: <b style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}>{fmt(totalReceived)}</b></span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowFilters((v) => !v)} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 6, background: showFilters ? "var(--teal)" : "var(--paper)",
            color: showFilters ? "white" : "var(--ink-soft)", border: "1px solid var(--line)",
            padding: "9px 14px", borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 13,
          }}><SlidersHorizontal size={14} /> Filters{filtersActive ? " •" : ""}</button>
          <button onClick={() => exportCSV(trip, rows)} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--paper)", color: "var(--ink-soft)",
            border: "1px solid var(--line)", padding: "9px 14px", borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 13,
          }}><Download size={14} /> Export CSV</button>
          <button onClick={() => setShowForm(true)} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--terracotta)", color: "white", border: "none",
            padding: "9px 16px", borderRadius: 999, fontWeight: 600, cursor: "pointer", fontSize: 13,
          }}><Plus size={15} /> Add expense</button>
        </div>
      </div>

      {showFilters && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 180px", background: "var(--cream)", borderRadius: 10, padding: "6px 10px" }}>
            <Search size={14} style={{ color: "var(--ink-soft)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search descriptions…"
              style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, width: "100%", color: "var(--ink)" }} />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
            <option value="all">Everyone</option>
            {trip.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {filtersActive && (
            <button onClick={() => { setSearch(""); setCatFilter("all"); setPersonFilter("all"); }} style={{
              background: "none", border: "none", color: "var(--terracotta)", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>Clear</button>
          )}
        </div>
      )}

      {rows.length === 0 ? <NoData /> : (
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 14 }} className="tl-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, background: "var(--paper)" }}>
            <thead>
              <tr style={{ background: "var(--cream)", textAlign: "left" }}>
                {["Year", "Date", "Time", "For what", "Category", "Spent", "Received", "Balance", "Receipt", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", fontWeight: 700, color: "var(--ink-soft)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--ink-soft)" }}>{r.year}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--ink-soft)" }}>{r.time || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{r.detail}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.category ? (
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: catInfo(r.category).color + "22", color: catInfo(r.category).color, fontWeight: 700 }}>
                        {catInfo(r.category).label}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: r.spent ? "var(--terracotta)" : "var(--ink-soft)" }}>{r.spent ? fmt(r.spent) : "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: r.received ? "var(--teal)" : "var(--ink-soft)" }}>{r.received ? fmt(r.received) : "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(r.running)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.receipt ? (
                      <img src={r.receipt} alt="Receipt" onClick={() => setLightbox(r.receipt)} style={{
                        width: 32, height: 32, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: "1px solid var(--line)",
                      }} />
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.kind === "expense" && (
                      <Trash2 size={14} style={{ cursor: "pointer", color: "var(--ink-soft)" }} onClick={() => onDeleteExpense(r.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: "fixed", inset: 0, background: "rgba(20,26,24,0.8)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 60, padding: 24, cursor: "zoom-out",
        }}>
          <img src={lightbox} alt="Receipt full size" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        </div>
      )}

      {showForm && (
        <AddExpenseModal
          trip={trip}
          whoAmI={whoAmI}
          onClose={() => setShowForm(false)}
          onAdd={(expOrArray) => {
            if (Array.isArray(expOrArray)) expOrArray.forEach(onAddExpense);
            else onAddExpense(expOrArray);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function AddExpenseModal({ trip, whoAmI, onClose, onAdd }) {
  const fmt = useMoney();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [paidBy, setPaidBy] = useState(whoAmI || trip.participants[0]?.id || "");
  const [splitAmong, setSplitAmong] = useState(trip.participants.map((p) => p.id));
  const [splitMode, setSplitMode] = useState("equal");
  const [customAmounts, setCustomAmounts] = useState({});
  const [customPercents, setCustomPercents] = useState({});
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(nowTime());
  const [repeat, setRepeat] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState("weekly");
  const [repeatCount, setRepeatCount] = useState(3);
  const [receipt, setReceipt] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const handleReceiptUpload = async (file) => {
    if (!file) return;
    setReceiptBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setReceipt(dataUrl);
    } catch {
      // silently ignore
    } finally {
      setReceiptBusy(false);
    }
  };

  const toggleSplit = (id) => setSplitAmong((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const amt = Number(amount) || 0;

  const splits = useMemo(() => {
    if (splitMode === "equal") {
      const share = splitAmong.length ? amt / splitAmong.length : 0;
      return splitAmong.map((id) => ({ id, amount: share }));
    }
    if (splitMode === "percent") {
      return splitAmong.map((id) => ({ id, amount: (amt * (Number(customPercents[id]) || 0)) / 100 }));
    }
    return splitAmong.map((id) => ({ id, amount: Number(customAmounts[id]) || 0 }));
  }, [splitMode, splitAmong, amt, customAmounts, customPercents]);

  const splitSum = splits.reduce((s, x) => s + x.amount, 0);
  const percentSum = splitAmong.reduce((s, id) => s + (Number(customPercents[id]) || 0), 0);
  const amountsMatch = splitMode === "equal" || Math.abs(splitSum - amt) < 0.5;

  const canAdd = title.trim() && amt > 0 && paidBy && splitAmong.length > 0 && amountsMatch;

  const setCustom = (setter) => (id, val) => setter((prev) => ({ ...prev, [id]: val }));

  const shiftDate = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    if (repeatFreq === "daily") d.setDate(d.getDate() + n);
    else if (repeatFreq === "weekly") d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  };

  const buildExpenses = () => {
    const base = { title: title.trim(), amount: amt, category, paidBy, splitAmong, splitMode, time, addedBy: whoAmI || null, receipt: receipt || null };
    if (!repeat) return { ...base, id: uid(), date, splits };
    const count = Math.max(1, Math.min(52, Number(repeatCount) || 1));
    return Array.from({ length: count }, (_, i) => ({
      ...base, id: uid(), date: shiftDate(date, i), splits, receipt: i === 0 ? base.receipt : null,
    }));
  };

  return (
    <ModalShell onClose={onClose} title="Log an expense" icon={<Receipt size={18} />}>
      <Field label="What was it for">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner at the beach shack" style={inputStyle} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Amount" style={{ flex: 1 }}>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" style={inputStyle} />
        </Field>
        <Field label="Category" style={{ flex: 1 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Date" style={{ flex: 1 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Time" style={{ flex: 1 }}>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <Field label="Paid by">
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} style={inputStyle}>
          {trip.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>

      <Field label="Split among">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {trip.participants.map((p) => (
            <button key={p.id} onClick={() => toggleSplit(p.id)} type="button" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              border: `1.5px solid ${splitAmong.includes(p.id) ? "var(--teal)" : "var(--line)"}`,
              background: splitAmong.includes(p.id) ? "var(--teal)" : "transparent",
              color: splitAmong.includes(p.id) ? "white" : "var(--ink-soft)", fontSize: 13, fontWeight: 600,
            }}>{splitAmong.includes(p.id) && <Check size={12} />}{p.name}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[
            { id: "equal", label: "Equal" },
            { id: "unequal", label: "Unequal amounts" },
            { id: "percent", label: "By percentage" },
          ].map((m) => (
            <button key={m.id} type="button" onClick={() => setSplitMode(m.id)} style={{
              flex: 1, padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${splitMode === m.id ? "var(--terracotta)" : "var(--line)"}`,
              background: splitMode === m.id ? "var(--terracotta)" : "transparent",
              color: splitMode === m.id ? "white" : "var(--ink-soft)",
            }}>{m.label}</button>
          ))}
        </div>

        {splitMode === "equal" && splitAmong.length > 0 && amt > 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{fmt(amt / splitAmong.length)} per person</div>
        )}

        {splitMode === "unequal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {splitAmong.map((id) => {
              const p = trip.participants.find((x) => x.id === id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 90, fontSize: 13, fontWeight: 600 }}>{p?.name}</span>
                  <input type="number" value={customAmounts[id] || ""} placeholder="0"
                    onChange={(e) => setCustom(setCustomAmounts)(id, e.target.value)}
                    style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }} />
                </div>
              );
            })}
            <div style={{ fontSize: 12, marginTop: 4, color: amountsMatch ? "var(--teal)" : "var(--terracotta)", fontWeight: 700 }}>
              {fmt(splitSum)} of {fmt(amt)} allocated {amountsMatch ? "✓" : `(${fmt(amt - splitSum)} left)`}
            </div>
          </div>
        )}

        {splitMode === "percent" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {splitAmong.map((id) => {
              const p = trip.participants.find((x) => x.id === id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 90, fontSize: 13, fontWeight: 600 }}>{p?.name}</span>
                  <input type="number" value={customPercents[id] || ""} placeholder="0"
                    onChange={(e) => setCustom(setCustomPercents)(id, e.target.value)}
                    style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, width: 90 }} />
                  <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>% = {fmt((amt * (Number(customPercents[id]) || 0)) / 100)}</span>
                </div>
              );
            })}
            <div style={{ fontSize: 12, marginTop: 4, color: Math.abs(percentSum - 100) < 0.5 ? "var(--teal)" : "var(--terracotta)", fontWeight: 700 }}>
              {percentSum.toFixed(1)}% of 100% allocated
            </div>
          </div>
        )}
      </Field>

      <Field label="Receipt photo (optional)">
        {!receipt ? (
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            border: "1.5px dashed var(--line)", borderRadius: 12, padding: "16px", cursor: "pointer",
            color: "var(--ink-soft)", fontSize: 13, fontWeight: 600,
          }}>
            {receiptBusy ? <><Loader2 size={15} className="animate-spin" /> Processing…</> : <><Camera size={15} /> Upload a photo</>}
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => handleReceiptUpload(e.target.files?.[0])} />
          </label>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={receipt} alt="Receipt" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} />
            <button type="button" onClick={() => setReceipt(null)} className="tl-btn" style={{
              display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--line)",
              borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontSize: 12.5, color: "var(--terracotta)", fontWeight: 700,
            }}><X size={13} /> Remove</button>
          </div>
        )}
      </Field>

      <Field label="Repeat this expense">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: repeat ? 10 : 0 }}>
          <button type="button" onClick={() => setRepeat((v) => !v)} className="tl-btn" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
            border: `1.5px solid ${repeat ? "var(--teal)" : "var(--line)"}`, background: repeat ? "var(--teal)" : "transparent",
            color: repeat ? "white" : "var(--ink-soft)", fontSize: 12.5, fontWeight: 700,
          }}><Repeat size={13} />{repeat ? "Repeating" : "One-off"}</button>
        </div>
        {repeat && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={repeatFreq} onChange={(e) => setRepeatFreq(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input type="number" min={1} max={52} value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)}
              style={{ ...inputStyle, width: 80 }} />
            <span style={{ fontSize: 12, color: "var(--ink-soft)", whiteSpace: "nowrap" }}>times</span>
          </div>
        )}
      </Field>

      <button disabled={!canAdd}
        onClick={() => onAdd(buildExpenses())}
        className="tl-btn" style={{
          width: "100%", marginTop: 8, background: canAdd ? "var(--terracotta)" : "var(--line)", color: "white",
          border: "none", padding: "12px", borderRadius: 12, fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed", fontSize: 15,
        }}>{repeat ? `Add ${Math.max(1, Math.min(52, Number(repeatCount) || 1))} expenses` : "Add to ledger"}</button>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/*  Settle up tab                                                     */
/* ---------------------------------------------------------------- */

function SettleUp({ trip, data, balances, suggestions, nameOf, onSettle }) {
  const fmt = useMoney();
  const direct = useMemo(() => directDebts(data.expenses), [data.expenses]);

  return (
    <div>
      <Panel title="Who owes who — full breakdown">
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: -4, marginBottom: 12 }}>
          Every debt created by every expense, listed plainly — before any netting.
        </p>
        {direct.length === 0 ? (
          <div style={{ color: "var(--ink-soft)", fontSize: 13, padding: "6px 0" }}>No debts yet — log an expense to see who owes what.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {direct.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, padding: "6px 2px" }}>
                <span>
                  <b style={{ color: "var(--terracotta)" }}>{nameOf(d.from)}</b> owes{" "}
                  <b style={{ color: "var(--teal)" }}>{nameOf(d.to)}</b>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(d.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div style={{ height: 18 }} />

      <Panel title="Net balance per person">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {trip.participants.map((p) => {
            const b = balances[p.id] || 0;
            const positive = b >= 0.5, settled = Math.abs(b) < 0.5;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={p.name} /> <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: settled ? "var(--ink-soft)" : positive ? "var(--teal)" : "var(--terracotta)" }}>
                  {settled ? "settled up" : positive ? `is owed ${fmt(b)}` : `owes ${fmt(Math.abs(b))}`}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div style={{ height: 18 }} />

      <Panel title="Suggested settlements (fewest payments)">
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: -4, marginBottom: 12 }}>
          The direct debts above, netted down to the smallest number of payments to settle everyone up.
        </p>
        {suggestions.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--teal)", fontWeight: 600, padding: "8px 0" }}>
            <Check size={16} /> Everyone is squared up.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: "1px dashed var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <Avatar name={nameOf(s.from)} /> <b>{nameOf(s.from)}</b>
                  <ArrowRightLeft size={14} style={{ color: "var(--ink-soft)" }} />
                  <Avatar name={nameOf(s.to)} /> <b>{nameOf(s.to)}</b>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--terracotta)" }}>{fmt(s.amount)}</span>
                  <button onClick={() => onSettle({ id: uid(), from: s.from, to: s.to, amount: s.amount, date: todayISO(), time: nowTime() })}
                    className="tl-btn" style={{
                      fontSize: 12, fontWeight: 700, background: "var(--teal)", color: "white", border: "none",
                      padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                    }}>Mark settled</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div style={{ height: 18 }} />

      <Panel title="Settlement history">
        {data.settlements.length === 0 ? <NoData /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.settlements.slice().reverse().map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 4px", borderBottom: "1px dashed var(--line)" }}>
                <span>{nameOf(s.from)} → {nameOf(s.to)}</span>
                <span style={{ color: "var(--ink-soft)" }}>{fmtDate(s.date)} {s.time}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Notes & itinerary tab                                            */
/* ---------------------------------------------------------------- */

function NotesTab({ data, onUpdateNotes, onAddItem, onDeleteItem }) {
  const [notes, setNotes] = useState(data.notes || "");
  const [dayLabel, setDayLabel] = useState("");
  const [activity, setActivity] = useState("");
  const [itemDate, setItemDate] = useState(todayISO());

  useEffect(() => setNotes(data.notes || ""), [data.notes]);

  const itinerary = (data.itinerary || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  const addItem = () => {
    if (!activity.trim()) return;
    onAddItem({ id: uid(), date: itemDate, dayLabel: dayLabel.trim(), activity: activity.trim() });
    setActivity("");
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Panel title="Trip notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onUpdateNotes(notes)}
            placeholder="Packing list, hotel booking codes, flight numbers, anything worth keeping handy…"
            style={{ ...inputStyle, minHeight: 220, resize: "vertical", fontFamily: "var(--font-body)", lineHeight: 1.6 }}
          />
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>Saves automatically when you click away.</div>
        </Panel>

        <Panel title="Itinerary">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <input value={dayLabel} onChange={(e) => setDayLabel(e.target.value)} placeholder="Day 1 (optional)" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={activity} onChange={(e) => setActivity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                placeholder="Arrive at hotel, check in…" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addItem} className="tl-btn" style={smallBtnStyle}><Plus size={16} /></button>
            </div>
          </div>

          {itinerary.length === 0 ? <NoData /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {itinerary.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderLeft: "2px solid var(--terracotta)", paddingLeft: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
                      {fmtDate(item.date)}{item.dayLabel ? ` · ${item.dayLabel}` : ""}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.activity}</div>
                  </div>
                  <Trash2 size={14} style={{ cursor: "pointer", color: "var(--ink-soft)", marginTop: 4 }} onClick={() => onDeleteItem(item.id)} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Shared UI bits                                                   */
/* ---------------------------------------------------------------- */

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--line)",
  background: "var(--cream)", color: "var(--ink)", fontSize: 14, outline: "none",
};
const smallBtnStyle = {
  width: 38, borderRadius: 10, border: "none", background: "var(--teal)", color: "white", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const chipStyle = {
  display: "flex", alignItems: "center", gap: 6, background: "var(--cream)", border: "1px solid var(--line)",
  borderRadius: 999, padding: "4px 10px 4px 4px", fontSize: 13, fontWeight: 600,
};

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, icon, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(32,48,44,0.45)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 50, padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="tl-fade-in" style={{
        background: "var(--paper)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 440,
        maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, color: "var(--teal)" }}>
            {icon}{title}
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--ink-soft)" }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
