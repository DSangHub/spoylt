(() => {
  'use strict';
  const dialog = document.getElementById('proposition-ad-dialog');
  const form = document.getElementById('proposition-ad-form');
  let client = null, locationState = '', generation = 0, expiryTimer = null;
  const cutoff = Date.parse('2026-11-03T08:00:00Z');
  function card(ad) {
    const article = document.createElement('article'); article.className = 'proposition-ad-card';
    for (const [tag,text] of [['p','PAID PROPOSITION ADVERTISEMENT · CALIFORNIA'],['h3',ad.proposition_number],['p',ad.yes_reason],['p',ad.legal_information]]) {
      const node=document.createElement(tag); node.textContent=text; article.append(node);
    }
    return article;
  }
  document.getElementById('proposition-ad-open').addEventListener('click',()=>{if(!dialog.open)dialog.showModal();form.elements.proposition_number.focus();});
  document.getElementById('proposition-ad-close').addEventListener('click',()=>dialog.close());
  function invalidate(){document.getElementById('proposition-ad-preview').hidden=true;}
  form.addEventListener('input',invalidate); form.addEventListener('change',invalidate);
  form.addEventListener('submit',event=>{
    event.preventDefault(); if(!form.reportValidity())return;
    const ad=Object.fromEntries(new FormData(form));
    for(const field of ['proposition_number','yes_reason','legal_information']) {
      ad[field]=ad[field].trim();if(!ad[field]){form.elements[field].focus();return;}
    }
    const preview=card(ad);preview.firstChild.textContent='PRIVATE PREVIEW · CALIFORNIA';
    document.getElementById('proposition-ad-preview-card').replaceChildren(preview);
    document.getElementById('proposition-ad-preview').hidden=false;
    const body=['Please review this California statewide proposition advertisement.',
      'Proposition: '+ad.proposition_number,'Reason for a yes vote: '+ad.yes_reason,
      'Legal information: '+ad.legal_information,'Price: $795.00 per week.',
      'Display option: '+(ad.display_option==='weekly_subscription'?'Weekly subscription':'One-time seven-day placement'),
      'Cutoff: end of November 2, 2026, Pacific Time.',
      'Mobile: 2 by 4 inches. Desktop: 3 by 5 inches.',
      'This request does not activate publication or payment.'].join('\n');
    document.getElementById('proposition-ad-review').href='mailto:ispoylt@gmail.com?subject='+encodeURIComponent('California proposition flyer review')+'&body='+encodeURIComponent(body);
  });
  const placement=document.getElementById('proposition-ad-placement');
  const track=document.getElementById('proposition-ad-track');
  const viewport=document.getElementById('proposition-ad-rotation');
  const pause=document.getElementById('proposition-ad-pause');
  pause.addEventListener('click',()=>{
    const paused=viewport.classList.toggle('is-paused');pause.setAttribute('aria-pressed',String(paused));
    pause.textContent=paused?'Play proposition flyers':'Pause proposition flyers';
  });
  async function load(stateCode) {
    locationState=stateCode; const request=++generation;
    clearTimeout(expiryTimer);
    placement.hidden=true;track.replaceChildren();viewport.classList.remove('is-paused');
    pause.setAttribute('aria-pressed','false');pause.textContent='Pause proposition flyers';
    if(!client || stateCode!=='CA' || Date.now()>=cutoff)return;
    const now=new Date().toISOString();
    const {data,error}=await client.from('proposition_flyers')
      .select('id,proposition_number,yes_reason,legal_information,display_expires_at')
      .eq('target_state','CA').eq('status','approved').eq('payment_status','paid')
      .lte('display_starts_at',now).gt('display_expires_at',now)
      .order('created_at',{ascending:false}).limit(50);
    if(request!==generation || locationState!=='CA' || error || !data?.length)return;
    const eligible=data.filter(ad=>Date.parse(ad.display_expires_at)>Date.now());
    if(!eligible.length)return;
    const cards=eligible.map(card);track.replaceChildren(...cards);
    // A second identical set makes the upward animation seamless, even for one flyer.
    cards.forEach(item=>{const copy=item.cloneNode(true);copy.setAttribute('aria-hidden','true');track.append(copy);});
    track.style.setProperty('--proposition-duration',eligible.length*18+'s');track.classList.add('is-moving');
    placement.hidden=false;
    const expires=Math.min(cutoff,...eligible.map(ad=>Date.parse(ad.display_expires_at)));
    expiryTimer=setTimeout(()=>load(locationState),Math.min(2147483647,Math.max(1,expires-Date.now())));
  }
  window.SpoyltPropositionAds={init(db){client=db;},load};
  // Reload at most once per minute, and at expiry, so an open page cannot retain expired ads.
  setInterval(()=>{if(!document.hidden)load(locationState);},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load(locationState);});
})();
