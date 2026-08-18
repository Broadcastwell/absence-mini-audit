import audit from "../../lib/audit.js";

export const onRequest = (context) => audit.fetch(context.request, context.env);
