import { PAGE_HEADERS } from './headers.js';

const appRoom = 'https://app.broadcastwell.com/api/fix/first-room';
const no = () => new Response(null,{status:404,headers:{'cache-control':'no-store'}});
const capacity = available => Response.json({available},{headers:{'cache-control':available?'public, max-age=15':'no-store','x-content-type-options':'nosniff'}});

export async function firstFixRoom(request,env,read=fetch) {
  if (env.FIX_AUDIT_DOOR !== 'true' || request.method !== 'GET') return no();
  try {
    const response = await read(appRoom,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(2000)});
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
    if (reason !== 'allowance') line.textContent = 'The next daily allowance starts at 00:00 UTC.';
    line.hidden = !line.textContent;
    fetch('/api/first-fix-room', {credentials:'omit'}).then(function (r) { return r.ok ? r.json() : null; }).then(function (room) {
      if (own !== roomGeneration || !room || room.available !== true || isPhp()) return;
      var link = document.createElement('a'); link.href = APP_ORIGIN + '/account/fix/start';
      link.textContent = 'See your first fix'; link.target = '_top'; link.rel = 'noopener';
      line.textContent = ''; line.appendChild(link); line.appendChild(document.createTextNode(' from your website. It is free and needs no card.'));
      line.hidden = false;
    }).catch(function () {});
  }`;

async function integrity(script) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(script)));
  return "'sha256-"+btoa(String.fromCharCode(...bytes))+"'";
}

export async function firstFixDoor(response,env) {
  if (env.FIX_AUDIT_DOOR !== 'true' || response.status !== 200 ||
      !/^text\/html(?:;|$)/iu.test(response.headers.get('content-type') || '')) return response;
  const page = await response.clone().text();
  const script = /<script>([\s\S]*?)<\/script>/u.exec(page);
  if (!script) return response;
  const headers = new Headers(response.headers);
  const policy = headers.get('content-security-policy') || PAGE_HEADERS['Content-Security-Policy'];
  const oldHash = await integrity(script[1]);
  if (!policy.includes('script-src '+oldHash)) return response;
  const points = [
    ['<h3>Keep this result</h3>', '<h3>See your first fix</h3>'],
    ['Create a free account, no card. It keeps this check, and for 14 days it opens the tracking screens on ten buyer questions for your category, with up to three one-engine runs.',
      'Keep this check in your free account and read a draft page for your website. No card needed.'],
    ['id="keep-result">Create a free account<','id="keep-result">See your first fix<'],
    ['<p id="errormsg" class="flush"></p>','<p id="errormsg" class="flush"></p><p id="first-fix-room" hidden></p>']
  ];
  let html = page;
  for (const [before,after] of points) {
    if (!html.includes(before)) return response;
    html = html.replace(before,after);
  }
  const beforeTarget = "return APP_ORIGIN + '/signin?keep='";
  const beforeLimit = "  function refuse(reason, message) { stopProgress();";
  const beforeScore = "scoreNext.href = stepLink.href; scoreNext.textContent = stepLink.textContent;";
  if (![beforeTarget,beforeLimit,beforeScore].every(point=>script[1].includes(point))) return response;
  const code = script[1].replace(beforeTarget,"return APP_ORIGIN + '/signin?next=first-fix&keep='")
    .replace(beforeScore,"scoreNext.href = '#next-keep'; scoreNext.textContent = 'See your first fix';")
    .replace(beforeLimit,onLimit+'\n  function refuse(reason, message) { freshFixRoom(reason); stopProgress();');
  html = html.replace(script[0],()=>'<script>'+code+'</script>');
  const newHash = await integrity(code);
  headers.set('content-security-policy',policy.replace(oldHash,newHash));
  headers.set('cache-control','private, no-store');
  for (const name of ['content-length','content-encoding','etag','last-modified']) headers.delete(name);
  return new Response(html,{status:response.status,headers});
}
