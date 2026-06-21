/* Club — 簡單行銷中台 8-bit 小助手（全站共用）
   會 bob/眨眼/點擊跳躍噴金幣，並輪播即時提示。自己注入樣式、自己抓資料。 */
(function(){
  if(window.__clubLoaded) return; window.__clubLoaded=true;
  const PX=6;
  // m=機身 E=眼 s=嘴 A=手臂 b=下身 G=綠色螢幕 d=天線桿 o=天線燈 L=腳
  const BODY=[
    ".....o.....",
    ".....d.....",
    ".mmmmmmmmm.",
    ".mEEmmmEEm.",
    ".mEEmmmEEm.",
    ".mmmmmmmmm.",
    ".mmsssssmm.",
    ".mmmmmmmmm.",
    "AmmmmmmmmmA",
    ".bGGGGGGGb.",
    ".bbbbbbbbb.",
    "..LL...LL.."
  ];
  const PAL={m:'#5b8cff',E:'#caf5ff',s:'#22304d',A:'#3a63cf',b:'#3a63cf',G:'#27c093',d:'#2f4f9e',o:'#ffb454',L:'#3a63cf'};
  function sprite(map,scale,blink){
    const w=map[0].length,h=map.length,c=document.createElement('canvas');
    c.width=w*scale;c.height=h*scale;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
    for(let r=0;r<h;r++)for(let q=0;q<w;q++){let ch=map[r][q];if(blink&&ch==='E')ch='m';const col=PAL[ch];if(!col)continue;x.fillStyle=col;x.fillRect(q*scale,r*scale,scale,scale);}
    return c;
  }
  const COINMAP=["..3333..",".341143.","34111113","34121213","34121213","34111113",".311113.","..3333.."];
  const CPAL={'1':'#f6c700','2':'#9c6f00','3':'#6e4e00','4':'#fff1a8'};
  function coinURL(scale){const w=8,h=8,c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const x=c.getContext('2d');for(let r=0;r<h;r++)for(let q=0;q<w;q++){const col=CPAL[COINMAP[r][q]];if(!col)continue;x.fillStyle=col;x.fillRect(q*scale,r*scale,scale,scale);}return c.toDataURL();}
  const COIN=coinURL(3);
  function pxURL(map,scale,pal){const w=map[0].length,h=map.length,c=document.createElement('canvas');c.width=w*scale;c.height=h*scale;const x=c.getContext('2d');for(let r=0;r<h;r++)for(let q=0;q<w;q++){const col=pal[map[r][q]];if(!col)continue;x.fillStyle=col;x.fillRect(q*scale,r*scale,scale,scale);}return c.toDataURL();}
  // 魚 & 浮標 sprite
  const FISH=["..ffff.",".fffffT","feffffT",".fffffT","..ffff."];
  const FISH_URL=pxURL(FISH,3,{f:'#36cfd1',e:'#0f1115',T:'#2a9aa6'});
  const BOB=[".RR.","RWWR","RRRR",".RR."];
  const BOB_URL=pxURL(BOB,3,{R:'#ff5d6c',W:'#ffffff'});
  // 蝴蝶 / 捕蟲網 / 手搖飲 / 愛心
  const BFLY_URL=pxURL(["Pp.pP","PPBPP",".pBp.","PPBPP","Pp.pP"],3,{P:'#c98bff',p:'#ffb3e6',B:'#2a2140'});
  const NET_URL=pxURL([".HHH.","H...H","H...H",".HHH.","...t.","..t..",".t..."],3,{H:'#e7e9ee',t:'#9c6f00'});
  const CUP_URL=pxURL(["..s..","CCCCC","CdddC","CdddC","CoooC",".CCC."],3,{s:'#e7e9ee',C:'#cfe9ff',d:'#c98bff',o:'#5a3b2a'});
  const HEART_URL=pxURL([".R.R.","RRRRR","RRRRR",".RRR.","..R.."],3,{R:'#ff5d6c'});

  // 樣式
  const st=document.createElement('style');st.id='club-style';st.textContent=`
  #club{position:fixed;right:20px;bottom:20px;z-index:99998;cursor:pointer;image-rendering:pixelated;animation:clubbob 1.5s steps(2) infinite;filter:drop-shadow(0 4px 0 rgba(0,0,0,.35))}
  #club:hover{filter:drop-shadow(0 4px 0 rgba(0,0,0,.35)) brightness(1.1)}
  @keyframes clubbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
  #club.jump{animation:clubjump .5s steps(4)}
  @keyframes clubjump{0%{transform:translateY(0)}40%{transform:translateY(-26px)}70%{transform:translateY(-7px)}100%{transform:translateY(0)}}
  #clubbubble{position:fixed;right:96px;bottom:34px;z-index:99998;width:238px;background:#171a21;color:#e7e9ee;border:3px solid #ffcf3a;border-radius:3px;padding:10px 12px;font-size:12.5px;line-height:1.55;box-shadow:0 0 0 3px #0f1115,5px 5px 0 rgba(0,0,0,.45);display:none;font-family:"Inter","Noto Sans TC",system-ui,"PingFang TC","Microsoft JhengHei",sans-serif}
  #clubbubble.show{display:block;animation:clubpop .18s steps(2)}
  #clubbubble b{color:#ffcf3a}
  #clubbubble:after{content:'';position:absolute;right:-13px;bottom:16px;width:0;height:0;border:7px solid transparent;border-left-color:#ffcf3a}
  @keyframes clubpop{0%{transform:scale(.5)}100%{transform:scale(1)}}
  .pxcoin{position:fixed;left:0;top:0;image-rendering:pixelated;pointer-events:none;z-index:99999}
  .mblk:hover,.track .bar:hover{animation:clubpxpop .26s steps(3)}
  @keyframes clubpxpop{0%{}50%{transform:translateY(-4px)}100%{}}
  .club-prop{position:fixed;image-rendering:pixelated;pointer-events:none;z-index:99997}
  #club-fish{right:74px;bottom:6px;width:26px;height:80px}
  #club-fish .cf-line{position:absolute;left:12px;top:4px;width:2px;height:52px;background:#9aa3b2;opacity:.65}
  #club-fish .cf-bob{position:absolute;left:6px;top:50px;width:12px;animation:cfbob 1.5s steps(2) infinite}
  @keyframes cfbob{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
  #club-fish.cf-bite .cf-bob{animation:cfbite .4s steps(3)}
  @keyframes cfbite{0%{transform:translateY(0)}50%{transform:translateY(10px)}100%{transform:translateY(0)}}
  #club-fish .cf-water{position:absolute;left:0;bottom:0;width:26px;height:9px;background:repeating-linear-gradient(90deg,#2a9aa6 0 4px,transparent 4px 8px);opacity:.55;border-radius:2px}
  .club-net{right:80px;bottom:46px;width:18px;animation:clubbob 1.5s steps(2) infinite}
  .club-cup{right:82px;bottom:30px;width:20px;animation:cupbob 1.3s steps(2) infinite}
  @keyframes cupbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  @media(max-width:640px){#club{right:10px;bottom:10px}#clubbubble{right:78px;bottom:22px;width:170px;font-size:11px}}`;
  document.head.appendChild(st);

  const club=sprite(BODY,PX,false);club.id='club';club.title='我是 Club，點我！';
  const blinkSprite=sprite(BODY,PX,true);
  const normalSprite=sprite(BODY,PX,false);
  const bubble=document.createElement('div');bubble.id='clubbubble';
  function mount(){document.body.appendChild(club);document.body.appendChild(bubble);}
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);

  // 眨眼
  setInterval(()=>{const x=club.getContext('2d');x.clearRect(0,0,club.width,club.height);x.drawImage(blinkSprite,0,0);
    setTimeout(()=>{const y=club.getContext('2d');y.clearRect(0,0,club.width,club.height);y.drawImage(normalSprite,0,0);},140);},3800);

  // 抓資料供提示用
  const DATA={};
  const f=n=>'$'+Math.round(n).toLocaleString('en-US');
  fetch('data/projects_monthly.json').then(r=>r.json()).then(P=>{
    const td=new Date().toISOString().slice(0,10);
    const items=(P.receivables_open||[]).filter(x=>x.date<=td);
    DATA.arCount=items.length;DATA.arTot=items.reduce((a,x)=>a+x.amt,0);DATA.updated=P.updated;
  }).catch(()=>{});
  fetch('data/notion_projects.json').then(r=>r.json()).then(N=>{
    const scls={'執行中':1,'開發中-洽談中':1,'開發中-初步接觸':1,'暫停':1,'待認領':1};
    const isInv=(n,a)=>/投資/.test(n||'')||a===0;
    const act=N.cards.filter(c=>scls[c.status]&&c.start&&c.due);
    DATA.cases=act.filter(c=>!isInv(c.note,c.amount)).length;
    DATA.invests=act.filter(c=>isInv(c.note,c.amount)).length;
    DATA.updated=DATA.updated||N.updated;
  }).catch(()=>{});

  function tips(){
    const d=Object.assign({},DATA,window.__dash||{});
    const t=['嗨！我是 <b>Club</b> 🤖<br>你的中台小助手，點我看數字～'];
    if(d.collectAhead!=null)t.push(`${d.curMonth||'本月'}～年底預估還可收<br><b>${f(d.collectAhead)}</b> 💰`);
    if(d.netAhead!=null)t.push(`扣完成本＋薪資，<br>淨現金流 <b>${f(d.netAhead)}</b> 🟰`);
    if(d.arTot)t.push(`有 <b>${d.arCount}</b> 筆「應收未收」要追，<br>共 <b>${f(d.arTot)}</b>，記得催款！📩`);
    if(d.cases!=null)t.push(`目前 <b>${d.cases}</b> 個接案在跑，<br>加油衝刺！🔥`);
    if(d.updated)t.push(`資料最後同步：<b>${d.updated}</b><br>每天自動更新 🚀`);
    return t;
  }
  let idx=0,hideT;
  function say(){const list=tips();bubble.innerHTML=list[idx%list.length];idx++;bubble.classList.add('show');clearTimeout(hideT);hideT=setTimeout(()=>bubble.classList.remove('show'),5200);}
  function burst(cx,cy,n){for(let i=0;i<(n||16);i++){const img=new Image();img.src=COIN;img.className='pxcoin';const sz=14+Math.random()*12;img.style.width=sz+'px';document.body.appendChild(img);let px=cx,py=cy,vx=(Math.random()-0.5)*8,vy=-Math.random()*10-5,rot=0,vr=(Math.random()-0.5)*22;(function step(){vy+=0.5;px+=vx;py+=vy;rot+=vr;img.style.transform=`translate(${px}px,${py}px) rotate(${rot}deg)`;if(py<innerHeight+50)requestAnimationFrame(step);else img.remove();})();}}
  // ===== 閒置小活動：釣魚 / 抓蝴蝶 / 喝手搖飲 =====
  let actTimers=[];
  function spawn(el,cls){el.className=cls;document.body.appendChild(el);return el;}
  function clearAct(){actTimers.forEach(clearInterval);actTimers=[];document.querySelectorAll('.club-prop').forEach(e=>e.remove());}
  function fling(x,y,src,w){const img=new Image();img.src=src;img.className='pxcoin';img.style.width=(w||18)+'px';document.body.appendChild(img);
    let px=x,py=y,vx=(Math.random()-0.5)*3,vy=-7.5,rot=0,vr=(Math.random()-0.5)*16,fl=py;
    (function s(){vy+=0.4;px+=vx;py+=vy;rot+=vr;img.style.transform=`translate(${px}px,${py}px) rotate(${rot}deg)`;if(py<fl+8)requestAnimationFrame(s);else img.remove();})();}
  function floatUp(x,y,src){const img=new Image();img.src=src;img.className='pxcoin';img.style.width='12px';document.body.appendChild(img);let py=y,o=1;
    (function s(){py-=1.2;o-=0.012;img.style.opacity=o;img.style.transform=`translate(${x}px,${py}px)`;if(o>0)requestAnimationFrame(s);else img.remove();})();}
  function actFishing(){
    const s=spawn(document.createElement('div'),'club-prop');s.id='club-fish';
    s.innerHTML='<div class="cf-line"></div><img class="cf-bob" src="'+BOB_URL+'"><div class="cf-water"></div>';
    actTimers.push(setInterval(()=>{s.classList.add('cf-bite');setTimeout(()=>s.classList.remove('cf-bite'),420);
      const r=s.getBoundingClientRect();fling(r.left+4,r.top+42,Math.random()<0.5?FISH_URL:COIN);},2600));
  }
  function actButterfly(){
    spawn(Object.assign(new Image(),{src:NET_URL}),'club-prop club-net');
    const bf=spawn(Object.assign(new Image(),{src:BFLY_URL}),'club-prop');bf.style.width='16px';bf.style.left='0';bf.style.top='0';
    let t=0;actTimers.push(setInterval(()=>{t+=0.13;const cb=club.getBoundingClientRect();
      const x=cb.left-48+Math.sin(t)*52,y=cb.top-22+Math.cos(t*1.3)*24+Math.sin(t*2)*6;
      bf.style.transform=`translate(${x}px,${y}px) scaleX(${Math.sin(t*7)>0?1:-1})`;},45));
  }
  function actBubbleTea(){
    const cup=spawn(Object.assign(new Image(),{src:CUP_URL}),'club-prop club-cup');cup.style.width='20px';
    actTimers.push(setInterval(()=>{const r=cup.getBoundingClientRect();floatUp(r.left+3,r.top-4,HEART_URL);},2400));
  }
  const ACTS=[actFishing,actButterfly,actBubbleTea];
  let idleT;
  function startIdle(){clearAct();ACTS[Math.floor(Math.random()*ACTS.length)]();}
  function resetIdle(){clearAct();clearTimeout(idleT);idleT=setTimeout(startIdle,8000);}
  club.addEventListener('click',()=>{resetIdle();club.classList.remove('jump');void club.offsetWidth;club.classList.add('jump');const r=club.getBoundingClientRect();burst(r.left+r.width/2-14,r.top,16);say();});
  ['pointerdown','keydown','scroll','touchstart'].forEach(ev=>window.addEventListener(ev,resetIdle,{passive:true}));
  setTimeout(say,1500);
  resetIdle();
})();
