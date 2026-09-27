// A replacement request can arrive before an aborted request has finished.
// Wait for a slot instead of rejecting that short overlap.
export class RequestSlots {
  constructor(limit=3,maxWaiting=6){this.limit=limit;this.maxWaiting=maxWaiting;this.active=0;this.waiting=[];}
  acquire(signal){
    return new Promise((resolve,reject)=>{
      if(signal.aborted){reject(signal.reason);return;}
      const grant=()=>{
        signal.removeEventListener('abort',cancel);this.active++;let released=false;
        resolve(()=>{if(released)return;released=true;this.active--;this.waiting.shift()?.grant();});
      };
      const entry={grant};
      const cancel=()=>{const i=this.waiting.indexOf(entry);if(i>=0)this.waiting.splice(i,1);reject(signal.reason);};
      if(this.active<this.limit){grant();return;}
      if(this.waiting.length>=this.maxWaiting){reject(Object.assign(new Error('Decision queue is full'),{code:'DECISION_BUSY'}));return;}
      signal.addEventListener('abort',cancel,{once:true});this.waiting.push(entry);
    });
  }
}
