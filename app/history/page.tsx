"use client";

import { useEffect, useState, useRef, Suspense } from "react";
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

type Standing = { id: string; historical_winner_id: string; rank: number; player_name: string; points: number; };
type CourseScore = { id: string; historical_winner_id: string; course_name: string; player_name: string; gross_score: number | null; sort_order: number; };
type HistPhoto = { id: string; historical_winner_id: string; photo_url: string; uploaded_by: string | null; uploaded_by_player_id: string | null; created_at: string; };

type Tab = "standings" | "courses" | "photos";

function HistoryInner() {
  const router = useRouter();
  const [winners, setWinners] = useState<Winner[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [courseScores, setCourseScores] = useState<CourseScore[]>([]);
  const [photos, setPhotos] = useState<HistPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, Tab>>({});
  const [playerName, setPlayerName] = useState<string>("Someone");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadWinnerId, setPendingUploadWinnerId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<HistPhoto | null>(null);

  const borderColors = [GOLD, GREEN, "#7c3aed", "#dc2626", "#2563eb", "#0891b2", "#d97706", "#059669", "#db2777"];

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: me } = await supabase.from("players").select("id, name").eq("auth_user_id", session.user.id).maybeSingle();
      if (me) { setPlayerName(me.name); setPlayerId(me.id); }
    }

    const { data: w } = await supabase.from("historical_winners").select("*").order("year", { ascending: false });
    const { data: s } = await supabase.from("historical_standings").select("*").order("rank", { ascending: true });
    const { data: c } = await supabase.from("historical_course_scores").select("*").order("sort_order", { ascending: true });
    const { data: p } = await supabase.from("historical_photos").select("*").order("created_at", { ascending: false });

    setWinners(w ?? []);
    setStandings(s ?? []);
    setCourseScores(c ?? []);
    setPhotos(p ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleExpand = (winnerId: string) => {
    setExpandedId((prev) => (prev === winnerId ? null : winnerId));
    setActiveTab((prev) => ({ ...prev, [winnerId]: prev[winnerId] ?? "standings" }));
  };

  const handlePhotoSelect = (winnerId: string) => {
    setPendingUploadWinnerId(winnerId);
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const winnerId = pendingUploadWinnerId;
    if (!file || !winnerId) return;
    setUploadingFor(winnerId);

    const fileName = `${winnerId}-${Date.now()}.${file.name.split(".").pop()}`;
    const { data, error } = await supabase.storage.from("historical-photos").upload(fileName, file);

    if (!error && data) {
      const { data: urlData } = supabase.storage.from("historical-photos").getPublicUrl(fileName);
      const { data: newPhoto } = await supabase
        .from("historical_photos")
        .insert({ historical_winner_id: winnerId, photo_url: urlData.publicUrl, uploaded_by: playerName, uploaded_by_player_id: playerId })
        .select()
        .single();
      if (newPhoto) setPhotos((prev) => [newPhoto, ...prev]);
    }

    setUploadingFor(null);
    setPendingUploadWinnerId(null);
    e.target.value = "";
  };

  const deletePhoto = async (photo: HistPhoto) => {
    await supabase.from("historical_photos").delete().eq("id", photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    setViewingPhoto(null);
  };

  const groupCoursesByName = (winnerId: string) => {
    const scores = courseScores.filter((c) => c.historical_winner_id === winnerId);
    const courseNames = Array.from(new Set(scores.map((s) => s.course_name)));
    return courseNames.map((name) => ({
      name,
      players: scores.filter((s) => s.course_name === name).sort((a, b) => (a.gross_score ?? 999) - (b.gross_score ?? 999)),
    }));
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7f5", fontFamily: "Arial, sans-serif" }}>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ background: GREEN, padding: "16px 20px 28px", textAlign: "center", position: "relative" }}>
        <button onClick={() => router.push("/")} style={{ position: "absolute", left: 20, top: 18, background: "none", border: "none", color: WHITE, fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
        <h1 style={{ color: WHITE, fontSize: 24, fontWeight: "bold", margin: 0 }}>Hall of Champions</h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>The Bob Classic — All-Time Winners</p>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY }}>Loading...</p>}

        {!loading && winners.map((winner, index) => {
          const color = borderColors[index % borderColors.length];
          const isExpanded = expandedId === winner.id;
          const tab = activeTab[winner.id] ?? "standings";
          const isTBD = winner.winner_name === "TBD";
          const winnerStandings = standings.filter((s) => s.historical_winner_id === winner.id);
          const winnerPhotos = photos.filter((p) => p.historical_winner_id === winner.id);
          const courses = groupCoursesByName(winner.id);

          return (
            <div key={winner.id} style={{ borderRadius: 16, overflow: "hidden", marginBottom: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", border: `3px solid ${color}` }}>
              {winner.photo_url ? (
                <img src={winner.photo_url} alt={winner.winner_name}
                  style={{ width: "100%", height: 400, objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
              ) : (
                <div style={{ width: "100%", height: 300, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>🏌️</div>
              )}

              <div style={{ background: WHITE, padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#111" }}>
                      {isTBD ? "🚧 In Progress" : winner.winner_name}
                    </div>
                    <div style={{ fontSize: 15, color: GRAY, marginTop: 2 }}>{winner.location}</div>
                  </div>
                  <div style={{ background: color, color: WHITE, borderRadius: 10, padding: "6px 14px", fontSize: 16, fontWeight: "bold" }}>
                    {winner.year}
                  </div>
                </div>
                {winner.notes && (
                  <p style={{ marginTop: 10, fontSize: 13, color: GRAY, fontStyle: "italic", borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>{winner.notes}</p>
                )}

                {/* Dropdown toggle */}
                <button onClick={() => toggleExpand(winner.id)}
                  style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: `1px solid ${color}55`, background: isExpanded ? color : "#f9fafb", color: isExpanded ? WHITE : "#374151", cursor: "pointer", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {isExpanded ? "Hide Details" : "View Details"} {isExpanded ? "▲" : "▼"}
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 12 }}>
                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 6, background: "#f3f4f6", borderRadius: 10, padding: 4, marginBottom: 14 }}>
                      {[
                        { key: "standings" as Tab, label: "🏆 Standings" },
                        { key: "courses" as Tab, label: "⛳ Courses" },
                        { key: "photos" as Tab, label: "📸 Photos" },
                      ].map((t) => (
                        <button key={t.key} onClick={() => setActiveTab((prev) => ({ ...prev, [winner.id]: t.key }))}
                          style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", background: tab === t.key ? color : "transparent", color: tab === t.key ? WHITE : GRAY, cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 800 : 600 }}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Standings tab */}
                    {tab === "standings" && (
                      winnerStandings.length === 0 ? (
                        <p style={{ textAlign: "center", color: GRAY, fontSize: 13, padding: "16px 0" }}>No standings recorded yet.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {winnerStandings.map((s) => {
                            const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : `${s.rank}.`;
                            return (
                              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: s.rank === 1 ? "#fffbeb" : "#f9fafb", border: s.rank === 1 ? `1px solid ${GOLD}` : "1px solid #e5e7eb" }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>{medal} {s.player_name}</span>
                                <span style={{ fontWeight: 800, fontSize: 14, color: GREEN }}>{s.points} pts</span>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}

                    {/* Courses tab */}
                    {tab === "courses" && (
                      courses.length === 0 ? (
                        <p style={{ textAlign: "center", color: GRAY, fontSize: 13, padding: "16px 0" }}>No course scores recorded yet.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 16 }}>
                          {courses.map((course) => (
                            <div key={course.name}>
                              <h3 style={{ fontSize: 13, fontWeight: 800, color: GREEN, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{course.name}</h3>
                              <div style={{ display: "grid", gap: 4 }}>
                                {course.players.map((p) => (
                                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "#f9fafb", fontSize: 13 }}>
                                    <span style={{ fontWeight: 600 }}>{p.player_name}</span>
                                    <span style={{ fontWeight: 800, color: "#374151" }}>{p.gross_score ?? "—"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {/* Photos tab */}
                    {tab === "photos" && (
                      <div>
                        <button onClick={() => handlePhotoSelect(winner.id)} disabled={uploadingFor === winner.id}
                          style={{ width: "100%", padding: "12px", borderRadius: 10, border: `2px solid ${GOLD}`, background: "#fffbeb", color: "#8a6d1f", cursor: "pointer", fontSize: 13, fontWeight: 800, marginBottom: 14 }}>
                          {uploadingFor === winner.id ? "Uploading..." : "📷 Add a Photo"}
                        </button>
                        {winnerPhotos.length === 0 ? (
                          <p style={{ textAlign: "center", color: GRAY, fontSize: 13, padding: "8px 0" }}>No photos yet — be the first to add one!</p>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {winnerPhotos.map((photo) => (
                              <div key={photo.id} onClick={() => setViewingPhoto(photo)} style={{ borderRadius: 10, overflow: "hidden", cursor: "pointer" }}>
                                <img src={photo.photo_url} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                                {photo.uploaded_by && (
                                  <div style={{ fontSize: 10, color: GRAY, padding: "3px 2px", textAlign: "center" }}>by {photo.uploaded_by}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Photo lightbox */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <button onClick={() => setViewingPhoto(null)}
            style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: WHITE, fontSize: 20, cursor: "pointer" }}>
            ✕
          </button>
          <img src={viewingPhoto.photo_url} alt="" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            {viewingPhoto.uploaded_by && (
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Uploaded by {viewingPhoto.uploaded_by}</span>
            )}
            {playerId && viewingPhoto.uploaded_by_player_id === playerId && (
              <button onClick={() => deletePhoto(viewingPhoto)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                🗑 Delete
              </button>
            )}
          </div>
        </div>
      )}
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
