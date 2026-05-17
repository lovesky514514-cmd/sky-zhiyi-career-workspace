const USE_DEEPSEEK_PROXY = true;
const API_BASE = "";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  page: "home",
  step: 0,
  captchaA: 0,
  captchaB: 0,
  currentUser: JSON.parse(localStorage.getItem("sky_zhiyi_user_v12") || "null"),
  workflow: JSON.parse(localStorage.getItem("sky_zhiyi_workflow_v15") || "{}"),
  parsed: null,
  memories: loadInitialMemories(),
  memoryTab: "all",
  memoryPage: 1,
  memoryPageSize: 4,
  jobs: [],
  matchedJobs: [],
  jobTotal: 0,
  jobPage: 1,
  pageSize: 6,
  lastJobKeyword: "",
  lastJobCity: "",
  jobSearchMode: "backend",
  jobTab: "recommend",
  jobStatus: JSON.parse(localStorage.getItem("sky_zhiyi_job_status_v12") || "{}"),
  questions: [],
  currentQuestions: [],
  currentQuestionIndex: 0,
  currentInterviewTarget: "",
  builderStep: 0,
  builderTemplate: "cn",
  builderDraft: JSON.parse(localStorage.getItem("sky_zhiyi_builder_draft_v14") || "null"),
  builderSourceJob: null,
  theme: localStorage.getItem("sky_zhiyi_theme_v25") || "light"
};

function loadInitialMemories() {
  try {
    const v12 = localStorage.getItem("sky_zhiyi_memories_v12");
    if (v12) return JSON.parse(v12);
    const v7 = localStorage.getItem("sky_zhiyi_memories_v7");
    if (v7) return JSON.parse(v7);
  } catch (e) {}
  return [];
}

function escapeHTML(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toast(title, desc = "") {
  const host = $("toastHost");
  if (!host) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.innerHTML = `<b>${escapeHTML(title)}</b>${desc ? `<small>${escapeHTML(desc)}</small>` : ""}`;
  host.appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateX(18px)";
    setTimeout(() => item.remove(), 240);
  }, 2600);
}

function applyTheme(theme, silent = true) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark-mode", state.theme === "dark");
  localStorage.setItem("sky_zhiyi_theme_v25", state.theme);
  const label = state.theme === "dark" ? "☀️ 浅色" : "🌙 深色";
  ["themeToggle", "landingThemeToggle"].forEach(id => {
    const btn = $(id);
    if (btn) btn.textContent = label;
  });
  if (!silent) toast(state.theme === "dark" ? "已切换深色模式" : "已切换浅色模式", "界面风格已保存到本地。自己刷新页面也会保留。")
}

function bindThemeToggle() {
  applyTheme(state.theme, true);
  ["themeToggle", "landingThemeToggle"].forEach(id => {
    $(id)?.addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark", false));
  });
}

async function postJSON(url, payload) {
  const resp = await fetch(API_BASE + url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload || {})
  });
  if (!resp.ok) throw new Error(await resp.text());
  return await resp.json();
}

async function uploadResumeFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(API_BASE + "/api/upload_resume", {
    method: "POST",
    body: formData
  });
  if (!resp.ok) throw new Error(await resp.text());
  return await resp.json();
}

async function parseWithDeepSeek(text) {
  if (!USE_DEEPSEEK_PROXY) return parseMaterial(text);
  return await postJSON("/api/parse", {text});
}
async function refineWithDeepSeek(parsed) {
  if (!USE_DEEPSEEK_PROXY) return refine(parsed);
  return await postJSON("/api/refine", {parsed});
}
async function interviewWithDeepSeek(target, memories) {
  if (!USE_DEEPSEEK_PROXY) return null;
  return await postJSON("/api/interview", {target, memories});
}
async function evaluateAnswerWithDeepSeek(question, answer, target) {
  if (!USE_DEEPSEEK_PROXY) return null;
  return await postJSON("/api/evaluate", {question, answer, target});
}

async function generateResumeBuilderDraft(payload) {
  try {
    return await postJSON("/api/resume-builder/generate", payload);
  } catch (e) {
    return localGenerateResumeDraft(payload);
  }
}
async function exportResumeBuilderDraft(payload) {
  const resp = await fetch(API_BASE + "/api/resume-builder/export", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload || {})
  });
  if (!resp.ok) throw new Error(await resp.text());
  return await resp.blob();
}

async function searchJobs(keyword, city, page = 1) {
  try {
    const result = await postJSON("/api/jobs", {
      keyword,
      city,
      page,
      page_size: state.pageSize
    });
    state.jobTotal = result.total || 0;
    state.jobPage = result.page || page;
    state.matchedJobs = result.rows || [];
    state.jobSearchMode = "backend";
    return result;
  } catch (e) {
    const resp = await fetch("data/jobs.json");
    const jobs = await resp.json();
    const scored = jobs
      .filter(j => !city || String(j.city || "").includes(city))
      .map(j => {
        const s = scoreJob(j, keyword, city);
        return {...j, score: s.score, reasons: s.reasons};
      })
      .filter(j => Number(j.score) >= (keyword || city ? 50 : 35))
      .sort((a, b) => b.score - a.score);
    state.jobTotal = scored.length;
    state.jobPage = page;
    state.matchedJobs = scored.slice((page - 1) * state.pageSize, page * state.pageSize);
    state.jobSearchMode = "browser_fallback";
    return {total: scored.length, page, page_size: state.pageSize, rows: state.matchedJobs};
  }
}

function setPageMeta(page) {
  const map = {
    home: ["Home", "求职工作台"],
    resume: ["Resume", "简历工作台"],
    builder: ["Builder", "智能简历生成"],
    jobs: ["Jobs", "岗位机会"],
    interview: ["Interview", "面试训练"],
    memory: ["Memory", "求职记忆库"],
    settings: ["Settings", "产品设置"]
  };
  const [crumb, title] = map[page] || map.home;
  if ($("crumbText")) $("crumbText").textContent = crumb;
  if ($("pageTitle")) $("pageTitle").textContent = title;
}


function enterWorkspace(page = "home") {
  document.body.classList.remove("landing-mode");
  document.body.classList.add("workspace-mode");
  showPage(page);
  updateHomeStats();
  showTutorialOnce();
}

function openRegisterModal() {
  const modal = $("registerModal");
  if (modal) modal.classList.add("show");
}

function closeRegisterModal() {
  const modal = $("registerModal");
  if (modal) modal.classList.remove("show");
}

function bindLanding() {
  $("landingStartBtn")?.addEventListener("click", () => {
    enterWorkspace("home");
    toast("已进入工作台", "先从简历导入开始也可以。")
  });
  $("landingTopStart")?.addEventListener("click", () => enterWorkspace("home"));
  $("landingClearAllBtn")?.addEventListener("click", resetDemoData);
  $("landingRegisterBtn")?.addEventListener("click", openRegisterModal);
  $("closeRegisterModal")?.addEventListener("click", closeRegisterModal);
  $("registerModal")?.addEventListener("click", (e) => { if (e.target.id === "registerModal") closeRegisterModal(); });
  $("modalRegisterBtn")?.addEventListener("click", () => {
    const username = $("landingUsername")?.value.trim() || "user";
    const nickname = $("landingNickname")?.value.trim() || username || "寻路人";
    const email = $("landingEmail")?.value.trim() || "";
    state.currentUser = {username, nickname, email, level:"normal"};
    localStorage.setItem("sky_zhiyi_user_v12", JSON.stringify(state.currentUser));
    setWorkflowMilestone("registered");
    closeRegisterModal();
    enterWorkspace("home");
    setTimeout(() => toast("注册成功", `${nickname}，已进入你的求职工作台。`), 260);
  });
}

function showPage(page) {
  if (!$("page-" + page)) page = "home";
  if (state.page !== page) {
    $("pageShade")?.classList.remove("active");
    void $("pageShade")?.offsetWidth;
    $("pageShade")?.classList.add("active");
  }
  state.page = page;
  $$(".page").forEach(p => p.classList.remove("active-page"));
  $("page-" + page).classList.add("active-page");
  $$(".nav-link").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  setPageMeta(page);
  window.scrollTo({top: 0, behavior: "smooth"});
  $("sideNav")?.classList.remove("show");
  if (page === "memory") renderMemories();
  if (page === "builder") renderBuilderPreview();
  if (page === "jobs") renderJobs(state.matchedJobs);
  if (page === "interview") renderCurrentQuestion();
  updateHomeStats();
}

