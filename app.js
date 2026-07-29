const SHEET_ID="1m14GywxIymZp6p9izJ6QVWaC8fCnjr5F5OdXCKKUcss";
const SHEET_NAME="Sheet1";
const ADMIN_PASSWORD="0702";
const PAGE_SIZE=500;

let members=[];
let currentPage="all";
let followers=new Set();
let following=new Set();
let comparison=[];
let activeFilter="all";

const $=id=>document.getElementById(id);
const normalize=v=>String(v||"").trim().replace(/^@/,"").replace(/^https?:\/\/(www\.)?instagram\.com\//i,"").replace(/^_u\//i,"").split(/[/?#]/)[0].toLowerCase();
const escapeHtml=s=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

function switchView(view){
  $("listView").classList.toggle("hidden",view!=="list");
  $("checkView").classList.toggle("hidden",view!=="check");
  $("adminView").classList.toggle("hidden",view!=="admin");
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="check") updateLockUi();
  window.scrollTo(0,0);
}

function fetchSheetJsonp(){
  return new Promise((resolve,reject)=>{
    const callback="sheetCallback_"+Date.now();
    const script=document.createElement("script");
    const timer=setTimeout(()=>{cleanup();reject(new Error("timeout"));},12000);
    function cleanup(){clearTimeout(timer);try{delete window[callback];}catch(e){}script.remove();}
    window[callback]=data=>{cleanup();resolve(data);};
    script.onerror=()=>{cleanup();reject(new Error("load"));};
    script.src="https://docs.google.com/spreadsheets/d/"+SHEET_ID+"/gviz/tq?sheet="+encodeURIComponent(SHEET_NAME)+"&tqx=responseHandler:"+callback+";out:json&cache="+Date.now();
    document.head.appendChild(script);
  });
}

async function loadMembers(){
  $("listStatus").textContent="명단을 불러오는 중입니다.";
  try{
    const json=await fetchSheetJsonp();
    const rows=json.table?.rows||[];
    members=rows.map(r=>{
      const c=r.c||[];
      return {
        no:Number(String(c[0]?.v??"").replace(/[^0-9]/g,"")),
        nickname:String(c[1]?.v??"").trim(),
        id:normalize(c[2]?.v??"")
      };
    }).filter(x=>x.no&&x.nickname&&x.id).sort((a,b)=>a.no-b.no);
    $("totalPeople").textContent=members.length.toLocaleString()+"명";
    $("totalPages").textContent=Math.ceil(members.length/PAGE_SIZE)+"개";
    $("updatedAt").textContent=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"});
    buildPageButtons();
    renderMembers();
    if(followers.size||following.size) buildComparison();
  }catch(e){
    $("listStatus").textContent="명단을 불러오지 못했습니다.";
    $("memberList").innerHTML='<div class="empty">Google Sheet 공개 설정을 확인해 주세요.</div>';
  }
}

function buildPageButtons(){
  const count=Math.ceil(members.length/PAGE_SIZE);
  let html='<button data-page="all" class="'+(currentPage==="all"?"active":"")+'">전체</button>';
  for(let i=0;i<count;i++){
    const start=i*PAGE_SIZE+1;
    const end=Math.min((i+1)*PAGE_SIZE,members.length);
    html+='<button data-page="'+i+'" class="'+(currentPage===i?"active":"")+'">'+start+"~"+end+"</button>";
  }
  $("pageButtons").innerHTML=html;
}

function renderMembers(){
  const q=$("listSearch").value.toLowerCase().trim();
  const filtered=members.filter(x=>{
    const inPage=currentPage==="all"||(x.no>=currentPage*PAGE_SIZE+1&&x.no<=(currentPage+1)*PAGE_SIZE);
    return inPage&&(x.no+" "+x.nickname+" "+x.id).toLowerCase().includes(q);
  });
  $("listStatus").textContent="검색 결과 "+filtered.length.toLocaleString()+"명";
  $("memberList").innerHTML=filtered.length?filtered.map(x=>`
    <div class="member-row">
      <span>${x.no}</span>
      <span class="nickname">${escapeHtml(x.nickname)}</span>
      <span class="user-id">@${escapeHtml(x.id)}</span>
      <a class="insta-link" target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(x.id)}">인스타</a>
    </div>`).join(""):'<div class="empty">표시할 명단이 없습니다.</div>';
}

