"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Trip = {
  id: string;
  name: string;
  invite_code: string;
};

type Player = {
  id: string;
  name: string;
  is_admin: boolean;
  base_handicap: number | null;
};

type Round = {
  id: string;
  name: string;
  scorecard_key: string;
  sort_order: number;
};

const GREEN = "#1a6b3c";
const LIGHT_GREEN = "#e8f5ee";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [needsPlayerLink, setNeedsPlayerLink] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  const login = async () => {
    setError(null);
    if (!loginEmail) { setError("Please enter your email."); return; }
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: { emailRedirectTo: "https://bob-classic.vercel.app" },
    });
    if (error) { setError(error.message); return; }
    alert("Check your email for the login link.");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setTrip(null);
    setPlayers([]);
    setRounds([]);
    setSessionEmail(null);
    setError(null);
    setNeedsPlayerLink(false);
  };

  const linkPlayer = async (playerId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("players").update({ auth_user_id: session.user.id }).eq("id", playerId);
    setNeedsPlayerLink(false);
    window.location.reload();
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setSessionEmail(session.user.email ?? null);

      const { data: allP } = await supabase.from("players").select("id, name, is_admin, base_handicap");
      setAllPlayers(allP ?? []);

      const { data: meData, error: meError } = await supabase
        .from("players").select("*").eq("auth_user_id", session.user.id).limit(1).maybeSingle();

      if (meError) { setError(meError.message); setLoading(false); return; }

      if (!meData || !meData.trip_id) {
        setNeedsPlayerLink(true);
        setLoading(false);
        return;
      }

      const tripId = meData.trip_id as string;

      const { data: tripData } = await supabase.from("trips").select("id, name, invite_code").eq("id", tripId).limit(1).maybeSingle();
      if (tripData) setTrip(tripData);

      const { data: playerData } = await supabase.from("players").select("id, name, is_admin, base_handicap").eq("trip_id", tripId).order("name");
      setPlayers(playerData ?? []);

      const { data: roundData } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").eq("trip_id", tripId).order("sort_order");
      setRounds(roundData ?? []);

      setLoading(false);
    };

    run();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { run(); });
    return () => { subscription.unsubscribe(); };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "'Arial', sans-serif" }}>

      {/* Header */}
      <div style={{ background: GREEN, padding: "0 20px", paddingTop: 48, paddingBottom: 32, textAlign: "center" }}>
        <img
          src="https://kqtipluvrwczlorccmlb.supabase.co/storage/v1/object/public/assets/TBC%20Main.png"
          alt="The Bob Classic"
          style={{ width: 120, height: 120, objectFit: "contain", margin: "0 auto 16px", display: "block" }}
        />
        <h1 style={{ color: WHITE, fontSize: 28, fontWeight: "bold", margin: 0, letterSpacing: 1 }}>The Bob Classic</h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 6 }}>2026 · French Lick, IN</p>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 20px" }}>

        {loading && <p style={{ textAlign: "center", color: GRAY }}>Loading...</p>}

        {/* Login Screen */}
        {!loading && !sessionEmail && (
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏌️</div>
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8, color: "#111" }}>Welcome</h2>
            <p style={{ color: GRAY, marginBottom: 24, fontSize: 14 }}>Sign in to access your scorecard and leaderboard.</p>
            <input
              type="email"
              placeholder="Enter your email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              style={{ width: "100%", padding: "14px", fontSize: 16, borderRadius: 10, border: "1px solid #d1d5db", marginBottom: 12, boxSizing: "border-box" as const }}
            />
            <button onClick={login} style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: "bold", borderRadius: 10, border: "none", background: GREEN, color: WHITE, cursor: "pointer" }}>
              📧 Email me a login link
            </button>
            {error && <p style={{ color: "red", marginTop: 12, fontSize: 13 }}>{error}</p>}
          </div>
        )}

        {/* Who Are You Screen */}
        {!loading && sessionEmail && needsPlayerLink && (
          <div style={{ background: WHITE, borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
            <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 8, color: "#111" }}>Welcome!</h2>
            <p style={{ color: GRAY, marginBottom: 24, fontSize: 14 }}>Who are you? Select your name to get started.</p>
            <div style={{ display: "grid", gap: 10 }}>
              {allPlayers.map((player) => (
                <button key={player.id} onClick={() => linkPlayer(player.id)}
                  style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: "bold", borderRadius: 10, border: `1px solid ${LIGHT_GREEN}`, background: LIGHT_GREEN, color: GREEN, cursor: "pointer" }}>
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main App */}
        {!loading && sessionEmail && !needsPlayerLink && (
          <div style={{ display: "grid", gap: 20 }}>

            {error && <div style={{ background: "#fee2e2", borderRadius: 10, padding: "12px 16px", color: "#991b1b", fontSize: 14 }}>{error}</div>}

            {/* Nav Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button onClick={() => router.push("/leaderboard")} style={{ padding: "16px 12px", borderRadius: 12, border: "none", background: GOLD, color: WHITE, cursor: "pointer", fontSize: 14, fontWeight: "bold", textAlign: "center" }}>
                🏆<br />Leaderboard
              </button>
              <button onClick={() => router.push("/history")} style={{ padding: "16px 12px", borderRadius: 12, border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontSize: 14, fontWeight: "bold", textAlign: "center" }}>
                🏅<br />Hall of Champions
              </button>
              <button onClick={() => router.push("/admin")} style={{ padding: "16px 12px", borderRadius: 12, border: "1px solid #d1d5db", background: WHITE, color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: "bold", textAlign: "center" }}>
                ⚙️<br />Admin
              </button>
              <button onClick={logout} style={{ padding: "16px 12px", borderRadius: 12, border: "1px solid #d1d5db", background: WHITE, color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: "bold", textAlign: "center" }}>
                👋<br />Log Out
              </button>
            </div>

            {/* Rounds */}
            <div style={{ background: WHITE, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#111" }}>📅 Rounds</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {rounds.map((round) => (
                  <button key={round.id} onClick={() => router.push(`/round?id=${round.id}`)}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${LIGHT_GREEN}`, background: LIGHT_GREEN, cursor: "pointer", fontSize: 15, fontWeight: "bold", color: GREEN, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{round.name}</span>
                    <span style={{ fontSize: 18 }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Players */}
            <div style={{ background: WHITE, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#111" }}>👥 Players ({players.length})</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {players.map((player) => (
                  <div key={player.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, background: "#f9fafb" }}>
                    <span style={{ fontWeight: "bold", fontSize: 14 }}>
                      {player.name} {player.is_admin ? "⭐" : ""}
                    </span>
                    <span style={{ fontSize: 13, color: GRAY }}>HCP {player.base_handicap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trip info */}
            {trip && (
              <div style={{ background: WHITE, borderRadius: 16, padding: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 12, color: "#111" }}>🏌️ Trip Info</h2>
                <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Invite Code: <strong style={{ color: "#111" }}>{trip.invite_code}</strong></p>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}