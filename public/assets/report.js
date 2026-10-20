(function(root) {
  'use strict';
  var BLUE='#1D4ED8', GRAY='#475569', INK='#0A0E1A';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function plain(value) { return String(value || '').replace(/[\u2013\u2014]/g,', ').replace(/\x2d{2,}/g,' ').replace(/^#{1,6}\s*/gm,'').replace(/\*\*([^*]+)\*\*/g,function(_,text){return text;}).replace(/`/g,'').trim(); }
  function scope(data) { return (data.engine==='Claude'?'Claude':'Earlier one-engine check')+', ten questions, one run, measured on '+data.measured_on+'.'; }
  function text(x,y,value,size,extra) { return '<text x="'+x+'" y="'+y+'" font-family="Inter,Arial,sans-serif" font-size="'+size+'" fill="'+INK+'" '+(extra||'')+'>'+esc(plain(value))+'</text>'; }
  function host(value) { return String(value||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]; }
  function companies(data,ctx) { var list=(Array.isArray(data.named_instead)?data.named_instead:[]).slice(0,8).map(function(r){return {label:r.company,count:r.count,own:false};}); if(!list.length)return []; return [{label:(ctx.brand||ctx.website||ctx.company)+' (you)',count:data.named,own:true}].concat(list); }
  function sources(data,ctx) { var own=host(ctx.website||ctx.company), all=data.cited_sources&&Array.isArray(data.cited_sources.domains)?data.cited_sources.domains:[]; var list=all.slice(0,8); var ownRow=all.find(function(r){return r.domain===own||r.domain.endsWith('.'+own);}); if(ownRow&&!list.includes(ownRow))list=list.slice(0,7).concat([ownRow]); return list.map(function(r){return {label:r.domain,count:r.count,own:r.domain===own||r.domain.endsWith('.'+own)};}); }
  function bars(rows,title,options) {
    if(!rows.length)return '';
    var height=rows.length*60+12, compact=options&&options.compact, W=compact?360:640, bar=compact?300:580;
    var description=title+': '+rows.map(function(r){return r.label+', '+r.count+' of 10 answers';}).join('; ');
    var out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+height+'" role="img" tabindex="0" aria-label="'+esc(description)+'"><title>'+esc(title)+'</title>'];
    rows.forEach(function(r,i){var y=i*60+12,label=plain(r.label),cut=label.length>31?label.slice(0,28)+'...':label;out.push('<g tabindex="0" aria-label="'+esc(label+', '+r.count+' of 10 answers')+'">'+text(0,y+18,cut,16,r.own?'font-weight="700"':'')+'<rect x="0" y="'+(y+28)+'" width="'+bar+'" height="12" rx="3" fill="#EFF6FF"/><rect x="0" y="'+(y+28)+'" width="'+(Math.max(0,Math.min(10,r.count))*bar/10)+'" height="12" rx="3" fill="'+(r.own?BLUE:GRAY)+'"/>'+text(bar+20,y+40,r.count+'/10',15,'font-weight="700"')+'</g>');});
    return out.join('')+'</svg>';
  }
  function card(data,ctx,options) {
    var o=options||{}, W=o.width||1200,H=o.height||630,scale=Math.min(W/1200,H/630),pad=48*scale, y=pad+24*scale;
    var out=['<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img"><title>'+esc('Free 10-question check (one engine), '+(ctx.brand||ctx.website||ctx.company))+'</title>'];
    if(o.fontCss)out.push('<style type="text/css">'+o.fontCss+'</style>');
    out.push('<rect width="'+W+'" height="'+H+'" fill="#FFFFFF"/><rect width="'+W+'" height="'+(8*scale)+'" fill="'+BLUE+'"/>');
    out.push(text(pad,y,ctx.preview?'SAMPLE DATA. Fictional preview.':'Free 10-question check (one engine)',19*scale,'font-weight="600"')); y+=64*scale;
    out.push(text(pad,y,(ctx.preview?'Sample: named':'Named')+' in '+data.named+' of 10',48*scale,'font-weight="700"')); y+=40*scale;
    var company=plain(ctx.brand||ctx.website||ctx.company);if(company.length>65)company=company.slice(0,62)+'...';
    out.push(text(pad,y,company,24*scale,'font-weight="600"')); y+=34*scale;
    var category=plain(ctx.category);if(category.length>94)category=category.slice(0,91)+'...';out.push(text(pad,y,category,18*scale));y+=42*scale;
    out.push(text(pad,y,ctx.preview?'Preview layout. No measurement was run.':scope(data),17*scale));y+=46*scale;
    out.push(text(pad,y,'Who Claude names instead',23*scale,'font-weight="700"'));y+=34*scale;
    var peers=(data.named_instead||[]).slice(0,3);
    if(!peers.length){out.push(text(pad,y,'Company names were not returned for this result.',18*scale));y+=36*scale;}
    peers.forEach(function(r){var name=plain(r.company);if(name.length>60)name=name.slice(0,57)+'...';out.push(text(pad,y,name,19*scale),text(W-pad,y,r.count+' of 10',19*scale,'text-anchor="end" font-weight="700"'));y+=34*scale;});
    var own=data.cited_sources&&Number.isInteger(data.cited_sources.own_site_cited)?'Your site was cited in '+data.cited_sources.own_site_cited+' of 10 answers.':'Source detail was not returned for this saved result.';
    out.push(text(pad,Math.max(y+20*scale,H-92*scale),own,19*scale,'font-weight="600"'));
    out.push('<rect x="0" y="'+(H-56*scale)+'" width="'+W+'" height="'+(56*scale)+'" fill="#EFF6FF"/>',text(pad,H-22*scale,'broadcastwell.com  |  One engine, one run. Answers vary between runs.',16*scale));
    return out.join('')+'</svg>';
  }
  root.BwReport={plain:plain,scope:scope,companies:companies,sources:sources,bars:bars,card:card};
})(typeof globalThis!=='undefined'?globalThis:this);
