import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@22.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Stripe is not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntentId) {
        const { error } = await admin.from("political_flyers")
          .update({ payment_status: "refunded", status: "paused" })
          .eq("stripe_payment_intent_id", paymentIntentId).eq("payment_status", "paid");
        if (error) throw error;
      }
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "political_flyer" && session.payment_status === "paid") {
        if (session.mode !== "payment" || session.currency !== "usd" || session.amount_total !== 49500 ||
            !session.metadata.flyer_id || !session.metadata.user_id) {
          throw new Error("Flyer checkout amount or identity mismatch.");
        }
        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent : session.payment_intent?.id;
        if (!paymentIntentId) throw new Error("Flyer payment intent missing.");
        const { data: updated, error: flyerError } = await admin.from("political_flyers")
          .update({ payment_status: "paid", stripe_payment_intent_id: paymentIntentId,
            paid_at: new Date().toISOString(), status: "approved" })
          .eq("id", session.metadata.flyer_id).eq("owner_id", session.metadata.user_id)
          .eq("stripe_checkout_session_id", session.id)
          .eq("status", "awaiting_payment").eq("payment_status", "unpaid")
          .select("id").maybeSingle();
        if (flyerError) throw flyerError;
        if (!updated) {
          const { data: prior } = await admin.from("political_flyers")
            .select("id").eq("id", session.metadata.flyer_id)
            .eq("stripe_checkout_session_id", session.id).eq("stripe_payment_intent_id", paymentIntentId)
            .eq("payment_status", "paid").maybeSingle();
          if (!prior) throw new Error("Flyer payment did not match a reviewed pending flyer.");
        }
      }
    }

    if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.user_id;
      const plan = sub.metadata.plan;
      if (userId && ["unlimited", "official", "premium"].includes(plan)) {
        const item = sub.items.data[0];
        const periodEnd = (sub as any).current_period_end || (item as any)?.current_period_end;
        const { error } = await admin.rpc("sync_stripe_subscription", {
          p_user_id: userId,
          p_subscription_id: sub.id,
          p_price_id: item?.price?.id || "",
          p_plan: plan,
          p_status: sub.status,
          p_current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          p_cancel_at_period_end: sub.cancel_at_period_end,
          p_raw: sub,
        });
        if (error) throw error;
      }
    }

    if (event.type.startsWith("identity.verification_session.")) {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      const status =
        event.type === "identity.verification_session.verified" ? "verified" :
        event.type === "identity.verification_session.requires_input" ? "requires_input" :
        event.type === "identity.verification_session.canceled" ? "canceled" : null;
      if (status) {
        const { error } = await admin.rpc("process_identity_verification_event", {
          p_session_id: session.id,
          p_event_id: event.id,
          p_identity_status: status,
        });
        if (error) throw error;
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error(error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
