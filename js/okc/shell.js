// shell.js — shared OKC game shell: hub, control (pose+mouse), loop, HUD,
// session summary, progression, dashboard. Any game module that exports the
// standard def ({id,name,howto,calib,make}) plugs in here unchanged.
import { PoseController } from "./pose.js";
import { OKCSave, rankFor } from "./save.js";
import { Audio } from "../arcade/audio.js";
import QUAD from "./games/quad.js";

const $=id=>document.getElementById(id);
const stage=$("stage"), sctx=stage.getContext("2d"), video=$("video"), pip=$("pip"), pctx=pip.getContext("2d");

// game registry — OKC order. Only built games are playable; rest are "coming soon".
const GAMES=[
  { def:QUAD },
  { soon:true, id:"slr",  name:"Lift-Off",   emoji:"🎈", exercise:"Straight Leg Raise" },
  { soon:true, id:"heel", name:"Trace the Arc", emoji:"🌈", exercise:"Heel Slides / ROM" },
  { soon:true, id:"tke",  name:"Lock the Slot", emoji:"🔩", exercise:"Terminal Knee Ext." },
  { soon:true, id:"tempo",name:"Tempo Lift",  emoji:"⏱️", exercise:"Resisted Knee Ext." },
  { soon:true, id:"ham",  name:"Reel It In",  emoji:"🎣", exercise:"Hamstring Curl" },
];
const DIFFS=[
  { id:"gentle",  name:"Gentle",  desc:"Wide zone, short holds. Best to start." },
  { id:"steady",  name:"Steady",  desc:"A balanced challenge." },
  { id:"champion",name:"Champion",desc:"Tight zone, long holds." },
];
const ACH={ first:"first_okc", steady90:"okc_steady90", champ:"okc_champion", streak3:"okc_streak3" };

let W=0,H=0,DPR=1, scene="hub", mode="mouse", running=false, lastTs=0, countUntil=0;
let curDef=null, chosenDiff="gentle", game=null, ended=false, pointerNorm=0.5;
const pose=new PoseController(); let camReady=false;

function resize(){ DPR=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
  stage.width=W*DPR; stage.height=H*DPR; stage.style.width=W+"px"; stage.style.height=H+"px"; sctx.setTransform(DPR,0,0,DPR,0,0);
  pip.width=132; pip.height=99; if(game&&game.resize) game.resize(W,H); }
addEventListener("resize",resize); addEventListener("orientationchange",()=>setTimeout(resize,200));

const SCREENS=["hub","diffScreen","calibScreen","sumScreen","dashScreen"];
function showScreen(id){ scene=id; for(const s of SCREENS) $(s).classList.toggle("on", s===id); $("hud").classList.toggle("on", id==="game"); }
function toScene(id){ Audio.tap&&Audio.tap(); showScreen(id); if(id==="hub")refreshHub(); if(id==="dashScreen")renderDash(); }
function toast(m){ const t=$("toast"); t.textContent=m; t.style.opacity=1; clearTimeout(t._h); t._h=setTimeout(()=>t.style.opacity=0,1800); }

// ── hub ──
function refreshHub(){ const d=OKCSave.data; $("coinN").textContent=d.coins; $("rankN").textContent="Lv "+rankFor(d.xp); $("streakN").textContent="🔥 "+d.streak; }
function buildHub(){ const g=$("gameGrid"); g.innerHTML="";
  GAMES.forEach((G,i)=>{ const def=G.def, id=def?def.id:G.id, name=def?def.name:G.name, emoji=def?def.emoji:G.emoji, ex=def?def.exercise:G.exercise;
    const best=OKCSave.best(id); const el=document.createElement("button"); el.className="pick game"+(G.soon?" locked":"");
    el.innerHTML=`<div class="emoji">${emoji}</div><div class="pn">${i+1}. ${name}</div><div class="pd">${ex}</div>`+
      (G.soon?`<div class="soon">Coming soon</div>`:`<div class="stars">${"★".repeat(best.bestStars)}${"☆".repeat(3-best.bestStars)}</div>`);
    el.onclick=()=>{ if(G.soon){ toast("Building these next — Quad Press is ready!"); return; } curDef=def; openDiff(); Audio.tap&&Audio.tap(); };
    g.appendChild(el); }); }
