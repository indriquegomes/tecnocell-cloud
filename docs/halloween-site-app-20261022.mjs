import {rpc,campaignId,benefit,dateTime} from './api.mjs';
import {productArt} from './product-art.mjs';
import {createSoundscape} from './atmosphere.mjs';
const $=id=>document.getElementById(id);
const token=new URLSearchParams(location.hash.slice(1)).get('giro');
addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).get('giro')!==token)location.reload();});
// Keep the bearer token in the fragment when navigating inside the page.
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{
 event.preventDefault();const target=document.getElementById(link.getAttribute('href').slice(1));
 target?.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'});
 if(link.classList.contains('skip-link'))target?.focus({preventScroll:true});
}));
if(token)document.querySelector('.brand').href=location.pathname+location.hash;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let products=[],campaign,ticket,result,busy=false,loading=false;
function render(){
 const segment=360/products.length,colors=['#496d6a','#855580','#c3854b','#4c618c','#90627e','#be9652','#9b8d47'];
 $('wheel').style.background=`conic-gradient(from -${segment/2}deg,${products.map((_,i)=>`${colors[i%colors.length]} ${i*segment}deg ${(i+1)*segment}deg`).join(',')})`;
 $('wheel').replaceChildren(...products.map((p,i)=>{const item=document.createElement('span');item.className='wheel-item';item.style.setProperty('--angle',`${i*segment}deg`);item.append(productArt(p.name));return item;}));
 $('prize-list').replaceChildren(...products.map(p=>{
  const card=document.createElement('li');card.className=`prize ${p.id>=12?'rare':''}`;
  const visual=document.createElement('span');visual.className='prize-visual';visual.append(productArt(p.name));
  const label=document.createElement('strong');label.textContent=p.name;
  const detail=document.createElement('small');detail.textContent=benefit(p);const chance=document.createElement('span');chance.className='prize-chance';
  const current=campaign.active&&p.chance_current!==undefined;
  const value=current?p.chance_current:p.chance_base;
  chance.textContent=current&&!p.available?'Esgotado':current&&campaign.can_spin===false?'Giros aguardam reposição':value===undefined?'':(current?'Chance atual: ':'Chance base: ')+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value)+'%';
  card.append(visual,label,detail,chance);return card;
 }));
 $('mode-label').textContent=campaign.test_mode?'HOMOLOGAÇÃO':'HALLOWEEN TECNOCELL';
 $('campaign-note').textContent=campaign.test_mode?'Homologação. Nenhuma oferta ou código tem valor de resgate.':'Ofertas sujeitas ao regulamento e à disponibilidade da campanha.';
 $('spin').disabled=!ticket||ticket.status!=='available'||campaign.can_spin===false;
 $('spin-label').textContent=ticket?.status==='available'?(campaign.can_spin===false?'AGUARDANDO REPOSIÇÃO':'GIRAR ROLETA'):ticket?.status==='expired'?'PRAZO ENCERRADO':ticket?.status==='revoked'?'GIRO CANCELADO':ticket?.status==='used'?'GIRO REALIZADO':campaign.participation_open?'ACESSE SEU LINK DE GIRO':campaign.ends_at&&Date.now()>=Date.parse(campaign.ends_at)?'PERÍODO DE COMPRAS ENCERRADO':'CAMPANHA EM PREPARAÇÃO';
 document.querySelector('.attempt-token').textContent=ticket?.status==='available'?'1':'0';
 $('attempt-label').textContent=ticket?.status==='available'?'giro disponível':'giros disponíveis';
 if(ticket)$('expiry').textContent=`Use seu giro até ${dateTime(ticket.expires_at)} (horário de Brasília).${ticket.loja?' Retirada em '+ticket.loja+'.':''}`;
}
const {tone}=createSoundscape($('sound'),$('sound-label'));
const motionButton=$('motion');
let effectsPaused=reducedMotion.matches;
function updateMotion(){
 document.body.classList.toggle('effects-paused',effectsPaused||reducedMotion.matches);
 motionButton.textContent=effectsPaused||reducedMotion.matches?'Efeitos pausados':'Pausar efeitos';
 motionButton.setAttribute('aria-pressed',String(!(effectsPaused||reducedMotion.matches)));
 motionButton.disabled=reducedMotion.matches;
 motionButton.title=reducedMotion.matches?'Movimento reduzido conforme preferência do dispositivo':'Pausar ou retomar a fumaça e o movimento do caldeirão';
}
motionButton.onclick=()=>{effectsPaused=!effectsPaused;updateMotion();};
reducedMotion.addEventListener('change',()=>{effectsPaused=reducedMotion.matches;updateMotion();});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('page-hidden',document.hidden));
updateMotion();
function celebrate(rare){
 $('confetti').replaceChildren();if(reducedMotion.matches)return;
 const colors=rare?['#ffdc83','#fff0bd','#bc9142']:['#e9b358','#b4db88','#b88ada','#f7d7b0'];
 for(let i=0;i<32;i++){const dot=document.createElement('i');for(const[k,v]of Object.entries({x:`${i*37%100}%`,color:colors[i%colors.length],duration:`${2+i%3*.5}s`,delay:`${i%6*.13}s`,rotation:`${i*29}deg`,drift:`${i%2?40:-40}px`}))dot.style.setProperty(`--${k}`,v);$('confetti').append(dot);}
}
function showResult(){
 const p=result.offer,rare=p.id>=12;
 document.body.classList.remove('spinning');document.body.classList.add('revealed');
 $('floating').replaceChildren(productArt(p.name));$('reward-icon').replaceChildren(productArt(p.name));
 $('rarity').textContent=result.status==='replaced'?'CUPOM CANCELADO':result.status==='revoked'?'VALE CANCELADO':result.status==='redeemed'?'VALE JÁ RESGATADO':result.status==='expired'?'VALE VENCIDO':rare?'OFERTA ESPECIAL':'SUA OFERTA';
 $('result').classList.toggle('rare-result',rare);$('reward-title').textContent=`${benefit(p)} · ${p.name}`;
 $('customer').textContent=ticket.customer;$('code').textContent=result.code;
 $('share').disabled=result.status!=='available';
 $('reward-note').textContent=result.status==='replaced'?'Este cupom foi cancelado e um giro foi devolvido. Reabra o mesmo link para consultar.':result.status==='revoked'?'Compra cancelada ou fora das regras. Este vale não pode ser resgatado. Consulte a loja.':result.status==='expired'?'Este vale venceu e não pode ser resgatado.':campaign.test_mode?'Homologação: sem valor de resgate.':result.status==='redeemed'?`Resgatado em ${dateTime(result.redeemed_at)}.`:`Apresente este vale na loja até ${dateTime(result.expires_at)}. Uso único. Horário de Brasília.`;
 if(result.status==='available')$('reward-note').textContent+=p.unlimited_units?' Desconto somente neste modelo, em quantas unidades quiser nesta compra. Uso único, sem acumular.':p.benefit_type==='percent'&&p.benefit_value===100?' Prêmio grátis de uma unidade.':'';
 if(p.loja)$('reward-note').textContent+=` Retirada somente em ${p.loja}.`;
 $('receipt-content').hidden=true;$('receipt').textContent='Ver meu comprovante';
 $('spin-label').textContent='OFERTA REVELADA';$('spin').disabled=true;
 document.querySelector('.attempt-token').textContent='0';$('attempt-label').textContent='giros disponíveis';
 $('expiry').textContent=`Vale válido até ${dateTime(result.expires_at)}.${p.loja?' Retirada em '+p.loja+'.':''}`;
 $('status').textContent='Seu resultado está salvo. Você pode abrir este link novamente para consultar.';
 $('scene-label').textContent=`O caldeirão escolheu: ${p.name}!`;
 $('view-result').hidden=false;celebrate(rare);if(!$('result').open)$('result').showModal();
}
$('spin').onclick=async()=>{
 if(busy||!ticket||ticket.status!=='available')return;
 busy=true;$('spin').disabled=true;$('scene').setAttribute('aria-busy','true');$('spin-label').textContent='PREPARANDO A MAGIA…';$('status').textContent='Confirmando seu giro…';
 try{
  result=await rpc('spin',{p_token:token});ticket.status='used';document.body.classList.add('spinning');
  $('wheel').style.transform=`rotate(${2520-products.findIndex(p=>p.id===result.offer.id)*360/products.length}deg)`;
  $('status').textContent='A bruxa está misturando sua sorte…';$('scene-label').textContent='Sua oferta está chegando!';
  let tick=0;const timer=setInterval(()=>tone(180+(tick++%8)*48,.14),260);
  await new Promise(resolve=>setTimeout(resolve,5000));clearInterval(timer);showResult();[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.5),i*130));
 }catch(error){$('status').textContent=error.message;$('spin-label').textContent='TENTAR NOVAMENTE';$('spin').disabled=false;}
 finally{busy=false;$('scene').setAttribute('aria-busy','false');}
};
$('close').onclick=()=>$('result').close();$('view-result').onclick=()=>showResult();
$('result').addEventListener('close',()=>$('view-result').focus({preventScroll:true}));
$('receipt').onclick=()=>{const p=result.offer,d=$('receipt-content');d.hidden=!d.hidden;$('receipt').textContent=d.hidden?'Ver meu comprovante':'Ocultar comprovante';d.textContent=`${campaign.test_mode?'HOMOLOGAÇÃO — SEM VALOR DE RESGATE':'VALE TECNOCELL'} · ${ticket.customer} · ${benefit(result.offer)} em ${result.offer.name} · ${result.code} · Emitido: ${dateTime(result.created_at)} · Validade: ${dateTime(result.expires_at)} · Uso único${p.unlimited_units?' · Desconto somente no modelo indicado, em quantas unidades quiser nesta compra. Sem acumular.':p.benefit_type==='percent'&&p.benefit_value===100?' · Prêmio grátis de uma unidade.':' · Benefício somente no modelo indicado, conforme o valor deste vale.'}${p.loja?' · Retirada em '+p.loja+'.':''}`;};
$('share').onclick=()=>{const text=`${campaign.test_mode?'TESTE SEM VALOR DE RESGATE — ':''}Minha oferta Halloween TECNOCELL: ${benefit(result.offer)} em ${result.offer.name}. Código: ${result.code}. Válido até ${dateTime(result.expires_at)}. Uso único na loja.`;window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');};
for(let i=0;i<18;i++){const dot=document.createElement('i');dot.className='particle';for(const[k,v]of Object.entries({x:`${30+i*17%43}%`,size:`${2+i%3}px`,delay:`${-i*.37}s`,duration:`${3+i%4}s`,drift:`${i%2?25:-25}px`}))dot.style.setProperty(`--${k}`,v);$('particles').append(dot);}
async function load(){
 if(loading||busy)return;loading=true;
 try{
  if(token){ticket=await rpc('ticket',{p_token:token});campaign=ticket.campaign;}else campaign=await rpc('catalog',{p_campaign:campaignId});
  if(!campaign)throw new Error('Campanha não encontrada.');products=campaign.products;render();
  if(ticket?.result){result=ticket.result;showResult();}
  else {
   result=null;document.body.classList.remove('revealed','spinning');$('view-result').hidden=true;$('floating').replaceChildren();$('wheel').style.transform='';
   if($('result').open)$('result').close();
   $('status').textContent=ticket?.status==='revoked'?'Este giro foi cancelado. Consulte a loja.':ticket?.status==='expired'?'Seu prazo de 48 horas para girar terminou.':ticket?.status==='paused'?'A campanha está pausada. Consulte a loja.':campaign.active&&campaign.can_spin===false?'Sem cupons disponíveis para este giro. Ele não foi consumido; consulte a loja antes do vencimento.':ticket?`Olá, ${ticket.customer}! ${ticket.replacement?'Seu giro foi devolvido com novas 48 horas.':'Seu giro está pronto.'}`:campaign.participation_open?'Comprou R$ 200 ou mais? Peça seu link exclusivo na loja.':campaign.ends_at&&Date.now()>=Date.parse(campaign.ends_at)?'O período de compras da campanha terminou. Giros e vales emitidos continuam com sua validade.':'Estamos preparando a campanha. A liberação dos giros será feita na loja.';
  }
 }catch(error){$('status').textContent=error.message;$('spin').disabled=true;$('spin-label').textContent='GIRO INDISPONÍVEL';}
 finally{loading=false;}
}
load();
const availabilityRefresh=document.createElement('button');availabilityRefresh.className='text-button';availabilityRefresh.textContent='Atualizar meu giro';availabilityRefresh.onclick=()=>{if(!busy)load();};$('expiry').after(availabilityRefresh);
addEventListener('pageshow',event=>{if(event.persisted&&!busy)load();});
