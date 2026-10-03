(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoyltEndorsementDesign=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function lines(value, limit) {
    const result = []; let line = '';
    for (const word of String(value || '').trim().split(/\s+/u)) {
      const parts = Array.from(word);
      while (parts.length > limit) {
        if (line) { result.push(line); line = ''; }
        result.push(parts.splice(0,limit).join(''));
      }
      const rest = parts.join('');
      if (Array.from(line + ' ' + rest).length > limit && line) { result.push(line); line = rest; }
      else line = line ? line + ' ' + rest : rest;
    }
    if (line) result.push(line); return result;
  }
  function block(value,y,height,size,color,weight) {
    const rows=lines(value, Math.floor(440/(size*0.66)));
    size=Math.min(size,height/(Math.max(rows.length,1)*1.35));
    const start=y+(height-rows.length*size*1.35)/2+size;
    return rows.map((row,i)=>'<text x="300" y="'+(start+i*size*1.35)+'" text-anchor="middle" fill="'+color+'" font-family="Arial, sans-serif" font-size="'+size+'" font-weight="'+weight+'">'+escape(row)+'</text>').join('');
  }
  function svg(values, gold=true) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="4in" viewBox="0 0 600 1200" role="img" aria-label="Personal candidate endorsement">'+
    '<defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#805619"/><stop offset=".2" stop-color="#fff1a8"/><stop offset=".4" stop-color="#c39232"/><stop offset=".55" stop-color="#fff6bb"/><stop offset=".75" stop-color="#b47a20"/><stop offset="1" stop-color="#f7d76b"/></linearGradient></defs>'+
    '<rect width="600" height="1200" rx="24" fill="'+(gold?'url(#gold)':'#38bdf8')+'"/>'+
    '<rect x="12" y="12" width="576" height="1176" rx="18" fill="none" stroke="'+(gold?'#ffed99':'#bae6fd')+'" stroke-width="3"/>'+
    '<rect x="32" y="32" width="536" height="1136" rx="10" fill="#102452" stroke="'+(gold?'#815417':'#0284c7')+'" stroke-width="4"/>'+
    block('RESIDENT ENDORSEMENT',70,60,25,'#f7db88','700')+
    block(values.resident,155,130,34,'#ffffff','400')+
    block('SUPPORTS',310,65,27,'#f7db88','700')+
    block(values.candidate,410,230,50,'#ffffff','700')+
    block('Running for '+values.office,670,155,32,'#c7e3ff','700')+
    block(values.location,855,100,29,'#c7e3ff','400')+
    block('My own views, not paid or endorsed by any Candidate.',985,115,22,'#ffffff','400')+
    block('www.spoylt.org',1110,35,21,'#f7db88','700')+'</svg>';
  }
  return {svg};
});
