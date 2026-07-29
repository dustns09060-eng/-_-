
const SHEET_ID = "1NkrQhITYufdimYARxROJiaThJRrok0VNgzFZRnPmxrg";
const SHEET_GID = "1547262511";
const ADMIN_PASSWORD = "0702";
const PAGE_SIZE = 500;

let members = [];
let currentPage = "all";
let followers = new Set();
let following = new Set();
let comparison = [];
let activeFilter = "all";

const $ = (id) => document.getElementById(id);
const normalize = (value) =>
  String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^_u\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);

function switchView(view) {
  $("listView")?.classList.toggle("hidden", view !== "list");
  $("checkView")?.classList.toggle("hidden", view !== "check");
  $("adminView")?.classList.toggle("hidden", view !== "admin");

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (view === "check") updateLockUi();
  window.scrollTo(0, 0);
}

function fetchSheetJsonp() {
  return new Promise((resolve, reject) => {
    const callback = `sheetCallback_${Date.now()}`;
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("구글시트 응답 시간이 초과되었습니다."));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      try {
        delete window[callback];
      } catch (_) {}
      script.remove();
    }

    window[callback] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("구글시트를 불러오지 못했습니다."));
    };

    script.src =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
      `?gid=${encodeURIComponent(SHEET_GID)}` +
      `&tqx=responseHandler:${callback};out:json` +
      `&cache=${Date.now()}`;

    document.head.appendChild(script);
  });
}

async function loadMembers() {
  if ($("listStatus")) $("listStatus").textContent = "명단을 불러오는 중입니다.";

  try {
    const json = await fetchSheetJsonp();
    const rows = json.table?.rows || [];

    members = rows
      .map((row) => {
        const cells = row.c || [];
        return {
          no: Number(String(cells[0]?.v ?? "").replace(/[^0-9]/g, "")),
          nickname: String(cells[1]?.v ?? "").trim(),
          id: normalize(cells[2]?.v ?? "")
        };
      })
      .filter((item) => item.no && item.nickname && item.id)
      .sort((a, b) => a.no - b.no);

    if ($("totalPeople")) $("totalPeople").textContent = `${members.length.toLocaleString()}명`;
    if ($("totalPages")) $("totalPages").textContent = `${Math.ceil(members.length / PAGE_SIZE)}개`;
    if ($("updatedAt")) {
      $("updatedAt").textContent = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    buildPageButtons();
    renderMembers();

    if (followers.size || following.size) buildComparison();
  } catch (error) {
    if ($("listStatus")) $("listStatus").textContent = "명단을 불러오지 못했습니다.";
    if ($("memberList")) {
      $("memberList").innerHTML =
        '<div class="empty">새 구글시트의 공유 설정을 “링크가 있는 모든 사용자 · 뷰어”로 변경해 주세요.</div>';
    }
    console.error(error);
  }
}

function buildPageButtons() {
  if (!$("pageButtons")) return;

  const count = Math.ceil(members.length / PAGE_SIZE);
  let html = `<button data-page="all" class="${currentPage === "all" ? "active" : ""}">전체</button>`;

  for (let index = 0; index < count; index += 1) {
    const start = index * PAGE_SIZE + 1;
    const end = Math.min((index + 1) * PAGE_SIZE, members.length);
    html += `<button data-page="${index}" class="${currentPage === index ? "active" : ""}">${start}~${end}</button>`;
  }

  $("pageButtons").innerHTML = html;
}

function renderMembers() {
  if (!$("memberList")) return;

  const query = ($("listSearch")?.value || "").toLowerCase().trim();

  const filtered = members.filter((item) => {
    const inPage =
      currentPage === "all" ||
      (item.no >= currentPage * PAGE_SIZE + 1 &&
        item.no <= (currentPage + 1) * PAGE_SIZE);

    return (
      inPage &&
      `${item.no} ${item.nickname} ${item.id}`.toLowerCase().includes(query)
    );
  });

  if ($("listStatus")) {
    $("listStatus").textContent = `검색 결과 ${filtered.length.toLocaleString()}명`;
  }

  $("memberList").innerHTML = filtered.length
    ? filtered
        .map(
          (item) => `
      <div class="member-row">
        <span>${item.no}</span>
        <span class="nickname">${escapeHtml(item.nickname)}</span>
        <span class="user-id">@${escapeHtml(item.id)}</span>
        <a class="insta-link" target="_blank" rel="noopener"
           href="https://instagram.com/${encodeURIComponent(item.id)}">인스타</a>
      </div>`
        )
        .join("")
    : '<div class="empty">표시할 명단이 없습니다.</div>';
}

function parseHtml(text) {
  const documentObject = new DOMParser().parseFromString(text, "text/html");
  const result = new Set();

  documentObject.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const label = (anchor.textContent || "").trim();
    const match = href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i);
    const id = normalize(match ? match[1] : label);

    if (id && /^[a-z0-9._]+$/.test(id)) result.add(id);
  });

  return result;
}

