const $ = (id) => document.getElementById(id);

let roomList = [];
let result = { all: [], mutual: [], onlyMe: [], fansOnly: [], neither: [] };
let currentTab = "all";
let currentGroup = 0;
let installPrompt = null;
let adminLoggedIn = false;
let adminPasswordValue = "";
let publicConfig = null;
let accessGranted = false;
let appLockGranted = false;
let matchGranted = false;
let gateMode = "loading";

let config = {
  version: "V26 FULL REALTIME",
  appName: "여우방 팔로우리스트+맞팔확인",
  apiUrl: "",
  sheetId: "",
  sheetName: "Sheet1",
  fallbackCsv: "room-list.csv",
};

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = "none"), 1900);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/^instagram\.com\//, "")
    .replace(/^_u\//, "")
    .replace(/^@+/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .trim();
}

function validUsername(value) {
  return /^[a-z0-9._]{1,30}$/.test(value) &&
    !["instagram", "accounts", "explore", "direct", "p", "reels", "stories", "www", "about", "privacy", "terms", "login", "_u"].includes(value);
}

function unique(values) {
  const set = new Set();
  for (const value of values || []) {
    const id = normalize(value);
    if (validUsername(id)) set.add(id);
  }
  return [...set];
}

async function loadConfig() {
  try {
    const response = await fetch(`config.json?t=${Date.now()}`, { cache: "no-store" });
    if (response.ok) config = { ...config, ...(await response.json()) };
  } catch (_) {}
}

async function apiGet(action) {
  if (!config.apiUrl) throw new Error("Apps Script 주소가 설정되지 않았습니다.");
  const url = new URL(config.apiUrl);
  url.searchParams.set("action", action);
  url.searchParams.set("_t", Date.now().toString());

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "API 요청 실패");
  return data;
}

async function apiPost(action, payload = {}) {
  if (!config.apiUrl) throw new Error("Apps Script 주소가 설정되지 않았습니다.");

  const params = new URLSearchParams();
  params.set("action", action);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  });

  const response = await fetch(config.apiUrl, {
    method: "POST",
    body: params,
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "API 요청 실패");
  return data;
}

function setGate(mode, message = "") {
  gateMode = mode;
  const title = $("gateTitle");
  const text = $("gateMessage");
  const form = $("gateForm");
  const adminBtn = $("gateAdminBtn");
  const retryBtn = $("gateRetryBtn");
  const password = $("gatePassword");

  $("gateError").textContent = "";
  form.classList.add("hidden");
  adminBtn.classList.add("hidden");
  retryBtn.classList.add("hidden");
  password.value = "";

  if (mode === "loading") {
    title.textContent = "접속 확인";
    text.textContent = message || "설정을 불러오는 중입니다.";
  } else if (mode === "appLock") {
    title.textContent = "앱 잠금 중";
    text.textContent = "앱잠금 비밀번호를 입력해 주세요.";
    password.placeholder = "앱잠금 비밀번호";
    form.classList.remove("hidden");
    adminBtn.classList.remove("hidden");
  } else if (mode === "access") {
    title.textContent = "접속 비밀번호";
    text.textContent = "여우방 이용 비밀번호를 입력해 주세요.";
    password.placeholder = "접속 비밀번호";
    form.classList.remove("hidden");
  } else if (mode === "error") {
    title.textContent = "연결 확인 필요";
    text.textContent = message || "Google Apps Script 연결에 실패했습니다.";
    retryBtn.classList.remove("hidden");
  }
}

function showGate() {
  $("appGate").classList.remove("hidden");
  document.body.classList.add("gate-open");
}

function hideGate() {
  $("appGate").classList.add("hidden");
  document.body.classList.remove("gate-open");
}

async function bootstrapAuth() {
  showGate();
  setGate("loading");

  try {
    publicConfig = await apiGet("publicConfig");
    updateLockIndicators();

    if (publicConfig.appLocked && !appLockGranted) {
      setGate("appLock");
      return;
    }

    if (!accessGranted) {
      setGate("access");
      return;
    }

    hideGate();
    await loadAfterAuth();
  } catch (error) {
    setGate("error", `설정을 불러오지 못했습니다. ${error.message}`);
  }
}