function openDiff(){ $("diffTitle").textContent=curDef.name; $("diffHow").innerHTML=curDef.howto+`<br><small>📷 ${curDef.camera}</small>`;
  const g=$("diffGrid"); g.innerHTML=""; DIFFS.forEach(dd=>{ const el=document.createElement("button"); el.className="pick diff"; el.dataset.id=dd.id;
    el.innerHTML=`<div class="pn">${dd.name}</div><div class="pd">${dd.desc}</div>`; el.onclick=()=>{ chosenDiff=dd.id; sel("diff",dd.id); Audio.tap&&Audio.tap(); }; g.appendChild(el); });
  sel("diff",chosenDiff); showScreen("diffScreen"); }
function sel(cls,id){ document.querySelectorAll("."+cls).forEach(e=>e.classList.toggle("sel",e.dataset.id==id)); }

// ── flow ──
$("btnPlayHub")&&($("btnPlayHub").onclick=()=>{ Audio.init(); Audio.resume(); Audio.startMusic(); });
$("btnDash").onclick=()=>toScene("dashScreen");
$("btnDashBack").onclick=()=>toScene("hub");
$("btnDiffBack").onclick=()=>toScene("hub");
$("btnDiffNext").onclick=()=>{ Audio.init(); Audio.resume(); openCalib(); };
$("btnPause").onclick=()=>{ running=false; pose.stop(); camReady=false; Audio.stopMusic(); toScene("hub"); };
$("btnMute").onclick=()=>{ const m=!OKCSave.data.settings.muted; OKCSave.data.settings.muted=m; OKCSave.save(); Audio.setMuted(m); $("btnMute").textContent=m?"🔇":"🔊"; };
$("btnMute").textContent=OKCSave.data.settings.muted?"🔇":"🔊"; Audio.setMuted(OKCSave.data.settings.muted);

function openCalib(){ showScreen("calibScreen"); $("calCamRow").style.display="flex"; $("calBody").style.display="none"; $("spin").style.display="none"; $("pipWrap").style.display="none";
  $("calHint").textContent="Sit side-on so your whole leg is visible.";
  $("calCam").onclick=async()=>{ mode="camera"; $("calCamRow").style.display="none"; $("spin").style.display="block";
    try{ await pose.load(t=>$("calHint").textContent=t); await pose.startCamera(video); camReady=true; running=true; camLoop();
      $("spin").style.display="none"; $("calBody").style.display="block"; $("pipWrap").style.display="block"; $("calHint").textContent=""; }
    catch(e){ $("spin").style.display="none"; $("calCamRow").style.display="flex"; $("calHint").textContent="Camera error: "+(e.message||e); } };
  $("calMouse").onclick=()=>{ mode="mouse"; $("pipWrap").style.display="none"; startGame(); };
  $("calSet").onclick=()=>{ if(pose.calibrateZero()) toast("Zeroed — get into position"); else toast("Straighten your leg in view first"); };
  $("calGo").onclick=startGame;
}
// lightweight pose loop during calibration (before game starts)
function camLoop(){ if(!camReady) return; requestAnimationFrame(camLoop); const now=performance.now(); pose.frame(now);
  if(scene==="calibScreen"){ const f=pose.flexZeroed(); $("calNow").textContent = f!=null? Math.round(f)+"°":"—";
    const b=$("calZone"); if(f==null){ b.textContent="📷 Move so your whole leg shows"; b.style.color="#ffb84d"; }
    else { b.textContent="✓ Tracking — Set 0° when your leg is straight"; b.style.color="#8affc0"; }
    pose.drawPip(pctx,pip.width,pip.height); $("pipAngle").textContent=f!=null?Math.round(f)+"°":"—"; } }

