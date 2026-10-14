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
  const resetToken = new URLSearchParams(window.location.hash.slice(1)).get("reset");
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function go(next) {
    setMode(next); setError(""); setInfo(""); setPassword(""); setConfirm("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        setInfo((await api("/forgot", { method: "POST", body: { email } })).message);
      } else if (mode === "reset") {
        if (password !== confirm) throw new Error("The two passwords do not match");
        await api("/reset", { method: "POST", body: { token: resetToken, password } });
        window.history.replaceState(null, "", window.location.pathname);
        go("login");
        setInfo("Password updated. Sign in with your new password.");
      } else {
        if (mode === "register") await api("/register", { method: "POST", body: { username, password, email } });
        onLogin(await api("/login", { method: "POST", body: { username, password } }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const titles = { login: "Voter sign-in", register: "Register to vote", forgot: "Reset your password", reset: "Choose a new password" };
  const hints = {
    login: "Sign in to receive your ballot.",
    register: "Create your voter account, then you can vote.",
    forgot: "Enter the email on your account and we will send you a reset link.",
    reset: "Pick a new password for your account.",
  };
  const showPassword = mode !== "forgot";
  const submitLabel = { login: "Sign in", register: "Register and sign in", forgot: "Send reset link", reset: "Save new password" }[mode];

  return (
    <form className="panel auth" onSubmit={submit}>
      <h2>{titles[mode]}</h2>
      <p className="muted">{hints[mode]}</p>
      {notice && <p className="alert" role="alert">{notice}</p>}
      {info && <p className="info" role="status">{info}</p>}
      {(mode === "login" || mode === "register") && (
        <>
          <label htmlFor="username">Username</label>
          <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </>
      )}
      {(mode === "register" || mode === "forgot") && (
        <>
          <label htmlFor="email">{mode === "register" ? "Email (optional, used to reset your password)" : "Email"}</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </>
      )}
      {showPassword && (
        <>
          <label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label>
          <input id="password" type="password" placeholder="At least 8 characters"
                 autoComplete={mode === "login" ? "current-password" : "new-password"}
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </>
      )}
      {mode === "reset" && (
        <>
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </>
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? "Please wait..." : submitLabel}</button>
      {mode === "login" && <button type="button" className="link" onClick={() => go("forgot")}>Forgot your password?</button>}
      {mode === "login" && <button type="button" className="link" onClick={() => go("register")}>First time? Register to vote</button>}
      {mode !== "login" && <button type="button" className="link" onClick={() => go("login")}>Back to sign in</button>}
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
        <main className={session ? "page" : "page landing"}>
          {!session ? (
            <>
              <div className="intro">
                <h1>{ELECTION_TITLE}</h1>
                <p className="lead">{INSTRUCTIONS}</p>
                <ul className="assurances">
                  <li><strong>One vote per voter</strong><span>Each account can vote once, so every result counts one person once.</span></li>
                  <li><strong>Review before you submit</strong><span>Check your choice on a summary screen before it becomes final.</span></li>
                  <li><strong>Live results</strong><span>See the standings as soon as you have voted.</span></li>
                </ul>
              </div>
              <AuthForm onLogin={handleLogin} notice={notice} />
            </>
          ) : (
            <>
              <div className="hero">
                <h1>{ELECTION_TITLE}</h1>
                <p>{INSTRUCTIONS}</p>
              </div>
              <Steps current={step} />
            </>
          )}
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