function showTutorial() {
  const old = document.querySelector(".tutorial-overlay");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.innerHTML = `<div class="tutorial-dialog">
    <button class="modal-close" aria-label="关闭">×</button>
    <span class="landing-eyebrow">Quick Start</span>
    <span class="tutorial-kicker">QUICK START</span><h2>按这 5 步开始</h2>
    <div class="tutorial-steps">
      <div><b>1</b><span>上传简历或经历材料。</span></div>
      <div><b>2</b><span>运行解析，生成简历健康度。</span></div>
      <div><b>3</b><span>搜索岗位，查看推荐结果。</span></div>
      <div><b>4</b><span>点定制简历，生成草稿。</span></div>
      <div><b>5</b><span>完成一轮面试训练。</span></div>
    </div>
    <button class="primary-btn wide-btn">我知道了</button>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => {
    localStorage.setItem("sky_zhiyi_tutorial_seen_v15", "1");
    overlay.remove();
  };
  overlay.querySelector(".modal-close")?.addEventListener("click", close);
  overlay.querySelector(".primary-btn")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

function showTutorialOnce() {
  if (localStorage.getItem("sky_zhiyi_tutorial_seen_v15") === "1") return;
  setTimeout(showTutorial, 520);
}

function bindNavigation() {
  $$('[data-page]').forEach(el => {
    el.addEventListener("click", () => showPage(el.dataset.page));
  });
  $("menuBtn")?.addEventListener("click", () => $("sideNav")?.classList.add("show"));
  $("closeSidebar")?.addEventListener("click", () => $("sideNav")?.classList.remove("show"));
  $("tutorialBtn")?.addEventListener("click", showTutorial);
  $("restartWorkflowBtn")?.addEventListener("click", () => setStep(0));
  $("resetDemoBtn")?.addEventListener("click", resetDemoData);
  $("quickToastBtn")?.addEventListener("click", () => toast("通知", "当前为 SKY职忆求职工作台。"));
  $("refreshTodayBtn")?.addEventListener("click", () => {
    toast("今日行动已刷新", "建议优先完成简历诊断和一轮面试训练。")
  });
  $("globalSearch")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    if (!q) return;
    if (q.includes("岗位") || q.includes("工作") || q.includes("产品") || q.includes("数据")) {
      showPage("jobs");
      $("jobKeyword").value = q;
      $("matchJobsBtn").click();
    } else if (q.includes("面试") || q.includes("问题")) {
      showPage("interview");
      $("interviewJob").value = q.replace("面试", "");
    } else {
      showPage("memory");
      toast("已进入记忆库", "可以按类别分页查看求职资产。")
    }
  });
}

function saveMemories() {
  localStorage.setItem("sky_zhiyi_memories_v12", JSON.stringify(state.memories));
  renderMemories();
  updateHomeStats();
}

function saveJobStatus() {
  localStorage.setItem("sky_zhiyi_job_status_v12", JSON.stringify(state.jobStatus));
}

function isRegisteredUser() {
  const u = state.currentUser;
  return !!(u && u.username && u.username !== "guest");
}

function calculateWorkflowProgress() {
  const steps = [
    state.workflow.registered || isRegisteredUser(),
    state.workflow.imported,
    state.workflow.diagnosed,
    state.workflow.matched,
    state.workflow.trained
  ];
  return steps.filter(Boolean).length * 20;
}

function saveWorkflow() {
  localStorage.setItem("sky_zhiyi_workflow_v15", JSON.stringify(state.workflow));
}

function showCompletionPopup() {
  if (localStorage.getItem("sky_zhiyi_workflow_complete_v15") === "1") return;
  localStorage.setItem("sky_zhiyi_workflow_complete_v15", "1");
  const modal = document.createElement("div");
  modal.className = "complete-flow-modal";
  modal.innerHTML = `<div class="complete-flow-dialog">
    <button class="modal-close" aria-label="关闭">×</button>
    <div class="success-dot big-success">✓</div>
    <h2>恭喜您！您已完成全部流程！</h2>
    <p>从注册、导入、诊断、岗位匹配到面试训练，你已经完成了 SKY职忆的一轮完整求职准备闭环。</p>
    <button class="primary-btn">继续查看工作台</button>
  </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector(".modal-close")?.addEventListener("click", close);
  modal.querySelector(".primary-btn")?.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
}

function setWorkflowMilestone(key) {
  if (!key) return;
  if (!state.workflow[key]) {
    state.workflow[key] = true;
    saveWorkflow();
    updateHomeStats();
    if (calculateWorkflowProgress() >= 100) showCompletionPopup();
  } else {
    updateHomeStats();
  }
}

function calculateResumeHealth() {
  if (!state.parsed) return null;
  const skills = Array.isArray(state.parsed.skills) ? state.parsed.skills.length : 0;
  const experiences = Array.isArray(state.parsed.experiences) ? state.parsed.experiences.length : 0;
  const missing = Array.isArray(state.parsed.missing_fields) ? state.parsed.missing_fields.length : 0;
  let score = 58 + Math.min(skills * 3, 18) + Math.min(experiences * 7, 18) - Math.min(missing * 3, 12);
  if (state.memories.length) score += Math.min(state.memories.length * 2, 6);
  if (state.builderDraft) score += 4;
  return Math.max(45, Math.min(96, Math.round(score)));
}

function updateHomeStats() {
  const memoryCount = state.memories.length;
  const jobCount = state.jobTotal || state.matchedJobs.length || 0;
  const workflowScore = calculateWorkflowProgress();
  const resumeHealth = calculateResumeHealth();
  const user = state.currentUser || null;
  const displayName = user ? (user.nickname || user.username || "寻路人") : "寻路人";

  const workflowText = workflowScore > 0 ? workflowScore + "%" : "还未开始准备";
  const healthText = resumeHealth === null ? "待评估" : resumeHealth + "%";

  if ($("homeUserName")) $("homeUserName").textContent = `Hi，${displayName}`;
  if ($("homeUserHint")) $("homeUserHint").textContent = user ? "继续把经历整理成更清楚的求职资产。" : "先完成一个小步骤，今天的求职准备就会更清楚。";
  if ($("homeMemoryCount")) $("homeMemoryCount").textContent = memoryCount;
  if ($("homeJobCount")) $("homeJobCount").textContent = jobCount;

  if ($("landingReadinessScore")) $("landingReadinessScore").textContent = workflowText;
  if ($("sidebarWorkflowText")) $("sidebarWorkflowText").textContent = workflowText;

  if ($("readinessScore")) $("readinessScore").textContent = healthText;
  if ($("homeReadinessBar")) $("homeReadinessBar").style.width = (resumeHealth || 0) + "%";
  if ($("settingsResumeHealth")) $("settingsResumeHealth").textContent = healthText;
  if ($("settingsHealthBar")) $("settingsHealthBar").style.width = (resumeHealth || 0) + "%";

  if ($("settingsResumeText")) {
    $("settingsResumeText").textContent = resumeHealth === null
      ? "上传并完成诊断后，这里会显示真实的简历健康度。"
      : (resumeHealth >= 80 ? "简历状态较完整，可以继续做岗位匹配和面试训练。" : "建议先补充项目量化结果、本人职责和目标岗位关键词。");
  }
  if ($("settingsUserName")) $("settingsUserName").textContent = `Hi，${displayName}`;
  if ($("settingsUserHint")) $("settingsUserHint").textContent = "可以修改工作台里显示的称呼。";
  if ($("settingsNameInput")) $("settingsNameInput").value = displayName === "寻路人" ? "" : displayName;
  if ($("jobBar")) $("jobBar").style.width = Math.min(100, Math.max(20, jobCount * 5)) + "%";
}

function setCaptcha() {
  state.captchaA = Math.floor(Math.random() * 9) + 1;
  state.captchaB = Math.floor(Math.random() * 9) + 1;
  if ($("captchaText")) $("captchaText").textContent = `人机验证：${state.captchaA} + ${state.captchaB} = ?`;
}

function setStep(step) {
  state.step = Math.max(0, Math.min(3, step));
  $$(".flow-step").forEach(p => p.classList.toggle("active-step", Number(p.dataset.stepPanel) === state.step));
  $$(".process-step").forEach(dot => {
    const s = Number(dot.dataset.step);
    dot.classList.toggle("active", s === state.step);
    dot.classList.toggle("done", s < state.step);
  });
  window.scrollTo({top: 0, behavior: "smooth"});
}

function resetFlow() {
  state.step = 0;
  state.parsed = null;
  if ($("resumeInput")) $("resumeInput").value = "";
  if ($("parseResult")) $("parseResult").textContent = "尚未生成。";
  if ($("refineResult")) $("refineResult").textContent = "等待精炼...";
  if ($("materialPreview")) $("materialPreview").textContent = "等待材料...";
  if ($("parseVisual")) $("parseVisual").innerHTML = '<div class="empty-state">点击运行后展示解析卡片。</div>';
  if ($("refineVisual")) $("refineVisual").innerHTML = '<div class="empty-state">点击后生成资产卡片。</div>';
  setStep(0);
  toast("流程已重置", "可以重新导入材料。")
}

function clearSkyZhiYiStorage() {
  const shouldClear = (key) => {
    const k = String(key || "").toLowerCase();
    return k.startsWith("sky_zhiyi") || k.startsWith("sky-zhiyi");
  };
  [localStorage, sessionStorage].forEach(store => {
    Object.keys(store).forEach(key => {
      if (shouldClear(key)) store.removeItem(key);
    });
  });
}

function resetDemoData() {
  const ok = window.confirm("确定要一键清空本地演示数据吗？\n这会清空主页面流程进度、注册状态、记忆库缓存、岗位状态、教学状态和简历生成草稿；后端文件不会被改动。");
  if (!ok) return;

  clearSkyZhiYiStorage();

  state.currentUser = null;
  state.workflow = {};
  state.parsed = null;
  state.memories = [];
  state.memoryTab = "all";
  state.memoryPage = 1;
  state.jobStatus = {};
  state.builderDraft = null;
  state.builderSourceJob = null;
  state.matchedJobs = [];
  state.jobTotal = 0;
  state.jobPage = 1;
  state.jobTab = "recommend";
  state.builderStep = 0;
  state.step = 0;

  updateHomeStats();
  toast("已一键清空", "主页面会回到“还未开始准备”。");
  setTimeout(() => window.location.reload(), 650);
}

