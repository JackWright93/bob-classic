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
const RED = "#cc0000";
const BG = "#ffffff";
const LIGHT_GREEN = "#e8f5ee";

function calcRelativeHandicap(handicap: number, lowestHandicap: number) {
  return Math.max(0, Math.round(handicap - lowestHandicap));
}

function getStrokesReceived(relativeHandicap: number, strokeIndex: number | null) {
  if (!strokeIndex) return 0;
  return Math.floor(relativeHandicap / 18) + (strokeIndex <= (relativeHandicap % 18) ? 1 : 0);
}

function getStrokesReceived27(relativeHandicap: number, strokeIndex: number | null, holeNo: number) {
  if (!strokeIndex) return 0;
  const nineGroup = holeNo <= 9 ? 0 : holeNo <= 18 ? 1 : 2;
  const fullRoundsOfSI = Math.floor(relativeHandicap / 3);
  const remainder = relativeHandicap % 3;
  if (strokeIndex <= fullRoundsOfSI) return 1;
  if (strokeIndex === fullRoundsOfSI + 1 && nineGroup < remainder) return 1;
  return 0;
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
  const [pendingScore, setPendingScore] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [specialHoles, setSpecialHoles] = useState<SpecialHoleType[]>([]);
  const [specialAwards, setSpecialAwards] = useState<SpecialAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [allScores, setAllScores] = useState<AllScore[]>([]);
  const [activeTab, setActiveTab] = useState<"score" | "team" | "individual" | "mystrokes">("score");

  const isSandCreek = scorecardKey.includes("Sand Creek") || scorecardKey.includes("Par 3");
  const isShepherds = holes.length === 27;

  const getStrokes = (relHcp: number, strokeIndex: number | null, holeNo: number) => {
    if (isShepherds) return getStrokesReceived27(relHcp, strokeIndex, holeNo);
    return getStrokesReceived(relHcp, strokeIndex);
  };

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

  const checkAndAutoPost = async (holeNo: number, strokes: number) => {
    if (!playerId || !roundId) return;
    const hole = holes.find(h => h.hole_no === holeNo);
    if (!hole) return;
    const { data: playerInfo } = await supabase.from("players").select("name, base_handicap, trip_id").eq("id", playerId).maybeSingle();
    if (!playerInfo) return;
    const lowestHcp = Math.min(...players.map(p => p.base_handicap ?? 0));
    const relHcp = calcRelativeHandicap(playerInfo.base_handicap ?? 0, lowestHcp);
    const strokesReceived = !isSandCreek ? getStrokes(relHcp, hole.stroke_index, holeNo) : 0;
    const netScore = strokes - strokesReceived;
    const diff = netScore - hole.par;
    let autoMessage: string | null = null;
    if (strokes === 1) autoMessage = `🎯 HOLE IN ONE! ${playerInfo.name} just made a hole in one on hole ${holeNo}!!!`;
    else if (diff <= -2) autoMessage = `🦅 EAGLE! ${playerInfo.name} just made a net eagle on hole ${holeNo}!`;
    else if (diff === -1) autoMessage = `🐦 BIRDIE! ${playerInfo.name} just made a net birdie on hole ${holeNo}!`;
    if (diff === 0) {
      const recentScores = scores.filter(s => s.strokes !== null && s.hole_no < holeNo).sort((a, b) => b.hole_no - a.hole_no).slice(0, 4);
      if (recentScores.length === 4) {
        const allPars = recentScores.every(s => {
          const h = holes.find(h => h.hole_no === s.hole_no);
          if (!h || s.strokes === null) return false;
          const sr = !isSandCreek ? getStrokes(relHcp, h.stroke_index, h.hole_no) : 0;
          return (s.strokes - sr) - h.par === 0;
        });
        if (allPars) autoMessage = `🚂 PAR TRAIN! ${playerInfo.name} just made 5 pars in a row!`;
      }
    }
    if (autoMessage) await supabase.from("posts").insert({ player_id: playerId, trip_id: playerInfo.trip_id, content: autoMessage, post_type: "auto" });
  };

  const adjustPendingScore = (holeNo: number, delta: number) => {
    const currentScore = scores.find(s => s.hole_no === holeNo);
    const hole = holes.find(h => h.hole_no === holeNo);
    const base = pendingScore[holeNo] ?? currentScore?.strokes ?? (hole?.par ?? 4);
    const newVal = Math.max(1, base + delta);
    setPendingScore(prev => ({ ...prev, [holeNo]: newVal }));
  };

  const submitScore = async (holeNo: number) => {
    if (!playerId || !roundId) return;
    const newStrokes = pendingScore[holeNo];
    if (!newStrokes) return;
    setSaving(holeNo);
    await supabase.from("hole_scores").upsert(
      { round_id: roundId, player_id: playerId, hole_no: holeNo, strokes: newStrokes },
      { onConflict: "round_id,player_id,hole_no" }
    );
    setScores((prev) => prev.map((s) => s.hole_no === holeNo ? { ...s, strokes: newStrokes } : s));
    setSaving(null);
    setSaved(holeNo);
    setTimeout(() => setSaved(null), 2000);
    setPendingScore(prev => { const n = { ...prev }; delete n[holeNo]; return n; });
    await checkAndAutoPost(holeNo, newStrokes);
    loadAllScores();
  };

  const clearScore = async (holeNo: number) => {
    if (!playerId || !roundId) return;
    setScores((prev) => prev.map((s) => s.hole_no === holeNo ? { ...s, strokes: null } : s));
    setPendingScore(prev => { const n = { ...prev }; delete n[holeNo]; return n; });
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

  const getScoreLabel = (strokes: number | null, par: number, strokeIndex: number | null, handicap: number, holeNo: number) => {
    if (strokes === null) return null;
    const strokesReceived = isSandCreek ? 0 : getStrokes(handicap, strokeIndex, holeNo);
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
          return score.strokes - getStrokes(relHcp, hole.stroke_index, hole.hole_no);
        }).filter((s): s is number => s !== null);
        if (netScores.length > 0) { bestBallTotal += Math.min(...netScores); holesPlayed++; }
      });
      return { team, bestBallTotal, holesPlayed, members };
    }).sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      return a.bestBallTotal - b.bestBallTotal;
    }).map((entry, index) => {
      const pm: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
      return { ...entry, livePoints: entry.holesPlayed > 0 ? (pm[index] ?? 0) : 0 };
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
  const strokeHoles = holes.filter(h => !isSandCreek && getStrokes(relativeHandicap, h.stroke_index, h.hole_no) > 0);

  // Tab order: MY SCORE | TEAMS | INDIVIDUAL | STROKES
  const tabs = [
    { key: "score", label: "MY SCORE" },
    ...(!isSandCreek ? [
      { key: "team", label: "TEAMS" },
      { key: "individual", label: "INDIV." },
      { key: "mystrokes", label: "STROKES" },
    ] : [])
  ];

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>
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
            <div style={{ display: "flex", gap: 4, marginBottom: 16, background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 4, border: `1px solid ${GOLD}44` }}>
              {tabs.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  style={{ flex: 1, padding: "9px 2px", borderRadius: 10, border: "none", background: activeTab === tab.key ? `linear-gradient(135deg, ${GOLD}, #a8853a)` : "transparent", color: activeTab === tab.key ? DARK_GREEN : GOLD, cursor: "pointer", fontSize: 10, fontWeight: 900, letterSpacing: 0.5 }}>
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
                    const savedStrokes = score?.strokes ?? null;
                    const displayStrokes = pendingScore[hole.hole_no] ?? savedStrokes;
                    const isStrokeHole = !isSandCreek && getStrokes(relativeHandicap, hole.stroke_index, hole.hole_no) > 0;
                    const hasPending = pendingScore[hole.hole_no] !== undefined;
                    const label = !isSandCreek
                      ? getScoreLabel(savedStrokes, hole.par, hole.stroke_index, relativeHandicap, hole.hole_no)
                      : savedStrokes !== null
                        ? savedStrokes < hole.par ? { label: "BIRDIE 🐦", color: WHITE, bg: GREEN, border: GREEN }
                          : savedStrokes === hole.par ? { label: "PAR", color: DARK_GREEN, bg: "#e8f5ee", border: "#c8e6d8" }
                          : { label: `+${savedStrokes - hole.par}`, color: WHITE, bg: "#ef4444", border: "#ef4444" }
                        : null;
                    const pendingLabel = hasPending && !isSandCreek
                      ? getScoreLabel(pendingScore[hole.hole_no], hole.par, hole.stroke_index, relativeHandicap, hole.hole_no)
                      : null;
                    const displayLabel = pendingLabel ?? label;

                    return (
                      <div key={hole.hole_no} style={{ background: WHITE, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", border: saved === hole.hole_no ? `2px solid ${GREEN}` : displayLabel ? `2px solid ${displayLabel.border}` : isStrokeHole ? `2px solid ${GOLD}` : `2px solid ${GOLD}44` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: displayLabel && displayLabel.bg !== "#e8f5ee" ? displayLabel.bg : GOLD }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: DARK_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: 14, fontWeight: 900 }}>
                              {hole.hole_no}
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: displayLabel && displayLabel.bg !== "#e8f5ee" && displayLabel.bg !== GOLD ? displayLabel.color : DARK_GREEN }}>PAR {hole.par}</span>
                                {!isSandCreek && hole.stroke_index && (
                                  <span style={{ fontSize: 11, color: displayLabel && displayLabel.bg !== "#e8f5ee" && displayLabel.bg !== GOLD ? "rgba(255,255,255,0.8)" : `${DARK_GREEN}99`, fontWeight: 700 }}>SI {hole.stroke_index}</span>
                                )}
                                {isStrokeHole && (
                                  <span style={{ fontSize: 10, fontWeight: 900, color: DARK_GREEN, background: WHITE, borderRadius: 4, padding: "2px 6px", letterSpacing: 0.5 }}>⭐ STROKE</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {saved === hole.hole_no ? (
                            <span style={{ fontSize: 13, fontWeight: 900, color: GREEN, background: WHITE, borderRadius: 6, padding: "2px 8px" }}>✓ SAVED</span>
                          ) : displayLabel ? (
                            <span style={{ fontSize: 11, fontWeight: 900, color: displayLabel && displayLabel.bg !== "#e8f5ee" && displayLabel.bg !== GOLD ? displayLabel.color : DARK_GREEN, letterSpacing: 0.5 }}>{displayLabel.label}</span>
                          ) : null}
                        </div>

                        <div style={{ padding: "12px 14px", background: WHITE }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => adjustPendingScore(hole.hole_no, -1)}
                              style={{ width: 48, height: 52, borderRadius: "12px 0 0 12px", border: `2px solid ${GOLD}66`, borderRight: "none", fontSize: 26, cursor: "pointer", background: "#fffbeb", color: DARK_GREEN, fontWeight: 900 }}>−</button>
                            <div style={{ flex: 1, height: 52, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${hasPending ? GOLD : GOLD + "44"}`, background: hasPending ? "#fffbeb" : WHITE, fontSize: 28, fontWeight: 900, color: "#111" }}>
                              {saving === hole.hole_no ? "·" : displayStrokes ?? "—"}
                            </div>
                            <button onClick={() => adjustPendingScore(hole.hole_no, 1)}
                              style={{ width: 48, height: 52, borderRadius: "0 12px 12px 0", border: `2px solid ${GOLD}66`, borderLeft: "none", fontSize: 26, cursor: "pointer", background: "#fffbeb", color: DARK_GREEN, fontWeight: 900 }}>+</button>
                            {hasPending && (
                              <button onClick={() => submitScore(hole.hole_no)}
                                style={{ width: 52, height: 52, borderRadius: 12, border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontSize: 22, fontWeight: 900 }}>✓</button>
                            )}
                            {savedStrokes !== null && !hasPending && (
                              <button onClick={() => clearScore(hole.hole_no)}
                                style={{ width: 40, height: 40, borderRadius: 10, border: "2px solid #fee2e2", background: "#fee2e2", color: "#ef4444", cursor: "pointer", fontSize: 14, fontWeight: 900 }}>✕</button>
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

            {/* TEAM TAB — Masters leaderboard style */}
            {activeTab === "team" && (
              <div>
                {teamLeaderboard.length === 0 ? (
                  <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}44` }}>Teams not set up yet for this round.</div>
                ) : (
                  <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                    {/* Header row */}
                    <div style={{ background: DARK_GREEN, padding: "8px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${GOLD}44` }}>
                      <div style={{ width: 36 }} />
                      <div style={{ flex: 1, fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>TEAM</div>
                      <div style={{ width: 50, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
                      <div style={{ width: 44, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>PTS</div>
                      <div style={{ width: 44, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>THRU</div>
                    </div>

                    {teamLeaderboard.map((entry, index) => {
                      const parTotal = holes
                        .filter((h) => allScores.some((s) => entry.members.some((m) => s.player_id === m.id && s.hole_no === h.hole_no)))
                        .reduce((sum, h) => sum + h.par, 0);
                      const diff = entry.holesPlayed > 0 ? entry.bestBallTotal - parTotal : null;
                      const diffStr = diff === null ? "—" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
                      const diffColor = diff === null ? `${WHITE}55` : diff < 0 ? RED : diff > 0 ? "#f97316" : WHITE;
                      const isFirst = index === 0;
                      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                      const ptsLabel = entry.holesPlayed > 0 ? (index === 0 ? "3" : index === 1 ? "2" : "1") : "—";

                      return (
                        <div key={entry.team.id} style={{ borderBottom: `1px solid ${GOLD}22` }}>
                          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: isFirst ? `linear-gradient(90deg, ${GREEN}cc, ${DARK_GREEN}cc)` : `${DARK_GREEN}99` }}>
                            <div style={{ width: 36, fontSize: isFirst ? 20 : 14, fontWeight: 900, color: isFirst ? GOLD : `${GOLD}88`, textAlign: "center" }}>
                              {medal}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 900, color: WHITE, letterSpacing: 0.5, textTransform: "uppercase" }}>{entry.team.name}</div>
                              <div style={{ fontSize: 11, color: `${WHITE}66`, fontWeight: 600, marginTop: 2 }}>{entry.members.map(m => m.name).join(" · ")}</div>
                            </div>
                            <div style={{ width: 50, textAlign: "center" }}>
                              <span style={{ fontSize: 18, fontWeight: 900, color: diffColor }}>{diffStr}</span>
                            </div>
                            <div style={{ width: 44, textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: entry.holesPlayed > 0 ? RED : DARK_GREEN, border: `1px solid ${entry.holesPlayed > 0 ? RED : GOLD + "44"}`, borderRadius: 6, minWidth: 32, padding: "2px 6px" }}>
                                <span style={{ fontSize: 14, fontWeight: 900, color: WHITE }}>{ptsLabel}</span>
                              </div>
                            </div>
                            <div style={{ width: 44, textAlign: "center", fontSize: 12, color: `${GOLD}88`, fontWeight: 700 }}>
                              {entry.holesPlayed > 0 ? entry.holesPlayed : "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ background: DARK_GREEN, padding: "8px 16px", borderTop: `1px solid ${GOLD}33`, textAlign: "center" }}>
                      <span style={{ fontSize: 11, color: `${GOLD}77`, letterSpacing: 1, fontWeight: 700 }}>LIVE BEST BALL (NET) STANDINGS</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INDIVIDUAL TAB — Masters leaderboard style */}
            {activeTab === "individual" && (
              <div>
                {individualLeaderboard.length === 0 ? (
                  <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}44` }}>No scores entered yet.</div>
                ) : (
                  <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                    {/* Header row */}
                    <div style={{ background: DARK_GREEN, padding: "8px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${GOLD}44` }}>
                      <div style={{ width: 36 }} />
                      <div style={{ flex: 1, fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>PLAYER</div>
                      <div style={{ width: 50, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
                      <div style={{ width: 44, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>PTS</div>
                      <div style={{ width: 44, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>THRU</div>
                    </div>

                    {individualLeaderboard.map((entry, index) => {
                      const isFirst = index === 0;
                      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
                      const ptsLabel = index < 3 ? (index === 0 ? "3" : index === 1 ? "2" : "1") : "—";

                      return (
                        <div key={entry.player.id} style={{ borderBottom: `1px solid ${GOLD}22` }}>
                          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: isFirst ? `linear-gradient(90deg, ${GREEN}cc, ${DARK_GREEN}cc)` : `${DARK_GREEN}99` }}>
                            <div style={{ width: 36, fontSize: isFirst ? 20 : 14, fontWeight: 900, color: isFirst ? GOLD : `${GOLD}88`, textAlign: "center" }}>
                              {medal ?? `${index + 1}`}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 900, color: WHITE, letterSpacing: 0.5, textTransform: "uppercase" }}>{entry.player.name}</div>
                            </div>
                            <div style={{ width: 50, textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: RED, borderRadius: 6, minWidth: 36, padding: "2px 8px" }}>
                                <span style={{ fontSize: 16, fontWeight: 900, color: WHITE }}>{entry.total}</span>
                              </div>
                            </div>
                            <div style={{ width: 44, textAlign: "center" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: index < 3 ? RED : DARK_GREEN, border: `1px solid ${index < 3 ? RED : GOLD + "44"}`, borderRadius: 6, minWidth: 32, padding: "2px 6px" }}>
                                <span style={{ fontSize: 14, fontWeight: 900, color: WHITE }}>{ptsLabel}</span>
                              </div>
                            </div>
                            <div style={{ width: 44, textAlign: "center", fontSize: 12, color: `${GOLD}88`, fontWeight: 700 }}>
                              {entry.holesPlayed}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ background: DARK_GREEN, padding: "8px 16px", borderTop: `1px solid ${GOLD}33`, textAlign: "center" }}>
                      <span style={{ fontSize: 11, color: `${GOLD}77`, letterSpacing: 1, fontWeight: 700 }}>TOP 3 EARN LOW ROUND POINTS</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MY STROKES TAB */}
            {activeTab === "mystrokes" && (
              <div>
                <div style={{ background: GOLD, borderRadius: 14, padding: "14px 16px", marginBottom: 16, boxShadow: "0 4px 12px rgba(201,168,76,0.3)" }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: DARK_GREEN, letterSpacing: 0.5 }}>YOUR HANDICAP STROKES</div>
                  <div style={{ fontSize: 13, color: `${DARK_GREEN}99`, marginTop: 4, fontWeight: 700 }}>
                    {relativeHandicap === 0
                      ? "You are the baseline — no strokes received"
                      : `You receive ${relativeHandicap} stroke${relativeHandicap !== 1 ? "s" : ""} this round`}
                  </div>
                </div>

                {relativeHandicap === 0 ? (
                  <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}44` }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏌️</div>
                    <div style={{ fontWeight: 900, letterSpacing: 1 }}>NO STROKES — YOU'RE THE BASELINE</div>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: GOLD, marginBottom: 12, fontWeight: 700, letterSpacing: 1 }}>⭐ HOLES WHERE YOU GET A STROKE</p>
                    <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
                      {strokeHoles.sort((a, b) => a.hole_no - b.hole_no).map((hole) => (
                        <div key={hole.hole_no} style={{ background: WHITE, borderRadius: 12, overflow: "hidden", border: `2px solid ${GOLD}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: GOLD }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: DARK_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: 14, fontWeight: 900 }}>
                                {hole.hole_no}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: DARK_GREEN }}>HOLE {hole.hole_no} · PAR {hole.par}</div>
                                <div style={{ fontSize: 11, color: `${DARK_GREEN}99`, fontWeight: 700 }}>SI {hole.stroke_index}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 11, fontWeight: 900, color: DARK_GREEN, letterSpacing: 0.5 }}>⭐ STROKE HOLE</div>
                              <div style={{ fontSize: 11, color: `${DARK_GREEN}88`, fontWeight: 700 }}>Net par = {hole.par - 1} shots</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: 12, color: `${GOLD}88`, marginBottom: 12, fontWeight: 700, letterSpacing: 1 }}>OTHER HOLES — NO STROKE</p>
                    <div style={{ display: "grid", gap: 8 }}>
                      {holes.filter(h => getStrokes(relativeHandicap, h.stroke_index, h.hole_no) === 0).sort((a, b) => a.hole_no - b.hole_no).map((hole) => (
                        <div key={hole.hole_no} style={{ background: `${DARK_GREEN}55`, borderRadius: 12, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${GOLD}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: DARK_GREEN, display: "flex", alignItems: "center", justifyContent: "center", color: `${GOLD}88`, fontSize: 12, fontWeight: 900, border: `1px solid ${GOLD}33` }}>
                              {hole.hole_no}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: `${GOLD}88` }}>HOLE {hole.hole_no} · PAR {hole.par} · SI {hole.stroke_index}</span>
                          </div>
                          <span style={{ fontSize: 11, color: `${GOLD}55`, fontWeight: 700 }}>NO STROKE</span>
                        </div>
                      ))}
                    </div>
                  </>
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