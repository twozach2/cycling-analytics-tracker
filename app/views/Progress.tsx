import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonthlyProgress,
  buildProgressSummary,
  describeProgressSelection,
  filterProgressRides,
  PROGRESS_ANALYTICS_VERSION,
  type ProgressEnvironment,
  type ProgressRange,
  type ProgressRide,
} from "@/lib/progress";

type LineSeries = {
  key: string;
  label: string;
  tone: "lime" | "sky" | "coral" | "cream";
  unit: string;
  value: (ride: ProgressRide) => number | null;
};

const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const hoursLabel = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60).toString().padStart(2, "0")}m`;

function niceMaximum(maximum: number) {
  if (!Number.isFinite(maximum) || maximum <= 0) return 1;
  const roughStep = maximum / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = normalized <= 1 ? magnitude : normalized <= 2 ? 2 * magnitude : normalized <= 5 ? 5 * magnitude : 10 * magnitude;
  return Math.ceil(maximum / step) * step;
}

function ProgressLineChart({ rides, series, emptyMessage }: { rides: readonly ProgressRide[]; series: readonly LineSeries[]; emptyMessage: string }) {
  const plotStage = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(160);
  const startTime = rides.length ? Date.parse(rides[0].date) : 0;
  const endTime = rides.length ? Date.parse(rides.at(-1)!.date) : 0;
  const points = series.map((entry) => ({
    ...entry,
    points: rides.flatMap((ride) => {
      const value = entry.value(ride);
      if (value === null || !Number.isFinite(value) || value < 0) return [];
      const rideTime = Date.parse(ride.date);
      const x = endTime === startTime ? plotWidth / 2 : 2 + ((rideTime - startTime) / (endTime - startTime)) * (plotWidth - 4);
      return [{ ride, value, x }];
    }),
  }));
  const allPoints = points.flatMap((entry) => entry.points);
  useEffect(() => {
    const stage = plotStage.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const measuredWidth = Math.max(80, (width / height) * 46);
      setPlotWidth((current) => Math.abs(current - measuredWidth) < 0.25 ? current : measuredWidth);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [allPoints.length]);

  if (!allPoints.length) return <div className="progress-empty">{emptyMessage}</div>;
  const maximum = niceMaximum(Math.max(...allPoints.map((point) => point.value)));
  const datedPoints = allPoints.slice().sort((left, right) => Date.parse(left.ride.date) - Date.parse(right.ride.date));
  const firstDate = datedPoints[0].ride.date;
  const middleDate = datedPoints[Math.floor((datedPoints.length - 1) / 2)].ride.date;
  const finalDate = datedPoints.at(-1)!.ride.date;

  return <>
    <div className="progress-chart-legend">{points.map((entry) => <span className={`series-${entry.tone}`} key={entry.key}><i />{entry.label}<small>{entry.points.length}/{rides.length} rides</small></span>)}</div>
    <div className="progress-chart-frame">
      <div className="progress-y-axis" aria-hidden="true"><span>{maximum.toLocaleString()}</span><span>{(maximum / 2).toLocaleString()}</span><span>0</span></div>
      <div className="progress-plot">
        <div className="progress-plot-stage" ref={plotStage}>
          <svg viewBox={`0 0 ${plotWidth} 46`} preserveAspectRatio="none" role="img" aria-label={`${series.map((entry) => entry.label).join(" and ")} over ${rides.length} selected rides, shown on a zero-based scale`}>
            <line className="progress-grid-line" x1="0" y1="4" x2={plotWidth} y2="4" />
            <line className="progress-grid-line" x1="0" y1="23" x2={plotWidth} y2="23" />
            <line className="progress-grid-line" x1="0" y1="42" x2={plotWidth} y2="42" />
            {points.map((entry) => {
              const plotted = entry.points.map((point) => ({ ...point, y: 42 - (point.value / maximum) * 38 }));
              return <g className={`progress-series series-${entry.tone}`} key={entry.key}>
                {plotted.length > 1 && <polyline points={plotted.map((point) => `${point.x},${point.y}`).join(" ")} />}
                {plotted.map((point) => <circle cx={point.x} cy={point.y} r="1" key={`${entry.key}-${point.ride.id}`}><title>{point.ride.name} · {dateLabel(point.ride.date)} · {point.value.toFixed(point.value < 10 ? 2 : 0)} {entry.unit}</title></circle>)}
              </g>;
            })}
          </svg>
        </div>
        <div className="progress-x-axis" aria-hidden="true"><span>{dateLabel(firstDate)}</span><span>{dateLabel(middleDate)}</span><span>{dateLabel(finalDate)}</span></div>
      </div>
    </div>
  </>;
}

function ProgressStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <article><span>{label}</span><strong>{value}</strong>{unit && <small>{unit}</small>}</article>;
}

export function Progress({ rides }: { rides: readonly ProgressRide[] }) {
  const [range, setRange] = useState<ProgressRange>("all");
  const [environment, setEnvironment] = useState<"all" | ProgressEnvironment>("all");
  const [trainingType, setTrainingType] = useState("all");
  const filters = useMemo(() => ({ range, environment, trainingType }), [range, environment, trainingType]);
  const filtered = useMemo(() => filterProgressRides(rides, filters), [rides, filters]);
  const summary = useMemo(() => buildProgressSummary(filtered), [filtered]);
  const months = useMemo(() => buildMonthlyProgress(filtered), [filtered]);
  const selection = useMemo(() => describeProgressSelection(filtered), [filtered]);
  const trainingTypes = useMemo(() => [...new Set(rides.map((ride) => ride.trainingType))].sort(), [rides]);
  const maximumMonthlyHours = Math.max(1, ...months.map((month) => month.movingTimeSeconds / 3600));

  return <div className="progress-page">
    <section className="progress-intro panel">
      <div><span className="eyebrow">Every stored ride</span><h2>Your progress, without cherry-picking</h2><p>Follow ride-level power, heart-rate response, cadence, workload, and monthly volume across your complete selected history. Filters apply to every graph.</p></div>
      <span className={`progress-context ${selection.focused ? "focused" : "mixed"}`}><small>{selection.focused ? "Focused selection" : "Descriptive view"}</small><strong>{selection.label}</strong><em>{selection.detail}</em></span>
    </section>

    <section className="progress-filters panel" aria-label="Progress filters">
      <label><span>History</span><select value={range} onChange={(event) => setRange(event.target.value as ProgressRange)}><option value="all">All history</option><option value="1y">Last year</option><option value="6m">Last 6 months</option><option value="90d">Last 90 days</option></select></label>
      <label><span>Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value as "all" | ProgressEnvironment)}><option value="all">All environments</option><option value="virtual">Virtual / Indoor</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
      <label><span>Ride type</span><select value={trainingType} onChange={(event) => setTrainingType(event.target.value)}><option value="all">All ride types</option>{trainingTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
      <button type="button" className="ghost-button" disabled={range === "all" && environment === "all" && trainingType === "all"} onClick={() => { setRange("all"); setEnvironment("all"); setTrainingType("all"); }}>Reset filters</button>
    </section>

    <section className="progress-summary">
      <ProgressStat label="Rides" value={summary.rideCount.toLocaleString()} unit={summary.startDate && summary.endDate ? `${dateLabel(summary.startDate)}–${dateLabel(summary.endDate)}` : "selected history"} />
      <ProgressStat label="Moving time" value={hoursLabel(summary.movingTimeSeconds)} />
      <ProgressStat label="Distance" value={summary.distanceMiles.toFixed(1)} unit="miles" />
      <ProgressStat label="Elevation" value={Math.round(summary.elevationFeet).toLocaleString()} unit="feet" />
      <ProgressStat label="Training load" value={Math.round(summary.trainingLoad).toLocaleString()} unit="stored points" />
    </section>

    {filtered.length ? <div className="progress-grid">
      <section className="progress-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Power across rides</span><h2>Average, normalized, and FTP-at-ride</h2><p>Each point is one ride. The FTP line uses the threshold snapshot stored with that ride, so old context does not change when today’s FTP changes.</p></div><span className="small-badge">zero-based scale</span></div>
        <ProgressLineChart rides={filtered} emptyMessage="Power data is not available for the selected rides." series={[
          { key: "average-power", label: "Average power", tone: "lime", unit: "W", value: (ride) => ride.averagePower > 0 ? ride.averagePower : null },
          { key: "normalized-power", label: "Normalized power", tone: "sky", unit: "W", value: (ride) => ride.normalizedPower && ride.normalizedPower > 0 ? ride.normalizedPower : null },
          { key: "ftp", label: "FTP at ride", tone: "cream", unit: "W", value: (ride) => ride.ftpAtRideWatts && ride.ftpAtRideWatts > 0 ? ride.ftpAtRideWatts : null },
        ]} />
        <p className="chart-note"><i /> Higher average power is not automatically better: duration, terrain, workout purpose, fatigue, and environment all change the result.</p>
      </section>

      <section className="progress-card panel">
        <div className="section-heading"><div><span className="eyebrow">Aerobic response</span><h2>Watts per heartbeat</h2><p>Average power divided by average heart rate for rides containing both signals.</p></div><span className="small-badge">W/bpm</span></div>
        <ProgressLineChart rides={filtered} emptyMessage="Power and heart-rate data from the same rides are needed." series={[{ key: "efficiency", label: "Power / heart rate", tone: "sky", unit: "W/bpm", value: (ride) => ride.powerHeartRateRatio > 0 ? ride.powerHeartRateRatio : null }]} />
        <p className="chart-note"><i /> Use a focused environment and ride type before reading this as a fitness trend. Heat, hydration, recovery, and pacing matter.</p>
      </section>

      <section className="progress-card panel">
        <div className="section-heading"><div><span className="eyebrow">Cardiovascular response</span><h2>Average heart rate</h2><p>Recorded ride-level heart rate, not a target or readiness score.</p></div><span className="small-badge">bpm</span></div>
        <ProgressLineChart rides={filtered} emptyMessage="Heart-rate data is not available for the selected rides." series={[{ key: "heart-rate", label: "Average heart rate", tone: "coral", unit: "bpm", value: (ride) => ride.averageHeartRate > 0 ? ride.averageHeartRate : null }]} />
      </section>

      <section className="progress-card panel">
        <div className="section-heading"><div><span className="eyebrow">Pedaling pattern</span><h2>Average cadence</h2><p>Ride-level cadence across every selected activity that recorded it.</p></div><span className="small-badge">rpm</span></div>
        <ProgressLineChart rides={filtered} emptyMessage="Cadence data is not available for the selected rides." series={[{ key: "cadence", label: "Average cadence", tone: "lime", unit: "rpm", value: (ride) => ride.averageCadence > 0 ? ride.averageCadence : null }]} />
      </section>

      <section className="progress-card panel">
        <div className="section-heading"><div><span className="eyebrow">Work completed</span><h2>Training load per ride</h2><p>The same stored load used by the 7-day fatigue and 42-day fitness models.</p></div><span className="small-badge">points</span></div>
        <ProgressLineChart rides={filtered} emptyMessage="Training-load data is not available for the selected rides." series={[{ key: "training-load", label: "Ride load", tone: "cream", unit: "points", value: (ride) => ride.trainingLoad > 0 ? ride.trainingLoad : null }]} />
      </section>

      <section className="progress-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Consistency over time</span><h2>Monthly riding volume</h2><p>Moving time from every selected ride. Empty months remain visible instead of disappearing.</p></div><span className="small-badge">{months.length} {months.length === 1 ? "month" : "months"}</span></div>
        <div className="progress-monthly-scroll">
          <div className="progress-monthly-bars" style={{ gridTemplateColumns: `repeat(${Math.max(1, months.length)}, minmax(30px, 1fr))`, minWidth: `${Math.max(100, months.length * 42)}px` }}>
            {months.map((month) => {
              const hours = month.movingTimeSeconds / 3600;
              return <span key={month.key} title={`${monthLabel(month.key)} · ${month.rideCount} rides · ${hours.toFixed(1)} hours · ${month.distanceMiles.toFixed(1)} miles · ${Math.round(month.trainingLoad)} load`}><strong>{hours.toFixed(1)}</strong><div><i style={{ height: `${Math.max(month.rideCount ? 3 : 0, (hours / maximumMonthlyHours) * 100)}%` }} /></div><small>{monthLabel(month.key)}</small></span>;
            })}
          </div>
        </div>
        <p className="chart-note"><i /> Monthly volume describes consistency; it is not a quota. Zero-ride months are retained between the first and last selected activity.</p>
      </section>
    </div> : <section className="progress-empty panel"><strong>No rides match these filters.</strong><span>Reset the filters or import more ride history.</span></section>}

    <p className="progress-method-note">Every axis starts at zero. Missing signals are omitted rather than estimated. Hover a point or monthly bar for the underlying ride or month. {PROGRESS_ANALYTICS_VERSION}</p>
  </div>;
}
