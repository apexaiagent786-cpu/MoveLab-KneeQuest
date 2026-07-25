// holdDetector.js — isometric hold detection for Wall-Sit Guardian (AI-1).
// Pure logic, no DOM. Feed it the live knee-flexion angle each frame; it tracks
// time-in-band, continuous-hold progress (with a short grace period), steadiness,
// and emits a coaching feedback code. Deterministic → unit-testable.

export const FB = {
  NO_TRACK:"no_track",     // pose/knee not reliable
  BELOW:"below",           // not enough flexion — bend deeper
  ABOVE:"above",           // too much flexion — ease up
  JITTER:"jitter",         // in band but unsteady — hold steady
  GOOD:"good",             // in band and steady — hold it
};

export class HoldDetector{
  /**
   * @param target   target knee-flexion angle (deg)
   * @param band     ± tolerance around target that counts as "in band" (deg)
   * @param holdSecs continuous in-band seconds required for a successful hold
   * @param graceMs  allowed out-of-band blip before continuous progress resets
   * @param steadyWin samples used for the steadiness (jitter) estimate
   * @param jitterTol avg abs deviation (deg) above which we cue "hold steady"
   */
  constructor({target=45,band=12,holdSecs=6,graceMs=450,steadyWin=20,jitterTol=6}={}){
    this.cfg={target,band,holdSecs,graceMs,steadyWin,jitterTol};
    this.reset();
  }
  configure(patch){ Object.assign(this.cfg,patch); }

  // begin a fresh hold attempt (call at the start of each set)
  reset(){
    this.holdTime=0;        // continuous seconds currently in band
    this.timeInBand=0;      // cumulative in-band seconds this attempt
    this.timeTotal=0;       // total attempt seconds
    this.lastInBand=null;   // timestamp of last in-band frame
    this._t=null;           // last update timestamp
    this._dev=[];           // recent |flex-target| samples
    this._success=false;    // has this attempt reached holdSecs
    this.peakHold=0;        // best continuous hold reached this attempt
    return this;
  }

  /**
   * Advance the detector.
   * @param flex knee-flexion angle in deg, or null when tracking is unreliable
   * @param tSec monotonically increasing time in seconds
   * @returns {inBand, progress(0..1), holdTime, timeInBand, timeTotal,
   *           inBandPct(0..1), steadiness, feedback, justSucceeded}
   */
  update(flex, tSec){
    const c=this.cfg;
    const dt = this._t==null ? 0 : Math.max(0, Math.min(0.25, tSec-this._t));
    this._t=tSec;
    this.timeTotal += dt;

    if(flex==null){
      // lost tracking → progress pauses; reset continuous hold if the blip is long
      if(this.lastInBand==null || (tSec-this.lastInBand)*1000 > c.graceMs) this.holdTime=0;
      return this._out(false, FB.NO_TRACK, false);
    }

    const dev = flex - c.target;
    const inBand = Math.abs(dev) <= c.band;

    if(inBand){
      this.holdTime  += dt;
      this.timeInBand+= dt;
      this.lastInBand = tSec;
      this._dev.push(Math.abs(dev)); if(this._dev.length>c.steadyWin) this._dev.shift();
      this.peakHold = Math.max(this.peakHold, this.holdTime);
    }else{
      // grace: tolerate a brief drift without wiping continuous progress
      if(this.lastInBand==null || (tSec-this.lastInBand)*1000 > c.graceMs) this.holdTime=0;
    }

    const steadiness = this._dev.length ? this._dev.reduce((a,b)=>a+b,0)/this._dev.length : 0;

    let fb;
    if(!inBand)                        fb = dev < 0 ? FB.BELOW : FB.ABOVE;
    else if(steadiness > c.jitterTol)  fb = FB.JITTER;
    else                               fb = FB.GOOD;

    let justSucceeded=false;
    if(!this._success && this.holdTime >= c.holdSecs){ this._success=true; justSucceeded=true; }

    return this._out(inBand, fb, justSucceeded, steadiness);
  }

  _out(inBand, feedback, justSucceeded, steadiness=0){
    return {
      inBand,
      progress: Math.min(this.holdTime / this.cfg.holdSecs, 1),
      holdTime: this.holdTime,
      peakHold: this.peakHold,
      timeInBand: this.timeInBand,
      timeTotal: this.timeTotal,
      inBandPct: this.timeTotal>0 ? this.timeInBand/this.timeTotal : 0,
      steadiness,
      success: this._success,
      justSucceeded,
      feedback,
    };
  }

  // ── scoring for a completed set ──
  // points ∝ in-band seconds, plus a steadiness bonus, gated by success.
  score(){
    const inBandPts = Math.round(this.timeInBand * 10);
    const steadyAvg = this._dev.length ? this._dev.reduce((a,b)=>a+b,0)/this._dev.length : this.cfg.band;
    const steadyBonus = Math.round(Math.max(0, (this.cfg.band - steadyAvg)) * 3);
    const successBonus = this._success ? 25 : 0;
    const total = inBandPts + steadyBonus + successBonus;
    const pct = this.timeTotal>0 ? this.timeInBand/this.timeTotal : 0;
    const stars = (this._success && pct>=0.85) ? 3 : (pct>=0.65 ? 2 : 1);
    return { points:total, stars, success:this._success,
             timeInBand:+this.timeInBand.toFixed(1), peakHold:+this.peakHold.toFixed(1),
             inBandPct:+(pct*100).toFixed(0), steadiness:+steadyAvg.toFixed(1) };
  }
}
