"use strict";

const APP_VERSION = "Mobile V1.1.5";
const BASELINE_RELEASE = {
  schemaVersion: 2,
  bankVersion: "2026.08.1",
  publishedAt: "2026-08-24T15:45:00+07:00",
  questionCount: 4967,
  newCount: 0,
  updatedCount: 0,
  banksUrl: "./release/2026.08.1/banks.json",
  manifestUrl: "./release/2026.08.1/manifest.json"
};
const LATEST_URL = "./release/latest.json";
const EXAM_SECONDS = 45 * 60;
const ACTIVE_RELEASE_KEY = "luyenthi:activeRelease";
const LAST_RESULT_KEY = "luyenthi:lastResult";

const GROUP_B = ["khdn","khcn","tham_dinh","ktgd_noi_bo","ktgd_khach_hang","ttqt_tttm","xu_ly_no"];
const GROUP_C = ["kh_qlrr","ktgsnb","cntt","nhan_su_tien_luong","phap_che","xdcb_qthc","van_thu_le_tan","tien_te_kho_quy"];
const GROUP_A = [...GROUP_B, ...GROUP_C];
const CATEGORY_NAMES = {
  organization_culture: "Mô hình tổ chức, điều lệ, văn hóa Agribank",
  products_services: "Sản phẩm dịch vụ Agribank",
  labor_rules: "Nội quy lao động",
  banking_law: "Pháp luật liên quan hoạt động ngân hàng",
  communication_customer_care: "Giao tiếp, chăm sóc và phát triển khách hàng",
  digital_transformation: "Chuyển đổi số",
  management_skills: "Kỹ năng quản lý, lãnh đạo",
  transaction_style: "Tiêu chuẩn phong cách giao dịch"
};
const BLUEPRINTS = {
  A: {
    name: "Lao động giữ chức danh, chức vụ",
    allowed: GROUP_A,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:2,
      management_skills:5, banking_law:4,
      communication_customer_care:4, digital_transformation:3
    }
  },
  B: {
    name: "Lao động chuyên môn nghiệp vụ - nhóm 7 vị trí",
    allowed: GROUP_B,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      transaction_style:3, digital_transformation:3
    }
  },
  C: {
    name: "Lao động chuyên môn/thừa hành, phục vụ - nhóm vị trí còn lại",
    allowed: GROUP_C,
    specialist: 75,
    general: {
      organization_culture:3, products_services:5, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      digital_transformation:5
    }
  }
};

const $ = sel => document.querySelector(sel);
const app = () => $("#app");
const header = () => $("#sessionHeader");
let ACTIVE_RELEASE = null;
let ACTIVE_DATA = null;
let CURRENT_DATA = null;
let currentSession = null;
let timerHandle = null;
let deferredInstallPrompt = null;
let homeMode = "home";
let pendingUpdate = null;
const releaseCache = new Map();

function esc(text){
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[ch]);
}
function uid(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
function hash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function shuffledCopy(arr, seedStr){
  const out=[...arr], rnd=mulberry32(hash32(seedStr));
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
function sample(arr,n,seed){ return shuffledCopy(arr,seed).slice(0,n); }
function normalizeVN(text){
  return String(text??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/\s+/g," ").trim();
}
function optionMode(q){
  if(!q.shuffleOptions) return "FIXED";
  const texts=q.options.map(o=>normalizeVN(o.text));
  const referencesLabels=texts.some(t => /\b(ca|dap an|phuong an)\b[^|]*(\b[abcd]\b.*\b[abcd]\b|\b[1-4]\b.*\b[1-4]\b)/i.test(t));
  if(referencesLabels) return "FIXED";
  const allAbove=texts.some(t => /^(tat ca|toan bo).*(dap an|phuong an).*(tren|neu tren)/i.test(t));
  if(allAbove) return "SHUFFLE_EXCEPT_LAST";
  return "SHUFFLE_ALL";
}
function optionView(q,sessionId){
  const mode=optionMode(q);
  let options=[...q.options];
  if(mode==="SHUFFLE_ALL") options=shuffledCopy(options,`${sessionId}|${q.id}`);
  if(mode==="SHUFFLE_EXCEPT_LAST"){
    const anchored=options.filter(o=>/^(tat ca|toan bo).*(dap an|phuong an).*(tren|neu tren)/i.test(normalizeVN(o.text)));
    const normal=options.filter(o=>!anchored.includes(o));
    options=[...shuffledCopy(normal,`${sessionId}|${q.id}`),...anchored];
  }
  return options.map((o,i)=>({...o,displayLabel:"ABCDEF"[i]}));
}
function formatDate(iso){
  try{return new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(iso));}catch{return "";}
}
function formatPercent(value){ return `${value.toFixed(1).replace(".",",")}%`; }
function storageKeyPractice(bankId,newOnly=false){ return `practice:${newOnly?"new:":""}${bankId}`; }
function storageKeyExam(group,bankId){ return `exam:${group}:${bankId}`; }
function saveSession(session){ session.savedAt=Date.now(); localStorage.setItem(`luyenthi:${session.storageKey}`,JSON.stringify(session)); }
function deleteSession(storageKey){ localStorage.removeItem(`luyenthi:${storageKey}`); }
function loadSession(storageKey){
  const raw=localStorage.getItem(`luyenthi:${storageKey}`); if(!raw)return null;
  try{
    const s=JSON.parse(raw);
    if(!s.bankVersion){ s.bankVersion=BASELINE_RELEASE.bankVersion; s.banksUrl=BASELINE_RELEASE.banksUrl; }
    return s;
  }catch{return null;}
}
function allSavedSessions(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith("luyenthi:")) continue;
    if([ACTIVE_RELEASE_KEY,LAST_RESULT_KEY].includes(key)) continue;
    try{
      const s=JSON.parse(localStorage.getItem(key));
      if(s?.kind && !s.completed && !s.submitted){
        if(!s.bankVersion){s.bankVersion=BASELINE_RELEASE.bankVersion;s.banksUrl=BASELINE_RELEASE.banksUrl;}
        out.push(s);
      }
    }catch{}
  }
  return out.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
}
function saveLastResult(result){ result.completedAt=Date.now(); localStorage.setItem(LAST_RESULT_KEY,JSON.stringify(result)); }
function loadLastResult(){ try{return JSON.parse(localStorage.getItem(LAST_RESULT_KEY)||"null");}catch{return null;} }
function releaseMetaForSession(session){
  return {bankVersion:session.bankVersion||BASELINE_RELEASE.bankVersion,banksUrl:session.banksUrl||BASELINE_RELEASE.banksUrl};
}
async function sha256Hex(buffer){
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function fetchJson(url,opts={}){
  const res=await fetch(url,opts);
  if(!res.ok) throw new Error(`Không tải được ${url} (${res.status})`);
  return res.json();
}
async function loadRelease(meta,verifyChecksum=false){
  const version=meta.bankVersion;
  if(releaseCache.has(version)) return releaseCache.get(version);
  const res=await fetch(meta.banksUrl);
  if(!res.ok) throw new Error(`Không tải được ngân hàng ${version}.`);
  const buffer=await res.arrayBuffer();
  if(verifyChecksum && meta.checksumSha256){
    const got=await sha256Hex(buffer);
    if(got!==meta.checksumSha256) throw new Error("Checksum ngân hàng không hợp lệ.");
  }
  const text=new TextDecoder("utf-8").decode(buffer);
  const data=JSON.parse(text);
  if(!data.banks || !data.manifest || !data.bankVersion) throw new Error("Cấu trúc Bank Release không hợp lệ.");
  releaseCache.set(version,data);
  return data;
}
async function setActiveRelease(meta){
  const data=await loadRelease(meta,true);
  ACTIVE_RELEASE={...meta};
  ACTIVE_DATA=data;
  CURRENT_DATA=ACTIVE_DATA;
  localStorage.setItem(ACTIVE_RELEASE_KEY,JSON.stringify(ACTIVE_RELEASE));
}
function activeReleaseFromStorage(){
  try{return JSON.parse(localStorage.getItem(ACTIVE_RELEASE_KEY)||"null")||BASELINE_RELEASE;}catch{return BASELINE_RELEASE;}
}
function bank(bankId){ return CURRENT_DATA.banks[bankId]; }
function manifest(){ return CURRENT_DATA.manifest; }
function specialistManifest(){ return manifest().filter(x=>x.group==="Chuyên môn nghiệp vụ"); }
function supportManifest(){ return manifest().filter(x=>x.group!=="Chuyên môn nghiệp vụ"); }
function bankNewCount(bankId){ return bank(bankId)?.meta?.newCount||0; }

function practiceState(session,qid){
  if(!session.states[qid]) session.states[qid]={selectedOptionId:null,locked:false,isCorrect:null,correctOptionId:null,flagged:false};
  return session.states[qid];
}
function practiceStatus(session,qid){ const s=practiceState(session,qid); if(s.locked)return s.isCorrect?"correct":"wrong"; return s.selectedOptionId?"selected":"blank"; }
function practiceCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{c[practiceStatus(session,qid)]++;if(practiceState(session,qid).flagged)c.flagged++;});
  return c;
}
function examState(session,qid){
  if(!session.states[qid]) session.states[qid]={selectedOptionId:null,flagged:false,isCorrect:null};
  return session.states[qid];
}
function examStatus(session,qid){
  const s=examState(session,qid);
  if(session.submitted){ if(!s.selectedOptionId)return "blank"; return s.isCorrect?"correct":"wrong"; }
  return s.selectedOptionId?"selected":"blank";
}
function examCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{c[examStatus(session,qid)]++;if(examState(session,qid).flagged)c.flagged++;});
  return c;
}
function questionLookup(session){
  if(session.kind==="practice") return Object.fromEntries(bank(session.bankId).questions.map(q=>[q.id,q]));
  return Object.fromEntries(session.questions.map(q=>[q.id,q]));
}
function currentQuestion(session){ return questionLookup(session)[session.questionIds[session.index]]; }
function remainingSeconds(session){ return Math.max(0,Math.ceil((session.deadline-Date.now())/1000)); }