async function submitGatePassword() {
  const password = $("gatePassword").value.trim();
  if (!password) {
    $("gateError").textContent = "비밀번호를 입력해 주세요.";
    return;
  }

  try {
    $("gateSubmitBtn").disabled = true;

    if (gateMode === "appLock") {
      await apiPost("verifyAppLockPassword", { password });
      appLockGranted = true;
      setGate("access");
      return;
    }

    if (gateMode === "access") {
      await apiPost("verifyAccessPassword", { password });
      accessGranted = true;
      hideGate();
      await loadAfterAuth();
    }
  } catch (error) {
    $("gateError").textContent = "비밀번호가 올바르지 않습니다.";
  } finally {
    $("gateSubmitBtn").disabled = false;
  }
}

async function openWithAdminPassword() {
  const password = $("gatePassword").value.trim();
  if (!password) {
    $("gateError").textContent = "운영진 비밀번호를 입력해 주세요.";
    return;
  }

  try {
    await apiPost("adminLogin", { password });
    adminLoggedIn = true;
    adminPasswordValue = password;
    accessGranted = true;
    appLockGranted = true;
    hideGate();
    await loadAfterAuth();
    showView("adminView");
    showAdminPanel();
    toast("운영진으로 접속했습니다.");
  } catch (_) {
    $("gateError").textContent = "운영진 비밀번호가 올바르지 않습니다.";
  }
}

async function loadAfterAuth() {
  await Promise.allSettled([loadRoomList(false), loadNotices(), refreshPublicConfig(false)]);
}

async function refreshPublicConfig(recheck = true) {
  const previousUpdatedAt = publicConfig?.updatedAt || "";
  publicConfig = await apiGet("publicConfig");
  updateLockIndicators();
  applyMatchLock();

  if (
    recheck &&
    previousUpdatedAt &&
    publicConfig.updatedAt &&
    previousUpdatedAt !== publicConfig.updatedAt &&
    !adminLoggedIn
  ) {
    accessGranted = false;
    appLockGranted = false;
    matchGranted = false;
    await bootstrapAuth();
  }
}

function updateLockIndicators() {
  const appLocked = Boolean(publicConfig?.appLocked);
  const matchLocked = Boolean(publicConfig?.matchLocked);

  if ($("appLockState")) {
    $("appLockState").textContent = appLocked ? "잠금 중" : "사용 가능";
    $("appLockState").className = `lock-state ${appLocked ? "locked" : "unlocked"}`;
  }

  if ($("matchLockState")) {
    $("matchLockState").textContent = matchLocked ? "잠금 중" : "사용 가능";
    $("matchLockState").className = `lock-state ${matchLocked ? "locked" : "unlocked"}`;
  }
}

function applyMatchLock() {
  const locked = Boolean(publicConfig?.matchLocked) && !matchGranted && !adminLoggedIn;
  $("matchLockCard").classList.toggle("hidden", !locked);
  $("matchContent").classList.toggle("hidden", locked);
}

async function unlockMatch() {
  const password = $("matchPassword").value.trim();
  if (!password) {
    $("matchUnlockMsg").textContent = "비밀번호를 입력해 주세요.";
    return;
  }

  try {
    await apiPost("verifyMatchPassword", { password });
    matchGranted = true;
    $("matchUnlockMsg").textContent = "";
    $("matchPassword").value = "";
    applyMatchLock();
    toast("맞팔확인 잠금이 해제되었습니다.");
  } catch (_) {
    $("matchUnlockMsg").textContent = "맞팔확인 비밀번호가 올바르지 않습니다.";
  }
}

function sheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rowsToRoom(rows) {
  const list = [];
  rows.forEach((row, index) => {
    const joined = row.join(" ");
    if (index === 0 && (joined.includes("번호") || joined.includes("닉네임") || joined.includes("아이디"))) return;

    const id = normalize(row[2] || row[1] || row[0]);
    if (validUsername(id)) {
      list.push({
        no: row[0] || list.length + 1,
        name: row[1] || "",
        id,
      });
    }
  });

  const seen = new Set();
  return list.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

async function loadRoomList(show = false) {
  setSheetState("불러오는 중");
  let lastError = "";

  try {
    const data = await apiGet("roomList");
    roomList = (data.members || []).map((item, index) => ({
      no: item.no || index + 1,
      name: item.name || "",
      id: normalize(item.id),
    })).filter((item) => validUsername(item.id));

    if (!roomList.length) throw new Error("API 명단 0명");

    setSheetState("정상");
    updateFollowStats();
    renderGroupTabs();
    renderFollowList();
    if (show) toast("명단 새로고침 완료");
    return;
  } catch (error) {
    lastError = error.message;
  }

  const urls = [];
  if (config.sheetId) {
    const sheet = encodeURIComponent(config.sheetName || "Sheet1");
    urls.push(`https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&sheet=${sheet}&t=${Date.now()}`);
    urls.push(`https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=csv&sheet=${sheet}&t=${Date.now()}`);
  }
  urls.push(`${config.fallbackCsv || "room-list.csv"}?t=${Date.now()}`);

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const list = rowsToRoom(parseCsv(await response.text()));
      if (!list.length) throw new Error("0명");
      roomList = list;
      setSheetState("백업");
      updateFollowStats();
      renderGroupTabs();
      renderFollowList();
      if (show) toast("백업 명단으로 불러왔습니다.");
      return;
    } catch (error) {
      lastError = error.message;
    }
  }

  setSheetState("오류");
  $("followState").textContent = `명단을 불러오지 못했습니다. (${lastError})`;
  if (show) toast("명단 불러오기 실패");
}

function setSheetState(state) {
  if ($("roomState")) {
    $("roomState").textContent = state === "정상" || state === "백업" ? `${roomList.length}명 준비 완료` : state;
  }
  if ($("adminApiState")) $("adminApiState").textContent = state;
}

function updateFollowStats() {
  const groups = Math.ceil(roomList.length / 500);
  $("followTotal").textContent = `${roomList.length}명`;
  $("groupTotal").textContent = `${groups}조`;
  $("lastRefresh").textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  $("adminTotal").textContent = `${roomList.length}명`;
  $("adminGroups").textContent = `${groups}조`;
  $("followState").textContent = `전체 ${roomList.length}명 · 500명씩 ${groups}개 조`;
}

function renderGroupTabs() {
  const total = Math.max(1, Math.ceil(roomList.length / 500));
  $("groupTabs").innerHTML = ["전체", ...Array.from({ length: total }, (_, i) => `${i + 1}조`)]
    .map((text, index) => `<button class="group-tab ${index === currentGroup ? "active" : ""}" data-group="${index}">${text}</button>`)
    .join("");

  document.querySelectorAll(".group-tab").forEach((button) => {
    button.onclick = () => {
      currentGroup = Number(button.dataset.group);
      renderGroupTabs();
      renderFollowList();
    };
  });
}

function followFiltered() {
  const query = String($("followSearch").value || "").trim().toLowerCase();
  let items = roomList;
  if (currentGroup > 0) items = items.slice((currentGroup - 1) * 500, currentGroup * 500);

  return query
    ? items.filter((item) =>
        String(item.no).includes(query) ||
        item.id.includes(normalize(query)) ||
        String(item.name).toLowerCase().includes(query))
    : items;
}

function renderFollowList() {
  const items = followFiltered();
  $("followList").innerHTML = items.length
    ? items.map((item) => `
      <div class="follow-item">
        <span>${escapeHtml(item.no)}</span>
        <span>${escapeHtml(item.name)}</span>
        <a href="https://www.instagram.com/${encodeURIComponent(item.id)}/" target="_blank" rel="noopener">@${escapeHtml(item.id)}</a>
        <a class="insta-btn" href="https://www.instagram.com/${encodeURIComponent(item.id)}/" target="_blank" rel="noopener">인스타</a>
      </div>`).join("")
    : '<div class="empty-state">검색 결과가 없습니다.</div>';
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  if (id === "matchView") applyMatchLock();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function findFiles(zip) {
  const files = Object.keys(zip.files).filter((path) => !zip.files[path].dir);
  return {
    followers: files.filter((path) => /followers_\d+\.(html|json)$/i.test(path.replace(/\\/g, "/").split("/").pop())),
    following: files.find((path) => /^following\.(html|json)$/i.test(path.replace(/\\/g, "/").split("/").pop())),
  };
}

function extractHtml(text) {
  const ids = [];
  let match;
  let regex = /href=["']https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)\/?[^"']*["']/gi;
  while ((match = regex.exec(text))) ids.push(match[1]);

  if (!ids.length) {
    regex = /https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/gi;
    while ((match = regex.exec(text))) ids.push(match[1]);
  }
  return unique(ids);
}

function walkJson(value, output) {
  if (value == null) return;
  if (typeof value === "string") {
    const id = normalize(value);
    if (validUsername(id)) output.push(id);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, output));
    return;
  }
  if (typeof value === "object") Object.values(value).forEach((item) => walkJson(item, output));
}

