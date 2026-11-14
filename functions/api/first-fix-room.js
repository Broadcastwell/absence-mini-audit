import { firstFixRoom } from '../../lib/fix-door.js';

export function onRequest({request,env,next}) {
  if (env.FIX_AUDIT_DOOR !== 'true') return next();
  return firstFixRoom(request,env);
}
