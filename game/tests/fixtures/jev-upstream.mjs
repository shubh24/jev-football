// Isolated server test: no requests reach JEV.
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://api.typesafe.ai/v1/systemone')return original(url,options);
 const payload=JSON.parse(options.body);
 await new Promise(resolve=>setTimeout(resolve,140));
 if(options.signal.aborted)throw options.signal.reason;
 const answers=Object.fromEntries(Object.entries(payload.questions).map(([key,q])=>{
  const keys=Object.keys(q.criteria),choice=keys[0];
  return [key,{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];
 }));
 return Response.json({answers});
};
