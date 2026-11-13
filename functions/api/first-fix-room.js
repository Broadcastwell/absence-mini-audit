import { firstFixRoom } from '../../lib/fix-door.js';
export const onRequest = ({request,env}) => firstFixRoom(request,env);
