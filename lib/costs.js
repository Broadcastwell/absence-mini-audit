export function reportedCost(value) {
  const cost=value?.cost;
  if(!cost||cost.currency!=='USD'||cost.source!=='provider_usage'||cost.requests!==10)return null;
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
  if(cost.actual_usd!==null&&!valid(cost.actual_usd))return null;
  if(cost.actual_usd===null&&!valid(cost.known_usd))return null;
  const tokens=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;
  return {currency:'USD',actual_usd:cost.actual_usd,known_usd:cost.actual_usd??cost.known_usd,source:'provider_usage',requests:10,
    prompt_tokens:tokens(cost.prompt_tokens),completion_tokens:tokens(cost.completion_tokens)};
}

export async function beginCost(db,id) {
  // This must succeed before the paid request. No email, IP or answer is stored here.
  await db.prepare("INSERT INTO free_check_costs(id,created_at,status) VALUES(?,?,'running')").bind(id,Date.now()).run();
}

export async function finishCost(db,id,value,status) {
  const cost=reportedCost(value);
  const executionId=typeof value?.execution_id==='string'&&/^[0-9]{1,20}$/.test(value.execution_id)?value.execution_id:null;
  await db.prepare('UPDATE free_check_costs SET status=?,actual_usd=?,known_usd=?,prompt_tokens=?,completion_tokens=?,execution_id=? WHERE id=?')
    .bind(status,cost?.actual_usd??null,cost?.known_usd??null,cost?.prompt_tokens??null,cost?.completion_tokens??null,executionId,id).run();
  return cost;
}
