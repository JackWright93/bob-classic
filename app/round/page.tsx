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
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#9ca3af";
const BG = "#134d2b";
const LIGHT_GREEN = "#e8f5ee";

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
    await supabase.from("hole_scores").delete().eq("round_id", roundId).eq("player_id", playerId).eq("hole_no", holeNo);
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
    if (strokes === 1) return { label: "HOLE IN ONE 🎯", color: DARK_GREEN, bg: GOLD, border: GOLD };
    if (diff <= -2) return { label: "EAGLE 🦅", color: DARK_GREEN, bg: GOLD, border: GOLD };
    if (diff === -1) return { label: "BIRDIE 🐦", color: WHITE, bg: GREEN, border: GREEN };
    if (diff === 0) return { label: "PAR", color: DARK_GREEN, bg: "#e8f5ee", border: "#c8e6d8" };
    if (diff === 1) return { label: "BOGEY", color: WHITE, bg: "#f97316", border: "#f97316" };
    if (diff === 2) return { label: "DOUBLE", color: WHITE, bg: "#ef4444", border: "#ef4444" };
    return { label: `+${diff}`, color: WHITE, bg: "#991b1b", border: "#991b1b" };
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
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: WHITE, fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>{roundName}</h1>
          {isSandCreek && <p style={{ color: GOLD, fontSize: 12, margin: "4px 0 0", letterSpacing: 1 }}>9 HOLES · INDIVIDUAL · NO HANDICAP</p>}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>

        {loading && <p style={{ textAlign: "center", color: GOLD, padding: 40 }}>Loading...</p>}
        {error && <p style={{ color: "#ef4444" }}>{error}</p>}

        {!loading && !error && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 4, border: `1px solid ${GOLD}44` }}>
              {[
                { key: "score", label: "MY SCORE" },
                ...(!isSandCreek ? [{ key: "team", label: "TEAMS" }, { key: "individual", label: "INDIVIDUAL" }] : [])
              ].map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: "none", background: activeTab === tab.key ? `linear-gradient(135deg, ${GOLD}, #a8853a)` : "transparent", color: activeTab === tab.key ? DARK_GREEN : GOLD, cursor: "pointer", fontSize: 11, fontWeight: 900, letterSpacing: 0.5 }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SCORE TAB */}
            {activeTab === "score" && (
              <>
                <div style={{ background: GOLD, borderRadius: 14, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(201,168,76,0.3)" }}>
                  <span style={{ fontSize: 13, color: DARK_GREEN, fontWeight: 800, letterSpacing: 0.5 }}>{holesCompleted}/{holes.length} HOLES</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: DARK_GREEN, fontWeight: 800, letterSpacing: 0.5 }}>TOTAL</span>
                    <span style={{ fontSize: 26, fontWeight: 900, color: DARK_GREEN }}>{totalStrokes || "—"}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {holes.map((hole) => {
                    const score = scores.find((s) => s.hole_no === hole.hole_no);
                    const strokes = score?.strokes ?? null;
                    const label = !isSandCreek
                      ? getScoreLabel(strokes, hole.par, hole.stroke_index, relativeHandicap)
                      : strokes !== null
                        ? strokes < hole.par ? { label: "BIRDIE 🐦", color: WHITE, bg: GREEN, border: GREEN }
                          : strokes === hole.par ? { label: "PAR", color: DARK_GREEN, bg: "#e8f5ee", border: "#c8e6d8" }
                          : { label: `+${strokes - hole.par}`, color: WHITE, bg: "#ef4444", border: "#ef4444" }
                        : null;

                    return (
                      <div key={hole.hole_no} style={{ background: WHITE, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", border: label ? `2px solid ${label.border}` : `2px solid ${GOLD}44` }}>

                        {/* Hole header — gold background */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: label && label.bg !== "#e8f5ee" ? label.bg : GOLD }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: DARK_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: 14, fontWeight: 900 }}>
                              {hole.hole_no}
                            </div>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 800, color: label && label.bg !== "#e8f5ee" && label.bg !== GOLD ? label.color : DARK_GREEN }}>PAR {hole.par}</span>
                              {!isSandCreek && hole.stroke_index && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: label && label.bg !== "#e8f5ee" && label.bg !== GOLD ? "rgba(255,255,255,0.8)" : `${DARK_GREEN}99`, fontWeight: 700 }}>SI {hole.stroke_index}</span>
                              )}
                            </div>
                          </div>
                          {label && (
                            <span style={{ fontSize: 11, fontWeight: 900, color: label && label.bg !== "#e8f5ee" && label.bg !== GOLD ? label.color : DARK_GREEN, letterSpacing: 0.5 }}>{label.label}</span>
                          )}
                        </div>

                        {/* Score controls */}
                        <div style={{ padding: "12px 14px", background: WHITE }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <button onClick={() => updateScore(hole.hole_no, (strokes ?? hole.par) - 1)}
                              style={{ width: 48, height: 52, borderRadius: "12px 0 0 12px", border: `2px solid ${GOLD}66`, borderRight: "none", fontSize: 26, cursor: "pointer", background: "#fffbeb", color: DARK_GREEN, fontWeight: 900 }}>−</button>
                            <div style={{ flex: 1, height: 52, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${GOLD}66`, background: WHITE, fontSize: 28, fontWeight: 900, color: "#111" }}>
                              {saving === hole.hole_no ? "·" : strokes ?? "—"}
                            </div>
                            <button onClick={() => updateScore(hole.hole_no, (strokes ?? hole.par - 1) + 1)}
                              style={{ width: 48, height: 52, borderRadius: "0 12px 12px 0", border: `2px solid ${GOLD}66`, borderLeft: "none", fontSize: 26, cursor: "pointer", background: "#fffbeb", color: DARK_GREEN, fontWeight: 900 }}>+</button>
                            {strokes !== null && (
                              <button onClick={() => clearScore(hole.hole_no)}
                                style={{ width: 38, height: 38, borderRadius: 10, border: "2px solid #fee2e2", background: "#fee2e2", color: "#ef4444", cursor: "pointer", fontSize: 14, marginLeft: 8, fontWeight: 900 }}>✕</button>
                            )}
                          </div>

                          {specialHoles.filter((sh) => sh.hole_no === hole.hole_no).map((sh) => {
                            const claimed = specialAwards.find((a) => a.hole_no === hole.hole_no && a.type === sh.type);
                            const claimedByMe = claimed?.player_id === playerId;
                            const claimedByOther = claimed && !claimedByMe;
                            return (
                              <button key={sh.type} onClick={() => claimAward(hole.hole_no, sh.type)} disabled={!!claimedByOther}
                                style={{ marginTop: 10, width: "100%", padding: "9px 12px", borderRadius: 10, border: claimedByMe ? `2px solid ${GREEN}` : claimedByOther ? `2px solid #e5e7eb` : `2px solid ${GOLD}`, background: claimedByMe ? LIGHT_GREEN : claimedByOther ? "#f9fafb" : "#fffbeb", cursor: claimedByOther ? "default" : "pointer", fontSize: 12, fontWeight: 800, color: claimedByMe ? GREEN : claimedByOther ? GRAY : DARK_GREEN, textAlign: "left", letterSpacing: 0.5 }}>
                                {sh.type === "longest_drive" ? "🚗 LONGEST DRIVE" : "📍 CLOSEST TO PIN"}
                                {claimedByMe && " — CLAIMED ✓"}
                                {claimedByOther && " — CLAIMED BY ANOTHER"}
                                {!claimed && " — TAP TO CLAIM"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TEAM TAB */}
            {activeTab === "team" && (
              <div>
                <p style={{ fontSize: 12, color: GOLD, marginBottom: 12, fontWeight: 700, letterSpacing: 1 }}>LIVE BEST BALL (NET) STANDINGS</p>
                {teamLeaderboard.length === 0 ? (
                  <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}44` }}>Teams not set up yet for this round.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {teamLeaderboard.map((entry, index) => {
                      const parTotal = holes
                        .filter((h) => allScores.some((s) => entry.members.some((m) => s.player_id === m.id && s.hole_no === h.hole_no)))
                        .reduce((sum, h) => sum + h.par, 0);
                      const diff = entry.holesPlayed > 0 ? entry.bestBallTotal - parTotal : null;
                      const diffStr = diff === null ? "—" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
                      const diffColor = diff === null ? GOLD : diff < 0 ? "#4ade80" : diff > 0 ? "#f87171" : GOLD;
                      const isLeading = index === 0 && entry.holesPlayed > 0;
                      return (
                        <div key={entry.team.id} style={{ background: WHITE, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", border: isLeading ? `2px solid ${GOLD}` : `2px solid ${GOLD}33` }}>
                          <div style={{ background: isLeading ? `linear-gradient(135deg, ${GOLD}, #a8853a)` : `${DARK_GREEN}dd`, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 20 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}</span>
                              <span style={{ fontWeight: 900, fontSize: 16, color: isLeading ? DARK_GREEN : WHITE }}>{entry.team.name}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: isLeading ? DARK_GREEN : diffColor }}>{diffStr}</div>
                              <div style={{ fontSize: 11, color: isLeading ? `${DARK_GREEN}99` : `${GOLD}99`, fontWeight: 700, letterSpacing: 0.5 }}>{entry.holesPlayed} HOLES</div>
                            </div>
                          </div>
                          <div style={{ padding: "8px 16px", fontSize: 13, color: GRAY, fontWeight: 600, background: WHITE }}>
                            {entry.members.map((m) => m.name).join(" · ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* INDIVIDUAL TAB */}
            {activeTab === "individual" && (
              <div>
                <p style={{ fontSize: 12, color: GOLD, marginBottom: 12, fontWeight: 700, letterSpacing: 1 }}>LIVE GROSS SCORES — TOP 3 EARN POINTS</p>
                {individualLeaderboard.length === 0 ? (
                  <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}44` }}>No scores entered yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {individualLeaderboard.map((entry, index) => (
                      <div key={entry.player.id} style={{ background: WHITE, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", border: index === 0 ? `2px solid ${GOLD}` : index < 3 ? `2px solid ${GREEN}` : `2px solid ${GOLD}22` }}>
                        <div style={{ background: index === 0 ? `linear-gradient(135deg, ${GOLD}, #a8853a)` : index < 3 ? `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})` : `${DARK_GREEN}cc`, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}</span>
                            <div>
                              <div style={{ fontWeight: 900, fontSize: 15, color: index < 3 ? (index === 0 ? DARK_GREEN : WHITE) : GOLD }}>{entry.player.name}</div>
                              <div style={{ fontSize: 11, color: index < 3 ? (index === 0 ? `${DARK_GREEN}88` : "rgba(255,255,255,0.6)") : `${GOLD}88`, fontWeight: 700, letterSpacing: 0.5 }}>{entry.holesPlayed}/{holes.length} HOLES</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 26, fontWeight: 900, color: index < 3 ? (index === 0 ? DARK_GREEN : WHITE) : GOLD }}>{entry.total}</div>
                            {index < 3 && <div style={{ fontSize: 11, fontWeight: 900, color: index === 0 ? `${DARK_GREEN}99` : "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>{index === 0 ? "+3 PTS" : index === 1 ? "+2 PTS" : "+1 PT"}</div>}
                          </div>
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
    <Suspense fallback={<p style={{ padding: 40, color: "#c9a84c" }}>Loading...</p>}>
      <RoundPageInner />
    </Suspense>
  );
}