// pose.js — shared PoseController for all OKC games.
// Wraps MediaPipe Pose + core.KneeMeter and exposes clean per-frame metrics:
//   knee angle (hip–knee–ankle, 180°=full extension), clinical flex, hip angle
//   (shoulder–hip–knee, for SLR/hamstring), ankle position, confidence.
import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12";
import { OneEuro, detectView, KneeMeter, KNEES, angle2d, vis, VIS_DRAW } from "../core.js";

const POSE_MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm";
const SH={L:11,R:12}, HIP={L:23,R:24}, KNEE={L:25,R:26}, ANK={L:27,R:28};

export class PoseController {
  constructor(){
    this.landmarker=null; this.stream=null; this.video=null; this.facing="user";
    this.fX=[]; this.fY=[]; for(let i=0;i<33;i++){this.fX[i]=new OneEuro();this.fY[i]=new OneEuro();}
    this.flexSmooth=new OneEuro(1.5,0.4); this.meter=new KneeMeter();
    this.lastRes=null; this.lastVideoTime=-1; this.zero=0;
    this.m={ tracked:false, conf:0, kneeFlex:null, kneeAngle:null, hipAngle:null, ankle:null, side:null };
  }
  get CONNECTIONS(){ return PoseLandmarker.POSE_CONNECTIONS; }

  async load(onMsg){ if(this.landmarker) return; onMsg&&onMsg("Loading tracker… (first time ~10 MB)");
    const vision=await FilesetResolver.forVisionTasks(WASM);
    const opt=del=>({baseOptions:{modelAssetPath:POSE_MODEL,delegate:del},runningMode:"VIDEO",numPoses:1,
      minPoseDetectionConfidence:.6,minPosePresenceConfidence:.6,minTrackingConfidence:.6});
    try{ this.landmarker=await PoseLandmarker.createFromOptions(vision,opt("GPU")); }
    catch(e){ this.landmarker=await PoseLandmarker.createFromOptions(vision,opt("CPU")); } }

  async startCamera(video, facing){ this.video=video; if(facing)this.facing=facing;
    if(this.stream)this.stream.getTracks().forEach(t=>t.stop());
    let s; try{ s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:this.facing},width:{ideal:1280},height:{ideal:720}}}); }
    catch(e){ s=await navigator.mediaDevices.getUserMedia({audio:false,video:true}); }
    this.stream=s; video.srcObject=s; await new Promise(r=>{ if(video.readyState>=1)r(); else video.onloadedmetadata=()=>r(); }); await video.play(); }
  stop(){ if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; } }
  async switchCamera(video){ this.facing=this.facing==="user"?"environment":"user"; await this.startCamera(video); }

  // read one frame → update this.m. Returns metrics.
  frame(now){
    const v=this.video, m=this.m;
    if(!this.landmarker||!v||v.readyState<2){ m.tracked=false; return m; }
    if(v.currentTime!==this.lastVideoTime){ this.lastVideoTime=v.currentTime; try{ this.lastRes=this.landmarker.detectForVideo(v,now); }catch(e){} }
    const res=this.lastRes;
    if(res&&res.landmarks&&res.landmarks[0]){
      const raw=res.landmarks[0], wlm=(res.worldLandmarks&&res.worldLandmarks[0])||raw, t=now/1000;
      const sm=raw.map((p,i)=>({x:this.fX[i].filt(p.x,t),y:this.fY[i].filt(p.y,t),z:p.z,visibility:vis(p)}));
      const [vl]=detectView(sm), asp=(v.videoWidth/v.videoHeight)||(16/9);
      const r=this.meter.measure(sm,wlm,vl,asp);
      const side=r.active||r.near||"L";
      if(r.activeFlex!=null){ m.kneeFlex=this.flexSmooth.filt(r.activeFlex,t); m.kneeAngle=180-m.kneeFlex; m.conf=r.activeConf; m.tracked=true; }
      else { m.tracked=false; m.conf=r.activeConf||0; m.kneeFlex=null; m.kneeAngle=null; }
      m.side=side;
      // hip angle (shoulder–hip–knee), aspect-corrected — for SLR/hamstring
      const sh=sm[SH[side]], hp=sm[HIP[side]], kn=sm[KNEE[side]];
      m.hipAngle = (vis(sh)>0.4&&vis(hp)>0.4&&vis(kn)>0.4) ? angle2d(sh,hp,kn,asp) : null;
      m.ankle = sm[ANK[side]] ? {x:sm[ANK[side]].x, y:sm[ANK[side]].y, v:vis(sm[ANK[side]])} : null;
    } else { m.tracked=false; m.conf=0; m.kneeFlex=null; m.kneeAngle=null; m.hipAngle=null; }
    return m;
  }
  // calibration: current knee flex becomes 0 (straight-leg reference)
  calibrateZero(){ if(this.m.kneeFlex!=null){ this.zero=this.m.kneeFlex; return true; } return false; }
  flexZeroed(){ return this.m.kneeFlex==null? null : (this.m.kneeFlex - this.zero); }

  drawPip(ctx,w,h){ ctx.clearRect(0,0,w,h); const res=this.lastRes;
    if(res&&res.landmarks&&res.landmarks[0]){ const lm=res.landmarks[0]; ctx.strokeStyle="#37e1ffaa"; ctx.lineWidth=2;
      for(const c of this.CONNECTIONS){ const a=lm[c.start],b=lm[c.end]; if(vis(a)<VIS_DRAW||vis(b)<VIS_DRAW)continue;
        ctx.beginPath(); ctx.moveTo(a.x*w,a.y*h); ctx.lineTo(b.x*w,b.y*h); ctx.stroke(); } } }
}
