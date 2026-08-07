"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { parseActivityFile, type DetectedActivity } from "@/lib/activity-parser";
import {
  deriveRideMetrics,
  formatDuration,
  recommendRecovery,
  type SubjectiveRecovery,
} from "@/lib/metrics";

type View = "overview" | "rides" | "import" | "settings";

type Ride = {
  id: string;
  name: string;
  route: string;
  date: string;
  dateLabel: string;
  dayLabel: string;
  type: "Zone 2" | "Recovery" | "Tempo" | "Threshold" | "Free ride";
  source: "Strava" | "Zwift" | "Upload";
  indoor: boolean;
  distanceMiles: number;
  movingTimeSeconds: number;
  elevationFeet: number;
  averagePower: number;
  maximumPower: number;
  normalizedPower: number | null;
  averageHeartRate: number;
  maximumHeartRate: number;
  averageCadence: number;
  maximumCadence: number;
  trainingLoad: number;
  intensityFactor: number;
  powerHeartRateRatio: number;
  decoupling: number | null;
  variabilityIndex: number | null;
  note: string;
};

const initialRides: Ride[] = [
  {
    id: "ride-aug-06",
    name: "Sunday quality session",
    route: "Watopia · Tempus Fugit",
    date: "2026-08-02",
    dateLabel: "Aug 2",
    dayLabel: "SUN",
    type: "Tempo",
    source: "Zwift",
    indoor: true,
    distanceMiles: 23.4,
    movingTimeSeconds: 5058,
    elevationFeet: 614,
    averagePower: 130,
    maximumPower: 381,
    normalizedPower: 138,
    averageHeartRate: 143,
    maximumHeartRate: 174,
    averageCadence: 87,
    maximumCadence: 111,
    trainingLoad: 99,
    intensityFactor: 0.84,
    powerHeartRateRatio: 0.909,
    decoupling: 4.2,
    variabilityIndex: 1.06,
    note: "Strong final block. Breathing stayed controlled; legs felt heavy afterward.",
  },
  {
    id: "ride-jul-31",
    name: "Friday aerobic benchmark",
    route: "Watopia · Flat Route",
    date: "2026-07-31",
    dateLabel: "Jul 31",
    dayLabel: "FRI",
    type: "Zone 2",
    source: "Zwift",
    indoor: true,
    distanceMiles: 17.8,
    movingTimeSeconds: 3600,
    elevationFeet: 282,
    averagePower: 110,
    maximumPower: 128,
    normalizedPower: 112,
    averageHeartRate: 134,
    maximumHeartRate: 145,
    averageCadence: 88,
    maximumCadence: 94,
    trainingLoad: 46,
    intensityFactor: 0.68,
    powerHeartRateRatio: 0.821,
    decoupling: 2.7,
    variabilityIndex: 1.02,
    note: "Benchmark complete. Cadence stayed inside the target band for most of the ride.",
  },
  {
    id: "ride-jul-29",
    name: "Recovery spin",
    route: "Watopia · Downtown Titans",
    date: "2026-07-29",
    dateLabel: "Jul 29",
    dayLabel: "WED",
    type: "Recovery",
    source: "Zwift",
    indoor: true,
    distanceMiles: 9.6,
    movingTimeSeconds: 1882,
    elevationFeet: 174,
    averagePower: 82,
    maximumPower: 116,
    normalizedPower: 85,
    averageHeartRate: 116,
    maximumHeartRate: 128,
    averageCadence: 86,
    maximumCadence: 96,
    trainingLoad: 14,
    intensityFactor: 0.52,
    powerHeartRateRatio: 0.707,
    decoupling: null,
    variabilityIndex: 1.04,
    note: "Easy legs-only spin. No knee pain.",
  },
  {
    id: "ride-jul-26",
    name: "Threshold intervals",
    route: "Makuri Islands · Neokyo",
    date: "2026-07-26",
    dateLabel: "Jul 26",
    dayLabel: "SUN",
    type: "Threshold",
    source: "Zwift",
    indoor: true,
    distanceMiles: 18.2,
    movingTimeSeconds: 3974,
    elevationFeet: 486,
    averagePower: 137,
    maximumPower: 422,
    normalizedPower: 153,
    averageHeartRate: 151,
    maximumHeartRate: 181,
    averageCadence: 86,
    maximumCadence: 116,
    trainingLoad: 95,
    intensityFactor: 0.93,
    powerHeartRateRatio: 0.907,
    decoupling: null,
    variabilityIndex: 1.12,
    note: "Completed all intervals. Last effort was difficult but repeatable.",
  },
  {
    id: "ride-jul-24",
    name: "Friday aerobic benchmark",
    route: "Watopia · Flat Route",
    date: "2026-07-24",
    dateLabel: "Jul 24",
    dayLabel: "FRI",
    type: "Zone 2",
    source: "Zwift",
    indoor: true,
    distanceMiles: 17.3,
    movingTimeSeconds: 3600,
    elevationFeet: 279,
    averagePower: 110,
    maximumPower: 132,
    normalizedPower: 113,
    averageHeartRate: 137,
    maximumHeartRate: 149,
    averageCadence: 86,
    maximumCadence: 95,
    trainingLoad: 47,
    intensityFactor: 0.68,
    powerHeartRateRatio: 0.803,
    decoupling: 4.8,
    variabilityIndex: 1.03,
    note: "Warmer room than usual. Needed more water in the second half.",
  },
];

