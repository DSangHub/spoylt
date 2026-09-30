// Runs the actual Edge Function handlers with Stripe's real signature verifier.
// Database and Stripe network calls are isolated in memory: no live charges.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import Stripe from 'stripe';

const owner = '11111111-1111-4111-8111-111111111111';
const flyerId = '22222222-2222-4222-8222-222222222222';
const secret = 'whsec_isolated_audit_fixture';
const verifier = new Stripe('isolated-audit-key');
const copy = (v) => structuredClone(v);
function fixture(fee = 49500) {
  return { id: flyerId, owner_id: owner, headline: 'Candidate audit fixture',
    status: 'awaiting_payment', payment_status: 'unpaid', election_date: '2099-11-01',
    reviewed_at: '2026-09-30T00:00:00Z', stripe_checkout_session_id: 'cs_audit',
    stripe_payment_intent_id: null, fee_amount_cents: fee, fee_geography_id: 'area_audit',
    fee_population: 700000, fee_population_year: 2025, flyer_size: '2x4' };
}
function session(fee = 49500) {
  return { id: 'cs_audit', status: 'complete', payment_status: 'paid', mode: 'payment',
    currency: 'usd', amount_total: fee, payment_intent: 'pi_audit', client_reference_id: flyerId,
    metadata: { kind: 'political_flyer', flyer_id: flyerId, user_id: owner, fee_amount_cents: String(fee) } };
}
function intent(fee = 49500, refunded = 0) {
  return { id: 'pi_audit', status: 'succeeded', amount: fee, amount_received: fee, currency: 'usd',
    latest_charge: { id: 'ch_audit', paid: true, amount: fee, amount_refunded: refunded, currency: 'usd', payment_intent: 'pi_audit' },
    metadata: { kind: 'political_flyer', flyer_id: flyerId, fee_amount_cents: String(fee) } };
}
function loadHandler(name, state) {
  let handler;
  const db = {
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: () => {
      const filters = [];
      let update;
      const query = {
        select: () => query,
        update: (data) => { update = data; return query; },
        eq: (key, value) => { filters.push((row) => row[key] === value); return query; },
        is: (key, value) => { filters.push((row) => (row[key] ?? null) === value); return query; },
        in: (key, values) => { filters.push((row) => values.includes(row[key])); return query; },
        maybeSingle: () => query,
        then: (resolve, reject) => (async () => {
          if (update && state.beforeUpdate) await state.beforeUpdate(update);
          if (state.dbError) return { data: null, error: new Error('Transient database failure') };
          const match = state.flyer && filters.every((filter) => filter(state.flyer));
          if (!match) return { data: null, error: null };
          if (update) { Object.assign(state.flyer, update); state.writes++; }
          return { data: copy(state.flyer), error: null };
        })().then(resolve, reject),
      };
      return query;
    },
    rpc: async () => ({ error: null }),
  };
  class FakeStripe {
    webhooks = verifier.webhooks;
    paymentIntents = { retrieve: async () => { state.intentReads++; return copy(state.intent); } };
    checkout = { sessions: {
      retrieve: async () => copy(state.session),
      create: async (params, options) => {
        state.creates.push({ params, options });
        return { id: 'cs_created', url: 'https://checkout.stripe.com/audit' };
      },
      expire: async (id) => { state.expired.push(id); },
    } };
  }
  const source = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    Deno: { serve: (fn) => { handler = fn; }, env: { get: (key) => state.env[key] } },
    Stripe: FakeStripe, createClient: () => db, Request, Response,
    console: { error() {} },
  });
  return handler;
}
function setup(fee = 49500) {
  const state = { flyer: fixture(fee), session: session(fee), intent: intent(fee),
    user: { id: owner, email: 'audit@example.invalid' }, creates: [], expired: [], writes: 0, intentReads: 0,
    env: { FLYER_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'isolated-audit-key', STRIPE_WEBHOOK_SECRET: secret } };
  return { state, webhook: loadHandler('stripe-webhook', state), checkout: loadHandler('create-flyer-checkout', state) };
}
function signed(type, object, overrides = {}) {
  const payload = JSON.stringify({ id: 'evt_audit', object: 'event', type, data: { object }, ...overrides });
  const header = verifier.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('https://audit.invalid/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': header } });
}
function checkoutRequest() {
  return new Request('https://audit.invalid/checkout', { method: 'POST',
    headers: { Authorization: 'Bearer audit-user', 'Content-Type': 'application/json' }, body: JSON.stringify({ flyer_id: flyerId, fee_amount_cents: 1 }) });
}

