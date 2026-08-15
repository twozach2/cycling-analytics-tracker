import { METHOD_DEFINITIONS } from "@/lib/markdown-export";
import { themeOptions, type ThemeId } from "@/app/theme";

type MethodologyProps = {
  currentFtp: number;
  currentWeightKg: number;
  currentLthr: number | null;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  installPromptAvailable: boolean;
  isStandaloneApp: boolean;
  installDesktopApp: () => Promise<void>;
};

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong></div>;
}

export function Methodology({ currentFtp, currentWeightKg, currentLthr, theme, setTheme, installPromptAvailable, isStandaloneApp, installDesktopApp }: MethodologyProps) {
  return <div className="method-layout">
    <section className="theme-card panel">
      <div className="section-heading"><div><span className="eyebrow">Appearance</span><h2>Choose your ride room</h2><p>Four complete palettes, tuned for clarity in different light.</p></div></div>
      <div className="theme-grid" role="radiogroup" aria-label="Color theme">
        {themeOptions.map((option) => <button
          key={option.id}
          type="button"
          className={`theme-option ${theme === option.id ? "selected" : ""}`}
          aria-pressed={theme === option.id}
          onClick={() => setTheme(option.id)}
        >
          <span className="theme-swatch" aria-hidden="true" style={{ backgroundColor: option.swatches[0] }}>
            {option.swatches.slice(1).map((color) => <i key={color} style={{ backgroundColor: color }} />)}
          </span>
          <span className="theme-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
          <em>{theme === option.id ? "Active" : "Use theme"}</em>
        </button>)}
      </div>
      <p className="chart-note"><i /> Theme, last tab, selected ride, and ride-log controls are remembered on this device.</p>
    </section>
    <section className="install-card panel">
      <div className="install-mark" aria-hidden="true">CA</div>
      <div>
        <span className="eyebrow">Desktop app</span>
        <h2>{isStandaloneApp ? "Installed and ready." : "Give the tracker its own window."}</h2>
        <p>{isStandaloneApp
          ? "This copy launches independently and keeps its local theme, navigation, and ride-log preferences between sessions."
          : "Install Cycling Analytics from Edge or Chrome for a Start-menu icon, standalone window, and device-local preference retention."}</p>
      </div>
      {isStandaloneApp
        ? <span className="install-status"><i /> Running as an app</span>
        : installPromptAvailable
          ? <button className="primary-button" type="button" onClick={() => void installDesktopApp()}>Install app <span>↓</span></button>
          : <span className="install-help">Use your browser menu → Install Cycling Analytics</span>}
    </section>
    <section className="method-hero panel-dark"><span className="eyebrow light">Explainable by design</span><h2>No mystery score.</h2><p>Every recommendation is assembled from visible inputs, conservative rules, and versioned calculations. Pain always overrides the number.</p><div className="version-stamp"><span>Current ruleset</span><strong>v3.6</strong></div></section>
    <section className="method-list panel"><div className="section-heading"><div><span className="eyebrow">Metric dictionary</span><h2>What the app calculates</h2></div></div>{METHOD_DEFINITIONS.map((method) => <article key={method.id} className="method-row"><span>{method.id}</span><div><strong>{method.title}</strong><code>{method.formula}</code><p>{method.note}</p></div></article>)}</section>
    <section className="config-card panel"><div className="section-heading"><div><span className="eyebrow">Athlete configuration</span><h2>Current working values</h2></div></div><div className="config-grid"><Stat label="FTP" value={String(currentFtp)} unit="W" /><Stat label="Body weight" value={String(Math.round(currentWeightKg * 2.2046226218))} unit="lb" /><Stat label="FTP / weight" value={(currentFtp / currentWeightKg).toFixed(2)} unit="W/kg" /><Stat label="LTHR" value={currentLthr === null ? "Not set" : String(currentLthr)} unit={currentLthr === null ? undefined : "bpm"} /><Stat label="Zone 2 target" value={String(Math.round(currentFtp * 2 / 3))} unit="W" /></div><p className="chart-note"><i /> FTP, body weight, and optional LTHR can be updated from Plan Today. Every ride keeps its own FTP snapshot; heart-rate distributions record the LTHR used and should be reprocessed after a threshold change.</p></section>
  </div>;
}
