"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

type Round = { id: string; name: string; sort_order: number; };
type Team = { id: string; name: string; round_id: string; tee_time: string | null; };
type Player = { id: string; name: string; avatar: string | null; };
type TeamPlayer = { team_id: string; player_id: string; };

// Parses free-text tee times like "8:30 AM", "8:30am", "08:30" into minutes-since-midnight
// so groups can be sorted chronologically regardless of exactly how they were typed in Admin.
function parseTimeToMinutes(t: string | null): number {
  if (!t) return 999999;
  const match = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return 999999;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export default function TeeTimesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }

      const { data: r } = await supabase.from("rounds").select("id, name, sort_order").order("sort_order");
      const { data: t } = await supabase.from("teams").select("id, name, round_id, tee_time");
      const { data: tp } = await supabase.from("team_players").select("team_id, player_id");
      const { data: p } = await supabase.from("players").select("id, name, avatar");

      setRounds(r ?? []);
      setTeams(t ?? []);
      setTeamPlayers(tp ?? []);
      setPlayers(p ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const getInitial = (name: string) => name.charAt(0).toUpperCase() || "?";

  const renderAvatar = (avatar: string | null | undefined, name: string, size: number) => {
    if (avatar && avatar.startsWith("http")) {
      return <img src={avatar} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `2px solid ${GOLD}` }} />;
    }
    if (avatar) {
      return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5 }}>
          {avatar}
        </div>
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: size * 0.4, fontWeight: 900 }}>
        {getInitial(name)}
      </div>
    );
  };

  const getTeamsForRound = (roundId: string) =>
    teams.filter((t) => t.round_id === roundId).sort((a, b) => parseTimeToMinutes(a.tee_time) - parseTimeToMinutes(b.tee_time));

  const getPlayersForTeam = (teamId: string) =>
    teamPlayers.filter((tp) => tp.team_id === teamId).map((tp) => players.find((p) => p.id === tp.player_id)).filter((p): p is Player => !!p);

  return (
    <main style={{ minHeight: "100vh", background: DARK_GREEN, fontFamily: "Arial, sans-serif" }}>

      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>🕒 Tee Times & Pairings</h1>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>

        {loading && <p style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", padding: 40 }}>Loading...</p>}

        {!loading && rounds.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.7)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
            <p style={{ fontWeight: 700, fontSize: 15 }}>No rounds set up yet.</p>
          </div>
        )}

        {!loading && rounds.map((round) => {
          const roundTeams = getTeamsForRound(round.id);
          return (
            <div key={round.id} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ height: 1, flex: 1, background: `${GOLD}66` }} />
                <h2 style={{ fontSize: 16, fontWeight: 900, color: GOLD, margin: 0, letterSpacing: 0.5, textTransform: "uppercase" }}>⛳ {round.name}</h2>
                <div style={{ height: 1, flex: 1, background: `${GOLD}66` }} />
              </div>

              {roundTeams.length === 0 && (
                <p style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13, padding: "12px 0" }}>No teams set up for this round yet.</p>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                {roundTeams.map((team) => {
                  const teamMembers = getPlayersForTeam(team.id);
                  return (
                    <div key={team.id} style={{ background: WHITE, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
                      <div style={{ background: `linear-gradient(90deg, ${GOLD}, #a8853a)`, padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: DARK_GREEN, letterSpacing: 0.5 }}>{team.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: DARK_GREEN }}>
                          {team.tee_time ? `🕒 ${team.tee_time}` : "No tee time set"}
                        </span>
                      </div>
                      <div style={{ padding: "16px", display: "flex", justifyContent: "space-around", gap: 8 }}>
                        {teamMembers.length === 0 && (
                          <p style={{ color: GRAY, fontSize: 13 }}>No players assigned yet.</p>
                        )}
                        {teamMembers.map((player) => (
                          <div key={player.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                            {renderAvatar(player.avatar, player.name, 56)}
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                              {player.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
