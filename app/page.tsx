import type { Metadata } from "next";
import CyclingDashboard from "./CyclingDashboard";

export const metadata: Metadata = {
  title: "Today",
  description: "A personal, explainable cycling performance and recovery dashboard.",
};

export default function Home() {
  return <CyclingDashboard />;
}