function parseHtml(text){
  const doc=new DOMParser().parseFromString(text,"text/html");
  const set=new Set();
  doc.querySelectorAll("a").forEach(a=>{
    const href=a.getAttribute("href")||"";
    const label=(a.textContent||"").trim();
    const match=href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    let id=match?match[1]:label;
    id=normalize(id);
    if(id&&/^[a-z0-9._]+$/.test(id)&&!["accounts","explore","p","reel"].includes(id)) set.add(id);
  });
  return set;
}

function parseJson(text){
  const set=new Set();
  const data=JSON.parse(text);
  function walk(value){
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(!value||typeof value!=="object") return;
    if(Array.isArray(value.string_list_data)){
      value.string_list_data.forEach(item=>{
        const id=normalize(item.value||item.href||"");
        if(id&&/^[a-z0-9._]+$/.test(id)) set.add(id);
      });
    }
    if(typeof value.title==="string"){
      const id=normalize(value.title);
      if(id&&/^[a-z0-9._]+$/.test(id)) set.add(id);
    }
    Object.values(value).forEach(walk);
  }
  walk(data);
  return set;
}

async function analyzeZip(){
  if(isLocked()) return;
  const file=$("instagramZip").files[0];
  if(!file){alert("인스타그램 ZIP 파일을 선택해 주세요.");return;}
  if(typeof JSZip==="undefined"){alert("ZIP 분석 도구를 불러오지 못했습니다.");return;}
  $("analyzeStatus").textContent="ZIP 파일을 읽는 중입니다.";
  try{
    const zip=await JSZip.loadAsync(file);
    const names=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
    const followerFiles=names.filter(name=>/(^|\/)followers(_\d+)?\.(html|json)$/i.test(name));
    const followingFiles=names.filter(name=>/(^|\/)following\.(html|json)$/i.test(name));
    if(!followerFiles.length||!followingFiles.length) throw new Error("followers 또는 following 파일을 찾지 못했습니다.");

    const f1=new Set(),f2=new Set();
    for(const name of followerFiles){
      const text=await zip.file(name).async("text");
      const ids=/\.json$/i.test(name)?parseJson(text):parseHtml(text);
      ids.forEach(id=>f1.add(id));
    }
    for(const name of followingFiles){
      const text=await zip.file(name).async("text");
      const ids=/\.json$/i.test(name)?parseJson(text):parseHtml(text);
      ids.forEach(id=>f2.add(id));
    }
    followers=f1;following=f2;
    buildComparison();
    $("analyzeStatus").textContent="분석 완료 · 팔로워 "+followers.size.toLocaleString()+"명 / 팔로잉 "+following.size.toLocaleString()+"명";
    $("resultPanel").classList.remove("hidden");
  }catch(e){
    $("analyzeStatus").textContent="분석에 실패했습니다.";
    alert(e.message);
  }
}

function buildComparison(){
  comparison=members.map(x=>{
    const isFollower=followers.has(x.id);
    const isFollowing=following.has(x.id);
    let status="neither";
    if(isFollower&&isFollowing) status="mutual";
    else if(isFollowing) status="onlyMe";
    else if(isFollower) status="onlyThem";
    return {...x,status};
  });
  const count=s=>comparison.filter(x=>x.status===s).length;
  $("mutualCount").textContent=count("mutual").toLocaleString()+"명";
  $("onlyMeCount").textContent=count("onlyMe").toLocaleString()+"명";
  $("onlyThemCount").textContent=count("onlyThem").toLocaleString()+"명";
  $("neitherCount").textContent=count("neither").toLocaleString()+"명";
  document.querySelector('[data-filter="all"]').textContent="전체 ("+comparison.length+")";
  document.querySelector('[data-filter="mutual"]').textContent="맞팔 ("+count("mutual")+")";
  document.querySelector('[data-filter="onlyMe"]').textContent="나만 팔로우 ("+count("onlyMe")+")";
  document.querySelector('[data-filter="onlyThem"]').textContent="상대만 팔로우 ("+count("onlyThem")+")";
  document.querySelector('[data-filter="neither"]').textContent="서로 안 함 ("+count("neither")+")";
  renderComparison();
}

function statusLabel(status){
  return {mutual:"맞팔",onlyMe:"나만",onlyThem:"상대만",neither:"서로 안 함"}[status];
}

