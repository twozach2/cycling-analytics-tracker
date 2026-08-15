export type ThemeId = "citrus" | "night-city" | "midnight" | "alpine";

export const themeOptions: ReadonlyArray<{
  id: ThemeId;
  name: string;
  description: string;
  swatches: readonly [string, string, string, string];
}> = [
  {
    id: "citrus",
    name: "Citrus Paper",
    description: "The original warm paper palette with a sharp lime signal.",
    swatches: ["#f4f1e8", "#171a16", "#d7ff62", "#a9d9e7"],
  },
  {
    id: "night-city",
    name: "Night Circuit",
    description: "Electric yellow, cyan, and hot pink over a deep blue-black cockpit.",
    swatches: ["#080a16", "#f9f002", "#00f0ff", "#ff2a6d"],
  },
  {
    id: "midnight",
    name: "Midnight Volt",
    description: "Low-glare navy with cool blue and acid-green training cues.",
    swatches: ["#0b1220", "#dbeafe", "#7dd3fc", "#a3e635"],
  },
  {
    id: "alpine",
    name: "Alpine Day",
    description: "Cool stone, glacier blue, and evergreen for daylight sessions.",
    swatches: ["#edf3f0", "#16302a", "#86c5d8", "#d6ed8b"],
  },
];
