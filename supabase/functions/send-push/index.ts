import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:jackbwright119@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Races a promise against a timeout so one stuck network call can't hang the whole function.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const post = payload.record;

    if (!post || !post.trip_id) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: author } = await supabase.from("players").select("name").eq("id", post.player_id).maybeSingle();
    const authorName = author?.name ?? "Someone";

    const { data: recipients } = await supabase
      .from("players")
      .select("id")
      .eq("trip_id", post.trip_id)
      .neq("id", post.player_id);

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const recipientIds = recipients.map((r: { id: string }) => r.id);
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("player_id", recipientIds);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const title =
      post.post_type === "roundup" ? "🏆 Round Roundup" :
      post.post_type === "auto" ? "⚡ The Bob Classic" :
      `${authorName} posted`;
    const body = (post.content || "New photo posted").slice(0, 120);

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subs) {
      try {
        await withTimeout(
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body, url: "/feed" })
          ),
          8000
        );
        sent++;
      } catch (err: any) {
        errors.push(`${sub.endpoint.slice(0, 50)}: ${err.message ?? String(err)}`);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return new Response(JSON.stringify({ sent, total: subs.length, errors }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});