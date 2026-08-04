"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

type Winner = { id: string; year: number; winner_name: string; location: string | null; };
type HistPhoto = { id: string; historical_winner_id: string; photo_url: string; uploaded_by: string | null; uploaded_by_player_id: string | null; created_at: string; };

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const winnerId = params.winnerId as string;

  const [winner, setWinner] = useState<Winner | null>(null);
  const [photos, setPhotos] = useState<HistPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState<string>("Someone");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: me } = await supabase.from("players").select("id, name").eq("auth_user_id", session.user.id).maybeSingle();
      if (me) { setPlayerName(me.name); setPlayerId(me.id); }
    }

    const { data: w } = await supabase.from("historical_winners").select("id, year, winner_name, location").eq("id", winnerId).maybeSingle();
    const { data: p } = await supabase.from("historical_photos").select("*").eq("historical_winner_id", winnerId).order("created_at", { ascending: false });

    setWinner(w ?? null);
    setPhotos(p ?? []);
    setLoading(false);
  };

  useEffect(() => { if (winnerId) load(); }, [winnerId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

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

    setUploading(false);
    e.target.value = "";
  };

  const deletePhoto = async (photo: HistPhoto) => {
    await supabase.from("historical_photos").delete().eq("id", photo.id);
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photo.id);
      setViewingIndex((idx) => {
        if (idx === null) return null;
        if (next.length === 0) return null;
        return Math.min(idx, next.length - 1);
      });
      return next;
    });
  };

  const showPrev = () => setViewingIndex((idx) => (idx !== null && idx > 0 ? idx - 1 : idx));
  const showNext = () => setViewingIndex((idx) => (idx !== null && idx < photos.length - 1 ? idx + 1 : idx));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 50;
    if (deltaX > threshold) showPrev();
    else if (deltaX < -threshold) showNext();
    touchStartX.current = null;
  };

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/history")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>
            📸 {winner ? `${winner.year} Gallery` : "Gallery"}
          </h1>
          {winner?.location && (
            <p style={{ color: `${GOLD}bb`, fontSize: 12, margin: "4px 0 0" }}>{winner.location}</p>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY, padding: 40 }}>Loading...</p>}

        {!loading && (
          <>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: `2px solid ${GOLD}`, background: "#fffbeb", color: "#8a6d1f", cursor: "pointer", fontSize: 14, fontWeight: 800, marginBottom: 20 }}>
              {uploading ? "Uploading..." : "📷 Add a Photo"}
            </button>

            {photos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: GRAY }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
                <p style={{ fontWeight: 700, fontSize: 15 }}>No photos yet — be the first to add one!</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {photos.map((photo, index) => (
                  <div key={photo.id} onClick={() => setViewingIndex(index)} style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", background: WHITE }}>
                    <img src={photo.photo_url} alt="" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                    {photo.uploaded_by && (
                      <div style={{ fontSize: 11, color: GRAY, padding: "5px 4px", textAlign: "center" }}>by {photo.uploaded_by}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Photo lightbox */}
      {viewingIndex !== null && photos[viewingIndex] && (
        <div onClick={() => setViewingIndex(null)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, touchAction: "pan-y" }}>
          <button onClick={() => setViewingIndex(null)}
            style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: WHITE, fontSize: 20, cursor: "pointer", zIndex: 1 }}>
            ✕
          </button>

          {photos.length > 1 && (
            <span style={{ position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700 }}>
              {viewingIndex + 1} / {photos.length}
            </span>
          )}

          {viewingIndex > 0 && (
            <button onClick={(e) => { e.stopPropagation(); showPrev(); }}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: WHITE, fontSize: 22, cursor: "pointer", display: "none" }}
              className="lightbox-arrow">
              ‹
            </button>
          )}
          {viewingIndex < photos.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); showNext(); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: WHITE, fontSize: 22, cursor: "pointer", display: "none" }}
              className="lightbox-arrow">
              ›
            </button>
          )}

          <img src={photos[viewingIndex].photo_url} alt="" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, userSelect: "none" }} />
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            {photos[viewingIndex].uploaded_by && (
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Uploaded by {photos[viewingIndex].uploaded_by}</span>
            )}
            {playerId && photos[viewingIndex].uploaded_by_player_id === playerId && (
              <button onClick={() => deletePhoto(photos[viewingIndex])}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                🗑 Delete
              </button>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @media (hover: hover) and (pointer: fine) {
          .lightbox-arrow {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </main>
  );
}
