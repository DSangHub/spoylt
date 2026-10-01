import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { screenRecording, validVerification, MAX_VIDEO_BYTES } from "./screen.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "Sign in required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Invalid session" }, 401);
  let videoId: string;
  try {
    const payload = await req.json();
    videoId = payload.video_id;
    if (typeof videoId !== "string" || !/^[0-9a-f-]{36}$/.test(videoId)) throw new Error();
  } catch { return json({ error: "Valid video_id required" }, 400); }
  const { data: video, error: videoError } = await admin.from("candidate_videos")
    .select("*").eq("id", videoId).eq("owner_id", auth.user.id).maybeSingle();
  if (videoError) return json({ error: "Submission lookup failed" }, 500);
  if (!video) return json({ error: "Submission not found" }, 404);
  if (video.status !== "pending_review") return json({ error: "Only pending submissions can be screened" }, 409);
  const { data: verification, error: verificationError } = await admin.from("verification_requests")
    .select("id,user_id,status,identity_status,verification_type,legal_name,office_title,district,jurisdiction,authoritative_source_url,filing_id,expires_at,election_date,updated_at")
    .eq("user_id", auth.user.id).maybeSingle();
  if (verificationError) return json({ error: "Verification lookup failed" }, 500);
  if (!validVerification(verification, video)) return json({ error: "Current verified candidate identity and matching campaign filing required" }, 403);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Video screening is unavailable; your video remains private" }, 503);
  const { data: claim, error: claimError } = await admin.rpc("claim_candidate_video_screen", {
    p_video_id: videoId, p_owner_id: auth.user.id,
  });
  if (claimError) return json({ error: "Screening limit reached or unavailable; video remains private" }, 429);
  if (!claim) return json({ moderation_status: video.moderation_status, message: "Already checked or screening in progress" });
  try {
    const { data: file, error: fileError } = await admin.storage.from("candidate-videos").download(video.storage_path);
    if (fileError || !file || !file.size || file.size > MAX_VIDEO_BYTES) throw new Error("Invalid recording");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    const result = await screenRecording(file, verification, video, {
      apiKey, transcriptionModel: Deno.env.get("VIDEO_TRANSCRIPTION_MODEL"), policyModel: Deno.env.get("VIDEO_POLICY_MODEL"),
    });
    const { data: saved, error: saveError } = await admin.from("candidate_video_moderation").update({
      ...result, content_sha256: hash, verification_id: verification.id,
      verification_updated_at: verification.updated_at, checked_at: new Date().toISOString(),
    }).eq("video_id", videoId).eq("lease_id", claim).eq("status", "processing").select("status").maybeSingle();
    if (saveError || !saved) throw new Error("Result could not be saved");
    return json({ moderation_status: saved.status, message: saved.status === "passed"
      ? "Speech screening passed. Human identity, visual-content and placement review are still required."
      : "Language or identity concerns were flagged. The video remains private for review." });
  } catch {
    // Do not log transcripts, candidate personal data, API keys, or provider response bodies.
    await admin.from("candidate_video_moderation").update({ status: "error", findings: { reason: "Screening did not complete. Retry or contact SPOYLT." } })
      .eq("video_id", videoId).eq("lease_id", claim).eq("status", "processing");
    return json({ error: "Screening did not complete; your video remains private" }, 502);
  }
});