function bindResumeFlow() {
  setCaptcha();
  $("refreshCaptcha")?.addEventListener("click", setCaptcha);
  $$(".process-step").forEach(dot => dot.addEventListener("click", () => setStep(Number(dot.dataset.step))));
  $$('[data-prev]').forEach(btn => btn.addEventListener("click", () => setStep(state.step - 1)));
  $("resetFlowBtn")?.addEventListener("click", resetFlow);

  $("registerBtn")?.addEventListener("click", () => {
    const username = $("username").value.trim();
    const nickname = $("nickname").value.trim();
    const captcha = $("captchaInput").value.trim();
    if (!username || !nickname) {
      $("authMessage").textContent = "请至少填写用户名和昵称。";
      toast("资料不完整", "请填写用户名和昵称。")
      return;
    }
    if (Number(captcha) !== state.captchaA + state.captchaB) {
      $("authMessage").textContent = "验证码不正确，请重试。";
      toast("验证码不正确", "请重新输入计算结果。")
      return;
    }
    state.currentUser = {username, nickname, email: $("email").value.trim()};
    localStorage.setItem("sky_zhiyi_user_v12", JSON.stringify(state.currentUser));
    setWorkflowMilestone("registered");
    $("authMessage").textContent = `欢迎 ${nickname}，档案已建立。`;
    toast("注册成功", "已进入材料导入环节。")
    setStep(1);
  });

  $$(".choice-card").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".choice-card").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      $("resumeInput").placeholder = mode === "hasResume"
        ? "粘贴你的简历、项目经历、实习经历、竞赛经历..."
        : "请用自然语言回答：专业、年级、目标岗位、课程/项目/竞赛/实习、会哪些工具技能？";
    });
  });

  $("sampleBtn")?.addEventListener("click", () => {
    $("resumeInput").value = "我是某高校本科生，大三。做过AI求职与长期记忆相关项目，负责官网展示、系统原型、人格画像问卷、记忆精炼模块设计和项目路演包装。项目使用HTML/CSS/JavaScript、Python、Flask，并尝试接入DeepSeek API。参加过创新创业比赛和项目申报，擅长PPT、项目书、科研写作、数据分析，也有政府部门实习经历。目标方向还不完全确定，希望系统根据材料推荐适合的岗位。";
    toast("示例材料已填入", "可直接进入解析。")
  });

  const uploadZone = $("uploadZone");
  if (uploadZone) {
    ["dragenter", "dragover"].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(evt => uploadZone.addEventListener(evt, e => { e.preventDefault(); uploadZone.classList.remove("drag"); }));
    uploadZone.addEventListener("drop", e => {
      const file = e.dataTransfer.files?.[0];
      if (file) handleResumeFile(file);
    });
  }
  $("resumeFile")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) handleResumeFile(file);
  });

  $("toParseBtn")?.addEventListener("click", () => {
    const text = $("resumeInput").value.trim();
    if (!text) {
      toast("请先导入材料", "上传文件或粘贴经历文本。")
      return;
    }
    $("materialPreview").textContent = text;
    setWorkflowMilestone("imported");
    renderParseVisualSkeleton();
    setStep(1);
  });

  $("parseBtn")?.addEventListener("click", runParse);
  $("toRefineBtn")?.addEventListener("click", () => {
    if (!state.parsed) {
      toast("还没有解析结果", "请先点击“运行解析”。")
      return;
    }
    setStep(2);
  });
  $("refineBtn")?.addEventListener("click", runRefine);
  $("finishFlowBtn")?.addEventListener("click", () => {
    if (!state.memories.length) {
      toast("记忆库为空", "请先精炼并写入至少一条求职资产。")
      return;
    }
    setStep(3);
    updateHomeStats();
  });
}

async function handleResumeFile(file) {
  if (!file) return;
  $("fileStatus").textContent = `正在读取：${file.name}（${Math.round(file.size / 1024)} KB）...`;
  try {
    const result = await uploadResumeFile(file);
    $("resumeInput").value = result.text || "";
    $("fileStatus").textContent = `已读取文件：${result.filename || file.name}`;
    setWorkflowMilestone("imported");
    toast("文件读取完成", "可以进入解析环节。")
  } catch (err) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      const text = await file.text();
      $("resumeInput").value = text;
      $("fileStatus").textContent = `后端未连接，已在浏览器中读取文本文件：${file.name}`;
      setWorkflowMilestone("imported");
      toast("已本地读取文本", "建议启动后端获得完整解析。")
    } else {
      $("fileStatus").textContent = `文件已选择，但后端读取失败。请启动后端或复制正文粘贴。`;
      toast("文件读取失败", "请确认 Flask 后端已启动。")
    }
  }
}

