const SHEET_ID = "1NkrQhITYufdimYARxROJiaThJRrok0VNgzFZRnPmxrg";
const ADMIN_PASSWORD = "0702";
const PAGE_SIZE = 500;

let members = [];
let currentPage = "all";
let followers = new Set();
let following = new Set();
let comparison = [];
let activeFilter = "all";

const $ = (id) => document.getElementById(id);

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^_u\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function switchView(view) {
  ["list","check","admin"].forEach(name => {
    $(`${name}View`).classList.toggle("hidden", name !== view);
  });
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  if (view === "check") updateLockUi();
  if (view === "admin" && sessionStorage.getItem("yeowooAdmin") === "1") showAdmin();
  window.scrollTo(0,0);
}

function fetchSheet() {
  return new Promise((resolve, reject) => {
    const callback = `sheet_cb_${Date.now()}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("구글시트 응답 시간이 초과되었습니다."));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callback]; } catch (_) {}
      script.remove();
    }

    window[callback] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("구글시트를 불러오지 못했습니다."));
    };

    script.src =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
      `?sheet=${encodeURIComponent("팔로우 리스트")}` +
      `&tqx=responseHandler:${callback};out:json` +
      `&cache=${Date.now()}`;

    document.head.appendChild(script);
  });
}

async function loadMembers() {
  $("listStatus").textContent = "명단을 불러오는 중입니다.";

  try {
    const json = await fetchSheet();
    const rows = json.table?.rows || [];

    members = rows.map(row => {
      const c = row.c || [];
      return {
        no: Number(String(c[0]?.v ?? "").replace(/[^0-9]/g, "")),
        nickname: String(c[1]?.v ?? "").trim(),
        id: normalize(c[2]?.v ?? "")
      };
    })
    .filter(item => item.no > 0 && item.nickname && item.id)
    .sort((a,b) => a.no - b.no);

    $("totalPeople").textContent = `${members.length.toLocaleString()}명`;
    $("totalPages").textContent = `${Math.ceil(members.length / PAGE_SIZE)}개`;
    $("updatedAt").textContent = new Date().toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"});

    buildPageButtons();
    renderMembers();
    if (followers.size || following.size) buildComparison();
  } catch (error) {
    console.error(error);
    $("listStatus").textContent = "명단을 불러오지 못했습니다.";
    $("memberList").innerHTML =
      '<div class="empty">구글시트 공유 설정을 “링크가 있는 모든 사용자 · 뷰어”로 변경해 주세요.</div>';
  }
}

function buildPageButtons() {
  const count = Math.ceil(members.length / PAGE_SIZE);
  let html = `<button data-page="all" class="${currentPage==="all"?"active":""}">전체</button>`;
  for (let i=0; i<count; i++) {
    const start = i*PAGE_SIZE + 1;
    const end = Math.min((i+1)*PAGE_SIZE, members.length);
    html += `<button data-page="${i}" class="${currentPage===i?"active":""}">${start}~${end}</button>`;
  }
  $("pageButtons").innerHTML = html;
}

function renderMembers() {
  const q = $("listSearch").value.toLowerCase().trim();

  const filtered = members.filter(item => {
    const inPage = currentPage === "all" ||
      (item.no >= currentPage*PAGE_SIZE+1 && item.no <= (currentPage+1)*PAGE_SIZE);
    return inPage && `${item.no} ${item.nickname} ${item.id}`.toLowerCase().includes(q);
  });

  $("listStatus").textContent = `검색 결과 ${filtered.length.toLocaleString()}명`;

  $("memberList").innerHTML = filtered.length ? filtered.map(item => `
    <div class="member-row">
      <span>${item.no}</span>
      <span class="nickname">${escapeHtml(item.nickname)}</span>
      <span class="user-id">@${escapeHtml(item.id)}</span>
      <a class="insta-link" href="https://instagram.com/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">프로필</a>
    </div>`).join("") : '<div class="empty">표시할 명단이 없습니다.</div>';
}

function parseHtml(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const set = new Set();
  doc.querySelectorAll("a").forEach(a => {
    const href = a.getAttribute("href") || "";
    const label = (a.textContent || "").trim();
    const match = href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    const id = normalize(match ? match[1] : label);
    if (id && /^[a-z0-9._]+$/.test(id)) set.add(id);
  });
  return set;
}

function parseJson(text) {
  const set = new Set();
  const data = JSON.parse(text);

  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value.string_list_data)) {
      value.string_list_data.forEach(item => {
        const id = normalize(item.value || item.href || "");
        if (id && /^[a-z0-9._]+$/.test(id)) set.add(id);
      });
    }

    if (typeof value.title === "string") {
      const id = normalize(value.title);
      if (id && /^[a-z0-9._]+$/.test(id)) set.add(id);
    }

    Object.values(value).forEach(walk);
  }

  walk(data);
  return set;
}

async function analyzeZip() {
  if (isLocked()) return;

  const file = $("instagramZip").files[0];
  if (!file) return alert("인스타그램 ZIP 파일을 선택해 주세요.");
  if (typeof JSZip === "undefined") return alert("ZIP 분석 도구를 불러오지 못했습니다.");

  $("analyzeStatus").textContent = "ZIP 파일을 읽는 중입니다.";

  try {
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);

    const followerFiles = names.filter(name => /(^|\/)followers(_\d+)?\.(html|json)$/i.test(name));
    const followingFiles = names.filter(name => /(^|\/)following\.(html|json)$/i.test(name));

    if (!followerFiles.length || !followingFiles.length) {
      throw new Error("ZIP 안에서 팔로워 또는 팔로잉 파일을 찾지 못했습니다.");
    }

    followers = new Set();
    following = new Set();

    for (const name of followerFiles) {
      const text = await zip.file(name).async("text");
      const ids = /\.json$/i.test(name) ? parseJson(text) : parseHtml(text);
      ids.forEach(id => followers.add(id));
    }

    for (const name of followingFiles) {
      const text = await zip.file(name).async("text");
      const ids = /\.json$/i.test(name) ? parseJson(text) : parseHtml(text);
      ids.forEach(id => following.add(id));
    }

    buildComparison();
    $("analyzeStatus").textContent =
      `분석 완료 · 팔로워 ${followers.size.toLocaleString()}명 / 팔로잉 ${following.size.toLocaleString()}명`;
    $("resultPanel").classList.remove("hidden");
  } catch (error) {
    $("analyzeStatus").textContent = "분석에 실패했습니다.";
    alert(error.message);
  }
}

function buildComparison() {
  comparison = members.map(item => {
    const follower = followers.has(item.id);
    const followingMe = following.has(item.id);
    let status = "neither";
    if (follower && followingMe) status = "mutual";
    else if (followingMe) status = "onlyMe";
    else if (follower) status = "onlyThem";
    return {...item, status};
  });

  const count = status => comparison.filter(x => x.status === status).length;
  $("mutualCount").textContent = `${count("mutual")}명`;
  $("onlyMeCount").textContent = `${count("onlyMe")}명`;
  $("onlyThemCount").textContent = `${count("onlyThem")}명`;
  $("neitherCount").textContent = `${count("neither")}명`;
  renderComparison();
}

function renderComparison() {
  const q = $("checkSearch").value.toLowerCase().trim();
  const rows = comparison.filter(item =>
    (activeFilter === "all" || item.status === activeFilter) &&
    `${item.no} ${item.nickname} ${item.id}`.toLowerCase().includes(q)
  );

  const labels = {mutual:"맞팔", onlyMe:"나만", onlyThem:"상대만", neither:"서로 안 함"};

  $("checkList").innerHTML = rows.length ? rows.map(item => `
    <div class="check-row">
      <span>${item.no}</span>
      <span class="nickname">${escapeHtml(item.nickname)}</span>
      <span class="user-id">@${escapeHtml(item.id)}</span>
      <span class="status-badge status-${item.status}">${labels[item.status]}</span>
      <a class="insta-link" href="https://instagram.com/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">프로필</a>
    </div>`).join("") : '<div class="empty">표시할 결과가 없습니다.</div>';
}

function isLocked() {
  return localStorage.getItem("yeowooCheckLocked") !== "0";
}

function updateLockUi() {
  const locked = isLocked();
  $("checkLockPanel").classList.toggle("hidden", !locked);
  $("checkContent").classList.toggle("hidden", locked);
  $("lockStatusText").textContent = locked ? "현재 상태: 잠금" : "현재 상태: 사용 가능";
  $("toggleLockButton").textContent = locked ? "맞팔확인 잠금 해제" : "맞팔확인 잠그기";
}

function toggleLock() {
  const nextLocked = !isLocked();
  localStorage.setItem("yeowooCheckLocked", nextLocked ? "1" : "0");
  updateLockUi();
  alert(nextLocked ? "맞팔확인을 잠갔습니다." : "맞팔확인 잠금을 해제했습니다.");
}

function showAdmin() {
  $("adminLoginBox").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  updateLockUi();
}

function loginAdmin() {
  if ($("adminPassword").value === ADMIN_PASSWORD) {
    sessionStorage.setItem("yeowooAdmin","1");
    showAdmin();
  } else {
    alert("비밀번호가 틀렸습니다.");
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("yeowooAdmin");
  $("adminPanel").classList.add("hidden");
  $("adminLoginBox").classList.remove("hidden");
  $("adminPassword").value = "";
}

function renderNotice() {
  const notice = localStorage.getItem("yeowooNotice") || "";
  $("noticeBar").classList.toggle("hidden", !notice);
  $("noticeText").textContent = notice;
  $("noticeInput").value = notice;
}

document.addEventListener("click", e => {
  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) switchView(viewBtn.dataset.view);

  const pageBtn = e.target.closest("[data-page]");
  if (pageBtn) {
    currentPage = pageBtn.dataset.page === "all" ? "all" : Number(pageBtn.dataset.page);
    buildPageButtons();
    renderMembers();
  }

  const filterBtn = e.target.closest("[data-filter]");
  if (filterBtn) {
    activeFilter = filterBtn.dataset.filter;
    document.querySelectorAll(".filter").forEach(btn => btn.classList.remove("active"));
    if (filterBtn.classList.contains("filter")) filterBtn.classList.add("active");
    renderComparison();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  $("reloadList").onclick = loadMembers;
  $("adminReloadButton").onclick = loadMembers;
  $("listSearch").oninput = renderMembers;
  $("checkSearch").oninput = renderComparison;
  $("analyzeButton").onclick = analyzeZip;
  $("resetAnalysis").onclick = () => {
    followers = new Set(); following = new Set(); comparison = [];
    $("resultPanel").classList.add("hidden");
    $("instagramZip").value = "";
    $("analyzeStatus").textContent = "ZIP 파일을 선택해 주세요.";
  };

  $("adminLoginButton").onclick = loginAdmin;
  $("adminPassword").onkeydown = e => { if (e.key === "Enter") loginAdmin(); };
  $("passwordToggle").onclick = () => {
    const visible = $("adminPassword").type === "text";
    $("adminPassword").type = visible ? "password" : "text";
    $("passwordToggle").textContent = visible ? "보기" : "숨김";
  };
  $("adminLogoutButton").onclick = logoutAdmin;
  $("toggleLockButton").onclick = toggleLock;

  $("saveNoticeButton").onclick = () => {
    localStorage.setItem("yeowooNotice", $("noticeInput").value.trim());
    renderNotice();
    alert("공지를 저장했습니다.");
  };
  $("deleteNoticeButton").onclick = () => {
    localStorage.removeItem("yeowooNotice");
    renderNotice();
    alert("공지를 삭제했습니다.");
  };
  $("noticeClose").onclick = () => $("noticeBar").classList.add("hidden");

  renderNotice();
  updateLockUi();
  loadMembers();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