function startGame(){ ended=false; showScreen("game"); $("hud").classList.add("on");
  game=curDef.make({ W,H, difficulty:chosenDiff, audio:Audio, onEvent:onGameEvent });
  $("gTitle").textContent=curDef.name;
  countUntil=performance.now()+3000; running=true; lastTs=performance.now(); requestAnimationFrame(loop); }

function onGameEvent(e){ if(e.type==="end" && !ended){ ended=true; running=false; endGame(e); } }

// ── main loop ──
function loop(now){ if(!running) return; requestAnimationFrame(loop);
  const dt=Math.min(0.05,(now-lastTs)/1000)||0; lastTs=now;
  let m;
  if(mode==="camera"){ m=pose.frame(now); m.flex = (m.tracked && m.kneeFlex!=null)? (m.kneeFlex - pose.zero) : null; }
  else { const f=pointerNorm*90; m={tracked:true,conf:1,flex:f,kneeFlex:f,kneeAngle:180-f,hipAngle:150,ankle:{x:0.5,y:pointerNorm},side:"L"}; }
  renderBg(now);
  if(now<countUntil){ $("countbig").style.display="flex"; $("countbig").textContent=Math.ceil((countUntil-now)/1000); }
  else { $("countbig").style.display="none"; if(game&&!game.done) game.update(dt,m,now); }
  if(game) game.render(sctx,now);
  if(mode==="camera") pose.drawPip(pctx,pip.width,pip.height);
  const s=game?game.status():null; if(s) updateHUD(s);
  if(s&&s.done&&!ended){ ended=true; endGame(s.result); }
}
let bgStars=null;
function renderBg(now){ const g=sctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#101a4a"); g.addColorStop(0.6,"#241a54"); g.addColorStop(1,"#3a1f52");
  sctx.fillStyle=g; sctx.fillRect(0,0,W,H);
  if(!bgStars) bgStars=Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H*0.7,s:Math.random()*2+0.5,p:Math.random()*7}));
  for(const s of bgStars){ sctx.globalAlpha=0.25+0.5*Math.abs(Math.sin(s.p+now/1200)); sctx.fillStyle="#fff"; sctx.fillRect(s.x,s.y,s.s,s.s); } sctx.globalAlpha=1; }

function updateHUD(s){ $("progBar").style.width=Math.round(s.progress*100)+"%"; $("scoreN").textContent=s.score; $("repsN").textContent=`${s.reps}/${s.repsTarget}`;
  const fb=$("fbBanner"); fb.textContent=s.feedback.text; fb.style.color=s.feedback.color; fb.style.opacity=s.feedback.text?1:0; }

// ── summary + progression ──
function endGame(r){ running=false; pose.stop(); camReady=false; Audio.stopMusic(); Audio.victory&&Audio.victory();
  const xp = r.completed? 40 + r.stars*30 + Math.round((r.quality||0)/3) : 15;
  const coins = r.completed? 15 + r.stars*10 : 5;
  OKCSave.addXP(xp); OKCSave.addCoins(coins); const streak=OKCSave.touchStreak();
  OKCSave.record({ game:curDef.id, stars:r.stars, score:r.score, reps:r.reps, quality:r.quality, completed:r.completed });
  const newAch=[];
  if(r.completed && OKCSave.unlock(ACH.first)) newAch.push("First Rep");
  if((r.quality||0)>=90 && OKCSave.unlock(ACH.steady90)) newAch.push("Steady Hand");
  if(chosenDiff==="champion" && r.completed && OKCSave.unlock(ACH.champ)) newAch.push("Champion");
  if(streak>=3 && OKCSave.unlock(ACH.streak3)) newAch.push("On a Roll");
  showSummary(r,xp,coins,streak,newAch);
}
function showSummary(r,xp,coins,streak,newAch){ showScreen("sumScreen");
  $("sumTitle").textContent=r.completed?"Exercise Complete!":"Session Ended";
  const se=$("sumStars"); se.innerHTML=""; for(let i=0;i<3;i++){ const s=document.createElement("span"); s.className="bigstar"+(i<r.stars?" lit":""); s.textContent="★"; s.style.animationDelay=(i*0.22)+"s"; se.appendChild(s); }
  $("sumStats").innerHTML=`
    <div class="crow"><span>Reps completed</span><b>${r.reps}</b></div>
    <div class="crow"><span>Hold quality</span><b>${r.quality||0}%</b></div>
    <div class="crow"><span>Score</span><b>${r.score}</b></div>
    <div class="crow xp"><span>+ XP</span><b>${xp}</b></div>
    <div class="crow coin"><span>+ Coins</span><b>${coins} 🪙</b></div>
    <div class="crow"><span>Day streak</span><b>🔥 ${streak}</b></div>`;
  $("sumAch").textContent = newAch.length? "🏅 "+newAch.join(", ") : "";
}
$("btnReplay").onclick=()=>{ Audio.startMusic(); openCalib(); };
$("btnSumHome").onclick=()=>toScene("hub");

