window.SpoyltElectionSurveys = (() => {
  function init(db) {
    const dialog = document.getElementById('election-surveys-dialog');
    const container = document.getElementById('election-surveys-races');
    const status = document.getElementById('election-surveys-status');
    const signin = document.getElementById('election-surveys-signin');
    const selections = new Map();
    let signedIn = false;
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
        const legend = element('legend', 'Choose a candidate', 'sr-only');
        fieldset.append(legend);
        const selected = selections.get(race.id) || race.own_choice;
        race.choices.forEach(choice => {
          const label = element('label', undefined, 'flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 p-3 hover:border-sky-400');
          const input = element('input');
          input.type = 'radio'; input.name = 'candidate'; input.value = choice.id;
          input.checked = selected === choice.id; input.required = true;
          input.disabled = !race.open; input.className = 'mt-1 shrink-0 accent-sky-400';
          input.addEventListener('change', () => selections.set(race.id, choice.id));
          const detail = element('span', undefined, 'min-w-0 flex-1');
          detail.append(element('span', choice.name, 'block text-sm font-semibold text-white'));
          if (choice.party) detail.append(element('span', choice.party, 'block text-xs text-slate-400'));
          const count = Number(choice.count);
          detail.append(element('span', `${count} response${count === 1 ? '' : 's'} · ${total ? (100 * count / total).toFixed(1) : '0'}%`, 'mt-1 block text-xs text-sky-200'));
          label.append(input, detail); fieldset.append(label);
        });
        const submit = element('button', race.own_choice ? 'Update my response' : 'Save my response', 'mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold hover:bg-blue-500 disabled:opacity-50');
        submit.type = 'submit'; submit.disabled = !race.open;
        const sources = element('div', undefined, 'mt-3 flex flex-wrap gap-3 text-xs text-sky-300');
        [['Official candidate list ↗', race.source_url], ['Declared write-ins ↗', race.write_in_source_url]].forEach(([text, url]) => {
          const link = element('a', text, 'underline'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
        });
        form.append(heading, summary, fieldset, submit, sources);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          if (!signedIn) { status.textContent = 'Sign in with a confirmed email to save your response.'; signin.focus(); return; }
          const choice = new FormData(form).get('candidate');
          if (!choice) return;
          submit.disabled = true; submit.textContent = 'Saving…';
          const { error } = await db.rpc('answer_election_survey', { p_survey: race.id, p_choice: choice });
          if (error) { status.textContent = error.message || 'Your response could not be saved. Please try again.'; submit.disabled = false; submit.textContent = 'Save my response'; return; }
          await load();
          status.textContent = `Your response to ${race.title} was saved. You can update it until the survey closes.`;
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
    dialog.addEventListener('close', () => { ++request; selections.clear(); container.replaceChildren(); });
    signin.addEventListener('click', () => { dialog.close(); document.getElementById('auth-button').click(); });
    db.auth.onAuthStateChange((_event, session) => {
      signedIn = Boolean(session?.user);
      signin.hidden = signedIn;
      selections.clear();
      if (dialog.open) { container.replaceChildren(); setTimeout(load, 0); }
    });
  }
  return { init };
})();