function extractJson(text) {
  const output = [];
  try { walkJson(JSON.parse(text), output); } catch (_) {}
  return unique(output);
}

async function parseInstagramZip(file) {
  if (!file) throw new Error("ZIP 파일을 선택해 주세요.");
  if (!window.JSZip) throw new Error("ZIP 분석 라이브러리를 불러오지 못했습니다.");

  const zip = await JSZip.loadAsync(file);
  const paths = findFiles(zip);

  if (!paths.followers.length) throw new Error("followers_1 파일을 찾지 못했습니다.");
  if (!paths.following) throw new Error("following 파일을 찾지 못했습니다.");

  let followers = [];
  for (const path of paths.followers) {
    const text = await zip.files[path].async("string");
    followers.push(...(path.endsWith(".json") ? extractJson(text) : extractHtml(text)));
  }

  const followingText = await zip.files[paths.following].async("string");
  const following = paths.following.endsWith(".json") ? extractJson(followingText) : extractHtml(followingText);

  return { followers: unique(followers), following };
}

function classify(followers, following) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  const all = roomList.map((person) => ({
    ...person,
    status:
      followerSet.has(person.id) && followingSet.has(person.id) ? "mutual" :
      !followerSet.has(person.id) && followingSet.has(person.id) ? "onlyMe" :
      followerSet.has(person.id) && !followingSet.has(person.id) ? "fansOnly" :
      "neither",
  }));

  result = {
    all,
    mutual: all.filter((item) => item.status === "mutual"),
    onlyMe: all.filter((item) => item.status === "onlyMe"),
    fansOnly: all.filter((item) => item.status === "fansOnly"),
    neither: all.filter((item) => item.status === "neither"),
  };
}

async function analyze() {
  if (publicConfig?.matchLocked && !matchGranted && !adminLoggedIn) {
    applyMatchLock();
    toast("맞팔확인 비밀번호를 먼저 입력해 주세요.");
    return;
  }

  const button = $("analyzeBtn");
  try {
    button.disabled = true;
    button.textContent = "분석 중...";
    if (!roomList.length) await loadRoomList();
    const parsed = await parseInstagramZip($("zipFile").files[0]);
    classify(parsed.followers, parsed.following);
    updateSummary();
    showTab("all");
    $("summarySection").classList.remove("hidden");
    $("resultsSection").classList.remove("hidden");
    $("status").textContent = `분석 완료 · 단톡방 ${roomList.length}명 기준`;
    toast("분석 완료");
  } catch (error) {
    $("status").textContent = `오류: ${error.message}`;
    toast("분석 실패");
  } finally {
    button.disabled = false;
    button.innerHTML = '맞팔 분석 시작 <span>→</span>';
  }
}

function percent(value, total) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0%";
}

function updateSummary() {
  const total = result.all.length;
  for (const key of ["mutual", "onlyMe", "fansOnly", "neither"]) {
    $(`${key}Count`).textContent = `${result[key].length}명`;
    $(`${key}Rate`).textContent = percent(result[key].length, total);
    $(`tab${key[0].toUpperCase() + key.slice(1)}`).textContent = result[key].length;
  }
  $("tabAll").textContent = total;
  $("rateText").innerHTML = `단톡방 맞팔률 <strong>${percent(result.mutual.length, total)}</strong> · ${result.mutual.length}/${total}명`;
}

function statusLabel(status) {
  return {
    mutual: "맞팔 완료",
    onlyMe: "나만 팔로우 함",
    fansOnly: "상대가 팔로우만 함",
    neither: "서로 팔로우 안 함",
  }[status];
}

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  renderMatchList();
}

function matchFiltered() {
  const query = String($("searchInput").value || "").trim().toLowerCase();
  const items = result[currentTab] || [];
  return query
    ? items.filter((item) => item.id.includes(normalize(query)) || String(item.name).toLowerCase().includes(query))
    : items;
}

