"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Hole = { hole_no: number; par: number; stroke_index: number | null; };
type HoleScore = { hole_no: number; strokes: number | null; };
type Player = { id: string; name: string; base_handicap: number; };
type Team = { id: string; name: string; };
type TeamPlayer = { team_id: string; player_id: string; };
type AllScore = { hole_no: number; strokes: number; player_id: string; };
type SpecialHoleType = { hole_no: number; type: string; };
type SpecialAward = { id: string; hole_no: number; type: string; player_id: string; confirmed: boolean; };

const GREEN = "#1a6b3c";
const LIGHT_GREEN = "#e8f5ee";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";

function calcRelativeHandicap(handicap: number, lowestHandicap: number) {
  return Math.max(0, Math.round(handicap - lowestHandicap));
}

function getStrokesReceived(relativeHandicap: number, strokeIndex: number | null) {
  if (!strokeIndex) return 0;
  return Math.floor(relativeHandicap / 18) + (strokeIndex <= (relativeHandicap % 18) ? 1 : 0);
}

function RoundPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roundId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundName, setRoundName] = useState("");
  const [scorecardKey, setScorecardKey] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [scores, setScores] = useState<HoleScore[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [specialHoles, setSpecialHoles] = useState<SpecialHoleType[]>([]);
  const [specialAwards, setSpecialAwards] = useState<SpecialAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [allScores, setAllScores] = useState<AllScore[]>([]);
  const [activeTab, setActiveTab] = useState<"score" | "team" | "individual">("score");

  const isSandCreek = scorecardKey === "Sand Creek Course::Par 3";

  const loadAllScores = async () => {
    if (!roundId) return;
    const { data } = await supabase.from("hole_scores").select("hole_no, strokes, player_id").eq("round_id", roundId);
    setAllScores(data ?? []);
  };

  useEffect(() => {
    if (!roundId) return;
    const run = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }

      const { data: playerData } = await supabase.from("players").select("id, base_handicap").eq("auth_user_id", session.user.id).maybeSingle();
      if (!playerData) { setError("Player not found."); setLoading(false); return; }
      setPlayerId(playerData.id);

      const { data: roundData } = await supabase.from("rounds").select("name, scorecard_key").eq("id", roundId).maybeSingle();
      if (!roundData) { setError("Round not found."); setLoading(false); return; }
      setRoundName(roundData.name);
      setScorecardKey(roundData.scorecard_key);

      const { data: holeData } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index").eq("scorecard_key", roundData.scorecard_key).order("hole_no");
      setHoles(holeData ?? []);

      const { data: existingScores } = await supabase.from("hole_scores").select("hole_no, strokes").eq("round_id", roundId).eq("player_id", playerData.id);
      const scoreMap: HoleScore[] = (holeData ?? []).map((h) => ({
        hole_no: h.hole_no,
        strokes: existingScores?.find((s) => s.hole_no === h.hole_no)?.strokes ?? null,
      }));
      setScores(scoreMap);

      const { data: shData } = await supabase.from("special_holes").select("hole_no, type").eq("round_id", roundId);
      setSpecialHoles(shData ?? []);

      const { data: saData } = await supabase.from("special_awards").select("id, hole_no, type, player_id, confirmed").eq("round_id", roundId);
      setSpecialAwards(saData ?? []);

      const { data: allPlayersData } = await supabase.from("players").select("id, name, base_handicap");
      setPlayers(allPlayersData ?? []);

      const { data: teamsData } = await supabase.from("teams").select("id, name").eq("round_id", roundId);
      setTeams(teamsData ?? []);

      const { data: tpData } = await supabase.from("team_players").select("team_id, player_id");
      setTeamPlayers(tpData ?? []);

      const { data: allScoresData } = await supabase.from("hole_scores").select("hole_no, strokes, player_id").eq("round_id", roundId);
      setAllScores(allScoresData ?? []);

      setLoading(false);
    };

    run();

    const channel = supabase.channel("round-scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_scores" }, () => { loadAllScores(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roundId]);

  const updateScore = async (holeNo: number, newStrokes: number) => {
    if (!playerId || !roundId || newStrokes < 1) return;
    setScores((prev) => prev.map((s) => s.hole_no === holeNo ? { ...s, strokes: newStrokes } : s));
    setSaving(holeNo);
    await supabase.from("hole_scores").upsert(
      { round_id: roundId, player_id: playerId, hole_no: holeNo, strokes: newStrokes },
      { onConflict: "round_id,player_id,hole_no" }
    );
    setSaving(null);
    loadAllScores();
  };

  const clearScore = async (holeNo: number) => {
    if (!playerId || !roundId) return;
    setScores((prev) => prev.map((s) => s.hole_no === holeNo ? { ...s, strokes: null } : s));
    await supabase.from("hole_scores")
      .delete()
      .eq("round_id", roundId)
      .eq("player_id", playerId)
      .eq("hole_no", holeNo);
    loadAllScores();
  };

  const claimAward = async (holeNo: number, type: string) => {
    if (!playerId || !roundId) return;
    const existing = specialAwards.find((a) => a.hole_no === holeNo && a.type === type && a.player_id === playerId);
    if (existing) {
      await supabase.from("special_awards").delete().eq("id", existing.id);
      setSpecialAwards((prev) => prev.filter((a) => a.id !== existing.id));
      return;
    }
    const others = specialAwards.filter((a) => a.hole_no === holeNo && a.type === type);
    for (const o of others) await supabase.from("special_awards").delete().eq("id", o.id);
    const { data } = await supabase.from("special_awards").insert({ round_id: roundId, hole_no: holeNo, player_id: playerId, type, confirmed: false }).select().single();
    if (data) setSpecialAwards((prev) => [...prev.filter((a) => !(a.hole_no === holeNo && a.type === type)), data]);
  };

  const getScoreLabel = (strokes: number | null, par: number, strokeIndex: number | null, handicap: number) => {
    if (strokes === null) return null;
    const strokesReceived = getStrokesReceived(handicap, strokeIndex);
    const diff = (strokes - strokesReceived) - par;
    if (strokes === 1) return { label: "Hole in One! 🎯", color: GOLD, bg: "#fffbeb" };
    if (diff <= -2) return { label: "Eagle 🦅", color: GOLD, bg: "#fffbeb" };
    if (diff === -1) return { label: "Birdie 🐦", color: GREEN, bg: LIGHT_GREEN };
    if (diff === 0) return { label: "Par", color: GRAY, bg: "#f3f4f6" };
    if (diff === 1) return { label: "Bogey", color: "#f97316", bg: "#fff7ed" };
    if (diff === 2) return { label: "Double", color: "#ef4444", bg: "#fef2f2" };
    return { label: `+${diff}`, color: "#991b1b", bg: "#fef2f2" };
  };

  const getTeamLeaderboard = () => {
    if (!teams.length || !players.length) return [];
    const lowestHandicap = Math.min(...players.map((p) => p.base_handicap ?? 0));
    return teams.map((team) => {
      const memberIds = teamPlayers.filter((tp) => tp.team_id === team.id).map((tp) => tp.player_id);
      const members = players.filter((p) => memberIds.includes(p.id));
      let bestBallTotal = 0;
      let holesPlayed = 0;
      holes.forEach((hole) => {
        const netScores = members.map((member) => {
          const score = allScores.find((s) => s.player_id === member.id && s.hole_no === hole.hole_no);
          if (!score) return null;
          const relHcp = calcRelativeHandicap(member.base_handicap ?? 0, lowestHandicap);
          return score.strokes - getStrokesReceived(relHcp, hole.stroke_index);
        }).filter((s): s is number => s !== null);
        if (netScores.length > 0) { bestBallTotal += Math.min(...netScores); holesPlayed++; }
      });
      return { team, bestBallTotal, holesPlayed, members };
    }).sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      return a.bestBallTotal - b.bestBallTotal;
    });
  };

  const getIndividualRoundLeaderboard = () => {
    return players.map((player) => {
      const playerScores = allScores.filter((s) => s.player_id === player.id);
      const total = playerScores.reduce((sum, s) => sum + s.strokes, 0);
      return { player, total, holesPlayed: playerScores.length };
    }).filter((p) => p.holesPlayed > 0).sort((a, b) => a.total - b.total);
  };

  const totalStrokes = scores.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
  const holesCompleted = scores.filter((s) => s.strokes !== null).length;
  const myHandicap = players.find((p) => p.id === playerId)?.base_handicap ?? 0;
  const lowestHandicap = players.length ? Math.min(...players.map((p) => p.base_handicap ?? 0)) : 0;
  const relativeHandicap = calcRelativeHandicap(myHandicap, lowestHandicap);
  const teamLeaderboard = getTeamLeaderboard();
  const individualLeaderboard = getIndividualRoundLeaderboard();

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: GREEN, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: WHITE, fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <h1 style={{ color: WHITE, fontSize: 20, fontWeight: "bold", margin: 0 }}>{roundName}</h1>
          {isSandCreek && <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, margin: 0 }}>9 holes · Individual · No handicap</p>}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY }}>Loading...</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {!loading && !error && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, background: WHITE, borderRadius: 12, padding: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
              {[
                { key: "score", label: "🏌️ My Score" },
                ...(!isSandCreek ? [{ key: "team", label: "👥 Teams" }, { key: "individual", label: "👤 Individual" }] : [])
              ].map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", background: activeTab === tab.key ? GREEN : "transparent", color: activeTab === tab.key ? WHITE : GRAY, cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.key ? "bold" : "normal" }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "score" && (
              <>
                <div style={{ background: WHITE, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 14, color: GRAY }}>{holesCompleted} / {holes.length} holes completed</span>
                  <span style={{ fontSize: 18, fontWeight: "bold", color: GREEN }}>Total: {totalStrokes || "—"}</span>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {holes.map((hole) => {
                    const score = scores.find((s) => s.hole_no === hole.hole_no);
                    const strokes = score?.strokes ?? null;
                    const label = !isSandCreek
                      ? getScoreLabel(strokes, hole.par, hole.stroke_index, relativeHandicap)
                      : strokes !== null
                        ? strokes < hole.par ? { label: "Birdie 🐦", color: GREEN, bg: LIGHT_GREEN }
                          : strokes === hole.par ? { label: "Par", color: GRAY, bg: "#f3f4f6" }
                          : { label: `+${strokes - hole.par}`, color: "#ef4444", bg: "#fef2f2" }
                        : null;

                    return (
                      <div key={hole.hole_no} style={{ background: label ? label.bg : WHITE, borderRadius: 12, padding: "14px 16px", border: `1px solid ${label ? label.color + "33" : "#e5e7eb"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: GREEN, color: WHITE, borderRadius: 6, padding: "2px 8px", fontSize: 13, fontWeight: "bold" }}>{hole.hole_no}</span>
                            <span style={{ color: GRAY, fontSize: 13 }}>Par {hole.par}</span>
                            {!isSandCreek && hole.stroke_index && (
                              <span style={{ color: "#9ca3af", fontSize: 12 }}>SI {hole.stroke_index}</span>
                            )}
                          </div>
                          {label && (
                            <span style={{ fontSize: 13, fontWeight: "bold", color: label.color, background: WHITE, borderRadius: 6, padding: "2px 8px" }}>{label.label}</span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                          <button onClick={() => updateScore(hole.hole_no, (strokes ?? hole.par) - 1)}
                            style={{ width: 44, height: 44, borderRadius: "10px 0 0 10px", border: "1px solid #d1d5db", borderRight: "none", fontSize: 22, cursor: "pointer", background: WHITE, color: "#374151", fontWeight: "bold" }}>−</button>
                          <div style={{ flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #d1d5db", background: WHITE, fontSize: 22, fontWeight: "bold", color: "#111" }}>
                            {saving === hole.hole_no ? "..." : strokes ?? "—"}
                          </div>
                          <button onClick={() => updateScore(hole.hole_no, (strokes ?? hole.par - 1) + 1)}
                            style={{ width: 44, height: 44, borderRadius: "0 10px 10px 0", border: "1px solid #d1d5db", borderLeft: "none", fontSize: 22, cursor: "pointer", background: WHITE, color: "#374151", fontWeight: "bold" }}>+</button>
                          {strokes !== null && (
                            <button onClick={() => clearScore(hole.hole_no)}
                              style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #fee2e2", background: "#fee2e2", color: "#ef4444", cursor: "pointer", fontSize: 16, marginLeft: 8, fontWeight: "bold" }}>✕</button>
                          )}
                        </div>

                        {specialHoles.filter((sh) => sh.hole_no === hole.hole_no).map((sh) => {
                          const claimed = specialAwards.find((a) => a.hole_no === hole.hole_no && a.type === sh.type);
                          const claimedByMe = claimed?.player_id === playerId;
                          const claimedByOther = claimed && !claimedByMe;
                          return (
                            <button key={sh.type} onClick={() => claimAward(hole.hole_no, sh.type)} disabled={!!claimedByOther}
                              style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 8, border: claimedByMe ? `2px solid ${GREEN}` : claimedByOther ? "1px solid #d1d5db" : `1px solid ${GOLD}`, background: claimedByMe ? LIGHT_GREEN : claimedByOther ? "#f9fafb" : "#fffbeb", cursor: claimedByOther ? "default" : "pointer", fontSize: 13, fontWeight: "bold", color: claimedByMe ? GREEN : claimedByOther ? GRAY : "#92400e", textAlign: "left" }}>
                              {sh.type === "longest_drive" ? "🚗 Longest Drive" : "📍 Closest to Pin"}
                              {claimedByMe && " — claimed by you ✓"}
                              {claimedByOther && " — claimed by another player"}
                              {!claimed && " — tap to claim"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {activeTab === "team" && (
              <div>
                <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>Live best ball (net) standings</p>
                {teamLeaderboard.length === 0 ? (
                  <div style={{ background: WHITE, borderRadius: 12, padding: 20, textAlign: "center", color: GRAY }}>Teams not set up yet for this round.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {teamLeaderboard.map((entry, index) => {
                      const parTotal = holes
  .filter((h) => allScores.some((s) =>
    entry.members.some((m) => s.player_id === m.id && s.hole_no === h.hole_no)
  ))
  .reduce((sum, h) => sum + h.par, 0);
                      const diff = entry.holesPlayed > 0 ? entry.bestBallTotal - parTotal : null;
                      const diffStr = diff === null ? "—" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
                      const diffColor = diff === null ? GRAY : diff < 0 ? GREEN : diff > 0 ? "#ef4444" : GRAY;
                      return (
                        <div key={entry.team.id} style={{ background: index === 0 ? LIGHT_GREEN : WHITE, borderRadius: 12, padding: 16, border: index === 0 ? `2px solid ${GREEN}` : "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 20 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</span>
                              <div>
                                <div style={{ fontWeight: "bold", fontSize: 16, color: "#111" }}>{entry.team.name}</div>
                                <div style={{ fontSize: 12, color: GRAY }}>{entry.members.map((m) => m.name).join(", ")}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 24, fontWeight: "bold", color: diffColor }}>{diffStr}</div>
                              <div style={{ fontSize: 12, color: GRAY }}>{entry.holesPlayed} holes</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "individual" && (
              <div>
                <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>Live gross scores — top 3 earn points</p>
                {individualLeaderboard.length === 0 ? (
                  <div style={{ background: WHITE, borderRadius: 12, padding: 20, textAlign: "center", color: GRAY }}>No scores entered yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {individualLeaderboard.map((entry, index) => (
                      <div key={entry.player.id} style={{ background: index < 3 ? LIGHT_GREEN : WHITE, borderRadius: 12, padding: "14px 16px", border: index < 3 ? `1px solid ${GREEN}33` : "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18, minWidth: 28 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}</span>
                          <div>
                            <div style={{ fontWeight: "bold", fontSize: 15, color: "#111" }}>{entry.player.name}</div>
                            <div style={{ fontSize: 12, color: GRAY }}>{entry.holesPlayed}/{holes.length} holes</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: "#111" }}>{entry.total}</div>
                          {index < 3 && <div style={{ fontSize: 12, color: GREEN, fontWeight: "bold" }}>{index === 0 ? "+3pts" : index === 1 ? "+2pts" : "+1pt"}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function RoundPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <RoundPageInner />
    </Suspense>
  );
}