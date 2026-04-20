"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Trip = { id: string; name: string; invite_code: string; };
type Player = { id: string; name: string; is_admin: boolean; base_handicap: number | null; };
type Round = { id: string; name: string; scorecard_key: string; sort_order: number; };

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [needsPlayerLink, setNeedsPlayerLink] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  const sendOtp = async () => {
    setError(null);
    if (!loginEmail) { setError("Please enter your email."); return; }
    const { error } = await supabase.auth.signInWithOtp({
      email: loginEmail,
      options: { shouldCreateUser: true },
    });
    if (error) { setError(error.message); return; }
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setError(null);
    if (!otpCode) { setError("Please enter the code."); return; }
    const { error } = await supabase.auth.verifyOtp({
      email: loginEmail,
      token: otpCode,
      type: "email",
    });
    if (error) { setError(error.message); return; }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setTrip(null); setPlayers([]); setRounds([]);
    setSessionEmail(null); setError(null);
    setNeedsPlayerLink(false); setOtpSent(false); setOtpCode("");
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
      if (!meData || !meData.trip_id) { setNeedsPlayerLink(true); setLoading(false); return; }

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
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "'Arial', sans-serif" }}>

      {/* Hero Header */}
      <div style={{
        background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${GREEN} 100%)`,
        padding: "40px 24px 32px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background pattern */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.05, backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "20px 20px" }} />

        {/* Circular logo */}
        <div style={{
          width: 100, height: 100, borderRadius: "50%",
          border: `3px solid ${GOLD}`,
          overflow: "hidden",
          margin: "0 auto 16px",
          boxShadow: `0 0 0 4px ${DARK_GREEN}, 0 4px 20px rgba(0,0,0,0.3)`,
          background: WHITE,
        }}>
          <img
            src="https://kqtipluvrwczlorccmlb.supabase.co/storage/v1/object/public/assets/TBC%20Main.png"
            alt="The Bob Classic"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        <h1 style={{ color: WHITE, fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>The Bob Classic</h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
          <div style={{ height: 1, width: 40, background: GOLD, opacity: 0.6 }} />
          <p style={{ color: GOLD, fontSize: 13, margin: 0, letterSpacing: 1 }}>2026 · FRENCH LICK, IN</p>
          <div style={{ height: 1, width: 40, background: GOLD, opacity: 0.6 }} />
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>

        {loading && <p style={{ textAlign: "center", color: GRAY, padding: 40 }}>Loading...</p>}

        {/* Login Screen */}
        {!loading && !sessionEmail && (
          <div style={{ background: WHITE, borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🏌️</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: "#111" }}>Welcome Back</h2>
            <p style={{ color: GRAY, marginBottom: 24, fontSize: 14 }}>
              {otpSent ? "Enter the 6-digit code sent to your email." : "Sign in to access your scorecard and leaderboard."}
            </p>

            {!otpSent ? (
              <>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  style={{ width: "100%", padding: "14px 16px", fontSize: 16, borderRadius: 12, border: "2px solid #e5e7eb", marginBottom: 12, boxSizing: "border-box" as const, outline: "none" }}
                />
                <button onClick={sendOtp} style={{ width: "100%", padding: "15px", fontSize: 16, fontWeight: 800, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, color: WHITE, cursor: "pointer", letterSpacing: 0.5 }}>
                  📧 SEND ME A CODE
                </button>
              </>
            ) : (
              <>
                <input
                  type="number"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  style={{ width: "100%", padding: "14px", fontSize: 32, borderRadius: 12, border: "2px solid #e5e7eb", marginBottom: 12, boxSizing: "border-box" as const, textAlign: "center", letterSpacing: 12, fontWeight: 800 }}
                />
                <button onClick={verifyOtp} style={{ width: "100%", padding: "15px", fontSize: 16, fontWeight: 800, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, color: WHITE, cursor: "pointer" }}>
                  ✓ VERIFY CODE
                </button>
                <button onClick={() => { setOtpSent(false); setOtpCode(""); setError(null); }}
                  style={{ width: "100%", padding: "12px", fontSize: 14, borderRadius: 12, border: "2px solid #e5e7eb", background: WHITE, color: GRAY, cursor: "pointer", marginTop: 8 }}>
                  ← Use a different email
                </button>
              </>
            )}
            {error && <p style={{ color: "#ef4444", marginTop: 12, fontSize: 13, fontWeight: 600 }}>{error}</p>}
          </div>
        )}

        {/* Who Are You Screen */}
        {!loading && sessionEmail && needsPlayerLink && (
          <div style={{ background: WHITE, borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: "#111" }}>Who Are You?</h2>
            <p style={{ color: GRAY, marginBottom: 24, fontSize: 14 }}>Select your name to get started.</p>
            <div style={{ display: "grid", gap: 10 }}>
              {allPlayers.map((player) => (
                <button key={player.id} onClick={() => linkPlayer(player.id)}
                  style={{ width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, borderRadius: 12, border: `2px solid ${GREEN}`, background: WHITE, color: GREEN, cursor: "pointer", textAlign: "left", paddingLeft: 20 }}>
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main App */}
        {!loading && sessionEmail && !needsPlayerLink && (
          <div style={{ display: "grid", gap: 16 }}>

            {error && <div style={{ background: "#fee2e2", borderRadius: 12, padding: "12px 16px", color: "#991b1b", fontSize: 14, fontWeight: 600 }}>{error}</div>}

            {/* Nav Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => router.push("/leaderboard")}
                style={{ padding: "20px 12px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${GOLD}, #a8853a)`, color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: 800, textAlign: "center", boxShadow: "0 4px 12px rgba(201,168,76,0.4)", letterSpacing: 0.5 }}>
                🏆<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>LEADERBOARD</span>
              </button>
              <button onClick={() => router.push("/history")}
                style={{ padding: "20px 12px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: 800, textAlign: "center", boxShadow: "0 4px 12px rgba(26,107,60,0.4)", letterSpacing: 0.5 }}>
                🏅<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>HALL OF CHAMPIONS</span>
              </button>
              <button onClick={() => router.push("/admin")}
                style={{ padding: "18px 12px", borderRadius: 16, border: "2px solid #e5e7eb", background: WHITE, color: "#111", cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>
                ⚙️<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>ADMIN</span>
              </button>
              <button onClick={logout}
                style={{ padding: "18px 12px", borderRadius: 16, border: "2px solid #e5e7eb", background: WHITE, color: "#111", cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "center", letterSpacing: 0.5 }}>
                👋<br /><span style={{ fontSize: 12, marginTop: 4, display: "block" }}>LOG OUT</span>
              </button>
            </div>

            {/* Rounds */}
            <div style={{ background: WHITE, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>⛳</span>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>Rounds</h2>
              </div>
              <div style={{ padding: "12px 16px", display: "grid", gap: 8 }}>
                {rounds.map((round, index) => (
                  <button key={round.id} onClick={() => router.push(`/round?id=${round.id}`)}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid #f0f2f0", background: "#f9fafb", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: 13, fontWeight: 800 }}>
                        {index + 1}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{round.name}</span>
                    </div>
                    <span style={{ color: GOLD, fontSize: 18, fontWeight: 800 }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Players */}
            <div style={{ background: WHITE, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>👥</span>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>Players ({players.length})</h2>
              </div>
              <div style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
                {players.map((player) => (
                  <div key={player.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#f9fafb" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>
                        {player.name} {player.is_admin ? "⭐" : ""}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>HCP {player.base_handicap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trip info */}
            {trip && (
              <div style={{ background: `linear-gradient(135deg, ${DARK_GREEN}, ${GREEN})`, borderRadius: 16, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>INVITE CODE</span>
                <span style={{ color: GOLD, fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>{trip.invite_code}</span>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}