function renderMatchList() {
  const items = matchFiltered();
  $("list").innerHTML = items.length
    ? items.map((item, index) => `
      <div class="item">
        <span class="item-no">${index + 1}</span>
        <div class="item-person">
          <strong class="item-name">${escapeHtml(item.name)}</strong>
          <a class="id" href="https://www.instagram.com/${encodeURIComponent(item.id)}/" target="_blank" rel="noopener">@${escapeHtml(item.id)}</a>
        </div>
        <span class="badge ${item.status}">${statusLabel(item.status)}</span>
        <a class="insta" href="https://www.instagram.com/${encodeURIComponent(item.id)}/" target="_blank" rel="noopener">인스타</a>
      </div>`).join("")
    : '<div class="empty-state">결과가 없습니다.</div>';
}

async function copyCurrent() {
  const items = currentTab === "all" ? [...result.onlyMe, ...result.neither] : matchFiltered();
  if (!items.length) return toast("복사할 명단이 없습니다.");

  await navigator.clipboard.writeText(
    items.map((item, index) => `${index + 1}. ${item.name} @${item.id} - ${statusLabel(item.status)}`).join("\n")
  );
  toast("복사 완료");
}

function downloadCsv() {
  const items = matchFiltered();
  if (!items.length) return toast("다운로드할 명단이 없습니다.");

  const rows = [
    ["번호", "닉네임", "아이디", "상태"],
    ...items.map((item, index) => [index + 1, item.name, `@${item.id}`, statusLabel(item.status)]),
  ];
  const csv = "\ufeff" + rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "여우방_명단.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function resetAnalysis() {
  $("zipFile").value = "";
  $("fileName").textContent = "인스타그램 ZIP 파일 선택";
  $("summarySection").classList.add("hidden");
  $("resultsSection").classList.add("hidden");
}

async function loadNotices() {
  try {
    const data = await apiGet("notices");
    renderNotices(data.notices || []);
  } catch (_) {
    renderNotices([]);
  }
}

function renderNotices(notices) {
  $("adminNotices").textContent = `${notices.length}개`;
  $("noticeCard").classList.toggle("hidden", !notices.length);

  $("noticeList").innerHTML = notices
    .map((notice) => `<div class="notice-item"><p>${escapeHtml(notice.content)}</p></div>`)
    .join("");

  $("adminNoticeList").innerHTML = notices.length
    ? notices.map((notice) => `
      <div class="notice-row">
        <div>
          <strong>${escapeHtml(notice.createdAt)}</strong>
          <div class="subtext">${escapeHtml(notice.content)}</div>
        </div>
        <button data-notice-id="${escapeHtml(notice.noticeId)}" type="button">삭제</button>
      </div>`).join("")
    : '<p class="state-text">등록된 공지가 없습니다.</p>';

  document.querySelectorAll("[data-notice-id]").forEach((button) => {
    button.onclick = () => deleteNotice(button.dataset.noticeId);
  });
}

async function adminLogin() {
  const password = $("adminPassword").value.trim();
  if (!password) return;

  try {
    await apiPost("adminLogin", { password });
    adminLoggedIn = true;
    adminPasswordValue = password;
    $("adminLoginMsg").textContent = "";
    showAdminPanel();
    matchGranted = true;
    applyMatchLock();
    toast("운영진 로그인 완료");
  } catch (_) {
    $("adminLoginMsg").textContent = "운영진 비밀번호가 올바르지 않습니다.";
  }
}

function showAdminPanel() {
  $("adminPanel").classList.remove("hidden");
  $("adminLoginCard").classList.add("hidden");
  updateLockIndicators();
}

function adminLogout() {
  adminLoggedIn = false;
  adminPasswordValue = "";
  $("adminPanel").classList.add("hidden");
  $("adminLoginCard").classList.remove("hidden");
  $("adminPassword").value = "";
  applyMatchLock();
}

async function runAdminAction(action, payload, successMessage) {
  if (!adminLoggedIn || !adminPasswordValue) {
    toast("운영진 로그인이 필요합니다.");
    return null;
  }

  try {
    const data = await apiPost(action, { adminPassword: adminPasswordValue, ...payload });
    toast(successMessage);
    await Promise.allSettled([refreshPublicConfig(false), loadNotices()]);
    return data;
  } catch (error) {
    toast(error.message || "변경 실패");
    return null;
  }
}