function parseJson(text) {
  const result = new Set();
  const data = JSON.parse(text);

  function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!value || typeof value !== "object") return;

    if (Array.isArray(value.string_list_data)) {
      value.string_list_data.forEach((item) => {
        const id = normalize(item.value || item.href || "");
        if (id && /^[a-z0-9._]+$/.test(id)) result.add(id);
      });
    }

    if (typeof value.title === "string") {
      const id = normalize(value.title);
      if (id && /^[a-z0-9._]+$/.test(id)) result.add(id);
    }

    Object.values(value).forEach(walk);
  }

  walk(data);
  return result;
}

async function analyzeZip() {
  if (isLocked()) return;

  const file = $("instagramZip")?.files?.[0];
  if (!file) {
    alert("인스타그램 ZIP 파일을 선택해 주세요.");
    return;
  }

  if (typeof JSZip === "undefined") {
    alert("ZIP 분석 도구를 불러오지 못했습니다.");
    return;
  }

  if ($("analyzeStatus")) $("analyzeStatus").textContent = "ZIP 파일을 읽는 중입니다.";

  try {
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

    const followerFiles = names.filter((name) =>
      /(^|\/)followers(_\d+)?\.(html|json)$/i.test(name)
    );
    const followingFiles = names.filter((name) =>
      /(^|\/)following\.(html|json)$/i.test(name)
    );

    if (!followerFiles.length || !followingFiles.length) {
      throw new Error("ZIP 안에서 followers 또는 following 파일을 찾지 못했습니다.");
    }

    followers = new Set();
    following = new Set();

    for (const name of followerFiles) {
      const text = await zip.file(name).async("text");
      const ids = /\.json$/i.test(name) ? parseJson(text) : parseHtml(text);
      ids.forEach((id) => followers.add(id));
    }

    for (const name of followingFiles) {
      const text = await zip.file(name).async("text");
      const ids = /\.json$/i.test(name) ? parseJson(text) : parseHtml(text);
      ids.forEach((id) => following.add(id));
    }

    buildComparison();

    if ($("analyzeStatus")) {
      $("analyzeStatus").textContent =
        `분석 완료 · 팔로워 ${followers.size.toLocaleString()}명 / ` +
        `팔로잉 ${following.size.toLocaleString()}명`;
    }

    $("resultPanel")?.classList.remove("hidden");
  } catch (error) {
    if ($("analyzeStatus")) $("analyzeStatus").textContent = "분석에 실패했습니다.";
    alert(error.message);
  }
}

function buildComparison() {
  comparison = members.map((item) => {
    const isFollower = followers.has(item.id);
    const isFollowing = following.has(item.id);

    let status = "neither";
    if (isFollower && isFollowing) status = "mutual";
    else if (isFollowing) status = "onlyMe";
    else if (isFollower) status = "onlyThem";

    return { ...item, status };
  });

  const count = (status) => comparison.filter((item) => item.status === status).length;

  if ($("mutualCount")) $("mutualCount").textContent = `${count("mutual").toLocaleString()}명`;
  if ($("onlyMeCount")) $("onlyMeCount").textContent = `${count("onlyMe").toLocaleString()}명`;
  if ($("onlyThemCount")) $("onlyThemCount").textContent = `${count("onlyThem").toLocaleString()}명`;
  if ($("neitherCount")) $("neitherCount").textContent = `${count("neither").toLocaleString()}명`;

  const labels = {
    all: `전체 (${comparison.length})`,
    mutual: `맞팔 (${count("mutual")})`,
    onlyMe: `나만 팔로우 (${count("onlyMe")})`,
    onlyThem: `상대만 팔로우 (${count("onlyThem")})`,
    neither: `서로 안 함 (${count("neither")})`
  };

  Object.entries(labels).forEach(([filter, label]) => {
    const button = document.querySelector(`[data-filter="${filter}"]`);
    if (button) button.textContent = label;
  });

  renderComparison();
}

function statusLabel(status) {
  return {
    mutual: "맞팔",
    onlyMe: "나만",
    onlyThem: "상대만",
    neither: "서로 안 함"
  }[status];
}

function renderComparison() {
  if (!$("checkList")) return;

  const query = ($("checkSearch")?.value || "").toLowerCase().trim();

  const rows = comparison.filter(
    (item) =>
      (activeFilter === "all" || item.status === activeFilter) &&
      `${item.no} ${item.nickname} ${item.id}`.toLowerCase().includes(query)
  );

  $("checkList").innerHTML = rows.length
    ? rows
        .map(
          (item) => `
      <div class="check-row">
        <span>${item.no}</span>
        <span class="nickname">${escapeHtml(item.nickname)}</span>
        <span class="user-id">@${escapeHtml(item.id)}</span>
        <span class="status-badge status-${item.status}">${statusLabel(item.status)}</span>
        <a class="insta-link" target="_blank" rel="noopener"
           href="https://instagram.com/${encodeURIComponent(item.id)}">인스타</a>
      </div>`
        )
        .join("")
    : '<div class="empty">표시할 결과가 없습니다.</div>';
}