function newPractice(bankId,mode,newOnly=false){
  let questions=bank(bankId).questions;
  if(newOnly) questions=questions.filter(q=>q.releaseStatus==="NEW");
  let ids=questions.map(q=>q.id);
  const sessionId=uid("practice"); if(mode==="Ngẫu nhiên")ids=shuffledCopy(ids,sessionId);
  return {
    version:"1.1",kind:"practice",sessionId,storageKey:storageKeyPractice(bankId,newOnly),
    bankVersion:CURRENT_DATA.bankVersion,banksUrl:ACTIVE_RELEASE.banksUrl,
    bankId,bankName:bank(bankId).meta.name,mode,newOnly,questionIds:ids,index:0,states:{},completed:false
  };
}
function buildExam(groupCode,bankId){
  const bp=BLUEPRINTS[groupCode]; if(!bp.allowed.includes(bankId))throw new Error("Nghiệp vụ không thuộc đối tượng thi đã chọn.");
  const seed=uid("paper"),selected=[];
  sample(bank(bankId).questions,bp.specialist,`${seed}|specialist`).forEach(q=>selected.push({...q,examSource:"specialist"}));
  const general=bank("kien_thuc_chung").questions;
  for(const [category,count] of Object.entries(bp.general)){
    let pool;
    if(category==="management_skills")pool=bank("ky_nang_quan_ly").questions;
    else if(category==="transaction_style")pool=bank("tac_phong_gdv").questions;
    else pool=general.filter(q=>q.examCategory===category);
    if(pool.length<count)throw new Error(`Không đủ câu cho ${CATEGORY_NAMES[category]||category}.`);
    sample(pool,count,`${seed}|${category}`).forEach(q=>selected.push({...q,examSource:category}));
  }
  if(selected.length!==100)throw new Error(`Đề có ${selected.length} câu, không phải 100.`);
  if(new Set(selected.map(q=>q.id)).size!==100)throw new Error("Đề có câu trùng.");
  return selected;
}
function newExam(groupCode,bankId){
  const questions=buildExam(groupCode,bankId),sessionId=uid("exam"),now=Date.now();
  return {
    version:"1.1",kind:"exam",sessionId,storageKey:storageKeyExam(groupCode,bankId),
    bankVersion:CURRENT_DATA.bankVersion,banksUrl:ACTIVE_RELEASE.banksUrl,
    groupCode,candidateGroup:BLUEPRINTS[groupCode].name,bankId,bankName:bank(bankId).meta.name,
    questionIds:shuffledCopy(questions.map(q=>q.id),sessionId),index:0,states:{},submitted:false,score:null,breakdown:{},
    startedAt:now,deadline:now+EXAM_SECONDS*1000,questions
  };
}
function submitExam(session){
  if(session.submitted)return;
  const lookup=questionLookup(session);let score=0;const breakdown={};
  session.questionIds.forEach(qid=>{
    const q=lookup[qid],s=examState(session,qid),correct=q.options.find(o=>o.correct);
    s.isCorrect=!!s.selectedOptionId&&s.selectedOptionId===correct.id;s.flagged=false;if(s.isCorrect)score++;
    const src=q.examSource||"specialist"; if(!breakdown[src])breakdown[src]={total:0,correct:0}; breakdown[src].total++;if(s.isCorrect)breakdown[src].correct++;
  });
  session.submitted=true;session.score=score;session.breakdown=breakdown;saveSession(session);
}

function renderHeader(){
  if(!currentSession){ header().innerHTML=""; $("#subBrand").textContent=`${APP_VERSION} · Bank ${ACTIVE_RELEASE?.bankVersion||""}`; return; }
  $("#subBrand").textContent=currentSession.kind==="exam"?currentSession.candidateGroup:currentSession.bankName;
  const n=currentSession.index+1,total=currentSession.questionIds.length;
  if(currentSession.kind==="exam"&&!currentSession.submitted){
    const r=remainingSeconds(currentSession),mm=String(Math.floor(r/60)).padStart(2,"0"),ss=String(r%60).padStart(2,"0");
    header().innerHTML=`<span>${n}/100</span><span>⏱ ${mm}:${ss}</span>`;
  }else header().innerHTML=`<span>${n}/${total}</span>`;
}
function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null;}}
function startTimer(){
  stopTimer();if(!currentSession||currentSession.kind!=="exam"||currentSession.submitted)return;
  timerHandle=setInterval(()=>{
    if(!currentSession)return;
    if(remainingSeconds(currentSession)<=0){submitExam(currentSession);deleteSession(currentSession.storageKey);stopTimer();renderExamResult();}
    else renderHeader();
  },1000);
}
async function activateSession(session){
  currentSession=session;
  const meta=releaseMetaForSession(session);
  CURRENT_DATA=await loadRelease(meta,false);
  if(session.kind==="exam"&&remainingSeconds(session)<=0&&!session.submitted){submitExam(session);deleteSession(session.storageKey);renderExamResult();return;}
  renderSession();
}
function goHome(){stopTimer();currentSession=null;CURRENT_DATA=ACTIVE_DATA;homeMode="home";renderHome();}