async function saveNotice() {
  const content = $("noticeBody").value.trim();
  if (!content) return toast("공지 내용을 입력해 주세요.");

  const data = await runAdminAction("addNotice", { content }, "공지 저장 완료");
  if (data) {
    $("noticeBody").value = "";
    renderNotices(data.notices || []);
  }
}

async function deleteNotice(noticeId) {
  const data = await runAdminAction("deleteNotice", { noticeId }, "공지 삭제 완료");
  if (data) renderNotices(data.notices || []);
}

async function changePassword(action, inputId, message) {
  const value = $(inputId).value.trim();
  if (!value) return toast("새 비밀번호를 입력해 주세요.");

  const data = await runAdminAction(action, { newPassword: value }, message);
  if (data) $(inputId).value = "";
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.onclick = () => showView(button.dataset.view);
});

$("gateSubmitBtn").onclick = submitGatePassword;
$("gatePassword").onkeydown = (event) => { if (event.key === "Enter") submitGatePassword(); };
$("gateAdminBtn").onclick = openWithAdminPassword;
$("gateRetryBtn").onclick = bootstrapAuth;

$("followSearch").oninput = renderFollowList;
$("refreshFollowBtn").onclick = () => loadRoomList(true);
$("reloadRoomBtn").onclick = () => loadRoomList(true);

$("matchUnlockBtn").onclick = unlockMatch;
$("matchPassword").onkeydown = (event) => { if (event.key === "Enter") unlockMatch(); };

$("zipFile").onchange = () => {
  $("fileName").textContent = $("zipFile").files[0]?.name || "인스타그램 ZIP 파일 선택";
};
$("analyzeBtn").onclick = analyze;
$("resetBtn").onclick = resetAnalysis;
$("searchInput").oninput = renderMatchList;
$("copyBtn").onclick = copyCurrent;
$("csvBtn").onclick = downloadCsv;
document.querySelectorAll(".tab").forEach((button) => {
  button.onclick = () => showTab(button.dataset.tab);
});

$("adminLoginBtn").onclick = adminLogin;
$("adminPassword").onkeydown = (event) => { if (event.key === "Enter") adminLogin(); };
$("adminLogoutBtn").onclick = adminLogout;
$("openSheetBtn").onclick = () => window.open(sheetUrl(), "_blank");
$("adminRefreshBtn").onclick = async () => {
  await Promise.allSettled([refreshPublicConfig(false), loadRoomList(true), loadNotices()]);
  toast("전체 새로고침 완료");
};

$("lockAppBtn").onclick = () => runAdminAction("setAppLock", { locked: true }, "앱을 잠갔습니다.");
$("unlockAppBtn").onclick = () => runAdminAction("setAppLock", { locked: false }, "앱 잠금을 해제했습니다.");
$("lockMatchBtn").onclick = () => runAdminAction("setMatchLock", { locked: true }, "맞팔확인을 잠갔습니다.");
$("unlockMatchBtn").onclick = () => runAdminAction("setMatchLock", { locked: false }, "맞팔확인 잠금을 해제했습니다.");

$("changeAccessPasswordBtn").onclick = () => changePassword("changeAccessPassword", "newAccessPassword", "접속 비밀번호를 변경했습니다.");
$("changeAppLockPasswordBtn").onclick = () => changePassword("changeAppLockPassword", "newAppLockPassword", "앱잠금 비밀번호를 변경했습니다.");
$("changeMatchPasswordBtn").onclick = () => changePassword("changeMatchPassword", "newMatchPassword", "맞팔확인 비밀번호를 변경했습니다.");

$("saveNoticeBtn").onclick = saveNotice;
$("closeNoticeBtn").onclick = () => $("noticeCard").classList.add("hidden");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

$("installBtn").onclick = async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  } else {
    toast("브라우저 메뉴에서 홈 화면에 추가를 눌러주세요.");
  }
};

window.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  await bootstrapAuth();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js?v=260").catch(() => {});
  }

  setInterval(async () => {
    if (!document.hidden && accessGranted) {
      try { await refreshPublicConfig(true); } catch (_) {}
    }
  }, 60000);
});
