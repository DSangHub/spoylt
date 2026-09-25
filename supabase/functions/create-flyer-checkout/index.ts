import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@22.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
  try {
    if (Deno.env.get("FLYER_PAYMENTS_ENABLED") !== "true") {
      throw new Error("Flyer payments are being configured. No charge has been made.");
    }
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Sign in to pay for your flyer.");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user?.email) throw new Error("Sign in again to continue.");
    const { flyer_id: flyerId } = await req.json();
    if (typeof flyerId !== "string" || !/^[0-9a-f-]{36}$/i.test(flyerId)) throw new Error("Invalid flyer.");
    const { data: flyer, error } = await admin.from("political_flyers")
      .select("id,owner_id,headline,status,payment_status,stripe_checkout_session_id,election_date")
      .eq("id", flyerId).eq("owner_id", user.id).maybeSingle();
    if (error || !flyer) throw new Error("Flyer not found.");
    if (flyer.status !== "awaiting_payment" || flyer.payment_status !== "unpaid" || flyer.election_date < new Date().toISOString().slice(0, 10)) {
      throw new Error("This flyer is not ready for payment.");
    }

    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("Stripe is unavailable.");
    const stripe = new Stripe(key);
    if (flyer.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(flyer.stripe_checkout_session_id);
      if (existing.status === "open" && existing.url) return Response.json({ url: existing.url }, { headers: cors });
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://spoylt.org").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: flyer.id,
      line_items: [{ quantity: 1, price_data: {
        currency: "usd", unit_amount: 49500,
        product_data: { name: "SPOYLT political flyer placement", description: "One reviewed digital flyer, 2.5 by 4 proportion." },
      } }],
      metadata: { kind: "political_flyer", flyer_id: flyer.id, user_id: user.id },
      payment_intent_data: { metadata: { kind: "political_flyer", flyer_id: flyer.id } },
      success_url: siteUrl + "/?flyer_checkout=return#my-campaign-profile",
      cancel_url: siteUrl + "/#my-campaign-profile",
      integration_identifier: "spoylt_flyer_gqmxptra",
    }, { idempotencyKey: `spoylt-flyer-${flyer.id}-${flyer.stripe_checkout_session_id || "first"}` });
    const { data: saved, error: saveError } = await admin.from("political_flyers")
      .update({ stripe_checkout_session_id: session.id }).eq("id", flyer.id)
      .eq("owner_id", user.id).eq("status", "awaiting_payment").eq("payment_status", "unpaid")
      .select("id").maybeSingle();
    if (saveError || !saved) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error("Could not attach checkout to this flyer.");
    }
    return Response.json({ url: session.url }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Checkout failed." }, { status: 400, headers: cors });
  }
});