function recentResumeCard(){
  const sessions=allSavedSessions(); if(!sessions.length)return "";
  const s=sessions[0];
  let text="";
  if(s.kind==="practice"){
    const c=practiceCounts(s);text=`${c.correct+c.wrong}/${s.questionIds.length} câu đã chấm`;
  }else{
    if(remainingSeconds(s)<=0)return "";
    const c=examCounts(s);text=`${c.selected}/100 câu đã chọn`;
  }
  return `<section class="panel soft">
    <div class="row between"><div><div class="eyebrow">TIẾP TỤC GẦN NHẤT</div><div class="strong mt8">${esc(s.bankName)}</div><div class="small mt8">${esc(text)}</div></div>
    <button class="btn3d primary" id="resumeLatest">Tiếp tục</button></div>
  </section>`;
}
function lastResultCard(){
  const r=loadLastResult();if(!r)return "";
  const when=new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(r.completedAt));
  if(r.kind==="practice") return `<section class="panel"><div class="row between"><div><div class="section-title">Kết quả lần gần nhất</div><div class="strong">${esc(r.bankName)}</div><div class="small mt8">Đúng ${r.correct}/${r.graded} · ${formatPercent(r.percent)} · ${when}</div></div><span class="badge primary">Luyện tập</span></div></section>`;
  return `<section class="panel"><div class="row between"><div><div class="section-title">Kết quả lần gần nhất</div><div class="strong">${esc(r.bankName)}</div><div class="small mt8">${esc(r.candidateGroup)} · ${r.score}/100 · ${when}</div></div><span class="badge primary">Thi thử</span></div></section>`;
}
function installCard(){
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone;
  if(standalone)return "";
  return `<section class="notice info"><b>Cài để dùng offline</b><div class="mt8">Android: Chrome → Cài ứng dụng. iPhone/iPad: Safari → Chia sẻ → Thêm vào Màn hình chính.</div><button class="btn primary mt8 hidden" id="installBtn">Cài ứng dụng</button></section>`;
}
function renderHome(){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  renderHeader();const newTotal=Object.values(ACTIVE_DATA.banks).reduce((n,b)=>n+(b.meta.newCount||0),0);
  app().innerHTML=`${installCard()}${recentResumeCard()}
  <section class="panel">
    <div class="row between"><div><div class="eyebrow">NGÂN HÀNG HIỆN HÀNH</div><div class="title mt8">Bank ${esc(ACTIVE_RELEASE.bankVersion)}</div></div><span class="badge ${newTotal?"new":"primary"}">${newTotal?`🆕 ${newTotal} câu mới`:`${ACTIVE_RELEASE.questionCount} câu`}</span></div>
    <div class="small mt8">Phát hành ${formatDate(ACTIVE_RELEASE.publishedAt)} · ${ACTIVE_RELEASE.questionCount} câu</div>
  </section>
  <section class="grid2">
    <button class="btn3d action-card" id="goPractice"><div class="action-icon">📘</div><div class="action-title">Luyện tập</div><div class="action-sub">Chuyên môn hoặc kiến thức chung/phụ trợ</div></button>
    <button class="btn3d action-card" id="goExam"><div class="action-icon">⏱️</div><div class="action-title">Thi thử</div><div class="action-sub">100 câu · 45 phút · theo đối tượng thi</div></button>
    <button class="btn3d action-card" id="goNew" ${newTotal===0?"disabled":""}><div class="action-icon">🆕</div><div class="action-title">Luyện câu mới</div><div class="action-sub">${newTotal?`${newTotal} câu mới theo từng nghiệp vụ`:"Không có câu mới"}</div></button>
    <button class="btn3d action-card" id="goUpdate"><div class="action-icon">⬇️</div><div class="action-title">Cập nhật ngân hàng</div><div class="action-sub">Kiểm tra Bank Release mới</div></button>
  </section>
  ${lastResultCard()}
  <div class="center tiny mt12">Hoạt động offline · Tiến độ lưu trên thiết bị</div>`;
  $("#goPractice").onclick=()=>renderPracticeSetup(false);$("#goExam").onclick=()=>renderExamSetup();$("#goUpdate").onclick=()=>renderUpdate();
  if(newTotal>0)$("#goNew").onclick=()=>renderPracticeSetup(true);
  const latest=allSavedSessions()[0];if(latest&&$("#resumeLatest"))$("#resumeLatest").onclick=()=>activateSession(latest);
  const ib=$("#installBtn");if(ib&&deferredInstallPrompt){ib.classList.remove("hidden");ib.onclick=async()=>{deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;};}
}

function groupButtons(selected){
  return `<div class="grid2">
    <button class="btn3d action-card ${selected==="specialist"?"choice-card selected":""}" data-group="specialist"><div class="action-icon">📘</div><div class="action-title">Chuyên môn nghiệp vụ</div><div class="action-sub">Các nghiệp vụ chuyên môn</div></button>
    <button class="btn3d action-card ${selected==="support"?"choice-card selected":""}" data-group="support"><div class="action-icon">📚</div><div class="action-title">Kiến thức chung / Phụ trợ</div><div class="action-sub">Kiến thức chung, quản lý, tác phong</div></button>
  </div>`;
}
function renderPracticeSetup(newOnly=false,selectedGroup="specialist"){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  CURRENT_DATA=ACTIVE_DATA;
  let items=(selectedGroup==="specialist"?specialistManifest():supportManifest());
  if(newOnly)items=items.filter(x=>bankNewCount(x.id)>0);
  const title=newOnly?"Luyện câu mới":"Luyện tập";
  const list=items.length?items.map(x=>`<button class="btn3d choice-card" data-bank="${x.id}"><div class="strong">${esc(x.name)}</div><div class="small mt8">${newOnly?`${bankNewCount(x.id)} câu mới`: `${bank(x.id).questions.length} câu`}</div></button>`).join(""):`<div class="notice">Không có nghiệp vụ nào có câu mới trong nhóm này.</div>`;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">${title}</div><div class="title mt8">Chọn nội dung</div></div></div></section>
  ${groupButtons(selectedGroup)}
  <section class="panel mt12"><div class="section-title">${selectedGroup==="specialist"?"Chuyên môn nghiệp vụ":"Kiến thức chung / Phụ trợ"}</div><div class="choice-list">${list}</div></section>`;
  $("#backHome").onclick=renderHome;document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderPracticeSetup(newOnly,b.dataset.group));
  document.querySelectorAll("[data-bank]").forEach(b=>b.onclick=()=>renderPracticeMode(b.dataset.bank,newOnly));
}
function renderPracticeMode(bankId,newOnly){
  const count=newOnly?bankNewCount(bankId):bank(bankId).questions.length;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backSetup">‹</button><div><div class="eyebrow">${newOnly?"Luyện câu mới":"Luyện tập"}</div><div class="title mt8">${esc(bank(bankId).meta.name)}</div></div></div></section>
  <section class="panel"><div class="section-title">Cách luyện</div><div class="grid2"><button class="btn3d choice-card selected" data-mode="Theo thứ tự">✓ Theo thứ tự</button><button class="btn3d choice-card" data-mode="Ngẫu nhiên">Ngẫu nhiên</button></div>
  <div class="panel soft mt16"><div class="eyebrow">ĐÃ CHỌN</div><div class="strong mt8">${esc(bank(bankId).meta.name)}</div><div class="small mt8">${count} câu${newOnly?" mới":""} · <span id="modeSummary">Luyện theo thứ tự</span></div></div>
  <button class="btn3d primary mt12" style="width:100%" id="startPractice">Bắt đầu luyện</button></section>`;
  let mode="Theo thứ tự";document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("selected",x===b));$("#modeSummary").textContent=`Luyện ${mode.toLowerCase()}`;});
  $("#backSetup").onclick=()=>renderPracticeSetup(newOnly,manifest().find(x=>x.id===bankId).group==="Chuyên môn nghiệp vụ"?"specialist":"support");
  $("#startPractice").onclick=()=>{
    const key=storageKeyPractice(bankId,newOnly);if(loadSession(key)&&!confirm("Đang có phiên đã lưu. Tạo phiên mới sẽ thay thế phiên cũ. Tiếp tục?"))return;
    const s=newPractice(bankId,mode,newOnly);if(!s.questionIds.length){alert("Không có câu phù hợp.");return;}delete s.reviewOnly;deleteSession(key);saveSession(s);activateSession(s);
  };
}

