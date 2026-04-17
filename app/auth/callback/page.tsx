"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackInner() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/");
      } else {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          window.location.search
        );
        if (!exchangeError) {
          router.push("/");
        } else {
          router.push("/?error=auth");
        }
      }
    };
    handleCallback();
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "Arial", background: "#f5f7f5" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
        <p style={{ color: "#1a6b3c", fontWeight: "bold", fontSize: 18 }}>Logging you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AuthCallbackInner />
    </Suspense>
  );
}