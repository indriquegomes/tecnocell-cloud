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
 const slots=products.length?products:Array.from({length:13},(_,i)=>({id:i+1}));
 const segment=360/slots.length,colors=['#496d6a','#855580','#c3854b','#4c618c','#90627e','#be9652','#9b8d47'];
 $('wheel').style.background=`conic-gradient(from -${segment/2}deg,${slots.map((_,i)=>`${colors[i%colors.length]} ${i*segment}deg ${(i+1)*segment}deg`).join(',')})`;
 $('wheel').replaceChildren(...slots.map((_,i)=>{const item=document.createElement('span');item.className='wheel-item';item.style.setProperty('--angle',`${i*segment}deg`);item.textContent='✦';item.setAttribute('aria-hidden','true');return item;}));
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
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
function receiptState(){
 if(result.status!=='available')return result.status;
 return !Number.isFinite(Date.parse(result.expires_at))||Date.parse(result.expires_at)<=Date.now()?'expired':'available';
}
function receiptConditions(){
 const p=result.offer;
 return (p.unlimited_units?'Desconto somente no modelo indicado, em quantas unidades quiser nesta compra.':p.benefit_type==='percent'&&p.benefit_value===100?'Prêmio grátis: uma unidade. Não exige nova compra.':'Benefício somente no modelo indicado, conforme o valor deste vale.')+' Uso único. Sem acumular com outros vales ou promoções.';
}
function receiptStatus(state=receiptState()){
 return ({available:'DISPONÍVEL PARA RETIRADA',redeemed:'RESGATADO — não pode ser usado novamente.',expired:'VENCIDO — não pode ser resgatado.',revoked:'CANCELADO — não pode ser resgatado.',replaced:'CANCELADO — giro devolvido; este código não pode ser resgatado.'})[state]||'SITUAÇÃO NÃO CONFIRMADA — consulte a loja da compra.';
}
function receiptText(state=receiptState()){
 const store=clean(result.pickup_store?.name)||'Não informada — contate a loja da compra.';
 return [campaign.test_mode?'TESTE — SEM VALOR DE RESGATE':'COMPROVANTE HALLOWEEN TECNOCELL',
  `Cliente: ${clean(ticket.customer)}`,`Produto/modelo: ${clean(result.offer.name)}`,`Benefício: ${benefit(result.offer)}`,
  `Código do vale: ${clean(result.code)}`,`Situação: ${receiptStatus(state)}`,
  `Validade: ${dateTime(result.expires_at)} (horário de Brasília)`,`Loja de retirada: ${store}`,receiptConditions()].join('\n');
}
function storePhone(value){
 if(typeof value!=='string'||! /^(?:\+|00)?[\d\s().-]+$/.test(value.trim()))return null;
 let digits=value.replace(/\D/g,'');if(digits.startsWith('0055'))digits=digits.slice(2);
 if(digits.length===10||digits.length===11)digits='55'+digits;
 if(!/^55\d{2}(?:9\d{8}|[2-5]\d{7})$/.test(digits))return null;
 const ddd=digits.slice(2,4);
 if(!'11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' ').includes(ddd))return null;
 return digits;
}
function renderReceipt(){
 const state=receiptState(),store=result.pickup_store,phone=storePhone(store?.whatsapp),name=clean(store?.name);
 $('receipt-content').textContent=receiptText();
 $('share').textContent=name?`Enviar para ${name}`:'Enviar para a loja da compra';
 $('share').hidden=state!=='available'||!name||!phone;$('share').disabled=$('share').hidden;
 $('store-contact-note').textContent=state!=='available'?receiptStatus(state):!name||!phone?'WhatsApp desta unidade não informado ou inválido. Copie o comprovante e contate a loja da compra.':'O WhatsApp abrirá com o comprovante. Revise a mensagem e toque em enviar na conversa.';
}
async function refreshReceipt(){
 const current=await rpc('ticket',{p_token:token});
 if(current.result?.code===result.code){ticket=current;campaign=current.campaign;result=current.result;}
 else result={...result,status:current.status==='revoked'?'revoked':'replaced'};
 showResult(false);
}
function showResult(animate=true){
 const p=result.offer,rare=p.id>=12,pickup=clean(result.pickup_store?.name);
 $('result-mode').hidden=!campaign.test_mode;
 document.body.classList.remove('spinning');document.body.classList.add('revealed');
 $('floating').replaceChildren(productArt(p.name));$('reward-icon').replaceChildren(productArt(p.name));
 $('rarity').textContent=result.status==='replaced'?'CUPOM CANCELADO':result.status==='revoked'?'VALE CANCELADO':result.status==='redeemed'?'VALE JÁ RESGATADO':result.status==='expired'?'VALE VENCIDO':rare?'OFERTA ESPECIAL':'SUA OFERTA';
 $('result').classList.toggle('rare-result',rare);$('reward-title').textContent=`${benefit(p)} · ${p.name}`;
 $('customer').textContent=ticket.customer;$('code').textContent=result.code;
 $('reward-note').textContent=result.status==='replaced'?'Este cupom foi cancelado e um giro foi devolvido. Reabra o mesmo link para consultar.':result.status==='revoked'?'Compra cancelada ou fora das regras. Este vale não pode ser resgatado. Consulte a loja.':result.status==='expired'?'Este vale venceu e não pode ser resgatado.':campaign.test_mode?'Homologação: sem valor de resgate.':result.status==='redeemed'?`Resgatado em ${dateTime(result.redeemed_at)}.`:`Apresente este vale na loja até ${dateTime(result.expires_at)}. Uso único. Horário de Brasília.`;
 if(result.status==='available')$('reward-note').textContent+=p.unlimited_units?' Desconto somente neste modelo, em quantas unidades quiser nesta compra. Uso único, sem acumular.':p.benefit_type==='percent'&&p.benefit_value===100?' Prêmio grátis de uma unidade.':'';
 if(pickup)$('reward-note').textContent+=` Retirada somente em ${pickup}.`;
 renderReceipt();$('receipt-content').hidden=false;$('receipt').textContent='Ocultar comprovante';$('copy-status').textContent='';
 if(receiptState()!=='available'){$('rarity').textContent=receiptStatus();$('reward-note').textContent=receiptStatus();}
 if(campaign.test_mode)$('reward-note').textContent='TESTE — SEM VALOR DE RESGATE. '+$('reward-note').textContent;
 $('spin-label').textContent='OFERTA REVELADA';$('spin').disabled=true;
 document.querySelector('.attempt-token').textContent='0';$('attempt-label').textContent='giros disponíveis';
 $('expiry').textContent=`${receiptState()==='available'?'Vale válido até':'Validade do vale:'} ${dateTime(result.expires_at)}.${pickup?' Retirada em '+pickup+'.':''}`;
 $('status').textContent='Seu resultado está salvo. Você pode abrir este link novamente para consultar.';
 $('scene-label').textContent=`O caldeirão escolheu: ${p.name}!`;
 $('view-result').hidden=false;if(animate)celebrate(rare);if(!$('result').open)$('result').showModal();
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
$('receipt').onclick=()=>{renderReceipt();const d=$('receipt-content');d.hidden=!d.hidden;$('receipt').textContent=d.hidden?'Ver meu comprovante':'Ocultar comprovante';};
let receiptBusy=false;
async function receiptAction(action){
 if(receiptBusy||!result)return;receiptBusy=true;$('copy-receipt').disabled=true;$('share').disabled=true;
 try{
  await refreshReceipt();
  const text=receiptText();
  if(action==='copy'){
   try{await navigator.clipboard.writeText(text);$('copy-status').textContent='Comprovante copiado!';}
   catch{$('receipt-content').hidden=false;$('receipt').textContent='Ocultar comprovante';$('copy-status').textContent='Não foi possível copiar automaticamente. Selecione o comprovante abaixo e copie o texto.';}
  }else{
   const phone=storePhone(result.pickup_store?.whatsapp);
   if(receiptState()!=='available'||!clean(result.pickup_store?.name)||!phone)return;
   const opened=window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
   if(!opened)$('copy-status').textContent='Se a conversa não abrir, permita a abertura no navegador ou copie o comprovante.';
  }
 }catch{
  $('receipt-content').textContent=receiptText(receiptState()==='available'?'unconfirmed':receiptState());$('receipt-content').hidden=false;$('receipt').textContent='Ocultar comprovante';$('share').hidden=true;
  $('store-contact-note').textContent='Confirme a situação com a loja da compra antes de solicitar a retirada.';
  $('copy-status').textContent='Não foi possível atualizar a situação do vale. Confira sua conexão e tente novamente; o comprovante abaixo pode ser selecionado.';
 }finally{receiptBusy=false;$('copy-receipt').disabled=false;$('share').disabled=$('share').hidden;}
}
$('copy-receipt').onclick=()=>receiptAction('copy');
$('share').onclick=()=>receiptAction('share');
for(let i=0;i<18;i++){const dot=document.createElement('i');dot.className='particle';for(const[k,v]of Object.entries({x:`${30+i*17%43}%`,size:`${2+i%3}px`,delay:`${-i*.37}s`,duration:`${3+i%4}s`,drift:`${i%2?25:-25}px`}))dot.style.setProperty(`--${k}`,v);$('particles').append(dot);}
async function load(){
 if(loading||busy||receiptBusy)return;loading=true;
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
