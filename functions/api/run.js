import audit from "../../lib/audit.js";

export const onRequest = (context) => {
  // A preview must never reach the paid engine or shared production counters.
  // Activate only after isolated storage and an explicit measured test approval.
  if (new URL(context.request.url).hostname !== 'audit.broadcastwell.com') {
    return new Response(JSON.stringify({message:'This check is awaiting activation.'}), {
      status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  }
  return audit.fetch(context.request, context.env);
};
