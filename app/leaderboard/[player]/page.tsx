"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const RED = "#cc0000";
const BG = "#ffffff";
const GRAY = "#6b7280";

type RoundBreakdown = {
  roundId: string;
  roundName: string;
  points: number;
  details: string[];
  grossTotal: number | null;
  holesCompleted: number;
  totalHoles: number;
};

function calcRelativeHandicap(handicap: number, lowestHandicap: number) {
  return Math.max(0, Math.round(handicap - lowestHandicap));
}

function PlayerDetailInner() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.player as string;

  const [playerName, setPlayerName] = useState("");
  const [playerAvatar, setPlayerAvatar] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [rounds, setRounds] = useState<RoundBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const renderAvatar = (avatar: string | null, name: string) => {
    if (avatar && avatar.startsWith("http")) {
      // Photo URL
      return (
        <img
          src={avatar}
          alt={name}
          style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `3px solid ${GOLD}`, boxShadow: `0 0 0 3px ${DARK_GREEN}` }}
        />
      );
    }
    if (avatar) {
      // Emoji
      return (
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${GOLD}, #a8853a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, boxShadow: `0 0 0 3px ${DARK_GREEN}, 0 0 0 5px ${GOLD}44` }}>
          {avatar}
        </div>
      );
    }
    // Default initial
    return (
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${GOLD}, #a8853a)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: DARK_GREEN, boxShadow: `0 0 0 3px ${DARK_GREEN}, 0 0 0 5px ${GOLD}44` }}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  useEffect(() => {
    const run = async () => {
      const { data: players } = await supabase.from("players").select("id, name, base_handicap, avatar");
      const { data: roundsData } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").order("sort_order");
      const { data: allScores } = await supabase.from("hole_scores").select("hole_no, strokes, player_id, round_id");
      const { data: allHoles } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index, scorecard_key");
      const { data: teams } = await supabase.from("teams").select("id, name, round_id");
      const { data: teamPlayers } = await supabase.from("team_players").select("team_id, player_id");
      const { data: specialAwards } = await supabase.from("special_awards").select("id, player_id, round_id, hole_no, type, confirmed").eq("confirmed", true);

      if (!players || !roundsData || !allScores || !allHoles) return;

      const player = players.find((p) => p.id === playerId);
      if (!player) return;
      setPlayerName(player.name);
      setPlayerAvatar(player.avatar ?? null);

      const lowestHandicap = Math.min(...players.map((p) => p.base_handicap ?? 0));
      const hcp = calcRelativeHandicap(player.base_handicap ?? 0, lowestHandicap);

      const getSR = (mHcp: number, si: number | null, holeNo: number, is27: boolean) => {
        if (!si) return 0;
        if (is27) {
          const nineGroup = holeNo <= 9 ? 0 : holeNo <= 18 ? 1 : 2;
          const fullRounds = Math.floor(mHcp / 3);
          const remainder = mHcp % 3;
          if (si <= fullRounds) return 1;
          if (si === fullRounds + 1 && nineGroup < remainder) return 1;
          return 0;
        }
        return Math.floor(mHcp / 18) + (si <= (mHcp % 18) ? 1 : 0);
      };

      const breakdowns: RoundBreakdown[] = [];

      roundsData.forEach((round) => {
        const isSandCreek = round.scorecard_key.includes("Sand Creek") || round.scorecard_key.includes("Par 3");
        const roundHoles = allHoles.filter((h) => h.scorecard_key === round.scorecard_key);
        const is27 = roundHoles.length === 27;
        const playerScores = allScores.filter((s) => s.player_id === playerId && s.round_id === round.id);
        if (playerScores.length === 0) return;

        let points = 0;
        const details: string[] = [];

        // Net birdie/eagle/HIO
        playerScores.forEach((score) => {
          const hole = roundHoles.find((h) => h.hole_no === score.hole_no);
          if (!hole) return;
          if (isSandCreek) {
            if (score.strokes === hole.par - 1) { points += 1; details.push(`🐦 Birdie on hole ${score.hole_no} (+1)`); }
          } else {
            const sr = getSR(hcp, hole.stroke_index, score.hole_no, is27);
            const diff = (score.strokes - sr) - hole.par;
            if (score.strokes === 1) { points += 5; details.push(`🎯 Hole-in-one on hole ${score.hole_no} (+5)`); }
            else if (diff <= -2) { points += 3; details.push(`🦅 Net eagle on hole ${score.hole_no} (+3)`); }
            else if (diff === -1) { points += 1; details.push(`🐦 Net birdie on hole ${score.hole_no} (+1)`); }
          }
        });

        // Sand Creek bonus
        if (isSandCreek) {
          const total = playerScores.reduce((sum, s) => sum + s.strokes, 0);
          if (playerScores.length === 9 && total <= 27) { points += 1; details.push(`⭐ Shot ${total} — 27 or under (+1)`); }
        }

        // Confirmed LD/CTP awards
        const confirmedAwards = (specialAwards ?? []).filter(
          a => a.player_id === playerId && a.round_id === round.id
        );
        confirmedAwards.forEach(award => {
          const label = award.type === "longest_drive" ? "Longest Drive" : "Closest to Pin";
          const emoji = award.type === "longest_drive" ? "🚗" : "📍";
          points += 1;
          details.push(`${emoji} ${label} on hole ${award.hole_no} (+1)`);
        });

        // Low gross round points
        const allPlayerTotals = players.map((p) => {
          const ps = allScores.filter((s) => s.player_id === p.id && s.round_id === round.id);
          if (ps.length === 0) return null;
          if (ps.length < playerScores.length) return null;
          return { playerId: p.id, total: ps.reduce((sum, s) => sum + s.strokes, 0) };
        }).filter(Boolean) as { playerId: string; total: number }[];

        if (allPlayerTotals.length >= 1) {
          const sorted = [...allPlayerTotals].sort((a, b) => a.total - b.total);
          const pointsMap: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
          let i = 0;
          while (i < sorted.length) {
            let j = i;
            while (j < sorted.length && sorted[j].total === sorted[i].total) j++;
            const tiedCount = j - i;
            const totalPts = Array.from({ length: tiedCount }, (_, k) => pointsMap[i + k] ?? 0);
            const sharedPts = Math.floor(totalPts.reduce((a, b) => a + b, 0) / tiedCount);
            if (sharedPts > 0) {
              for (let k = i; k < j; k++) {
                if (sorted[k].playerId === playerId) {
                  const place = i === 0 ? "Low gross" : i === 1 ? "2nd low gross" : "3rd low gross";
                  points += sharedPts;
                  details.push(`🏌️ ${place} — ${sorted[k].total} strokes (+${sharedPts})`);
                }
              }
            }
            i = j;
          }
        }

        // Live team points
        if (!isSandCreek && teams && teamPlayers) {
          const roundTeams = teams.filter(t => t.round_id === round.id);
          if (roundTeams.length > 0) {
            const teamStandings = roundTeams.map(team => {
              const memberIds = teamPlayers.filter(tp => tp.team_id === team.id).map(tp => tp.player_id);
              const members = players.filter(p => memberIds.includes(p.id));
              let bestBallTotal = 0;
              let holesPlayed = 0;
              roundHoles.forEach(hole => {
                const netScores = members.map(member => {
                  const score = allScores.find(s => s.player_id === member.id && s.hole_no === hole.hole_no && s.round_id === round.id);
                  if (!score) return null;
                  const mHcp = calcRelativeHandicap(member.base_handicap ?? 0, lowestHandicap);
                  const sr = getSR(mHcp, hole.stroke_index, hole.hole_no, is27);
                  return score.strokes - sr;
                }).filter((s): s is number => s !== null);
                if (netScores.length > 0) { bestBallTotal += Math.min(...netScores); holesPlayed++; }
              });
              const isMember = memberIds.includes(playerId);
              return { team, bestBallTotal, holesPlayed, isMember };
            }).filter(t => t.holesPlayed > 0)
              .sort((a, b) => a.bestBallTotal - b.bestBallTotal);

            if (teamStandings.length > 0) {
              const pm: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
              teamStandings.forEach((entry, index) => {
                if (entry.isMember && pm[index]) {
                  points += pm[index];
                  const place = index === 0 ? "1st" : index === 1 ? "2nd" : "3rd";
                  details.push(`👥 Team ${place} place (+${pm[index]})`);
                }
              });
            }
          }
        }

        const grossTotal = playerScores.reduce((sum, s) => sum + s.strokes, 0);

        breakdowns.push({
          roundId: round.id,
          roundName: round.name,
          points,
          details,
          grossTotal,
          holesCompleted: playerScores.length,
          totalHoles: roundHoles.length,
        });
      });

      setRounds(breakdowns);
      setTotalPoints(breakdowns.reduce((sum, r) => sum + r.points, 0));
      setLoading(false);
    };

    run();

    const channel = supabase
      .channel("player-detail-" + Date.now())
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_scores" }, () => run())
      .on("postgres_changes", { event: "*", schema: "public", table: "special_awards" }, () => run())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [playerId]);

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 28px", textAlign: "center", position: "relative" }}>
        <button onClick={() => router.push("/leaderboard")} style={{ position: "absolute", left: 20, top: 18, background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer" }}>←</button>
        {!loading && (
          <>
            <div style={{ margin: "0 auto 12px", width: "fit-content" }}>
              {renderAvatar(playerAvatar, playerName)}
            </div>
            <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>{playerName}</h1>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: RED, borderRadius: 8, padding: "4px 16px" }}>
              <span style={{ color: WHITE, fontSize: 28, fontWeight: 900 }}>{totalPoints}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>PTS</span>
            </div>
          </>
        )}
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY, padding: 40 }}>Loading...</p>}

        {!loading && rounds.length === 0 && (
          <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, textAlign: "center", color: GRAY }}>
            No scores entered yet.
          </div>
        )}

        {!loading && rounds.map((round) => (
          <div key={round.roundId} style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: round.points > 0 ? `linear-gradient(90deg, ${GREEN}, ${DARK_GREEN})` : DARK_GREEN, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: WHITE, letterSpacing: 1, textTransform: "uppercase" }}>{round.roundName}</div>
                <div style={{ fontSize: 11, color: `${GOLD}99`, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>
                  {round.holesCompleted}/{round.totalHoles} HOLES · GROSS: {round.grossTotal}
                </div>
              </div>
              <div style={{ background: round.points > 0 ? RED : DARK_GREEN, border: `1px solid ${round.points > 0 ? RED : GOLD + "44"}`, borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: WHITE }}>{round.points}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, letterSpacing: 1 }}>PTS</div>
              </div>
            </div>

            <div style={{ background: WHITE, padding: "10px 16px" }}>
              {round.details.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No points earned yet</p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {round.details.map((d, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 6, padding: "6px 10px", borderLeft: `3px solid ${GOLD}` }}>{d}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function PlayerDetailPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: "#c9a84c" }}>Loading...</p>}>
      <PlayerDetailInner />
    </Suspense>
  );
}
