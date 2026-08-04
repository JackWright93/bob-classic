"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";

type Winner = {
  id: string;
  year: number;
  winner_name: string;
  photo_url: string | null;
  total_points: number | null;
  notes: string | null;
  location: string | null;
};

type Standing = { id: string; historical_winner_id: string; rank: number; player_name: string; points: number; };
type CourseScore = { id: string; historical_winner_id: string; course_name: string; player_name: string; gross_score: number | null; sort_order: number; };
type PlayerRef = { id: string; name: string; };

type Tab = "standings" | "courses";

function HistoryInner() {
  const router = useRouter();
  const [winners, setWinners] = useState<Winner[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [courseScores, setCourseScores] = useState<CourseScore[]>([]);
  const [players, setPlayers] = useState<PlayerRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, Tab>>({});

  const borderColors = [GOLD, GREEN, "#7c3aed", "#dc2626", "#2563eb", "#0891b2", "#d97706", "#059669", "#db2777"];

  const load = async () => {
    const { data: w } = await supabase.from("historical_winners").select("*").order("year", { ascending: false });
    const { data: s } = await supabase.from("historical_standings").select("*").order("rank", { ascending: true });
    const { data: c } = await supabase.from("historical_course_scores").select("*").order("sort_order", { ascending: true });
    const { data: p } = await supabase.from("players").select("id, name");

    setWinners(w ?? []);
    setStandings(s ?? []);
    setCourseScores(c ?? []);
    setPlayers(p ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (winnerId: string) => {
    setExpandedId((prev) => (prev === winnerId ? null : winnerId));
    setActiveTab((prev) => ({ ...prev, [winnerId]: prev[winnerId] ?? "standings" }));
  };

  const groupCoursesByName = (winnerId: string) => {
    const scores = courseScores.filter((c) => c.historical_winner_id === winnerId);
    const courseNames = Array.from(new Set(scores.map((s) => s.course_name)));
    return courseNames.map((name) => ({
      name,
      players: scores.filter((s) => s.course_name === name).sort((a, b) => (a.gross_score ?? 999) - (b.gross_score ?? 999)),
    }));
  };

  // Only the most recent year's standings link out to live per-hole scoring breakdowns —
  // older years' rounds get wiped/replaced each season, so their live data no longer applies.
  const mostRecentYear = winners.length > 0 ? Math.max(...winners.map((w) => w.year)) : null;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: GREEN, padding: "16px 20px 28px", textAlign: "center", position: "relative" }}>
        <button onClick={() => router.push("/")} style={{ position: "absolute", left: 20, top: 18, background: "none", border: "none", color: WHITE, fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: WHITE, fontSize: 24, fontWeight: "bold", margin: 0 }}>Hall of Champions</h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>The Bob Classic — All-Time Winners</p>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY }}>Loading...</p>}

        {!loading && winners.map((winner, index) => {
          const color = borderColors[index % borderColors.length];
          const isExpanded = expandedId === winner.id;
          const tab = activeTab[winner.id] ?? "standings";
          const isTBD = winner.winner_name === "TBD";
          const winnerStandings = standings.filter((s) => s.historical_winner_id === winner.id);
          const courses = groupCoursesByName(winner.id);
          const canLinkToScoring = winner.year === mostRecentYear;

          return (
            <div key={winner.id} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", border: `3px solid ${color}` }}>
              {winner.photo_url ? (
                <img src={winner.photo_url} alt={winner.winner_name}
                  style={{ width: "100%", height: 400, objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: 300, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>🏌️</div>
              )}

              <div style={{ background: WHITE, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#111" }}>
                      {isTBD ? "🚧 In Progress" : winner.winner_name}
                    </div>
                    <div style={{ fontSize: 15, color: GRAY, marginTop: 2 }}>{winner.location}</div>
                  </div>
                  <div style={{ background: color, color: WHITE, borderRadius: 10, padding: "6px 14px", fontSize: 16, fontWeight: "bold" }}>
                    {winner.year}
                  </div>
                </div>
                {winner.notes && (
                  <p style={{ marginTop: 10, fontSize: 13, color: GRAY, fontStyle: "italic", borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>{winner.notes}</p>
                )}

                {/* Dropdown toggle */}
                <button onClick={() => toggleExpand(winner.id)}
                  style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: `1px solid ${color}55`, background: isExpanded ? color : "#f9fafb", color: isExpanded ? WHITE : "#374151", cursor: "pointer", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {isExpanded ? "Hide Details" : "View Details"} {isExpanded ? "▲" : "▼"}
                </button>

                {/* Gallery — its own page, not part of the dropdown */}
                <button onClick={() => router.push(`/history/${winner.id}/gallery`)}
                  style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 10, border: `1px solid ${GOLD}55`, background: "#fffbeb", color: "#8a6d1f", cursor: "pointer", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  📸 Gallery →
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 12 }}>
                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 6, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 14 }}>
                      {[
                        { key: "standings" as Tab, label: "🏆 Standings" },
                        { key: "courses" as Tab, label: "⛳ Courses" },
                      ].map((t) => (
                        <button key={t.key} onClick={() => setActiveTab((prev) => ({ ...prev, [winner.id]: t.key }))}
                          style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", background: tab === t.key ? color : "transparent", color: tab === t.key ? WHITE : GRAY, cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 800 : 600 }}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Standings tab */}
                    {tab === "standings" && (
                      winnerStandings.length === 0 ? (
                        <p style={{ textAlign: "center", color: GRAY, fontSize: 13, padding: "16px 0" }}>No standings recorded yet.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {winnerStandings.map((s) => {
                            const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : `${s.rank}.`;
                            const matchedPlayer = canLinkToScoring ? players.find((p) => p.name === s.player_name) : null;
                            const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: s.rank === 1 ? "#fffbeb" : "#f9fafb", border: s.rank === 1 ? `1px solid ${GOLD}` : "1px solid #e5e7eb", cursor: matchedPlayer ? "pointer" : "default" } as const;
                            return (
                              <div key={s.id} onClick={() => matchedPlayer && router.push(`/leaderboard/${matchedPlayer.id}`)} style={rowStyle}>
                                <span style={{ fontWeight: 700, fontSize: 14, textDecoration: matchedPlayer ? "underline" : "none" }}>{medal} {s.player_name}</span>
                                <span style={{ fontWeight: 800, fontSize: 14, color: GREEN }}>{s.points} pts</span>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}

                    {/* Courses tab */}
                    {tab === "courses" && (
                      courses.length === 0 ? (
                        <p style={{ textAlign: "center", color: GRAY, fontSize: 13, padding: "16px 0" }}>No course scores recorded yet.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 16 }}>
                          {courses.map((course) => (
                            <div key={course.name}>
                              <h3 style={{ fontSize: 13, fontWeight: 800, color: GREEN, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{course.name}</h3>
                              <div style={{ display: "grid", gap: 4 }}>
                                {course.players.map((p) => (
                                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "#f9fafb", fontSize: 13 }}>
                                    <span style={{ fontWeight: 600 }}>{p.player_name}</span>
                                    <span style={{ fontWeight: 800, color: "#374151" }}>{p.gross_score ?? "—"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <HistoryInner />
    </Suspense>
  );
}
