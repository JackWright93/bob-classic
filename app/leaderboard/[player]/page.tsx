"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#ffffff";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const RED = "#cc0000";
const BG = "#134d2b";

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

function getStrokesReceived(relativeHandicap: number, strokeIndex: number | null) {
  if (!strokeIndex) return 0;
  return Math.floor(relativeHandicap / 18) + (strokeIndex <= (relativeHandicap % 18) ? 1 : 0);
}

function PlayerDetailInner() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.player as string;

  const [playerName, setPlayerName] = useState("");
  const [totalPoints, setTotalPoints] = useState(0);
  const [rounds, setRounds] = useState<RoundBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const { data: players } = await supabase.from("players").select("id, name, base_handicap");
      const { data: roundsData } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").order("sort_order");
      const { data: allScores } = await supabase.from("hole_scores").select("hole_no, strokes, player_id, round_id");
      const { data: allHoles } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index, scorecard_key");

      if (!players || !roundsData || !allScores || !allHoles) return;

      const player = players.find((p) => p.id === playerId);
      if (!player) return;
      setPlayerName(player.name);

      const lowestHandicap = Math.min(...players.map((p) => p.base_handicap ?? 0));
      const relativeHandicap = calcRelativeHandicap(player.base_handicap ?? 0, lowestHandicap);
      const breakdowns: RoundBreakdown[] = [];

      roundsData.forEach((round) => {
        const isSandCreek = round.scorecard_key === "Sand Creek Course::Par 3";
        const holes = allHoles.filter((h) => h.scorecard_key === round.scorecard_key);
        const playerScores = allScores.filter((s) => s.player_id === playerId && s.round_id === round.id);
        if (playerScores.length === 0) return;

        let points = 0;
        const details: string[] = [];

        playerScores.forEach((score) => {
          const hole = holes.find((h) => h.hole_no === score.hole_no);
          if (!hole) return;
          if (isSandCreek) {
            if (score.strokes === hole.par - 1) { points += 1; details.push(`🐦 Birdie on hole ${score.hole_no} (+1)`); }
          } else {
            const strokesReceived = getStrokesReceived(relativeHandicap, hole.stroke_index);
            const diff = (score.strokes - strokesReceived) - hole.par;
            if (score.strokes === 1) { points += 5; details.push(`🎯 Hole-in-one on hole ${score.hole_no} (+5)`); }
            else if (diff <= -2) { points += 3; details.push(`🦅 Net eagle on hole ${score.hole_no} (+3)`); }
            else if (diff === -1) { points += 1; details.push(`🐦 Net birdie on hole ${score.hole_no} (+1)`); }
          }
        });

        if (isSandCreek) {
          const total = playerScores.reduce((sum, s) => sum + s.strokes, 0);
          if (playerScores.length === 9 && total <= 27) { points += 1; details.push(`⭐ Shot ${total} — 27 or under (+1)`); }
        }

        const allPlayerTotals = players.map((p) => {
          const scores = allScores.filter((s) => s.player_id === p.id && s.round_id === round.id);
          if (scores.length < holes.length) return null;
          return { playerId: p.id, total: scores.reduce((sum, s) => sum + s.strokes, 0) };
        }).filter(Boolean) as { playerId: string; total: number }[];

        if (allPlayerTotals.length >= 2) {
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

        breakdowns.push({
          roundId: round.id, roundName: round.name, points, details,
          grossTotal: playerScores.reduce((sum, s) => sum + s.strokes, 0),
          holesCompleted: playerScores.length, totalHoles: holes.length,
        });
      });

      setRounds(breakdowns);
      setTotalPoints(breakdowns.reduce((sum, r) => sum + r.points, 0));
      setLoading(false);
    };
    run();
  }, [playerId]);

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 24px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/leaderboard")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>

        {!loading && (
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
              <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>PLAYER SCORECARD</span>
              <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            </div>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: `linear-gradient(135deg, ${GOLD}, #a8853a)`, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: DARK_GREEN, boxShadow: `0 0 0 3px ${DARK_GREEN}, 0 0 0 5px ${GOLD}44` }}>
              {playerName.charAt(0)}
            </div>
            <h1 style={{ color: WHITE, fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>{playerName}</h1>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: RED, borderRadius: 8, padding: "4px 16px" }}>
              <span style={{ color: WHITE, fontSize: 28, fontWeight: 900 }}>{totalPoints}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>PTS</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
        {loading && <p style={{ textAlign: "center", color: GOLD, padding: 40, letterSpacing: 1 }}>LOADING...</p>}

        {!loading && rounds.length === 0 && (
          <div style={{ background: `${DARK_GREEN}cc`, borderRadius: 14, padding: 24, textAlign: "center", color: GOLD, border: `1px solid ${GOLD}33`, letterSpacing: 1 }}>
            NO SCORES ENTERED YET
          </div>
        )}

        {!loading && rounds.map((round, index) => (
          <div key={round.roundId} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", border: `1px solid ${GOLD}33` }}>

            {/* Round header */}
            <div style={{ background: round.points > 0 ? `linear-gradient(90deg, ${GREEN}, ${DARK_GREEN})` : DARK_GREEN, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${GOLD}33` }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: WHITE, letterSpacing: 1, textTransform: "uppercase" }}>{round.roundName}</div>
                <div style={{ fontSize: 11, color: `${GOLD}99`, fontWeight: 700, letterSpacing: 0.5, marginTop: 2 }}>
                  {round.holesCompleted}/{round.totalHoles} HOLES · GROSS: {round.grossTotal}
                </div>
              </div>
              <div style={{ background: round.points > 0 ? RED : `${DARK_GREEN}`, border: `1px solid ${round.points > 0 ? RED : GOLD + "44"}`, borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: WHITE }}>{round.points}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, letterSpacing: 1 }}>PTS</div>
              </div>
            </div>

            {/* Details */}
            <div style={{ background: `${DARK_GREEN}cc`, padding: "10px 16px" }}>
              {round.details.length === 0 ? (
                <p style={{ fontSize: 12, color: `${GOLD}66`, margin: 0, letterSpacing: 0.5, fontWeight: 700 }}>NO POINTS EARNED YET</p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {round.details.map((d, i) => (
                    <div key={i} style={{ fontSize: 13, color: WHITE, background: `${GREEN}44`, borderRadius: 8, padding: "7px 12px", borderLeft: `3px solid ${GOLD}`, fontWeight: 600 }}>{d}</div>
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