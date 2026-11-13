import audit from "../../lib/audit.js";
import { firstFixDoor } from "../../lib/fix-door.js";

export async function onRequest({request,env}) {
  const result = await audit.fetch(request,env);
  return request.method === 'GET' ? firstFixDoor(result,env) : result;
}
