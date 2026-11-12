import {replay,validatePack}from './index.mjs';
export function replayByOutcome(pack,records){
 validatePack(pack);if(!Array.isArray(records)||records.length>10000||new Set(records.map(r=>r?.record?.id)).size!==records.length)throw new TypeError('Reçus invalides / Invalid receipts / Recibos inválidos');
 const rows=replay(pack,records);const groups=new Map();
 for(const row of rows){if(!groups.has(row.before))groups.set(row.before,{before:row.before,total:0,unchanged:0,changedTo:{}});const g=groups.get(row.before);g.total++;if(!row.changed)g.unchanged++;else Object.defineProperty(g.changedTo,row.after,{value:(Object.hasOwn(g.changedTo,row.after)?g.changedTo[row.after]:0)+1,writable:true,enumerable:true,configurable:true});}
 return {groups:[...groups.values()],total:rows.length,providerCalls:0};
}