const powerDuration = [
  { label: "5s", watts: 462, best: 490 },
  { label: "1m", watts: 286, best: 304 },
  { label: "5m", watts: 208, best: 214 },
  { label: "20m", watts: 171, best: 176 },
  { label: "60m", watts: 137, best: 141 },
];

const efficiencyTrend = [0.76, 0.79, 0.78, 0.82, 0.84, 0.86, 0.91];
const weeklyLoads = [142, 188, 171, 226, 198, 244, 164];

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "overview", label: "Today", glyph: "01" },
  { id: "rides", label: "Ride log", glyph: "02" },
  { id: "import", label: "Import", glyph: "03" },
  { id: "settings", label: "Method", glyph: "04" },
];

const miles = (meters: number | null) =>
  meters === null ? 0 : Math.round((meters / 1609.344) * 10) / 10;
const feet = (meters: number | null) =>
  meters === null ? 0 : Math.round(meters * 3.28084);

export default function CyclingDashboard() {
  const [view, setView] = useState<View>("overview");
  const [rides, setRides] = useState(initialRides);
  const [selectedRideId, setSelectedRideId] = useState(initialRides[0].id);
  const [rideFilter, setRideFilter] = useState("All rides");
  const [search, setSearch] = useState("");
  const [recovery, setRecovery] = useState<SubjectiveRecovery>({
    sleepQuality: 4,
    legFreshness: "heavy",
    kneePain: 0,
    soreness: 3,
  });
  const [detected, setDetected] = useState<DetectedActivity | null>(null);
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedRide = rides.find((ride) => ride.id === selectedRideId) ?? rides[0];
  const currentMetrics = useMemo(
    () =>
      deriveRideMetrics({
        movingTimeSeconds: selectedRide.movingTimeSeconds,
        averagePowerWatts: selectedRide.averagePower,
        normalizedPowerWatts: selectedRide.normalizedPower,
        averageHeartRateBpm: selectedRide.averageHeartRate,
        ftpWatts: 165,
      }),
    [selectedRide],
  );
  const recommendation = useMemo(
    () => recommendRecovery(currentMetrics, selectedRide.movingTimeSeconds, 164, recovery),
    [currentMetrics, recovery, selectedRide.movingTimeSeconds],
  );

  const filteredRides = rides.filter((ride) => {
    const matchesType = rideFilter === "All rides" || ride.type === rideFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${ride.name} ${ride.route}`.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  const openRide = (ride: Ride) => {
    setSelectedRideId(ride.id);
    setView("overview");
  };

  const handleFiles = async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;
    setImportError("");
    setDetected(null);
    setImportName(file.name);
    setIsReading(true);
    try {
      setDetected(await parseActivityFile(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The activity could not be read.");
    } finally {
      setIsReading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void handleFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const loadDemoImport = () => {
    setImportName("morning-zone-2.tcx");
    setImportError("");
    setDetected({
      name: "Morning Zone 2",
      startedAt: "2026-08-06T13:10:00.000Z",
      distanceMeters: 29242,
      movingTimeSeconds: 3672,
      elevationGainMeters: 91,
      averageHeartRate: 132,
      maximumHeartRate: 146,
      averageCadence: 88,
      maximumCadence: 97,
      averagePower: 112,
      maximumPower: 148,
      normalizedPower: 114,
      sourceTrainingLoad: 48,
      sampleCount: 3672,
      warnings: [],
    });
  };

  const addDetectedRide = () => {
    if (!detected) return;
    const movingTimeSeconds = Math.round(detected.movingTimeSeconds ?? 0);
    const derived = deriveRideMetrics({
      movingTimeSeconds,
      averagePowerWatts: detected.averagePower,
      normalizedPowerWatts: detected.normalizedPower,
      averageHeartRateBpm: detected.averageHeartRate,
      ftpWatts: 165,
    });
    const date = detected.startedAt ? new Date(detected.startedAt) : new Date();
    const ride: Ride = {
      id: `import-${Date.now()}`,
      name: detected.name,
      route: "Imported activity · Review complete",
      date: date.toISOString().slice(0, 10),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      type: "Zone 2",
      source: "Upload",
      indoor: false,
      distanceMiles: miles(detected.distanceMeters),
      movingTimeSeconds,
      elevationFeet: feet(detected.elevationGainMeters),
      averagePower: Math.round(detected.averagePower ?? 0),
      maximumPower: Math.round(detected.maximumPower ?? 0),
      normalizedPower: detected.normalizedPower === null ? null : Math.round(detected.normalizedPower),
      averageHeartRate: Math.round(detected.averageHeartRate ?? 0),
      maximumHeartRate: Math.round(detected.maximumHeartRate ?? 0),
      averageCadence: Math.round(detected.averageCadence ?? 0),
      maximumCadence: Math.round(detected.maximumCadence ?? 0),
      trainingLoad: Math.round(detected.sourceTrainingLoad ?? derived.trainingLoad ?? 0),
      intensityFactor: derived.intensityFactor ?? 0,
      powerHeartRateRatio: derived.powerHeartRateRatio ?? 0,
      decoupling: null,
      variabilityIndex: null,
      note: detected.normalizedPower
        ? "Imported from original activity data with recorded normalized power."
        : "Imported from activity data. Intensity and load are explicitly estimated from average power.",
    };
    setRides((current) => [ride, ...current]);
    setSelectedRideId(ride.id);
    setView("overview");
    setDetected(null);
    setImportName("");
  };

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <button className="brand" onClick={() => setView("overview")} aria-label="Cycling Analytics home">
          <span className="brand-mark">CA</span>
          <span className="brand-copy"><strong>Cycling</strong><span>Analytics</span></span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="nav-index">{item.glyph}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="athlete-card">
          <div className="athlete-avatar">ZT</div>
          <div><strong>Personal profile</strong><span>FTP 165 W</span></div>
        </div>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">{view === "overview" ? "Thursday · August 6" : "Phase 1 workspace"}</span>
            <h1>{view === "overview" ? "Ride with the trend." : navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="top-actions">
            <span className="sync-status"><i /> Demo data · Local</span>
            <button className="primary-button" onClick={() => setView("import")}>Import ride <span>+</span></button>
          </div>
        </header>

        {view === "overview" && (
          <Overview
            selectedRide={selectedRide}
            recommendation={recommendation}
            recovery={recovery}
            setRecovery={setRecovery}
            rides={rides}
            openRide={openRide}
            setView={setView}
          />
        )}
        {view === "rides" && (
          <RideLog
            rides={filteredRides}
            filter={rideFilter}
            setFilter={setRideFilter}
            search={search}
            setSearch={setSearch}
            openRide={openRide}
          />
        )}
        {view === "import" && (
          <ImportRide
            detected={detected}
            filename={importName}
            error={importError}
            isReading={isReading}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            fileInput={fileInput}
            onFileChange={handleFileChange}
            onDrop={handleDrop}
            onDemo={loadDemoImport}
            onAdd={addDetectedRide}
          />
        )}
        {view === "settings" && <Methodology />}
      </section>
    </main>
  );
}

function Overview({ selectedRide, recommendation, recovery, setRecovery, rides, openRide, setView }: {
  selectedRide: Ride;
  recommendation: ReturnType<typeof recommendRecovery>;
  recovery: SubjectiveRecovery;
  setRecovery: (value: SubjectiveRecovery) => void;
  rides: Ride[];
  openRide: (ride: Ride) => void;
  setView: (view: View) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="recovery-hero panel-dark">
        <div className="hero-topline">
          <span className={`status-pill ${recommendation.status.replace(" ", "-")}`}><i /> {recommendation.status}</span>
          <span className="confidence">Ruleset v1.1 · medium confidence</span>
        </div>
        <div className="hero-copy">
          <span className="eyebrow light">Before your next hard ride</span>
          <div className="recovery-number"><strong>{recommendation.minimumHours}–{recommendation.maximumHours}</strong><span>hours</span></div>
          <p>{recommendation.nextSession}</p>
        </div>
        <div className="reason-strip">
          {recommendation.reasons.slice(0, 3).map((reason, index) => <div key={reason}><span>0{index + 1}</span><strong>{reason}</strong></div>)}
        </div>
      </section>

      <section className="checkin-card panel">
        <div className="section-heading compact"><div><span className="eyebrow">Morning check-in</span><h2>How are the legs?</h2></div><span className="saved-label">Saved</span></div>
        <div className="segmented-control" role="group" aria-label="Leg freshness">
          {(["fresh", "normal", "heavy", "dead"] as const).map((value) => <button key={value} className={recovery.legFreshness === value ? "selected" : ""} onClick={() => setRecovery({ ...recovery, legFreshness: value })}>{value}</button>)}
        </div>
        <label className="range-row"><span><strong>Sleep</strong><small>{recovery.sleepQuality}/5</small></span><input type="range" min="1" max="5" value={recovery.sleepQuality} onChange={(event) => setRecovery({ ...recovery, sleepQuality: Number(event.target.value) })} /></label>
        <label className="range-row"><span><strong>Knee pain</strong><small>{recovery.kneePain}/10</small></span><input type="range" min="0" max="10" value={recovery.kneePain} onChange={(event) => setRecovery({ ...recovery, kneePain: Number(event.target.value) })} /></label>
      </section>

      <section className="metric-ribbon">
        <MetricCard label="Current FTP" value="165" unit="W" change="+30 W since May" tone="lime" />
        <MetricCard label="7-day load" value="164" unit="pts" change="↓ 33% vs prior week" tone="cream" />
        <MetricCard label="Aerobic efficiency" value="0.91" unit="W/bpm" change="↑ 7.8% in 30 days" tone="sky" />
        <MetricCard label="Training time" value="4h 42" unit="this week" change="3 rides completed" tone="coral" />
      </section>

      <section className="trend-card panel span-two">
        <div className="section-heading"><div><span className="eyebrow">Aerobic efficiency</span><h2>Power / heart-rate trend</h2></div><span className="delta-positive">+7.8%</span></div>
        <div className="efficiency-chart" aria-label="Aerobic efficiency increased from 0.76 to 0.91 watts per bpm">
          {efficiencyTrend.map((value, index) => <div className="trend-column" key={`${value}-${index}`}><span className="trend-value">{value.toFixed(2)}</span><div className="trend-track"><i style={{ height: `${((value - 0.68) / 0.26) * 100}%` }} /></div><small>{["May 20", "Jun 3", "Jun 17", "Jul 1", "Jul 15", "Jul 29", "Aug 2"][index]}</small></div>)}
        </div>
        <p className="chart-note"><i /> Best compared across steady rides in similar conditions. Temperature, hydration, fatigue, and caffeine can move this ratio.</p>
      </section>

      <section className="load-card panel">
        <div className="section-heading"><div><span className="eyebrow">Load balance</span><h2>Seven weeks</h2></div><span className="small-badge">On track</span></div>
        <div className="load-chart" aria-label="Weekly training load bar chart">
          {weeklyLoads.map((value, index) => <div key={`${value}-${index}`}><i style={{ height: `${(value / 260) * 100}%` }} className={index === weeklyLoads.length - 1 ? "current" : ""} /><small>{value}</small></div>)}
        </div>
        <div className="load-footer"><span>Acute load <strong>164</strong></span><span>28-day avg <strong>201</strong></span></div>
      </section>

      <section className="ride-detail panel span-two">
        <div className="section-heading"><div><span className="eyebrow">Selected ride · {selectedRide.dateLabel}</span><h2>{selectedRide.name}</h2><p>{selectedRide.route}</p></div><span className={`ride-tag ${selectedRide.type.toLowerCase().replace(" ", "-")}`}>{selectedRide.type}</span></div>
        <div className="ride-stats">
          <Stat label="Distance" value={selectedRide.distanceMiles.toFixed(1)} unit="mi" />
          <Stat label="Moving time" value={formatDuration(selectedRide.movingTimeSeconds)} />
          <Stat label="Avg power" value={String(selectedRide.averagePower)} unit="W" />
          <Stat label="Avg HR" value={String(selectedRide.averageHeartRate)} unit="bpm" />
          <Stat label="Cadence" value={String(selectedRide.averageCadence)} unit="rpm" />
          <Stat label="Load" value={String(selectedRide.trainingLoad)} unit="pts" />
        </div>
        <div className="ride-analysis-grid">
          <div className="analysis-tile"><span>Intensity</span><strong>{selectedRide.intensityFactor.toFixed(2)} <small>IF</small></strong><p>{selectedRide.normalizedPower ? "Normalized power available" : "Estimated from average power"}</p></div>
          <div className="analysis-tile"><span>Aerobic durability</span><strong>{selectedRide.decoupling === null ? "—" : `${selectedRide.decoupling.toFixed(1)}%`} <small>drift</small></strong><p>{selectedRide.decoupling === null ? "Not valid for this ride type" : selectedRide.decoupling < 5 ? "Good durability" : "Moderate drift"}</p></div>
          <div className="analysis-tile"><span>Power variability</span><strong>{selectedRide.variabilityIndex?.toFixed(2) ?? "—"} <small>VI</small></strong><p>{selectedRide.variabilityIndex && selectedRide.variabilityIndex <= 1.05 ? "Very steady pacing" : "Variable effort"}</p></div>
        </div>
        <blockquote>{selectedRide.note}</blockquote>
      </section>

      <section className="power-card panel">
        <div className="section-heading"><div><span className="eyebrow">Power duration</span><h2>Current curve</h2></div><button className="text-button" onClick={() => setView("rides")}>All rides →</button></div>
        <div className="power-bars">{powerDuration.map((duration) => <div key={duration.label} className="power-row"><span>{duration.label}</span><div><i style={{ width: `${(duration.watts / 500) * 100}%` }} /></div><strong>{duration.watts} W</strong><small>best {duration.best}</small></div>)}</div>
      </section>

      <section className="recent-rides panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Recent work</span><h2>Ride log</h2></div><button className="text-button" onClick={() => setView("rides")}>View all →</button></div>
        <div className="ride-list">{rides.slice(0, 4).map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} />)}</div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, unit, change, tone }: { label: string; value: string; unit: string; change: string; tone: string }) {
  return <article className={`metric-card tone-${tone}`}><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><p>{change}</p></article>;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong></div>;
}

function RideRow({ ride, onClick }: { ride: Ride; onClick: () => void }) {
  return <button className="ride-row" onClick={onClick}><span className="ride-date"><strong>{ride.dayLabel}</strong><small>{ride.dateLabel}</small></span><span className="ride-main"><strong>{ride.name}</strong><small>{ride.route}</small></span><span className={`ride-tag ${ride.type.toLowerCase().replace(" ", "-")}`}>{ride.type}</span><span className="ride-number"><strong>{ride.distanceMiles.toFixed(1)}</strong><small>mi</small></span><span className="ride-number"><strong>{ride.averagePower}</strong><small>W avg</small></span><span className="ride-number"><strong>{ride.trainingLoad}</strong><small>load</small></span><span className="row-arrow">→</span></button>;
}

function RideLog({ rides, filter, setFilter, search, setSearch, openRide }: { rides: Ride[]; filter: string; setFilter: (value: string) => void; search: string; setSearch: (value: string) => void; openRide: (ride: Ride) => void }) {
  return <div className="page-stack"><section className="log-summary panel-dark"><div><span className="eyebrow light">All recorded rides</span><strong>1,284.6</strong><small>miles since May</small></div><div><strong>68</strong><small>rides</small></div><div><strong>46h</strong><small>moving time</small></div><div><strong>41,280</strong><small>feet climbed</small></div></section><section className="panel ride-log-panel"><div className="filter-bar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rides or routes" /></label><div className="filter-buttons" role="group" aria-label="Filter ride type">{["All rides", "Zone 2", "Tempo", "Threshold", "Recovery"].map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div></div><div className="table-header"><span>Date</span><span>Ride</span><span>Type</span><span>Distance</span><span>Power</span><span>Load</span><span /></div><div className="ride-list full-list">{rides.map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} />)}{!rides.length && <div className="empty-state"><strong>No rides match this view.</strong><span>Try a different ride type or search term.</span></div>}</div></section></div>;
}

function ImportRide({ detected, filename, error, isReading, isDragging, setIsDragging, fileInput, onFileChange, onDrop, onDemo, onAdd }: { detected: DetectedActivity | null; filename: string; error: string; isReading: boolean; isDragging: boolean; setIsDragging: (value: boolean) => void; fileInput: React.RefObject<HTMLInputElement | null>; onFileChange: (event: ChangeEvent<HTMLInputElement>) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onDemo: () => void; onAdd: () => void }) {
  return <div className="import-layout"><section className="import-intro"><span className="eyebrow">Original files first</span><h2>Bring the ride home.</h2><p>Import the richest recording available. The original file stays unchanged; calculations are stored separately with their source and algorithm version.</p><ol><li><span>01</span><div><strong>Upload</strong><small>FIT, TCX, or GPX activity file</small></div></li><li><span>02</span><div><strong>Review</strong><small>Confirm detected and missing values</small></div></li><li><span>03</span><div><strong>Calculate</strong><small>Generate transparent ride metrics</small></div></li></ol></section><section className="import-workspace panel">{!detected ? <><div className={`dropzone ${isDragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><input ref={fileInput} type="file" accept=".fit,.tcx,.gpx" onChange={onFileChange} hidden /><div className="file-glyph">↑</div><h3>{isReading ? "Reading the activity…" : "Drop a ride file here"}</h3><p>Original FIT preferred · TCX and GPX accepted</p><button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={isReading}>Choose a file</button></div>{filename && <div className="file-message"><strong>{filename}</strong><span>{error || "Ready for review"}</span></div>}<div className="demo-callout"><div><strong>No export nearby?</strong><span>Open a realistic detected-ride review.</span></div><button className="text-button" onClick={onDemo}>Use demo file →</button></div></> : <div className="review-panel"><div className="review-heading"><div><span className="eyebrow">Detected ride · {detected.sampleCount.toLocaleString()} samples</span><h2>{detected.name}</h2><p>{filename}</p></div><span className="small-badge">Review</span></div><div className="detected-grid"><ReviewField label="Start" value={detected.startedAt ? new Date(detected.startedAt).toLocaleString() : "Missing"} /><ReviewField label="Moving time" value={detected.movingTimeSeconds ? formatDuration(detected.movingTimeSeconds) : "Missing"} /><ReviewField label="Distance" value={detected.distanceMeters ? `${miles(detected.distanceMeters)} mi` : "Missing"} /><ReviewField label="Elevation" value={detected.elevationGainMeters ? `${feet(detected.elevationGainMeters)} ft` : "Missing"} /><ReviewField label="Average power" value={detected.averagePower ? `${Math.round(detected.averagePower)} W` : "Missing"} /><ReviewField label="Average HR" value={detected.averageHeartRate ? `${Math.round(detected.averageHeartRate)} bpm` : "Missing"} /><ReviewField label="Cadence" value={detected.averageCadence ? `${Math.round(detected.averageCadence)} rpm` : "Missing"} /><ReviewField label="FTP at ride" value="165 W" /></div>{detected.warnings.length > 0 && <div className="warning-box"><strong>Check before saving</strong>{detected.warnings.map((warning) => <span key={warning}>· {warning}</span>)}</div>}<div className="review-actions"><button className="ghost-button" onClick={() => window.location.reload()}>Start over</button><button className="primary-button wide" onClick={onAdd}>Add to ride log <span>→</span></button></div></div>}</section></div>;
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <label className="review-field"><span>{label}</span><input value={value} readOnly /></label>;
}

function Methodology() {
  const methods = [
    { id: "01", title: "Power / HR ratio", formula: "average power ÷ average heart rate", note: "Contextual efficiency signal for comparable steady rides." },
    { id: "02", title: "Intensity factor", formula: "normalized power ÷ FTP", note: "Average power is used only as an explicitly marked estimate." },
    { id: "03", title: "Training load", formula: "hours × intensity² × 100", note: "A transparent TSS-like load, not a licensed physiological diagnosis." },
    { id: "04", title: "Aerobic decoupling", formula: "change in power / HR between halves", note: "Shown only when the ride is sufficiently steady and continuous." },
  ];
  return <div className="method-layout"><section className="method-hero panel-dark"><span className="eyebrow light">Explainable by design</span><h2>No mystery score.</h2><p>Every recommendation is assembled from visible inputs, conservative rules, and versioned calculations. Pain always overrides the number.</p><div className="version-stamp"><span>Current ruleset</span><strong>phase1.1</strong></div></section><section className="method-list panel"><div className="section-heading"><div><span className="eyebrow">Metric dictionary</span><h2>What the app calculates</h2></div></div>{methods.map((method) => <article key={method.id} className="method-row"><span>{method.id}</span><div><strong>{method.title}</strong><code>{method.formula}</code><p>{method.note}</p></div></article>)}</section><section className="config-card panel"><div className="section-heading"><div><span className="eyebrow">Athlete configuration</span><h2>Current working values</h2></div></div><div className="config-grid"><Stat label="FTP" value="165" unit="W" /><Stat label="Zone 2 target" value="110" unit="W" /><Stat label="Cadence band" value="85–90" unit="rpm" /><Stat label="Next milestone" value="175" unit="W" /></div><p className="chart-note"><i /> These values are configuration, never hard-coded into the analytics engine.</p></section></div>;
}