function examStructureHtml(bp){
  return `<div class="list-lines">
    ${Object.entries(bp.general).map(([cat,n])=>`<div class="list-line"><span>${esc(CATEGORY_NAMES[cat])}</span><b>${n} câu</b></div>`).join("")}
    <div class="list-line total"><span><b>Tổng Kiến thức chung / Phụ trợ</b></span><b>25 câu</b></div>
    <div class="list-line"><span>Chuyên môn nghiệp vụ</span><b>75 câu</b></div>
    <div class="list-line total"><span><b>Tổng đề thi</b></span><b>100 câu · 45 phút</b></div>
  </div>`;
}

function renderExamSetup(selectedGroup="specialist",groupCode="A",bankId=null){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  CURRENT_DATA=ACTIVE_DATA;

  // Nhánh Kiến thức chung / Phụ trợ trong Thi thử chỉ dùng để xem cơ cấu.
  // Không chọn đối tượng, không chọn nghiệp vụ và không tạo đề tại đây.
  if(selectedGroup==="support"){
    const structures = Object.entries(BLUEPRINTS).map(([code,bp])=>`
      <section class="panel">
        <div class="eyebrow">${esc(bp.name)}</div>
        <div class="section-title mt8">Cơ cấu 25 câu Kiến thức chung / Phụ trợ</div>
        <div class="mt12">${examStructureHtml(bp)}</div>
      </section>
    `).join("");

    app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">THI THỬ</div><div class="title mt8">Cơ cấu đề thi</div></div></div></section>
    ${groupButtons("support")}
    <section class="notice info"><b>Kiến thức chung / Phụ trợ không tạo đề thi độc lập.</b><div class="mt8">Đối tượng thi và chuyên đề/nghiệp vụ được chọn tại mục <b>Chuyên môn nghiệp vụ</b>. Hệ thống sẽ tự ghép 25 câu Kiến thức chung / Phụ trợ theo đúng cơ cấu của đối tượng đã chọn.</div></section>
    ${structures}`;

    $("#backHome").onclick=renderHome;
    document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderExamSetup(b.dataset.group,groupCode,bankId));
    return;
  }

  // Nhánh Chuyên môn nghiệp vụ:
  // 1. Chọn đối tượng thi trước.
  // 2. Sau đó chỉ hiện các chuyên đề/nghiệp vụ phù hợp với đối tượng đó.
  const bp=BLUEPRINTS[groupCode];
  const specialists=specialistManifest().filter(x=>bp.allowed.includes(x.id));
  if(!bankId||!specialists.some(x=>x.id===bankId)) bankId=specialists[0]?.id || null;

  const candidateButtons=Object.entries(BLUEPRINTS).map(([k,v])=>
    `<button class="btn3d choice-card ${k===groupCode?"selected":""}" data-candidate="${k}">
      <div class="strong">${k===groupCode?"✓ ":""}${esc(v.name)}</div>
    </button>`
  ).join("");

  const subjectButtons=specialists.length
    ? specialists.map(x=>
      `<button class="btn3d choice-card ${x.id===bankId?"selected":""}" data-exam-bank="${x.id}">
        <div class="strong">${x.id===bankId?"✓ ":""}${esc(x.name)}</div>
        <div class="small mt8">75 câu chuyên môn trong đề</div>
      </button>`
    ).join("")
    : `<div class="notice">Không có chuyên đề/nghiệp vụ phù hợp với đối tượng này.</div>`;

  const selectedSubject = bankId ? bank(bankId)?.meta.name || "" : "";

  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">THI THỬ</div><div class="title mt8">Tạo đề thi</div></div></div></section>
  ${groupButtons("specialist")}

  <section class="panel mt12">
    <div class="section-title">1. Đối tượng thi</div>
    <div class="choice-list mt12">${candidateButtons}</div>
  </section>

  <section class="panel">
    <div class="section-title">2. Chuyên đề / nghiệp vụ thi</div>
    <div class="small mt8">Danh sách được lọc theo đối tượng thi đã chọn.</div>
    <div class="choice-list mt12">${subjectButtons}</div>
  </section>

  <section class="panel">
    <div class="section-title">3. Cơ cấu Kiến thức chung / Phụ trợ</div>
    <div class="mt12">${examStructureHtml(bp)}</div>
  </section>

  <section class="panel soft center">
    <div class="eyebrow">ĐỀ SẼ TẠO</div>
    <div class="strong mt8">ĐỀ THI NGHIỆP VỤ<br>${esc(selectedSubject.toUpperCase())}</div>
    <div class="small strong mt8">${esc(bp.name)}</div>
    <div class="small mt12"><b>100</b> câu · <b>45</b> phút</div>
  </section>

  <button class="btn3d primary" style="width:100%" id="startExam" ${!bankId?"disabled":""}>Tạo đề & bắt đầu thi</button>
  <div class="center tiny mt8">Thời gian bắt đầu tính ngay khi đề được tạo.</div>`;

  $("#backHome").onclick=renderHome;
  document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderExamSetup(b.dataset.group,groupCode,bankId));

  // Khi đổi đối tượng, bankId được reset để danh sách chuyên đề được lọc lại từ đầu.
  document.querySelectorAll("[data-candidate]").forEach(b=>b.onclick=()=>renderExamSetup("specialist",b.dataset.candidate,null));

  document.querySelectorAll("[data-exam-bank]").forEach(b=>b.onclick=()=>renderExamSetup("specialist",groupCode,b.dataset.examBank));

  $("#startExam").onclick=()=>{
    const key=storageKeyExam(groupCode,bankId);
    const existing=loadSession(key);
    if(existing&&!confirm("Đang có bài thi đã lưu. Tạo đề mới sẽ thay thế bài cũ. Tiếp tục?")) return;
    try{
      deleteSession(key);
      const s=newExam(groupCode,bankId);
      saveSession(s);
      activateSession(s);
    }catch(e){
      alert(e.message);
    }
  };
}

