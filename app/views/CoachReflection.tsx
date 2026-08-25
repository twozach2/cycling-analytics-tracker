import type { CoachIntentionReflection, ReflectionCandidate } from "@/lib/coach-reflections";

type ReflectionState = "idle" | "loading" | "linking" | "ready" | "error";

const modeLabel: Record<CoachIntentionReflection["adaptation"]["nextMode"], string> = {
  rest: "Rest / optional movement",
  recovery: "Recovery / easy route",
  endurance: "Aerobic endurance",
  tempo: "Tempo exploration",
};

const dateLabel = (dateIso: string) => new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const minutesLabel = (seconds: number) => `${Math.max(0, Math.round(seconds / 60))} min`;

export function CoachReflection({
  reflection,
  history,
  candidates,
  awaitingReason,
  state,
  onChooseRide,
}: {
  reflection: CoachIntentionReflection | null;
  history: CoachIntentionReflection[];
  candidates: ReflectionCandidate[];
  awaitingReason: string;
  state: ReflectionState;
  onChooseRide: (rideId: string) => Promise<void>;
}) {
  return <>
    <section className={`intention-reflection panel full-width ${reflection ? "complete" : "awaiting"}`}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Post-ride reflection</span>
          <h2>{reflection?.headline ?? (state === "loading" ? "Looking for today’s ride…" : "Your saved ride idea is ready to reconnect")}</h2>
          <p>{reflection?.summary ?? awaitingReason}</p>
        </div>
        <span className={`confidence-badge confidence-${reflection?.evidenceConfidence ?? "low"}`}>{reflection ? `${reflection.evidenceConfidence} evidence` : state}</span>
      </div>

      {reflection ? <>
        <div className="reflection-context-line">
          <span><small>Saved idea</small><strong>{reflection.routeName} · {reflection.intentionTitle}</strong></span>
          <span><small>Completed ride</small><strong>{reflection.rideName}</strong></span>
          <span><small>Linked with</small><strong>{reflection.matchConfidence} confidence</strong></span>
        </div>
        <div className="reflection-observation-grid">
          {reflection.observations.map((observation) => <article key={observation.label}>
            <span>{observation.label}</span>
            <strong>{observation.value}</strong>
            <p>{observation.detail}</p>
          </article>)}
        </div>
        <div className="reflection-interpretation-grid">
          <article><span>What stayed close</span>{reflection.whatMatched.map((item) => <p key={item}><i>+</i>{item}</p>)}</article>
          <article><span>What changed on the road</span>{reflection.whatVaried.map((item) => <p key={item}><i>↗</i>{item}</p>)}</article>
        </div>
        <div className="reflection-encouragement"><span>Coach’s note</span><strong>{reflection.encouragement}</strong></div>
        <div className="adaptation-change">
          <div><span>Saved idea</span><strong>{modeLabel[reflection.adaptation.beforeMode]}</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>Next ride lens</span><strong>{modeLabel[reflection.adaptation.nextMode]}</strong></div>
          <p>{reflection.adaptation.summary}</p>
        </div>
        <details className="reflection-evidence-detail">
          <summary>Evidence, limitations, and why the plan adapted</summary>
          <div><strong>Why this ride was linked</strong><p>{reflection.matchRationale}</p></div>
          <div><strong>Why the next lens changed</strong>{reflection.adaptation.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>
          <div><strong>Current limits</strong>{reflection.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</div>
          <small>{reflection.version} · {reflection.adaptation.version} · deterministic local analytics</small>
        </details>
      </> : <div className="reflection-awaiting-body">
        <strong>{state === "error" ? "The reflection service is temporarily unavailable." : "No result is being forced."}</strong>
        <p>{awaitingReason || "Once the ride imports, this card will connect it to the saved idea and explain the next adjustment."}</p>
        {candidates.length > 0 && <div className="reflection-candidates">
          <span>Choose the ride you meant</span>
          {candidates.map((candidate) => <button type="button" key={candidate.id} disabled={state === "linking"} onClick={() => void onChooseRide(candidate.id)}>
            <strong>{candidate.name}</strong>
            <small>{minutesLabel(candidate.movingTimeSeconds)} · {candidate.trainingType} · {candidate.environment}</small>
          </button>)}
        </div>}
      </div>}
    </section>

    {history.length > 0 && <section className="adaptation-feed panel full-width">
      <div className="section-heading"><div><span className="eyebrow">What changed and why</span><h2>Your adaptation history</h2><p>A local, auditable record of ride-driven changes—not a compliance log.</p></div><span className="small-badge">{history.length} saved</span></div>
      <div className="adaptation-feed-list">
        {history.map((item) => <article key={`${item.rideIdeaId}-${item.rideId}-${item.createdAt}`}>
          <time dateTime={item.dateIso}>{dateLabel(item.dateIso)}</time>
          <div><strong>{item.rideName}</strong><span>{item.routeName} · {item.intentionTitle}</span><p>{item.adaptation.summary}</p></div>
          <div className="adaptation-feed-shift"><small>Idea</small><strong>{modeLabel[item.adaptation.beforeMode]}</strong><i>→</i><small>Next</small><strong>{modeLabel[item.adaptation.nextMode]}</strong></div>
        </article>)}
      </div>
    </section>}
  </>;
}
