// pose.js — shared PoseController for all OKC games (precision rebuild).
// Sagittal exercises → compute the knee angle directly as a 2-D image-plane
// angle at hip–knee–ankle (accurate side-on, works when only the LEG is visible).
// Tracks the closest/largest person (the patient) and the better-visible leg,
// with One-Euro smoothing on the angle for steady, data-grade readings.
import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12";
import { OneEuro, angle2d, vis, VIS_DRAW } from "../core.js";

const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const SH={L:11,R:12}, HIP={L:23,R:24}, KNEE={L:25,R:26}, ANK={L:27,R:28};
const TRACK_FLOOR=0.35;   // min joint visibility to accept a reading (low-light friendly)

export class PoseController {
  constructor(){
    this.landmarker=null; this.stream=null; this.video=null; this.facing="user";
    this.fX=[]; this.fY=[]; for(let i=0;i<33;i++){this.fX[i]=new OneEuro(1.6,0.5);this.fY[i]=new OneEuro(1.6,0.5);}
    this.kneeSmooth=new OneEuro(1.2,0.35); this.hipSmooth=new OneEuro(1.2,0.35);
    this.lastRes=null; this.lastVideoTime=-1; this.zero=0; this.primaryIdx=0;
    this.m={ tracked:false, conf:0, kneeAngle:null, kneeFlex:null, hipAngle:null, ankle:null, side:null };
  }
  get CONNECTIONS(){ return PoseLandmarker.POSE_CONNECTIONS; }

  async load(onMsg){ if(this.landmarker) return; onMsg&&onMsg("Loading tracker… (first time ~10 MB)");
    const vision=await FilesetResolver.forVisionTasks(WASM);
    // detection thresholds kept moderate so it still finds the leg in low light
    const opt=del=>({baseOptions:{modelAssetPath:POSE_MODEL,delegate:del},runningMode:"VIDEO",numPoses:3,
      minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
    try{ this.landmarker=await PoseLandmarker.createFromOptions(vision,opt("GPU")); }
    catch(e){ this.landmarker=await PoseLandmarker.createFromOptions(vision,opt("CPU")); } }

  async startCamera(video, facing){ this.video=video; if(facing)this.facing=facing;
    if(this.stream)this.stream.getTracks().forEach(t=>t.stop());
    let s; try{ s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:this.facing},width:{ideal:1280},height:{ideal:720}}}); }
    catch(e){ s=await navigator.mediaDevices.getUserMedia({audio:false,video:true}); }
    this.stream=s; video.srcObject=s; await new Promise(r=>{ if(video.readyState>=1)r(); else video.onloadedmetadata=()=>r(); }); await video.play(); }
  stop(){ if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; } }
  async switchCamera(video){ this.facing=this.facing==="user"?"environment":"user"; await this.startCamera(video); }

  frame(now){
    const v=this.video, m=this.m;
    if(!this.landmarker||!v||v.readyState<2){ m.tracked=false; return m; }
    if(v.currentTime!==this.lastVideoTime){ this.lastVideoTime=v.currentTime; try{ this.lastRes=this.landmarker.detectForVideo(v,now); }catch(e){} }
    const res=this.lastRes;
    if(res&&res.landmarks&&res.landmarks.length){
      const pi=this._primary(res.landmarks); this.primaryIdx=pi;
      const raw=res.landmarks[pi], t=now/1000, asp=(v.videoWidth/v.videoHeight)||(16/9);
      const sm=raw.map((p,i)=>({x:this.fX[i].filt(p.x,t),y:this.fY[i].filt(p.y,t),z:p.z,visibility:vis(p)}));
      // choose the better-visible leg
      const cL=Math.min(vis(sm[HIP.L]),vis(sm[KNEE.L]),vis(sm[ANK.L]));
      const cR=Math.min(vis(sm[HIP.R]),vis(sm[KNEE.R]),vis(sm[ANK.R]));
      const side = cL>=cR ? "L":"R"; const conf=Math.max(cL,cR); m.side=side; m.conf=conf;
      if(conf>=TRACK_FLOOR){
        let ka=angle2d(sm[HIP[side]], sm[KNEE[side]], sm[ANK[side]], asp);   // 2-D sagittal knee angle
        if(ka!=null) ka=this.kneeSmooth.filt(ka,t);
        m.kneeAngle=ka; m.kneeFlex = ka!=null? Math.max(0,180-ka):null; m.tracked = ka!=null;
        const sh=sm[SH[side]];
        if(vis(sh)>0.4 && vis(sm[HIP[side]])>0.4 && vis(sm[KNEE[side]])>0.4){
          let ha=angle2d(sh, sm[HIP[side]], sm[KNEE[side]], asp); if(ha!=null) ha=this.hipSmooth.filt(ha,t); m.hipAngle=ha;
        } else m.hipAngle=null;
        m.ankle = sm[ANK[side]] ? {x:sm[ANK[side]].x,y:sm[ANK[side]].y,v:vis(sm[ANK[side]])} : null;
      } else { m.tracked=false; m.kneeAngle=null; m.kneeFlex=null; m.hipAngle=null; }
    } else { m.tracked=false; m.conf=0; m.kneeAngle=null; m.kneeFlex=null; m.hipAngle=null; }
    return m;
  }

  // patient = the person occupying the most of the frame (closest/foreground)
  _primary(list){ if(list.length<=1) return 0; let best=0,ba=-1;
    for(let i=0;i<list.length;i++){ const lm=list[i]; let mnx=1,mny=1,mxx=0,mxy=0,n=0;
      for(const p of lm){ if((p.visibility??1)<0.3) continue; mnx=Math.min(mnx,p.x); mny=Math.min(mny,p.y); mxx=Math.max(mxx,p.x); mxy=Math.max(mxy,p.y); n++; }
      const area = n>6 ? (mxx-mnx)*(mxy-mny) : 0; if(area>ba){ ba=area; best=i; } }
    return best; }

  calibrateZero(){ if(this.m.kneeAngle!=null){ this.zero=180-this.m.kneeAngle; return true; } return false; }

  drawPip(ctx,w,h){ ctx.clearRect(0,0,w,h); const res=this.lastRes;
    if(res&&res.landmarks&&res.landmarks.length){ const lm=res.landmarks[this.primaryIdx]||res.landmarks[0]; ctx.strokeStyle="#37e1ffcc"; ctx.lineWidth=2.5;
      for(const c of this.CONNECTIONS){ const a=lm[c.start],b=lm[c.end]; if(vis(a)<VIS_DRAW||vis(b)<VIS_DRAW)continue;
        ctx.beginPath(); ctx.moveTo(a.x*w,a.y*h); ctx.lineTo(b.x*w,b.y*h); ctx.stroke(); }
      // highlight the tracked leg
      const s=this.m.side; if(s){ ctx.strokeStyle="#8affc0"; ctx.lineWidth=3.5;
        for(const [p,q] of [[HIP[s],KNEE[s]],[KNEE[s],ANK[s]]]){ const a=lm[p],b=lm[q]; if(vis(a)<0.3||vis(b)<0.3)continue;
          ctx.beginPath(); ctx.moveTo(a.x*w,a.y*h); ctx.lineTo(b.x*w,b.y*h); ctx.stroke(); } } } }
}
