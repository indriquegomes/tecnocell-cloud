// Publishable key: identifies this app; table access remains blocked in Postgres.
export const serviceUrl='https://rbjwbfekkhebaschiqda.supabase.co';
export const publishableKey='sb_publishable_rtBeHw_ycAMHQJb9JbOOSw_KzIujOiq';
export const campaignId='halloween-2026';
let session=null,refreshing;
async function request(path,body,token){
 const headers={'apikey':publishableKey,'Content-Type':'application/json'};
 if(token)headers.Authorization=`Bearer ${token}`;
 let response;
 try{response=await fetch(`${serviceUrl}${path}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000),cache:'no-store'});}
 catch{throw new Error('Não foi possível confirmar a operação. Confira sua conexão e tente novamente.');}
 const value=await response.json().catch(()=>null);
 if(!response.ok){const message=value?.message||value?.msg||value?.error_description||'Não foi possível concluir a operação.';throw new Error(message==='Invalid login credentials'?'E-mail ou senha incorretos.':message);}
 return value;
}
export async function signIn(email,password){session=await request('/auth/v1/token?grant_type=password',{email,password});return session.user;}
export async function signOut(){const token=session?.access_token;session=null;if(token)await request('/auth/v1/logout',{},token).catch(()=>{});}
export async function rpc(name,args={}){
 if(session&&Date.now()>session.expires_at*1000-30000){
  refreshing??=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(s=>session=s).finally(()=>refreshing=null);
  try{await refreshing;}catch{session=null;throw new Error('Sua sessão venceu. Entre novamente.');}
 }
 return request(`/rest/v1/rpc/halloween_${name}`,args,session?.access_token);
}
export function benefit(p){return p.benefit_type==='percent'&&p.benefit_value===100?'Produto grátis':p.benefit_type==='price'?`Por ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(p.benefit_value/100)}`:`${p.benefit_value}% de desconto`;}
export function dateTime(value){return new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});}