function renderNavigator(session){
  const ids=session.questionIds;return `<div class="navigator-wrap"><div class="row between"><div class="section-title">Trạng thái câu hỏi</div><div class="tiny">10 câu / hàng</div></div>
  <div class="legend"><span>□ Chưa làm</span><span>■ Đã chọn</span>${session.kind==="practice"?"<span>● Đúng</span><span>● Sai</span>":""}<span>⚑ Đánh dấu</span></div>
  <div class="navigator">${ids.map((qid,i)=>{const status=session.kind==="practice"?practiceStatus(session,qid):examStatus(session,qid);const state=session.kind==="practice"?practiceState(session,qid):examState(session,qid);return `<button class="nav-btn ${status} ${state.flagged?"flagged":""} ${i===session.index?"current":""}" data-jump="${i}">${i+1}</button>`;}).join("")}</div></div>`;
}
function questionTitle(session){
  if(session.kind==="exam")return `<div class="eyebrow">ĐỀ THI NGHIỆP VỤ ${esc(session.bankName.toUpperCase())}</div><div class="small strong mt8">${esc(session.candidateGroup)}</div>`;
  return `<div class="eyebrow">${session.newOnly?"LUYỆN CÂU MỚI":"LUYỆN TẬP"}</div><div class="small strong mt8">${esc(session.bankName)}</div>`;
}

function practiceReviewIndices(session){
  if(session.reviewOnly!=="wrong") return null;
  return session.questionIds
    .map((qid,index)=>practiceStatus(session,qid)==="wrong"?index:null)
    .filter(index=>index!==null);
}

function adjacentPracticeReviewIndex(session,direction){
  const indices=practiceReviewIndices(session);
  if(!indices||!indices.length) return null;
  const pos=indices.indexOf(session.index);
  if(pos<0) return indices[0];
  const nextPos=pos+direction;
  if(nextPos<0||nextPos>=indices.length) return null;
  return indices[nextPos];
}

let actionBarResizeObserver = null;
let actionBarScrollTimer = null;


function scrollFeedbackAboveActionBar(){
  const feedback=document.querySelector("[data-feedback-anchor]");
  if(!feedback) return;
  const bar=document.querySelector(".session-actionbar");
  const topbar=document.querySelector(".topbar");
  const barHeight=bar?.getBoundingClientRect().height || 0;
  const topbarHeight=topbar?.getBoundingClientRect().height || 0;
  const viewportHeight=window.innerHeight || document.documentElement.clientHeight;
  const topLimit=topbarHeight+10;
  const bottomLimit=viewportHeight-barHeight-12;
  const rect=feedback.getBoundingClientRect();
  const available=Math.max(80,bottomLimit-topLimit);

  // Nếu khối kết quả ngắn: đặt mép dưới ngay trên thanh nút.
  // Nếu khối giải thích dài: đặt đầu khối ngay dưới header để người dùng đọc từ đầu.
  const desiredTop=rect.height<=available ? bottomLimit-rect.height : topLimit;
  const delta=rect.top-desiredTop;
  window.scrollTo({top:Math.max(0,window.scrollY+delta),behavior:"smooth"});
}
function scrollQuestionToTop(){
  const target = document.querySelector("[data-question-anchor]");
  if(!target) return;
  const topbar = document.querySelector(".topbar");
  const offset = (topbar?.getBoundingClientRect().height || 0) + 8;
  const top = window.scrollY + target.getBoundingClientRect().top - offset;
  window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
}

function goToQuestionIndex(session,index){
  session.index=Math.max(0,Math.min(index,session.questionIds.length-1));
  saveSession(session);
  renderSession();
  requestAnimationFrame(()=>requestAnimationFrame(scrollQuestionToTop));
}

