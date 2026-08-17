import { FormEvent, useEffect, useState } from "react";

type FtpHistoryEntry = {
  id: string;
  effectiveAt: string;
  ftpWatts: number;
  source: string;
  notes: string;
  affectedRideCount: number;
};

type FtpHistoryPayload = {
  entries: FtpHistoryEntry[];
  currentFtpWatts: number | null;
  coverage: { totalRides: number; historicalRides: number; uncoveredRides: number; earliestRideAt: string | null };
  updatedRides?: number;
  error?: string;
};

type FtpHistoryEditorProps = {
  onChanged: (currentFtpWatts: number) => Promise<void>;
};

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(iso: string) {
  const date = iso.slice(0, 10);
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function FtpHistoryEditor({ onChanged }: FtpHistoryEditorProps) {
  const [data, setData] = useState<FtpHistoryPayload | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(localDateValue);
  const [ftpWatts, setFtpWatts] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/ftp-history", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as FtpHistoryPayload }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "FTP history could not be loaded.");
        setData(payload);
        setStatus("idle");
      })
      .catch((error) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "FTP history could not be loaded.");
      });
    return () => { active = false; };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEffectiveDate(localDateValue());
    setFtpWatts("");
    setNotes("");
  };

  const applyPayload = async (payload: FtpHistoryPayload) => {
    setData(payload);
    resetForm();
    if (payload.currentFtpWatts !== null) await onChanged(payload.currentFtpWatts);
    const updated = payload.updatedRides ?? 0;
    setMessage(updated === 1 ? "Updated 1 ride snapshot and its FTP-dependent metrics." : `Updated ${updated} ride snapshots and their FTP-dependent metrics.`);
    setStatus("idle");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/ftp-history", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, effectiveDate, ftpWatts: Number(ftpWatts), notes }),
      });
      const payload = await response.json() as FtpHistoryPayload;
      if (!response.ok) throw new Error(payload.error ?? "The FTP entry could not be saved.");
      await applyPayload(payload);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The FTP entry could not be saved.");
    }
  };

  const edit = (entry: FtpHistoryEntry) => {
    setEditingId(entry.id);
    setEffectiveDate(entry.effectiveAt.slice(0, 10));
    setFtpWatts(String(entry.ftpWatts));
    setNotes(entry.notes);
    setMessage("");
  };

  const remove = async (entry: FtpHistoryEntry) => {
    if (!window.confirm(`Remove the ${displayDate(entry.effectiveAt)} FTP breakpoint? Affected ride metrics will be recalculated from the remaining history.`)) return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/ftp-history", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const payload = await response.json() as FtpHistoryPayload;
      if (!response.ok) throw new Error(payload.error ?? "The FTP entry could not be removed.");
      await applyPayload(payload);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The FTP entry could not be removed.");
    }
  };

  const coverage = data?.coverage;
  return <section className="ftp-history-card panel">
    <div className="section-heading ftp-history-heading">
      <div><span className="eyebrow">Historical training context</span><h2>FTP history</h2><p>Set the FTP that was active from a date forward. The app recalculates ride snapshots, intensity factor, and training load—not recorded ride data.</p></div>
      {coverage && <span className="coverage-badge">{coverage.historicalRides}/{coverage.totalRides} rides dated</span>}
    </div>
    {coverage && coverage.uncoveredRides > 0 && <div className="ftp-coverage-note" role="note">
      <strong>{coverage.uncoveredRides} {coverage.uncoveredRides === 1 ? "ride is" : "rides are"} earlier than your first dated FTP.</strong>
      <span>Add a breakpoint on or before {coverage.earliestRideAt ? displayDate(coverage.earliestRideAt) : "your oldest ride"} to give the full history an explicit threshold.</span>
    </div>}
    <div className="ftp-history-layout">
      <form className="ftp-history-form" onSubmit={save}>
        <div className="ftp-form-title"><strong>{editingId ? "Edit breakpoint" : "Add a breakpoint"}</strong><span>Effective from the start of this date</span></div>
        <label><span>Effective date</span><input type="date" value={effectiveDate} max={localDateValue()} onChange={(event) => setEffectiveDate(event.target.value)} required /></label>
        <label><span>FTP</span><span className="ftp-watt-input"><input type="number" min="50" max="500" step="1" value={ftpWatts} onChange={(event) => setFtpWatts(event.target.value)} required /><em>W</em></span></label>
        <label className="ftp-note-field"><span>Why it changed <small>optional</small></span><input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Field test, training block, prior known value…" /></label>
        <div className="ftp-form-actions">
          {editingId && <button type="button" className="ghost-button" onClick={resetForm} disabled={status === "saving"}>Cancel</button>}
          <button type="submit" className="primary-button" disabled={status === "saving"}>{status === "saving" ? "Recalculating…" : editingId ? "Save changes" : "Add FTP"}</button>
        </div>
      </form>
      <div className="ftp-history-list" aria-busy={status === "loading"}>
        {status === "loading" && <div className="ftp-history-empty">Loading FTP history…</div>}
        {status !== "loading" && !data?.entries.length && <div className="ftp-history-empty">No dated FTP entries yet.</div>}
        {data?.entries.map((entry, index) => <article className={`ftp-history-entry ${editingId === entry.id ? "editing" : ""}`} key={entry.id}>
          <span className="ftp-history-marker" aria-hidden="true"><i /></span>
          <div className="ftp-entry-main"><span>{displayDate(entry.effectiveAt)}{index === 0 && <em>Current</em>}</span><strong>{entry.ftpWatts} <small>W</small></strong><p>{entry.notes || entry.source}</p></div>
          <div className="ftp-entry-impact"><strong>{entry.affectedRideCount}</strong><span>{entry.affectedRideCount === 1 ? "ride" : "rides"}</span></div>
          <div className="ftp-entry-actions"><button type="button" onClick={() => edit(entry)} disabled={status === "saving"}>Edit</button><button type="button" onClick={() => void remove(entry)} disabled={status === "saving" || data.entries.length === 1}>Remove</button></div>
        </article>)}
      </div>
    </div>
    <p className={`ftp-history-status ${status === "error" ? "error" : ""}`} aria-live="polite">{message || "Recorded power, heart rate, cadence, distance, and activity streams are never modified."}</p>
  </section>;
}
