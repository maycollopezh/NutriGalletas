import {createHmac,timingSafeEqual} from 'node:crypto';
export const mac=(s,key)=>createHmac('sha256',key).update(s).digest('hex');
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const phone=s=>String(s||'').replace(/\D/g,'');
export function verifyEvent(raw,signature,secret,now=Date.now()){
 const t=signature?.match(/(?:^|,)\s*t=(\d+)/)?.[1],sig=signature?.match(/(?:^|,)\s*s=([a-f0-9]{64})/i)?.[1];
 if(!secret||!t||Math.abs(now/1000-Number(t))>300||!equal(mac(t+'.'+raw,secret),sig?.toLowerCase()))throw Error('Acceso denegado');
 return JSON.parse(raw);
}
export function audioUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||!['download.ycloud.com','api.ycloud.com','media.ycloud.com','cdn.ycloud.com','lookaside.fbsbx.com','mmg.whatsapp.net'].includes(u.hostname))throw Error('Enlace de audio no permitido');return u.href;}
export const proofFor=(p,key)=>mac(JSON.stringify([p.sender,p.eventId,p.type,p.at,p.text||'',p.audioUrl||'']),key);
export function verifyProof(p,key,now=Date.now()){if(!key||!p||!Number.isFinite(Number(p.at))||now-Number(p.at)>600000||Number(p.at)>now+30000||!equal(proofFor(p,key),p.proof))throw Error('Acceso denegado');}
