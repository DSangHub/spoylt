import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { allowComment } from './policy.mjs';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !auth?.user || !auth.user.email_confirmed_at || auth.user.is_anonymous) return json({ error: 'Sign in with a confirmed email.' }, 401);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: 'Comment is too long.' }, 400);
    body = JSON.parse(raw);
  } catch { return json({ error: 'Invalid request.' }, 400); }
  if (body?.moderation_consent !== true) return json({ error: 'Confirm public posting and moderation before submitting.' }, 400);
  const comment = typeof body?.comment === 'string' ? body.comment.normalize('NFKC').trim() : '';
  if (!comment || comment.length > 1000 || typeof body?.survey_id !== 'string') return json({ error: 'Choose a survey and enter a comment of up to 1,000 characters.' }, 400);
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: submission, error: prepareError } = await user.rpc('prepare_election_survey_comment', { p_survey: body.survey_id, p_body: comment });
  if (prepareError || !submission) return json({ error: prepareError?.message || 'Comment could not be submitted.' }, 400);
  if (submission.status === 'approved') return json({ posted: true, message: 'This comment is already posted.' });
  if (submission.status === 'rejected') return json({ posted: false, message: 'Comment rejected by strict moderation. Please use respectful language without slurs, personal attacks or spam.' });
  if (submission.status !== 'pending' || typeof submission.body !== 'string') return json({ error: 'Comment is unavailable.' }, 400);
  try {
    const allowed = await allowComment(submission.body, Deno.env.get('OPENAI_API_KEY'));
    const { data: decision, error } = await admin.rpc('finish_election_survey_comment', { p_id: submission.id, p_allowed: allowed, p_reason: allowed ? 'strict_checks_passed' : 'strict_checks_rejected' });
    if (error) throw Error('Could not record moderation');
    return json({ posted: decision === 'approved', message: decision === 'approved' ? 'Your comment passed moderation and is now posted.' : 'Comment rejected by strict moderation. Please use respectful language without slurs, personal attacks or spam.' });
  } catch {
    // Keep pending and hidden on timeout, missing configuration, malformed output or any provider failure.
    return json({ posted: false, message: 'Your choice is saved. Comment moderation is temporarily unavailable, so your comment has not been published. Please try again later.' });
  }
});