function bindSessionActionBar(){
  const bar=document.querySelector(".session-actionbar");
  if(!bar) return;

  const updateHeight=()=>{
    const h=Math.ceil(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--session-actionbar-height",`${h}px`);
  };
  updateHeight();

  if(actionBarResizeObserver) actionBarResizeObserver.disconnect();
  if("ResizeObserver" in window){
    actionBarResizeObserver=new ResizeObserver(updateHeight);
    actionBarResizeObserver.observe(bar);
  }

  const onScroll=()=>{
    bar.classList.add("is-scrolling");
    if(actionBarScrollTimer) clearTimeout(actionBarScrollTimer);
    actionBarScrollTimer=setTimeout(()=>bar.classList.remove("is-scrolling"),360);
  };
  window.removeEventListener("scroll",window.__luyenthiScrollHandler||(()=>{}));
  window.__luyenthiScrollHandler=onScroll;
  window.addEventListener("scroll",onScroll,{passive:true});
}

function unbindSessionActionBar(){
  if(actionBarResizeObserver){
    actionBarResizeObserver.disconnect();
    actionBarResizeObserver=null;
  }
  if(actionBarScrollTimer){
    clearTimeout(actionBarScrollTimer);
    actionBarScrollTimer=null;
  }
  if(window.__luyenthiScrollHandler){
    window.removeEventListener("scroll",window.__luyenthiScrollHandler);
    window.__luyenthiScrollHandler=null;
  }
  document.documentElement.style.removeProperty("--session-actionbar-height");
}
function renderSession(){
  document.body.classList.add("session-mode");
  renderHeader();const s=currentSession,q=currentQuestion(s);if(!q){app().innerHTML=`<section class="notice error">Không tìm thấy câu hỏi trong Bank ${esc(s.bankVersion)}.</section>`;return;}
  if(s.kind==="exam"&&!s.submitted&&remainingSeconds(s)<=0){submitExam(s);deleteSession(s.storageKey);renderExamResult();return;}
  const options=optionView(q,s.sessionId),state=s.kind==="practice"?practiceState(s,q.id):examState(s,q.id),locked=s.kind==="practice"&&state.locked;
  let feedback="";
  if(s.kind==="practice"&&locked){
    const chosen=q.options.find(o=>o.id===state.selectedOptionId);
    const correct=q.options.find(o=>o.correct);
    const explanation=q.explanation||q.reference||q.source||"";
    if(state.isCorrect){
      feedback=`<div class="feedback ok" data-feedback-anchor><b>✅ Chính xác!</b><div class="small mt8">Đáp án đúng: ${esc(correct?.text||"")}</div>${explanation?`<div class="feedback-explanation mt8"><b>Giải thích:</b> ${esc(explanation)}</div>`:""}</div>`;
    }else{
      feedback=`<div class="feedback bad" data-feedback-anchor><b>❌ Không chính xác.</b><div class="small mt8">Bạn chọn: ${esc(chosen?.text||"")}<br>Đáp án đúng: ${esc(correct?.text||"")}</div>${explanation?`<div class="feedback-explanation mt8"><b>Giải thích:</b> ${esc(explanation)}</div>`:""}</div>`;
    }
  }
  const newBadge=q.releaseStatus==="NEW"?`<span class="badge new">🆕 Mới</span>`:"";
  app().innerHTML=`<section class="panel" data-question-anchor>${questionTitle(s)}<div class="question-head mt12"><span class="badge primary">Câu ${s.index+1}</span>${newBadge}</div><div class="question">${esc(q.question)}</div>
  <div class="options">${options.map(o=>`<label class="option ${state.selectedOptionId===o.id?"selected":""}"><input type="radio" name="answer" value="${o.id}" ${state.selectedOptionId===o.id?"checked":""} ${locked?"disabled":""}><span class="letter">${o.displayLabel}</span><span class="option-text">${esc(o.text)}</span></label>`).join("")}</div>${feedback}
  </section><section class="panel">${renderNavigator(s)}</section>
  <div class="session-bottom-spacer" aria-hidden="true"></div>
  ${s.kind==="practice"?`
  <nav class="session-actionbar practice-actions" aria-label="Điều khiển luyện tập">
    <div class="action-grid practice-grid">
      <button class="btn3d" id="prev">Câu trước</button>
      <button class="btn3d primary" id="grade">Đáp án</button>
      <button class="btn3d" id="next">Câu tiếp theo</button>
      <button class="btn3d" id="flag">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
      <button class="btn3d" id="skip">Bỏ qua</button>
      <button class="btn3d" id="stop">Dừng/Kết thúc</button>
    </div>
  </nav>`:`
  <nav class="session-actionbar exam-actions" aria-label="Điều khiển thi thử">
    <div class="action-grid exam-grid">
      <button class="btn3d" id="prev">Câu trước</button>
      <button class="btn3d" id="flag">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
      <button class="btn3d" id="next">Câu tiếp theo</button>
      <button class="btn3d danger exam-stop" id="stop">Dừng / Nộp bài</button>
    </div>
  </nav>`}`;
  document.querySelectorAll('input[name="answer"]').forEach(r=>r.onchange=()=>{
    if(s.kind==="practice"){if(!state.locked){state.selectedOptionId=r.value;const g=$("#grade");if(g)g.disabled=false;}}
    else state.selectedOptionId=r.value;
    saveSession(s);renderSession();
  });
  document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>goToQuestionIndex(s,Number(b.dataset.jump)));
  if(s.kind==="practice"&&s.reviewOnly==="wrong"){
    const prevWrong=adjacentPracticeReviewIndex(s,-1);
    const nextWrong=adjacentPracticeReviewIndex(s,1);
    $("#prev").disabled=prevWrong===null;
    $("#prev").onclick=()=>{if(prevWrong!==null)goToQuestionIndex(s,prevWrong)};
    $("#next").disabled=nextWrong===null;
    $("#next").onclick=()=>{if(nextWrong!==null)goToQuestionIndex(s,nextWrong)};
  }else{
    $("#prev").disabled=s.index===0;$("#prev").onclick=()=>goToQuestionIndex(s,s.index-1);
    $("#next").disabled=s.index>=s.questionIds.length-1;$("#next").onclick=()=>goToQuestionIndex(s,s.index+1);
  }
  $("#flag").disabled=locked;$("#flag").onclick=()=>{state.flagged=!state.flagged;saveSession(s);renderSession();};
  if(s.kind==="practice"){
    $("#grade").disabled=locked||!state.selectedOptionId;$("#grade").onclick=()=>{const correct=q.options.find(o=>o.correct);state.correctOptionId=correct.id;state.isCorrect=state.selectedOptionId===correct.id;state.locked=true;state.flagged=false;saveSession(s);renderSession();requestAnimationFrame(()=>requestAnimationFrame(scrollFeedbackAboveActionBar));};
    $("#skip").disabled=locked;$("#skip").onclick=()=>{state.selectedOptionId=null;saveSession(s);if(s.index<s.questionIds.length-1)goToQuestionIndex(s,s.index+1);else renderSession();};
    $("#stop").onclick=showPracticeStop;
  }else{$("#stop").onclick=showExamStop;startTimer();}
  bindSessionActionBar();
}
function nextIndexMatching(predicate){
  const ids=currentSession.questionIds,start=currentSession.index;for(let step=1;step<=ids.length;step++){const i=(start+step)%ids.length;if(predicate(ids[i]))return i;}return null;
}
function showModal(html){const wrap=document.createElement("div");wrap.className="modal-wrap";wrap.id="modalWrap";wrap.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(wrap);}
function closeModal(){$("#modalWrap")?.remove();}
function showPracticeStop(){
  const s=currentSession,c=practiceCounts(s),graded=c.correct+c.wrong,unfinished=c.blank+c.selected;
  showModal(`<div class="eyebrow">LUYỆN TẬP</div><h3 class="mt8">Dừng / Kết thúc</h3><div class="small mt8">${esc(s.bankName)}</div>
  <div class="grid4 mt16"><div class="metric"><strong>${graded}</strong><span>Đã chấm</span></div><div class="metric"><strong>${unfinished}</strong><span>Chưa hoàn tất</span></div><div class="metric"><strong>${c.correct}</strong><span>Đúng</span></div><div class="metric"><strong>${c.wrong}</strong><span>Sai</span></div></div>
  ${c.selected?`<div class="notice mt12">Trong đó có <b>${c.selected}</b> câu đã chọn nhưng chưa bấm Đáp án.</div>`:""}
  <div class="modal-actions"><button class="btn3d primary" id="saveStop">💾 Lưu và dừng</button><button class="btn3d" id="goBlank">Câu chưa trả lời</button><button class="btn3d" id="goWrong">Xem câu sai</button><button class="btn3d" id="backPractice">Quay lại luyện tập</button><button class="btn3d" id="finishPractice">Kết thúc phiên luyện</button></div>`);
  $("#saveStop").onclick=()=>{saveSession(s);closeModal();goHome();};
  $("#goBlank").disabled=unfinished===0;$("#goBlank").onclick=()=>{const i=nextIndexMatching(qid=>["blank","selected"].includes(practiceStatus(s,qid)));if(i!==null)s.index=i;closeModal();renderSession();};
  $("#goWrong").disabled=c.wrong===0;$("#goWrong").onclick=()=>{s.reviewOnly="wrong";const i=nextIndexMatching(qid=>practiceStatus(s,qid)==="wrong");closeModal();if(i!==null)goToQuestionIndex(s,i);};
  $("#backPractice").onclick=closeModal;$("#finishPractice").onclick=()=>{closeModal();deleteSession(s.storageKey);renderPracticeResult();};
}
function renderPracticeResult(){
  stopTimer();const s=currentSession,c=practiceCounts(s),graded=c.correct+c.wrong,ungraded=c.blank+c.selected,percent=graded?c.correct/graded*100:0;
  saveLastResult({kind:"practice",bankName:s.bankName,correct:c.correct,wrong:c.wrong,graded,ungraded,percent});
  app().innerHTML=`<section class="panel center"><div class="eyebrow">KẾT QUẢ LUYỆN TẬP</div><div class="title mt8">${esc(s.bankName)}</div><div class="small mt8">${esc(s.mode)}</div></section>
  <section class="panel soft"><div class="result-score"><div class="caption">Tỷ lệ đúng trên số câu đã chấm</div><div class="big">${formatPercent(percent)}</div></div><div class="grid4 mt16"><div class="metric"><strong>${graded}</strong><span>Đã làm</span></div><div class="metric"><strong>${c.correct}</strong><span>Đúng</span></div><div class="metric"><strong>${c.wrong}</strong><span>Sai</span></div><div class="metric"><strong>${ungraded}</strong><span>Chưa chấm</span></div></div></section>
  <section class="panel"><div class="choice-list"><button class="btn3d" id="reviewWrong" ${c.wrong===0?"disabled":""}>Xem lại ${c.wrong} câu sai</button><button class="btn3d" id="repeatPractice">Luyện lại nghiệp vụ này</button><button class="btn3d" id="homeResult">⌂ Về màn hình chính</button></div></section>`;
  $("#reviewWrong").onclick=()=>{s.reviewOnly="wrong";const i=s.questionIds.findIndex(qid=>practiceStatus(s,qid)==="wrong");if(i>=0){s.index=i;renderSession();}};
  $("#repeatPractice").onclick=()=>{CURRENT_DATA=ACTIVE_DATA;renderPracticeMode(s.bankId,s.newOnly);};$("#homeResult").onclick=goHome;
}
function showExamStop(){
  const s=currentSession,c=examCounts(s),r=remainingSeconds(s),mm=String(Math.floor(r/60)).padStart(2,"0"),ss=String(r%60).padStart(2,"0");
  showModal(`<div class="eyebrow">ĐỀ THI NGHIỆP VỤ ${esc(s.bankName.toUpperCase())}</div><div class="small strong mt8">${esc(s.candidateGroup)}</div><h3 class="mt12">Dừng / Nộp bài</h3><div class="grid3 mt16"><div class="metric"><strong>${c.selected}</strong><span>Đã trả lời</span></div><div class="metric"><strong>${c.blank}</strong><span>Chưa trả lời</span></div><div class="metric"><strong>${c.flagged}</strong><span>Đánh dấu</span></div></div><div class="notice info mt12">⏱ Thời gian còn lại: <b>${mm}:${ss}</b>. Đồng hồ không tạm dừng.</div>
  <div class="modal-actions"><button class="btn3d" id="backExam">Tiếp tục làm</button><button class="btn3d" id="goExamBlank" ${c.blank===0?"disabled":""}>Làm câu chưa trả lời</button><button class="btn3d" id="goExamFlag" ${c.flagged===0?"disabled":""}>Xem câu đánh dấu</button><button class="btn3d danger" id="submitNow">Nộp bài</button></div>`);
  $("#backExam").onclick=closeModal;$("#goExamBlank").onclick=()=>{const i=nextIndexMatching(qid=>examStatus(s,qid)==="blank");if(i!==null)s.index=i;closeModal();renderSession();};$("#goExamFlag").onclick=()=>{const i=nextIndexMatching(qid=>examState(s,qid).flagged);if(i!==null)s.index=i;closeModal();renderSession();};$("#submitNow").onclick=()=>{closeModal();confirmExamSubmit();};
}
function confirmExamSubmit(){
  const s=currentSession,c=examCounts(s);showModal(`<h3>Xác nhận nộp bài</h3>${c.blank||c.flagged?`<div class="notice mt12">Còn <b>${c.blank}</b> câu chưa trả lời và <b>${c.flagged}</b> câu đánh dấu.</div>`:`<div class="notice info mt12">Đã trả lời đủ 100 câu và không còn câu đánh dấu.</div>`}<div class="modal-actions"><button class="btn3d" id="cancelSubmit">Quay lại làm tiếp</button><button class="btn3d danger" id="doSubmit">Vẫn nộp bài</button></div>`);
  $("#cancelSubmit").onclick=closeModal;$("#doSubmit").onclick=()=>{submitExam(s);deleteSession(s.storageKey);closeModal();renderExamResult();};
}
function examResultNavigator(s){
  return `<div class="navigator">${s.questionIds.map((qid,i)=>`<button class="nav-btn ${examStatus(s,qid)}" data-review-exam="${i}">${i+1}</button>`).join("")}</div>`;
}
function renderExamResult(){
  stopTimer();const s=currentSession;if(!s.submitted)submitExam(s);const c=examCounts(s),blank=s.questionIds.filter(qid=>!examState(s,qid).selectedOptionId).length;
  saveLastResult({kind:"exam",bankName:s.bankName,candidateGroup:s.candidateGroup,score:s.score});
  app().innerHTML=`<section class="panel center"><div class="eyebrow">KẾT QUẢ THI THỬ</div><div class="strong mt8">ĐỀ THI NGHIỆP VỤ<br>${esc(s.bankName.toUpperCase())}</div><div class="small strong mt8">${esc(s.candidateGroup)}</div></section>
  <section class="panel soft"><div class="result-score"><div class="caption">Kết quả</div><div class="big">${s.score} / 100</div></div><div class="grid3 mt16"><div class="metric"><strong>${s.score}</strong><span>Đúng</span></div><div class="metric"><strong>${100-s.score-blank}</strong><span>Sai</span></div><div class="metric"><strong>${blank}</strong><span>Bỏ trống</span></div></div></section>
  <section class="panel"><div class="section-title">Kết quả theo nhóm</div><div class="list-lines">${Object.entries(s.breakdown).map(([k,v])=>`<div class="list-line"><span>${esc(k==="specialist"?"Chuyên môn nghiệp vụ":CATEGORY_NAMES[k]||k)}</span><b>${v.correct}/${v.total}</b></div>`).join("")}</div></section>
  <section class="panel"><div class="row between"><div class="section-title">Xem lại bài thi</div><div class="tiny">10 câu / hàng</div></div><div class="legend"><span>● Đúng</span><span>● Sai</span><span>□ Bỏ trống</span></div>${examResultNavigator(s)}</section>
  <section class="panel"><div class="choice-list"><button class="btn3d" id="reviewExamWrong">Xem câu sai</button><button class="btn3d" id="repeatExam">Thi thử lại</button><button class="btn3d" id="homeExamResult">⌂ Về màn hình chính</button></div></section>`;
  document.querySelectorAll("[data-review-exam]").forEach(b=>b.onclick=()=>renderExamReview(Number(b.dataset.reviewExam)));
  $("#reviewExamWrong").onclick=()=>{const i=s.questionIds.findIndex(qid=>examStatus(s,qid)==="wrong");if(i>=0)renderExamReview(i,true);};
  $("#repeatExam").onclick=()=>{CURRENT_DATA=ACTIVE_DATA;renderExamSetup("specialist",s.groupCode,s.bankId);};$("#homeExamResult").onclick=goHome;
}
function renderExamReview(index,wrongOnly=false){
  const s=currentSession;s.index=index;const q=currentQuestion(s),state=examState(s,q.id),options=optionView(q,s.sessionId),correct=q.options.find(o=>o.correct),chosen=q.options.find(o=>o.id===state.selectedOptionId);
  app().innerHTML=`<section class="panel"><div class="row between"><div><div class="eyebrow">XEM LẠI BÀI THI</div><div class="small strong mt8">${esc(s.bankName)} · Câu ${index+1}/100</div></div><button class="btn3d" id="backResult">‹ Kết quả</button></div><div class="question mt16">${esc(q.question)}</div><div class="options">${options.map(o=>`<div class="option ${o.id===correct.id?"selected":""}"><span class="letter">${o.displayLabel}</span><span class="option-text">${esc(o.text)}${o.id===state.selectedOptionId?" <b>← Bạn chọn</b>":""}${o.id===correct.id?" <b>✓ Đúng</b>":""}</span></div>`).join("")}</div><div class="feedback ${state.isCorrect?"ok":"bad"}">${state.isCorrect?"✅ Trả lời đúng":"❌ Trả lời sai hoặc bỏ trống"}</div>
  <div class="toolbar3"><button class="btn3d" id="prevReview">Câu trước</button><button class="btn3d" id="nextWrong">${wrongOnly?"Câu sai tiếp":"Câu tiếp"}</button><button class="btn3d" id="nextReview">Câu tiếp theo</button></div></section>`;
  $("#backResult").onclick=renderExamResult;$("#prevReview").disabled=index===0;$("#prevReview").onclick=()=>renderExamReview(index-1,wrongOnly);$("#nextReview").disabled=index>=99;$("#nextReview").onclick=()=>renderExamReview(index+1,wrongOnly);
  $("#nextWrong").onclick=()=>{let found=null;for(let step=1;step<=100;step++){const i=(index+step)%100;if(examStatus(s,s.questionIds[i])==="wrong"){found=i;break;}}if(found!==null)renderExamReview(found,true);};
}

