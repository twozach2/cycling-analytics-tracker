"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { parseActivityFile, type DetectedActivity } from "@/lib/activity-parser";
import {
  calculateReadiness,
  deriveRideMetrics,
  formatDuration,
  type SubjectiveRecovery,
} from "@/lib/metrics";
import { buildWeeklyPlan, projectFtpGoal, recommendWorkout } from "@/lib/phase3";
import { recommendZwiftRoutes } from "@/lib/zwift-routes";
import type { ZwiftRotation } from "@/lib/zwift-world-rotation";

type View = "dashboard" | "plan" | "rides" | "import" | "method";
type DataMode = "loading" | "demo" | "saved" | "unavailable";

type Ride = {
  id: string;
  name: string;
  route: string;
  date: string;
  dateLabel: string;
  dayLabel: string;
  type: "Zone 2" | "Zone 2 benchmark" | "Recovery" | "Tempo" | "Threshold" | "Free ride";
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
  cadenceStddev?: number | null;
  cadenceTargetPercent?: number | null;
  cadenceAcceptablePercent?: number | null;
  cadenceLowPercent?: number | null;
  cadenceHighPercent?: number | null;
  first15HeartRate?: number | null;
  final15HeartRate?: number | null;
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
    type: "Zone 2 benchmark",
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
    cadenceStddev: 3.8,
    cadenceTargetPercent: 72,
    cadenceAcceptablePercent: 94,
    cadenceLowPercent: 1,
    cadenceHighPercent: 0,
    first15HeartRate: 130,
    final15HeartRate: 138,
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
    type: "Zone 2 benchmark",
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
    cadenceStddev: 4.5,
    cadenceTargetPercent: 61,
    cadenceAcceptablePercent: 88,
    cadenceLowPercent: 3,
    cadenceHighPercent: 1,
    first15HeartRate: 134,
    final15HeartRate: 141,
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

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "dashboard", label: "Dashboard", glyph: "01" },
  { id: "plan", label: "Plan today", glyph: "02" },
  { id: "rides", label: "Ride log", glyph: "03" },
  { id: "import", label: "Import", glyph: "04" },
  { id: "method", label: "Method", glyph: "05" },
];

const miles = (meters: number | null) =>
  meters === null ? 0 : Math.round((meters / 1609.344) * 10) / 10;
const feet = (meters: number | null) =>
  meters === null ? 0 : Math.round(meters * 3.28084);

type SavedRideRow = {
  ride: {
    id: string;
    source: string;
    name: string;
    startedAt: string;
    rideType: string;
    indoor: boolean;
    routeName: string | null;
    distanceM: number | null;
    movingTimeS: number | null;
    elevationGainM: number | null;
    averageHeartRateBpm: number | null;
    maximumHeartRateBpm: number | null;
    averageCadenceRpm: number | null;
    maximumCadenceRpm: number | null;
    averagePowerWatts: number | null;
    maximumPowerWatts: number | null;
    normalizedPowerWatts: number | null;
    notes: string;
  };
  metrics: {
    powerHeartRateRatio: number | null;
    intensityFactor: number | null;
    trainingLoad: number | null;
    variabilityIndex: number | null;
    aerobicDecouplingPercent: number | null;
    cadenceStddev: number | null;
    cadenceTargetPercent: number | null;
    cadenceAcceptablePercent: number | null;
    cadenceLowPercent: number | null;
    cadenceHighPercent: number | null;
    first15HeartRateBpm: number | null;
    final15HeartRateBpm: number | null;
  } | null;
};

const rideTypes = ["Zone 2", "Zone 2 benchmark", "Recovery", "Tempo", "Threshold", "Free ride"] as const;

function mapSavedRide({ ride, metrics }: SavedRideRow): Ride {
  const startedAt = new Date(ride.startedAt);
  const safeDate = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const type = rideTypes.includes(ride.rideType as (typeof rideTypes)[number])
    ? ride.rideType as Ride["type"]
    : "Free ride";
  const source: Ride["source"] = ride.source === "zwift" ? "Zwift" : ride.source === "strava_export" ? "Strava" : "Upload";
  const sourceLabel = ride.source === "fit" ? "FIT upload" : ride.source === "tcx" ? "TCX upload" : ride.source === "gpx" ? "GPX upload" : "Imported activity";

  return {
    id: ride.id,
    name: ride.name,
    route: ride.routeName ?? sourceLabel,
    date: safeDate.toISOString().slice(0, 10),
    dateLabel: safeDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    dayLabel: safeDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    type,
    source,
    indoor: ride.indoor,
    distanceMiles: miles(ride.distanceM),
    movingTimeSeconds: Math.round(ride.movingTimeS ?? 0),
    elevationFeet: feet(ride.elevationGainM),
    averagePower: Math.round(ride.averagePowerWatts ?? 0),
    maximumPower: Math.round(ride.maximumPowerWatts ?? 0),
    normalizedPower: ride.normalizedPowerWatts === null ? null : Math.round(ride.normalizedPowerWatts),
    averageHeartRate: Math.round(ride.averageHeartRateBpm ?? 0),
    maximumHeartRate: Math.round(ride.maximumHeartRateBpm ?? 0),
    averageCadence: Math.round(ride.averageCadenceRpm ?? 0),
    maximumCadence: Math.round(ride.maximumCadenceRpm ?? 0),
    trainingLoad: Math.round(metrics?.trainingLoad ?? 0),
    intensityFactor: metrics?.intensityFactor ?? 0,
    powerHeartRateRatio: metrics?.powerHeartRateRatio ?? 0,
    decoupling: metrics?.aerobicDecouplingPercent ?? null,
    variabilityIndex: metrics?.variabilityIndex ?? null,
    cadenceStddev: metrics?.cadenceStddev ?? null,
    cadenceTargetPercent: metrics?.cadenceTargetPercent ?? null,
    cadenceAcceptablePercent: metrics?.cadenceAcceptablePercent ?? null,
    cadenceLowPercent: metrics?.cadenceLowPercent ?? null,
    cadenceHighPercent: metrics?.cadenceHighPercent ?? null,
    first15HeartRate: metrics?.first15HeartRateBpm ?? null,
    final15HeartRate: metrics?.final15HeartRateBpm ?? null,
    note: ride.notes || (ride.normalizedPowerWatts === null
      ? "Saved from the original activity file. Intensity and load are estimated where recorded power data is unavailable."
      : "Saved from the original activity file with recorded normalized power."),
  };
}

