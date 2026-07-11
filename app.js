const $ = id => document.getElementById(id);
let roomList = [];
let result = { all: [], mutual: [], onlyMe: [], fansOnly: [], neither: [] };
let currentTab = "all";
let installPrompt = null;
let config = {sheetId:"",sheetName:"단톡방명단",fallbackCsv:"room-list.csv"};

function toast(message){
  const el=$("toast"); el.textContent=message; el.style.display="block";
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.style.display="none",1800);
}
function normalize(value){
  return String(value||"").trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//,"")
    .replace(/^instagram\.com\//,"").replace(/^_u\//,"")
    .replace(/^@+/,"").replace(/[?#].*$/,"").replace(/\/+$/,"").trim();
}
function validUsername(value){
  return /^[a-z0-9._]{1,30}$/.test(value) && !["instagram","accounts","explore","direct","p","reels","stories","www","about","privacy","terms","login","_u"].includes(value);
}
function unique(values){
  const set=new Set();
  for(const value of values||[]){const id=normalize(value); if(validUsername(id)) set.add(id)}
  return [...set];
}
function parseCsv(text){
  const rows=[]; let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(ch===','&&!quoted){row.push(cell);cell="";continue}
    if((ch==='\n'||ch==='\r')&&!quoted){if(cell||row.length){row.push(cell);rows.push(row);row=[];cell=""}if(ch==='\r'&&next==='\n')i++;continue}
    cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
function rowsToRoom(rows){
  const list=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i]; const joined=r.join(" ");
    if(i===0&&(joined.includes("번호")||joined.includes("닉네임")||joined.includes("아이디"))) continue;
    const id=normalize(r[2]||r[1]||r[0]);
    if(validUsername(id)) list.push({no:r[0]||list.length+1,name:r[1]||"",id});
  }
  const seen=new Set(); return list.filter(x=>!seen.has(x.id)&&seen.add(x.id));
}
async function loadConfig(){
  try{const res=await fetch(`config.json?t=${Date.now()}`,{cache:"no-store"}); if(res.ok) config={...config,...await res.json()}}catch{}
}
async function loadRoomList(showToast=false){
  $("roomState").textContent="불러오는 중";
  const urls=[];
  if(config.sheetId){
    const sheet=encodeURIComponent(config.sheetName||"단톡방명단");
    urls.push(`https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&sheet=${sheet}&t=${Date.now()}`);
    urls.push(`https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&sheet=${sheet}&t=${Date.now()}`);
  }
  urls.push(`${config.fallbackCsv||"room-list.csv"}?t=${Date.now()}`);
  let lastError="";
  for(const url of urls){
    try{
      const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw Error(`HTTP ${res.status}`);
      const text=await res.text(); const list=rowsToRoom(parseCsv(text));
      if(!list.length) throw Error("0명");
      roomList=list; $("roomState").textContent=`${list.length}명 준비 완료`;
      $("status").textContent="ZIP 파일을 선택하고 분석을 시작하세요.";
      if(showToast) toast("단톡방 명단 새로고침 완료"); return;
    }catch(e){lastError=e.message}
  }
  $("roomState").textContent="명단 오류";
  $("status").textContent=`단톡방 명단을 불러오지 못했습니다. (${lastError})`;
  if(showToast) toast("명단 불러오기 실패");
}
function findFiles(zip){
  const files=Object.keys(zip.files).filter(p=>!zip.files[p].dir);
  const followers=files.filter(p=>/followers_\d+\.(html|json)$/i.test(p.replace(/\\/g,"/").split("/").pop()));
  const following=files.find(p=>/^following\.(html|json)$/i.test(p.replace(/\\/g,"/").split("/").pop()));
  return {followers,following};
}
function extractHtml(text){
  const ids=[]; let m;
  const re=/href=["']https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)\/?[^"']*["']/gi;
  while((m=re.exec(text))) ids.push(m[1]);
  if(!ids.length){const re2=/https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/gi;while((m=re2.exec(text)))ids.push(m[1])}
  return unique(ids);
}
function walkJson(value,out){
  if(value==null)return;
  if(typeof value==="string"){const id=normalize(value);if(validUsername(id))out.push(id);return}
  if(Array.isArray(value)){value.forEach(v=>walkJson(v,out));return}
  if(typeof value==="object"){if(value.value)walkJson(value.value,out);if(value.href)walkJson(value.href,out);if(value.username)walkJson(value.username,out);Object.values(value).forEach(v=>walkJson(v,out))}
}
function extractJson(text){const out=[];try{walkJson(JSON.parse(text),out)}catch{}return unique(out)}
async function parseInstagramZip(file){
  if(!file) throw Error("ZIP 파일을 선택해 주세요.");
  if(!window.JSZip) throw Error("ZIP 분석 라이브러리를 불러오지 못했습니다.");
  const zip=await JSZip.loadAsync(file); const paths=findFiles(zip);
  if(!paths.followers.length) throw Error("followers_1.html 또는 JSON을 찾지 못했습니다.");
  if(!paths.following) throw Error("following.html 또는 JSON을 찾지 못했습니다.");
  let followers=[];
  for(const path of paths.followers){const text=await zip.files[path].async("string");followers.push(...(path.toLowerCase().endsWith(".json")?extractJson(text):extractHtml(text)))}
  const followingText=await zip.files[paths.following].async("string");
  const following=paths.following.toLowerCase().endsWith(".json")?extractJson(followingText):extractHtml(followingText);
  followers=unique(followers);
  if(!followers.length||!following.length) throw Error("팔로워 또는 팔로잉 계정을 읽지 못했습니다.");
  return {followers,following};
}
function classify(followers,following){
  const F=new Set(followers),G=new Set(following);
  const all=roomList.map(person=>{
    let status="neither";
    if(F.has(person.id)&&G.has(person.id)) status="mutual";
    else if(!F.has(person.id)&&G.has(person.id)) status="onlyMe";
    else if(F.has(person.id)&&!G.has(person.id)) status="fansOnly";
    return {...person,status};
  });
  result={all,mutual:all.filter(x=>x.status==="mutual"),onlyMe:all.filter(x=>x.status==="onlyMe"),fansOnly:all.filter(x=>x.status==="fansOnly"),neither:all.filter(x=>x.status==="neither")};
}
async function analyze(){
  const btn=$("analyzeBtn");
  try{
    btn.disabled=true;btn.textContent="분석 중...";
    if(!roomList.length) await loadRoomList(false);
    if(!roomList.length) throw Error("단톡방 명단을 불러오지 못했습니다.");
    $("status").textContent="ZIP 파일을 읽고 단톡방 명단과 비교하고 있습니다.";
    const parsed=await parseInstagramZip($("zipFile").files[0]);
    classify(parsed.followers,parsed.following);
    updateSummary(); showTab("all");
    $("summarySection").classList.remove("hidden");$("resultsSection").classList.remove("hidden");
    $("status").textContent=`분석 완료 · 단톡방 ${roomList.length}명 기준`;
    toast("분석 완료");
  }catch(e){$("status").textContent=`오류: ${e.message}`;toast("분석 실패")}
  finally{btn.disabled=false;btn.textContent="맞팔 분석 시작 →"}
}
function updateSummary(){
  $("mutualCount").textContent=`${result.mutual.length}명`;$("onlyMeCount").textContent=`${result.onlyMe.length}명`;$("fansOnlyCount").textContent=`${result.fansOnly.length}명`;$("neitherCount").textContent=`${result.neither.length}명`;
  $("tabAll").textContent=result.all.length;$("tabMutual").textContent=result.mutual.length;$("tabOnlyMe").textContent=result.onlyMe.length;$("tabFansOnly").textContent=result.fansOnly.length;$("tabNeither").textContent=result.neither.length;
  const rate=result.all.length?((result.mutual.length/result.all.length)*100).toFixed(1):"0.0";
  $("rateText").textContent=`단톡방 맞팔률 ${rate}% · ${result.mutual.length}/${result.all.length}명`;
}
function label(status){return {mutual:"맞팔 완료",onlyMe:"내가 팔로우만 함",fansOnly:"상대가 팔로우만 함",neither:"서로 팔로우 안 함"}[status]}
function showTab(tab){currentTab=tab;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));renderList()}
function filtered(){
  const q=String($("searchInput").value||"").trim().toLowerCase(); const list=result[currentTab]||[];
  return q?list.filter(x=>x.id.includes(normalize(q))||String(x.name||"").toLowerCase().includes(q)):list;
}
function renderList(){
  const items=filtered();
  $("list").innerHTML=items.length?items.map((x,i)=>`<div class="item"><span>${i+1}</span><span class="name">${escapeHtml(x.name||"")}</span><a class="id" href="https://www.instagram.com/${encodeURIComponent(x.id)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(x.id)}</a><span class="badge ${x.status}">${label(x.status)}</span><a class="insta" href="https://www.instagram.com/${encodeURIComponent(x.id)}/" target="_blank" rel="noopener noreferrer">인스타</a></div>`).join(""):"<div class='empty'>해당 결과가 없습니다.</div>";
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function copyCurrent(){
  const items=filtered(); if(!items.length)return toast("복사할 명단이 없습니다.");
  const text=items.map((x,i)=>`${i+1}. ${x.name||""} @${x.id} - ${label(x.status)}`).join("\n");
  try{await navigator.clipboard.writeText(text);toast("복사 완료")}catch{toast("복사를 지원하지 않는 브라우저입니다.")}
}
function downloadCsv(){
  const items=filtered(); if(!items.length)return toast("다운로드할 명단이 없습니다.");
  const rows=[["번호","닉네임","아이디","상태"],...items.map((x,i)=>[i+1,x.name,`@${x.id}`,label(x.status)])];
  const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`여우방_${currentTab}_명단.csv`;a.click();URL.revokeObjectURL(url);
}
function reset(){
  $("zipFile").value="";$("fileName").textContent="ZIP 파일 선택";$("summarySection").classList.add("hidden");$("resultsSection").classList.add("hidden");$("status").textContent="ZIP 파일을 선택하고 분석을 시작하세요.";result={all:[],mutual:[],onlyMe:[],fansOnly:[],neither:[]};window.scrollTo({top:0,behavior:"smooth"});
}
$("zipFile").addEventListener("change",()=>{$("fileName").textContent=$("zipFile").files[0]?.name||"ZIP 파일 선택"});
$("analyzeBtn").addEventListener("click",analyze);$("reloadRoomBtn").addEventListener("click",()=>loadRoomList(true));$("resetBtn").addEventListener("click",reset);$("searchInput").addEventListener("input",renderList);$("copyBtn").addEventListener("click",copyCurrent);$("csvBtn").addEventListener("click",downloadCsv);document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e});
$("installBtn").addEventListener("click",async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else toast("브라우저 메뉴에서 홈 화면에 추가를 눌러주세요.")});
window.addEventListener("DOMContentLoaded",async()=>{await loadConfig();await loadRoomList(false)});
