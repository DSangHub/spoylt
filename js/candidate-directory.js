// Public election guide. These listings do not create SPOYLT accounts or candidate profiles.
(() => {
  const TX_SOURCE = 'https://www.sos.state.tx.us/elections/forms/2026-ballot-cert.pdf';
  const OH_SOURCE = 'https://www.ohiosos.gov/assets/dir2026-45-form-of-the-official-ballot-for-the-november%203-general-election.pdf';
  const OH_HOUSE_SOURCE = 'https://www.sparkvotes.org/ohio/';
  const races = {
    TX: {
      governor: [['Greg Abbott', 'Republican'], ['Gina Hinojosa', 'Democratic'], ['Pat Dixon', 'Libertarian']],
      senate: [['Ken Paxton', 'Republican'], ['James Talarico', 'Democratic'], ['Ted Brown', 'Libertarian']],
      house: {},
    },
    OH: {
      governor: [['Amy Acton', 'Democratic'], ['Don Kissick', 'Libertarian'], ['Vivek Ramaswamy', 'Republican']],
      senate: [['Sherrod Brown', 'Democratic'], ['Jon Husted', 'Republican'], ['Greg Levy', 'Other party'], ['William B. Redpath', 'Libertarian']],
      house: {
        1: [['Eric Conroy', 'Republican'], ['Greg Landsman', 'Democratic'], ['Nathan Weise', 'Libertarian']],
        2: [['Jennifer Mazzuckelli', 'Democratic'], ['Dave Taylor', 'Republican']],
        3: [['Joyce Beatty', 'Democratic'], ['Cleophus Dulaney', 'Republican']],
        4: [['Jim Jordan', 'Republican'], ['Joshua Kolasinski', 'Democratic'], ['Tracey Tackett', 'Independent']],
        5: [['Bob Latta', 'Republican'], ['Brian Shaver', 'Democratic'], ['Michael Veloff', 'Libertarian']],
        6: [['Elizabeth Kirtley', 'Democratic'], ['Michael Rulli', 'Republican']],
        7: [['Max Miller', 'Republican'], ['Brian Poindexter', 'Democratic']],
        8: [['Warren Davidson', 'Republican'], ['Vanessa Enoch', 'Democratic']],
        9: [['Matthew Althaus', 'Libertarian'], ['Marcy Kaptur', 'Democratic'], ['Derek Merrin', 'Republican']],
        10: [['Kristina Knickerbocker', 'Democratic'], ['Thomas McMasters', 'Libertarian'], ['Mike Turner', 'Republican']],
        11: [['Shontel Brown', 'Democratic'], ['Mike Kirchner', 'Republican']],
        12: [['Troy Balderson', 'Republican'], ['Jerrad Christian', 'Democratic']],
        13: [['Carey Coleman', 'Republican'], ['Sandeep Dixit', 'Independent'], ['Emilia Sykes', 'Democratic']],
        14: [['David Joyce', 'Republican'], ['Maria Jukic', 'Democratic']],
        15: [['Brennan Barrington', 'Libertarian'], ['Mike Carey', 'Republican'], ['Don Leonard', 'Democratic']],
      },
    },
  };
  const parties = { REP: 'Republican', DEM: 'Democratic', LIB: 'Libertarian', GRE: 'Green', IND: 'Independent' };
  const office = document.getElementById('candidate-office');
  const district = document.getElementById('candidate-district');
  const districtLabel = document.getElementById('candidate-district-label');
  const title = document.getElementById('candidate-race-title');
  const list = document.getElementById('candidate-list');
  const source = document.getElementById('candidate-source');
  let state = 'TX';

  function render() {
    const isHouse = office.value === 'house';
    district.hidden = districtLabel.classList.toggle('hidden', !isHouse);
    if (isHouse) {
      const previous = district.value;
      district.replaceChildren(...(Object.keys(races[state].house).length ? Object.keys(races[state].house) : ['1']).sort((a, b) => +a - +b).map(number => {
        const option = document.createElement('option');
        option.value = number;
        option.textContent = `District ${number}`;
        return option;
      }));
      if (races[state].house[previous]) district.value = previous;
    }
    const label = state === 'TX' ? 'Texas' : 'Ohio';
    title.textContent = `${label} · ${isHouse ? `U.S. House District ${district.value}` : office.value === 'senate' ? 'U.S. Senate' : 'Governor'}`;
    const names = isHouse ? races[state].house[district.value] : races[state][office.value];
    list.replaceChildren(...(names || []).map(([name, party]) => {
      const row = document.createElement('li');
      row.className = 'rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2';
      const strong = document.createElement('strong'); strong.className = 'block text-white'; strong.textContent = name;
      const small = document.createElement('span'); small.className = 'text-xs text-slate-400'; small.textContent = party;
      row.append(strong, small);
      return row;
    }));
    if (!names) list.textContent = 'Loading district candidates…';
    source.href = state === 'TX' ? TX_SOURCE : isHouse ? OH_HOUSE_SOURCE : OH_SOURCE;
    source.textContent = state === 'OH' && isHouse ? 'View district listings and verify your ballot ↗' : 'View official election source ↗';
  }

  document.querySelectorAll('[data-candidate-state]').forEach(button => {
    button.addEventListener('click', () => {
      state = button.dataset.candidateState;
      document.querySelectorAll('[data-candidate-state]').forEach(item => {
        const selected = item === button;
        item.setAttribute('aria-pressed', String(selected));
        item.classList.toggle('bg-sky-500', selected);
        item.classList.toggle('border-sky-400', selected);
        item.classList.toggle('border-slate-600', !selected);
      });
      render();
    });
  });
  office.addEventListener('change', render);
  district.addEventListener('change', render);
  render();
  fetch('js/texas-house-2026.json?v=20261022').then(response => {
    if (!response.ok) throw Error('Texas House listings unavailable');
    return response.json();
  }).then(data => {
    races.TX.house = Object.fromEntries(Object.entries(data).map(([number, entries]) => [number, entries.map(([name, party]) => [name, parties[party] || party])]));
    if (state === 'TX' && office.value === 'house') render();
  }).catch(() => {
    if (state === 'TX' && office.value === 'house') {
      list.textContent = 'District listings are temporarily unavailable. Use the official source below.';
    }
  });
})();
