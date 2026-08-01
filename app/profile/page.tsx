"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isPushSupported, isRunningStandalone, getNotificationPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#6b7280";
const BG = "#f0f2f0";

const EMOJI_OPTIONS = ["⛳", "🏌️", "🏆", "🍺", "🔥", "😎", "🐊", "🦅", "🎯", "🍀", "🚩", "🥇"];

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [pushSupported, setPushSupported] = useState(true);

  useEffect(() => {
    setStandalone(isRunningStandalone());
    setPushSupported(isPushSupported());
    getNotificationPermission().then((p) => setPushPermission(p));
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/"); return; }

      const { data: playerData } = await supabase
        .from("players").select("id, name, avatar").eq("auth_user_id", session.user.id).maybeSingle();
      if (!playerData) { setLoading(false); return; }

      setPlayerId(playerData.id);
      setPlayerName(playerData.name);
      setCurrentAvatar(playerData.avatar ?? null);
      setLoading(false);
    };
    load();
  }, [router]);

  const saveAvatar = async (avatar: string | null) => {
    if (!playerId) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("players").update({ avatar }).eq("id", playerId);
    setSaving(false);
    if (error) { setError(error.message); return; }
    setCurrentAvatar(avatar);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playerId) return;
    setSaving(true);
    setError(null);

    const fileName = `${playerId}-${Date.now()}.${file.name.split(".").pop()}`;
    const { data, error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file);

    if (uploadError || !data) {
      setSaving(false);
      setError("Upload failed. Try a smaller photo or check your connection.");
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    await saveAvatar(urlData.publicUrl);
    e.target.value = "";
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase() || "?";

  const handleEnablePush = async () => {
    if (!playerId) return;
    setPushBusy(true);
    setPushError(null);
    const result = await subscribeToPush(playerId);
    setPushBusy(false);
    if (!result.ok) { setPushError(result.error ?? "Something went wrong."); return; }
    setPushPermission("granted");
  };

  const handleDisablePush = async () => {
    if (!playerId) return;
    setPushBusy(true);
    setPushError(null);
    const result = await unsubscribeFromPush(playerId);
    setPushBusy(false);
    if (!result.ok) { setPushError(result.error ?? "Something went wrong."); return; }
    setPushPermission("default");
  };

  const renderPreview = (size: number) => {
    if (currentAvatar && currentAvatar.startsWith("http")) {
      return <img src={currentAvatar} alt={playerName} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `3px solid ${GOLD}` }} />;
    }
    if (currentAvatar) {
      return (
        <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5 }}>
          {currentAvatar}
        </div>
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: size * 0.4, fontWeight: 900 }}>
        {getInitial(playerName)}
      </div>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>🎨 My Locker</h1>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>
        {loading && <p style={{ textAlign: "center", color: GRAY, padding: 40 }}>Loading...</p>}

        {!loading && (
          <>
            {/* Current preview */}
            <div style={{ background: WHITE, borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                {renderPreview(88)}
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>{playerName}</p>
              <p style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>This is what shows up next to your posts in the Social Feed.</p>
              {saving && <p style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 10 }}>Saving...</p>}
              {error && <p style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginTop: 10 }}>{error}</p>}
            </div>

            {/* Emoji picker */}
            <div style={{ background: WHITE, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16 }}>
              <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>Pick an icon</h2>
              </div>
              <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {EMOJI_OPTIONS.map((emoji) => (
                  <button key={emoji} onClick={() => saveAvatar(emoji)}
                    style={{
                      aspectRatio: "1", borderRadius: 14, cursor: "pointer", fontSize: 30,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: currentAvatar === emoji ? `3px solid ${GOLD}` : "2px solid #e5e7eb",
                      background: currentAvatar === emoji ? "#fffbeb" : "#f9fafb",
                    }}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo upload */}
            <div style={{ background: WHITE, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16 }}>
              <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>Or use a photo</h2>
              </div>
              <div style={{ padding: 16 }}>
                <button onClick={() => fileInputRef.current?.click()} disabled={saving}
                  style={{ width: "100%", padding: "14px", borderRadius: 12, border: `2px solid ${GOLD}`, background: "#fffbeb", color: DARK_GREEN, cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                  📷 Upload a Photo
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
              </div>
            </div>

            {/* Push notifications */}
            <div style={{ background: WHITE, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 16 }}>
              <div style={{ background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, padding: "14px 20px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: WHITE, margin: 0, letterSpacing: 1, textTransform: "uppercase" }}>🔔 Notifications</h2>
              </div>
              <div style={{ padding: 16 }}>
                {!pushSupported && (
                  <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Push notifications aren't supported on this browser.</p>
                )}
                {pushSupported && !standalone && (
                  <div style={{ background: "#fffbeb", border: `1px solid ${GOLD}66`, borderRadius: 12, padding: 14 }}>
                    <p style={{ fontSize: 13, color: DARK_GREEN, fontWeight: 700, margin: 0, marginBottom: 6 }}>Add to Home Screen first</p>
                    <p style={{ fontSize: 13, color: "#444", margin: 0 }}>
                      Notifications only work once this app is added to your Home Screen. Tap the Share button in Safari, then "Add to Home Screen" — then open the app from that new icon and come back here.
                    </p>
                  </div>
                )}
                {pushSupported && standalone && pushPermission !== "granted" && (
                  <>
                    <button onClick={handleEnablePush} disabled={pushBusy}
                      style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, color: WHITE, cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
                      {pushBusy ? "Enabling..." : "🔔 Enable Notifications"}
                    </button>
                    {pushPermission === "denied" && (
                      <p style={{ fontSize: 12, color: "#ef4444", marginTop: 10 }}>
                        Notifications were previously blocked. You'll need to re-enable them in your phone's Settings → Notifications → Bob Classic.
                      </p>
                    )}
                  </>
                )}
                {pushSupported && standalone && pushPermission === "granted" && (
                  <>
                    <p style={{ fontSize: 13, color: GREEN, fontWeight: 700, marginBottom: 12 }}>✓ Notifications are on</p>
                    <button onClick={handleDisablePush} disabled={pushBusy}
                      style={{ width: "100%", padding: "14px", borderRadius: 12, border: "2px solid #e5e7eb", background: WHITE, color: GRAY, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                      {pushBusy ? "Turning off..." : "Turn Off Notifications"}
                    </button>
                  </>
                )}
                {pushError && <p style={{ fontSize: 12, color: "#ef4444", marginTop: 10 }}>{pushError}</p>}
              </div>
            </div>

            {/* Reset */}
            {currentAvatar && (
              <button onClick={() => saveAvatar(null)}
                style={{ width: "100%", padding: "14px", borderRadius: 12, border: "2px solid #e5e7eb", background: WHITE, color: GRAY, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                Reset to initial letter
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
