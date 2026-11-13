import { firstFixDoor } from '../lib/fix-door.js';
export async function onRequest({request,env,next}) {
  const original=await next();
  return request.method==='GET' ? firstFixDoor(original,env,request) : original;
}