function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}
function parseMaterial(text) {
  const skills = ["Python","Streamlit","Flask","HTML","CSS","JavaScript","DeepSeek","RAG","Agent","PPT","项目书","科研写作","数据分析","COMSOL","Origin","GitHub","用户调研","市场调研","财务分析","风险评估"];
  const found = skills.filter(k => text.toLowerCase().includes(k.toLowerCase()));
  const exp = [];
  if (text.includes("项目") || text.toLowerCase().includes("sky")) exp.push({type:"项目经历", title:"AI求职/长期记忆相关项目", summary:"围绕AI应用、长期记忆、用户画像和项目展示完成原型设计与材料包装。"});
  if (text.includes("实习")) exp.push({type:"实习经历", title:"实习经历", summary:"具备真实组织环境下的实践经历，可用于体现责任心、沟通和执行能力。"});
  if (text.includes("比赛") || text.includes("挑战杯") || text.includes("竞赛")) exp.push({type:"竞赛经历", title:"创新创业/学科竞赛经历", summary:"具备项目申报、路演表达、成果展示和团队协作经验。"});
  if (!exp.length) exp.push({type:"原始经历", title:"用户导入材料", summary:text.slice(0,120)});
  const targets = [];
  ["产品助理","数据分析实习生","科研助理","AIGC运营实习生","材料研发助理","Java开发工程师","前端开发工程师"].forEach(t => {
    if (text.includes(t.slice(0,2)) || text.includes(t)) targets.push(t);
  });
  return {
    education: text.includes("大学") ? "本科在读 / 高校学生" : "待补充",
    target_jobs: targets.length ? targets : ["待探索岗位方向"],
    skills: unique(found),
    experiences: exp,
    missing_fields: ["量化成果","目标岗位优先级","每段经历中的本人职责"],
    agent_source: "local_rule_engine"
  };
}
function refine(parsed) {
  const tags = unique([...(parsed.skills || []), "跨学科能力", "项目表达", "快速学习"]);
  return {
    memory_type:"career_asset",
    title:"个人求职经历资产",
    refined_summary:`已识别 ${parsed.experiences.length} 类经历，可面向 ${parsed.target_jobs.join("、")} 等岗位复用。核心优势包括：${tags.slice(0,6).join("、")}。`,
    ability_tags:tags.slice(0,10),
    job_relevance:parsed.target_jobs,
    importance_score:86,
    resume_value:"high",
    suggested_layer:"long_term",
    agent_source:"local_rule_engine",
    saved_at:new Date().toLocaleString()
  };
}
function renderJSON(obj) { return JSON.stringify(obj, null, 2); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function setLoading(id, isLoading) { $(id)?.classList.toggle("hidden", !isLoading); }
function renderParseVisualSkeleton() {
  if ($("parseVisual")) $("parseVisual").innerHTML = `<div class="visual-block"><h4>等待解析</h4><div class="keyword-cloud"><span class="keyword-chip">技能标签</span><span class="keyword-chip">经历类型</span><span class="keyword-chip">目标岗位</span><span class="keyword-chip">缺失字段</span></div></div>`;
}
async function renderParseVisual(parsed) {
  const box = $("parseVisual");
  if (!box) return;
  box.innerHTML = "";
  box.scrollTop = 0;
  const blocks = [
    {title:"目标岗位", chips:parsed.target_jobs || []},
    {title:"技能关键词", chips:parsed.skills || []},
    {title:"待补充字段", chips:parsed.missing_fields || []}
  ];
  for (const b of blocks) {
    const div = document.createElement("div");
    div.className = "visual-block";
    div.innerHTML = `<h4>${escapeHTML(b.title)}</h4><div class="keyword-cloud"></div>`;
    box.appendChild(div);
    const cloud = div.querySelector(".keyword-cloud");
    const chips = b.chips && b.chips.length ? b.chips : ["待补充"];
    for (const c of chips.slice(0,12)) {
      await sleep(70);
      const span = document.createElement("span");
      span.className = "keyword-chip";
      span.textContent = c;
      cloud.appendChild(span);
    }
  }
  const exp = document.createElement("div");
  exp.className = "visual-block";
  exp.innerHTML = `<h4>经历卡片</h4><div class="experience-list"></div>`;
  box.appendChild(exp);
  const list = exp.querySelector(".experience-list");
  for (const e of (parsed.experiences || []).slice(0,5)) {
    await sleep(90);
    const card = document.createElement("div");
    card.className = "experience-card";
    card.innerHTML = `<b>${escapeHTML(e.type || "经历")}｜${escapeHTML(e.title || "未命名经历")}</b><p>${escapeHTML(e.summary || "")}</p>`;
    list.appendChild(card);
  }
}
function normalizeMemoryList(result, parsed) {
  const baseList = Array.isArray(result)
    ? result
    : Array.isArray(result?.memories)
      ? result.memories
      : result
        ? [result]
        : [];

  const now = new Date().toLocaleString();
  let skills = unique([...(parsed?.skills || []), ...baseList.flatMap(m => m?.ability_tags || [])]);
  if (!skills.length) skills = ["快速学习", "沟通表达", "项目执行"];
  const targets = unique([...(parsed?.target_jobs || []), ...baseList.flatMap(m => m?.job_relevance || [])]);
  const experiences = Array.isArray(parsed?.experiences) ? parsed.experiences : [];

  const normalized = baseList.map((m, index) => ({
    memory_type: m.memory_type || "career_asset",
    category: m.category || (index === 0 ? "project" : undefined),
    title: m.title || "求职经历资产",
    refined_summary: m.refined_summary || "已整理为可复用的求职记忆。",
    ability_tags: unique(m.ability_tags || skills).slice(0, 12),
    job_relevance: unique(m.job_relevance || targets).slice(0, 8),
    importance_score: Number(m.importance_score || 82),
    resume_value: m.resume_value || "high",
    suggested_layer: m.suggested_layer || "long_term",
    agent_source: m.agent_source || "frontend_normalized",
    saved_at: m.saved_at || now
  }));

  const hasSkillCard = normalized.some(m => memoryCategory(m) === "skill");
  if (!hasSkillCard && skills.length) {
    normalized.push({
      memory_type: "skill_ability",
      category: "skill",
      title: "技能能力资产",
      refined_summary: `已沉淀 ${skills.length} 项技能能力，可用于简历技能栏、岗位匹配和面试表达。建议优先突出：${skills.slice(0, 6).join("、")}。`,
      ability_tags: skills.slice(0, 12),
      job_relevance: targets.slice(0, 8),
      importance_score: Math.min(95, 70 + skills.length * 2),
      resume_value: "high",
      suggested_layer: "long_term",
      agent_source: "frontend_skill_card",
      saved_at: now
    });
  }

  const existingTitles = new Set(normalized.map(m => m.title));
  experiences.slice(0, 3).forEach((exp, idx) => {
    const title = `${exp.type || "经历"}｜${exp.title || `经历资产${idx + 1}`}`;
    if (existingTitles.has(title)) return;
    normalized.push({
      memory_type: "experience_asset",
      category: "project",
      title,
      refined_summary: exp.summary || "该经历可继续补充本人职责、过程动作和量化结果。",
      ability_tags: skills.slice(0, 8),
      job_relevance: targets.slice(0, 6),
      importance_score: 78,
      resume_value: "medium",
      suggested_layer: idx === 0 ? "long_term" : "transition_memory",
      agent_source: "frontend_experience_card",
      saved_at: now
    });
  });

  return normalized;
}

async function renderRefineVisual(memories) {
  const box = $("refineVisual");
  if (!box) return;
  const list = Array.isArray(memories) ? memories : [memories].filter(Boolean);
  box.innerHTML = "";
  box.scrollTop = 0;
  if (!list.length) {
    box.innerHTML = '<div class="empty-state">暂无精炼结果。</div>';
    return;
  }
  for (const memory of list) {
    const div = document.createElement("div");
    div.className = "visual-block refine-card-block";
    div.innerHTML = `<h4>${escapeHTML(memory.title || "求职记忆资产")}</h4><p class="memory-summary">${escapeHTML(memory.refined_summary || "")}</p><div class="memory-meta">${memoryCategory(memory) === "skill" ? "技能能力" : "经历资产"}｜重要度 ${escapeHTML(memory.importance_score || "--")}｜${escapeHTML(memory.suggested_layer || "long_term")}</div><div class="keyword-cloud"></div>`;
    box.appendChild(div);
    const cloud = div.querySelector(".keyword-cloud");
    for (const t of (memory.ability_tags || []).slice(0, 12)) {
      await sleep(35);
      const span = document.createElement("span");
      span.className = "keyword-chip";
      span.textContent = t;
      cloud.appendChild(span);
    }
  }
}

async function runParse() {
  const text = $("resumeInput").value.trim();
  if (!text) {
    toast("请先导入材料", "上传或粘贴内容后再解析。")
    return;
  }
  setLoading("parseLoading", true);
  $("parseVisual").innerHTML = "";
  $("parseResult").textContent = "正在解析...";
  try {
    state.parsed = await parseWithDeepSeek(text);
    toast("解析完成", "已生成目标岗位、经历与缺失字段。")
  } catch (e) {
    state.parsed = parseMaterial(text);
    state.parsed.agent_source = "local_rule_engine_after_api_error";
    toast("后端不可用，已使用本地解析", "启动后端后可获得 DeepSeek 解析结果。")
  }
  setLoading("parseLoading", false);
  $("parseResult").textContent = renderJSON(state.parsed);
  await renderParseVisual(state.parsed);
  setWorkflowMilestone("diagnosed");
  updateHomeStats();
}
async function runRefine() {
  if (!state.parsed) {
    toast("请先运行解析", "解析后才能精炼成求职资产。")
    return;
  }
  setLoading("refineLoading", true);
  $("refineVisual").innerHTML = "";
  $("refineResult").textContent = "正在精炼...";
  let m;
  try {
    m = await refineWithDeepSeek(state.parsed);
    toast("精炼完成", "已写入求职记忆库。")
  } catch (e) {
    m = refine(state.parsed);
    m.agent_source = "local_rule_engine_after_api_error";
    toast("后端不可用，已本地精炼", "记忆已保存到浏览器。")
  }
  const cards = normalizeMemoryList(m, state.parsed);
  state.memories.unshift(...cards);
  saveMemories();
  setLoading("refineLoading", false);
  $("refineResult").textContent = renderJSON({written_count: cards.length, memories: cards});
  await renderRefineVisual(cards);
}

function formatMemoryTag(tag) {
  return String(tag || "").trim().replace(/\s+/g, " ");
}
function memoryCategory(m) {
  const explicit = String(m?.category || "").toLowerCase();
  if (["project", "skill", "interview"].includes(explicit)) return explicit;
  const txt = `${m.memory_type || ""} ${m.title || ""} ${(m.ability_tags || []).join(" ")} ${m.refined_summary || ""}`;
  const lower = txt.toLowerCase();
  if (txt.includes("面试") || lower.includes("feedback") || lower.includes("interview")) return "interview";
  if (txt.includes("技能") || txt.includes("能力") || lower.includes("skill") || lower.includes("ability")) return "skill";
  if (txt.includes("项目") || txt.includes("实习") || txt.includes("竞赛") || lower.includes("experience")) return "project";
  return "project";
}
function getFilteredMemories() {
  if (state.memoryTab === "all") return state.memories;
  return state.memories.filter(m => memoryCategory(m) === state.memoryTab);
}
function renderMemories() {
  const box = $("memoryList");
  if (!box) return;
  const list = getFilteredMemories();
  const totalPages = Math.max(1, Math.ceil(list.length / state.memoryPageSize));
  state.memoryPage = Math.min(Math.max(1, state.memoryPage), totalPages);
  if (!list.length) {
    box.innerHTML = '<div class="empty-card">暂无该类别记忆，请先完成材料导入或面试回写。</div>';
  } else {
    const start = (state.memoryPage - 1) * state.memoryPageSize;
    const pageItems = list.slice(start, start + state.memoryPageSize);
    box.innerHTML = pageItems.map((m, i) => {
      const tags = (m.ability_tags || []).map(formatMemoryTag).filter(Boolean).slice(0, 8);
      return `<article class="memory-card">
        <div class="memory-meta">${escapeHTML(m.suggested_layer || "memory")}｜重要度 ${escapeHTML(m.importance_score || "--")}</div>
        <h3>${escapeHTML(m.title || "求职记忆")}</h3>
        <div class="memory-summary">${escapeHTML(m.refined_summary || "")}</div>
        <div class="memory-tag-wrap">${tags.map(t => `<span class="memory-tag">${escapeHTML(t)}</span>`).join("")}</div>
        <div class="memory-footer"><span>${escapeHTML(m.saved_at || "未记录时间")}</span><span>#${start + i + 1}</span></div>
      </article>`;
    }).join("");
  }
  if ($("memoryPageText")) $("memoryPageText").textContent = `第 ${state.memoryPage} / ${totalPages} 页`;
  if ($("prevMemoryPage")) $("prevMemoryPage").disabled = state.memoryPage <= 1;
  if ($("nextMemoryPage")) $("nextMemoryPage").disabled = state.memoryPage >= totalPages;
  updateHomeStats();
}
function bindMemory() {
  $$(".memory-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      state.memoryTab = btn.dataset.memoryTab;
      state.memoryPage = 1;
      $$(".memory-tabs button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      renderMemories();
    });
  });
  $("memoryPageSize")?.addEventListener("change", e => {
    state.memoryPageSize = Number(e.target.value || 4);
    state.memoryPage = 1;
    renderMemories();
  });
  $("prevMemoryPage")?.addEventListener("click", () => { state.memoryPage--; renderMemories(); });
  $("nextMemoryPage")?.addEventListener("click", () => { state.memoryPage++; renderMemories(); });
  $("clearMemoryBtn")?.addEventListener("click", () => {
    if (!confirm("确定清空本地求职记忆吗？")) return;
    state.memories = [];
    saveMemories();
    toast("记忆库已清空");
  });
  $("exportMemoryBtn")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.memories, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sky_zhiyi_memory.json";
    a.click();
    toast("导出完成", "已生成 sky_zhiyi_memory.json。")
  });
}