function renderComparison(){
  const q=$("checkSearch").value.toLowerCase().trim();
  const rows=comparison.filter(x=>(activeFilter==="all"||x.status===activeFilter)&&(x.no+" "+x.nickname+" "+x.id).toLowerCase().includes(q));
  $("checkList").innerHTML=rows.length?rows.map(x=>`
    <div class="check-row">
      <span>${x.no}</span>
      <span class="nickname">${escapeHtml(x.nickname)}</span>
      <span class="user-id">@${escapeHtml(x.id)}</span>
      <span class="status-badge status-${x.status}">${statusLabel(x.status)}</span>
      <a class="insta-link" target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(x.id)}">인스타</a>
    </div>`).join(""):'<div class="empty">표시할 결과가 없습니다.</div>';
}

function isLocked(){return localStorage.getItem("yeowooCheckLocked")!=="0";}
function updateLockUi(){
  const locked=isLocked();
  $("checkLockPanel").classList.toggle("hidden",!locked);
  $("checkContent").classList.toggle("hidden",locked);
  $("lockStatusText").textContent=locked?"현재 상태: 잠금":"현재 상태: 사용 가능";
  $("toggleLockButton").textContent=locked?"맞팔확인 잠금 해제":"맞팔확인 잠그기";
}
function toggleLock(){
  const willLock=!isLocked();
  localStorage.setItem("yeowooCheckLocked",willLock?"1":"0");
  updateLockUi();
  alert(willLock?"맞팔확인을 잠갔습니다.":"맞팔확인 잠금을 해제했습니다.");
}

function showAdmin(){
  $("adminLoginBox").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  updateLockUi();
}
function loginAdmin(){
  if($("adminPassword").value===ADMIN_PASSWORD){
    sessionStorage.setItem("yeowooAdmin","1");
    showAdmin();
  }else{
    alert("비밀번호가 틀렸습니다.");
    $("adminPassword").value="";
    $("adminPassword").focus();
  }
}
function logoutAdmin(){
  sessionStorage.removeItem("yeowooAdmin");
  $("adminPanel").classList.add("hidden");
  $("adminLoginBox").classList.remove("hidden");
  $("adminPassword").value="";
}

function renderNotice(){
  const notice=localStorage.getItem("yeowooNotice")||"";
  $("noticeBar").classList.toggle("hidden",!notice);
  $("noticeText").textContent=notice;
  $("noticeInput").value=notice;
}
function saveNotice(){
  localStorage.setItem("yeowooNotice",$("noticeInput").value.trim());
  renderNotice();
  alert("공지를 저장했습니다.");
}
function deleteNotice(){
  localStorage.removeItem("yeowooNotice");
  renderNotice();
  alert("공지를 삭제했습니다.");
}

document.addEventListener("click",event=>{
  const view=event.target.closest("[data-view]")?.dataset.view;
  if(view){
    switchView(view);
    if(view==="admin"&&sessionStorage.getItem("yeowooAdmin")==="1") showAdmin();
  }
  const page=event.target.closest("[data-page]")?.dataset.page;
  if(page!==undefined){
    currentPage=page==="all"?"all":Number(page);
    buildPageButtons();renderMembers();
  }
  const filter=event.target.closest("[data-filter]")?.dataset.filter;
  if(filter){
    activeFilter=filter;
    document.querySelectorAll("[data-filter]").forEach(b=>b.classList.remove("active"));
    event.target.closest("[data-filter]").classList.add("active");
    renderComparison();
  }
});

$("reloadList").onclick=loadMembers;
$("reloadForCheck").onclick=loadMembers;
$("adminReloadButton").onclick=loadMembers;
$("listSearch").oninput=renderMembers;
$("checkSearch").oninput=renderComparison;
$("analyzeButton").onclick=analyzeZip;
$("resetAnalysis").onclick=()=>{followers=new Set();following=new Set();comparison=[];$("resultPanel").classList.add("hidden");$("instagramZip").value="";$("analyzeStatus").textContent="단톡방 명단을 불러온 뒤 ZIP 파일을 선택해 주세요.";}
$("adminLoginButton").onclick=loginAdmin;
$("adminPassword").onkeydown=e=>{if(e.key==="Enter")loginAdmin();};
$("passwordToggle").onclick=()=>{const visible=$("adminPassword").type==="text";$("adminPassword").type=visible?"password":"text";$("passwordToggle").textContent=visible?"보기":"숨김";};
$("adminLogoutButton").onclick=logoutAdmin;
$("toggleLockButton").onclick=toggleLock;
$("saveNoticeButton").onclick=saveNotice;
$("deleteNoticeButton").onclick=deleteNotice;
$("noticeClose").onclick=()=>$("noticeBar").classList.add("hidden");

renderNotice();
updateLockUi();
switchView("check");
loadMembers();
