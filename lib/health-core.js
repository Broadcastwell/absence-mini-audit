import { ledgerLane } from './engine-core.js';

export function weeklySummary(rows, configuration, from, to) {
  const week=rows.filter(row=>Date.parse(row.created_utc)>=Date.parse(from)&&Date.parse(row.created_utc)<Date.parse(to));
  const lane=name=>week.filter(row=>ledgerLane(row,configuration)===name);
  const visitors=lane('public').filter(row=>row.outcome!=='reserved');
  const complete=visitors.filter(row=>row.outcome==='complete');
  const times=complete.map(row=>Number(row.milliseconds)/1000).sort((a,b)=>a-b);
  const middle=Math.floor(times.length/2),median=times.length?(times.length%2?times[middle]:(times[middle-1]+times[middle])/2):null;
  const cost=list=>list.reduce((sum,row)=>sum+Number(row.cost||0),0);
  return {from,to,checks_served:complete.length,failures:visitors.filter(row=>row.outcome!=='complete').length,allowance_outcomes:visitors.filter(row=>row.outcome==='allowance_used').length,median_seconds:median,credit_spend_week:cost(week),credit_spend_cumulative:cost(rows),pending_billing:rows.filter(row=>row.usage_pending===true||row.usage_pending==='true').length,editor_runs_excluded:lane('editor').length,lanes:Object.fromEntries(['public','health','editor','build'].map(name=>[name,{rows:lane(name).length,cost:cost(lane(name))}]))};
}
