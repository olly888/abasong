"use strict";
// Synthetic delivery workflow only. No live jobs, contacts, location or service writes.
(() => {
  const base = { actions, submitForm, render, renderModal, resetPrototype, defaultDraft, draftFromJob, jobFromForm, jobCard, jobDetail, managePage, applyPage, sharePage, publicPage, publicSummary, chatPage };
  const ex = window.abasongExperience, today = ex.demoDay, tomorrow = "2026-11-05";
  const scenes = { warehouse: "仓库缺人，找司机", rescue: "送不完，找人代送" };
  const ui = { preview: null, lastPublisher: false };
  const day = d => d === today ? "今天" : d === tomorrow ? "明天" : d;
  const qtyLabel = (j, remaining = false) => j.quantityMode === "unknown" || (remaining ? j.remaining : j.qty) == null ? "件数待确认" : `${j.quantityMode === "estimate" ? "约 " : ""}${remaining ? j.remaining : j.qty} 件`;
  const arrival = j => `${day(j.date)} ${j.asap ? "尽快接手" : time12(j.start)}`;
  const completion = j => ({ same_day: "当天送完", next_day: "可次日送完", contact: "联系确认" }[j.completion] || "联系确认");
  function normalize(f) {
    f.scene ??= f.kind === "extra_drivers" ? "warehouse" : "rescue";
    f.quantityMode ??= "exact";
    f.drivers ||= "1";
    f.asap ??= false;
    f.taskScope ??= f.kind === "whole_route" ? "whole" : "partial";
    f.expiryMode ??= "auto";
    f.completion ??= "contact";
    f.moreOpen ??= false;
    f.pickupKind ??= f.scene === "warehouse" ? "warehouse" : "contact_handoff";
    f.kind = f.scene === "warehouse" ? "extra_drivers" : f.taskScope === "whole" ? "whole_route" : "partial_route";
    f.partial = f.kind !== "whole_route";
    if (f.quantityMode === "unknown") f.min = "";
    return f;
  }
  function expiry(f) {
    return f.expiryMode === "custom" ? { date: f.endDate, time: f.end } : { date: f.date, time: f.pickupEnd || "23:59" };
  }
  defaultDraft = kind => normalize({ ...base.defaultDraft(kind), quantityMode: "exact", scene: kind === "extra_drivers" ? "warehouse" : "rescue", drivers: "1", asOrg: ui.lastPublisher && !!window.abasongAccount.state.team?.name });
  draftFromJob = j => normalize({ ...base.draftFromJob(j), scene: j.deliveryScene || (j.kind === "extra_drivers" ? "warehouse" : "rescue"), quantityMode: j.quantityMode || "exact", qty: j.qty == null ? "" : String(j.qty), drivers: String(j.drivers || 1), asap: !!j.asap, taskScope: j.partial === false ? "whole" : "partial", completion: j.completion || "contact", expiryMode: j.expiryMode || "custom", moreOpen: false });
  function openScene(scene) {
    if (!requireLogin(() => openScene(scene))) return;
    state.editing = null; state.reopening = false;
    state.forms.request = normalize({ ...defaultDraft(scene === "warehouse" ? "extra_drivers" : "partial_route"), scene, pickupKind: scene === "warehouse" ? "warehouse" : "contact_handoff", asap: scene === "rescue", quantityMode: scene === "warehouse" ? "estimate" : "exact" });
    ui.preview = null; nav("requestForm");
  }
  publishPicker = () => `${home()}<div class="support-overlay"><section class="support-panel" role="dialog" aria-modal="true" aria-label="发需求"><h2>发需求</h2><div class="select-list">${[["warehouse", "warehouse", "临时缺人或包裹多，需要司机到仓库取件"], ["rescue", "box", "把送不完的包裹交给同行代送"]].map(([key, icon, hint]) => `<button class="option-card delivery-scene-button" data-action="delivery-scene" data-id="${key}"><span class="option-icon">${I(icon)}</span><span><b>${scenes[key]}</b><small>${hint}</small></span>${I("chevron")}</button>`).join("")}</div>${btn("back", "取消", "text-btn wide-link")}</section></div>`;
  function identity(f) {
    const j = getJob(state.editing), team = window.abasongAccount.state.team;
    if (j && j.status !== "draft") return `<div class="delivery-identity">${row("发布身份", j.org || "个人")}</div>`;
    return `<details class="delivery-identity" ${f.identityOpen ? "open" : ""}><summary>发布身份：${esc(f.asOrg ? team?.name || "个人" : "个人")}<span>更改</span></summary><div class="account-publisher-options">${btn("account-publisher", "个人", !f.asOrg ? "active" : "", `data-id="personal" aria-pressed="${!f.asOrg}"`)}${btn(team?.name ? "account-publisher" : "account-create-team", team?.name ? "代表 " + esc(team.name) : "添加团队资料", f.asOrg ? "active" : "", `data-id="team" aria-pressed="${!!f.asOrg}"`)}</div></details>`;
  }
  function quantityFields(f) {
    return `<div class="delivery-quantity-kind" role="radiogroup" aria-label="件数口径">${[["exact", "确定"], ["estimate", "约数"], ["unknown", "待确认"]].map(([value, label]) => `<label><input type="radio" name="quantityMode" data-delivery-field="quantityMode" value="${value}" ${f.quantityMode === value ? "checked" : ""}/>${label}</label>`).join("")}</div><div class="${f.scene === "warehouse" && f.quantityMode !== "unknown" ? "delivery-grid" : ""}">${f.quantityMode !== "unknown" ? field("request", "qty", f.scene === "warehouse" ? "总待送件数" : "待送件数", "number", { min: 1, placeholder: "件" }) : ""}${f.scene === "warehouse" ? field("request", "drivers", "需要司机", "number", { min: 1, placeholder: "人" }) : ""}</div>${f.quantityMode === "unknown" && state.errors.qty ? `<p class="field-error" role="alert">${esc(state.errors.qty)}</p>` : ""}`;
  }
  requestForm = () => {
    const f = normalize(state.forms.request ||= defaultDraft("partial_route")), exp = expiry(f);
    return formPage(state.editing ? "编辑配送需求" : scenes[f.scene], "delivery-request", `${formError()}${identity(f)}<section class="form-section"><div class="delivery-grid">${field("request", "region", "派送区域", "text", { choices: [["", "请选择"], ...areas] })}${field("request", "carrier", "快递公司", "text", { choices: [["", "请选择"], "SwiftX", "GOFO", "SpeedX", "UniUni", "其他"] })}</div></section><section class="form-section"><h2 class="section-title">${f.scene === "warehouse" ? "到哪里取件" : "在哪里接手"}</h2><div class="ex-segment">${[["warehouse", "仓库取件"], ["contact_handoff", "途中交接"]].map(([key, label]) => btn("ex-pickup-kind", label, f.pickupKind === key ? "active" : "", `data-id="${key}" aria-pressed="${f.pickupKind === key}"`)).join("")}</div>${f.pickupKind === "warehouse" ? `${field("request", "pickupAddress", "仓库地址", "text", { max: 300, placeholder: "门牌、街道、城市、州" })}<div id="pickup-suggestions" class="ex-address-suggestions"></div><div data-delivery-map-action ${f.pickupAddress ? "" : "hidden"}>${btn("ex-form-map", I("pin") + "查看取件位置", "text-btn")}</div>` : `${field("request", "pickup", "交接地区", "text", { choices: [["", "请选择"], ...areas] })}<p class="delivery-short-note">具体交接地点联系确认</p>`}</section><section class="form-section"><h2 class="section-title">什么时候接手</h2><div class="delivery-date-quick">${btn("delivery-date", "今天", f.date === today ? "active" : "", `data-id="${today}"`)}${btn("delivery-date", "明天", f.date === tomorrow ? "active" : "", `data-id="${tomorrow}"`)}</div><div class="delivery-grid">${field("request", "date", "接手日期", "date")}${!f.asap ? field("request", "start", "希望到场", "time") : '<div class="delivery-asap">今天 · 尽快接手</div>'}</div>${f.date === today ? `<label class="delivery-asap"><input type="checkbox" data-delivery-field="asap" ${f.asap ? "checked" : ""}/>尽快接手</label>` : ""}</section><section class="form-section"><h2 class="section-title">任务量</h2>${quantityFields(f)}</section><section class="form-section"><h2 class="section-title">报价</h2><div class="delivery-grid">${f.unit !== "negotiable" ? field("request", "price", "金额（USD）", "number", { min: 0.01, step: "0.01", placeholder: "如 1.85" }) : ""}${field("request", "unit", "计价方式", "text", { choices: [["per_parcel", "美元 / 件"], ["per_route", "美元 / 线路"], ["negotiable", "联系议价"]] })}</div></section><section class="form-section"><h2 class="section-title">接手条件</h2>${field("request", "handoff", "账号与交接要求", "text", { choices: [["contact_confirm", "联系确认"], ["carrier_account", "需已有该快递公司账号"], ["dsp_approval", "需 DSP 确认转派"]] })}${field("request", "completion", "送完要求", "text", { choices: [["contact", "联系确认"], ["same_day", "当天送完"], ["next_day", "可次日送完"]] })}</section><details class="delivery-options" ${f.moreOpen ? "open" : ""}><summary>补充条件（选填）</summary><div>${f.pickupKind === "warehouse" ? field("request", "pickupName", "仓库名称", "text", { optional: true, max: 100 }) : ""}${field("request", "route", "线路编号", "text", { optional: true, max: 100 })}${field("request", "pickupEnd", "最迟接手时间", "time", { optional: true })}${f.scene === "rescue" ? field("request", "taskScope", "任务范围", "text", { choices: [["partial", "可分担部分包裹"], ["whole", "整条线路接手"]] }) : ""}${f.quantityMode !== "unknown" && f.taskScope !== "whole" ? field("request", "min", "每人最低件数", "number", { min: 1, optional: true }) : ""}${field("request", "experience", "配送经验要求", "text", { choices: [["any", "不限"], ["delivery_experience", "有配送经验"], ["carrier_experience", "熟悉该快递公司"]] })}${field("request", "sorted", "理货状态", "text", { choices: [["unknown", "待确认"], ["sorted", "已理货"], ["unsorted", "未理货"]] })}${field("request", "terms", "私下付款约定", "textarea", { optional: true, max: 300, placeholder: "如当天结、周结，双方联系确认" })}${field("request", "description", "其他说明", "textarea", { optional: true, max: 1000 })}<p class="delivery-short-note">需求下架：${esc(exp.date || "待选日期")} ${time12(exp.time)}</p>${check("request", "customExpiry", "自定义下架时间")}${f.expiryMode === "custom" ? `<div class="delivery-grid">${field("request", "endDate", "下架日期", "date")}${field("request", "end", "下架时间", "time")}</div>` : ""}</div></details>`, state.editing ? "核对并保存" : "核对并发布", { secondary: !state.editing ? btn("save-draft", "保存草稿", "text-btn wide-link") : "" });
  };
  function validate(f) {
    const e = {}, positive = v => Number.isInteger(Number(v)) && Number(v) > 0;
    for (const key of ["region", "carrier", "date"]) if (!f[key]) e[key] = "请填写这一项";
    if (f.pickupKind === "warehouse") {
      if (!/^\d\S*\s+.+,\s*.+,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test((f.pickupAddress || "").trim())) e.pickupAddress = "请填写完整取件地址";
    } else if (!f.pickup) e.pickup = "请选择交接地区";
    if (!f.asap && !f.start) e.start = "请选择希望到场时间";
    if (f.asap && f.date !== today) e.start = "未来日期请选择到场时间";
    if (f.quantityMode !== "unknown" && !positive(f.qty)) e.qty = "请输入正整数件数";
    if (f.scene === "warehouse" && !positive(f.drivers)) e.drivers = "请输入需要的司机人数";
    if (f.taskScope === "whole" && f.scene === "rescue" && f.quantityMode !== "exact") e.qty = "整线接手请确认件数，或改为可分担部分包裹";
    if (f.min && (!positive(f.min) || (f.quantityMode === "exact" && Number(f.min) > Number(f.qty)))) e.min = "请核对最低承接件数";
    if (f.unit !== "negotiable" && (!Number.isFinite(Number(f.price)) || Number(f.price) <= 0)) e.price = "请输入有效美元金额";
    const start = f.asap ? ex.state.now : ex.laInstant(f.date, f.start), end = expiry(f);
    if (Number.isFinite(start) && start < ex.state.now) e.start = "请选择尚未过去的接手时间";
    if (f.pickupEnd && ex.laInstant(f.date, f.pickupEnd) < start) e.pickupEnd = "最迟接手不能早于开始时间";
    if (!end.date || !end.time || ex.laInstant(end.date, end.time) <= start) e.end = "下架时间需晚于接手时间";
    return e;
  }
  function startClock(f) {
    if (!f.asap) return f.start;
    return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ex.state.now));
  }
  jobFromForm = (input, existing) => {
    const f = normalize(input), exp = expiry(f), count = f.quantityMode === "unknown" || !f.qty ? null : Number(f.qty);
    const j = base.jobFromForm({ ...f, start: startClock(f), endDate: exp.date, end: exp.time }, existing);
    return { ...j, deliveryScene: f.scene, pickup: f.pickupKind === "warehouse" ? f.pickup || f.pickupAddress.split(",")[1]?.trim() || "地区待确认" : f.pickup, quantityMode: f.quantityMode, qty: count, remaining: existing && existing.quantityMode === f.quantityMode && count != null ? Math.min(existing.remaining ?? count, count) : count, min: count == null ? null : j.min, asap: !!f.asap, completion: f.completion, expiryMode: f.expiryMode, pickupEnd: f.pickupEnd || "" };
  };
  function preview(f) {
    const j = jobFromForm(f, getJob(state.editing));
    return `<section class="dialog delivery-preview" role="dialog" aria-modal="true" aria-label="核对配送需求"><div class="close-row"><h2>核对配送需求</h2>${ib("close-modal", "close", "继续编辑")}</div>${row("场景", scenes[f.scene])}${row("发布身份", j.org || "个人")}${row("派送区域", f.region)}${f.pickupKind === "warehouse" ? `<div class="ex-preview-address"><b>取件仓库</b>${f.pickupName ? `<p>${esc(f.pickupName)}</p>` : ""}<p>${esc(f.pickupAddress)}</p></div>` : row("交接地区", f.pickup + " · 具体地点联系确认")}${row("接手时间", arrival(j))}${f.pickupEnd ? row("最迟接手", time12(f.pickupEnd)) : ""}${row("任务量", qtyLabel(j) + (f.scene === "warehouse" ? ` · 需${f.drivers}人` : f.taskScope === "whole" ? " · 整线接手" : " · 可分担"))}${row("报价", f.unit === "negotiable" ? "联系议价" : `$${f.price} / ${f.unit === "per_route" ? "线路" : "件"}`)}${row("账号要求", { contact_confirm: "联系确认", carrier_account: "需已有该快递公司账号", dsp_approval: "需 DSP 确认转派" }[f.handoff])}${row("送完要求", completion(j))}${f.experience !== "any" ? row("配送经验", f.experience === "carrier_experience" ? "熟悉该快递公司" : "有配送经验") : ""}${f.terms ? row("付款约定", f.terms) : ""}${row("需求下架", j.endDate + " " + time12(j.end))}${btn("commit-request", state.editing ? "确认保存" : "发布需求", "button")}${btn("close-modal", "继续编辑", "button secondary")}</section>`;
  }
  actions = (a, b) => {
    const id = b?.dataset.id;
    if (a === "delivery-scene") return openScene(id);
    if (a === "publish-kind") {
      if (["vehicle_help", "other_help"].includes(id)) return modal("info", { title: "配送途中求助", text: "可在司机圈发布动态向同行求助。" });
      return openScene(id === "extra_drivers" ? "warehouse" : "rescue");
    }
    if (a === "delivery-date") {
      const f = state.forms.request; f.date = id; if (id !== today) f.asap = false; capture(); render(); return;
    }
    if (a === "commit-request") {
      const f = state.forms.request;
      if (!f || !ui.preview || state.modal?.type !== "delivery-preview") return;
      if (ui.preview !== JSON.stringify(f)) { state.modal = null; state.errors._ = "填写内容有变化，请重新核对。"; render(); return; }
      const old = getJob(state.editing);
      if (old && state.editVersion !== old.version) { state.modal = null; state.errors._ = "条件已变化，请重新核对。"; render(); return; }
      if ($("#delivery-save-fail").checked) { $("#delivery-save-fail").checked = false; state.modal = null; state.errors._ = "保存未成功，填写内容已保留，请重试。"; render(); return; }
      const j = jobFromForm(f, old); j.status = "open"; j.version = old ? old.version + 1 : 1;
      if (old) Object.assign(old, j); else model.jobs.unshift(j);
      ui.lastPublisher = !!f.asOrg; ui.preview = null; state.selectedJob = j.id; state.editing = null; state.forms.request = null; state.modal = null; state.homeView = "jobs"; nav("manage", { id: j.id }, true); toast(old ? "需求已更新" : "配送需求已发布"); return;
    }
    if (["edit-job", "reopen-job", "clone-job"].includes(a) && ["vehicle_help", "other_help"].includes(getJob(id)?.kind)) return modal("info", { title: "配送途中求助", text: "这类专用表单已后置，可在司机圈发布文字求助。历史记录仍可查看。" });
    if (a === "gap" && getJob(id)?.quantityMode === "unknown") { modal("delivery-gap", { id }); return; }
    const result = base.actions(a, b);
    if (a === "ex-pickup-choice" && state.forms.request) { const f = state.forms.request; f.autoPickupName = f.pickupName; }
    if (a === "ex-pickup-kind" && id === "contact_handoff" && state.forms.request) { state.forms.request.pickup = ""; render(); }
    if (a === "clone-job" && state.forms.request) { Object.assign(state.forms.request, { expiryMode: "auto", customExpiry: false, asap: false }); render(); }
    return result;
  };
  submitForm = (type, form) => {
    if (type === "delivery-request") {
      const f = normalize(state.forms.request), errors = validate(f);
      if (Object.keys(errors).length) { state.errors = errors; f.moreOpen = !!(errors.pickupEnd || errors.min || errors.end); render(); $(".field.invalid input,.field.invalid select")?.focus(); return; }
      state.errors = {}; state.editVersion = getJob(state.editing)?.version; ui.preview = JSON.stringify(f); modal("delivery-preview"); return;
    }
    if (type === "delivery-gap") {
      const j = getJob(state.modal.id), n = Number(new FormData(form).get("drivers"));
      if (!Number.isInteger(n) || n < 0 || n > j.drivers) return toast("人数不能小于0或超过原需求");
      j.remainingDrivers = n; j.version++; closeModal(); render(); if (!n) confirmAction("标记已找到", "司机人数已补齐，是否结束需求？", () => { j.status = "found"; closeModal(); render(); }); return;
    }
    if (type === "apply" && getJob(state.route.args.id)?.deliveryScene) {
      const j = getJob(state.route.args.id), f = state.forms.apply, errors = {};
      if (!isOpen(j)) return toast("需求已结束");
      if ($("#change-price").checked) { $("#change-price").checked = false; j.price = (j.price || 180) + 10; j.version++; }
      if (f.seenVersion !== j.version) { f.seenVersion = j.version; state.errors._ = "需求条件已更新，请核对后再提交。"; render(); return; }
      if (!f.date) errors.date = "请选择日期"; if (!f.arrival) errors.arrival = "请选择预计到场时间";
      const q = f.capacity === "" ? null : Number(f.capacity);
      if (q !== null && (!Number.isInteger(q) || q < 1)) errors.capacity = "请输入正整数件数";
      if (j.quantityMode === "exact" && (q === null || q > j.remaining || (j.min && q < j.min))) errors.capacity = "请核对本次可接件数";
      if (Object.keys(errors).length) { state.errors = errors; render(); return; }
      let ap = model.applications.find(x => x.job === j.id && x.user === "me");
      if (ap?.status === "applied") { toast("你已报名，不会重复提交"); contact(j.owner, j.id); return; }
      const values = { job: j.id, user: "me", status: "applied", capacity: q, date: f.date, arrival: f.arrival, version: j.version, contacted: false };
      if (ap) Object.assign(ap, values); else model.applications.push({ id: uid(), ...values });
      const c = getChat(j.owner, j.id); state.errors = {}; nav("chat", { id: c.id }, true); toast("报名已提交"); return;
    }
    base.submitForm(type, form);
  };
  renderModal = () => {
    if (state.modal?.type === "delivery-preview") { $("#overlay").innerHTML = preview(state.forms.request); return; }
    if (state.modal?.type === "delivery-gap") { const j = getJob(state.modal.id); $("#overlay").innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="更新司机缺口"><h2>更新司机缺口</h2><p>件数待确认</p><form data-submit="delivery-gap"><label class="field"><span class="field-label">仍需要司机（人）</span><input name="drivers" type="number" min="0" max="${j.drivers}" value="${j.remainingDrivers}"/></label>${submit("保存缺口")}${btn("close-modal", "取消", "text-btn")}</form></section>`; return; }
    base.renderModal();
  };
  jobCard = j => !j.deliveryScene ? base.jobCard(j) : `<button class="support-job-card ex-job-card" data-action="job" data-id="${j.id}"><span class="top-inline"><span class="ex-tag">${j.deliveryScene === "warehouse" ? "仓库找司机" : "找人代送"}</span><span class="caption">${esc(arrival(j))}</span></span><div class="top-inline ex-job-title"><h3>${esc(j.region)}</h3><b class="quote">${money(j)}</b></div><span class="ex-job-facts">${qtyLabel(j, true)}${j.remainingDrivers ? ` · 需${j.remainingDrivers}人` : ""}</span><span class="meta">${I("warehouse")}取件 ${esc(j.pickup || "联系确认")} · 派送 ${esc(j.region)}</span><span class="meta">${esc(j.carrier)} · ${esc(j.publisher)}</span></button>`;
  function decorate(html, j) {
    if (!j?.deliveryScene) return html;
    html = html.replace(kindLabel(j.kind), j.deliveryScene === "warehouse" ? "仓库找司机" : "找人代送");
    if (j.quantityMode === "unknown") return html.replaceAll("null 件", "件数待确认").replaceAll("null件", "件数待确认");
    if (j.quantityMode === "estimate") return html.replaceAll(`>${j.qty} 件`, `>约 ${j.qty} 件`).replaceAll(`>${j.remaining}件`, `>约 ${j.remaining}件`);
    return html;
  }
  jobDetail = id => {
    const j = getJob(id); let html = decorate(base.jobDetail(id), j); if (!j?.deliveryScene) return html;
    html = html.replace(row("开始时间", `${j.date} · ${time12(j.start)}`), row("接手时间", arrival(j))).replace(row("有效截止", time12(j.end)), row("送完要求", completion(j)) + row("需求下架", `${j.endDate || j.date} ${time12(j.end)}`));
    html = html.replace(/<p class="ex-pickup-time">[\s\S]*?<\/p>/, `<p class="ex-pickup-time">${esc(arrival(j))}${j.pickupEnd ? "–" + time12(j.pickupEnd) : ""}</p>`);
    return html;
  };
  managePage = () => decorate(base.managePage(), getJob(state.route.args.id));
  applyPage = () => {
    const j = getJob(state.route.args.id); if (!j?.deliveryScene || !isOpen(j)) return base.applyPage();
    const f = (state.forms.apply ||= { date: j.date, arrival: j.start, capacity: j.partial || j.quantityMode !== "exact" ? "" : String(j.remaining), seenVersion: j.version });
    return `${jobDetail(j.id)}<div class="support-overlay"><section class="support-panel" role="dialog" aria-modal="true" aria-label="报名支援"><h2>报名支援</h2><div class="application-summary"><h3>${esc(j.region)}</h3><div class="quote">${money(j)}</div><p class="meta">${qtyLabel(j, true)}</p></div><form data-submit="apply" novalidate>${formError()}${field("apply", "date", "可到日期", "date")}${field("apply", "arrival", "预计到场", "time")}${field("apply", "capacity", j.partial ? "本次可接件数" : "整批件数", "number", { min: 1, optional: j.quantityMode !== "exact", disabled: !j.partial && j.quantityMode === "exact" })}${submit("提交报名")}${btn("back", "取消", "text-btn wide-link")}</form></section></div>`;
  };
  publicSummary = j => ({ ...base.publicSummary(j), ...(j.deliveryScene ? { deliveryScene: j.deliveryScene, quantityMode: j.quantityMode, asap: !!j.asap, completion: j.completion, endDate: j.endDate } : {}) });
  sharePage = () => decorate(base.sharePage(), getJob(state.route.args.id));
  publicPage = () => {
    const j = getJob(state.route.args.id) || getJob(model.shares.find(s => s.token === state.route.args.token)?.job) || storedShares()[state.route.args.token]?.summary;
    return decorate(base.publicPage(), j);
  };
  chatPage = () => {
    const c = model.chats.find(c => c.id === state.route.args.id), j = getJob(c?.source);
    let html = base.chatPage();
    if (j?.quantityMode === "estimate") html = html.replace(`${j.qty}件 · `, `约${j.qty}件 · `);
    return html;
  };
  render = () => {
    if (state.route.view === "helpForm") { state.forms.help = null; state.route = { view: "publish", args: {} }; }
    const f = state.route.view === "requestForm" ? state.forms.request : null;
    if (f) {
      f.customExpiry = f.expiryMode === "custom";
    }
    base.render();
    document.querySelectorAll(".circle-source[data-request-id]").forEach(n => {
      const j = getJob(n.dataset.requestId), facts = n.querySelector(".circle-source-facts");
      if (j?.deliveryScene && facts) facts.textContent = `${arrival(j)} · ${qtyLabel(j, true)}${j.remainingDrivers ? ` · 需${j.remainingDrivers}人` : ""}`;
    });
    if (state.route.view === "requestForm") {
      $("#active-product-form")?.classList.add("delivery-form");
      $("#screen-title").textContent = scenes[normalize(state.forms.request).scene];
    }
  };
  document.addEventListener("toggle", e => {
    if (state.route.view !== "requestForm" || !e.target.isConnected) return;
    if (e.target.matches(".delivery-options")) state.forms.request.moreOpen = e.target.open;
    if (e.target.matches("details.delivery-identity")) state.forms.request.identityOpen = e.target.open;
  }, true);
  document.addEventListener("input", e => {
    if (e.target.dataset.field === "pickupAddress" && state.forms.request) {
      const f = state.forms.request;
      f.pickup = "";
      if (f.autoPickupName && f.pickupName === f.autoPickupName) f.pickupName = "";
      f.autoPickupName = "";
      const mapAction = $("[data-delivery-map-action]");
      if (mapAction) mapAction.hidden = !f.pickupAddress.trim();
    }
  });
  document.addEventListener("change", e => {
    if (state.route.view !== "requestForm") return;
    const t = e.target, f = state.forms.request;
    if (t.dataset.deliveryField) {
      f[t.dataset.deliveryField] = t.type === "checkbox" ? t.checked : t.value;
      if (f.quantityMode === "unknown") { f.min = ""; }
      state.errors = {}; capture(); render(); return;
    }
    if (t.dataset.formKey !== "request") return;
    if (t.dataset.field === "date" && f.date !== today) f.asap = false;
    if (t.dataset.field === "customExpiry") { f.expiryMode = t.checked ? "custom" : "auto"; if (t.checked) { f.endDate ||= f.date; f.end ||= "23:59"; } }
    if (["customExpiry", "date", "taskScope", "completion"].includes(t.dataset.field)) { capture(); render(); }
  });
  resetPrototype = () => { ui.preview = null; ui.lastPublisher = false; $("#delivery-save-fail").checked = false; base.resetPrototype(); };
  $("#inspect-page option[value=helpForm]")?.remove(); delete screens.helpForm;
  screens.publish = ["P01", "发需求 · 两个场景"];
  screens.requestForm = ["P03", "配送需求发布/编辑"];
  for (const v of ["publish", "requestForm"]) { const o = $(`#inspect-page option[value="${v}"]`); if (o) o.textContent = screens[v].join(" · "); }
  window.abasongDelivery = { version: "3.2-r3-delivery", scenes, ui, normalize, qtyLabel };
  const task = new URLSearchParams(location.search).get("task");
  if (task === "delivery") nav("publish", {}, true); else render();
})();