// ── dashboard ──
function renderDash(){ const d=OKCSave.data;
  $("dTiles").innerHTML=`
    <div class="tile"><div class="tv">Lv ${rankFor(d.xp)}</div><div class="tl">rank</div></div>
    <div class="tile"><div class="tv">${d.xp}</div><div class="tl">XP</div></div>
    <div class="tile"><div class="tv">${d.coins}</div><div class="tl">coins</div></div>
    <div class="tile"><div class="tv">🔥 ${d.streak}</div><div class="tl">streak</div></div>`;
  $("dGames").innerHTML=GAMES.map(G=>{ const id=G.def?G.def.id:G.id, name=G.def?G.def.name:G.name, b=OKCSave.best(id);
    return `<div class="crow"><span>${G.def?G.def.emoji:G.emoji} ${name}</span><b>${G.soon?"—":`${b.plays} plays · ${"★".repeat(b.bestStars)||"—"}`}</b></div>`; }).join("");
  const hist=d.history.slice(-10), cv=$("dChart"), cx=cv.getContext("2d"); cv.width=cv.clientWidth*2; cv.height=120*2; cx.scale(2,2);
  const w=cv.clientWidth,h=120; cx.clearRect(0,0,w,h);
  if(hist.length){ const bw=w/hist.length; hist.forEach((s,i)=>{ const bh=(s.quality||0)/100*(h-24); cx.fillStyle="#37e1ff"; cx.fillRect(i*bw+bw*0.2,h-16-bh,bw*0.6,bh);
    cx.fillStyle="#9aa6d4"; cx.font="9px sans-serif"; cx.textAlign="center"; cx.fillText((s.stars||0)+"★",i*bw+bw*0.5,h-4); });
    cx.fillStyle="#9aa6d4"; cx.font="10px sans-serif"; cx.textAlign="left"; cx.fillText("Hold quality % (last "+hist.length+")",4,12); }
  else { cx.fillStyle="#9aa6d4"; cx.font="12px sans-serif"; cx.fillText("No sessions yet — play Quad Press!",8,60); } }

// pointer control
function ptr(e){ const y=(e.touches?e.touches[0].clientY:e.clientY); pointerNorm=Math.max(0,Math.min(1,y/H)); }
stage.addEventListener("mousemove",ptr); stage.addEventListener("touchmove",e=>{ptr(e);e.preventDefault();},{passive:false}); stage.addEventListener("touchstart",ptr);

// boot
resize(); buildHub(); refreshHub(); showScreen("hub");
// test hook
window.__okc={ scene:()=>scene, openGame:()=>{curDef=QUAD; chosenDiff="gentle"; mode="mouse"; startGame();}, forcePlay:()=>{countUntil=0;},
  setPointer:v=>{pointerNorm=v;}, step:(dt)=>{ if(!game)return; const f=pointerNorm*90; const m={tracked:true,conf:1,flex:f,kneeFlex:f,kneeAngle:180-f,hipAngle:150,ankle:{x:.5,y:pointerNorm},side:"L"}; game.update(dt||0.05,m,performance.now()); },
  status:()=>game?game.status():null };
