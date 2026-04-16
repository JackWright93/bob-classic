"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const LIGHT_GREEN = "#e8f5ee";
const WHITE = "#ffffff";
const GRAY = "#6b7280";

type PlayerPoints = {
  id: string;
  name: string;
  totalPoints: number;
  roundSummary: { name: string; points: number }[];
};

function calcRelativeHandicap(handicap: number, lowest: number) {
  return Math.max(0, Math.round(handicap - lowest));
}

function getStrokesReceived(hcp: number, si: number | null) {
  if (!si) return 0;
  return Math.floor(hcp / 18) + (si <= (hcp % 18) ? 1 : 0);
}

function LeaderboardInner() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<PlayerPoints[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: players } = await supabase.from("players").select("id, name, base_handicap");
      const { data: rounds } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").order("sort_order");
      const { data: scores } = await supabase.from("hole_scores").select("hole_no, strokes, player_id, round_id");
      const { data: holes } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index, scorecard_key");

      if (!players || !rounds || !scores || !holes) { setLoading(false); return; }

      const lowest = Math.min(...players.map(p => p.base_handicap ?? 0));

      const result: PlayerPoints[] = players.map(player => {
        const hcp = calcRelativeHandicap(player.base_handicap ?? 0, lowest);
        let total = 0;
        const roundSummary: { name: string; points: number }[] = [];

        rounds.forEach(round => {
          const isSC = round.scorecard_key === "Sand Creek Course::Par 3";
          const roundHoles = holes.filter(h => h.scorecard_key === round.scorecard_key);
          const playerScores = scores.filter(s => s.player_id === player.id && s.round_id === round.id);
          if (playerScores.length === 0) return;

          let pts = 0;

          playerScores.forEach(score => {
            const hole = roundHoles.find(h => h.hole_no === score.hole_no);
            if (!hole) return;
            if (isSC) {
              if (score.strokes === hole.par - 1) pts += 1;
            } else {
              const sr = getStrokesReceived(hcp, hole.stroke_index);
              const diff = (score.strokes - sr) - hole.par;
              if (score.strokes === 1) pts += 5;
              else if (diff <= -2) pts += 3;
              else if (diff === -1) pts += 1;
            }
          });

          if (isSC) {
            const t = playerScores.reduce((s, x) => s + x.strokes, 0);
            if (playerScores.length === 9 && t <= 27) pts += 1;
          }

          // Low gross
          const allTotals = players.map(p => {
            const ps = scores.filter(s => s.player_id === p.id && s.round_id === round.id);
            if (ps.length < roundHoles.length) return null;
            return { id: p.id, total: ps.reduce((s, x) => s + x.strokes, 0) };
          }).filter(Boolean) as { id: string; total: number }[];

          if (allTotals.length >= 2) {
            const sorted = [...allTotals].sort((a, b) => a.total - b.total);
            const pm: Record<number, number> = { 0: 3, 1: 2, 2: 1 };
            let i = 0;
            while (i < sorted.length) {
              let j = i;
              while (j < sorted.length && sorted[j].total === sorted[i].total) j++;
              const shared = Math.floor(
                Array.from({ length: j - i }, (_, k) => pm[i + k] ?? 0).reduce((a, b) => a + b, 0) / (j - i)
              );
              if (shared > 0) {
                for (let k = i; k < j; k++) {
                  if (sorted[k].id === player.id) pts += shared;
                }
              }
              i = j;
            }
          }

          total += pts;
          roundSummary.push({ name: round.name, points: pts });
        });

        return { id: player.id, name: player.name, totalPoints: total, roundSummary };
      });

      result.sort((a, b) => b.totalPoints - a.totalPoints);
      setLeaderboard(result);
      setLoading(false);
    };

    load();

    const channel = supabase.channel("lb")
      .on("postgres_changes", { event: "*", schema: "public", table: "hole_scores" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: GREEN, padding: "16px 20px 24px", textAlign: "center", position: "relative" }}>
        <button onClick={() => router.push("/")} style={{ position: "absolute", left: 20, top: 18, background: "none", border: "none", color: WHITE, fontSize: 20, cursor: "pointer" }}>←</button>
        <h1 style={{ color: WHITE, fontSize: 22, fontWeight: "bold", margin: 0 }}>🏆 Leaderboard</h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>Updates live as scores are entered</p>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY }}>Loading...</p>}

        {!loading && leaderboard.map((player, index) => (
          <div key={player.id} onClick={() => router.push(`/leaderboard/${player.id}`)}
            style={{ background: index === 0 ? LIGHT_GREEN : WHITE, borderRadius: 14, padding: 16, marginBottom: 10, border: index === 0 ? `2px solid ${GREEN}` : "1px solid #e5e7eb", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`}</span>
                <span style={{ fontSize: 17, fontWeight: "bold", color: "#111" }}>{player.name}</span>
              </div>
              <div>
                <span style={{ fontSize: 22, fontWeight: "bold", color: index === 0 ? GREEN : "#111" }}>{player.totalPoints}</span>
                <span style={{ fontSize: 13, color: GRAY }}> pts</span>
              </div>
            </div>
            {player.roundSummary.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {player.roundSummary.map((r, i) => (
                  <span key={i} style={{ fontSize: 12, background: r.points > 0 ? LIGHT_GREEN : "#f3f4f6", borderRadius: 6, padding: "3px 8px", color: r.points > 0 ? GREEN : GRAY, fontWeight: r.points > 0 ? "bold" : "normal" }}>
                    {r.name}: {r.points}pts
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <LeaderboardInner />
    </Suspense>
  );
}