async function fetchSavedRides() {
  const response = await fetch("/api/rides", { cache: "no-store" });
  const payload = await response.json() as { rides?: SavedRideRow[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Saved rides could not be loaded.");
  return (payload.rides ?? []).map(mapSavedRide);
}

export default function CyclingDashboard() {
  const [view, setView] = useState<View>("dashboard");
  const [rides, setRides] = useState(initialRides);
  const [selectedRideId, setSelectedRideId] = useState(initialRides[0].id);
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [currentFtp, setCurrentFtp] = useState(165);
  const [syncNote, setSyncNote] = useState("");
  const [rideFilter, setRideFilter] = useState("All rides");
  const [search, setSearch] = useState("");
  const [recovery, setRecovery] = useState<SubjectiveRecovery>({
    sleepQuality: 4,
    legFreshness: "heavy",
    kneePain: 0,
    soreness: 3,
    motivation: 4,
  });
  const [recoverySaveState, setRecoverySaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detected, setDetected] = useState<DetectedActivity | null>(null);
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [rideType, setRideType] = useState<Ride["type"]>("Free ride");
  const [routeName, setRouteName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetchSavedRides()
      .then((savedRides) => {
        if (!active) return;
        if (savedRides.length) {
          setRides(savedRides);
          setSelectedRideId(savedRides[0].id);
          setDataMode("saved");
        } else {
          setDataMode("demo");
        }
      })
      .catch(() => {
        if (active) setDataMode("unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as { currentFtpWatts?: number } }))
      .then(({ response, payload }) => {
        if (response.ok && payload.currentFtpWatts) setCurrentFtp(payload.currentFtpWatts);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    if (!integration?.startsWith("strava-")) return;
    const messages: Record<string, string> = {
      "strava-connected": "Strava connected · Ready to sync",
      "strava-denied": "Strava connection cancelled",
      "strava-scope": "Strava activity permission was not granted",
      "strava-expired": "Strava connection expired · Try again",
      "strava-failed": "Strava connection failed · Try again",
      "strava-setup": "Strava app credentials still need configuration",
      "strava-invalid": "Strava returned an invalid connection response",
    };
    const timer = window.setTimeout(() => {
      setView("import");
      setSyncNote(messages[integration] ?? "Strava connection updated");
      url.searchParams.delete("integration");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/recovery", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as { recovery?: { sleepQuality?: number; legFreshness?: SubjectiveRecovery["legFreshness"]; motivation?: number; generalSoreness?: number; kneePain?: number } | null } }))
      .then(({ response, payload }) => {
        if (!active || !response.ok || !payload.recovery) return;
        setRecovery({
          sleepQuality: payload.recovery.sleepQuality ?? 3,
          legFreshness: payload.recovery.legFreshness ?? "normal",
          motivation: payload.recovery.motivation ?? 3,
          soreness: payload.recovery.generalSoreness ?? 0,
          kneePain: payload.recovery.kneePain ?? 0,
        });
        setRecoverySaveState("saved");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const saveRecovery = async () => {
    setRecoverySaveState("saving");
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recovery),
      });
      if (!response.ok) throw new Error("Recovery check-in could not be saved.");
      setRecoverySaveState("saved");
    } catch {
      setRecoverySaveState("error");
    }
  };

  const selectedRide = rides.find((ride) => ride.id === selectedRideId) ?? rides[0];
  const filteredRides = rides.filter((ride) => {
    const matchesType = rideFilter === "All rides" || ride.type === rideFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${ride.name} ${ride.route}`.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  const openRide = (ride: Ride) => {
    setSelectedRideId(ride.id);
    setView("dashboard");
  };

  const handleFiles = async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;
    setImportError("");
    setDetected(null);
    setImportName(file.name);
    setPendingFile(file);
    setRideType("Free ride");
    setRouteName(file.name.replace(/\.(fit|tcx|gpx)$/i, "").replace(/[_-]+/g, " "));
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
    setPendingFile(null);
    setRideType("Zone 2 benchmark");
    setRouteName("Watopia · Flat Route");
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
      aerobicDecouplingPercent: 2.4,
      variabilityIndex: 1.02,
      cadenceStddev: 4.1,
      cadenceTargetPercent: 64,
      cadenceAcceptablePercent: 91,
      cadenceLowPercent: 2,
      cadenceHighPercent: 1,
      first15HeartRate: 128,
      final15HeartRate: 135,
      powerDuration: [
        { durationSeconds: 300, bestPowerWatts: 128 },
        { durationSeconds: 1200, bestPowerWatts: 118 },
        { durationSeconds: 3600, bestPowerWatts: 112 },
      ],
      sampleCount: 3672,
      warnings: [],
    });
  };

  const resetImport = () => {
    setDetected(null);
    setImportName("");
    setImportError("");
    setPendingFile(null);
    setRouteName("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const addDetectedRide = async () => {
    if (!detected) return;
    setImportError("");
    setIsSaving(true);
    const movingTimeSeconds = Math.round(detected.movingTimeSeconds ?? 0);
    const derived = deriveRideMetrics({
      movingTimeSeconds,
      averagePowerWatts: detected.averagePower,
      normalizedPowerWatts: detected.normalizedPower,
      averageHeartRateBpm: detected.averageHeartRate,
      ftpWatts: currentFtp,
    });
    const date = detected.startedAt ? new Date(detected.startedAt) : new Date();
    const ride: Ride = {
      id: `import-${Date.now()}`,
      name: detected.name,
      route: routeName.trim() || "Imported activity",
      date: date.toISOString().slice(0, 10),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      type: rideType,
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
      decoupling: detected.aerobicDecouplingPercent,
      variabilityIndex: detected.variabilityIndex,
      cadenceStddev: detected.cadenceStddev,
      cadenceTargetPercent: detected.cadenceTargetPercent,
      cadenceAcceptablePercent: detected.cadenceAcceptablePercent,
      cadenceLowPercent: detected.cadenceLowPercent,
      cadenceHighPercent: detected.cadenceHighPercent,
      first15HeartRate: detected.first15HeartRate,
      final15HeartRate: detected.final15HeartRate,
      note: detected.normalizedPower
        ? "Imported from original activity data with recorded normalized power."
        : "Imported from activity data. Intensity and load are explicitly estimated from average power.",
    };
    try {
      if (!pendingFile) {
        setRides((current) => [ride, ...current]);
        setSelectedRideId(ride.id);
        setDataMode("demo");
        setSyncNote("Demo preview · Not saved");
      } else {
        const formData = new FormData();
        formData.set("file", pendingFile);
        const uploadResponse = await fetch("/api/import", { method: "POST", body: formData });
        const upload = await uploadResponse.json() as { sourceFile?: { id: string }; error?: string };
        if (!uploadResponse.ok || !upload.sourceFile?.id) {
          throw new Error(upload.error ?? "The original activity file could not be saved.");
        }

        const extension = pendingFile.name.split(".").at(-1)?.toLowerCase();
        const saveResponse = await fetch("/api/rides", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceFileId: upload.sourceFile.id,
            source: extension === "fit" || extension === "tcx" || extension === "gpx" ? extension : "manual",
            name: detected.name,
            startedAt: detected.startedAt ?? new Date().toISOString(),
            rideType,
            routeName: routeName.trim() || null,
            distanceM: detected.distanceMeters,
            movingTimeS: movingTimeSeconds,
            elevationGainM: detected.elevationGainMeters,
            averageHeartRateBpm: detected.averageHeartRate,
            maximumHeartRateBpm: detected.maximumHeartRate,
            averageCadenceRpm: detected.averageCadence,
            maximumCadenceRpm: detected.maximumCadence,
            averagePowerWatts: detected.averagePower,
            maximumPowerWatts: detected.maximumPower,
            normalizedPowerWatts: detected.normalizedPower,
            ftpAtRideWatts: currentFtp,
            sourceTrainingLoad: detected.sourceTrainingLoad,
            aerobicDecouplingPercent: detected.aerobicDecouplingPercent,
            variabilityIndex: detected.variabilityIndex,
            cadenceStddev: detected.cadenceStddev,
            cadenceTargetPercent: detected.cadenceTargetPercent,
            cadenceAcceptablePercent: detected.cadenceAcceptablePercent,
            cadenceLowPercent: detected.cadenceLowPercent,
            cadenceHighPercent: detected.cadenceHighPercent,
            first15HeartRateBpm: detected.first15HeartRate,
            final15HeartRateBpm: detected.final15HeartRate,
            powerDuration: detected.powerDuration,
          }),
        });
        const saved = await saveResponse.json() as { duplicate?: boolean; error?: string };
        if (!saveResponse.ok) throw new Error(saved.error ?? "The ride could not be added to your log.");

        const savedRides = await fetchSavedRides();
        if (!savedRides.length) throw new Error("The ride was saved, but the refreshed log was empty.");
        setRides(savedRides);
        setSelectedRideId(savedRides[0].id);
        setDataMode("saved");
        setSyncNote(saved.duplicate ? "Already imported · Duplicate skipped" : "Saved just now · Private");
      }
      setView("dashboard");
      resetImport();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The ride could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const syncLabel = dataMode === "loading"
    ? "Loading saved rides…"
    : dataMode === "saved"
      ? syncNote || "Saved rides · Private"
      : syncNote || (dataMode === "unavailable" ? "Demo data · Save unavailable" : "Demo data · Not saved");

  const refreshSavedRides = async () => {
    const savedRides = await fetchSavedRides();
    if (savedRides.length) {
      setRides(savedRides);
      setSelectedRideId(savedRides[0].id);
      setDataMode("saved");
    }
  };

  const pageMeta: Record<View, { eyebrow: string; title: string }> = {
    dashboard: { eyebrow: "Your training at a glance", title: "Ride with the trend." },
    plan: { eyebrow: "Readiness + next steps", title: "Plan today" },
    rides: { eyebrow: "Your complete history", title: "Ride log" },
    import: { eyebrow: "Files + connected sources", title: "Import" },
    method: { eyebrow: "Transparent calculations", title: "Method" },
  };

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Cycling Analytics home">
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
          <div><strong>Personal profile</strong><span>FTP {currentFtp} W</span></div>
        </div>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">{pageMeta[view].eyebrow}</span>
            <h1>{pageMeta[view].title}</h1>
          </div>
          <div className="top-actions">
            <span className={`sync-status mode-${dataMode}`}><i /> {syncLabel}</span>
            <button className="primary-button" onClick={() => setView("import")}>Import ride <span>+</span></button>
          </div>
        </header>

        {dataMode !== "saved" && (
          <div className={`data-banner mode-${dataMode}`} role="status">
            <strong>{dataMode === "loading" ? "Checking your private ride log…" : "You’re viewing fictional demo rides."}</strong>
            <span>{dataMode === "loading" ? "Saved activities will appear automatically." : "Import a ride or sync Strava to replace every demo with your own saved data."}</span>
          </div>
        )}

        {view === "dashboard" && <div className="dashboard-stack">
          <Overview selectedRide={selectedRide} rides={rides} openRide={openRide} setView={setView} isDemo={dataMode !== "saved"} currentFtp={currentFtp} />
          <details className="performance-drawer">
            <summary><span><strong>Performance details</strong><small>Route comparisons, benchmarks, cadence, and workload</small></span><i>+</i></summary>
            <PerformanceDetails rides={rides} currentFtp={currentFtp} />
          </details>
        </div>}
        {view === "plan" && <PlanToday
          rides={rides}
          recovery={recovery}
          setRecovery={setRecovery}
          recoverySaveState={recoverySaveState}
          saveRecovery={saveRecovery}
          currentFtp={currentFtp}
          setCurrentFtp={setCurrentFtp}
        />}
        {view === "rides" && (
          <RideLog
            rides={filteredRides}
            allRides={rides}
            filter={rideFilter}
            setFilter={setRideFilter}
            search={search}
            setSearch={setSearch}
            openRide={openRide}
          />
        )}
        {view === "import" && (
          <div className="import-page-stack">
            <ConnectedSources refreshRides={refreshSavedRides} />
            <ImportRide
              detected={detected}
              filename={importName}
              error={importError}
              isReading={isReading}
              isSaving={isSaving}
              hasFile={pendingFile !== null}
              rideType={rideType}
              setRideType={setRideType}
              routeName={routeName}
              setRouteName={setRouteName}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              fileInput={fileInput}
              onFileChange={handleFileChange}
              onDrop={handleDrop}
              onDemo={loadDemoImport}
              onAdd={addDetectedRide}
              onReset={resetImport}
            />
          </div>
        )}
        {view === "method" && <Methodology currentFtp={currentFtp} />}
      </section>
    </main>
  );
}

function Overview({ selectedRide, rides, openRide, setView, isDemo, currentFtp }: {
  selectedRide: Ride;
  rides: Ride[];
  openRide: (ride: Ride) => void;
  setView: (view: View) => void;
  isDemo: boolean;
  currentFtp: number;
}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const rideTimestamps = rides.map((ride) => Date.parse(ride.date)).filter(Number.isFinite);
  const anchorMs = rideTimestamps.length ? Math.max(...rideTimestamps) : 0;
  const ridesInWindow = (startMs: number, endMs: number) => rides.filter((ride) => {
    const timestamp = Date.parse(ride.date);
    return Number.isFinite(timestamp) && timestamp > startMs && timestamp <= endMs;
  });
  const currentWeekRides = ridesInWindow(anchorMs - (7 * dayMs), anchorMs + dayMs);
  const priorWeekRides = ridesInWindow(anchorMs - (14 * dayMs), anchorMs - (7 * dayMs));
  const sevenDayLoad = Math.round(currentWeekRides.reduce((sum, ride) => sum + ride.trainingLoad, 0));
  const priorWeekLoad = Math.round(priorWeekRides.reduce((sum, ride) => sum + ride.trainingLoad, 0));
  const loadDelta = priorWeekLoad ? Math.round(((sevenDayLoad - priorWeekLoad) / priorWeekLoad) * 100) : null;
  const trainingSeconds = currentWeekRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0);
  const trainingLabel = `${Math.floor(trainingSeconds / 3600)}h ${Math.round((trainingSeconds % 3600) / 60).toString().padStart(2, "0")}`;
  const efficiencyRides = rides.filter((ride) => ride.powerHeartRateRatio > 0).slice(0, 7).reverse();
  const efficiencyValues = efficiencyRides.map((ride) => ride.powerHeartRateRatio);
  const efficiencyMax = efficiencyValues.length ? Math.max(...efficiencyValues) : 1;
  const efficiencyScaleMax = Math.max(1, Math.ceil(efficiencyMax * 5) / 5);
  const efficiencyDelta = efficiencyValues.length > 1
    ? ((efficiencyValues.at(-1)! - efficiencyValues[0]) / efficiencyValues[0]) * 100
    : null;
  const currentEfficiency = efficiencyValues.at(-1) ?? 0;
  const wattsHeartRides = rides.filter((ride) => ride.averagePower > 0 && ride.averageHeartRate > 0).slice(0, 7).reverse();
  const wattsScaleMax = Math.max(250, Math.ceil(Math.max(0, ...wattsHeartRides.map((ride) => ride.averagePower)) / 50) * 50);
  const heartRateScaleMax = 200;
  const weeklyLoadValues = Array.from({ length: 7 }, (_, index) => {
    const weeksAgo = 6 - index;
    const end = anchorMs - (weeksAgo * 7 * dayMs) + dayMs;
    const start = end - (7 * dayMs);
    return Math.round(ridesInWindow(start, end).reduce((sum, ride) => sum + ride.trainingLoad, 0));
  });
  const loadScale = Math.max(100, ...weeklyLoadValues);
  const twentyEightDayAverage = Math.round(weeklyLoadValues.slice(-4).reduce((sum, load) => sum + load, 0) / 4);
  const selectedPowerData = isDemo ? powerDuration : [
    { label: "Peak", watts: selectedRide.maximumPower, best: selectedRide.maximumPower },
    { label: "Norm", watts: selectedRide.normalizedPower ?? 0, best: selectedRide.normalizedPower ?? 0 },
    { label: "Avg", watts: selectedRide.averagePower, best: selectedRide.averagePower },
  ];
  const powerScale = Math.max(100, ...selectedPowerData.map((entry) => entry.watts));

  return (
    <div className="dashboard-grid">
      <section className="metric-ribbon">
        <MetricCard label="Current FTP" value={String(currentFtp)} unit="W" change="Used for load estimates" tone="lime" />
        <MetricCard label="7-day load" value={String(sevenDayLoad)} unit="pts" change={loadDelta === null ? "First full week in view" : `${loadDelta >= 0 ? "↑" : "↓"} ${Math.abs(loadDelta)}% vs prior week`} tone="cream" />
        <MetricCard label="Watts / heartbeat" value={currentEfficiency ? currentEfficiency.toFixed(2) : "—"} unit="W/bpm" change={efficiencyDelta === null ? "Needs two power + HR rides" : `${efficiencyDelta >= 0 ? "↑" : "↓"} ${Math.abs(efficiencyDelta).toFixed(1)}% across visible rides`} tone="sky" />
        <MetricCard label="Training time" value={trainingLabel} unit="last 7 days" change={`${currentWeekRides.length} ${currentWeekRides.length === 1 ? "ride" : "rides"} completed`} tone="coral" />
      </section>

      <section className="trend-card panel span-two">
        <div className="section-heading"><div><span className="eyebrow">Watts / heartbeat</span><h2>Power-to-heart-rate trend</h2></div>{efficiencyDelta !== null && <span className="delta-positive">{efficiencyDelta >= 0 ? "+" : ""}{efficiencyDelta.toFixed(1)}%</span>}</div>
        <div className="efficiency-summary">
          <span>Selected power <strong>{selectedRide.averagePower ? `${selectedRide.averagePower} W` : "—"}</strong></span>
          <span>Selected heart rate <strong>{selectedRide.averageHeartRate ? `${selectedRide.averageHeartRate} bpm` : "—"}</strong></span>
          <span>Efficiency <strong>{selectedRide.powerHeartRateRatio ? `${selectedRide.powerHeartRateRatio.toFixed(2)} W/bpm` : "—"}</strong></span>
        </div>
        {efficiencyRides.length ? <div className="efficiency-plot">
          <div className="efficiency-axis" aria-hidden="true"><span>{efficiencyScaleMax.toFixed(1)}</span><span>{(efficiencyScaleMax / 2).toFixed(1)}</span><span>0</span></div>
          <div className="efficiency-chart" aria-label={`Power to heart-rate ratio across recent rides, scaled from zero to ${efficiencyScaleMax.toFixed(1)} watts per beat`}>
            {efficiencyRides.map((ride) => <div className="trend-column" key={ride.id}><span className="trend-value">{ride.powerHeartRateRatio.toFixed(2)}</span><div className="trend-track"><i style={{ height: `${Math.max(2, (ride.powerHeartRateRatio / efficiencyScaleMax) * 100)}%` }} /></div><small>{ride.dateLabel}</small></div>)}
          </div>
        </div> : <div className="chart-empty">Power and heart-rate data from the same ride are needed for this trend.</div>}
        <p className="chart-note"><i /> The scale starts at zero, so differences such as 0.72 to 0.85 stay proportional. Compare steady rides in similar conditions.</p>
      </section>

      <section className="load-card panel">
        <div className="section-heading"><div><span className="eyebrow">Load balance</span><h2>Seven weeks</h2></div><span className="small-badge">On track</span></div>
        <div className="load-chart" aria-label="Weekly training load bar chart">
          {weeklyLoadValues.map((value, index) => <div key={`${value}-${index}`}><i style={{ height: `${Math.max(2, (value / loadScale) * 100)}%` }} className={index === weeklyLoadValues.length - 1 ? "current" : ""} /><small>{value}</small></div>)}
        </div>
        <div className="load-footer"><span>Acute load <strong>{sevenDayLoad}</strong></span><span>28-day avg <strong>{twentyEightDayAverage}</strong></span></div>
      </section>

      <section className="power-heart-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Watts + heart rate</span><h2>Workload and response</h2><p>Average power and average heartbeat for the same recent rides.</p></div><span className="small-badge">zero-based scales</span></div>
        {wattsHeartRides.length ? <div className="raw-series-grid">
          <article className="raw-series power-series">
            <div className="raw-series-heading"><span>Average power</span><strong>0–{wattsScaleMax} W</strong></div>
            <div className="raw-series-chart">
              {wattsHeartRides.map((ride) => <div className="raw-series-column" key={`power-${ride.id}`}><span>{ride.averagePower}</span><div><i style={{ height: `${(ride.averagePower / wattsScaleMax) * 100}%` }} /></div><small>{ride.dateLabel}</small></div>)}
            </div>
          </article>
          <article className="raw-series heart-series">
            <div className="raw-series-heading"><span>Average heart rate</span><strong>0–{heartRateScaleMax} bpm</strong></div>
            <div className="raw-series-chart">
              {wattsHeartRides.map((ride) => <div className="raw-series-column" key={`heart-${ride.id}`}><span>{ride.averageHeartRate}</span><div><i style={{ height: `${Math.min(100, (ride.averageHeartRate / heartRateScaleMax) * 100)}%` }} /></div><small>{ride.dateLabel}</small></div>)}
            </div>
          </article>
        </div> : <div className="chart-empty">Import rides containing both power and heart-rate data to build this chart.</div>}
        <p className="chart-note"><i /> Each panel has its own labeled, zero-based scale. Compare how heart rate responds as power changes; the bar heights are not the same unit.</p>
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
          <div className="analysis-tile"><span>Aerobic durability</span><strong>{selectedRide.decoupling === null ? "—" : `${selectedRide.decoupling.toFixed(1)}%`} <small>drift</small></strong><p>{selectedRide.decoupling === null ? "Needs detailed power + heart-rate data" : selectedRide.variabilityIndex && selectedRide.variabilityIndex > 1.05 ? "Directional estimate · variable pacing" : selectedRide.decoupling < 5 ? "Good durability" : "Moderate drift"}</p></div>
          <div className="analysis-tile"><span>Power variability</span><strong>{selectedRide.variabilityIndex?.toFixed(2) ?? "—"} <small>VI</small></strong><p>{selectedRide.variabilityIndex && selectedRide.variabilityIndex <= 1.05 ? "Very steady pacing" : "Variable effort"}</p></div>
        </div>
        <blockquote>{selectedRide.note}</blockquote>
      </section>

      <section className="power-card panel">
        <div className="section-heading"><div><span className="eyebrow">Recorded power</span><h2>{isDemo ? "Demo curve" : "Selected ride"}</h2></div><button className="text-button" onClick={() => setView("rides")}>All rides →</button></div>
        <div className="power-bars">{selectedPowerData.map((duration) => <div key={duration.label} className="power-row"><span>{duration.label}</span><div><i style={{ width: `${(duration.watts / powerScale) * 100}%` }} /></div><strong>{duration.watts || "—"} {duration.watts ? "W" : ""}</strong><small>{isDemo ? `best ${duration.best}` : "recorded"}</small></div>)}</div>
      </section>

      <section className="recent-rides panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Recent work</span><h2>Ride log</h2></div><button className="text-button" onClick={() => setView("rides")}>View all →</button></div>
        <div className="ride-list">{rides.slice(0, 4).map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} />)}</div>
      </section>
    </div>
  );
}

function RecoveryCheckIn({ recovery, setRecovery, recoverySaveState, saveRecovery, readiness }: {
  recovery: SubjectiveRecovery;
  setRecovery: (value: SubjectiveRecovery) => void;
  recoverySaveState: "idle" | "saving" | "saved" | "error";
  saveRecovery: () => Promise<void>;
  readiness: ReturnType<typeof calculateReadiness>;
}) {
  return (
    <section className="checkin-card panel">
      <div className="section-heading compact"><div><span className="eyebrow">Morning check-in</span><h2>How are the legs?</h2></div><span className={`readiness-score tone-${readiness.tone}`}>{readiness.score}</span></div>
      <div className="segmented-control" role="group" aria-label="Leg freshness">
        {(["fresh", "normal", "heavy", "dead"] as const).map((value) => <button key={value} className={recovery.legFreshness === value ? "selected" : ""} onClick={() => setRecovery({ ...recovery, legFreshness: value })}>{value}</button>)}
      </div>
      <div className="range-row"><span><strong>Sleep</strong><small>{recovery.sleepQuality}/5</small></span><input aria-label="Sleep quality" type="range" min="1" max="5" value={recovery.sleepQuality} onChange={(event) => setRecovery({ ...recovery, sleepQuality: Number(event.target.value) })} /></div>
      <div className="range-row"><span><strong>Motivation</strong><small>{recovery.motivation}/5</small></span><input aria-label="Motivation" type="range" min="1" max="5" value={recovery.motivation} onChange={(event) => setRecovery({ ...recovery, motivation: Number(event.target.value) })} /></div>
      <div className="range-row"><span><strong>Soreness</strong><small>{recovery.soreness}/10</small></span><input aria-label="General soreness" type="range" min="0" max="10" value={recovery.soreness} onChange={(event) => setRecovery({ ...recovery, soreness: Number(event.target.value) })} /></div>
      <div className="range-row"><span><strong>Knee pain</strong><small>{recovery.kneePain}/10</small></span><input aria-label="Knee pain" type="range" min="0" max="10" value={recovery.kneePain} onChange={(event) => setRecovery({ ...recovery, kneePain: Number(event.target.value) })} /></div>
      <div className="readiness-summary"><div><strong>{readiness.label}</strong><span>{recoverySaveState === "saved" ? "Private check-in saved" : recoverySaveState === "error" ? "Save failed · try again" : "Pain overrides the score"}</span></div><button className="text-button" onClick={() => void saveRecovery()} disabled={recoverySaveState === "saving"}>{recoverySaveState === "saving" ? "Saving…" : "Save check-in"}</button></div>
    </section>
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

function RideLog({ rides, allRides, filter, setFilter, search, setSearch, openRide }: { rides: Ride[]; allRides: Ride[]; filter: string; setFilter: (value: string) => void; search: string; setSearch: (value: string) => void; openRide: (ride: Ride) => void }) {
  const distance = allRides.reduce((sum, ride) => sum + ride.distanceMiles, 0);
  const movingSeconds = allRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0);
  const elevation = allRides.reduce((sum, ride) => sum + ride.elevationFeet, 0);
  const timeLabel = movingSeconds >= 3600 ? `${Math.round(movingSeconds / 3600)}h` : `${Math.round(movingSeconds / 60)}m`;

  return (
    <div className="page-stack">
      <section className="log-summary panel-dark">
        <div><span className="eyebrow light">All recorded rides</span><strong>{distance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><small>miles in this log</small></div>
        <div><strong>{allRides.length}</strong><small>rides</small></div>
        <div><strong>{timeLabel}</strong><small>moving time</small></div>
        <div><strong>{elevation.toLocaleString()}</strong><small>feet climbed</small></div>
      </section>
      <section className="panel ride-log-panel">
        <div className="filter-bar">
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rides or routes" /></label>
          <div className="filter-buttons" role="group" aria-label="Filter ride type">{["All rides", "Zone 2", "Zone 2 benchmark", "Tempo", "Threshold", "Recovery", "Free ride"].map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
        </div>
        <div className="table-header"><span>Date</span><span>Ride</span><span>Type</span><span>Distance</span><span>Power</span><span>Load</span><span /></div>
        <div className="ride-list full-list">{rides.map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} />)}{!rides.length && <div className="empty-state"><strong>No rides match this view.</strong><span>Try a different ride type or search term.</span></div>}</div>
      </section>
    </div>
  );
}

function PerformanceDetails({ rides, currentFtp }: { rides: Ride[]; currentFtp: number }) {
  const dayMs = 24 * 60 * 60 * 1000;
  const timestamps = rides.map((ride) => Date.parse(ride.date)).filter(Number.isFinite);
  const anchorMs = timestamps.length ? Math.max(...timestamps) : 0;
  const withinDays = (days: number) => rides.filter((ride) => {
    const timestamp = Date.parse(ride.date);
    return Number.isFinite(timestamp) && timestamp > anchorMs - (days * dayMs) && timestamp <= anchorMs + dayMs;
  });
  const acuteRides = withinDays(7);
  const load7 = acuteRides.reduce((sum, ride) => sum + ride.trainingLoad, 0);
  const load28 = withinDays(28).reduce((sum, ride) => sum + ride.trainingLoad, 0) / 4;
  const load42 = withinDays(42).reduce((sum, ride) => sum + ride.trainingLoad, 0) / 6;
  const acuteChronicRatio = load28 > 0 ? load7 / load28 : null;
  const groupedRoutes = Array.from(rides.reduce((groups, ride) => {
    const route = ride.route.trim();
    if (!route || /^(fit|tcx|gpx) upload$/i.test(route)) return groups;
    const key = route.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(ride);
    groups.set(key, group);
    return groups;
  }, new Map<string, Ride[]>()).values()).filter((group) => group.length >= 2);
  const benchmarkRides = rides
    .filter((ride) => ride.type === "Zone 2 benchmark")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const latestBenchmark = benchmarkRides[0];
  const previousBenchmark = benchmarkRides[1];
  const volumeHours = acuteRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0) / 3600;
  const volumeDistance = acuteRides.reduce((sum, ride) => sum + ride.distanceMiles, 0);
  const volumeElevation = acuteRides.reduce((sum, ride) => sum + ride.elevationFeet, 0);
  const loadStatus = acuteChronicRatio !== null && acuteChronicRatio > 1.5 ? "Review recent spike" : "Building steadily";
  const driftLabel = latestBenchmark?.decoupling === null || latestBenchmark?.decoupling === undefined
    ? "Not available"
    : latestBenchmark.decoupling < 3 ? "Excellent durability" : latestBenchmark.decoupling <= 5 ? "Good durability" : latestBenchmark.decoupling <= 8 ? "Moderate drift" : "Significant drift";
  const percentChange = (current: number, previous: number, invert = false) => {
    if (!previous) return "—";
    const delta = ((current - previous) / previous) * 100 * (invert ? -1 : 1);
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  };

  return (
    <div className="phase-two-layout">
      <section className="phase-two-hero panel-dark">
        <div><span className="eyebrow light">Performance details</span><h2>Compare like with like.</h2></div>
        <p>Repeated routes, controlled Zone 2 benchmarks, cadence stability, and workload context now use the rides in your log. Missing stream data stays visibly unavailable.</p>
      </section>

      <section className="phase-kpis">
        <MetricCard label="Acute load" value={Math.round(load7).toString()} unit="7 days" change={`${acuteRides.length} recent rides`} tone="lime" />
        <MetricCard label="Chronic load" value={Math.round(load28).toString()} unit="28d weekly avg" change={`${Math.round(load42)} pts · 42d avg`} tone="cream" />
        <MetricCard label="Load ratio" value={acuteChronicRatio?.toFixed(2) ?? "—"} unit="acute / chronic" change={loadStatus} tone="coral" />
        <MetricCard label="Benchmarks" value={benchmarkRides.length.toString()} unit="Zone 2 rides" change={`${groupedRoutes.length} repeated routes`} tone="sky" />
      </section>

      <section className="route-benchmarks panel">
        <div className="section-heading"><div><span className="eyebrow">Same-route comparison</span><h2>Like for like</h2></div><span className="small-badge">{groupedRoutes.length} matched</span></div>
        {groupedRoutes.length ? <div className="route-comparison-list">{groupedRoutes.slice(0, 3).map((group) => {
          const sorted = [...group].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
          const first = sorted[0];
          const latest = sorted.at(-1)!;
          return <article className="route-comparison" key={first.route.toLowerCase()}><div><strong>{first.route}</strong><span>{first.dateLabel} → {latest.dateLabel} · {group.length} efforts</span></div><dl><div><dt>Time</dt><dd>{percentChange(latest.movingTimeSeconds, first.movingTimeSeconds, true)}</dd></div><div><dt>Power</dt><dd>{percentChange(latest.averagePower, first.averagePower)}</dd></div><div><dt>Heart rate</dt><dd>{percentChange(latest.averageHeartRate, first.averageHeartRate, true)}</dd></div><div><dt>W / bpm</dt><dd>{percentChange(latest.powerHeartRateRatio, first.powerHeartRateRatio)}</dd></div></dl></article>;
        })}</div> : <div className="analysis-empty"><strong>No repeated route names yet.</strong><span>Use the same route/course name when importing repeat attempts.</span></div>}
      </section>

      <section className="benchmark-card panel">
        <div className="section-heading"><div><span className="eyebrow">Zone 2 benchmark</span><h2>{Math.round(currentFtp * 2 / 3)} W · 60 minutes</h2></div><span className="small-badge">85–90 rpm</span></div>
        {latestBenchmark ? <>
          <div className="benchmark-score"><div><span>Latest efficiency</span><strong>{latestBenchmark.powerHeartRateRatio ? latestBenchmark.powerHeartRateRatio.toFixed(3) : "—"}</strong><small>W / bpm · {latestBenchmark.dateLabel}</small></div>{previousBenchmark && <div><span>vs previous</span><strong>{percentChange(latestBenchmark.powerHeartRateRatio, previousBenchmark.powerHeartRateRatio)}</strong><small>{previousBenchmark.dateLabel}</small></div>}</div>
          <div className="benchmark-details"><Stat label="Average HR" value={latestBenchmark.averageHeartRate ? String(latestBenchmark.averageHeartRate) : "—"} unit="bpm" /><Stat label="First 15 min" value={latestBenchmark.first15HeartRate ? latestBenchmark.first15HeartRate.toFixed(0) : "—"} unit="bpm" /><Stat label="Final 15 min" value={latestBenchmark.final15HeartRate ? latestBenchmark.final15HeartRate.toFixed(0) : "—"} unit="bpm" /><Stat label="Cadence σ" value={latestBenchmark.cadenceStddev ? latestBenchmark.cadenceStddev.toFixed(1) : "—"} unit="rpm" /></div>
        </> : <div className="analysis-empty"><strong>No benchmark ride classified yet.</strong><span>Classify a controlled ride as “Zone 2 benchmark” during import.</span></div>}
      </section>

      <section className="durability-card panel">
        <div className="section-heading"><div><span className="eyebrow">Cardiac drift</span><h2>Aerobic durability</h2></div><span className="small-badge">steady rides only</span></div>
        <div className="drift-result"><strong>{latestBenchmark?.decoupling === null || latestBenchmark?.decoupling === undefined ? "—" : `${latestBenchmark.decoupling.toFixed(1)}%`}</strong><span>{driftLabel}</span></div>
        <p>Calculated from power / heart-rate efficiency in the first and second halves. Variable rides are intentionally excluded.</p>
      </section>

      <section className="cadence-card panel">
        <div className="section-heading"><div><span className="eyebrow">Cadence distribution</span><h2>Pedaling stability</h2></div></div>
        {latestBenchmark?.cadenceAcceptablePercent !== null && latestBenchmark?.cadenceAcceptablePercent !== undefined ? <div className="distribution-list">
          <DistributionRow label="Target · 85–90" value={latestBenchmark.cadenceTargetPercent ?? 0} tone="target" />
          <DistributionRow label="Endurance · 80–95" value={latestBenchmark.cadenceAcceptablePercent} tone="acceptable" />
          <DistributionRow label="Grinding · below 75" value={latestBenchmark.cadenceLowPercent ?? 0} tone="low" />
          <DistributionRow label="High · above 100" value={latestBenchmark.cadenceHighPercent ?? 0} tone="high" />
        </div> : <div className="analysis-empty compact"><strong>Cadence stream needed.</strong><span>FIT and TCX files usually contain the richest samples.</span></div>}
      </section>

      <section className="workload-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Weekly volume</span><h2>Load with context</h2></div><span className={`load-flag ${acuteChronicRatio !== null && acuteChronicRatio > 1.5 ? "alert" : ""}`}>{loadStatus}</span></div>
        <div className="workload-grid"><Stat label="Hours" value={volumeHours.toFixed(1)} /><Stat label="Distance" value={volumeDistance.toFixed(1)} unit="mi" /><Stat label="Elevation" value={Math.round(volumeElevation).toLocaleString()} unit="ft" /><Stat label="Training load" value={Math.round(load7).toString()} unit="pts" /><Stat label="Hard sessions" value={acuteRides.filter((ride) => ride.type === "Tempo" || ride.type === "Threshold").length.toString()} /></div>
        <p className="chart-note"><i /> The ratio flags abrupt workload changes for review; it is not presented as an exact injury threshold.</p>
      </section>
    </div>
  );
}

function DistributionRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="distribution-row"><span>{label}</span><div><i className={tone} style={{ width: `${Math.max(1, Math.min(100, value))}%` }} /></div><strong>{value.toFixed(0)}%</strong></div>;
}

type PhaseThreeInsights = {
  currentFtpWatts: number;
  ftpHistory: Array<{ effectiveAt: string; ftpWatts: number; source: string }>;
  prediction: { minimumWatts: number | null; maximumWatts: number | null; midpointWatts: number | null; confidence: string; signals: string[] };
  goal: { id: string; targetFtpWatts: number; createdAt: string } | null;
  integrations: {
    strava: { configured: boolean; connected: boolean; displayName: string | null; lastSyncedAt: string | null };
    garmin: { status: string; detail: string };
  };
};

function PlanToday({ rides, recovery, setRecovery, recoverySaveState, saveRecovery, currentFtp, setCurrentFtp }: {
  rides: Ride[];
  recovery: SubjectiveRecovery;
  setRecovery: (value: SubjectiveRecovery) => void;
  recoverySaveState: "idle" | "saving" | "saved" | "error";
  saveRecovery: () => Promise<void>;
  currentFtp: number;
  setCurrentFtp: (value: number) => void;
}) {
  const [insights, setInsights] = useState<PhaseThreeInsights | null>(null);
  const [goalTarget, setGoalTarget] = useState(200);
  const [ftpInput, setFtpInput] = useState(currentFtp);
  const [ftpSaveMessage, setFtpSaveMessage] = useState("");
  const [ftpSaveState, setFtpSaveState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionState, setActionState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [worldRotation, setWorldRotation] = useState<ZwiftRotation | null>(null);

  const loadInsights = async () => {
    const response = await fetch("/api/phase3", { cache: "no-store" });
    const payload = await response.json() as PhaseThreeInsights & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Training insights could not be loaded.");
    setInsights(payload);
    setCurrentFtp(payload.currentFtpWatts);
    setFtpInput(payload.currentFtpWatts);
    if (payload.goal) setGoalTarget(payload.goal.targetFtpWatts);
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as PhaseThreeInsights & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Training insights could not be loaded.");
        setInsights(payload);
        setCurrentFtp(payload.currentFtpWatts);
        setFtpInput(payload.currentFtpWatts);
        if (payload.goal) setGoalTarget(payload.goal.targetFtpWatts);
      })
      .catch(() => { if (active) setActionMessage("Saved insights are temporarily unavailable."); });
    return () => { active = false; };
  }, [setCurrentFtp]);

  useEffect(() => {
    let active = true;
    void fetch("/api/zwift/worlds")
      .then(async (response) => {
        if (!response.ok) throw new Error("Zwift world rotation could not be loaded.");
        return response.json() as Promise<ZwiftRotation>;
      })
      .then((rotation) => { if (active) setWorldRotation(rotation); })
      .catch(() => { if (active) setWorldRotation(null); });
    return () => { active = false; };
  }, []);

  const postAction = async (body: object, successMessage: string) => {
    setActionState("working");
    setActionMessage("");
    try {
      const response = await fetch("/api/phase3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The update could not be saved.");
      await loadInsights();
      setActionState("success");
      setActionMessage(successMessage);
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "The update could not be saved.");
    }
  };

  const saveFtp = async () => {
    const ftpWatts = Math.round(ftpInput);
    if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) {
      setFtpSaveState("error");
      setFtpSaveMessage("Enter an FTP between 50 and 500 watts.");
      return;
    }
    if (ftpWatts === currentFtp) {
      setFtpSaveState("success");
      setFtpSaveMessage(`${ftpWatts} W is already your saved FTP.`);
      return;
    }

    setActionState("working");
    setActionMessage("");
    setFtpSaveState("working");
    setFtpSaveMessage("Saving your working FTP…");
    try {
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "record_ftp", ftpWatts }),
      });
      const payload = await response.json() as { ftpWatts?: number; unchanged?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "FTP could not be saved.");
      await loadInsights();
      setActionState("success");
      setFtpSaveState("success");
      setFtpSaveMessage(payload.unchanged
        ? `${payload.ftpWatts ?? ftpWatts} W is already your saved FTP.`
        : `Saved. Your working FTP is now ${payload.ftpWatts ?? ftpWatts} W.`);
    } catch (error) {
      setActionState("error");
      setFtpSaveState("error");
      setFtpSaveMessage(error instanceof Error ? error.message : "FTP could not be saved.");
    }
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const timestamps = rides.map((ride) => Date.parse(ride.date)).filter(Number.isFinite);
  const anchorMs = timestamps.length ? Math.max(...timestamps) : Date.parse("2026-08-07");
  const block = (startDaysAgo: number, endDaysAgo: number) => {
    const blockRides = rides.filter((ride) => {
      const timestamp = Date.parse(ride.date);
      return timestamp <= anchorMs - (endDaysAgo * dayMs) && timestamp > anchorMs - (startDaysAgo * dayMs);
    });
    const powered = blockRides.filter((ride) => ride.averagePower > 0);
    const efficient = blockRides.filter((ride) => ride.powerHeartRateRatio > 0);
    return {
      rides: blockRides.length,
      hours: blockRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0) / 3600,
      load: blockRides.reduce((sum, ride) => sum + ride.trainingLoad, 0),
      averagePower: powered.length ? powered.reduce((sum, ride) => sum + ride.averagePower, 0) / powered.length : 0,
      efficiency: efficient.length ? efficient.reduce((sum, ride) => sum + ride.powerHeartRateRatio, 0) / efficient.length : 0,
    };
  };
  const currentBlock = block(42, 0);
  const priorBlock = block(84, 42);
  const acuteLoad = block(7, 0).load;
  const chronicLoad = block(28, 0).load / 4;
  const loadRatio = chronicLoad > 0 ? acuteLoad / chronicLoad : null;
  const latestHardRide = rides.filter((ride) => ride.type === "Tempo" || ride.type === "Threshold").sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const readiness = calculateReadiness({
    hoursSinceLastHardRide: latestHardRide ? Math.max(0, (anchorMs - Date.parse(latestHardRide.date)) / (60 * 60 * 1000)) : 72,
    acuteChronicRatio: loadRatio,
    subjective: recovery,
  });
  const planningInput = { readinessScore: readiness.score, kneePain: recovery.kneePain ?? 0, acuteChronicRatio: loadRatio, recentHardSessions: block(7, 0).rides ? rides.filter((ride) => (ride.type === "Tempo" || ride.type === "Threshold") && Date.parse(ride.date) > anchorMs - (7 * dayMs)).length : 0 };
  const workout = recommendWorkout(planningInput);
  const availableWorlds = worldRotation?.availableWorlds ?? ["Watopia"];
  const routeSuite = recommendZwiftRoutes(workout.mode, currentFtp, availableWorlds);
  const selectedRoute = routeSuite.find((suggestion) => suggestion.route.id === selectedRouteId)
    ?? routeSuite.find((suggestion) => suggestion.recommended)
    ?? routeSuite[0];
  const weeklyPlan = buildWeeklyPlan(planningInput);
  const prediction = insights?.prediction;
  const projectedFromFtp = prediction?.midpointWatts ?? currentFtp;
  const projection = projectFtpGoal(projectedFromFtp, goalTarget, new Date(anchorMs).toISOString());
  const change = (current: number, previous: number, suffix = "") => previous ? `${current >= previous ? "+" : ""}${(current - previous).toFixed(1)}${suffix}` : "—";
  const projectionDate = (date: string | null) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";

  return (
    <div className="phase-three-layout">
      <section className="phase-three-hero panel-dark">
        <div><span className="eyebrow light">Plan today · adapts with your check-in</span><h2>{workout.primary}</h2><p className="plan-hero-detail">{workout.detail}</p></div>
        <div className="forecast-stamp"><span>Readiness</span><strong>{readiness.score}</strong><small>{readiness.label}</small></div>
      </section>

      {actionMessage && <div className={`phase-action-message ${actionState}`}>{actionMessage}</div>}

      <RecoveryCheckIn recovery={recovery} setRecovery={setRecovery} recoverySaveState={recoverySaveState} saveRecovery={saveRecovery} readiness={readiness} />

      <section className="workout-card panel">
        <div className="section-heading"><div><span className="eyebrow">Why this choice</span><h2>Keep the guardrails visible</h2></div></div>
        <p>{workout.detail}</p><div className="avoid-strip"><span>Avoid today</span><strong>{workout.avoid}</strong></div>
      </section>

      <section className="route-suite panel full-width">
        <div className="section-heading route-suite-heading">
          <div><span className="eyebrow">Zwift route match</span><h2>Choose the time you actually have</h2><p>Three options from the worlds available in Zwift today. The timer is the commitment; finishing the route is optional.</p></div>
          <span className={`small-badge ${workout.mode === "rest" ? "paused" : ""}`}>{workout.mode === "rest" ? "paused by rest guardrail" : "30 · 60 · 90 min"}</span>
        </div>

        <div className="available-worlds" aria-label="Zwift worlds available today">
          <span>Available today</span>
          {availableWorlds.map((world) => <strong key={world}>{world}</strong>)}
          <small>{worldRotation ? (worldRotation.status === "live" ? "Live rotation" : "Saved rotation") : "Checking rotation…"}</small>
        </div>

        {workout.mode === "rest" && <div className="route-guardrail"><strong>Routes are on hold today.</strong><span>Update the recovery check-in when you feel ready; the choices will unlock when the plan no longer calls for complete rest.</span></div>}

        <div className="route-choice-grid" role="radiogroup" aria-label="Choose a Zwift route by time commitment">
          {routeSuite.map((suggestion) => {
            const isSelected = selectedRoute.route.id === suggestion.route.id;
            return (
              <button
                type="button"
                key={`${suggestion.commitment}-${suggestion.route.id}`}
                className={`route-choice ${isSelected ? "selected" : ""}`}
                aria-pressed={isSelected}
                disabled={suggestion.disabled}
                onClick={() => setSelectedRouteId(suggestion.route.id)}
              >
                <span className="route-choice-head">
                  <span><small>{suggestion.commitment} minutes · {suggestion.route.profile}</small><strong>{suggestion.route.name}</strong></span>
                  <em>{suggestion.recommended ? "Best fit" : isSelected ? "Selected" : "Option"}</em>
                </span>

                <span className="route-image-wrap">
                  <Image src={`/zwift-routes/${suggestion.route.id}.png`} width={355} height={290} alt={`${suggestion.route.name} route map from Zwift`} />
                  <span className="official-route-label">Official Zwift map</span>
                </span>

                <span className="route-facts">
                  <span><small>World</small><strong>{suggestion.route.world}</strong></span>
                  <span><small>Distance</small><strong>{suggestion.route.distanceMiles.toFixed(1)} mi</strong></span>
                  <span><small>Climbing</small><strong>{suggestion.route.elevationFeet} ft</strong></span>
                </span>

                <span className="route-prescription">
                  <span><small>Target power</small><strong>{suggestion.targetWatts}</strong></span>
                  <span><small>Heart-rate cue</small><strong>{suggestion.heartRateCue}</strong></span>
                </span>
                <span className="route-reason">{suggestion.reason}</span>
                <span className="route-time-cue">{suggestion.timingCue}</span>
              </button>
            );
          })}
        </div>

        <div className="route-suite-footer">
          <span>{workout.mode === "rest" ? "Rest remains today's recommendation." : <><strong>Selected:</strong> {selectedRoute.route.name} · {selectedRoute.commitment} min · {selectedRoute.targetWatts}</>}</span>
          <span className="route-source-links"><a href="https://support.zwift.com/zwift-worlds-and-cycling-routes-rk3PMBUht" target="_blank" rel="noreferrer">Official route details ↗</a><a href={worldRotation?.sourceUrl ?? "https://zwiftinsider.com/schedule/"} target="_blank" rel="noreferrer">World calendar ↗</a></span>
        </div>
      </section>

      <section className="weekly-plan panel full-width">
        <div className="section-heading"><div><span className="eyebrow">The next seven days</span><h2>A useful plan, not a rigid prescription</h2></div><span className="small-badge">adapts to check-in + load</span></div>
        <div className="week-grid">{weeklyPlan.map((day, index) => <article key={day.day} className={index === 0 ? "today" : ""}><span>{day.day}</span><strong>{day.session}</strong><small>{day.purpose}</small></article>)}</div>
        <p className="chart-note"><i /> Regenerate the guidance by updating the recovery check-in or importing new training. Stop for pain or unusual symptoms.</p>
      </section>

      <section className="ftp-forecast panel">
        <div className="section-heading"><div><span className="eyebrow">Automatic FTP prediction</span><h2>{prediction?.minimumWatts !== null && prediction?.minimumWatts !== undefined ? `${prediction.minimumWatts}–${prediction.maximumWatts} W` : "More evidence needed"}</h2></div><span className="small-badge">{prediction?.confidence ?? "loading"} confidence</span></div>
        <div className="forecast-scale"><i style={{ width: `${Math.min(100, Math.max(4, ((prediction?.midpointWatts ?? currentFtp) / Math.max(250, goalTarget)) * 100))}%` }} /></div>
        <div className="signal-list">{(prediction?.signals ?? ["Import a ride with 20–60 minutes of recorded power."]).map((signal) => <span key={signal}>· {signal}</span>)}</div>
        <div className="confirm-ftp"><label><span>Working FTP</span><input type="number" min="50" max="500" value={ftpInput} onChange={(event) => { setFtpInput(Number(event.target.value)); setFtpSaveMessage(""); setFtpSaveState("idle"); }} /></label>{prediction?.midpointWatts && <button className="text-button" onClick={() => { setFtpInput(prediction.midpointWatts!); setFtpSaveMessage(""); setFtpSaveState("idle"); }}>Use midpoint</button>}<button className="primary-button" onClick={() => void saveFtp()} disabled={actionState === "working"}>{ftpSaveState === "working" ? "Saving…" : "Save FTP"}</button></div>
        <p className={`ftp-save-status ${ftpSaveState}`} aria-live="polite">{ftpSaveMessage || `Current saved FTP: ${currentFtp} W.`}</p>
        <p className="chart-note"><i /> Predictions are advisory ranges. Your working FTP changes only after you confirm it.</p>
      </section>

      <section className="goal-card panel">
        <div className="section-heading"><div><span className="eyebrow">Goal projection</span><h2>{goalTarget} W FTP</h2></div></div>
        <div className="goal-control"><label><span>Target</span><select value={goalTarget} onChange={(event) => setGoalTarget(Number(event.target.value))}>{[175, 200, 225, 250].map((target) => <option key={target} value={target}>{target} W</option>)}</select></label><button className="secondary-button" onClick={() => void postAction({ action: "set_goal", targetFtpWatts: goalTarget }, `${goalTarget} W goal saved.`)} disabled={actionState === "working"}>Save goal</button></div>
        <div className="projection-list"><div><span>Aggressive</span><strong>{projectionDate(projection.aggressiveDate)}</strong></div><div><span>Current trend</span><strong>{projectionDate(projection.currentTrendDate)}</strong></div><div><span>Conservative</span><strong>{projectionDate(projection.conservativeDate)}</strong></div></div>
        <p>{projection.disclaimer}</p>
      </section>

      <section className="block-card panel">
        <div className="section-heading"><div><span className="eyebrow">Training-block comparison</span><h2>Recent 6 weeks vs prior 6</h2></div></div>
        <div className="block-table"><span>Metric</span><span>Prior</span><span>Recent</span><span>Change</span><strong>Rides</strong><span>{priorBlock.rides}</span><span>{currentBlock.rides}</span><b>{change(currentBlock.rides, priorBlock.rides)}</b><strong>Hours</strong><span>{priorBlock.hours.toFixed(1)}</span><span>{currentBlock.hours.toFixed(1)}</span><b>{change(currentBlock.hours, priorBlock.hours, "h")}</b><strong>Avg power</strong><span>{priorBlock.averagePower.toFixed(0)} W</span><span>{currentBlock.averagePower.toFixed(0)} W</span><b>{change(currentBlock.averagePower, priorBlock.averagePower, " W")}</b><strong>W / bpm</strong><span>{priorBlock.efficiency.toFixed(3)}</span><span>{currentBlock.efficiency.toFixed(3)}</span><b>{change(currentBlock.efficiency, priorBlock.efficiency)}</b><strong>Load</strong><span>{priorBlock.load.toFixed(0)}</span><span>{currentBlock.load.toFixed(0)}</span><b>{change(currentBlock.load, priorBlock.load)}</b></div>
      </section>

    </div>
  );
}

function ConnectedSources({ refreshRides }: { refreshRides: () => Promise<void> }) {
  const [insights, setInsights] = useState<PhaseThreeInsights | null>(null);
  const [actionState, setActionState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");

  const loadInsights = async () => {
    const response = await fetch("/api/phase3", { cache: "no-store" });
    const payload = await response.json() as PhaseThreeInsights & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Connected sources could not be loaded.");
    setInsights(payload);
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as PhaseThreeInsights & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Connected sources could not be loaded.");
        setInsights(payload);
      })
      .catch(() => { if (active) setActionMessage("Connection status is temporarily unavailable."); });
    return () => { active = false; };
  }, []);

  const syncStrava = async (mode: "new" | "six_months") => {
    setActionState("working");
    setActionMessage(mode === "six_months"
      ? "Importing six months of Strava rides… Summaries are saved first, then detailed streams are added within the rate limit."
      : "Checking Strava for new rides…");
    try {
      const response = await fetch("/api/integrations/strava/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json() as {
        imported?: number;
        skipped?: number;
        streamsImported?: number;
        streamsReprocessed?: number;
        streamFailures?: number;
        streamDeferred?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Strava sync failed.");
      await refreshRides();
      await loadInsights();
      setActionState("success");
      const base = mode === "six_months"
        ? `${payload.imported ?? 0} rides saved from the last six months · ${payload.skipped ?? 0} already stored`
        : `${payload.imported ?? 0} new rides saved · ${payload.skipped ?? 0} existing rides checked`;
      const streamNote = payload.streamsImported ? ` · ${payload.streamsImported} detailed streams added` : "";
      const reprocessedNote = payload.streamsReprocessed ? ` · ${payload.streamsReprocessed} stored rides recalculated` : "";
      const deferredNote = payload.streamDeferred ? ` · ${payload.streamDeferred} detailed streams will fill in on a later import` : "";
      const failureNote = payload.streamFailures ? ` · ${payload.streamFailures} stream requests unavailable` : "";
      setActionMessage(`${base}${streamNote}${reprocessedNote}${deferredNote}${failureNote}`);
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava sync failed.");
    }
  };

  const disconnectStrava = async () => {
    setActionState("working");
    try {
      const response = await fetch("/api/integrations/strava/disconnect", { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Strava could not be disconnected.");
      await loadInsights();
      setActionState("success");
      setActionMessage("Strava access was revoked. Synced rides remain in your private log.");
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava could not be disconnected.");
    }
  };

  return (
    <section className="connections-card panel full-width">
      <div className="section-heading"><div><span className="eyebrow">Connected sources</span><h2>Bring activities in automatically</h2></div><span className="small-badge">private account</span></div>
      {actionMessage && <div className={`phase-action-message ${actionState}`}>{actionMessage}</div>}
      <div className="connection-grid">
        <article className="connection-tile strava-source">
          <div className="connection-mark strava">S</div>
          <div>
            <strong>Strava</strong>
            <span>{insights?.integrations.strava.connected ? `Connected${insights.integrations.strava.displayName ? ` · ${insights.integrations.strava.displayName}` : ""}` : insights?.integrations.strava.configured ? "Ready to connect with read-only activity access" : "App registration credentials are still needed"}</span>
            {insights?.integrations.strava.connected && <small>Six-month history and new-ride sync use Strava IDs to prevent duplicates.</small>}
            {insights?.integrations.strava.lastSyncedAt && <small>Last sync {new Date(insights.integrations.strava.lastSyncedAt).toLocaleString()}</small>}
          </div>
          <div className="connection-actions">
            {insights?.integrations.strava.connected ? <>
              <button className="primary-button" onClick={() => void syncStrava("new")} disabled={actionState === "working"}>Sync new rides</button>
              <button className="secondary-button" onClick={() => void syncStrava("six_months")} disabled={actionState === "working"}>Import last 6 months</button>
              <button className="text-button" onClick={() => void disconnectStrava()} disabled={actionState === "working"}>Disconnect</button>
            </> : <button className="primary-button strava-button" onClick={() => window.location.assign("/api/integrations/strava/start")} disabled={!insights?.integrations.strava.configured}>Connect with Strava</button>}
          </div>
        </article>
        <article className="connection-tile"><div className="connection-mark garmin">G</div><div><strong>Garmin Connect</strong><span>Cloud sync requires Garmin Developer Program approval.</span><small>Garmin FIT files already receive full stream analysis.</small></div><a className="secondary-link" href="https://developer.garmin.com/gc-developer-program/activity-api/" target="_blank" rel="noreferrer">Application details ↗</a></article>
      </div>
    </section>
  );
}

function ImportRide({ detected, filename, error, isReading, isSaving, isDragging, hasFile, rideType, setRideType, routeName, setRouteName, setIsDragging, fileInput, onFileChange, onDrop, onDemo, onAdd, onReset }: {
  detected: DetectedActivity | null;
  filename: string;
  error: string;
  isReading: boolean;
  isSaving: boolean;
  isDragging: boolean;
  hasFile: boolean;
  rideType: Ride["type"];
  setRideType: (value: Ride["type"]) => void;
  routeName: string;
  setRouteName: (value: string) => void;
  setIsDragging: (value: boolean) => void;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDemo: () => void;
  onAdd: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="import-layout">
      <section className="import-intro">
        <span className="eyebrow">Original files first</span>
        <h2>Bring the ride home.</h2>
        <p>Import the richest recording available. Your original file and calculated ride are saved privately, and the dashboard reloads them on your next visit.</p>
        <ol>
          <li><span>01</span><div><strong>Upload</strong><small>FIT, TCX, or GPX activity file</small></div></li>
          <li><span>02</span><div><strong>Review</strong><small>Confirm detected and missing values</small></div></li>
          <li><span>03</span><div><strong>Save</strong><small>Store the original and transparent metrics</small></div></li>
        </ol>
      </section>
      <section className="import-workspace panel">
        {!detected ? <>
          <div className={`dropzone ${isDragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
            <input ref={fileInput} type="file" accept=".fit,.tcx,.gpx" onChange={onFileChange} hidden />
            <div className="file-glyph">↑</div>
            <h3>{isReading ? "Reading the activity…" : "Drop a ride file here"}</h3>
            <p>Original FIT preferred · TCX and GPX accepted · 25 MB maximum</p>
            <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={isReading}>Choose a file</button>
          </div>
          {filename && <div className={`file-message ${error ? "error" : ""}`}><strong>{filename}</strong><span>{error || "Ready for review"}</span></div>}
          <div className="demo-callout"><div><strong>No export nearby?</strong><span>Preview the review flow. Demo rides are never saved.</span></div><button className="text-button" onClick={onDemo}>Use demo file →</button></div>
        </> : (
          <div className="review-panel">
            <div className="review-heading"><div><span className="eyebrow">Detected ride · {detected.sampleCount.toLocaleString()} samples</span><h2>{detected.name}</h2><p>{filename}</p></div><span className="small-badge">{hasFile ? "Ready to save" : "Demo only"}</span></div>
            <div className="detected-grid">
              <ReviewField label="Start" value={detected.startedAt ? new Date(detected.startedAt).toLocaleString() : "Missing"} />
              <ReviewField label="Moving time" value={detected.movingTimeSeconds ? formatDuration(detected.movingTimeSeconds) : "Missing"} />
              <ReviewField label="Distance" value={detected.distanceMeters ? `${miles(detected.distanceMeters)} mi` : "Missing"} />
              <ReviewField label="Elevation" value={detected.elevationGainMeters ? `${feet(detected.elevationGainMeters)} ft` : "Missing"} />
              <ReviewField label="Average power" value={detected.averagePower ? `${Math.round(detected.averagePower)} W` : "Missing"} />
              <ReviewField label="Average HR" value={detected.averageHeartRate ? `${Math.round(detected.averageHeartRate)} bpm` : "Missing"} />
              <ReviewField label="Cadence" value={detected.averageCadence ? `${Math.round(detected.averageCadence)} rpm` : "Missing"} />
              <label className="review-field"><span>Route / course</span><input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Use the same name for repeated routes" /></label>
              <label className="review-field"><span>Ride type</span><select value={rideType} onChange={(event) => setRideType(event.target.value as Ride["type"])}>{rideTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            </div>
            {detected.warnings.length > 0 && <div className="warning-box"><strong>Check before saving</strong>{detected.warnings.map((warning) => <span key={warning}>· {warning}</span>)}</div>}
            {error && <div className="warning-box error"><strong>Could not save this ride</strong><span>{error}</span></div>}
            <div className="review-actions"><button className="ghost-button" onClick={onReset} disabled={isSaving}>Start over</button><button className="primary-button wide" onClick={() => void onAdd()} disabled={isSaving}>{isSaving ? "Saving securely…" : hasFile ? "Save to ride log" : "Preview demo ride"} <span>→</span></button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <label className="review-field"><span>{label}</span><input value={value} readOnly /></label>;
}

function Methodology({ currentFtp }: { currentFtp: number }) {
  const methods = [
    { id: "01", title: "Power / HR ratio", formula: "average power ÷ average heart rate", note: "Contextual efficiency signal for comparable steady rides." },
    { id: "02", title: "Intensity factor", formula: "normalized power ÷ FTP", note: "Average power is used only as an explicitly marked estimate." },
    { id: "03", title: "Training load", formula: "hours × intensity² × 100", note: "A transparent TSS-like load, not a licensed physiological diagnosis." },
    { id: "04", title: "Aerobic decoupling", formula: "median interval efficiency · first half vs second half", note: "Ten equal-duration intervals reduce distortion from normal surges and coasting; variable rides remain directional." },
    { id: "05", title: "Load ratio", formula: "7-day load ÷ 28-day weekly average", note: "A review signal for abrupt changes, never an exact injury threshold." },
    { id: "06", title: "Readiness", formula: "recovery time + load + check-in", note: "A weighted, explainable score. Pain caps the result and overrides hard-ride advice." },
    { id: "07", title: "FTP prediction", formula: "20–60 min best power × duration factor", note: "A conservative range from recorded efforts, with confidence tied to available evidence." },
    { id: "08", title: "Goal scenarios", formula: "watts remaining ÷ monthly scenario", note: "Multiple clearly labeled estimates; never a promised achievement date." },
  ];
  return <div className="method-layout"><section className="method-hero panel-dark"><span className="eyebrow light">Explainable by design</span><h2>No mystery score.</h2><p>Every recommendation is assembled from visible inputs, conservative rules, and versioned calculations. Pain always overrides the number.</p><div className="version-stamp"><span>Current ruleset</span><strong>v3.1</strong></div></section><section className="method-list panel"><div className="section-heading"><div><span className="eyebrow">Metric dictionary</span><h2>What the app calculates</h2></div></div>{methods.map((method) => <article key={method.id} className="method-row"><span>{method.id}</span><div><strong>{method.title}</strong><code>{method.formula}</code><p>{method.note}</p></div></article>)}</section><section className="config-card panel"><div className="section-heading"><div><span className="eyebrow">Athlete configuration</span><h2>Current working values</h2></div></div><div className="config-grid"><Stat label="FTP" value={String(currentFtp)} unit="W" /><Stat label="Zone 2 target" value={String(Math.round(currentFtp * 2 / 3))} unit="W" /><Stat label="Cadence band" value="85–90" unit="rpm" /><Stat label="Next milestone" value="175" unit="W" /></div><p className="chart-note"><i /> FTP and goals can be updated from Plan Today; each calculation records the working value used.</p></section></div>;
}
