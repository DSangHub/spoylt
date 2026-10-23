window.SpoyltElectionSurveys = (() => {
  function init(db) {
    const dialog = document.getElementById('election-surveys-dialog');
    const container = document.getElementById('election-surveys-races');
    const status = document.getElementById('election-surveys-status');
    const signin = document.getElementById('election-surveys-signin');
    const selections = new Map();
    const drafts = new Map();
    const consents = new Map();
    const messages = new Map();
    let signedIn = false;
    let viewerId = null;
    let request = 0;
    function element(tag, text, classes) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (classes) node.className = classes;
      return node;
    }
    function render(races) {
      container.replaceChildren(...races.map(race => {
        const form = element('form', undefined, 'rounded-xl border border-slate-700 bg-slate-900 p-4');
        const heading = element('h3', race.title, 'text-lg font-bold text-white');
        heading.id = `survey-${race.id}`;
        form.setAttribute('aria-labelledby', heading.id);
        const total = Number(race.total);
        const summary = element('p', `${total} response${total === 1 ? '' : 's'} · ${race.open ? 'Open' : 'Closed'}`, 'mt-1 text-xs text-slate-400');
        const fieldset = element('fieldset', undefined, 'mt-4 space-y-2');
        const legend = element('legend', 'Check the candidate you are voting for', 'mb-2 text-sm font-semibold text-sky-200');
        fieldset.append(legend);
        const selected = selections.get(race.id) || race.own_choice;
        race.choices.forEach(choice => {
          const label = element('label', undefined, 'flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 p-3 hover:border-sky-400');
          const input = element('input');
          input.type = 'radio'; input.name = 'candidate'; input.value = choice.id;
          input.checked = selected === choice.id; input.required = true;
          input.disabled = !race.open; input.className = 'peer sr-only';
          input.addEventListener('change', () => selections.set(race.id, choice.id));
          const check = element('span', '✓', 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-500 text-transparent peer-checked:border-emerald-400 peer-checked:bg-emerald-500 peer-checked:text-slate-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-300');
          check.setAttribute('aria-hidden', 'true');
          const detail = element('span', undefined, 'min-w-0 flex-1');
          detail.append(element('span', choice.name, 'block text-sm font-semibold text-white'));
          if (choice.party) detail.append(element('span', choice.party, 'block text-xs text-slate-400'));
          const count = Number(choice.count);
          detail.append(element('span', `${count} response${count === 1 ? '' : 's'} · ${total ? (100 * count / total).toFixed(1) : '0'}%`, 'mt-1 block text-xs text-sky-200'));
          label.append(input, check, detail); fieldset.append(label);
        });
        const commentLabel = element('label', 'Post a comment (optional)', 'mt-5 block text-sm font-semibold text-white');
        const comment = element('textarea', undefined, 'mt-2 block w-full rounded-lg border border-slate-600 bg-slate-800 p-3 text-sm font-normal text-white');
        comment.name = 'comment'; comment.rows = 3; comment.maxLength = 1000; comment.disabled = !race.open;
        comment.placeholder = 'Share your views respectfully. No foul language, slurs, threats, personal attacks, impersonation or spam.';
        comment.value = drafts.get(race.id) || '';
        commentLabel.append(comment);
        const moderationNote = element('p', 'Strict moderation before posting · 1,000 characters maximum. Your comment is public; your candidate selection stays private unless you mention it.', 'mt-2 text-xs leading-relaxed text-slate-400');
        const consentLabel = element('label', undefined, 'mt-3 flex items-start gap-2 text-xs text-slate-300');
        const consent = element('input'); consent.type = 'checkbox'; consent.className = 'mt-0.5 shrink-0';
        consent.checked = consents.get(race.id) || false; consent.required = Boolean(comment.value.trim());
        comment.addEventListener('input', () => { drafts.set(race.id, comment.value); consent.required = Boolean(comment.value.trim()); });
        consent.addEventListener('change', () => consents.set(race.id, consent.checked));
        consentLabel.append(consent, element('span', 'I agree to public posting of this comment and sending its text to OpenAI for moderation.'));
        const feedback = element('p', messages.get(race.id) || '', 'mt-3 text-sm text-sky-200'); feedback.setAttribute('role', 'status');
        const submit = element('button', 'Save choice & post comment', 'mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold hover:bg-blue-500 disabled:opacity-50');
        submit.type = 'submit'; submit.disabled = !race.open;
        const sources = element('div', undefined, 'mt-3 flex flex-wrap gap-3 text-xs text-sky-300');
        [['Official candidate list ↗', race.source_url], ['Declared write-ins ↗', race.write_in_source_url]].forEach(([text, url]) => {
          const link = element('a', text, 'underline'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
        });
        const discussion = element('section', undefined, 'mt-5 border-t border-slate-700 pt-4');
        discussion.setAttribute('aria-label', `${race.title} moderated comments`);
        discussion.append(element('h4', 'Comments · strictly moderated', 'text-sm font-bold text-white'));
        if (!race.comments?.length) discussion.append(element('p', 'No approved comments yet.', 'mt-2 text-xs text-slate-400'));
        (race.comments || []).forEach(item => {
          const article = element('article', undefined, 'mt-3 rounded-lg bg-slate-800 p-3');
          article.append(element('p', item.is_own ? 'Your comment · Approved' : 'SPOYLT member · Approved', 'text-xs text-sky-300'));
          article.append(element('p', item.body, 'mt-1 whitespace-pre-wrap break-words text-sm text-slate-200'));
          discussion.append(article);
        });
        form.append(heading, summary, fieldset, commentLabel, moderationNote, consentLabel, feedback, submit, sources, discussion);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          if (!signedIn) { feedback.textContent = 'Sign in with a confirmed email to save your choice and post a comment.'; signin.focus(); return; }
          const choice = new FormData(form).get('candidate');
          if (!choice) return;
          const text = comment.value.trim();
          if (text && !consent.checked) { feedback.textContent = 'Confirm public posting and moderation to post your comment.'; return; }
          submit.disabled = true; submit.textContent = 'Saving…';
          const { error } = await db.rpc('answer_election_survey', { p_survey: race.id, p_choice: choice });
          if (error) { feedback.textContent = error.message || 'Your choice could not be saved. Please try again.'; submit.disabled = false; submit.textContent = 'Save choice & post comment'; return; }
          let message = '✓ Your candidate selection is saved.';
          if (text) {
            submit.textContent = 'Moderating comment…'; feedback.textContent = 'Your choice is saved. Checking your comment before publication…';
            const { data, error: moderationError } = await db.functions.invoke('moderate-survey-comment', { body: { survey_id: race.id, comment: text, moderation_consent: true } });
            if (moderationError || !data) message += ' Your comment has not been published. Moderation could not complete; please try again later.';
            else {
              message += ' ' + data.message;
              if (data.posted) { drafts.delete(race.id); consents.delete(race.id); }
            }
          }
          messages.set(race.id, message);
          await load();
        });
        return form;
      }));
    }
    async function load() {
      const revision = ++request;
      status.textContent = 'Loading surveys…';
      const { data, error } = await db.rpc('get_election_surveys');
      if (revision !== request || !dialog.open) return;
      if (error || !Array.isArray(data) || data.length !== 4) { status.textContent = 'Surveys could not load. Close and reopen to try again.'; return; }
      render(data); status.textContent = '';
    }
    document.getElementById('election-surveys-open').addEventListener('click', () => {
      dialog.showModal(); load();
    });
    document.getElementById('election-surveys-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { ++request; selections.clear(); drafts.clear(); consents.clear(); messages.clear(); container.replaceChildren(); });
    signin.addEventListener('click', () => { dialog.close(); document.getElementById('auth-button').click(); });
    db.auth.onAuthStateChange((_event, session) => {
      const nextViewer = session?.user?.id || null;
      const changed = nextViewer !== viewerId;
      viewerId = nextViewer;
      signedIn = Boolean(session?.user);
      signin.hidden = signedIn;
      if (!changed) return;
      selections.clear();
      drafts.clear(); consents.clear(); messages.clear();
      if (dialog.open) { container.replaceChildren(); setTimeout(load, 0); }
    });
  }
  return { init };
})();
