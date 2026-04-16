"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      const { data: players } = await supabase
        .from("players")
        .select("id, name, base_handicap");

      const { data: roundsData } = await supabase
        .from("rounds")
        .select("id, name, scorecard_key, sort_order")
        .order("sort_order");

      const { data: allScores } = await supabase
        .from("hole_scores")
        .select("hole_no, strokes, player_id, round_id");

      const { data: allHoles } = await supabase
        .from("scorecard_holes")
        .select("hole_no, par, stroke_index, scorecard_key");

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
        const playerScores = allScores.filter(
          (s) => s.player_id === playerId && s.round_id === round.id
        );

        if (playerScores.length === 0) return;

        let points = 0;
        const details: string[] = [];

        playerScores.forEach((score) => {
          const hole = holes.find((h) => h.hole_no === score.hole_no);
          if (!hole) return;

          if (isSandCreek) {
            if (score.strokes === hole.par - 1) {
              points += 1;
              details.push(`🐦 Birdie on hole ${score.hole_no}`);
            }
          } else {
            const strokesReceived = getStrokesReceived(relativeHandicap, hole.stroke_index);
            const netScore = score.strokes - strokesReceived;
            const diff = netScore - hole.par;

            if (score.strokes === 1) {
              points += 5;
              details.push(`🎯 Hole-in-one on hole ${score.hole_no} (+5)`);
            } else if (diff <= -2) {
              points += 3;
              details.push(`🦅 Net eagle on hole ${score.hole_no} (+3)`);
            } else if (diff === -1) {
              points += 1;
              details.push(`🐦 Net birdie on hole ${score.hole_no} (+1)`);
            }
          }
        });

        if (isSandCreek) {
          const total = playerScores.reduce((sum, s) => sum + s.strokes, 0);
          if (playerScores.length === 9 && total <= 27) {
            points += 1;
            details.push(`⭐ Shot ${total} — 27 or under (+1)`);
          }
        }

        // Low gross ranking
        const allPlayerTotals = players.map((p) => {
          const scores = allScores.filter(
            (s) => s.player_id === p.id && s.round_id === round.id
          );
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

        const grossTotal = playerScores.reduce((sum, s) => sum + s.strokes, 0);

        breakdowns.push({
          roundId: round.id,
          roundName: round.name,
          points,
          details,
          grossTotal,
          holesCompleted: playerScores.length,
          totalHoles: holes.length,
        });
      });

      setRounds(breakdowns);
      setTotalPoints(breakdowns.reduce((sum, r) => sum + r.points, 0));
      setLoading(false);
    };

    run();
  }, [playerId]);

  return (
    <main style={{ padding: 20, fontFamily: "Arial, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <button onClick={() => router.push("/leaderboard")} style={{ marginBottom: 16, background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#3b82f6" }}>
        ← Leaderboard
      </button>

      {loading && <p>Loading...</p>}

      {!loading && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>{playerName}</h1>
            <div style={{ fontSize: 32, fontWeight: "bold", color: "#f59e0b" }}>
              {totalPoints} pts
            </div>
          </div>

          {rounds.length === 0 && (
            <p style={{ color: "#6b7280" }}>No scores entered yet.</p>
          )}

          {rounds.map((round) => (
            <div key={round.roundId} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px", marginBottom: 12, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: "bold", fontSize: 16 }}>{round.roundName}</span>
                  <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280" }}>
                    {round.holesCompleted}/{round.totalHoles} holes
                  </span>
                </div>
                <span style={{ fontWeight: "bold", fontSize: 18, color: round.points > 0 ? "#16a34a" : "#6b7280" }}>
                  {round.points} pts
                </span>
              </div>

              {round.grossTotal !== null && (
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
                  Gross total: {round.grossTotal}
                </div>
              )}

              {round.details.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af" }}>No points earned yet</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {round.details.map((d, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

export default function PlayerDetailPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <PlayerDetailInner />
    </Suspense>
  );
}