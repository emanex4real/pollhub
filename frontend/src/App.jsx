import { useEffect, useState } from "react";
import { api } from "./api.js";
import Admin from "./Admin.jsx";

// ---- Customise the ballot here ----
const ORG_NAME = "PollHub";
const ELECTION_TITLE = "Community Election 2026";
const INSTRUCTIONS =
  "Choose one option, review your selection, then cast your vote. Each voter may vote once, and a submitted vote cannot be changed.";
const SHOW_RESULTS_AFTER_VOTING = true;

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem("session")); } catch { return null; }
}
function saveSession(s) {
  try {
    if (s) sessionStorage.setItem("session", JSON.stringify(s));
    else sessionStorage.removeItem("session");
  } catch { /* storage not available */ }
}

function Steps({ current }) {
  const labels = ["Sign in", "Choose", "Review", "Done"];
  return (
    <ol className="steps" aria-label="Voting progress">
      {labels.map((label, i) => (
        <li key={label} className={i < current ? "done" : i === current ? "current" : ""}
            aria-current={i === current ? "step" : undefined}>
          <span className="dot">{i < current ? "✓" : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function AuthForm({ onLogin, notice }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await api("/register", { method: "POST", body: { username, password } });
      onLogin(await api("/login", { method: "POST", body: { username, password } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2>{mode === "login" ? "Voter sign-in" : "Register to vote"}</h2>
      <p className="muted">
        {mode === "login" ? "Sign in to receive your ballot." : "Create your voter account, then you can vote."}
      </p>
      {notice && <p className="alert" role="alert">{notice}</p>}
      <label htmlFor="username">Username</label>
      <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" placeholder="At least 8 characters"
             autoComplete={mode === "login" ? "current-password" : "new-password"}
             value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Register and sign in"}
      </button>
      <button type="button" className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
        {mode === "login" ? "First time? Register to vote" : "Already registered? Sign in"}
      </button>
    </form>
  );
}

function Ballot({ options, loadError, selected, onSelect, onNext }) {
  return (
    <section className="panel ballot">
      <span className="tag">Official ballot</span>
      <fieldset className="choices">
        <legend>Select one option</legend>
        {loadError && <p className="alert" role="alert">{loadError}</p>}
        {!loadError && options.length === 0 && <p className="muted">Loading the ballot...</p>}
        {options.map((o) => (
          <label key={o.id} className={"choice" + (selected === o.id ? " selected" : "")}>
            <input type="radio" name="option" value={o.id} checked={selected === o.id} onChange={() => onSelect(o.id)} />
            <span className="mark" aria-hidden="true" />
            <span className="name">{o.name}</span>
          </label>
        ))}
      </fieldset>
      <button className="primary" disabled={selected == null} onClick={onNext}>Review my choice</button>
    </section>
  );
}

function Review({ option, busy, error, onBack, onSubmit }) {
  return (
    <section className="panel">
      <h2>Review your vote</h2>
      <p className="muted">Please check your selection. After you submit, it cannot be changed.</p>
      <div className="review-choice">
        <span>You are voting for</span>
        <strong>{option ? option.name : ""}</strong>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="row">
        <button className="secondary" onClick={onBack} disabled={busy}>Go back</button>
        <button className="primary" onClick={onSubmit} disabled={busy}>{busy ? "Submitting..." : "Cast my vote"}</button>
      </div>
    </section>
  );
}

function Done({ already, votedAt }) {
  return (
    <section className="panel receipt" aria-live="polite">
      <div className="check" aria-hidden="true">✓</div>
      <h2>{already ? "You have already voted" : "Your vote has been received"}</h2>
      <p className="muted">
        {already
          ? "Our records show you have already voted in this election. Thank you for taking part."
          : `Thank you for voting. Your choice was submitted on ${votedAt}.`}
      </p>
    </section>
  );
}

function Results() {
  const [data, setData] = useState({ results: [], total: 0 });
  useEffect(() => {
    const load = () => api("/results").then(setData).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="panel">
      <h2>Live results ({data.total} votes)</h2>
      {data.results.map((r) => (
        <div key={r.id} className="bar-row">
          <span>{r.name}</span>
          <div className="bar"><div style={{ width: data.total ? `${(r.votes / data.total) * 100}%` : 0 }} /></div>
          <strong>{r.votes}</strong>
        </div>
      ))}
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [options, setOptions] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null);
  const [stage, setStage] = useState("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [already, setAlready] = useState(false);
  const [votedAt, setVotedAt] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    api("/options").then(setOptions).catch(() => setLoadError("The ballot could not be loaded. Please refresh the page."));
  }, []);

  function handleLogin(data) {
    saveSession(data);
    setSession(data);
    setNotice("");
    setStage("choose");
    setSelected(null);
    setAlready(false);
  }

  function logout(message = "") {
    saveSession(null);
    setSession(null);
    setShowAdmin(false);
    setStage("choose");
    setSelected(null);
    setAlready(false);
    setError("");
    setNotice(message);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("/vote", { method: "POST", body: { option_id: selected }, token: session.token });
      setVotedAt(new Date().toLocaleString());
      setAlready(false);
      setStage("done");
    } catch (err) {
      if (/already voted/i.test(err.message)) {
        setAlready(true);
        setStage("done");
      } else if (/token|login required/i.test(err.message)) {
        logout("Your session expired. Please sign in again.");
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const adminView = Boolean(session && session.is_admin && showAdmin);
  const chosen = options.find((o) => o.id === selected);
  const step = !session ? 0 : stage === "choose" ? 1 : stage === "review" ? 2 : 3;

  return (
    <>
      <header className="site-header">
        <div className="brand"><span className="logo">✔</span>{ORG_NAME}</div>
        {session && (
          <div className="header-right">
            <span className="who">{session.username}</span>
            {session.is_admin && !adminView && <button onClick={() => setShowAdmin(true)}>Admin dashboard</button>}
            <button onClick={() => logout()}>Sign out</button>
          </div>
        )}
      </header>

      {adminView ? (
        <main className="wide">
          <Admin token={session.token} onBack={() => setShowAdmin(false)} />
        </main>
      ) : (
        <main className="page">
          <div className="hero">
            <h1>{ELECTION_TITLE}</h1>
            <p>{INSTRUCTIONS}</p>
          </div>
          <Steps current={step} />
          {!session && <AuthForm onLogin={handleLogin} notice={notice} />}
          {session && stage === "choose" && (
            <Ballot options={options} loadError={loadError} selected={selected}
                    onSelect={setSelected} onNext={() => setStage("review")} />
          )}
          {session && stage === "review" && (
            <Review option={chosen} busy={busy} error={error}
                    onBack={() => setStage("choose")} onSubmit={submit} />
          )}
          {session && stage === "done" && <Done already={already} votedAt={votedAt} />}
          {session && stage === "done" && SHOW_RESULTS_AFTER_VOTING && <Results />}
        </main>
      )}

      <footer className="site-footer">{ORG_NAME} · One person, one vote</footer>
    </>
  );
}