async function renderUpdate(){
  CURRENT_DATA=ACTIVE_DATA;pendingUpdate=null;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">NGÂN HÀNG CÂU HỎI</div><div class="title mt8">Cập nhật dữ liệu</div></div></div></section>
  <section class="panel"><div class="eyebrow">PHIÊN BẢN ĐANG DÙNG</div><div class="row between mt8"><div><div class="title">Bank ${esc(ACTIVE_RELEASE.bankVersion)}</div><div class="small mt8">${ACTIVE_RELEASE.questionCount} câu · ${formatDate(ACTIVE_RELEASE.publishedAt)}</div></div><span class="badge primary">Đang hoạt động</span></div></section>
  <section class="panel" id="updateStatus"><div class="center"><div class="small">Bấm để kiểm tra phiên bản mới khi có Internet.</div><button class="btn3d primary mt12" id="checkUpdate">Kiểm tra cập nhật</button></div></section>
  <div class="center tiny">Chỉ cần Internet khi kiểm tra/tải Bank mới. Sau đó tiếp tục dùng offline.</div>`;
  $("#backHome").onclick=renderHome;$("#checkUpdate").onclick=checkForUpdate;
}
async function checkForUpdate(){
  const box=$("#updateStatus");box.innerHTML=`<div class="center"><b>Đang kiểm tra…</b></div>`;
  try{
    const latest=await fetchJson(`${LATEST_URL}?t=${Date.now()}`,{cache:"no-store"});
    if(latest.bankVersion===ACTIVE_RELEASE.bankVersion){box.innerHTML=`<div class="notice info"><b>Ngân hàng đang là phiên bản mới nhất.</b><div class="mt8">Bank ${esc(latest.bankVersion)} · ${latest.questionCount} câu.</div></div><button class="btn3d mt12" id="checkAgain">Kiểm tra lại</button>`;$("#checkAgain").onclick=checkForUpdate;return;}
    pendingUpdate=latest;
    box.innerHTML=`<div class="panel accent"><div class="row between"><div><div class="eyebrow">CÓ BẢN MỚI</div><div class="title mt8">Bank ${esc(latest.bankVersion)}</div><div class="small mt8">Phát hành ${formatDate(latest.publishedAt)}</div></div><span class="badge new">MỚI</span></div>
    <div class="grid3 mt16"><div class="metric"><strong>${latest.newCount}</strong><span>Câu mới</span></div><div class="metric"><strong>${latest.updatedCount}</strong><span>Câu cập nhật</span></div><div class="metric"><strong>${latest.questionCount}</strong><span>Tổng câu</span></div></div>
    <div class="notice info mt12"><b>Phiên đang luyện sẽ không bị thay đổi.</b><div class="mt8">Phiên mới sẽ dùng Bank mới sau khi cập nhật hoàn tất.</div></div><button class="btn3d primary mt12" style="width:100%" id="doUpdate">⬇️ Cập nhật ngay</button></div>`;
    $("#doUpdate").onclick=downloadUpdate;
  }catch(e){box.innerHTML=`<div class="notice error"><b>Không kiểm tra được cập nhật.</b><div class="mt8">${esc(e.message)} Bank hiện tại vẫn được giữ nguyên.</div></div><button class="btn3d mt12" id="retryUpdate">Thử lại</button>`;$("#retryUpdate").onclick=checkForUpdate;}
}
async function downloadUpdate(){
  const box=$("#updateStatus");box.innerHTML=`<div class="center"><b>Đang tải và kiểm tra Bank ${esc(pendingUpdate.bankVersion)}…</b><div class="small mt8">Không đóng ứng dụng trong bước này.</div></div>`;
  try{
    await setActiveRelease(pendingUpdate);
    const newByBank=Object.values(ACTIVE_DATA.banks).filter(b=>(b.meta.newCount||0)>0);
    box.innerHTML=`<div class="notice info"><b>✅ Cập nhật thành công Bank ${esc(ACTIVE_RELEASE.bankVersion)}</b><div class="mt8">${ACTIVE_RELEASE.newCount} câu mới · ${ACTIVE_RELEASE.updatedCount} câu cập nhật · ${ACTIVE_RELEASE.questionCount} câu tổng.</div></div>
    ${newByBank.length?`<div class="panel mt12"><div class="section-title">Nghiệp vụ có câu mới</div><div class="list-lines">${newByBank.map(b=>`<div class="list-line"><span>${esc(b.meta.name)}</span><b>${b.meta.newCount}</b></div>`).join("")}</div></div><button class="btn3d primary" style="width:100%" id="goNewAfterUpdate">🆕 Luyện câu mới</button>`:""}
    <button class="btn3d mt12" style="width:100%" id="homeAfterUpdate">Về màn hình chính</button>`;
    if($("#goNewAfterUpdate"))$("#goNewAfterUpdate").onclick=()=>renderPracticeSetup(true);$("#homeAfterUpdate").onclick=renderHome;
  }catch(e){box.innerHTML=`<div class="notice error"><b>❌ Cập nhật không thành công.</b><div class="mt8">${esc(e.message)} Bank cũ vẫn được giữ nguyên.</div></div><button class="btn3d mt12" id="retryDownload">Thử lại</button>`;$("#retryDownload").onclick=downloadUpdate;}
}

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;const b=$("#installBtn");if(b)b.classList.remove("hidden");});
async function registerSW(){
  if(!("serviceWorker" in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register("./sw.js");await reg.update();
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!sessionStorage.getItem("swReloaded")){sessionStorage.setItem("swReloaded","1");location.reload();}});
  }catch(e){console.warn("Service worker:",e);}
}
async function boot(){
  await registerSW();
  ACTIVE_RELEASE=activeReleaseFromStorage();
  try{ACTIVE_DATA=await loadRelease(ACTIVE_RELEASE,false);}catch(e){ACTIVE_RELEASE=BASELINE_RELEASE;ACTIVE_DATA=await loadRelease(BASELINE_RELEASE,false);localStorage.setItem(ACTIVE_RELEASE_KEY,JSON.stringify(ACTIVE_RELEASE));}
  CURRENT_DATA=ACTIVE_DATA;renderHome();
}
boot().catch(e=>{app().innerHTML=`<section class="notice error"><b>Không nạp được ứng dụng.</b><div class="mt8">${esc(e.message)}</div><div class="mt8">Hãy mở qua HTTPS hoặc localhost.</div></section>`;});