function tokenizeQuery(q) {
  const raw = q || "";
  const base = raw.toLowerCase().replace(/[，,\/|;；、]/g, " ").split(/\s+/).filter(Boolean);
  let extra = [];
  if (raw.includes("AI产品")) extra.push("ai","产品","产品助理");
  if (raw.includes("数据")) extra.push("数据","分析","数据分析");
  if (raw.includes("材料")) extra.push("材料","研发");
  if (raw.includes("科研")) extra.push("科研","助理");
  if (raw.includes("运营")) extra.push("运营","用户");
  return unique(base.concat(extra));
}
function scoreJob(job, kw, city) {
  let score = 22;
  const text = Object.values(job).join(" ").toLowerCase();
  const jobName = (job.job || "").toLowerCase();
  const industry = (job.industry || "").toLowerCase();
  const company = (job.company || "").toLowerCase();
  const tokens = tokenizeQuery(kw);
  let reasons = [];
  if (!tokens.length && !city) score += 18;
  tokens.forEach(t => {
    if (!t) return;
    if (jobName.includes(t)) { score += 26; reasons.push(`岗位相关：${t}`); }
    else if (industry.includes(t)) { score += 14; reasons.push(`行业相关：${t}`); }
    else if (company.includes(t)) { score += 10; reasons.push(`单位相关：${t}`); }
    else if (text.includes(t)) { score += 7; reasons.push(`信息相关：${t}`); }
  });
  if (jobName.includes("产品") || industry.includes("产品")) score += 8;
  if (jobName.includes("数据") || jobName.includes("分析")) score += 8;
  if (jobName.includes("材料") || jobName.includes("研发")) score += 8;
  if (jobName.includes("实习") || String(job.type || "").includes("实习")) score += 4;
  if (city) {
    if (String(job.city || "").includes(city)) { score += 18; reasons.push(`城市匹配：${city}`); }
    else score -= 30;
  }
  if (String(job.exam || "").includes("否")) { score += 4; reasons.push("免笔试"); }
  if (!tokens.length) reasons.push(city ? "城市通用推荐" : "方向待定，先看通用机会");
  if (!reasons.length) reasons.push("可作为备选");
  return {score: Math.min(Math.max(score, 0), 98), reasons: unique(reasons).slice(0,3).join(" / ")};
}
function jobKey(job) {
  return `${job.company || ""}__${job.job || ""}__${job.city || ""}`;
}
function compactJobText(text, len = 60) {
  const out = String(text || "岗位信息待补充").replace(/\s+/g, " ").trim();
  return out.length > len ? out.slice(0, len) + "..." : out;
}
function cityMetaHTML(city) {
  const raw = String(city || "地点待补充").trim();
  if (!raw || raw === "地点待补充") return `<span>地点待补充</span>`;
  const shouldFold = raw.length > 10 || /[、,，及]/.test(raw);
  if (!shouldFold) return `<span>${escapeHTML(raw)}</span>`;
  return `<span class="city-meta"><details><summary>查看城市</summary><em>${escapeHTML(raw)}</em></details></span>`;
}
function renderJobPageNumbers(totalPages) {
  const box = $("jobPageNumbers");
  if (!box) return;
  const current = Number(state.jobPage || 1);
  const maxVisible = 5;
  let start = Math.max(1, current - 2);
  let end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  const parts = [];
  if (start > 1) parts.push(`<button class="page-num" data-page="1">1页</button>${start > 2 ? `<span class="page-ellipsis">…</span>` : ""}`);
  for (let p = start; p <= end; p++) {
    parts.push(`<button class="page-num ${p === current ? "active" : ""}" data-page="${p}">${p}页</button>`);
  }
  if (end < totalPages) parts.push(`${end < totalPages - 1 ? `<span class="page-ellipsis">…</span>` : ""}<button class="page-num" data-page="${totalPages}">${totalPages}页</button>`);
  box.innerHTML = parts.join("");
}
function applyJobSortAndFilter(list) {
  let out = [...(list || [])];
  const filter = state.jobTab || "recommend";
  if (filter !== "recommend") out = out.filter(j => state.jobStatus[jobKey(j)] === filter);
  const sort = $("jobSort")?.value || "score";
  out.sort((a,b) => {
    if (sort === "company") return String(a.company || "").localeCompare(String(b.company || ""), "zh");
    if (sort === "city") return String(a.city || "").localeCompare(String(b.city || ""), "zh");
    return Number(b.score || 0) - Number(a.score || 0);
  });
  return out;
}
function renderJobs(list) {
  const box = $("jobCardList");
  if (!box) return;
  const viewList = applyJobSortAndFilter(list);
  if (!viewList || !viewList.length) {
    box.innerHTML = '<div class="empty-card">当前状态下没有岗位。可以切回“推荐中”，或重新生成匹配。</div>';
  } else {
    box.innerHTML = viewList.map((j, idx) => {
      const key = jobKey(j);
      const status = state.jobStatus[key] || "recommend";
      const score = Number(j.score || 0);
      const level = score >= 80 ? "高匹配" : score >= 65 ? "较匹配" : "可尝试";
      const reasons = String(j.reasons || "推荐岗位").split("/").map(x => x.trim()).filter(Boolean).slice(0,3);
      const link = j.link ? `<a href="${escapeHTML(j.link)}" target="_blank">投递链接</a>` : "";
      return `<article class="job-card ${escapeHTML(status)}">
        <div class="job-top">
          <div><div class="job-company">${escapeHTML(j.company || "招聘单位")}</div><div class="job-name">${escapeHTML(compactJobText(j.job, 80))}</div></div>
          <div class="job-score"><b>${score}</b><span>${level}</span></div>
        </div>
        <div class="job-meta">${cityMetaHTML(j.city)}<span>${escapeHTML(j.type || "招聘类型")}</span><span>${escapeHTML(j.exam ? (String(j.exam).includes("否") ? "免笔试" : "含笔试") : "笔试待定")}</span><span>${escapeHTML(j.deadline || "截止日期待定")}</span></div>
        <div class="job-chip-row">${reasons.map(r => `<span class="job-chip">${escapeHTML(r)}</span>`).join("")}</div>
        <div class="job-actions">
          <button class="${status === "saved" ? "active" : ""}" onclick="setJobStatus(${idx}, 'saved')">收藏</button>
          <button class="${status === "applying" ? "active" : ""}" onclick="setJobStatus(${idx}, 'applying')">准备投递</button>
          <button onclick="openBuilderFromJob(${idx})">定制简历</button>
          ${link}
        </div>
      </article>`;
    }).join("");
  }
  const start = state.jobTotal ? ((state.jobPage - 1) * state.pageSize + 1) : 0;
  const end = state.jobTotal ? Math.min(state.jobPage * state.pageSize, state.jobTotal) : 0;
  const totalPages = Math.max(1, Math.ceil((state.jobTotal || 0) / state.pageSize));
  if ($("jobResultInfo")) $("jobResultInfo").textContent = state.jobTotal ? `${state.jobSearchMode === "backend" ? "本地岗位库" : "浏览器本地"}：共 ${state.jobTotal} 条，当前第 ${state.jobPage} 页 / 共 ${totalPages} 页` : "可以输入岗位关键词，也可以留空直接生成通用推荐。";
  renderJobPageNumbers(totalPages);
  if ($("prevJobPage")) $("prevJobPage").disabled = state.jobPage <= 1;
  if ($("nextJobPage")) $("nextJobPage").disabled = state.jobPage >= totalPages;
  updateHomeStats();
}
window.setJobStatus = function(localIndex, status) {
  const viewList = applyJobSortAndFilter(state.matchedJobs);
  const j = viewList[localIndex];
  if (!j) return;
  const key = jobKey(j);
  state.jobStatus[key] = state.jobStatus[key] === status ? "recommend" : status;
  saveJobStatus();
  renderJobs(state.matchedJobs);
  toast(status === "saved" ? "岗位已收藏" : "岗位已加入投递准备", j.company || "已更新岗位状态");
};
async function runJobSearch(page = 1) {
  const kw = $("jobKeyword").value.trim();
  const city = $("cityKeyword").value.trim();
  state.lastJobKeyword = kw;
  state.lastJobCity = city;
  state.jobPage = page;
  const emptyGuide = !kw && !city;
  if ($("jobResultInfo")) $("jobResultInfo").textContent = emptyGuide ? "未填写关键词，正在为你生成通用岗位推荐..." : "正在检索岗位...";
  $("jobCardList").innerHTML = `<div class="skeleton-area"><div></div><div></div><div></div></div>`;
  try {
    const result = await searchJobs(kw, city, page);
    renderJobs(result.rows || []);
    setWorkflowMilestone("matched");
    toast(emptyGuide ? "已生成通用推荐" : "岗位匹配完成", `已切换到第 ${state.jobPage} 页。`);
  } catch (e) {
    if ($("jobResultInfo")) $("jobResultInfo").textContent = "岗位检索失败：请确认后端已启动。";
    $("jobCardList").innerHTML = '<div class="empty-card">岗位检索失败。请确认后端已启动，并从本地启动地址打开网页。</div>';
  }
}
function bindJobs() {
  $("matchJobsBtn")?.addEventListener("click", () => runJobSearch(1));
  $("prevJobPage")?.addEventListener("click", () => { if (state.jobPage > 1) runJobSearch(state.jobPage - 1); });
  $("nextJobPage")?.addEventListener("click", () => { if (state.jobPage * state.pageSize < (state.jobTotal || 0)) runJobSearch(state.jobPage + 1); });
  $("jobPagination")?.addEventListener("click", e => {
    const btn = e.target.closest(".page-num");
    if (!btn) return;
    const page = Number(btn.dataset.page || 1);
    if (page && page !== state.jobPage) runJobSearch(page);
  });
  $("jobSort")?.addEventListener("change", () => renderJobs(state.matchedJobs));
  $("jobStatusFilter")?.addEventListener("change", e => {
    state.jobTab = e.target.value === "all" ? "recommend" : e.target.value;
    $$(".job-tabs button").forEach(b => b.classList.toggle("active", b.dataset.jobTab === state.jobTab));
    renderJobs(state.matchedJobs);
  });
  $$(".job-tabs button").forEach(btn => btn.addEventListener("click", () => {
    state.jobTab = btn.dataset.jobTab;
    $$(".job-tabs button").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    if ($("jobStatusFilter")) $("jobStatusFilter").value = state.jobTab === "recommend" ? "all" : state.jobTab;
    renderJobs(state.matchedJobs);
  }));
}


