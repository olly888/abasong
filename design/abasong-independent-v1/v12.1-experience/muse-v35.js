"use strict";
// M1: opt-in, synthetic interaction prototype. No GPS, business API or credentials.
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("layout") !== "muse") return;
  const range = [200, 500, 1000].includes(Number(params.get("range"))) ? Number(params.get("range")) : 200;
  const coverage = params.get("coverage");
  const pagination = params.get("pagination");
  const paging = Object.fromEntries(["jobs", "people"].map(k => [k, {shown: 1, failed: false, busy: false, attempted: false, generation: 0}]));
  const rangeText = range === 1000 ? "1 km" : `${range} m`;
  const base = { home, render, renderModal, actions, nav, submitForm };
  const experience = window.abasongExperience;
  const modes = [["apartments", "key", "查码"], ["jobs", "car", "找活"], ["people", "users", "找人"]];
  const memory = Object.fromEntries(modes.map(([id]) => [id, { scroll: 0, selected: null }]));
  const ui = { scene: "normal", rowStatus: {}, returnId: null, ignoreScrollUntil: 0, generation: 0 };
  const positions = [[53, 53], [80, 62], [19, 75]];
  const regions = { Pasadena: [30, 52], Alhambra: [70, 72], "West Covina": [30, 87], "Los Angeles": [73, 50] };
  let scrollTimer, rendering = false;
  document.body.classList.add("muse-v35");
  document.title = "Abasong · V3.5 上图下列交互原型";
  screens.museApartment = ["H04", "公寓 · 门禁码详情"];
  model.apartments.forEach((a, i) => {
    a.distance = { meters: (range === 1000 ? [80, 450, 920] : range === 500 ? [80, 340, 480] : [80, 140, 190])[i], basis: "boundary", quality: "fresh" };
    a.codes.forEach(c => { if (!["行人门", "车库门", "大堂门"].includes(c.scope)) c.scope = "门别未确认"; });
  });
  // Consistent scene fixtures: the first two are warehouse pickup; the third is a handoff.
  model.jobs.forEach(j => {
    const warehouse = j.pickupLocation?.kind === "warehouse";
    j.deliveryScene = warehouse ? "warehouse" : "rescue";
    j.kind = warehouse ? "extra_drivers" : "partial_route";
    if (warehouse) { j.drivers ||= 2; j.remainingDrivers ||= 2; }
    j.quantityMode ||= "exact";
  });
  function selected(mode = state.homeView) {
    return mode === "apartments" ? state.apt : mode === "jobs" ? state.selectedJob : state.selectedDriver;
  }
  function setSelected(id, mode = state.homeView) {
    state[mode === "apartments" ? "apt" : mode === "jobs" ? "selectedJob" : "selectedDriver"] = id;
    memory[mode].selected = id;
    if (mode === "apartments") experience.state.reading = true;
  }
  function remember() {
    const list = $(".m35-results");
    if (list) memory[list.dataset.mode].scroll = list.scrollTop;
  }
  function apartmentRows() {
    if (["street", "house", "nearby-error", "denied"].includes(state.scenario)) return [];
    if (state.temporaryDestination) return [];
    return model.apartments;
  }
  function allSupportRows() { return state.homeView === "jobs" ? supportJobs() : supportDrivers(); }
  function rows() { return state.homeView === "apartments" ? apartmentRows() : pagination && pagination !== "limit" ? allSupportRows().slice(0, paging[state.homeView].shown) : allSupportRows(); }
  function resetPages() { const p = paging[state.homeView]; if (p) { p.generation++; p.shown = 1; p.failed = p.busy = p.attempted = false; } }
  function pageFooter() {
    if (!pagination) return "";
    const p = paging[state.homeView];
    if (pagination === "limit") return '<p class="m35-range-note">结果较多，请缩小筛选范围</p>';
    if (p.shown >= allSupportRows().length) return "";
    return `<div class="m35-pagination">${p.failed ? '<p class="m35-range-note" role="status">加载更多失败，已加载内容保留</p>' : ""}${btn("m35-more", p.busy ? "正在加载…" : p.failed ? "重试加载更多" : "加载更多", "button secondary", p.busy ? "disabled" : "")}</div>`;
  }
  function permission() { return !state.logged ? "guest" : !state.qualified ? "unqualified" : "ready"; }
  function rowState(id) {
    if (permission() !== "ready") return permission();
    if (ui.scene === "paused" && id === "a1") return "paused";
    if (ui.rowStatus[id]) return ui.rowStatus[id];
    return state.scenario === "offline" && id === "a1" ? "error" : "ready";
  }
  function city(a) { return String(a.address).split(",")[1]?.trim() || ""; }
  function distance(a) {
    const quality = $("#distance-quality")?.value;
    if (state.scenario === "denied" || quality === "stale" || !Number.isFinite(a.distance?.meters)) return "";
    return `<span class="m35-distance">${quality === "approximate" ? "约 " : ""}${Math.round(a.distance.meters)} m</span>`;
  }
  function codes(a) { return state.scenario === "empty" && a.id === "a1" ? [] : rankCodes(a); }
  function inline(action, label, id) { return btn(action, label, "m35-inline", `data-id="${esc(id)}"`); }
  function cardTop(a) { return `<div class="m35-card-head"><h3>${addressHTML(a.address)}</h3>${distance(a)}</div><p class="m35-city">${esc(city(a))}</p>`; }
  function apartmentContent(a) {
    const status = rowState(a.id), list = codes(a), c = list[0];
    if (status === "loading") return '<div class="m35-info m35-muted" role="status">正在读取门禁码…</div>';
    if (status === "error") return `<div class="m35-card-actions" role="status"><span>门禁码暂时无法读取</span>${inline("m35-retry-code", "重试", a.id)}</div>`;
    if (status === "paused") return '<div class="m35-info m35-muted">此公寓暂不提供共享门禁码</div>';
    if (status === "guest" || status === "unqualified") return `<div class="m35-card-actions"><span>${status === "guest" ? "登录后查看门禁码" : "暂无资料查看资格"}</span>${status === "guest" ? inline("login", "登录", a.id) : ""}</div>`;
    if (!c) return `<div class="m35-card-actions"><span>暂无共享门禁码</span>${inline("m35-add", "+ 添加门禁码", a.id)}</div>`;
    return `<div class="m35-info m35-code-strip"><strong class="m35-code">${esc(c.value)}</strong><span class="m35-door">${esc(c.scope)}</span></div><div class="m35-footer"><span class="m35-source">${esc(contributionLabel(c))}</span><span class="m35-more">${list.length} 条${I("chevron")}</span></div>`;
  }
  function cardLink(id, label) { return `<button class="m35-card-hit" data-action="m35-open" data-id="${esc(id)}" aria-label="${esc(label)}"${selected() === id ? ' aria-current="true"' : ""}></button>`; }
  function apartmentCard(a) { return `<article class="m35-card m35-apartment ${selected() === a.id ? "selected" : ""}" data-row="${a.id}" role="group" aria-label="${esc(a.address)}">${cardLink(a.id, `查看 ${a.address} 门禁信息`)}${cardTop(a)}${apartmentContent(a)}</article>`; }
  const day = value => value === experience.demoDay ? "今天" : value === "2026-11-05" ? "明天" : value;
  function jobCard35(j) {
    const warehouse = j.pickupLocation?.kind === "warehouse";
    const qty = j.quantityMode === "unknown" || j.remaining == null ? "件数待确认" : `${j.quantityMode === "estimate" ? "约 " : ""}${j.remaining} 件`;
    const arrival = j.asap ? (warehouse ? "尽快到仓" : "尽快接手") : `${time12(j.start)}${warehouse ? " 到仓" : " 接手"}`;
    const numericPrice = j.unit !== "negotiable" && j.price != null;
    return `<article class="m35-card m35-job ${selected() === j.id ? "selected" : ""}" data-row="${j.id}" role="group" aria-label="${esc(j.region)} 配送需求">${cardLink(j.id, `查看 ${j.region} 配送需求`)}<div class="m35-job-top"><span>${warehouse ? "仓库找司机" : "途中找人代送"}</span><span>${esc(j.carrier)}</span></div><div class="m35-card-head"><h3>${esc(j.region)}</h3></div><div class="m35-info m35-offer-strip"><strong class="m35-price ${numericPrice ? "numeric" : ""}">${money(j)}</strong><span class="m35-quantity">${qty}${warehouse ? `<small>还需 ${j.remainingDrivers} 人</small>` : ""}</span></div><div class="m35-job-facts">${esc(day(j.date))} ${arrival}</div><div class="m35-footer"><span>${warehouse ? "仓库取件 · " + esc(j.pickup) : "途中交接 · 地点联系确认"}</span>${I("chevron")}</div></article>`;
  }
  function driverCard35(d) {
    const future = experience.laInstant(d.startDay, d.startTime) > experience.state.now;
    const time = `${day(d.startDay)} ${time12(d.startTime)}–${d.endDay && d.endDay !== d.startDay ? day(d.endDay) + " " : ""}${time12(d.endTime)}`;
    return `<article class="m35-card m35-driver ${selected() === d.id ? "selected" : ""}" data-row="${d.id}" role="group" aria-label="司机 ${esc(d.name)}">${cardLink(d.id, `查看司机 ${d.name}`)}<div class="m35-driver-head"><span class="m35-avatar">${esc(d.name[0])}</span><h3>${esc(d.name)}</h3><span class="m35-available ${future ? "future" : ""}">${future ? "待开始" : "可接活"}</span></div><div class="m35-info m35-driver-time"><strong>${esc(time)}</strong></div><div class="m35-job-facts">${esc(d.region)}<br>${d.capacity == null ? "可接件数联系确认" : `可接 ${d.capacity} 件`}${d.vehicle ? ` · ${esc(d.vehicle)}` : ""}</div><div class="m35-footer"><span>${esc(d.carrier || "配送经验未填写")}${d.carrier ? " · 自报" : ""}</span>${I("chevron")}</div></article>`;
  }
  function emptyState(title, text, action, label, icon = "search") {
    return `<section class="m35-state" role="status"><span>${I(icon)}</span><h3>${title}</h3>${text ? `<p>${text}</p>` : ""}${action ? btn(action, label, "button secondary") : ""}</section>`;
  }
  function resultContent(items) {
    if (state.homeView !== "apartments") {
      const status = experience.state.status[state.homeView], filter = supportFilter();
      if (status === "loading") return emptyState("正在查找…", "", "", "", "clock");
      if (status === "error") return emptyState("暂时无法加载", "请重试，当前筛选条件已保留", "m35-retry-support", "重新加载", "refresh");
      if (status === "empty" || !items.length) {
        const filtered = Object.values(filter).some(Boolean);
        return emptyState(filtered ? "没有符合筛选的结果" : state.homeView === "jobs" ? "暂无开放配送需求" : "暂无可接活司机", "", filtered ? "clear-support-filters" : state.homeView === "jobs" ? "availability" : "publish", filtered ? "清除筛选" : state.homeView === "jobs" ? "设置接活状态" : "发布需求");
      }
      return items.map(state.homeView === "jobs" ? jobCard35 : driverCard35).join("") + pageFooter();
    }
    if (state.temporaryDestination) {
      const a = state.temporaryDestination;
      return `<section class="m35-card">${cardTop({ address: a.address || a.label || a.name })}<div class="m35-muted">暂未匹配到公寓资料</div>${inline("add-unknown-code", "确认地址并添加门禁码", "")}</section>`;
    }
    if (state.scenario === "nearby-error") return emptyState("公寓资料暂时无法加载", "", "m35-retry-nearby", "重新加载", "refresh");
    if (state.scenario === "denied") return emptyState("开启位置，查看附近公寓", "也可以直接搜索配送地址", "search", "搜索地址", "pin");
    if (!items.length && coverage === "partial") return emptyState("部分范围待补全", "", "search", "搜索地址", "pin");
    if (!items.length && coverage === "unavailable") return emptyState("公寓资料暂时无法加载", "", "m35-retry-nearby", "重新加载", "refresh");
    if (!items.length) return emptyState("附近未匹配到公寓", "可搜索地址，或共享你知道的门禁码", "search", "搜索地址", "pin");
    return items.map(apartmentCard).join("");
  }
  function mapArt() {
    if (state.homeView !== "apartments") return `<svg viewBox="0 0 390 340" preserveAspectRatio="none" aria-hidden="true"><rect width="390" height="340" fill="#e8eef6"/><path d="M0 0H390V120L320 140 220 110 90 150 0 110Z" fill="#dce7df"/><path d="M-20 300 410 120M-20 125 410 300M100 0 200 360M320 0 240 360" stroke="#fff" stroke-width="9"/><path d="M0 230H390M0 180H390M40 110V340M150 90V340M350 90V340" stroke="#f7f9fc" stroke-width="3"/><path d="M15 150 170 130 220 215 110 245 10 222Z" fill="#1769ff0c" stroke="#a8bbd5" stroke-dasharray="4 4"/><path d="M225 147 385 151 375 280 255 260 210 215Z" fill="#1769ff08" stroke="#a8bbd5" stroke-dasharray="4 4"/><text x="135" y="277" fill="#7588a3" font-size="11">服务区域示意</text></svg>`;
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="none" aria-hidden="true"><rect width="390" height="340" fill="#e9eef5"/><path d="M0 144H390M0 280H390M108 0V340M289 0V340" stroke="#fff" stroke-width="15"/><path d="M0 327 390 100" stroke="#fff" stroke-width="19"/><path d="M0 327 390 100" stroke="#b5cce9" stroke-width="2" stroke-dasharray="10 8"/><path d="M0 50H390M0 95H390M0 197H390M42 0V340M230 0V340M356 0V340" stroke="#f8faff" stroke-width="6"/><g fill="#dce4ee"><rect x="10" y="212" width="70" height="52" rx="5"/><rect x="128" y="158" width="80" height="46" rx="5"/><rect x="308" y="159" width="63" height="43" rx="5"/><rect x="122" y="292" width="76" height="36" rx="5"/></g><rect x="302" y="290" width="77" height="35" rx="8" fill="#d4e7d9"/><text x="312" y="310" fill="#689075" font-size="9">社区绿地</text><g><path data-building="a1" d="M179 211h58v31h-20v15h-38z"/><rect data-building="a2" x="302" y="232" width="69" height="33" rx="3"/><rect data-building="a3" x="45" y="280" width="44" height="44" rx="3"/><text class="m35-roof" data-roof="a1" x="184" y="233">1200</text><text class="m35-roof" data-roof="a2" x="320" y="253">1228</text><text class="m35-roof" data-roof="a3" x="50" y="315">1185</text></g><g fill="#8794a8" font-size="10" font-family="-apple-system,sans-serif"><text x="11" y="137">W Pine Ave</text><text x="230" y="274">W Olive Ave</text><text x="100" y="327" transform="rotate(-90 100 327)">S Grove St</text></g></svg>`;
  }
  function selectedRegions() {
    if (state.homeView === "apartments") return [];
    const r = rows().find(v => v.id === selected());
    return r ? (r.regions || [r.region]) : [];
  }
  function mapPins(items) {
    if (state.homeView === "apartments") return items.map((a, i) => {
      const p = positions[i % positions.length];
      return `<button class="m35-map-pin ${a.id === selected() ? "selected" : ""}" style="left:${p[0]}%;top:${p[1]}%" data-action="m35-select" data-id="${a.id}" aria-label="在列表查看 ${esc(streetPart(a.address))}">${I(rowState(a.id) === "ready" && codes(a).length ? "key" : "pin")}<span>${$("#distance-quality")?.value === "stale" || !a.distance ? esc(streetPart(a.address).split(" ")[0]) : (($("#distance-quality")?.value === "approximate" ? "约 " : "") + a.distance.meters + " m")}</span></button>`;
    }).join("");
    if (experience.state.status[state.homeView] !== "ready") return "";
    const counts = new Map();
    items.forEach(r => (r.regions || [r.region]).forEach(region => counts.set(region, (counts.get(region) || 0) + 1)));
    return [...counts].map(([region, count], i) => { const p = regions[region] || positions[i % 3]; return `<button class="m35-map-pin m35-region ${selectedRegions().includes(region) ? "selected" : ""}" style="left:${p[0]}%;top:${p[1]}%" data-action="ex-region" data-id="${esc(region)}" aria-label="筛选 ${esc(region)}"><span>${esc(region)}</span><b>${count}</b></button>`; }).join("");
  }
  function map(items) {
    const c = experience.state.contexts[state.homeView];
    const unread = model.chats.some(x => x.unread) || model.notifications.some(x => !x.read);
    const point = ["house-nearby", "house"].includes(ui.scene) ? ' style="left:40%;top:89%"' : state.scenario === "street" ? ' style="left:28%;top:82%"' : "";
    return `<section class="m35-map" aria-label="${state.homeView === "apartments" ? "公寓" : "服务区域"}示意地图"><div class="m35-map-surface"><div class="m35-map-world" style="transform:translate(${c.x}px,${c.y}px) scale(${c.zoom})">${mapArt()}${mapPins(items)}${state.scenario !== "denied" ? `<span class="m35-position"${point} role="img" aria-label="合成当前位置"></span>` : ""}</div></div><header class="m35-header"><div class="m35-brand-row"><img src="../assets/brand/abasong_wordmark_primary.svg" alt="Abasong"/><button class="icon-btn" data-action="inbox" aria-label="消息">${I("chat")}${unread ? '<i class="m35-unread"></i>' : ""}</button></div><button class="m35-search" data-action="search">${I("search")}<span>${state.homeView === "apartments" ? "搜索公寓或配送地址" : state.homeView === "people" ? "搜索区域或配送经验" : "搜索区域或快递公司"}</span></button></header><div class="m35-scale"><span>${state.homeView === "apartments" ? Math.round(50 / c.zoom) + " m" : "1 km"}</span></div><span class="m35-map-credit">示意地图</span><button class="m35-locate" data-action="m35-locate" aria-label="回到当前位置">${I("locate")}</button></section>`;
  }
  home = () => {
    const items = rows(), mode = state.homeView;
    if (items.length && !items.some(r => r.id === selected())) setSelected(items[0].id);
    const status = mode === "apartments" ? (items.length ? "ready" : "empty") : experience.state.status[mode];
    const count = status === "ready" ? items.length : 0;
    const title = mode === "apartments" ? (state.temporaryDestination ? "搜索地址" : `附近公寓 · ${rangeText}`) : mode === "jobs" ? "配送需求" : "可接活司机";
    const action = mode === "apartments" ? "lib-contribute" : "publish";
    const label = mode === "apartments" ? "共享门禁码" : "发需求";
    const filter = mode !== "apartments" ? supportFilter() : null;
    const activeFilters = filter ? [filter.region, filter.day ? day(filter.day) : "", filter.text, filter.kind === "extra_drivers" ? "仓库找司机" : filter.kind === "partial_route" ? "途中代送" : ""].filter(Boolean) : [];
    return `<div class="root-content"><div class="m35-home">${map(items)}<section class="m35-panel" aria-label="附近结果"><div class="m35-tabs" role="tablist" aria-label="首页内容">${modes.map(([id, icon, name]) => `<button class="${mode === id ? "active" : ""}" role="tab" aria-selected="${mode === id}" data-action="m35-mode" data-id="${id}">${I(icon)}${name}</button>`).join("")}</div><div class="m35-section"><h2>${title}${count ? `<small>${count} ${mode === "apartments" ? "处 · 按距离" : mode === "jobs" ? "条" : "位"}</small>` : ""}</h2><div class="m35-section-actions">${filter ? `<button class="m35-filter-control ${activeFilters.length ? "filtered" : ""}" data-action="search" aria-label="筛选${activeFilters.length ? "，已设置 " + activeFilters.length + " 项" : ""}">${I("filter")}<span>筛选</span></button>` : ""}${btn(action, I("plus") + label)}</div></div><div class="m35-results" data-mode="${mode}">${mode === "apartments" && items.length && ["partial", "unavailable"].includes(coverage) ? `<div class="m35-range-note">${coverage === "partial" ? "部分范围待补全" : "更新失败"}</div>` : ""}${activeFilters.length ? `<div class="m35-filter-summary"><span>${esc(activeFilters.join(" · "))}</span>${ib("clear-support-filters", "close", "清除筛选")}</div>` : ""}${resultContent(items)}</div></section></div></div>${bottomNav("home")}`;
  };
  function detail() {
    const a = getApt(), available = rowState(a.id) === "ready";
    return page("公寓门禁信息", `<div class="m35-detail-heading">${addressHTML(a.address, true)}<p>${esc(String(a.address).split(",").slice(1).join(",").trim())}</p><p>${esc(a.name || "")}</p></div>${available ? `<div class="m35-detail-actions">${btn("m35-add", I("plus") + " 添加门禁码", "button", `data-id="${a.id}"`)}</div>` : ""}${available && codes(a).length ? codes(a).map(c => `<article class="m35-record"><div class="m35-record-top"><span class="m35-door">${esc(c.scope)}</span>${c.mine ? '<span class="m35-muted">我共享的</span>' : ""}</div><div class="m35-code" style="margin-top:12px">${esc(c.value)}</div><div class="m35-source">${esc(contributionLabel(c))}</div><div class="m35-feedback">${btn("vote", "有用", "", `data-id="${c.id}" data-vote="useful" aria-pressed="${c.vote === "useful"}"`)}${btn("vote", "不能用", "", `data-id="${c.id}" data-vote="not_useful" aria-pressed="${c.vote === "not_useful"}"`)}${c.mine ? btn("lib-correct", "纠正", "", `data-id="${c.id}"`) : ""}</div></article>`).join("") : apartmentContent(a)}`);
  }
  function syncFocus() {
    const mode = state.homeView, id = selected(), area = selectedRegions();
    const apartmentVisible = mode === "apartments" && apartmentRows().some(a => a.id === id);
    document.querySelectorAll(".m35-card[data-row]").forEach(n => {
      const active = n.dataset.row === id;
      n.classList.toggle("selected", active);
      const hit = n.querySelector(".m35-card-hit");
      if (active) hit?.setAttribute("aria-current", "true"); else hit?.removeAttribute("aria-current");
    });
    document.querySelectorAll(".m35-map-pin").forEach(n => n.classList.toggle("selected", mode === "apartments" ? n.dataset.id === id : area.includes(n.dataset.id)));
    document.querySelectorAll("[data-building],[data-roof]").forEach(n => n.classList.toggle("selected", apartmentVisible && (n.dataset.building || n.dataset.roof) === id));
  }
  function focusItem(id) {
    setSelected(id); ui.ignoreScrollUntil = performance.now() + 350;
    const list = $(".m35-results"), row = [...document.querySelectorAll("[data-row]")].find(n => n.dataset.row === id);
    if (row && list) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - 4;
    remember(); syncFocus();
  }
  function bind() {
    const list = $(".m35-results");
    if (!list) return;
    list.scrollTop = memory[list.dataset.mode].scroll;
    list.addEventListener("scroll", () => {
      remember(); clearTimeout(scrollTimer);
      if (performance.now() < ui.ignoreScrollUntil) return;
      scrollTimer = setTimeout(() => {
        if (!list.isConnected || state.route.view !== "home" || state.modal) return;
        const cards = [...list.querySelectorAll("[data-row]")], box = list.getBoundingClientRect();
        const visible = cards.filter(n => n.getBoundingClientRect().bottom > box.top + 45 && n.getBoundingClientRect().top < box.bottom);
        const line = box.top + (box.height * .42);
        const nearest = visible.find(n => { const r = n.getBoundingClientRect(); return r.top <= line && r.bottom >= line; }) || visible.sort((a, b) => Math.abs(a.getBoundingClientRect().top - line) - Math.abs(b.getBoundingClientRect().top - line))[0];
        if (nearest) { setSelected(nearest.dataset.row); syncFocus(); }
      }, 130);
    }, { passive: true });
    const surface = $(".m35-map-surface"), c = experience.state.contexts[state.homeView];
    let pointer;
    const paint = () => { $(".m35-map-world").style.transform = `translate(${c.x}px,${c.y}px) scale(${c.zoom})`; const scale = $(".m35-scale span"); if (scale && state.homeView === "apartments") scale.textContent = Math.round(50 / c.zoom) + " m"; };
    surface.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; pointer = { x: e.clientX, y: e.clientY, dx: c.x, dy: c.y }; surface.setPointerCapture(e.pointerId); });
    surface.addEventListener("pointermove", e => { if (!pointer) return; c.x = pointer.dx + e.clientX - pointer.x; c.y = pointer.dy + e.clientY - pointer.y; paint(); });
    const stop = () => { pointer = null; };
    surface.addEventListener("pointerup", stop); surface.addEventListener("pointercancel", stop);
    surface.addEventListener("wheel", e => { e.preventDefault(); c.zoom = Math.max(.8, Math.min(2.5, c.zoom - e.deltaY * .002)); paint(); }, { passive: false });
    syncFocus();
  }
  renderModal = () => {
    base.renderModal();
    if (state.modal?.type === "support-filter" && state.homeView === "jobs") {
      const kind = $('#overlay select[name="kind"]');
      if (kind) { const value = kind.value; kind.innerHTML = '<option value="">全部需求</option><option value="extra_drivers">仓库找司机</option><option value="partial_route">途中找人代送</option>'; kind.value = value; }
    }
  };
  render = () => {
    // Replacing a focused search field can fire change/blur synchronously. Do not
    // replace the same subtree again while its current render is in progress.
    if (rendering) return;
    rendering = true;
    try {
      remember(); base.render();
      if (state.route.view === "museApartment") { $("#app").innerHTML = detail(); renderModal(); }
      if (state.route.view === "home") {
        bind();
        if (ui.returnId && state.homeView === "apartments") { focusItem(ui.returnId); ui.returnId = null; }
        $("#screen-title").textContent = "首页 · " + modes.find(x => x[0] === state.homeView)[2];
      }
    } finally { rendering = false; }
  };
  nav = (view, args, replace) => { remember(); base.nav(view, args, replace); };
  actions = (action, button) => {
    const id = button?.dataset.id;
    remember();
    if (action === "m35-more") {
      const mode = state.homeView, p = paging[mode], generation = p.generation;
      if (p.busy) return;
      p.busy = true; render();
      setTimeout(() => {
        if (generation !== p.generation) return;
        p.busy = false;
        if (pagination === "retry" && !p.attempted) { p.attempted = p.failed = true; }
        else { p.failed = false; p.shown++; }
        render();
      }, pagination === "slow" ? 2500 : 500);
      return;
    }
    if (action === "m35-mode") { clearTimeout(scrollTimer); state.homeList = false; base.actions("map-view", { dataset: { id } }); return; }
    if (action === "m35-select") { focusItem(id); return; }
    if (action === "m35-open") {
      setSelected(id);
      if (state.homeView === "apartments") nav("museApartment", { id });
      else base.actions(state.homeView === "jobs" ? "job" : "driver", button);
      return;
    }
    if (action === "m35-add") { setSelected(id, "apartments"); ui.returnId = id; base.actions("add-code", button); return; }
    if (action === "m35-locate") {
      if (state.scenario === "denied") { toast("原型演示：可在左侧切换定位状态"); return; }
      Object.assign(experience.state.contexts[state.homeView], { x: 0, y: 0, zoom: 1 });
      if (state.homeView === "apartments") { state.temporaryDestination = null; ui.returnId = apartmentRows()[0]?.id; if (ui.returnId) setSelected(ui.returnId); }
      render(); return;
    }
    if (action === "m35-retry-code") {
      const generation = ui.generation;
      ui.rowStatus[id] = "loading"; render();
      setTimeout(() => { if (generation !== ui.generation) return; ui.rowStatus[id] = "ready"; render(); }, 650); return;
    }
    if (action === "m35-retry-nearby") { state.scenario = "normal"; $("#scenario").value = "normal"; render(); return; }
    if (action === "m35-retry-support") { $("#support-scenario").value = "ready"; experience.querySupport(); return; }
    if (["choose-apt", "select-apt", "ex-apt"].includes(action)) ui.returnId = id;
    if (action === "ex-region" || action === "clear-support-filters") { resetPages(); memory[state.homeView].scroll = 0; if ($(".m35-results")) $(".m35-results").scrollTop = 0; }
    base.actions(action, button);
  };
  submitForm = (type, form) => {
    if (type === "supportFilter") resetPages();
    if (type === "supportFilter" && $(".m35-results")) $(".m35-results").scrollTop = 0;
    if (type === "code" && ui.scene === "paused" && state.forms.code?.targetId === "a1") return fail({ _: "此公寓暂不接受共享，请稍后再试" });
    base.submitForm(type, form);
    if (type === "code" && !state.forms.code && state.route.view === "home") {
      state.expanded = false; ui.rowStatus[state.apt] = "ready"; ui.returnId = state.apt; render();
    }
  };
  function scene(value) {
    ui.generation++; ui.scene = value; ui.rowStatus = {}; ui.returnId = null;
    state.scenario = ["house-nearby", "paused", "one-error", "slow", "large"].includes(value) ? "normal" : value;
    if (value === "one-error") ui.rowStatus.a2 = "error";
    if (value === "slow") { const generation = ui.generation; ui.rowStatus.a1 = "loading"; setTimeout(() => { if (generation !== ui.generation) return; ui.rowStatus.a1 = "ready"; render(); }, 2500); }
    state.logged = value !== "guest"; state.qualified = value !== "unqualified";
    state.homeView = "apartments"; state.route = { view: "home", args: {} }; state.stack = []; state.modal = null; state.temporaryDestination = null;
    state.apt = "a1"; memory.apartments.scroll = 0;
    document.body.classList.toggle("m35-large-type", value === "large");
    render();
  }
  $(".left .version").innerHTML = '<span class="m35-lab-tag">V3.5 · M1.1 细节优化</span>';
  $(".left h1").innerHTML = "地址更清楚，<br>协作更简单。";
  const firstReview = $(".right .review-rule")?.previousElementSibling;
  if (firstReview) firstReview.textContent = "上下分区：上方地图定位，下方纵向浏览。查码、找活、找人共享统一结构。";
  document.querySelectorAll(".right p").forEach(p => { if (p.textContent.includes("横滑公寓卡")) p.textContent = "上下滚动卡片 → 点卡看详情 → 返回原位置。点地图标记会滚到对应卡片，切换模式保留筛选和浏览位置。"; });
  $("#scenario").insertAdjacentHTML("beforeend", '<option value="house-nearby">人在 house，附近仍有公寓</option><option value="one-error">第二张读取失败，其他正常</option><option value="slow">第一张慢响应</option><option value="paused">第一处共享暂停</option><option value="large">大字号压力检查</option>');
  $("#scenario").addEventListener("change", e => scene(e.target.value));
  const reviewLink = document.querySelector('a[href="review.html"]');
  if (reviewLink) { reviewLink.href = "muse-v35-review.html"; reviewLink.textContent = "M1 体验与验收记录"; }
  $("#inspect-page").insertAdjacentHTML("beforeend", '<option value="museApartment">H04 · 公寓门禁信息</option>');
  window.abasongMuse = { version: "3.5-M1.1", memory, ui, scene, focusItem, selected, remember };
  if (params.get("scene")) scene(params.get("scene")); else render();
})();
