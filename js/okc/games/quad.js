// games/quad.js — OKC Game 1: Quad Isometrics → "Quad Press".
// Straighten the knee to press the roller into the extension zone and HOLD.
// Stable holds fill the charge; dropping out of the zone decays it.
import { HoldDecay, Steady, starsFor } from "../rehab.js";

const DIFFS = {
  gentle:   { extThresh:22, holdSecs:6,  reps:3, decay:0.6 },
  steady:   { extThresh:14, holdSecs:9,  reps:4, decay:0.9 },
  champion: { extThresh:8,  holdSecs:12, reps:5, decay:1.2 },
};

class QuadPress {
  constructor(ctx){
    this.W=ctx.W; this.H=ctx.H; this.audio=ctx.audio; this.onEvent=ctx.onEvent||(()=>{});
    this.d = DIFFS[ctx.difficulty]||DIFFS.gentle;
    this.hold=new HoldDecay({holdSecs:this.d.holdSecs, decay:this.d.decay});
    this.steady=new Steady(20, 6);
    this.score=0; this.qSum=0; this.qN=0; this.reps=0; this.repsTarget=this.d.reps;
    this.roller=0.5; this.glow=0; this.parts=[]; this.pops=[]; this.done=false; this.result=null; this.fb={text:"",color:"#9aa6d4"};
  }
  resize(W,H){ this.W=W; this.H=H; }

  update(dt, m, now){
    if(this.done) return;
    const flex = m.flex;                       // zeroed knee flex (0 = straight)
    const tracked = m.tracked && flex!=null;
    const inZone = tracked && flex <= this.d.extThresh;
    if(tracked) this.steady.push(flex);
    const steadiness = inZone ? this.steady.value() : 0;
    const r = this.hold.update(inZone, dt, now/1000);
    // roller: straighter leg → roller pressed up toward the zone
    const target = tracked ? 1 - Math.max(0,Math.min(1, flex/90)) : 0.2;
    this.roller += (target-this.roller)*Math.min(1,dt*10);
    this.glow += ((inZone?1:0)-this.glow)*Math.min(1,dt*8);

    if(inZone){ this.score += dt*12*(0.5+0.5*steadiness); this.qSum+=steadiness; this.qN++; }
    if(r.justRep){ this.reps=r.reps; this.score+=60; this._burst(); this.pop("+60 ✨"); this.audio&&this.audio.reward(); this.onEvent({type:"rep",reps:this.reps}); }

    // feedback
    if(!tracked) this.fb={text:"Show your whole leg to the camera",color:"#ffb84d"};
    else if(!inZone) this.fb={text:"Straighten your knee fully →",color:"#37e1ff"};
    else this.fb = steadiness>0.6 ? {text:"Perfect — hold it! 💪",color:"#8affc0"} : {text:"Hold steady…",color:"#ffb84d"};

    this._step(dt);
    if(this.reps>=this.repsTarget) this._finish();
  }
  _finish(){ this.done=true; const q=this.qN? this.qSum/this.qN : 0;
    this.result={ completed:true, stars:starsFor(q), score:Math.round(this.score), reps:this.reps, quality:+(q*100).toFixed(0) };
    this.onEvent({type:"end",...this.result}); }

  status(){ return { progress:this.hold.p, score:Math.round(this.score), reps:this.reps, repsTarget:this.repsTarget, feedback:this.fb, done:this.done, result:this.result }; }

  // ── render ──
  render(g, now){
    const W=this.W,H=this.H, cx=W*0.5, top=H*0.24, bot=H*0.78, trackH=bot-top, x=cx;
    // press rail
    g.strokeStyle="#2c3670"; g.lineWidth=16; g.lineCap="round"; g.beginPath(); g.moveTo(x,top); g.lineTo(x,bot); g.stroke();
    // extension "lock zone" (target) near the top
    const zoneH=trackH*0.24, zy=top;
    const zg=g.createLinearGradient(0,zy,0,zy+zoneH); zg.addColorStop(0,"rgba(138,255,192,0.35)"); zg.addColorStop(1,"rgba(138,255,192,0.05)");
    g.fillStyle=zg; g.fillRect(x-70,zy,140,zoneH);
    g.strokeStyle="#8affc0"; g.lineWidth=2; g.setLineDash([6,6]); g.strokeRect(x-70,zy,140,zoneH); g.setLineDash([]);
    g.fillStyle="#8affc0"; g.font="bold 13px sans-serif"; g.textAlign="center"; g.fillText("EXTENSION ZONE",x,zy+zoneH+16);
    // roller
    const ry = bot - this.roller*trackH;
    if(this.glow>0.02){ const gg=g.createRadialGradient(x,ry,4,x,ry,90); gg.addColorStop(0,`rgba(138,255,192,${0.5*this.glow})`); gg.addColorStop(1,"rgba(138,255,192,0)"); g.fillStyle=gg; g.beginPath(); g.arc(x,ry,90,0,7); g.fill(); }
    g.fillStyle="#eef2ff"; g.strokeStyle="#37e1ff"; g.lineWidth=3;
    g.beginPath(); g.roundRect? g.roundRect(x-46,ry-20,92,40,10) : g.rect(x-46,ry-20,92,40); g.fill(); g.stroke();
    g.fillStyle="#37e1ff"; for(let i=-1;i<=1;i++){ g.beginPath(); g.arc(x+i*22,ry,5,0,7); g.fill(); }
    // charge ring around roller
    g.beginPath(); g.arc(x,ry,54,-Math.PI/2,-Math.PI/2+this.hold.p*2*Math.PI); g.strokeStyle="#ffe08a"; g.lineWidth=6; g.lineCap="round"; g.stroke();
    // reps pips
    for(let i=0;i<this.repsTarget;i++){ g.fillStyle=i<this.reps?"#ffe08a":"#ffffff33"; g.font="26px sans-serif"; g.fillText(i<this.reps?"★":"☆", cx-(this.repsTarget-1)*16 + i*32, bot+40); }
    // particles + pops
    for(const p of this.parts){ g.globalAlpha=Math.max(0,p.life); g.fillStyle=p.c; g.beginPath(); g.arc(p.x,p.y,3,0,7); g.fill(); } g.globalAlpha=1;
    for(const p of this.pops){ g.globalAlpha=Math.max(0,p.life); g.fillStyle="#ffe08a"; g.font="bold 20px sans-serif"; g.fillText(p.t,p.x,p.y); } g.globalAlpha=1;
  }
  _burst(){ const x=this.W*0.5, y=this.H*0.24+20; for(let i=0;i<16;i++){ const a=Math.random()*7,s=Math.random()*4+1; this.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,c:Math.random()<0.5?"#ffe08a":"#8affc0"}); } }
  pop(t){ this.pops.push({x:this.W*0.5,y:this.H*0.24+40,t,life:1}); }
  _step(dt){ for(const p of this.parts){ p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life-=dt*1.5; } this.parts=this.parts.filter(p=>p.life>0);
    for(const p of this.pops){ p.y-=28*dt; p.life-=dt*1.1; } this.pops=this.pops.filter(p=>p.life>0); }
}

export default {
  id:"quad", name:"Quad Press", emoji:"💪", exercise:"Quad Isometrics", camera:"Sagittal (side-on)",
  howto:"Sit or lie side-on. <b>Straighten your knee fully</b> to press the roller into the green zone, then <b>hold it steady</b>. Fill the charge to score a rep.",
  calib:"zero", diffs:Object.keys(DIFFS),
  make(ctx){ return new QuadPress(ctx); },
};