function setBuilderStep(step) {
  state.builderStep = Math.max(0, Math.min(3, Number(step) || 0));
  $$(".builder-panel").forEach(p => p.classList.toggle("active-builder-panel", Number(p.dataset.builderPanel) === state.builderStep));
  $$(".builder-step").forEach(dot => {
    const s = Number(dot.dataset.builderStep);
    dot.classList.toggle("active", s === state.builderStep);
    dot.classList.toggle("done", s < state.builderStep);
  });
  window.scrollTo({top: 0, behavior: "smooth"});
}
function normalizeResumeDraft(draft, template) {
  draft = draft || {};
  const isEn = template === "en";
  return {
    language: template,
    name: draft.name || (isEn ? "Zhang San" : "张三"),
    target_position: draft.target_position || draft.objective || $("builderTarget")?.value || (isEn ? "Target Position" : "目标岗位"),
    phone: draft.phone || "138-0000-0000",
    email: draft.email || "example@email.com",
    location: draft.location || $("builderCity")?.value || (isEn ? "China" : "求职城市待补充"),
    education: Array.isArray(draft.education) ? draft.education : (draft.education ? [draft.education] : []),
    experience: Array.isArray(draft.experience) ? draft.experience : (Array.isArray(draft.job_experience) ? draft.job_experience : []),
    projects: Array.isArray(draft.projects) ? draft.projects : [],
    skills: Array.isArray(draft.skills) ? draft.skills : (Array.isArray(draft.special_skills) ? draft.special_skills : []),
    certificates: Array.isArray(draft.certificates) ? draft.certificates : [],
    self_summary: draft.self_summary || draft.about_me || draft.self_evaluation || "",
    innovation_report: draft.innovation_report || {}
  };
}
function localGenerateResumeDraft(payload) {
  const isEn = payload.template === "en";
  const parsed = payload.parsed || state.parsed || parseMaterial(payload.materials || "");
  const memories = payload.memories || [];
  const skills = unique([...(parsed.skills || []), ...memories.flatMap(m => m.ability_tags || [])]).slice(0, 12);
  const exps = (parsed.experiences || []).map(e => ({
    title: e.title || (isEn ? "Project Experience" : "项目经历"),
    role: isEn ? "Core contributor" : "核心参与者",
    time: "",
    bullets: [
      e.summary || (isEn ? "Organized career-related materials and supported project delivery." : "围绕目标岗位整理项目材料并完成阶段性成果输出。"),
      isEn ? "Translated scattered experiences into structured resume-ready evidence." : "将分散经历整理为可用于简历、岗位匹配和面试表达的结构化材料。"
    ]
  }));
  const memoryLine = memories[0]?.refined_summary || (isEn ? "Strong learning ability, communication and project execution." : "具备较好的学习能力、表达能力和项目执行能力。");
  const target = payload.target_position || (parsed.target_jobs || [])[0] || (isEn ? "Career Assistant" : "目标岗位");
  return normalizeResumeDraft({
    name: isEn ? "Zhang San" : "张三",
    target_position: target,
    phone: "138-0000-0000",
    email: "example@email.com",
    location: payload.city || "",
    education: [parsed.education || (isEn ? "Bachelor Candidate, University" : "本科在读 / 高校学生")],
    experience: exps.length ? exps : [{title: target, role: isEn ? "Candidate" : "候选人", bullets:[memoryLine]}],
    projects: [],
    skills: skills.length ? skills : (isEn ? ["Learning Ability", "Communication", "Project Execution"] : ["快速学习", "沟通表达", "项目执行"]),
    certificates: [],
    self_summary: isEn ? `A motivated candidate for ${target}, with experience in structured project delivery, AI-assisted content organization and career-related materials.` : `面向${target}方向，具备项目整理、AI工具使用、材料表达和快速学习能力，能够将复杂任务拆解为可执行方案。`,
    innovation_report: buildInnovationReport(parsed, memories, payload)
  }, payload.template);
}
function buildInnovationReport(parsed, memories, payload) {
  parsed = parsed || state.parsed || parseMaterial($("resumeInput")?.value || "");
  memories = memories || state.memories || [];
  payload = payload || {};

  const resumeText = ($("resumeInput")?.value || "").trim();
  const extraText = ($("builderExtra")?.value || "").trim();
  const jdText = (payload?.jd || $("builderJD")?.value || "").trim();
  const targetText = (payload?.target_position || $("builderTarget")?.value || "").trim();

  const skills = unique([...(parsed.skills || []), ...memories.flatMap(m => m.ability_tags || [])]);
  const expCount = (parsed.experiences || []).length;

  const hasRealMaterial = Boolean(
    resumeText ||
    extraText ||
    jdText ||
    memories.length ||
    skills.length ||
    expCount
  );

  if (!hasRealMaterial) {
    return {
      pending: true,
      suggestions: []
    };
  }

  const target = targetText.toLowerCase();
  const targetHits = skills.filter(s => {
    const key = String(s || "").toLowerCase().slice(0, 2);
    return target && key && target.includes(key);
  }).length;

  const material = `${resumeText} ${extraText}`.trim();
  const memoryText = memories.map(m => m.refined_summary || "").join(" ");
  const materialTokens = unique(material.split(/\s+|，|。|、|；|,|\.|;/).filter(x => x.length >= 2));
  const repeated = memoryText ? materialTokens.filter(t => memoryText.includes(t)).length : 0;

  const repeatRisk = materialTokens.length && memoryText
    ? Math.round(repeated / materialTokens.length * 100)
    : null;

  const skillCapital = (skills.length || expCount)
    ? Math.min(96, Math.round(skills.length * 8 + expCount * 12))
    : null;

  const fitScore = (targetText || jdText)
    ? Math.min(96, Math.round(targetHits * 10 + (jdText ? 12 : 0) + (memories.length ? 10 : 0) + ((skills.length || expCount) ? 20 : 0)))
    : null;

  const novelty = repeatRisk === null ? null : Math.max(0, 100 - repeatRisk);

  const suggestions = [
    skillCapital === null
      ? "当前技能和项目信息不足，建议先补充简历材料。"
      : (skillCapital < 70 ? "技能标签偏少，建议补充工具、方法和课程成果。" : "技能资本较完整，可以继续突出岗位关键词。"),
    fitScore === null
      ? "建议填写目标岗位或粘贴 JD，再判断岗位贴合度。"
      : (fitScore < 70 ? "岗位贴合度一般，建议粘贴目标 JD 后重新生成。" : "目标岗位信息较明确，适合生成定制简历。"),
    repeatRisk === null
      ? "当前材料不足，暂不判断重复风险。"
      : (repeatRisk > 55 ? "经历重复风险较高，建议加入新的量化成果或本人职责。" : "重复风险较低，内容有一定新增信息。")
  ];

  return {
    ready: true,
    skill_capital: skillCapital,
    job_fit: fitScore,
    novelty_score: novelty,
    repeat_risk: repeatRisk,
    suggestions
  };
}

function renderInnovationReport(report) {
  const box = $("builderInnovationReport");
  if (!box) return;

  if (!report || report.pending) {
    box.innerHTML = '<div class="empty-state">正在生成结构化简历，诊断结果将在生成完成后显示。</div>';
    return;
  }

  const skill = Number(report.skill_capital);
  const fit = Number(report.job_fit);
  const novelty = Number(report.novelty_score);
  const repeat = Number(report.repeat_risk);
  const suggestionText = (report.suggestions || []).join("");

  const looksLikeDefault =
    (skill === 50 && fit === 58 && novelty === 82 && repeat === 18) ||
    (
      suggestionText.includes("技能标签偏少") &&
      suggestionText.includes("岗位贴合度一般") &&
      suggestionText.includes("重复风险较低") &&
      (repeat === 18 || novelty === 82)
    );

  if (looksLikeDefault) {
    box.innerHTML = '<div class="empty-state">正在生成结构化简历，诊断结果将在生成完成后显示。</div>';
    return;
  }

  const metric = v => (v === null || v === undefined || Number.isNaN(Number(v))) ? "待评估" : Number(v);
  const percentMetric = v => (v === null || v === undefined || Number.isNaN(Number(v))) ? "待评估" : `${Number(v)}%`;

  box.innerHTML = `<div class="innovation-metrics">
    <div><b>${metric(report.skill_capital)}</b><span>技能资本</span></div>
    <div><b>${metric(report.job_fit)}</b><span>岗位贴合</span></div>
    <div><b>${metric(report.novelty_score)}</b><span>新信息占比</span></div>
    <div><b>${percentMetric(report.repeat_risk)}</b><span>重复风险</span></div>
  </div>
  <div class="innovation-tips">${(report.suggestions || []).map(s => `<p>• ${escapeHTML(s)}</p>`).join("")}</div>`;
}

