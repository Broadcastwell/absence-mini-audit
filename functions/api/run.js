import audit from "../../lib/audit.js";

// The one preview host allowed to run a free check, and nothing else.
//
// Cloudflare Pages builds a branch alias from the branch name truncated to 28
// characters, so the branch phase1-free-evidence-2026-09-14, which is 31, is served at
// phase1-free-evidence-2026-09.absence-mini-audit.pages.dev. The gate used to name the
// untruncated form, a hostname Pages never creates, so the preview path was unreachable
// and every request to it answered "awaiting activation". Both spellings are listed
// rather than matched by prefix: a prefix would let any branch whose name starts the
// same way through, and this gate is what keeps a preview off the paid engine.
export const PREVIEW_HOSTS = new Set([
  "phase1-free-evidence-2026-09.absence-mini-audit.pages.dev",
  "phase1-free-evidence-2026-09-14.absence-mini-audit.pages.dev"
]);

export const onRequest = async (context) => {
  // A preview must never reach the paid engine or shared production counters.
  // Activate only after isolated storage and an explicit measured test approval.
  const hostname=new URL(context.request.url).hostname;
  const preview=PREVIEW_HOSTS.has(hostname)&&context.env.FREE_CHECK_PREVIEW==='true';
  if ((hostname !== 'audit.broadcastwell.com'&&!preview) || !context.env.LIMITS_DB) {
    return new Response(JSON.stringify({message:'This check is awaiting activation.'}), {
      status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  }
  if(preview){
    let body;try{body=await context.request.clone().json();}catch{}
    if(body?.company!=='kalvenor.example'||body?.category!=='procurement software'||body?.email!=='kalvenor-preview@example.com')return new Response(JSON.stringify({message:'This preview accepts only the approved synthetic sample.'}),{status:403,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
  return audit.fetch(context.request, context.env);
};