test('signature verification rejects missing, forged and modified bodies', async () => {
  const { state, webhook } = setup();
  assert.equal((await webhook(new Request('https://audit.invalid', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal((await webhook(new Request('https://audit.invalid', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=forged' } }))).status, 400);
  const original = signed('checkout.session.completed', session());
  assert.equal((await webhook(new Request(original.url, { method: 'POST', headers: original.headers, body: '{}' }))).status, 400);
  assert.equal(state.writes, 0);
});
for (const fee of [14900, 29900, 49500]) {
  test(`paid reviewed ${fee / 100} USD session publishes once, including duplicate success events`, async () => {
    const { state, webhook } = setup(fee);
    for (const type of ['checkout.session.completed', 'checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
      assert.equal((await webhook(signed(type, state.session))).status, 200);
    }
    assert.equal(state.flyer.payment_status, 'paid');
    assert.equal(state.flyer.status, 'approved');
    assert.equal(state.flyer.stripe_payment_intent_id, 'pi_audit');
    assert.equal(state.writes, 1);
  });
}
for (const [field, value] of [
  ['amount_total', 49499], ['currency', 'eur'], ['mode', 'subscription'],
  ['id', 'cs_wrong'], ['client_reference_id', 'wrong'], ['payment_intent', null],
]) test(`rejects Checkout Session mismatch: ${field}`, async () => {
  const { state, webhook } = setup(); state.session[field] = value;
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
  assert.equal(state.writes, 0);
});
for (const [field, value] of [['user_id', 'wrong-owner'], ['flyer_id', 'wrong-flyer'], ['fee_amount_cents', '14900']]) {
  test(`rejects metadata mismatch: ${field}`, async () => {
    const { state, webhook } = setup(); state.session.metadata[field] = value;
    assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
    assert.equal(state.writes, 0);
  });
}
for (const [field, value] of [['status', 'processing'], ['amount_received', 49499], ['currency', 'eur']]) {
  test(`rejects PaymentIntent mismatch: ${field}`, async () => {
    const { state, webhook } = setup(); state.intent[field] = value;
    assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
    assert.equal(state.writes, 0);
  });
}
test('unpaid completed and failed async events never publish; later paid async success does', async () => {
  const { state, webhook } = setup();
  const unpaid = { ...state.session, payment_status: 'unpaid' };
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_failed']) {
    assert.equal((await webhook(signed(type, unpaid))).status, 200);
    assert.equal(state.writes, 0);
  }
  assert.equal((await webhook(signed('checkout.session.async_payment_succeeded', state.session))).status, 200);
  assert.equal(state.flyer.status, 'approved');
});
for (const refunded of [100, 49500]) test(`refund ${refunded} cents pauses publication and replay cannot restore it`, async () => {
  const { state, webhook } = setup();
  await webhook(signed('checkout.session.completed', state.session));
  state.intent.latest_charge.amount_refunded = refunded;
  for (let i = 0; i < 2; i++) assert.equal((await webhook(signed('charge.refunded', state.intent.latest_charge))).status, 200);
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 200);
  assert.equal(state.flyer.status, 'paused'); assert.equal(state.flyer.payment_status, 'refunded');
});
test('refund before success stays paused', async () => {
  const { state, webhook } = setup(); state.intent.latest_charge.amount_refunded = 49500;
  await webhook(signed('charge.refunded', state.intent.latest_charge));
  assert.equal((await webhook(signed('checkout.session.async_payment_succeeded', state.session))).status, 200);
  assert.equal(state.flyer.status, 'paused');
});
test('refund arriving between Stripe lookup and database fulfillment stays paused', async () => {
  const { state, webhook } = setup();
  state.beforeUpdate = async (update) => {
    if (update.payment_status !== 'paid') return;
    state.beforeUpdate = null;
    state.intent.latest_charge.amount_refunded = 49500;
    await webhook(signed('charge.refunded', state.intent.latest_charge));
  };
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 200);
  assert.equal(state.flyer.status, 'paused');
});
test('missing expanded charge fails closed', async () => {
  const { state, webhook } = setup(); state.intent.latest_charge = 'ch_unexpanded';
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
  assert.equal(state.writes, 0);
});
test('transient database failure returns retryable error', async () => {
  const { state, webhook } = setup(); state.dbError = true;
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
  assert.equal(state.writes, 0);
});
test('concurrent signed success deliveries fulfill once', async () => {
  const { state, webhook } = setup();
  const responses = await Promise.all([webhook(signed('checkout.session.completed', state.session)),
    webhook(signed('checkout.session.async_payment_succeeded', state.session))]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(state.writes, 1);
});
test('unreviewed flyer cannot be fulfilled', async () => {
  const { state, webhook } = setup(); state.flyer.status = 'pending_review';
  assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
  assert.equal(state.writes, 0);
});
test('PaymentIntent metadata must match the reviewed flyer', async () => {
  for (const [field, value] of [['kind', 'unrelated'], ['flyer_id', 'other-flyer'], ['fee_amount_cents', '14900']]) {
    const { state, webhook } = setup(); state.intent.metadata[field] = value;
    assert.equal((await webhook(signed('checkout.session.completed', state.session))).status, 500);
    assert.equal(state.writes, 0);
  }
});
test('refund for another intent never changes this flyer', async () => {
  const { state, webhook } = setup();
  await webhook(signed('checkout.session.completed', state.session));
  await webhook(signed('charge.refunded', { ...state.intent.latest_charge, payment_intent: 'pi_other', amount_refunded: 49500 }));
  assert.equal(state.flyer.payment_status, 'paid');
});
test('checkout is disabled unless flag is exactly true', async () => {
  const { state, checkout } = setup();
  for (const flag of [undefined, 'false', 'TRUE', '1']) {
    state.env.FLYER_PAYMENTS_ENABLED = flag;
    const response = await checkout(checkoutRequest());
    assert.equal(response.status, 400); assert.match((await response.json()).error, /No charge/);
  }
  assert.equal(state.creates.length, 0); assert.equal(state.writes, 0);
});
test('checkout rejects another owner and unreviewed flyers', async () => {
  const { state, checkout } = setup(); state.user.id = 'other-owner';
  assert.equal((await checkout(checkoutRequest())).status, 400);
  state.user.id = owner; state.flyer.status = 'pending_review';
  assert.equal((await checkout(checkoutRequest())).status, 400);
  assert.equal(state.creates.length, 0);
});
test('checkout uses reviewed amount instead of browser amount', async () => {
  const { state, checkout } = setup(); state.flyer.stripe_checkout_session_id = null;
  assert.equal((await checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates[0].params.line_items[0].price_data.unit_amount, 49500);
  assert.equal(state.creates[0].params.metadata.user_id, owner);
  assert.equal(state.flyer.stripe_checkout_session_id, 'cs_created');
});
test('concurrent checkout retries attach the same session without expiring the winner', async () => {
  const { state, checkout } = setup(); state.flyer.stripe_checkout_session_id = null;
  const responses = await Promise.all([checkout(checkoutRequest()), checkout(checkoutRequest())]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(state.expired, []);
  assert.equal(state.creates[0].options.idempotencyKey, state.creates[1].options.idempotencyKey);
});
test('reused checkout must belong to the same flyer and owner', async () => {
  const { state, checkout } = setup(); state.session.status = 'open'; state.session.url = 'https://checkout.stripe.com/audit';
  state.session.metadata.user_id = 'other-owner';
  assert.equal((await checkout(checkoutRequest())).status, 400);
  assert.equal(state.creates.length, 0);
});
test('confirmed failed async payment can retry with a new session and attempt key', async () => {
  const { state, checkout } = setup();
  state.session.payment_status = 'unpaid'; state.intent.status = 'requires_payment_method';
  assert.equal((await checkout(checkoutRequest())).status, 200);
  assert.equal(state.creates[0].options.idempotencyKey, `spoylt-flyer-${flyerId}-cs_audit`);
  assert.equal(state.flyer.stripe_checkout_session_id, 'cs_created');
  assert.equal(state.flyer.payment_status, 'unpaid');
});
test('processing async payment cannot start a second charge', async () => {
  const { state, checkout } = setup();
  state.session.payment_status = 'unpaid'; state.intent.status = 'processing';
  assert.equal((await checkout(checkoutRequest())).status, 400);
  assert.equal(state.creates.length, 0);
});
