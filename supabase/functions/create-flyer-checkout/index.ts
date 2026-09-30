import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@22.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const flyerSizeDescriptions: Record<string, string> = { "2x4": "2 by 4", "3x5": "3 by 5", "4x5": "4 by 5" };

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
      .select("id,owner_id,headline,status,payment_status,stripe_checkout_session_id,election_date,fee_amount_cents,fee_geography_id,fee_population,fee_population_year,flyer_size")
      .eq("id", flyerId).eq("owner_id", user.id).maybeSingle();
    if (error || !flyer) throw new Error("Flyer not found.");
    if (flyer.status !== "awaiting_payment" || flyer.payment_status !== "unpaid" || flyer.election_date < new Date().toISOString().slice(0, 10)) {
      throw new Error("This flyer is not ready for payment.");
    }
    if (![14900, 29900, 49500].includes(flyer.fee_amount_cents) || !flyer.fee_geography_id ||
        !Number.isSafeInteger(flyer.fee_population) || flyer.fee_population < 1 || !flyer.fee_population_year) {
      throw new Error("A reviewer must confirm the district population and flyer fee before checkout.");
    }

    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("Stripe is unavailable.");
    const stripe = new Stripe(key);
    if (flyer.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(flyer.stripe_checkout_session_id);
      if (existing.status === "open" && existing.url) {
        if (existing.amount_total !== flyer.fee_amount_cents ||
            existing.metadata?.fee_amount_cents !== String(flyer.fee_amount_cents) ||
            existing.id !== flyer.stripe_checkout_session_id || existing.mode !== "payment" ||
            existing.currency !== "usd" || existing.client_reference_id !== flyer.id ||
            existing.metadata?.kind !== "political_flyer" ||
            existing.metadata.flyer_id !== flyer.id || existing.metadata.user_id !== user.id) {
          throw new Error("Existing checkout does not match the reviewed fee. Contact support.");
        }
        return Response.json({ url: existing.url }, { headers: cors });
      }
      if (existing.status === "complete") {
        const intentId = typeof existing.payment_intent === "string"
          ? existing.payment_intent : existing.payment_intent?.id;
        if (existing.payment_status !== "unpaid" || !intentId) {
          throw new Error("This flyer checkout has completed. Please wait for payment confirmation.");
        }
        const intent = await stripe.paymentIntents.retrieve(intentId);
        // Delayed payments must not start another charge while still processing.
        // A confirmed failed/canceled intent can safely create a new session;
        // its idempotency key is based on the previous attached session.
        if (!["requires_payment_method", "canceled"].includes(intent.status) ||
            intent.metadata.kind !== "political_flyer" || intent.metadata.flyer_id !== flyer.id ||
            intent.metadata.fee_amount_cents !== String(flyer.fee_amount_cents)) {
          throw new Error("This flyer checkout has completed. Please wait for payment confirmation.");
        }
      }
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "https://spoylt.org").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: flyer.id,
      line_items: [{ quantity: 1, price_data: {
        currency: "usd", unit_amount: flyer.fee_amount_cents,
        product_data: { name: "SPOYLT political flyer placement", description: "One reviewed digital flyer, " + (flyerSizeDescriptions[flyer.flyer_size] || "reviewed") + " proportion." },
      } }],
      metadata: { kind: "political_flyer", flyer_id: flyer.id, user_id: user.id, fee_amount_cents: String(flyer.fee_amount_cents) },
      payment_intent_data: { metadata: { kind: "political_flyer", flyer_id: flyer.id, fee_amount_cents: String(flyer.fee_amount_cents) } },
      success_url: siteUrl + "/?flyer_checkout=return#my-campaign-profile",
      cancel_url: siteUrl + "/#my-campaign-profile",
      integration_identifier: "spoylt_flyer_gqmxptra",
    }, { idempotencyKey: `spoylt-flyer-${flyer.id}-${flyer.stripe_checkout_session_id || "first"}` });
    let save = admin.from("political_flyers")
      .update({ stripe_checkout_session_id: session.id }).eq("id", flyer.id)
      .eq("owner_id", user.id).eq("status", "awaiting_payment").eq("payment_status", "unpaid");
    save = flyer.stripe_checkout_session_id
      ? save.eq("stripe_checkout_session_id", flyer.stripe_checkout_session_id)
      : save.is("stripe_checkout_session_id", null);
    const { data: saved, error: saveError } = await save.select("id").maybeSingle();
    // Stripe returns the same session to concurrent requests with this
    // idempotency key. A losing database CAS must not expire the winner's session.
    // A database error leaves attachment uncertain, so let the request retry.
    if (saveError) throw new Error("Could not attach checkout to this flyer. Please retry.");
    if (!saved) {
      const { data: attached, error: attachedError } = await admin.from("political_flyers")
        .select("id").eq("id", flyer.id).eq("owner_id", user.id)
        .eq("stripe_checkout_session_id", session.id).maybeSingle();
      if (attachedError) throw new Error("Could not confirm checkout attachment. Please retry.");
      if (attached) return Response.json({ url: session.url }, { headers: cors });
      await stripe.checkout.sessions.expire(session.id);
      throw new Error("Could not attach checkout to this flyer.");
    }
    return Response.json({ url: session.url }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Checkout failed." }, { status: 400, headers: cors });
  }
});
