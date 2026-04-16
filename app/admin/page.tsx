"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const LIGHT_GREEN = "#e8f5ee";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";

type Player = { id: string; name: string; base_handicap: number; };
type Round = { id: string; name: string; scorecard_key: string; sort_order: number; };
type Team = { id: string; name: string; round_id: string; };
type TeamPlayer = { id: string; team_id: string; player_id: string; };
type ScorecardHole = { hole_no: number; par: number; };
type SpecialHole = { id: string; round_id: string; hole_no: number; type: string; };
type SpecialAward = { id: string; round_id: string; hole_no: number; player_id: string; type: string; confirmed: boolean; };

function AdminInner() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [holes, setHoles] = useState<ScorecardHole[]>([]);
  const [specialHoles, setSpecialHoles] = useState<SpecialHole[]>([]);
  const [specialAwards, setSpecialAwards] = useState<SpecialAward[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingHandicap, setEditingHandicap] = useState<string | null>(null);
  const [handicapValue, setHandicapValue] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"teams" | "special" | "awards">("teams");

  useEffect(() => {
    const load = async () => {
      const { data: p } = await supabase.from("players").select("id, name, base_handicap").order("name");
      const { data: r } = await supabase.from("rounds").select("id, name, scorecard_key, sort_order").order("sort_order");
      const { data: t } = await supabase.from("teams").select("id, name, round_id");
      const { data: tp } = await supabase.from("team_players").select("id, team_id, player_id");
      const { data: sh } = await supabase.from("special_holes").select("*");
      const { data: sa } = await supabase.from("special_awards").select("*");
      setPlayers(p ?? []);
      setRounds(r ?? []);
      setTeams(t ?? []);
      setTeamPlayers(tp ?? []);
      setSpecialHoles(sh ?? []);
      setSpecialAwards(sa ?? []);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedRound) return;
    const round = rounds.find((r) => r.id === selectedRound);
    if (!round) return;
    const loadHoles = async () => {
      const { data } = await supabase.from("scorecard_holes").select("hole_no, par").eq("scorecard_key", round.scorecard_key).order("hole_no");
      setHoles(data ?? []);
    };
    loadHoles();
  }, [selectedRound, rounds]);

  const getTeamsForRound = (roundId: string) => teams.filter((t) => t.round_id === roundId);
  const getPlayersForTeam = (teamId: string) => teamPlayers.filter((tp) => tp.team_id === teamId).map((tp) => tp.player_id);
  const getPlayerTeam = (playerId: string, roundId: string) => {
    for (const team of getTeamsForRound(roundId)) {
      if (getPlayersForTeam(team.id).includes(playerId)) return team.id;
    }
    return null;
  };

  const setupTeamsForRound = async (roundId: string) => {
    setSaving(true); setMessage(null);
    const existingTeams = getTeamsForRound(roundId);
    const existingTeamIds = existingTeams.map((t) => t.id);
    if (existingTeamIds.length > 0) {
      await supabase.from("team_players").delete().in("team_id", existingTeamIds);
      await supabase.from("teams").delete().in("id", existingTeamIds);
    }
    const { data: newTeams } = await supabase.from("teams").insert([
      { name: "Team 1", round_id: roundId },
      { name: "Team 2", round_id: roundId },
      { name: "Team 3", round_id: roundId },
    ]).select();
    if (newTeams) {
      setTeams((prev) => [...prev.filter((t) => !existingTeamIds.includes(t.id)), ...newTeams]);
      setTeamPlayers((prev) => prev.filter((tp) => !existingTeamIds.includes(tp.team_id)));
    }
    setSaving(false);
    setMessage("Teams created! Assign players below.");
  };

  const assignPlayerToTeam = async (playerId: string, teamId: string, roundId: string) => {
    setSaving(true);
    const roundTeamIds = getTeamsForRound(roundId).map((t) => t.id);
    const existing = teamPlayers.find((tp) => tp.player_id === playerId && roundTeamIds.includes(tp.team_id));
    if (existing && existing.team_id === teamId) {
      await supabase.from("team_players").delete().eq("id", existing.id);
      setTeamPlayers((prev) => prev.filter((tp) => tp.id !== existing.id));
      setSaving(false); return;
    }
    if (existing) {
      await supabase.from("team_players").delete().eq("id", existing.id);
      setTeamPlayers((prev) => prev.filter((tp) => tp.id !== existing.id));
    }
    const { data: newTp } = await supabase.from("team_players").insert({ team_id: teamId, player_id: playerId }).select().single();
    if (newTp) setTeamPlayers((prev) => [...prev, newTp]);
    setSaving(false);
  };

  const saveHandicap = async (playerId: string) => {
    const val = parseFloat(handicapValue);
    if (isNaN(val)) return;
    await supabase.from("players").update({ base_handicap: val }).eq("id", playerId);
    setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, base_handicap: val } : p));
    setEditingHandicap(null);
    setMessage("Handicap updated!");
  };

  const toggleSpecialHole = async (holeNo: number, type: string) => {
    if (!selectedRound) return;
    const existing = specialHoles.find((sh) => sh.round_id === selectedRound && sh.hole_no === holeNo && sh.type === type);
    if (existing) {
      await supabase.from("special_holes").delete().eq("id", existing.id);
      setSpecialHoles((prev) => prev.filter((sh) => sh.id !== existing.id));
    } else {
      const { data } = await supabase.from("special_holes").insert({ round_id: selectedRound, hole_no: holeNo, type }).select().single();
      if (data) setSpecialHoles((prev) => [...prev, data]);
    }
  };

  const confirmAward = async (awardId: string) => {
    await supabase.from("special_awards").update({ confirmed: true }).eq("id", awardId);
    setSpecialAwards((prev) => prev.map((a) => a.id === awardId ? { ...a, confirmed: true } : a));
    setMessage("Award confirmed! 1 point awarded.");
  };

  const denyAward = async (awardId: string) => {
    await supabase.from("special_awards").delete().eq("id", awardId);
    setSpecialAwards((prev) => prev.filter((a) => a.id !== awardId));
    setMessage("Award denied.");
  };

  const roundTeams = selectedRound ? getTeamsForRound(selectedRound) : [];
  const teamsReady = roundTeams.length === 3;
  const frontNine = holes.filter((h) => h.hole_no <= 9);
  const backNine = holes.filter((h) => h.hole_no >= 10);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: GREEN, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: WHITE, fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <h1 style={{ color: WHITE, fontSize: 20, fontWeight: "bold", margin: 0 }}>⚙️ Admin Panel</h1>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px" }}>

        {message && (
          <div style={{ background: LIGHT_GREEN, border: `1px solid ${GREEN}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: GREEN, fontSize: 14, fontWeight: "bold" }}>
            ✓ {message}
          </div>
        )}

        {/* Players & Handicaps */}
        <div style={{ background: WHITE, borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 14, color: "#111" }}>👥 Players & Handicaps</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {players.map((player) => (
              <div key={player.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <span style={{ fontWeight: "bold", fontSize: 15 }}>{player.name}</span>
                {editingHandicap === player.id ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" value={handicapValue} onChange={(e) => setHandicapValue(e.target.value)}
                      style={{ width: 64, padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }} step="0.1" />
                    <button onClick={() => saveHandicap(player.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>Save</button>
                    <button onClick={() => setEditingHandicap(null)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: WHITE, cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: GRAY, fontSize: 14 }}>HCP {player.base_handicap}</span>
                    <button onClick={() => { setEditingHandicap(player.id); setHandicapValue(String(player.base_handicap)); }}
                      style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${GREEN}`, background: LIGHT_GREEN, color: GREEN, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>Edit</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Round Management */}
        <div style={{ background: WHITE, borderRadius: 16, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 14, color: "#111" }}>📅 Round Management</h2>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {rounds.filter((r) => r.scorecard_key !== "Sand Creek Course::Par 3").map((round) => (
              <button key={round.id} onClick={() => { setSelectedRound(round.id); setMessage(null); }}
                style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: selectedRound === round.id ? GREEN : "#f3f4f6", color: selectedRound === round.id ? WHITE : "#374151", cursor: "pointer", fontSize: 14, fontWeight: "bold" }}>
                {round.name}
              </button>
            ))}
          </div>

          {selectedRound && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
                {[{ key: "teams", label: "👥 Teams" }, { key: "special", label: "📍 Special Holes" }, { key: "awards", label: "🏅 Awards" }].map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", background: activeTab === tab.key ? GREEN : "transparent", color: activeTab === tab.key ? WHITE : GRAY, cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.key ? "bold" : "normal" }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TEAMS */}
              {activeTab === "teams" && (
                !teamsReady ? (
                  <button onClick={() => setupTeamsForRound(selectedRound)} disabled={saving}
                    style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontSize: 15, fontWeight: "bold" }}>
                    {saving ? "Creating..." : "➕ Create Teams for this Round"}
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {roundTeams.map((team) => (
                      <div key={team.id} style={{ border: `1px solid ${GREEN}33`, borderRadius: 12, padding: "14px", background: LIGHT_GREEN }}>
                        <h3 style={{ fontWeight: "bold", marginBottom: 10, fontSize: 15, color: GREEN }}>{team.name}</h3>
                        <div style={{ display: "grid", gap: 6 }}>
                          {players.map((player) => {
                            const isOnThisTeam = getPlayerTeam(player.id, selectedRound) === team.id;
                            return (
                              <button key={player.id} onClick={() => assignPlayerToTeam(player.id, team.id, selectedRound)}
                                style={{ padding: "10px 14px", borderRadius: 8, border: isOnThisTeam ? `2px solid ${GREEN}` : "1px solid #d1d5db", background: isOnThisTeam ? GREEN : WHITE, cursor: "pointer", fontSize: 14, textAlign: "left", display: "flex", justifyContent: "space-between", color: isOnThisTeam ? WHITE : "#374151", fontWeight: isOnThisTeam ? "bold" : "normal" }}>
                                <span>{player.name}</span>
                                {isOnThisTeam && <span>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setupTeamsForRound(selectedRound)}
                      style={{ padding: "10px", borderRadius: 10, border: "1px solid #ef4444", background: WHITE, color: "#ef4444", cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>
                      🔄 Reset Teams
                    </button>
                  </div>
                )
              )}

              {/* SPECIAL HOLES */}
              {activeTab === "special" && (
                <div>
                  <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>Select one LD hole (par 4/5) and one CTP hole (par 3) per 9 holes.</p>
                  {[{ label: "Front 9", list: frontNine }, { label: "Back 9", list: backNine }].map(({ label, list }) => (
                    list.length > 0 && (
                      <div key={label} style={{ marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: "bold", color: GREEN, marginBottom: 10 }}>{label}</h3>
                        <div style={{ display: "grid", gap: 6 }}>
                          {list.map((hole) => {
                            const isLD = specialHoles.some((sh) => sh.round_id === selectedRound && sh.hole_no === hole.hole_no && sh.type === "longest_drive");
                            const isCTP = specialHoles.some((sh) => sh.round_id === selectedRound && sh.hole_no === hole.hole_no && sh.type === "closest_to_pin");
                            return (
                              <div key={hole.hole_no} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                                <span style={{ fontWeight: "bold", fontSize: 14 }}>Hole {hole.hole_no} <span style={{ color: GRAY, fontWeight: "normal", fontSize: 13 }}>Par {hole.par}</span></span>
                                <div style={{ display: "flex", gap: 8 }}>
                                  {hole.par >= 4 && (
                                    <button onClick={() => toggleSpecialHole(hole.hole_no, "longest_drive")}
                                      style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: isLD ? GREEN : "#e5e7eb", color: isLD ? WHITE : "#374151", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
                                      🚗 LD
                                    </button>
                                  )}
                                  {hole.par === 3 && (
                                    <button onClick={() => toggleSpecialHole(hole.hole_no, "closest_to_pin")}
                                      style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: isCTP ? GOLD : "#e5e7eb", color: isCTP ? WHITE : "#374151", cursor: "pointer", fontSize: 12, fontWeight: "bold" }}>
                                      📍 CTP
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* AWARDS */}
              {activeTab === "awards" && (
                <div>
                  {specialAwards.filter((a) => a.round_id === selectedRound).length === 0 ? (
                    <div style={{ textAlign: "center", padding: 24, color: GRAY, fontSize: 14 }}>No claims yet for this round.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {specialAwards.filter((a) => a.round_id === selectedRound).map((award) => {
                        const player = players.find((p) => p.id === award.player_id);
                        return (
                          <div key={award.id} style={{ borderRadius: 12, padding: "14px 16px", background: award.confirmed ? LIGHT_GREEN : "#fffbeb", border: `1px solid ${award.confirmed ? GREEN : GOLD}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: "bold", fontSize: 15 }}>{player?.name}</div>
                                <div style={{ fontSize: 13, color: GRAY }}>
                                  {award.type === "longest_drive" ? "🚗 Longest Drive" : "📍 Closest to Pin"} — Hole {award.hole_no}
                                </div>
                              </div>
                              {award.confirmed ? (
                                <span style={{ color: GREEN, fontWeight: "bold", fontSize: 13, background: WHITE, padding: "4px 10px", borderRadius: 8 }}>✓ Confirmed</span>
                              ) : (
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button onClick={() => confirmAward(award.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: GREEN, color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>✓</button>
                                  <button onClick={() => denyAward(award.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#ef4444", color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: "bold" }}>✕</button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <AdminInner />
    </Suspense>
  );
}