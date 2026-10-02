(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpoyltPasswordRecovery = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const MARKER = 'spoylt-password-recovery';
  const MAX_AGE = 15 * 60 * 1000;
  const REDIRECT = 'https://www.spoylt.org/';
  const initialHash = typeof location === 'undefined' ? '' : location.hash;

  function create(auth, storage, now = Date.now) {
    let recovery = null;
    function clear() { recovery = null; try { storage.removeItem(MARKER); } catch {} }
    function activate(session) {
      if (!session?.user?.id) { clear(); return false; }
      recovery = { userId: session.user.id, startedAt: now() };
      try { storage.setItem(MARKER, JSON.stringify(recovery)); } catch {}
      return true;
    }
    function resume(session) {
      try {
        const saved = JSON.parse(storage.getItem(MARKER) || 'null');
        if (saved?.userId === session?.user?.id && Number.isFinite(saved?.startedAt) &&
            now() >= saved.startedAt && now() - saved.startedAt < MAX_AGE) {
          recovery = saved; return true;
        }
      } catch {}
      clear(); return false;
    }
    function active() { return Boolean(recovery && now() - recovery.startedAt >= 0 && now() - recovery.startedAt < MAX_AGE); }
    async function request(email) {
      email = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
      if (error) {
        if (error.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error.code)) {
          throw new Error('Please wait a few minutes before requesting another reset link.');
        }
        throw new Error('Could not request a reset link. Please try again later.');
      }
      return 'If an account exists for that email, a password reset link will arrive shortly. Check your spam folder too.';
    }
    async function change(password, confirmation) {
      if (!active()) { clear(); throw new Error('Your reset session has expired. Request a new email link.'); }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('Choose a password with 8–128 characters.');
      if (password !== confirmation) throw new Error('The passwords do not match.');
      const expectedUser = recovery.userId;
      const { data, error } = await auth.getUser();
      if (error || data?.user?.id !== expectedUser || !active()) {
        clear(); throw new Error('Your reset session is no longer valid. Request a new email link.');
      }
      const result = await auth.updateUser({ password });
      if (result.error) {
        if (result.error.code === 'same_password') throw new Error('Choose a password different from your current password.');
        if (result.error.code === 'weak_password') throw new Error('Choose a stronger password and try again.');
        throw new Error('Could not update your password. Please try again or request a new reset link.');
      }
      clear();
      // Revoke refresh sessions and leave the recovery flow. Never store or log passwords.
      try { await auth.signOut({ scope: 'global' }); } catch {}
      return 'Password updated. Sign in with your new password.';
    }
    return { activate, resume, clear, active, request, change };
  }

  function init(auth) {
    const recovery = create(auth, sessionStorage);
    const $ = id => document.getElementById(id);
    const requestDialog = $('forgot-password-dialog');
    const updateDialog = $('reset-password-dialog');
    function open(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
    function renderReset(valid, message) {
      $('reset-password-form').classList.toggle('hidden', !valid);
      $('reset-password-status').textContent = message || (valid ? 'Choose a new password for your account.' : 'This reset link is invalid or expired. Request a new email link.');
      $('reset-password-new-link').classList.toggle('hidden', valid);
      open(updateDialog);
      if (valid) $('reset-password').focus();
    }
    function requestOpen() {
      updateDialog.close();
      $('forgot-password-email').value = $('signin-email')?.value || '';
      $('forgot-password-status').textContent = '';
      open(requestDialog); $('forgot-password-email').focus();
    }
    document.querySelectorAll('[data-forgot-password]').forEach(button => button.addEventListener('click', requestOpen));
    document.querySelectorAll('[data-close-password-dialog]').forEach(button => button.addEventListener('click', () => {
      const dialog = button.closest('dialog');
      dialog.close();
      if (dialog === updateDialog) {
        recovery.clear();
        $('reset-password-form').reset();
      }
    }));
    $('reset-password-new-link').addEventListener('click', () => { recovery.clear(); requestOpen(); });
    updateDialog.addEventListener('cancel', () => { recovery.clear(); $('reset-password-form').reset(); });
    $('forgot-password-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('forgot-password-send'); button.disabled = true;
      $('forgot-password-status').textContent = 'Requesting reset link…';
      try { $('forgot-password-status').textContent = await recovery.request($('forgot-password-email').value); }
      catch (error) { $('forgot-password-status').textContent = error.message; }
      finally { button.disabled = false; }
    });
    $('reset-password-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('reset-password-save'); button.disabled = true;
      $('reset-password-status').textContent = 'Saving your password…';
      try {
        const message = await recovery.change($('reset-password').value, $('reset-password-confirm').value);
        $('reset-password-form').reset(); $('reset-password-form').classList.add('hidden');
        $('reset-password-new-link').classList.add('hidden'); $('reset-password-status').textContent = message;
      } catch (error) {
        $('reset-password-status').textContent = error.message;
        if (!recovery.active()) { $('reset-password-form').classList.add('hidden'); $('reset-password-new-link').classList.remove('hidden'); }
      } finally { button.disabled = false; }
    });
    // Listen immediately after client construction, before getSession can consume the recovery event.
    auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') renderReset(recovery.activate(session));
      if (event === 'SIGNED_OUT') { recovery.clear(); $('reset-password-form').reset(); }
      if (event === 'SIGNED_IN' && recovery.active() && !recovery.resume(session)) renderReset(false);
    });
    const hash = new URLSearchParams(initialHash.replace(/^#/, ''));
    auth.getSession().then(({ data, error }) => {
      if (hash.has('error') || hash.has('error_code')) { recovery.clear(); renderReset(false); return; }
      if (recovery.active()) return;
      if (!error && recovery.resume(data?.session)) renderReset(true);
      else if (hash.get('type') === 'recovery') renderReset(false);
    }).catch(() => { if (hash.get('type') === 'recovery') renderReset(false); });
    return recovery;
  }
  return { create, init };
});
