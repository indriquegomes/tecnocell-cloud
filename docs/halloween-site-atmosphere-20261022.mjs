// Quiet, original Halloween ambience. Created only after a deliberate sound click.
export function createSoundscape(button,label){
 let context,master,enabled=false,changing=false,interval,beat=0;
 const sources=new Set();
 function updateLabel(){
  label.textContent=enabled?'Som ligado':'Som desligado';
  button.setAttribute('aria-pressed',String(enabled));
  button.setAttribute('aria-label',enabled?'Silenciar ambiente de Halloween':'Ativar ambiente de Halloween');
  button.title='Vento, grilos, borbulhas e risadinha de bruxa. Volume suave.';
 }
 function connect(source,output){
  source.connect(output);sources.add(source);
  source.onended=()=>{sources.delete(source);source.disconnect();output.disconnect();};
 }
 function note(frequency,duration=.18,volume=.04,type='sine',delay=0,endFrequency=frequency){
  if(!enabled||document.hidden||context?.state!=='running')return;
  const now=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();
  osc.type=type;osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  connect(osc,gain);gain.connect(master);osc.start(now);osc.stop(now+duration+.02);
 }
 function cackle(){
  if(!enabled||document.hidden||context?.state!=='running')return;
  const now=context.currentTime,voice=context.createOscillator(),gain=context.createGain();
  voice.type='sawtooth';gain.gain.value=0;
  [0,.2,.43,.69,.98].forEach((offset,i)=>{
   const t=now+offset,duration=i===4?.35:.16;
   voice.frequency.setValueAtTime(430-i*29,t);voice.frequency.exponentialRampToValueAtTime(260-i*15,t+duration);
   gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(.018,t+.035);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  });
  const vowel=context.createBiquadFilter();vowel.type='bandpass';vowel.frequency.value=1100;vowel.Q.value=1.3;
  connect(voice,gain);gain.connect(vowel);vowel.connect(master);voice.onended=()=>{sources.delete(voice);voice.disconnect();gain.disconnect();vowel.disconnect();};
  voice.start(now);voice.stop(now+1.4);
 }
 function phrase(){
  if(!enabled||document.hidden||context?.state!=='running')return;
  // Sparse crickets and two low bubbles leave plenty of silence.
  for(let i=0;i<3;i++)note(4100,.075,.009,'sine',i*.13,4350);
  note(170,.28,.035,'sine',.9,68);note(220,.22,.025,'sine',1.4,82);
  if(beat===2||beat>2&&(beat-2)%12===0)cackle();
  beat++;
 }
 function start(){
  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
  let brown=0;for(let i=0;i<data.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;data[i]=brown*3;}
  const wind=context.createBufferSource(),filter=context.createBiquadFilter(),volume=context.createGain();
  wind.buffer=buffer;wind.loop=true;filter.type='lowpass';filter.frequency.value=450;volume.gain.value=.12;
  wind.connect(filter);filter.connect(volume);volume.connect(master);sources.add(wind);
  wind.onended=()=>{sources.delete(wind);wind.disconnect();filter.disconnect();volume.disconnect();};wind.start();
  phrase();interval=setInterval(phrase,4000);
 }
 function stop(){
  clearInterval(interval);interval=undefined;
  if(!context)return;
  master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);
  for(const source of sources){try{source.stop();}catch{}}
  sources.clear();
  void context.suspend().catch(()=>{});
 }
 async function sync(){
  if(!enabled||document.hidden){stop();return;}
  context??=new (window.AudioContext||window.webkitAudioContext)();
  if(!master){master=context.createGain();master.gain.value=0;master.connect(context.destination);}
  await context.resume();
  if(!enabled||document.hidden){stop();return;}
  if(interval!==undefined)return;
  master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);master.gain.linearRampToValueAtTime(.4,context.currentTime+.5);
  start();
 }
 async function refresh(){try{await sync();updateLabel();}catch{enabled=false;stop();updateLabel();label.textContent='Som indisponível';}}
 button.onclick=async()=>{
  if(changing)return;changing=true;button.disabled=true;enabled=!enabled;
  try{await refresh();}finally{changing=false;button.disabled=false;}
 };
 document.addEventListener('visibilitychange',refresh);
 window.addEventListener('pagehide',stop);window.addEventListener('pageshow',refresh);
 updateLabel();
 return {tone:(frequency,duration)=>note(frequency,duration)};
}
