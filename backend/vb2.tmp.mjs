const candidates = [
  ["groww","greenhouse","groww"], ["zetwerk","greenhouse","zetwerk"],
  ["chargebee","greenhouse","chargebee"], ["freshworks","greenhouse","freshworks-eng"],
  ["hasura","greenhouse","hasura"], ["cred","greenhouse","cred"],
  ["slice","greenhouse","slice"], ["browserstack","greenhouse","browserstack"],
  ["mongo","greenhouse","mongodb"], ["razorpay2","greenhouse","razorpaysoftware"],
  ["sprinklr","greenhouse","sprinklr"], ["innovaccer","greenhouse","innovaccer"],
  ["dream11","greenhouse","dream11"], ["upgrad","greenhouse","upgrad"],
  ["swiggy2","greenhouse","swiggy2"], ["meesho2","ashby","meesho"],
  ["razorpay3","ashby","razorpay"], ["zerodha","ashby","zerodha"],
  ["postman2","ashby","postman"], ["exotel","ashby","exotel"],
  ["chargebee2","ashby","chargebee"], ["jupiter","ashby","jupiter"],
  ["cred2","ashby","cred"], ["slice2","ashby","slice"],
  ["groww2","ashby","groww"], ["zerodha2","lever","zerodha"],
  ["meesho3","lever","meesho"], ["browserstack2","lever","browserstack"],
];
const url = (p,id)=>({greenhouse:`https://boards-api.greenhouse.io/v1/boards/${id}/jobs`,lever:`https://api.lever.co/v0/postings/${id}?mode=json`,ashby:`https://api.ashbyhq.com/posting-api/job-board/${id}`})[p];
for (const [name,provider,id] of candidates) {
  try {
    const r = await fetch(url(provider,id), { headers:{Accept:"application/json"} });
    if (r.status !== 200) { console.log(`${name}|${provider}|${id} -> HTTP ${r.status}`); continue; }
    const b = await r.json();
    const n = Array.isArray(b)?b.length:Array.isArray(b.jobs)?b.jobs.length:Array.isArray(b.postings)?b.postings.length:null;
    console.log(`>>> ${name}|${provider}|${id} -> HTTP 200, ${n} listings`);
  } catch(e){ console.log(`${name}|${provider}|${id} -> ERR`); }
}