function collectBuilderPayload() {
  const target = $("builderTarget")?.value.trim() || "通用求职方向";
  const city = $("builderCity")?.value.trim() || "";
  const jd = $("builderJD")?.value.trim() || "";
  const extra = $("builderExtra")?.value.trim() || "";
  const sourceText = [$("resumeInput")?.value || "", extra, state.memories.map(m => m.refined_summary || "").join("\n")].join("\n");
  return {
    template: state.builderTemplate || "cn",
    target_position: target,
    city,
    jd,
    materials: sourceText,
    parsed: state.parsed,
    memories: state.memories.slice(0, 12),
    source_job: state.builderSourceJob
  };
}
async function runResumeBuilder() {
  const payload = collectBuilderPayload();
  setLoading("builderLoading", true);
  if ($("builderJson")) $("builderJson").textContent = "正在生成结构化简历...";
  renderInnovationReport({ pending: true });
  try {
    const draft = await generateResumeBuilderDraft(payload);
    state.builderDraft = normalizeResumeDraft(draft, payload.template);
    if (!state.builderDraft.innovation_report) state.builderDraft.innovation_report = buildInnovationReport(payload.parsed, payload.memories, payload);
    localStorage.setItem("sky_zhiyi_builder_draft_v14", JSON.stringify(state.builderDraft));
    toast("简历草稿已生成", "可以进入预览并导出 Word。")
  } catch (e) {
    state.builderDraft = localGenerateResumeDraft(payload);
    toast("已使用本地生成器", "后端连接后可调用 dsv4chat 生成更完整内容。")
  }
  setLoading("builderLoading", false);
  if ($("builderJson")) $("builderJson").textContent = renderJSON(state.builderDraft);
  renderInnovationReport(state.builderDraft.innovation_report);
  renderBuilderPreview();
  updateHomeStats();
}
function renderListItems(items) {
  return (items || []).map(item => {
    if (typeof item === "string") return `<li>${escapeHTML(item)}</li>`;
    const title = item.title || item.company || item.school || item.name || "经历";
    const role = item.role || item.major || item.position || "";
    const bullets = Array.isArray(item.bullets) ? item.bullets : (item.summary ? [item.summary] : []);
    return `<li><b>${escapeHTML(title)}</b>${role ? `｜${escapeHTML(role)}` : ""}<ul>${bullets.map(b => `<li>${escapeHTML(b)}</li>`).join("")}</ul></li>`;
  }).join("");
}
function resumePlainText(d) {
  if (!d) return "";
  const lines = [];
  lines.push(`${d.name}｜${d.target_position}`);
  lines.push(`${d.phone}｜${d.email}｜${d.location}`);
  lines.push("\n教育背景"); (d.education || []).forEach(x => lines.push(typeof x === "string" ? x : JSON.stringify(x)));
  lines.push("\n经历/项目"); [...(d.experience || []), ...(d.projects || [])].forEach(x => { lines.push(x.title || "经历"); (x.bullets || [x.summary]).filter(Boolean).forEach(b => lines.push("- " + b)); });
  lines.push("\n技能"); lines.push((d.skills || []).join("、"));
  lines.push("\n自我评价"); lines.push(d.self_summary || "");
  return lines.join("\n");
}
function renderBuilderPreview() {
  const box = $("builderPreview");
  if (!box) return;
  const d = state.builderDraft;
  if (!d) {
    box.innerHTML = '<div class="empty-state">请先生成简历草稿。</div>';
    return;
  }
  const lang = d.language === "en";
  const expItems = [...(d.experience || []), ...(d.projects || [])];
  box.innerHTML = `<div class="resume-headline">
    <h2 contenteditable="true">${escapeHTML(d.name)}</h2>
    <p contenteditable="true">${escapeHTML(d.target_position)} · ${escapeHTML(d.location || "")}</p>
    <small contenteditable="true">${escapeHTML(d.phone)} ｜ ${escapeHTML(d.email)}</small>
  </div>
  <section><h3>${lang ? "Objective" : "求职定位"}</h3><p contenteditable="true">${escapeHTML(d.self_summary || "")}</p></section>
  <section><h3>${lang ? "Education" : "教育背景"}</h3><ul>${renderListItems(d.education)}</ul></section>
  <section><h3>${lang ? "Experience" : "项目 / 实习经历"}</h3><ul>${renderListItems(expItems)}</ul></section>
  <section><h3>${lang ? "Skills & Certificates" : "技能证书"}</h3><p>${(d.skills || []).map(s => `<span class="resume-skill">${escapeHTML(s)}</span>`).join("")} ${(d.certificates || []).map(s => `<span class="resume-skill">${escapeHTML(s)}</span>`).join("")}</p></section>`;
}
function resetBuilder() {
  state.builderStep = 0;
  state.builderTemplate = "cn";
  state.builderDraft = null;
  state.builderSourceJob = null;
  localStorage.removeItem("sky_zhiyi_builder_draft_v14");
  ["builderTarget", "builderCity", "builderJD", "builderExtra"].forEach(id => { if ($(id)) $(id).value = ""; });
  if ($("builderJson")) $("builderJson").textContent = "等待生成...";
  if ($("builderInnovationReport")) $("builderInnovationReport").innerHTML = '<div class="empty-state">等待生成。系统会检查技能资本、岗位贴合度和经历重复风险。</div>';
  renderBuilderPreview();
  setBuilderStep(0);
  toast("生成器已重置");
}
window.openBuilderFromJob = function(localIndex) {
  const viewList = applyJobSortAndFilter(state.matchedJobs);
  const j = viewList[localIndex];
  if (!j) return;
  state.builderSourceJob = j;
  state.builderTemplate = "cn";
  if ($("builderTarget")) $("builderTarget").value = j.job || "目标岗位";
  if ($("builderCity")) $("builderCity").value = j.city || "";
  if ($("builderJD")) $("builderJD").value = `公司：${j.company || ""}\n岗位：${j.job || ""}\n城市：${j.city || ""}\n类型：${j.type || ""}\n匹配理由：${j.reasons || ""}`;
  showPage("builder");
  setBuilderStep(1);
  toast("已带入岗位", "可以生成该岗位的定制简历。")
};
function bindBuilder() {
  $$(".template-card").forEach(btn => btn.addEventListener("click", () => {
    state.builderTemplate = btn.dataset.template || "cn";
    $$(".template-card").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    toast(state.builderTemplate === "en" ? "已选择英文模板" : "已选择中文模板");
  }));
  $$("[data-builder-next]").forEach(btn => btn.addEventListener("click", () => setBuilderStep(state.builderStep + 1)));
  $$("[data-builder-prev]").forEach(btn => btn.addEventListener("click", () => setBuilderStep(state.builderStep - 1)));
  $$(".builder-step").forEach(dot => dot.addEventListener("click", () => setBuilderStep(Number(dot.dataset.builderStep))));
  $("runBuilderBtn")?.addEventListener("click", runResumeBuilder);
  $("builderResetBtn")?.addEventListener("click", resetBuilder);
  $("copyResumeBtn")?.addEventListener("click", async () => {
    if (!state.builderDraft) { toast("暂无简历草稿", "请先生成。") ; return; }
    await navigator.clipboard.writeText(resumePlainText(state.builderDraft));
    toast("已复制简历文本", "可以粘贴到 Word 或在线简历系统。")
  });
  $("exportResumeBtn")?.addEventListener("click", async () => {
    if (!state.builderDraft) { toast("暂无简历草稿", "请先生成。") ; return; }
    try {
      const blob = await exportResumeBuilderDraft({template: state.builderTemplate, draft: state.builderDraft});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = state.builderTemplate === "en" ? "SKY_ZhiYi_Resume_EN.docx" : "SKY_ZhiYi_Resume_CN.docx";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Word 导出完成", "已生成可继续编辑的 docx。")
    } catch (e) {
      toast("导出失败", "请确认后端已启动。也可以先复制简历文本。")
    }
  });
  if (state.builderDraft) renderBuilderPreview();
}

