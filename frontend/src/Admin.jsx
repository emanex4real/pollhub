import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

export default function Admin({ token, onBack }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [newOption, setNewOption] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([api("/admin/stats", { token }), api("/admin/users", { token })]);
      setStats(s);
      setUsers(u);
    } catch (err) {
      setNote(err.message);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(path, method, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      const res = await api(path, { method, body, token });
      setNote(res.message || "Done");
      await load();
    } catch (err) {
      setNote(err.message);
    }
  }

  if (!stats) return <div className="card">{note || "Loading..."}</div>;

  const max = Math.max(1, ...stats.per_option.map((o) => o.votes));

  return (
    <>
      <h1>Admin dashboard</h1>
      <p><button className="link" onClick={onBack}>&larr; Back to voting</button></p>
      {note && <p className="note">{note}</p>}

      <div className="stats">
        <div className="stat"><strong>{stats.users}</strong><span>Users</span></div>
        <div className="stat"><strong>{stats.votes}</strong><span>Votes saved</span></div>
        <div className="stat"><strong>{stats.votes_last_hour}</strong><span>Last hour</span></div>
        <div className="stat"><strong>{stats.queue_pending}</strong><span>Waiting in queue</span></div>
        <div className={"stat" + (stats.queue_failed ? " warn" : "")}>
          <strong>{stats.queue_failed}</strong><span>Failed votes</span>
        </div>
      </div>

      <div className="card">
        <h2>Votes per option</h2>
        {stats.per_option.map((o) => (
          <div key={o.id} className="bar-row admin-row">
            <span>{o.name}</span>
            <div className="bar"><div style={{ width: `${(o.votes / max) * 100}%` }} /></div>
            <strong>{o.votes}</strong>
            <button className="link danger" onClick={() => act(`/admin/options/${o.id}`, "DELETE", null, `Delete "${o.name}"?`)}>Delete</button>
          </div>
        ))}
        <form className="inline" onSubmit={(e) => { e.preventDefault(); act("/admin/options", "POST", { name: newOption }); setNewOption(""); }}>
          <input placeholder="New option" value={newOption} onChange={(e) => setNewOption(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </div>

      <div className="card">
        <h2>Operations</h2>
        <div className="options">
          <button disabled={!stats.queue_failed} onClick={() => act("/admin/retry-failed", "POST")}>Retry failed votes</button>
          <button className="danger-btn" onClick={() => act("/admin/reset", "POST", null, "Delete ALL votes and let everyone vote again?")}>Reset election</button>
        </div>
      </div>

      <div className="card">
        <h2>Recent votes</h2>
        {stats.recent.length === 0 ? <p>No votes yet.</p> : (
          <table>
            <thead><tr><th>User</th><th>Voted for</th><th>When</th></tr></thead>
            <tbody>
              {stats.recent.map((v, i) => (
                <tr key={i}><td>{v.username}</td><td>{v.option}</td><td>{new Date(v.time).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Users ({users.length})</h2>
        <table>
          <thead><tr><th>Username</th><th>Role</th><th>Voted</th><th>Joined</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.is_admin ? "Admin" : "User"}</td>
                <td>{u.has_voted ? "Yes" : "No"}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
