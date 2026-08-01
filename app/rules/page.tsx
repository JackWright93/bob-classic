"use client";

import { useRouter } from "next/navigation";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

const SECTIONS = [
  {
    title: "Individual Scoring",
    icon: "⛳",
    rows: [
      { label: "Net Birdie", points: "+1 pt" },
      { label: "Net Eagle", points: "+3 pts" },
      { label: "Hole-in-One", points: "+5 pts" },
    ],
  },
  {
    title: "Round Placement",
    icon: "🏆",
    rows: [
      { label: "Low Gross Round — 1st", points: "+3 pts" },
      { label: "Low Gross Round — 2nd", points: "+2 pts" },
      { label: "Low Gross Round — 3rd", points: "+1 pt" },
    ],
  },
  {
    title: "Team Scoring",
    icon: "👥",
    rows: [
      { label: "Team Best Ball (net) — 1st", points: "+3 pts" },
      { label: "Team Best Ball (net) — 2nd", points: "+2 pts" },
      { label: "Team Best Ball (net) — 3rd", points: "+1 pt" },
    ],
  },
  {
    title: "Special Holes",
    icon: "🎯",
    rows: [
      { label: "Longest Drive", points: "+1 pt" },
      { label: "Closest to Pin", points: "+1 pt" },
    ],
  },
  {
    title: "Live Feed Callouts",
    icon: "⚡",
    rows: [
      { label: "Par Train 🚂 (4 pars in a row)", points: "Bragging rights" },
      { label: "At the Turn (team score after 9)", points: "Bragging rights" },
    ],
  },
];

export default function RulesPage() {
  const router = useRouter();

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>📖 Scoring & Rules</h1>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>

        <div style={{ background: "#fffbeb", border: `1px solid ${GOLD}66`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: DARK_GREEN, margin: 0, lineHeight: 1.5 }}>
            "Net" scores account for handicap strokes received on each hole. Every category below stacks — a hole-in-one on a team's best-ball winning hole scores points in multiple categories at once.
          </p>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.title} style={{ background: WHITE, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>{section.icon}</span>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>{section.title}</h2>
            </div>
            <div style={{ padding: "8px 16px" }}>
              {section.rows.map((row, i) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < section.rows.length - 1 ? "1px solid #f0f2f0" : "none" }}>
                  <span style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: 13, color: GOLD, fontWeight: 800 }}>{row.points}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p style={{ textAlign: "center", color: GRAY, fontSize: 12, marginTop: 8 }}>
          Questions about a ruling? Ask an admin — final say goes to whoever's buying the beers.
        </p>
      </div>
    </main>
  );
}
