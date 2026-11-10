import result from "../../../lib/result.js";

export const onRequest = (context) => result.fetch(context.request, context.env);
