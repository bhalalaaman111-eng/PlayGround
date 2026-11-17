(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const COLS = 17, ROWS = 14, TW = 58, TH = 30;
  const $ = id => document.getElementById(id);
  const blueprints = [
    {id:'beacon',name:'Wind beacon',icon:'◈',desc:'A lantern to guide lost travelers.',cost:{wood:3,stone:2,essence:1}},
    {id:'cottage',name:'Cloud cottage',icon:'⌂',desc:'A cozy place to rest and dream.',cost:{wood:4,stone:1}},
    {id:'garden',name:'Sky garden',icon:'❀',desc:'A bright patch for island flowers.',cost:{wood:2,stone:1}},
    {id:'windmill',name:'Petal windmill',icon:'✣',desc:'Catch the breeze and make it sing.',cost:{wood:3,stone:2}}
  ];
  const skins = [
    {id:'wanderer',name:'Island wanderer',icon:'◉',cost:0},
    {id:'saffron',name:'Saffron festival',icon:'✺',cost:60},
    {id:'royal',name:'Royal skyguard',icon:'♜',cost:140}
  ];
  const nodeSeeds = [
    ['wood',3,4],['wood',5,9],['wood',7,3],['wood',11,4],['wood',13,8],['wood',4,11],['wood',10,11],['wood',14,5],
    ['stone',2,7],['stone',6,6],['stone',12,6],['stone',14,10],['stone',8,11],['stone',3,9],['stone',11,2],
    ['essence',7,2],['essence',12,9],['essence',5,4],['essence',9,10]
  ];
  const base = {
    player:{x:8,y:7}, resources:{wood:0,stone:0,essence:0}, stars:30, stage:0,
    nodes:nodeSeeds.map(([type,x,y],i)=>({id:i,type,x,y,gathered:false})),
    buildings:[], skin:'wanderer', owned:['wanderer'], day:1, journal:[], glider:false
  };
  let state = loadState(), keys = new Set(), touchDirs = new Set(), lastTime = 0, toastTimer, selected = null, buildMode = false, soundOn = false;
  let view = {scale:1, cx:0, cy:0, width:0, height:0}, nearby = null, showMap = false;
  const land = (x,y) => {
    if(x<0||y<0||x>=COLS||y>=ROWS) return false;
    const nx=(x-8)/8.5, ny=(y-6.5)/7;
    const r=nx*nx+ny*ny;
    const waviness=.09*Math.sin(x*1.6+y*.8)+.06*Math.cos(y*2.2-x*.65);
    return r < 1.03 + waviness && !(x<3&&y<3) && !(x>14&&y<3) && !(x<2&&y>10);
  };
  function loadState(){
    try {const saved=JSON.parse(localStorage.getItem('cloudhaven-save')); if(saved&&saved.player&&Array.isArray(saved.nodes)) return {...structuredClone(base),...saved,resources:{...base.resources,...saved.resources}};}catch(e){}
    return structuredClone(base);
  }
  function save(){try{localStorage.setItem('cloudhaven-save',JSON.stringify(state));}catch(e){}}
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100)}
  function setJournal(title,text){state.journal.unshift({title,text,time:`DAY ${String(state.day).padStart(2,'0')}`});state.journal=state.journal.slice(0,8);save()}
  function openModal(title,copy,eyebrow='A NOTE FROM THE WIND'){$('modal-title').textContent=title;$('modal-copy').textContent=copy;$('modal-eyebrow').textContent=eyebrow;$('modal-backdrop').hidden=false}
  function closeModal(){$('modal-backdrop').hidden=true}
  function drawSky(t){
    const g=ctx.createLinearGradient(0,0,0,view.height);g.addColorStop(0,'#83bdc1');g.addColorStop(.52,'#b5d5c9');g.addColorStop(1,'#e0d9b8');ctx.fillStyle=g;ctx.fillRect(0,0,view.width,view.height);
    const sun=ctx.createRadialGradient(view.width*.79,view.height*.2,3,view.width*.79,view.height*.2,130);sun.addColorStop(0,'rgba(255,244,198,.48)');sun.addColorStop(1,'rgba(255,244,198,0)');ctx.fillStyle=sun;ctx.fillRect(0,0,view.width,view.height);
    for(let i=0;i<9;i++){let x=((i*197+(t*.004*(i%2?1:-1))+view.width*1.4)%(view.width+220))-110;let y=80+(i*83%Math.max(150,view.height*.62));drawCloud(x,y,.6+(i%3)*.14,.12+(i%4)*.025)}
    // far islands floating in the haze
    for(let i=0;i<3;i++){const x=view.width*(.13+i*.38),y=view.height*(.26+(i%2)*.1);ctx.fillStyle='rgba(77,130,133,.18)';ctx.beginPath();ctx.ellipse(x,y,62+i*13,12+i*2,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(x-45,y);ctx.lineTo(x-25,y+27);ctx.lineTo(x+25,y+27);ctx.lineTo(x+49,y);ctx.fill()}
  }
  function drawCloud(x,y,s,a){ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#f4f3df';ctx.beginPath();ctx.ellipse(x,y,45*s,12*s,0,0,Math.PI*2);ctx.ellipse(x-17*s,y-7*s,20*s,13*s,0,0,Math.PI*2);ctx.ellipse(x+9*s,y-10*s,25*s,17*s,0,0,Math.PI*2);ctx.fill();ctx.restore()}
  function iso(x,y,z=0){return {x:(x-y)*TW/2,y:(x+y)*TH/2-z}}
  function tileCenter(x,y,z=0){const p=iso(x,y,z);return {x:view.cx+p.x*view.scale,y:view.cy+p.y*view.scale}}
  function diamond(x,y,fill,stroke){ctx.beginPath();ctx.moveTo(x,y-TH/2);ctx.lineTo(x+TW/2,y);ctx.lineTo(x,y+TH/2);ctx.lineTo(x-TW/2,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
  function renderIsland(t){
    const pts=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)if(land(x,y))pts.push({x,y});
    // soft island shadow and rocky underside
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#224f58';ctx.beginPath();ctx.ellipse(view.cx,view.cy+view.scale*205,view.scale*340,view.scale*58,0,0,Math.PI*2);ctx.fill();ctx.restore();
    // hanging rock silhouette
    const corners=[[-.8,0],[0,-.8],[.8,0],[0,.8]];ctx.beginPath();corners.forEach(([x,y],i)=>{const xx=view.cx+x*view.scale*510, yy=view.cy+view.scale*60+y*view.scale*230+(y>0?view.scale*110:0);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.closePath();const rock=ctx.createLinearGradient(0,view.cy,0,view.cy+view.scale*300);rock.addColorStop(0,'#796d58');rock.addColorStop(.35,'#655d51');rock.addColorStop(1,'#36464a');ctx.fillStyle=rock;ctx.fill();
    pts.sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    for(const p of pts){const c=tileCenter(p.x,p.y);const edge= !land(p.x,p.y+1);if(edge){ctx.save();ctx.globalAlpha=.22;diamond(c.x,c.y+4*view.scale,'#334d49');ctx.restore()}
      let color=((p.x*3+p.y*7)%7===0)?'#82aa83':((p.x+p.y)%5===0?'#8fb58b':'#88af86');if((p.x+p.y)%11===0)color='#94b78d';diamond(c.x,c.y,color,'rgba(47,83,66,.13)');
      if((p.x*13+p.y*7)%31===2 && !occupied(p.x,p.y)){ctx.fillStyle='rgba(248,226,161,.65)';ctx.beginPath();ctx.arc(c.x-6*view.scale,c.y-2*view.scale,1.3*view.scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(237,185,180,.7)';ctx.beginPath();ctx.arc(c.x+7*view.scale,c.y+4*view.scale,1.2*view.scale,0,Math.PI*2);ctx.fill()}
    }
    // winding stone trail
    const trail=[[7,7],[7,8],[8,8],[9,8],[9,7],[9,6],[8,6]];for(const [x,y] of trail){const c=tileCenter(x,y);diamond(c.x,c.y-1*view.scale,'#b6ad91','rgba(84,84,66,.2)');ctx.beginPath();ctx.ellipse(c.x,c.y-2*view.scale,9*view.scale,4*view.scale,-.3,0,Math.PI*2);ctx.fillStyle='#c9bea0';ctx.fill()}
    // island home hearth
    drawBuilding({id:'home',type:'home',x:8,y:7});
    const drawables=[];for(const n of state.nodes)if(!n.gathered)drawables.push({kind:'node',item:n,depth:n.x+n.y});for(const b of state.buildings)drawables.push({kind:'building',item:b,depth:b.x+b.y});drawables.push({kind:'player',depth:state.player.x+state.player.y});drawables.sort((a,b)=>a.depth-b.depth);
    for(const d of drawables){if(d.kind==='node')drawNode(d.item,t);else if(d.kind==='building')drawBuilding(d.item);else drawPlayer(t)}
    if(buildMode&&selected){for(const p of pts){if(canBuildAt(p.x,p.y)){const c=tileCenter(p.x,p.y);ctx.save();ctx.globalAlpha=.58;diamond(c.x,c.y,'rgba(221,235,188,.42)','#e9d8a1');ctx.restore()}}}
    if(showMap)drawMapInset();
  }
  function occupied(x,y){return state.nodes.some(n=>!n.gathered&&n.x===x&&n.y===y)||state.buildings.some(b=>b.x===x&&b.y===y)||(x===8&&y===7)}
  function drawNode(n,t){const c=tileCenter(n.x,n.y);ctx.save();ctx.translate(c.x,c.y);ctx.scale(view.scale,view.scale);const sway=Math.sin(t*.002+n.id)*1.5;
    if(n.type==='wood'){
      ctx.fillStyle='rgba(32,59,48,.2)';ctx.beginPath();ctx.ellipse(0,0,16,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#79563a';ctx.fillRect(-3,-15,6,17);ctx.fillStyle='#4b7554';ctx.beginPath();ctx.arc(0,-29+sway,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#628d61';ctx.beginPath();ctx.arc(-7,-34+sway,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7fa575';ctx.beginPath();ctx.arc(5,-38+sway,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(195,218,156,.65)';ctx.beginPath();ctx.arc(-4,-39+sway,2,0,Math.PI*2);ctx.fill();
    }else if(n.type==='stone'){
      ctx.fillStyle='rgba(36,55,50,.18)';ctx.beginPath();ctx.ellipse(0,0,16,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#75857e';ctx.beginPath();ctx.moveTo(-14,-3);ctx.lineTo(-9,-16);ctx.lineTo(-2,-21);ctx.lineTo(9,-17);ctx.lineTo(15,-3);ctx.closePath();ctx.fill();ctx.fillStyle='#9eaaa0';ctx.beginPath();ctx.moveTo(-9,-13);ctx.lineTo(-2,-21);ctx.lineTo(3,-18);ctx.lineTo(0,-10);ctx.closePath();ctx.fill();ctx.fillStyle='#60726d';ctx.beginPath();ctx.moveTo(2,-10);ctx.lineTo(9,-17);ctx.lineTo(15,-3);ctx.closePath();ctx.fill();
    }else{
      const pulse=1+Math.sin(t*.003+n.id)*.08;ctx.globalAlpha=.22;ctx.fillStyle='#d9cff8';ctx.beginPath();ctx.arc(0,-12,21*pulse,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#796ca7';ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(-7,-18);ctx.lineTo(-2,-31);ctx.lineTo(3,-16);ctx.lineTo(10,-5);ctx.closePath();ctx.fill();ctx.fillStyle='#d2c4fa';ctx.beginPath();ctx.moveTo(-7,-18);ctx.lineTo(-2,-31);ctx.lineTo(0,-14);ctx.lineTo(-5,-10);ctx.closePath();ctx.fill();ctx.fillStyle='#a89bd9';ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(3,-16);ctx.lineTo(10,-5);ctx.closePath();ctx.fill();
    }ctx.restore()}
  function drawBuilding(b){const c=tileCenter(b.x,b.y);ctx.save();ctx.translate(c.x,c.y);ctx.scale(view.scale,view.scale);
    if(b.type==='home'||b.type==='cottage'){
      ctx.fillStyle='rgba(35,58,50,.22)';ctx.beginPath();ctx.ellipse(0,0,23,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b7986a';ctx.fillRect(-14,-18,28,18);ctx.fillStyle='#e7d2a4';ctx.beginPath();ctx.moveTo(-19,-18);ctx.lineTo(0,-35);ctx.lineTo(19,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#9c6856';ctx.beginPath();ctx.moveTo(-6,-18);ctx.lineTo(0,-30);ctx.lineTo(6,-18);ctx.closePath();ctx.fill();ctx.fillStyle='#65564a';ctx.fillRect(-3,-10,7,10);ctx.fillStyle='#f6d395';ctx.fillRect(8,-13,4,5);
    }else if(b.type==='beacon'){
      ctx.fillStyle='rgba(35,58,50,.23)';ctx.beginPath();ctx.ellipse(0,0,18,6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#787b70';ctx.fillRect(-10,-19,20,19);ctx.fillStyle='#a5a38c';ctx.fillRect(-7,-22,14,4);ctx.fillStyle='#8c7564';ctx.fillRect(-5,-31,10,9);ctx.fillStyle='#f7d893';ctx.shadowColor='#ffe5a0';ctx.shadowBlur=16;ctx.beginPath();ctx.arc(0,-35,7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#f7e6bd';ctx.beginPath();ctx.moveTo(0,-49);ctx.lineTo(4,-39);ctx.lineTo(0,-32);ctx.lineTo(-4,-39);ctx.closePath();ctx.fill();
    }else if(b.type==='garden'){
      ctx.fillStyle='#a47550';ctx.fillRect(-18,-9,36,9);ctx.fillStyle='#6b8c5c';ctx.fillRect(-16,-7,32,5);for(let i=0;i<5;i++){const x=-12+i*6;ctx.strokeStyle='#54734f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,-3);ctx.lineTo(x,-12-(i%2)*3);ctx.stroke();ctx.fillStyle=['#e9b5a3','#e7d28f','#c4b8e3'][i%3];ctx.beginPath();ctx.arc(x,-13-(i%2)*3,3,0,Math.PI*2);ctx.fill()}
    }else if(b.type==='windmill'){
      ctx.fillStyle='#806d58';ctx.beginPath();ctx.moveTo(-5,-1);ctx.lineTo(-3,-26);ctx.lineTo(3,-26);ctx.lineTo(6,-1);ctx.closePath();ctx.fill();ctx.fillStyle='#d5c4a0';ctx.beginPath();ctx.arc(0,-27,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e9dfc4';ctx.lineWidth=3;for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.moveTo(Math.cos(a)*3,-27+Math.sin(a)*3);ctx.lineTo(Math.cos(a)*17,-27+Math.sin(a)*17);ctx.stroke()}
    }ctx.restore()}
  function drawPlayer(t){const c=tileCenter(state.player.x,state.player.y,0);ctx.save();ctx.translate(c.x,c.y);ctx.scale(view.scale,view.scale);const moving=keys.size+touchDirs.size>0, bob=moving?Math.sin(t*.018)*1.5:Math.sin(t*.003)*.7;
    ctx.fillStyle='rgba(30,53,48,.22)';ctx.beginPath();ctx.ellipse(0,0,11,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=state.skin==='saffron'?'#d18b53':state.skin==='royal'?'#596b9e':'#547e71';ctx.beginPath();ctx.ellipse(0,-10+bob,8,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#e9c79d';ctx.beginPath();ctx.arc(0,-23+bob,7,0,Math.PI*2);ctx.fill();ctx.fillStyle=state.skin==='royal'?'#e7d49e':state.skin==='saffron'?'#754d45':'#544b47';ctx.beginPath();ctx.arc(0,-25+bob,7,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#4f5047';ctx.fillRect(-2,-22+bob,1.3,1.3);ctx.fillRect(2,-22+bob,1.3,1.3);
    if(state.glider){ctx.strokeStyle='#f0dfa9';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-34+bob,11,Math.PI,Math.PI*2);ctx.stroke()}
    ctx.restore()}
  function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);view.width=r.width;view.height=r.height;const boundsW=(COLS+ROWS)*TW/2,boundsH=(COLS+ROWS)*TH/2;view.scale=Math.min((r.width-60)/boundsW,(r.height-100)/(boundsH+120),1.2);view.cx=r.width/2;view.cy=Math.max(210,(r.height-boundsH*view.scale)/2+view.scale*45);if(r.width<800){view.scale=Math.min(view.scale,.91);view.cy=Math.max(205,(r.height-boundsH*view.scale)/2+view.scale*25)}}
  function frame(t){const dt=Math.min(.04,(t-lastTime)/1000||0);lastTime=t;update(dt);drawSky(t);ctx.save();ctx.translate(0,0);renderIsland(t);ctx.restore();requestAnimationFrame(frame)}
  function update(dt){let dx=0,dy=0;const has=k=>keys.has(k)||touchDirs.has(k);
    if(has('w')){dx--;dy--}if(has('s')){dx++;dy++}if(has('a')){dx--;dy++}if(has('d')){dx++;dy--}
    if(dx||dy){const len=Math.hypot(dx,dy),speed=2.65*dt;dx=dx/len*speed;dy=dy/len*speed;movePlayer(dx,dy);}
    nearby=nearestNode();const hint=$('interaction-hint');if(nearby){hint.innerHTML=`<kbd>E</kbd> Gather ${nearby.type==='wood'?'wood':nearby.type==='stone'?'stone':'sky essence'}`;hint.classList.add('visible')}else hint.classList.remove('visible');
  }
  function movePlayer(dx,dy){const p=state.player;const nx=p.x+dx,ny=p.y+dy;if(land(nx,ny)&&!state.buildings.some(b=>Math.hypot(b.x-nx,b.y-ny)<.48)&&!(nx>7.5&&nx<8.5&&ny>6.5&&ny<7.5)){p.x=nx;p.y=ny;}}
  function nearestNode(){let best=null,dist=1.35;for(const n of state.nodes){if(n.gathered)continue;const d=Math.hypot(n.x-state.player.x,n.y-state.player.y);if(d<dist){dist=d;best=n}}return best}
  function gather(){const n=nearestNode();if(!n){toast('Nothing nearby to gather.');return}n.gathered=true;state.resources[n.type]++;const name=n.type==='wood'?'wood':n.type==='stone'?'stone':'sky essence';toast(`+1 ${name}`);if(n.type==='essence')setJournal('A piece of the sky',`You found a bright spark of sky essence near the old stones.`);checkQuest();save();refreshUI()}
  function canBuildAt(x,y){if(!land(x,y)||occupied(x,y))return false;return Math.hypot(x-state.player.x,y-state.player.y)>1.1}
  function canAfford(bp){return Object.entries(bp.cost).every(([k,v])=>state.resources[k]>=v)}
  function placeBuilding(x,y){if(!selected){toast('Choose a blueprint first.');return}const bp=blueprints.find(b=>b.id===selected);if(!bp||!canBuildAt(x,y)){toast('Choose an open tile on the island.');return}if(!canAfford(bp)){toast('Gather a few more materials first.');return}
    for(const [k,v] of Object.entries(bp.cost))state.resources[k]-=v;state.buildings.push({id:`b${Date.now()}`,type:bp.id,x,y});toast(`${bp.name} placed!`);setJournal('A new landmark',`You built a ${bp.name.toLowerCase()} at (${x+1}, ${y+1}).`);if(bp.id==='beacon'&&state.stage===1){state.stage=2;state.stars+=40;state.glider=true;openModal('The wind remembers','The beacon blooms with warm light. A little glider has appeared in your pack — press Space to drift over the island. You earned 40 star tokens.','TALE COMPLETE · CHAPTER 01');setJournal('The beacon wakes','Its light dances across the clouds. For a moment, the whole island seems to breathe.')}checkQuest();save();refreshUI();renderBlueprints()}
  function checkQuest(){
    if(state.stage===0&&state.resources.wood>=3&&state.resources.stone>=2&&state.resources.essence>=1){state.stage=1;state.stars+=20;toast('Materials gathered · +20 star tokens');setJournal('A wind in the ruins','You gathered the materials needed to restore the beacon.');}
    else if(state.stage===2&&state.buildings.filter(b=>b.type!=='beacon').length>=2){state.stage=3;state.stars+=60;toast('Island restored · +60 star tokens');setJournal('A home among the clouds','Two new landmarks make the island feel like home.');openModal('Your island is blooming','You have brought the beacon back, and the island is yours to shape. Keep exploring, gathering and building — the wind has more stories to tell.','ISLAND TALE · COMPLETE')}
  }
  function drawMapInset(){const w=120,h=95,x=view.width-145,y=view.height-154;ctx.fillStyle='rgba(17,34,41,.82)';ctx.strokeStyle='rgba(245,245,225,.35)';ctx.lineWidth=1;roundRect(ctx,x,y,w,h,10);ctx.fill();ctx.stroke();ctx.save();ctx.beginPath();ctx.rect(x+7,y+7,w-14,h-14);ctx.clip();ctx.fillStyle='#83a981';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,43,32,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d2c19a';ctx.fillRect(x+55,y+44,10,8);for(const n of state.nodes)if(!n.gathered){ctx.fillStyle=n.type==='wood'?'#476f53':n.type==='stone'?'#677671':'#b4a0d9';ctx.fillRect(x+15+n.x/17*90,y+11+n.y/14*65,3,3)}ctx.fillStyle='#f0d48d';ctx.beginPath();ctx.arc(x+15+state.player.x/17*90,y+11+state.player.y/14*65,3,0,Math.PI*2);ctx.fill();ctx.restore()}
  function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r)}
  function updateQuestUI(){
    const title=$('quest-title'),copy=$('quest-copy'),fill=$('quest-progress-fill'),text=$('quest-progress-text'),step=$('quest-step'),reward=$('reward-label');let progress=0;
    if(state.stage===0){title.textContent='A wind in the ruins';copy.textContent='Gather 3 wood, 2 stone, and 1 sky essence to relight the old beacon.';progress=Math.min(1,(Math.min(3,state.resources.wood)+Math.min(2,state.resources.stone)+Math.min(1,state.resources.essence))/6);text.textContent=`${Math.min(3,state.resources.wood)}/3 wood · ${Math.min(2,state.resources.stone)}/2 stone · ${Math.min(1,state.resources.essence)}/1 essence`;step.textContent='01 / 03';reward.textContent='✦ +20'}
    else if(state.stage===1){title.textContent='Light the beacon';copy.textContent='The old beacon is ready. Choose its blueprint and place it anywhere on open ground.';progress=.7;text.textContent='Choose Wind beacon in the workshop';step.textContent='02 / 03';reward.textContent='✦ +40'}
    else if(state.stage===2){title.textContent='Make yourself at home';copy.textContent='Add two more landmarks to make this little island feel like yours.';const n=state.buildings.filter(b=>b.type!=='beacon').length;progress=Math.min(1,n/2);text.textContent=`${Math.min(n,2)}/2 landmarks built`;step.textContent='03 / 03';reward.textContent='✦ +60'}
    else {title.textContent='A home among the clouds';copy.textContent='Your beacon is shining. Keep shaping the island and see what the wind brings.';progress=1;text.textContent='Island tale complete · keep building';step.textContent='✦ COMPLETE';reward.textContent='✦ '+state.stars}
    fill.style.width=`${Math.round(progress*100)}%`;$('wood-count').textContent=state.resources.wood;$('stone-count').textContent=state.resources.stone;$('crystal-count').textContent=state.resources.essence;$('day-label').textContent=`DAY ${String(state.day).padStart(2,'0')}`;
  }
  function renderBlueprints(){const el=$('blueprint-list');el.innerHTML='';for(const bp of blueprints){const card=document.createElement('button');card.className=`blueprint-card ${selected===bp.id?'selected':''}`;const costs=Object.entries(bp.cost).map(([k,v])=>`<em>${k==='wood'?'▰':k==='stone'?'◆':'✦'} ${v}</em>`).join('');card.innerHTML=`<span class="blueprint-art">${bp.icon}</span><span class="blueprint-copy"><b>${bp.name}</b><small>${bp.desc}</small><span class="cost">${costs}</span></span><span class="choose">${selected===bp.id?'SELECTED':'SELECT'}</span>`;card.addEventListener('click',()=>{selected=bp.id;buildMode=true;updatePanels();renderBlueprints();toast(`Tap open ground to place ${bp.name.toLowerCase()}.`)});el.appendChild(card)}} 
  function renderSkins(){const el=$('skin-list');el.innerHTML='';for(const skin of skins){const card=document.createElement('div');card.className='skin-card';const owned=state.owned.includes(skin.id),active=state.skin===skin.id;card.innerHTML=`<span class="skin-art">${skin.icon}</span><span class="skin-copy"><b>${skin.name}</b><small>${skin.cost===0?'Your original travel look':`✦ ${skin.cost} star tokens`}</small></span><button ${active?'disabled':''}>${active?'WEARING':owned?'WEAR':`✦ ${skin.cost}`}</button>`;card.querySelector('button').addEventListener('click',()=>{if(owned){state.skin=skin.id;toast(`${skin.name} equipped.`)}else if(state.stars>=skin.cost){state.stars-=skin.cost;state.owned.push(skin.id);state.skin=skin.id;toast(`${skin.name} unlocked!`)}else toast('Earn more star tokens by completing island tales.');save();renderSkins()});el.appendChild(card)}}
  function renderJournal(){const el=$('journal-content');el.innerHTML='';if(!state.journal.length){el.innerHTML='<div class="journal-entry"><span class="entry-time">DAY 01</span><b>A blank page</b>The island is quiet. Your story starts with a little exploring.</div>';return}for(const entry of state.journal){const d=document.createElement('div');d.className='journal-entry';d.innerHTML=`<span class="entry-time">${entry.time}</span><b>${entry.title}</b>${entry.text}`;el.appendChild(d)}}
  function updatePanels(){$('build-panel').classList.toggle('open',buildMode);$('build-panel').setAttribute('aria-hidden',String(!buildMode));$('build-label').classList.toggle('active',buildMode);$('build-btn').innerHTML=buildMode?'<span>×</span> CLOSE':'<span>＋</span> BUILD';$('wardrobe-panel').classList.toggle('open',document.body.dataset.panel==='wardrobe-panel');$('journal-panel').classList.toggle('open',document.body.dataset.panel==='journal-panel');}
  function toggleBuild(){buildMode=!buildMode;document.body.dataset.panel='';if(buildMode){selected=null;renderBlueprints()}updatePanels()}
  function playSound(freq=540){if(!soundOn)return;try{const AC=window.AudioContext||window.webkitAudioContext;const ac=new AC(),osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.055,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.16);osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+.17);osc.onended=()=>ac.close()}catch(e){}}
  function onCanvasClick(e){if(!buildMode||!selected)return;const r=canvas.getBoundingClientRect(),sx=(e.clientX-r.left-view.cx)/view.scale,sy=(e.clientY-r.top-view.cy)/view.scale;const tx=(sx/(TW/2)+sy/(TH/2))/2,ty=(sy/(TH/2)-sx/(TW/2))/2;const x=Math.round(tx),y=Math.round(ty);if(Math.hypot(tx-x,ty-y)>.62){toast('Tap closer to the center of a tile.');return}placeBuilding(x,y)}
  window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)){e.preventDefault();if(key==='arrowup')keys.add('w');else if(key==='arrowdown')keys.add('s');else if(key==='arrowleft')keys.add('a');else if(key==='arrowright')keys.add('d');else keys.add(key)}if(key==='e'||key==='enter'){if(!$('modal-backdrop').hidden)closeModal();else gather()}if(key==='b'){toggleBuild()}if(key===' '&&state.glider)toast('Glider open · catching the breeze!');if(key==='escape'){closeModal();if(buildMode){buildMode=false;updatePanels()}document.body.dataset.panel='';updatePanels()}});
  window.addEventListener('keyup',e=>{const key=e.key.toLowerCase();keys.delete(key);if(key.startsWith('arrow'))keys.delete(({arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'})[key])});
  window.addEventListener('blur',()=>{keys.clear();touchDirs.clear()});canvas.addEventListener('pointerdown',onCanvasClick);
  document.querySelectorAll('[data-dir]').forEach(btn=>{const dir=btn.dataset.dir;const k={up:'w',down:'s',left:'a',right:'d'}[dir];btn.addEventListener('pointerdown',e=>{e.preventDefault();touchDirs.add(k);btn.setPointerCapture(e.pointerId)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,()=>touchDirs.delete(k))});
  $('mobile-action').addEventListener('click',gather);$('build-btn').addEventListener('click',toggleBuild);$('map-btn').addEventListener('click',()=>{showMap=!showMap;$('map-btn').classList.toggle('map-active',showMap)});
  $('wardrobe-btn').addEventListener('click',()=>{document.body.dataset.panel='wardrobe-panel';buildMode=false;updatePanels();renderSkins()});$('journal-btn').addEventListener('click',()=>{document.body.dataset.panel='journal-panel';buildMode=false;updatePanels();renderJournal()});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.close;if(id==='build-panel')buildMode=false;document.body.dataset.panel='';updatePanels()}));
  $('help-btn').addEventListener('click',()=>openModal('A small guide to the sky','Move with WASD or the arrow keys (touch controls on mobile). Walk close to trees, stones, and glowing crystals, then press E or Gather. Tap Build, choose a blueprint, and place it on open ground. Your progress saves on this device.','HOW TO PLAY'));
  $('modal-close').addEventListener('click',closeModal);$('modal-ok').addEventListener('click',closeModal);$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal()});
  $('sound-btn').addEventListener('click',()=>{soundOn=!soundOn;$('sound-btn').style.color=soundOn?'#e7cb91':'';$('sound-btn').textContent=soundOn?'♫':'♩';toast(soundOn?'Island sounds on.':'Island sounds off.')});
  window.addEventListener('resize',resize);updateQuestUI();renderBlueprints();resize();requestAnimationFrame(frame);
})();

