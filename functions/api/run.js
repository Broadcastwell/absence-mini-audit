import audit from "../../lib/audit.js";

export const onRequest = async (context) => {
  // A preview must never reach the paid engine or shared production counters.
  // Activate only after isolated storage and an explicit measured test approval.
  const hostname=new URL(context.request.url).hostname;
  const preview=hostname==='phase1-free-evidence-2026-09-14.absence-mini-audit.pages.dev'&&context.env.FREE_CHECK_PREVIEW==='true';
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
