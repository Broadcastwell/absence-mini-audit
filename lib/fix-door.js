import { PAGE_HEADERS } from './headers.js';

function appOrigin(request,env) {
  const url = new URL(request.url);
  if (url.origin === 'https://audit.broadcastwell.com' || url.origin === 'https://absence-mini-audit.pages.dev') return 'https://app.broadcastwell.com';
  if (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname)) return 'http://127.0.0.1:8788';
  if (/^https:\/\/[a-z0-9-]+\.absence-mini-audit\.pages\.dev$/u.test(url.origin)) {
    const paired = env.FIX_AUDIT_PREVIEW_APP_ORIGIN;
    return /^https:\/\/[a-z0-9-]+\.bw-client-data\.pages\.dev$/u.test(paired) ? paired : 'https://fix-preview.bw-client-data.pages.dev';
  }
  return null;
}
const no = () => new Response(null,{status:404,headers:{'cache-control':'no-store'}});
const capacity = available => Response.json({available},{headers:{'cache-control':available?'public, max-age=15':'no-store','x-content-type-options':'nosniff'}});

export async function firstFixRoom(request,env,read=fetch) {
  if (env.FIX_AUDIT_DOOR !== 'true' || request.method !== 'GET') return no();
  const origin = appOrigin(request,env);
  if (!origin) return no();
  try {
    const response = await read(origin+'/api/fix/first-room',{method:'GET',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(2000)});
    if (!response.ok || !/^application\/json(?:;|$)/iu.test(response.headers.get('content-type') || '')) return capacity(false);
    return capacity((await response.json()).available === true);
  } catch { return capacity(false); }
}

// This is appended to the existing page script only for the enabled result page.
// Capacity is checked after an actual limit refusal. No visitor detail is sent.
const onLimit = `  var roomGeneration = 0;
  function freshFixRoom(reason) {
    var own = ++roomGeneration, line = document.getElementById('first-fix-room');
    line.hidden = true; line.textContent = '';
    if (isPhp() || ['network','address','global','allowance'].indexOf(reason) < 0) return;
    line.textContent = reason === 'allowance' ? 'There is no scheduled date for the overall allowance to reopen.' : 'The next daily allowance starts at 00:00 UTC.';
    line.hidden = false;
    fetch('/api/first-fix-room', {credentials:'omit',referrerPolicy:'no-referrer'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (room) {
      if (own !== roomGeneration || !room || room.available !== true || isPhp()) return;
      var link = document.createElement('a'); link.href = APP_ORIGIN + '/account/fix/start';
      link.textContent = 'See your first fix'; link.target = '_top'; link.rel = 'noopener noreferrer';
      line.textContent = ''; line.appendChild(link); line.appendChild(document.createTextNode(' from your website. It is free and needs no card.'));
      line.hidden = false;
    }).catch(function () {});
  }`;

async function integrity(script) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script)));
  return "'sha256-"+btoa(String.fromCharCode(...bytes))+"'";
}

export async function firstFixDoor(response,env,request) {
  if (env.FIX_AUDIT_DOOR !== 'true' || !request ||
      !/^text\/html(?:;|$)/iu.test(response.headers.get('content-type') || '')) return response;
  const origin = appOrigin(request,env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('referrer-policy','no-referrer');
  const unchanged = () => new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  if (response.status !== 200) return unchanged();
  const page = await response.clone().text();
  const script = /<script>([\s\S]*?)<\/script>/u.exec(page);
  if (!script) return unchanged();
  const policy = headers.get('content-security-policy') || PAGE_HEADERS['Content-Security-Policy'];
  const oldHash = await integrity(script[1]);
  if (!policy.includes('script-src '+oldHash)) return unchanged();
  const points = [
    ['<h3>Keep this result</h3>', '<h3>See your first fix</h3>'],
    ['<p>Create a free account, no card. It keeps this check, and for 14 days it opens the tracking screens on ten buyer questions for your category, with up to three one-engine runs.</p>',
      '<p>Keep this check in your free account and read a draft page for your website. No card needed.</p>'],
    ['id="keep-result">Create a free account<','id="keep-result">See your first fix<'],
    ['<p id="errormsg" class="flush"></p>','<p id="errormsg" class="flush"></p><p id="first-fix-room" aria-live="polite" hidden></p>'],
    ['<a id="score-next-link" class="small-button" href="https://broadcastwell.com/answer-repair">Fix this answer, $490</a>',
      '<button type="button" id="score-next-link" class="small-button" aria-describedby="score-keep-status">See your first fix</button><span id="score-keep-status" class="small hidden" role="status"></span>']
  ];
  let html = page;
  for (const [before,after] of points) {
    if (!html.includes(before)) return unchanged();
    html = html.replace(before,after);
  }
  const beforeTarget = "return APP_ORIGIN + '/signin?keep='";
  const beforeLimit = "  function refuse(reason, message) { stopProgress();";
  const beforeScore = /    var stepLink = [^\n]+\r?\n    scoreNext.href = stepLink.href; scoreNext.textContent = stepLink.textContent;/u;
  const beforeOrigin = /var APP_ORIGIN = [^;]+;/u;
  const keepListener = "document.getElementById('keep-result').addEventListener('click', function () {";
  const keepControls = "var button = this, status = document.getElementById('keep-status');";
  const keepEnd = "\n  // Copy link to this result, in one step:";
  if (![beforeTarget,beforeLimit,keepListener,keepControls,keepEnd].every(point=>script[1].includes(point)) || !beforeScore.test(script[1]) || !beforeOrigin.test(script[1])) return unchanged();
  const start = script[1].indexOf(keepListener), end = script[1].indexOf(keepEnd,start);
  const keepCode = script[1].slice(start,end)
    .replace(keepListener,'function keepFirstFix() {')
    .replace(keepControls,`var button = this, second = document.getElementById(button.id === 'keep-result' ? 'score-next-link' : 'keep-result');
    var status = document.getElementById(button.id === 'keep-result' ? 'keep-status' : 'score-keep-status');
    if (button.disabled || second.disabled) return;`)
    .replaceAll('button.disabled = ', 'second.disabled = button.disabled = ')
    .replace(/\}\);\s*$/u,`};
  document.getElementById('keep-result').addEventListener('click',keepFirstFix);
  document.getElementById('score-next-link').addEventListener('click',keepFirstFix);`);
  const code = (script[1].slice(0,start)+keepCode+script[1].slice(end)).replace(beforeTarget,"return APP_ORIGIN + '/signin?next=first-fix&keep='")
    .replace(beforeOrigin,'var APP_ORIGIN = '+JSON.stringify(origin)+';')
    .replace(beforeScore,'')
    .replace(beforeLimit,onLimit+'\n  function refuse(reason, message) { freshFixRoom(reason); stopProgress();');
  html = html.replace(script[0],()=>'<script>'+code+'</script>');
  const newHash = await integrity(code);
  headers.set('content-security-policy',policy.replace(oldHash,newHash));
  headers.set('cache-control','private, no-store');
  for (const name of ['content-length','content-encoding','etag','last-modified']) headers.delete(name);
  return new Response(html,{status:response.status,headers});
}
