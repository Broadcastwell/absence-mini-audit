const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');

export async function reserveFreeCheck(db,{email,ip,day,now=Date.now()}){
  const cutoff=new Date(now-2*86400000).toISOString().slice(0,10);
  await db.prepare('DELETE FROM free_check_reservations WHERE day<?').bind(cutoff).run();
  const [addressKey,ipKey]=await Promise.all([digest(email.trim().toLowerCase()),digest(ip)]);
  const id=crypto.randomUUID();
  // One SQLite statement serializes the three allowance checks and reservation.
  // Count failed/ambiguous attempts too: a provider may have billed before failing.
  const result=await db.prepare(`INSERT INTO free_check_reservations(id,day,address_key,ip_key,created_at)
    SELECT ?,?,?,?,? WHERE
    (SELECT count(*) FROM free_check_reservations WHERE day=?)<100 AND
    (SELECT count(*) FROM free_check_reservations WHERE day=? AND address_key=?)<1 AND
    (SELECT count(*) FROM free_check_reservations WHERE day=? AND ip_key=?)<3`)
    .bind(id,day,addressKey,ipKey,now,day,day,addressKey,day,ipKey).run();
  if(result.meta.changes===1)return {allowed:true,id};
  const counts=await db.prepare(`SELECT count(*) total,
    COALESCE(sum(address_key=?),0) address_count,COALESCE(sum(ip_key=?),0) ip_count
    FROM free_check_reservations WHERE day=?`).bind(addressKey,ipKey,day).first();
  return {allowed:false,reason:counts.total>=100?'global_limit':counts.address_count>=1?'address_limit':'ip_limit'};
}
