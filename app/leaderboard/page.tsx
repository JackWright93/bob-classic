"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const RED = "#cc0000";
const BG = "#ffffff";

type PlayerPoints = {
  id: string;
  name: string;
  totalPoints: number;
  roundSummary: { name: string; points: number }[];
};

function LeaderboardInner() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<PlayerPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const calculate = async () => {
    const { data: players } = await supabase.from("players").select("id, name, base_handicap");
    const { data: rounds } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").order("sort_order");
    const { data: scores } = await supabase.from("hole_scores").select("hole_no, strokes, player_id, round_id");
    const { data: holes } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index, scorecard_key");
    const { data: teams } = await supabase.from("teams").select("id, name, round_id");
    const { data: teamPlayers } = await supabase.from("team_players").select("team_id, player_id");

    if (!players || !rounds || !scores || !holes || !teams || !teamPlayers) { setLoading(false); return; }

    const lowest = Math.min(...players.map(p => p.base_handicap ?? 0));

    const result: PlayerPoints[] = players.map(player => {
      const hcp = Math.max(0, Math.round((player.base_handicap ?? 0) - lowest));
      let total = 0;
      const roundSummary: { name: string; points: number }[] = [];

      rounds.forEach(round => {
        const isSC = round.scorecard_key.includes("Sand Creek") || round.scorecard_key.includes("Par 3");
        const roundHoles = holes.filter(h => h.scorecard_key === round.scorecard_key);
        const is27 = roundHoles.length === 27;
        const playerScores = scores.filter(s => s.player_id === player.id && s.round_id === round.id);
        if (playerScores.length === 0) return;

        let pts = 0;

        const getSR = (mHcp: number, strokeIndex: number | null, holeNo: number) => {
          if (!strokeIndex) return 0;
          if (is27) {
            const nineGroup = holeNo <= 9 ? 0 : holeNo <= 18 ? 1 : 2;
            const fullRounds = Math.floor(mHcp / 3);
            const remainder = mHcp % 3;
            if (strokeIndex <= fullRounds) return 1;
            if (strokeIndex === fullRounds + 1 && nineGroup < remainder) return 1;
            return 0;
          }
          return Math.floor(mHcp / 18) + (strokeIndex <= (mHcp % 18) ? 1 : 0);
        };

        // Net birdie/eagle/HIO points
        playerScores.forEach(score => {
          const hole = roundHoles.find(h => h.hole_no === score.hole_no);
          if (!hole) return;
          if (isSC) {
            if (score.strokes === hole.par - 1) pts += 1;
          } else {
            const sr = getSR(hcp, hole.stroke_index, score.hole_no);
            const diff = (score.strokes - sr) - hole.par;
            if (score.strokes === 1) pts += 5;
            else if (diff <= -2) pts += 3;
            else if (diff === -1) pts += 1;
          }
        });

        // Sand Creek 27-or-under bonus
        if (isSC) {
          const t = playerScores.reduce((s, x) => s + x.strokes, 0);
          if (playerScores.length === 9 && t <= 27) pts += 1;
        }

        // Live low gross round points
        if (playerScores.length > 0) {
          const allTotals = players.map(p => {
            const ps = scores.filter(s => s.player_id === p.id && s.round_id === round.id);
            if (ps.length === 0) return null;
            return { id: p.id, total: ps.reduce((s, x) => s + x.strokes, 0) };
          }).filter(Boolean) as { id: string; total: number }[];

          if (allTotals.length >= 2) {
            const sorted = [...allTotals].sort((a, b) => a.total - b.total);
            const pm: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
            let i = 0;
            while (i < sorted.length) {
              let j = i;
              while (j < sorted.length && sorted[j].total === sorted[i].total) j++;
              const tiedCount = j - i;
              const shared = Math.floor(
                Array.from({ length: tiedCount }, (_, k) => pm[i + k] ?? 0).reduce((a, b) => a + b, 0) / tiedCount
              );
              if (shared > 0) {
                for (let k = i; k < j; k++) {
                  if (sorted[k].id === player.id) pts += shared;
                }
              }
              i = j;
            }
          }
        }

        // Live team points
        if (!isSC) {
          const roundTeams = teams.filter(t => t.round_id === round.id);
          if (roundTeams.length > 0) {
            const teamStandings = roundTeams.map(team => {
              const memberIds = teamPlayers.filter(tp => tp.team_id === team.id).map(tp => tp.player_id);
              const members = players.filter(p => memberIds.includes(p.id));
              let bestBallTotal = 0;
              let holesPlayed = 0;
              roundHoles.forEach(hole => {
                const netScores = members.map(member => {
                  const score = scores.find(s => s.player_id === member.id && s.hole_no === hole.hole_no && s.round_id === round.id);
                  if (!score) return null;
                  const mHcp = Math.max(0, Math.round((member.base_handicap ?? 0) - lowest));
                  const sr = getSR(mHcp, hole.stroke_index, hole.hole_no);
                  return score.strokes - sr;
                }).filter((s): s is number => s !== null);
                if (netScores.length > 0) { bestBallTotal += Math.min(...netScores); holesPlayed++; }
              });
              const isMember = memberIds.includes(player.id);
              return { team, bestBallTotal, holesPlayed, isMember };
            }).filter(t => t.holesPlayed > 0)
              .sort((a, b) => a.bestBallTotal - b.bestBallTotal);

            if (teamStandings.length > 0) {
              const pm: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
              teamStandings.forEach((entry, index) => {
                if (entry.isMember) pts += pm[index] ?? 0;
              });
            }
          }
        }

        total += pts;
        roundSummary.push({ name: round.name, points: pts });
      });

      return { id: player.id, name: player.name, totalPoints: total, roundSummary };
    });

    result.sort((a, b) => b.totalPoints - a.totalPoints);
    setLeaderboard(result);
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => {
    calculate();
    const channel = supabase.channel("lb")
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_scores" }, () => calculate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>Leaderboard</h1>
          {lastUpdated && (
            <p style={{ color: `${GOLD}88`, fontSize: 11, margin: "4px 0 0", letterSpacing: 1 }}>
              LIVE · {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {loading && <p style={{ textAlign: "center", color: DARK_GREEN, padding: 40, letterSpacing: 1 }}>LOADING...</p>}

        {!loading && (
          <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>

            {/* Column headers */}
            <div style={{ background: DARK_GREEN, padding: "8px 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${GOLD}44` }}>
              <div style={{ width: 36 }} />
              <div style={{ flex: 1, fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>PLAYER</div>
              <div style={{ width: 60, textAlign: "center", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1 }}>PTS</div>
            </div>

            {leaderboard.map((player, index) => {
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
              const isFirst = index === 0;

              return (
                <div key={player.id} onClick={() => router.push(`/leaderboard/${player.id}`)}
                  style={{ cursor: "pointer", borderBottom: `1px solid ${GOLD}22` }}>
                  <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: isFirst ? `linear-gradient(90deg, ${GREEN}cc, ${DARK_GREEN}cc)` : `${DARK_GREEN}99` }}>
                    <div style={{ width: 36, fontSize: isFirst ? 20 : 14, fontWeight: 900, color: isFirst ? GOLD : `${GOLD}88`, textAlign: "center" }}>
                      {medal ?? `${index + 1}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: WHITE, letterSpacing: 0.5, textTransform: "uppercase" }}>{player.name}</div>
                      {player.roundSummary.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {player.roundSummary.map((r, i) => (
                            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: r.points > 0 ? GOLD : `${WHITE}55`, letterSpacing: 0.5 }}>
                              {r.name.replace("Round ", "R")}: {r.points}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ width: 60, textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: player.totalPoints > 0 ? RED : DARK_GREEN, border: `1px solid ${player.totalPoints > 0 ? RED : GOLD + "44"}`, borderRadius: 6, minWidth: 44, padding: "4px 8px" }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: WHITE }}>{player.totalPoints}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div style={{ background: DARK_GREEN, padding: "10px 16px", display: "flex", justifyContent: "center", borderTop: `1px solid ${GOLD}33` }}>
              <span style={{ fontSize: 11, color: `${GOLD}77`, letterSpacing: 1, fontWeight: 700 }}>TAP A PLAYER FOR FULL BREAKDOWN</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: "#c9a84c" }}>Loading...</p>}>
      <LeaderboardInner />
    </Suspense>
  );
}