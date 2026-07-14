"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const GREEN = "#1a6b3c";
const DARK_GREEN = "#134d2b";
const GOLD = "#c9a84c";
const WHITE = "#ffffff";
const GRAY = "#9ca3af";
const BG = "#f0f2f0";

type Post = {
  id: string;
  player_id: string;
  content: string | null;
  photo_url: string | null;
  post_type: string;
  created_at: string;
  player_name: string;
};

type Like = {
  id: string;
  post_id: string;
  player_id: string;
};

type Reply = {
  id: string;
  post_id: string;
  player_id: string;
  content: string;
  created_at: string;
  player_name: string;
};

function FeedInner() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<string[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFeed = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/"); return; }

    const { data: playerData } = await supabase
      .from("players").select("id, trip_id").eq("auth_user_id", session.user.id).maybeSingle();
    if (!playerData) return;
    setPlayerId(playerData.id);
    setTripId(playerData.trip_id);

    const { data: allPlayers } = await supabase.from("players").select("id, name");
    const playerMap = Object.fromEntries((allPlayers ?? []).map(p => [p.id, p.name]));

    const { data: postsData } = await supabase
      .from("posts")
      .select("*")
      .eq("trip_id", playerData.trip_id)
      .order("created_at", { ascending: false });

    setPosts((postsData ?? []).map(p => ({ ...p, player_name: playerMap[p.player_id] ?? "Unknown" })));

    const { data: likesData } = await supabase.from("post_likes").select("*");
    setLikes(likesData ?? []);

    const { data: repliesData } = await supabase.from("post_replies").select("*").order("created_at", { ascending: true });
    setReplies((repliesData ?? []).map(r => ({ ...r, player_name: playerMap[r.player_id] ?? "Unknown" })));

    setLoading(false);
  };

  useEffect(() => {
    loadFeed();

    const channel = supabase.channel("feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadFeed)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, loadFeed)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, loadFeed)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const submitPost = async (photoUrl?: string) => {
    if (!playerId || !tripId) return;
    if (!newPost.trim() && !photoUrl) return;
    setPosting(true);

    await supabase.from("posts").insert({
      player_id: playerId,
      trip_id: tripId,
      content: newPost.trim() || null,
      photo_url: photoUrl ?? null,
      post_type: "manual",
    });

    setNewPost("");
    setPosting(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !playerId) return;
    setUploadingPhoto(true);

    const fileName = `${playerId}-${Date.now()}.${file.name.split(".").pop()}`;
    const { data, error } = await supabase.storage.from("post-photos").upload(fileName, file);

    if (!error && data) {
      const { data: urlData } = supabase.storage.from("post-photos").getPublicUrl(fileName);
      await submitPost(urlData.publicUrl);
    }
    setUploadingPhoto(false);
  };

  const toggleLike = async (postId: string) => {
    if (!playerId) return;
    const existing = likes.find(l => l.post_id === postId && l.player_id === playerId);
    if (existing) {
      await supabase.from("post_likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("post_likes").insert({ post_id: postId, player_id: playerId });
    }
  };

  const submitReply = async (postId: string) => {
    if (!playerId || !replyText[postId]?.trim()) return;
    await supabase.from("post_replies").insert({
      post_id: postId,
      player_id: playerId,
      content: replyText[postId].trim(),
    });
    setReplyText(prev => ({ ...prev, [postId]: "" }));
  };

  const deletePost = async (postId: string) => {
    await supabase.from("posts").delete().eq("id", postId);
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const isAutoPost = (post: Post) => post.post_type === "auto" || post.post_type === "roundup";
  const isRoundup = (post: Post) => post.post_type === "roundup";

  return (
    <main style={{ minHeight: "100vh", background: BG, fontFamily: "Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${DARK_GREEN} 0%, #1a5c32 100%)`, padding: "16px 20px 20px", position: "relative", borderBottom: `2px solid ${GOLD}44` }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: GOLD, fontSize: 20, cursor: "pointer", padding: 0, position: "absolute", top: 18, left: 16 }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
            <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>THE BOB CLASSIC</span>
            <div style={{ height: 1, width: 30, background: GOLD, opacity: 0.5 }} />
          </div>
          <h1 style={{ color: WHITE, fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: 2, textTransform: "uppercase" }}>⚡ Live Feed</h1>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>

        {/* Post composer */}
        <div style={{ background: WHITE, borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <textarea
            placeholder="What's happening on the course? 🏌️"
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            rows={2}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, borderRadius: 10, border: "2px solid #e5e7eb", resize: "none", fontFamily: "Arial", boxSizing: "border-box" as const, outline: "none", color: "#111111", WebkitTextFillColor: "#111111", colorScheme: "light" as const, background: WHITE }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${GOLD}`, background: "#fffbeb", color: DARK_GREEN, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
              {uploadingPhoto ? "Uploading..." : "📷 Photo"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
            <button onClick={() => submitPost()} disabled={posting || !newPost.trim()}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: newPost.trim() ? `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})` : "#e5e7eb", color: newPost.trim() ? WHITE : GRAY, cursor: newPost.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 900, letterSpacing: 0.5 }}>
              {posting ? "POSTING..." : "POST"}
            </button>
          </div>
        </div>

        {loading && <p style={{ textAlign: "center", color: GRAY, padding: 20 }}>Loading feed...</p>}

        {/* Posts */}
        {!loading && posts.map((post) => {
          const postLikes = likes.filter(l => l.post_id === post.id);
          const isLiked = postLikes.some(l => l.player_id === playerId);
          const postReplies = replies.filter(r => r.post_id === post.id);
          const showReplies = expandedReplies.includes(post.id);
          const isOwn = post.player_id === playerId;
          const roundup = isRoundup(post);

          return (
            <div key={post.id} style={{ background: WHITE, borderRadius: 16, marginBottom: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", overflow: "hidden", border: isAutoPost(post) ? `2px solid ${GOLD}44` : "2px solid transparent" }}>

              {/* Auto post / roundup banner */}
              {isAutoPost(post) && (
                <div style={{ background: `linear-gradient(90deg, ${GOLD}, #a8853a)`, padding: "4px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: DARK_GREEN, letterSpacing: 1 }}>
                    {roundup ? "🏆 ROUND ROUNDUP" : "⚡ AUTOMATIC UPDATE"}
                  </span>
                </div>
              )}

              {/* Post header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: 16, fontWeight: 900 }}>
                    {getInitial(post.player_name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#111", textTransform: "uppercase", letterSpacing: 0.5 }}>{post.player_name}</div>
                    <div style={{ fontSize: 11, color: GRAY }}>{formatTime(post.created_at)}</div>
                  </div>
                </div>
                {isOwn && (
                  <button onClick={() => deletePost(post.id)}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: 4 }}>🗑</button>
                )}
              </div>

              {/* Photo */}
              {post.photo_url && (
                <img src={post.photo_url} alt="Post" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} />
              )}

              {/* Content */}
              {post.content && (
                <div style={{ padding: "8px 14px 10px", fontSize: 15, color: "#111", lineHeight: 1.5, whiteSpace: roundup ? "pre-line" as const : "normal" as const, fontWeight: roundup ? 600 : 400 }}>{post.content}</div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 0, borderTop: "1px solid #f3f4f6", padding: "8px 14px" }}>
                <button onClick={() => toggleLike(post.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "6px 12px 6px 0", fontSize: 14, color: isLiked ? "#ef4444" : GRAY, fontWeight: isLiked ? 800 : 600 }}>
                  {isLiked ? "❤️" : "🤍"} {postLikes.length > 0 && postLikes.length}
                </button>
                <button onClick={() => setExpandedReplies(prev => prev.includes(post.id) ? prev.filter(id => id !== post.id) : [...prev, post.id])}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", fontSize: 14, color: GRAY, fontWeight: 600 }}>
                  💬 {postReplies.length > 0 && `${postReplies.length} ${postReplies.length === 1 ? "reply" : "replies"}`}
                </button>
              </div>

              {/* Replies */}
              {showReplies && (
                <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 14px", background: "#fafafa" }}>
                  {postReplies.map((reply) => (
                    <div key={reply.id} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE, fontSize: 11, fontWeight: 900, flexShrink: 0 }}>
                        {getInitial(reply.player_name)}
                      </div>
                      <div style={{ background: WHITE, borderRadius: 10, padding: "6px 10px", flex: 1, border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: DARK_GREEN, textTransform: "uppercase", letterSpacing: 0.5 }}>{reply.player_name}</div>
                        <div style={{ fontSize: 14, color: "#111", marginTop: 2 }}>{reply.content}</div>
                      </div>
                    </div>
                  ))}

                  {/* Reply input */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      placeholder="Write a reply..."
                      value={replyText[post.id] ?? ""}
                      onChange={(e) => setReplyText(prev => ({ ...prev, [post.id]: e.target.value }))}
                      style={{ flex: 1, padding: "8px 12px", fontSize: 14, borderRadius: 10, border: "2px solid #e5e7eb", outline: "none", fontFamily: "Arial", color: "#111111", WebkitTextFillColor: "#111111", colorScheme: "light" as const, background: WHITE }}
                    />
                    <button onClick={() => submitReply(post.id)}
                      style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${GREEN}, ${DARK_GREEN})`, color: WHITE, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>
                      SEND
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && posts.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: GRAY }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
            <p style={{ fontWeight: 700, fontSize: 15 }}>No posts yet — be the first!</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <FeedInner />
    </Suspense>
  );
}
