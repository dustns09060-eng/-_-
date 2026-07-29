const SHEET_ID="1QfguFyvtgNUyfd4-ufMxAWRwItHuIY6M4wGAQstteW0";
const SHEET_NAME="Sheet2";
const ADMIN_PASSWORD="0702";
let members=[],followers=new Set(),following=new Set(),comparison=[],activeFilter="all",deferredPrompt=null;
const $=id=>document.getElementById(id);
const norm=v=>String(v||"").trim().replace(/^@/,"").replace(/^https?:\/\/(www\.)?instagram\.com\//i,"").replace(/^_u\//i,"").split(/[/?#]/)[0].toLowerCase();
const esc=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function switchView(view){
  $("checkView").classList.toggle("hidden",view!=="check");
  $("adminView").classList.toggle("hidden",view!=="admin");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="check") updateLock();
  if(view==="admin"&&sessionStorage.getItem("admin")==="1") showAdmin();
  scrollTo(0,0);
}
function fetchSheet(){
  return new Promise((resolve,reject)=>{
    const cb="sheetcb_"+Date.now(),s=document.createElement("script");
    const timer=setTimeout(()=>{cleanup();reject(new Error("timeout"));},12000);
    function cleanup(){clearTimeout(timer);try{delete window[cb]}catch(e){}s.remove()}
    window[cb]=data=>{cleanup();resolve(data)};
    s.onerror=()=>{cleanup();reject(new Error("load"))};
    s.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(SHEET_NAME)}&tqx=responseHandler:${cb};out:json&cache=${Date.now()}`;
    document.head.appendChild(s);
  });
}
async function loadMembers(){
  $("analyzeStatus").textContent="구글시트 명단을 불러오는 중입니다.";
  try{
    const j=await fetchSheet();
    members=(j.table?.rows||[]).map(r=>{
      const c=r.c||[];
      return {no:Number(String(c[0]?.v??"").replace(/[^0-9]/g,"")),nickname:String(c[1]?.v??"").trim(),id:norm(c[2]?.v??"")};
    }).filter(x=>x.no&&x.nickname&&x.id).sort((a,b)=>a.no-b.no);
    $("analyzeStatus").textContent=`명단 ${members.length.toLocaleString()}명을 불러왔습니다. ZIP 파일을 선택해 주세요.`;
    if(followers.size||following.size) buildComparison();
  }catch(e){$("analyzeStatus").textContent="명단을 불러오지 못했습니다. 구글시트 공개 설정을 확인해 주세요."}
}
function parseHtml(text){
  const doc=new DOMParser().parseFromString(text,"text/html"),set=new Set();
  doc.querySelectorAll("a").forEach(a=>{
    const href=a.getAttribute("href")||"",label=(a.textContent||"").trim(),m=href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    const id=norm(m?m[1]:label);
    if(id&&/^[a-z0-9._]+$/.test(id)&&!["accounts","explore","p","reel"].includes(id))set.add(id);
  });return set;
}
function parseJson(text){
  const set=new Set(),data=JSON.parse(text);
  function walk(v){
    if(Array.isArray(v)){v.forEach(walk);return}
    if(!v||typeof v!=="object")return;
    if(Array.isArray(v.string_list_data))v.string_list_data.forEach(i=>{const id=norm(i.value||i.href||"");if(id&&/^[a-z0-9._]+$/.test(id))set.add(id)});
    if(typeof v.title==="string"){const id=norm(v.title);if(id&&/^[a-z0-9._]+$/.test(id))set.add(id)}
    Object.values(v).forEach(walk);
  }walk(data);return set;
}
async function analyze(){
  if(isLocked())return;
  const file=$("instagramZip").files[0];
  if(!file){alert("ZIP 파일을 선택해 주세요.");return}
  if(!members.length){alert("구글시트 명단을 먼저 불러와 주세요.");return}
  try{
    $("analyzeStatus").textContent="ZIP 파일을 분석 중입니다.";
    const zip=await JSZip.loadAsync(file),names=Object.keys(zip.files).filter(n=>!zip.files[n].dir);
    const ff=names.filter(n=>/(^|\/)followers(_\d+)?\.(html|json)$/i.test(n));
    const fg=names.filter(n=>/(^|\/)following\.(html|json)$/i.test(n));
    if(!ff.length||!fg.length)throw new Error("followers 또는 following 파일을 찾지 못했습니다.");
    followers=new Set();following=new Set();
    for(const n of ff){const t=await zip.file(n).async("text"),ids=/\.json$/i.test(n)?parseJson(t):parseHtml(t);ids.forEach(id=>followers.add(id))}
    for(const n of fg){const t=await zip.file(n).async("text"),ids=/\.json$/i.test(n)?parseJson(t):parseHtml(t);ids.forEach(id=>following.add(id))}
    buildComparison();
    $("analyzeStatus").textContent=`분석 완료 · 팔로워 ${followers.size.toLocaleString()}명 / 팔로잉 ${following.size.toLocaleString()}명`;
  }catch(e){$("analyzeStatus").textContent="분석에 실패했습니다.";alert(e.message)}
}
function buildComparison(){
  comparison=members.map(x=>{
    const a=followers.has(x.id),b=following.has(x.id);
    return {...x,status:a&&b?"mutual":b?"onlyMe":a?"onlyThem":"neither"};
  });
  const total=comparison.length||1,count=s=>comparison.filter(x=>x.status===s).length,pct=n=>(n/total*100).toFixed(1)+"%";
  const vals={mutual:count("mutual"),onlyMe:count("onlyMe"),onlyThem:count("onlyThem"),neither:count("neither")};
  for(const k of Object.keys(vals)){const id=k==="mutual"?"mutual":k;$((id)+"Count").textContent=vals[k].toLocaleString()+"명";$((id)+"Pct").textContent=pct(vals[k])}
  $("mutualRate").textContent=pct(vals.mutual);$("rateFraction").textContent=`${vals.mutual}/${comparison.length}명`;
  document.querySelector('[data-filter="all"]').textContent=`전체 (${comparison.length})`;
  document.querySelector('[data-filter="mutual"]').textContent=`맞팔 (${vals.mutual})`;
  document.querySelector('[data-filter="onlyMe"]').textContent=`나만 팔로우 (${vals.onlyMe})`;
  document.querySelector('[data-filter="onlyThem"]').textContent=`상대만 팔로우 (${vals.onlyThem})`;
  document.querySelector('[data-filter="neither"]').textContent=`서로 안 함 (${vals.neither})`;
  renderResults();
}
function label(s){return {mutual:"맞팔 완료",onlyMe:"나만 팔로우 함",onlyThem:"상대가 팔로우만 함",neither:"서로 팔로우 안 함"}[s]}
function renderResults(){
  const q=$("checkSearch").value.toLowerCase().trim();
  const rows=comparison.filter(x=>(activeFilter==="all"||x.status===activeFilter)&&(x.no+" "+x.nickname+" "+x.id).toLowerCase().includes(q));
  $("checkList").innerHTML=rows.length?rows.map(x=>`
    <div class="result-item">
      <div class="result-no">${x.no}</div>
      <div class="result-main">
        <strong>${esc(x.nickname)}</strong>
        <b>@${esc(x.id)}</b>
        <small class="status-${x.status}">${label(x.status)}</small>
      </div>
      <a class="open-btn" href="https://instagram.com/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">↗ 열기</a>
    </div>`).join(""):'<div class="empty">표시할 결과가 없습니다.</div>';
}
function resetAnalysis(){followers=new Set();following=new Set();comparison=[];$("instagramZip").value="";$("checkList").innerHTML="";["mutual","onlyMe","onlyThem","neither"].forEach(k=>{$(k+"Count").textContent="0명";$(k+"Pct").textContent="0%"});$("mutualRate").textContent="0%";$("rateFraction").textContent="0/0명";$("analyzeStatus").textContent="ZIP 파일을 선택해 주세요."}
function copyMismatch(){
  const ids=comparison.filter(x=>x.status!=="mutual").map(x=>`${x.no}. ${x.nickname} @${x.id} - ${label(x.status)}`).join("\n");
  if(!ids){alert("복사할 미맞팔 결과가 없습니다.");return}
  navigator.clipboard.writeText(ids).then(()=>alert("미맞팔 명단을 복사했습니다."));
}
function isLocked(){return localStorage.getItem("yeowooCheckLocked")!=="0"}
function updateLock(){
  const locked=isLocked();$("checkLockPanel").classList.toggle("hidden",!locked);$("checkContent").classList.toggle("hidden",locked);$("lockButtonText").textContent=locked?"맞팔 잠금 해제":"맞팔 잠그기";
}
function toggleLock(){localStorage.setItem("yeowooCheckLocked",isLocked()?"0":"1");updateLock();alert(isLocked()?"맞팔확인을 잠갔습니다.":"맞팔확인 잠금을 해제했습니다.")}
function showAdmin(){$("adminLoginBox").classList.add("hidden");$("adminPanel").classList.remove("hidden");updateLock()}
function login(){if($("adminPassword").value===ADMIN_PASSWORD){sessionStorage.setItem("admin","1");showAdmin()}else{alert("비밀번호가 틀렸습니다.");$("adminPassword").value=""}}
function logout(){sessionStorage.removeItem("admin");$("adminPanel").classList.add("hidden");$("adminLoginBox").classList.remove("hidden")}
function renderNotice(){const n=localStorage.getItem("yeowooNotice")||"";$("noticeBar").classList.toggle("hidden",!n);$("noticeText").textContent=n;$("noticeInput").value=n}
function saveNotice(){localStorage.setItem("yeowooNotice",$("noticeInput").value.trim());renderNotice();alert("공지를 저장했습니다.")}
function deleteNotice(){localStorage.removeItem("yeowooNotice");renderNotice();alert("공지를 삭제했습니다.")}

document.addEventListener("click",e=>{
  const view=e.target.closest("[data-view]")?.dataset.view;if(view)switchView(view);
  const filter=e.target.closest("[data-filter]")?.dataset.filter;
  if(filter){activeFilter=filter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.remove("active"));e.target.closest("[data-filter]").classList.add("active");renderResults()}
});
$("analyzeButton").onclick=analyze;$("resetAnalysis").onclick=resetAnalysis;$("checkSearch").oninput=renderResults;$("copyMismatch").onclick=copyMismatch;
$("adminReloadButton").onclick=loadMembers;$("adminLoginButton").onclick=login;$("adminPassword").onkeydown=e=>{if(e.key==="Enter")login()};$("adminLogoutButton").onclick=logout;
$("passwordToggle").onclick=()=>{const v=$("adminPassword").type==="text";$("adminPassword").type=v?"password":"text";$("passwordToggle").textContent=v?"보기":"숨김"};
$("toggleLockButton").onclick=toggleLock;$("saveNoticeButton").onclick=saveNotice;$("deleteNoticeButton").onclick=deleteNotice;$("noticeClose").onclick=()=>$("noticeBar").classList.add("hidden");
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installButton").classList.remove("hidden")});
$("installButton").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installButton").classList.add("hidden")};
renderNotice();updateLock();loadMembers();