function isLocked() {
  return localStorage.getItem("yeowooCheckLocked") !== "0";
}

function updateLockUi() {
  const locked = isLocked();

  $("checkLockPanel")?.classList.toggle("hidden", !locked);
  $("checkContent")?.classList.toggle("hidden", locked);

  if ($("lockStatusText")) {
    $("lockStatusText").textContent = locked
      ? "현재 상태: 잠금"
      : "현재 상태: 사용 가능";
  }

  if ($("toggleLockButton")) {
    $("toggleLockButton").textContent = locked
      ? "맞팔확인 잠금 해제"
      : "맞팔확인 잠그기";
  }
}

function toggleLock() {
  const willLock = !isLocked();
  localStorage.setItem("yeowooCheckLocked", willLock ? "1" : "0");
  updateLockUi();
  alert(willLock ? "맞팔확인을 잠갔습니다." : "맞팔확인 잠금을 해제했습니다.");
}

function showAdmin() {
  $("adminLoginBox")?.classList.add("hidden");
  $("adminPanel")?.classList.remove("hidden");
  updateLockUi();
}

function loginAdmin() {
  if ($("adminPassword")?.value === ADMIN_PASSWORD) {
    sessionStorage.setItem("yeowooAdmin", "1");
    showAdmin();
  } else {
    alert("비밀번호가 틀렸습니다.");
    if ($("adminPassword")) {
      $("adminPassword").value = "";
      $("adminPassword").focus();
    }
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("yeowooAdmin");
  $("adminPanel")?.classList.add("hidden");
  $("adminLoginBox")?.classList.remove("hidden");
  if ($("adminPassword")) $("adminPassword").value = "";
}

function renderNotice() {
  const notice = localStorage.getItem("yeowooNotice") || "";
  $("noticeBar")?.classList.toggle("hidden", !notice);
  if ($("noticeText")) $("noticeText").textContent = notice;
  if ($("noticeInput")) $("noticeInput").value = notice;
}

function saveNotice() {
  localStorage.setItem("yeowooNotice", ($("noticeInput")?.value || "").trim());
  renderNotice();
  alert("공지를 저장했습니다.");
}

function deleteNotice() {
  localStorage.removeItem("yeowooNotice");
  renderNotice();
  alert("공지를 삭제했습니다.");
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]")?.dataset.view;

  if (view) {
    switchView(view);
    if (view === "admin" && sessionStorage.getItem("yeowooAdmin") === "1") {
      showAdmin();
    }
  }

  const page = event.target.closest("[data-page]")?.dataset.page;
  if (page !== undefined) {
    currentPage = page === "all" ? "all" : Number(page);
    buildPageButtons();
    renderMembers();
  }

  const filter = event.target.closest("[data-filter]")?.dataset.filter;
  if (filter) {
    activeFilter = filter;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.remove("active");
    });
    event.target.closest("[data-filter]").classList.add("active");
    renderComparison();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const sheetLink = document.querySelector('a[href*="docs.google.com/spreadsheets"]');
  if (sheetLink) {
    sheetLink.href =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`;
  }

  $("reloadList") && ($("reloadList").onclick = loadMembers);
  $("reloadForCheck") && ($("reloadForCheck").onclick = loadMembers);
  $("adminReloadButton") && ($("adminReloadButton").onclick = loadMembers);
  $("listSearch") && ($("listSearch").oninput = renderMembers);
  $("checkSearch") && ($("checkSearch").oninput = renderComparison);
  $("analyzeButton") && ($("analyzeButton").onclick = analyzeZip);

  $("resetAnalysis") &&
    ($("resetAnalysis").onclick = () => {
      followers = new Set();
      following = new Set();
      comparison = [];
      $("resultPanel")?.classList.add("hidden");
      if ($("instagramZip")) $("instagramZip").value = "";
      if ($("analyzeStatus")) {
        $("analyzeStatus").textContent =
          "단톡방 명단을 불러온 뒤 ZIP 파일을 선택해 주세요.";
      }
    });

  $("adminLoginButton") && ($("adminLoginButton").onclick = loginAdmin);
  $("adminPassword") &&
    ($("adminPassword").onkeydown = (event) => {
      if (event.key === "Enter") loginAdmin();
    });

  $("passwordToggle") &&
    ($("passwordToggle").onclick = () => {
      const visible = $("adminPassword").type === "text";
      $("adminPassword").type = visible ? "password" : "text";
      $("passwordToggle").textContent = visible ? "보기" : "숨김";
    });

  $("adminLogoutButton") && ($("adminLogoutButton").onclick = logoutAdmin);
  $("toggleLockButton") && ($("toggleLockButton").onclick = toggleLock);
  $("saveNoticeButton") && ($("saveNoticeButton").onclick = saveNotice);
  $("deleteNoticeButton") && ($("deleteNoticeButton").onclick = deleteNotice);
  $("noticeClose") &&
    ($("noticeClose").onclick = () => $("noticeBar")?.classList.add("hidden"));

  renderNotice();
  updateLockUi();
  loadMembers();
});