function localEvaluateAnswer(question, answer, target) {
  const len = answer.trim().length;
  let level = len > 180 ? "较完整" : len > 80 ? "基本可用" : "偏简略";
  let suggestions = [];
  if (!/[0-9一二三四五六七八九十]/.test(answer)) suggestions.push("补充量化结果，例如完成数量、提升比例、周期或排名。");
  if (!answer.includes("我") && !answer.includes("负责") && !answer.includes("参与")) suggestions.push("明确你本人承担的职责，不要只描述项目本身。");
  if (!answer.includes("结果") && !answer.includes("最终") && !answer.includes("提升")) suggestions.push("最后补充结果和复盘。");
  if (!suggestions.length) suggestions.push("回答结构较完整，后续可以再压缩语言，让表达更自然。");
  return `评价：${level}\n针对岗位：${target}\n建议：\n- ${suggestions.join("\n- ")}`;
}
function renderCurrentQuestion() {
  const list = $("questionList");
  if (!list) return;
  const total = state.currentQuestions.length;
  if (!total) {
    list.innerHTML = "等待生成问题...";
    if ($("questionPageText")) $("questionPageText").textContent = "第 0 / 0 题";
    if ($("prevQuestionBtn")) $("prevQuestionBtn").disabled = true;
    if ($("nextQuestionBtn")) $("nextQuestionBtn").disabled = true;
    return;
  }
  state.currentQuestionIndex = Math.max(0, Math.min(state.currentQuestionIndex, total - 1));
  const i = state.currentQuestionIndex;
  const q = state.currentQuestions[i] || {};
  list.innerHTML = `<article class="question-card">
    <span class="mini-label">Question ${i + 1}</span>
    <h3>${escapeHTML(q.question || "面试问题")}</h3>
    <p>考查点：${escapeHTML(q.why || q.intent || "岗位匹配与表达能力")}</p>
    <p>回答建议：${escapeHTML(q.answer_hint || q.hint || "按背景、行动、结果、反思回答。")}</p>
    <textarea class="answer-input" id="answer_current" placeholder="在这里输入你的回答，系统会给出改进建议..."></textarea>
    <div class="answer-actions"><button class="ghost-btn" id="evaluateCurrentBtn">评价我的回答</button><button class="ghost-btn" id="saveCurrentAnswerBtn">保存为面试记忆</button></div>
    <div class="feedback-box hidden" id="feedback_current"></div>
  </article>`;
  $("evaluateCurrentBtn")?.addEventListener("click", () => evaluateCurrentAnswer());
  $("saveCurrentAnswerBtn")?.addEventListener("click", () => saveCurrentAnswerAsMemory());
  if ($("questionPageText")) $("questionPageText").textContent = `第 ${i + 1} / ${total} 题`;
  if ($("prevQuestionBtn")) $("prevQuestionBtn").disabled = i <= 0;
  if ($("nextQuestionBtn")) $("nextQuestionBtn").disabled = i >= total - 1;
}
async function evaluateCurrentAnswer() {
  const q = state.currentQuestions[state.currentQuestionIndex] || {};
  const ans = $("answer_current")?.value.trim() || "";
  const fb = $("feedback_current");
  if (!ans) {
    toast("请先输入回答", "再点击评价。")
    return;
  }
  fb.textContent = "正在分析你的回答...";
  fb.classList.remove("hidden");
  try {
    const result = await evaluateAnswerWithDeepSeek(q.question || "", ans, state.currentInterviewTarget || "目标岗位");
    if (result) {
      const strengths = (result.strengths || []).map(x => `- ${x}`).join("\n");
      const suggestions = (result.suggestions || []).map(x => `- ${x}`).join("\n");
      fb.textContent = `总体评价：${result.overall || ""}\n\n优点：\n${strengths}\n\n改进建议：\n${suggestions}\n\n优化示范：\n${result.polished_answer || ""}`;
      toast("评价完成", "可以保存为面试记忆。")
      return;
    }
  } catch (e) {}
  fb.textContent = localEvaluateAnswer(q.question || "", ans, state.currentInterviewTarget || "目标岗位");
  toast("本地评价完成", "后端连接后可获得更完整评分。")
}
function saveCurrentAnswerAsMemory() {
  const q = state.currentQuestions[state.currentQuestionIndex] || {};
  const ans = $("answer_current")?.value.trim() || "";
  if (!ans) {
    toast("请先输入回答", "保存前需要回答内容。")
    return;
  }
  state.memories.unshift({
    memory_type:"interview_answer",
    title:"面试回答练习",
    refined_summary:`问题：${q.question}\n回答：${ans}`,
    ability_tags:["面试回答","表达训练","复盘"],
    job_relevance:[state.currentInterviewTarget || "目标岗位"],
    importance_score:72,
    resume_value:"medium",
    suggested_layer:"transition_memory",
    agent_source:"user_answer",
    saved_at:new Date().toLocaleString()
  });
  saveMemories();
  toast("已保存到求职记忆库", "可在 Memory 页面分页查看。")
}
function bindInterview() {
  $("generateInterviewBtn")?.addEventListener("click", async () => {
    const target = $("interviewJob").value.trim() || "目标岗位";
    state.currentInterviewTarget = target;
    $("selfIntroBox").textContent = "正在生成训练方案...";
    $("questionList").innerHTML = `<div class="skeleton-area"><div></div><div></div><div></div></div>`;
    try {
      const plan = await interviewWithDeepSeek(target, state.memories);
      if (plan) {
        $("selfIntroBox").textContent = plan.self_intro || "已生成。";
        state.currentQuestions = plan.questions || [];
        state.currentQuestionIndex = 0;
        renderCurrentQuestion();
        setWorkflowMilestone("trained");
        toast("训练方案已生成", "现在按题分页练习。")
        return;
      }
    } catch (e) {}
    const latest = state.memories[0];
    const tags = latest ? (latest.ability_tags || []).slice(0,5).join("、") : "学习能力、项目执行、沟通表达";
    $("selfIntroBox").textContent = `您好，我目前希望投递${target}方向。我的优势是${tags}。在过往项目和实践中，我参与过AI应用原型、项目材料整理和成果展示等工作，能够把复杂问题拆解成可落地的方案。希望未来在岗位中继续提升专业能力，为团队创造实际价值。`;
    const qs = [...state.questions];
    qs.push({question:`请介绍一下你最能体现${target}能力的项目。`, intent:"考查岗位相关项目经验。", hint:"说明项目背景、本人职责、使用工具、结果和反思。"});
    state.currentQuestions = qs.slice(0,6);
    state.currentQuestionIndex = 0;
    renderCurrentQuestion();
    setWorkflowMilestone("trained");
    toast("已生成本地训练方案", "后端连接后可生成更个性化追问。")
  });
  $("prevQuestionBtn")?.addEventListener("click", () => { state.currentQuestionIndex--; renderCurrentQuestion(); });
  $("nextQuestionBtn")?.addEventListener("click", () => { state.currentQuestionIndex++; renderCurrentQuestion(); });
  $("saveFeedbackBtn")?.addEventListener("click", () => {
    const fb = $("feedbackInput").value.trim();
    if (!fb) {
      toast("请先填写反馈", "记录卡壳点、追问和下次改进方向。")
      return;
    }
    state.memories.unshift({
      memory_type:"interview_feedback",
      title:"面试反馈记忆",
      refined_summary:fb,
      ability_tags:["面试反馈","表达优化","复盘"],
      job_relevance:[$("interviewJob").value.trim() || "目标岗位"],
      importance_score:76,
      resume_value:"medium",
      suggested_layer:"transition_memory",
      agent_source:"user_feedback",
      saved_at:new Date().toLocaleString()
    });
    saveMemories();
    $("feedbackInput").value = "";
    toast("反馈已回写", "已保存到求职记忆库。")
  });
}

function bindSettings() {
  $("settingsResetDemoBtn")?.addEventListener("click", resetDemoData);
  $("saveSettingsNameBtn")?.addEventListener("click", () => {
    const name = ($("settingsNameInput")?.value || "").trim();
    if (!name) {
      state.currentUser = null;
      localStorage.removeItem("sky_zhiyi_user_v12");
      updateHomeStats();
      toast("已恢复默认称呼", "当前显示为 Hi，寻路人。");
      return;
    }
    const oldUser = state.currentUser || {};
    state.currentUser = {
      ...oldUser,
      username: oldUser.username || name,
      nickname: name,
      email: oldUser.email || ""
    };
    localStorage.setItem("sky_zhiyi_user_v12", JSON.stringify(state.currentUser));
    setWorkflowMilestone("registered");
    updateHomeStats();
    toast("用户名已更新", `现在显示为 Hi，${name}。`);
  });
}


function initParticles() {
  const canvas = $("particleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];
  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    const count = Math.min(46, Math.floor(window.innerWidth / 30));
    particles = Array.from({length: count}, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2.2 + .8,
      vx: (Math.random() - .5) * .25,
      vy: (Math.random() - .5) * .25,
      a: Math.random() * .35 + .12
    }));
  }
  function tick() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
      if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;
      ctx.beginPath();
      ctx.fillStyle = `rgba(37,99,235,${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(tick);
  }
  resize();
  window.addEventListener("resize", resize);
  tick();
}

function init() {
  bindThemeToggle();
  bindLanding();
  bindNavigation();
  bindResumeFlow();
  bindMemory();
  bindJobs();
  bindBuilder();
  bindInterview();
  bindSettings();
  initParticles();
  fetch("data/interview_questions.json").then(r => r.json()).then(d => state.questions = d).catch(() => state.questions = []);
  renderMemories();
  renderJobs([]);
  renderCurrentQuestion();
  updateHomeStats();
  setPageMeta("home");
  if (!document.body.classList.contains("landing-mode")) toast("欢迎回来", "已进入 SKY职忆工作台。")
}

document.addEventListener("DOMContentLoaded", init);
