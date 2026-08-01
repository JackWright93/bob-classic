"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Trip = { id: string; name: string; invite_code: string; };
type Player = { id: string; name: string; is_admin: boolean; base_handicap: number | null; avatar: string | null; };
type Round = { id: string; name: string; scorecard_key: string; sort_order: number; };
type TopPlayer = { id: string; name: string; avatar: string | null; totalPoints: number; };

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

function calcRelativeHandicap(handicap: number, lowest: number) {
  return Math.max(0, Math.round(handicap - lowest));
}

function getStrokesReceived(hcp: number, si: number | null) {
  if (!si) return 0;
  return Math.floor(hcp / 18) + (si <= (hcp % 18) ? 1 : 0);
}

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
  const [unreadFeedCount, setUnreadFeedCount] = useState(0);
  const [topThree, setTopThree] = useState<TopPlayer[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const getInitial = (name: string) => name.charAt(0).toUpperCase() || "?";

  const renderAvatar = (avatar: string | null | undefined, name: string, size: number) => {
    if (avatar && avatar.startsWith("http")) {
      return <img src={avatar} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${GOLD}` }} />;
    }
    if (avatar) {
      return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.55, flexShrink: 0 }}>
          {avatar}
        </div>
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: size * 0.42, fontWeight: 900, flexShrink: 0 }}>
        {getInitial(name)}
      </div>
    );
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setSessionEmail(session.user.email ?? null);

      const { data: allP } = await supabase.from("players").select("id, name, is_admin, base_handicap, avatar");
      setAllPlayers(allP ?? []);

      const { data: meData, error: meError } = await supabase
        .from("players").select("*").eq("auth_user_id", session.user.id).limit(1).maybeSingle();
      if (meError) { setError(meError.message); setLoading(false); return; }
      if (!meData || !meData.trip_id) { setNeedsPlayerLink(true); setLoading(false); return; }

      const tripId = meData.trip_id as string;
      const { data: tripData } = await supabase.from("trips").select("id, name, invite_code").eq("id", tripId).limit(1).maybeSingle();
      if (tripData) setTrip(tripData);

      const { data: playerData } = await supabase.from("players").select("id, name, is_admin, base_handicap, avatar").eq("trip_id", tripId).order("name");
      setPlayers(playerData ?? []);

      const { data: roundData } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").eq("trip_id", tripId).order("sort_order");
      setRounds(roundData ?? []);

      // Unread social feed count: posts from other players, plus any automatic
      // achievement/roundup posts (even ones triggered by this player's own scoring),
      // since this player last viewed the feed. Own manual posts stay excluded.
      // A never-viewed feed (null) counts everything currently posted as unread.
      const { count } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .gt("created_at", meData.last_feed_view_at ?? "1970-01-01")
        .or(`player_id.neq.${meData.id},post_type.eq.auto,post_type.eq.roundup`);
      setUnreadFeedCount(count ?? 0);

      // Leaderboard teaser: same scoring logic as the full /leaderboard page, trimmed to the top 3.
      const { data: allTripPlayers } = await supabase.from("players").select("id, name, base_handicap, avatar").eq("trip_id", tripId);
      const { data: scoresData } = await supabase.from("hole_scores").select("hole_no, strokes, player_id, round_id");
      const { data: holesData } = await supabase.from("scorecard_holes").select("hole_no, par, stroke_index, scorecard_key");

      if (allTripPlayers && roundData && scoresData && holesData) {
        const lowest = Math.min(...allTripPlayers.map((p) => p.base_handicap ?? 0));

        const ranked: TopPlayer[] = allTripPlayers.map((player) => {
          const hcp = calcRelativeHandicap(player.base_handicap ?? 0, lowest);
          let total = 0;

          roundData.forEach((round) => {
            const isSC = round.scorecard_key === "Sand Creek Course::Par 3";
            const roundHoles = holesData.filter((h) => h.scorecard_key === round.scorecard_key);
            const playerScores = scoresData.filter((s) => s.player_id === player.id && s.round_id === round.id);
            if (playerScores.length === 0) return;

            let pts = 0;
            playerScores.forEach((score) => {
              const hole = roundHoles.find((h) => h.hole_no === score.hole_no);
              if (!hole) return;
              if (isSC) {
                if (score.strokes === hole.par - 1) pts += 1;
              } else {
                const sr = getStrokesReceived(hcp, hole.stroke_index);
                const diff = score.strokes - sr - hole.par;
                if (score.strokes === 1) pts += 5;
                else if (diff <= -2) pts += 3;
                else if (diff === -1) pts += 1;
              }
            });

            if (isSC) {
              const t = playerScores.reduce((s, x) => s + x.strokes, 0);
              if (playerScores.length === 9 && t <= 27) pts += 1;
            }

            const allTotals = allTripPlayers.map((p) => {
              const ps = scoresData.filter((s) => s.player_id === p.id && s.round_id === round.id);
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
          });

          return { id: player.id, name: player.name, avatar: player.avatar, totalPoints: total };
        });

        ranked.sort((a, b) => b.totalPoints - a.totalPoints);
        setTopThree(ranked.slice(0, 3));
      }

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
          <p style={{ color: GOLD, fontSize: 13, margin: 0, letterSpacing: 1 }}>2026 · 10-YEAR ANNIVERSARY</p>
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

            {/* Live Leaderboard Teaser */}
            {topThree.length > 0 && (
              <div onClick={() => router.push("/leaderboard")}
                style={{ cursor: "pointer", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                <div style={{ background: `linear-gradient(135deg, ${GOLD}, #a8853a)`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: DARK_GREEN, letterSpacing: 0.5 }}>🏆 LIVE LEADERBOARD</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: DARK_GREEN }}>View Full →</span>
                </div>
                <div style={{ background: DARK_GREEN, padding: "14px 16px", display: "flex", justifyContent: "space-around" }}>
                  {topThree.map((player, index) => {
                    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                    return (
                      <div key={player.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ position: "relative" }}>
                          {renderAvatar(player.avatar, player.name, 46)}
                          <span style={{ position: "absolute", bottom: -4, right: -4, fontSize: 16 }}>{medal}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: WHITE, textAlign: "center", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: GOLD }}>{player.totalPoints} pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => router.push("/feed")}
                style={{ position: "relative", padding: "24px 12px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, #7c3aed, #5b21b6)`, color: WHITE, cursor: "pointer", fontSize: 14, fontWeight: 800, textAlign: "center", boxShadow: "0 4px 12px rgba(124,58,237,0.4)", letterSpacing: 0.5 }}>
                <span style={{ fontSize: 22 }}>⚡</span><br /><span style={{ fontSize: 13, marginTop: 6, display: "block" }}>SOCIAL FEED</span>
                {unreadFeedCount > 0 && (
                  <span style={{ position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, background: "#ff3b30", color: WHITE, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: "2px solid " + WHITE, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>
                    {unreadFeedCount > 9 ? "9+" : unreadFeedCount}
                  </span>
                )}
              </button>
              <button onClick={() => router.push("/tee-times")}
                style={{ padding: "24px 12px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, #d97706, #b45309)`, color: WHITE, cursor: "pointer", fontSize: 14, fontWeight: 800, textAlign: "center", boxShadow: "0 4px 12px rgba(217,119,6,0.4)", letterSpacing: 0.5 }}>
                <span style={{ fontSize: 22 }}>🕒</span><br /><span style={{ fontSize: 13, marginTop: 6, display: "block" }}>TEE TIMES</span>
              </button>
            </div>

            {/* More menu */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen((prev) => !prev)}
                style={{ width: "100%", padding: "12px", borderRadius: 12, border: "2px solid #e5e7eb", background: WHITE, color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                ☰ More {menuOpen ? "▲" : "▼"}
              </button>
              {menuOpen && (
                <div style={{ marginTop: 8, background: WHITE, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
                  {[
                    { label: "🏆 Leaderboard", path: "/leaderboard" },
                    { label: "🏅 Hall of Champions", path: "/history" },
                    { label: "🎨 My Avatar", path: "/profile" },
                    { label: "📖 Scoring & Rules", path: "/rules" },
                    { label: "⚙️ Admin", path: "/admin" },
                  ].map((item, i, arr) => (
                    <button key={item.path} onClick={() => { setMenuOpen(false); router.push(item.path); }}
                      style={{ width: "100%", padding: "14px 16px", border: "none", borderBottom: i < arr.length - 1 ? "1px solid #f0f2f0" : "none", background: WHITE, color: "#111", cursor: "pointer", fontSize: 14, fontWeight: 700, textAlign: "left" }}>
                      {item.label}
                    </button>
                  ))}
                  <button onClick={() => { setMenuOpen(false); logout(); }}
                    style={{ width: "100%", padding: "14px 16px", border: "none", background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 14, fontWeight: 700, textAlign: "left" }}>
                    👋 Log Out
                  </button>
                </div>
              )}
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
                      {renderAvatar(player.avatar, player.name, 30)}
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
