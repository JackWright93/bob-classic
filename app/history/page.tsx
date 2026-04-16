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

function HistoryInner() {
  const router = useRouter();
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("historical_winners").select("*").order("year", { ascending: false });
      setWinners(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const borderColors = [GOLD, GREEN, "#7c3aed", "#dc2626", "#2563eb", "#0891b2", "#d97706", "#059669", "#db2777"];

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

        {!loading && winners.map((winner, index) => (
          <div key={winner.id} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", border: `3px solid ${borderColors[index % borderColors.length]}` }}>
            {winner.photo_url ? (
              <img src={winner.photo_url} alt={winner.winner_name}
                style={{ width: "100%", height: 400, objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: 300, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>🏌️</div>
            )}

            <div style={{ background: WHITE, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: "bold", color: "#111" }}>{winner.winner_name}</div>
                  <div style={{ fontSize: 15, color: GRAY, marginTop: 2 }}>{winner.location}</div>
                </div>
                <div style={{ background: borderColors[index % borderColors.length], color: WHITE, borderRadius: 10, padding: "6px 14px", fontSize: 16, fontWeight: "bold" }}>
                  {winner.year}
                </div>
              </div>
              {winner.notes && (
                <p style={{ marginTop: 10, fontSize: 13, color: GRAY, fontStyle: "italic", borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>{winner.notes}</p>
              )}
            </div>
          </div>
        ))}
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