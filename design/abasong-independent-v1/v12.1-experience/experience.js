"use strict";
/* V3.2 proposal: local fixtures only. No business API, GPS, OCR or messages. */
(() => {
  const TODAY = "2026-11-04",
    TOMORROW = "2026-11-05";
  const base = {
    render,
    actions,
    renderModal,
    submitForm,
    jobDetail,
    requestForm,
    jobFromForm,
    draftFromJob,
    defaultDraft,
    resetPrototype,
    nav,
    availabilityPage,
  };
  const ex = {
    now: Date.parse(TODAY + "T14:20:00-08:00"),
    status: { jobs: "ready", people: "ready" },
    generation: { jobs: 0, people: 0 },
    contexts: {
      apartments: { x: 0, y: 0, zoom: 1 },
      jobs: { x: 0, y: 0, zoom: 1 },
      people: { x: 0, y: 0, zoom: 1 },
    },
    lists: { jobs: false, people: false },
    listScroll: { jobs: 0, people: 0 },
    reading: false,
    readGeneration: 0,
    code: { id: null, status: "loading" },
    dragEnded: 0,
    placeCamera: { x: 0, y: 0, zoom: 1 },
    placeKey: null,
  };
  const warehouses = [
    {
      id: "w1",
      label: "南区取件仓",
      address: "5685 Alcoa Ave, Los Angeles, CA 90058",
      region: "Los Angeles",
      street: "Alcoa Ave",
    },
    {
      id: "w2",
      label: "中区取件仓",
      address: "1311 Wholesale St, Los Angeles, CA 90021",
      region: "Los Angeles",
      street: "Wholesale St",
    },
  ];
  for (const r of ["Los Angeles", "Ontario"])
    if (!areas.includes(r)) areas.push(r);
  iconPaths.filter = '<path d="M3 6h18M6 12h12M9 18h6"/>';
  iconPaths.copy =
    '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>';
  iconPaths.warehouse =
    '<path d="m3 9 9-6 9 6v12H3zM8 21V11h8v10M8 15h8M8 18h8"/>';
  const camera = () => ex.contexts[state.homeView];
  const isSupport = () => ["jobs", "people"].includes(state.homeView);
  function laInstant(day, time = "00:00") {
    const wanted = Date.parse(`${day}T${time}:00Z`);
    if (!Number.isFinite(wanted)) return NaN;
    let value = wanted;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(
        fmt.formatToParts(value).map((x) => [x.type, x.value]),
      );
      value +=
        wanted -
        Date.parse(
          `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
        );
    }
    return value;
  }
  function dayAfter(day) {
    return new Date(Date.parse(day + "T12:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const dayLabel = (day) =>
    day === TODAY ? "今天" : day === TOMORROW ? "明天" : day;
  const regionsOf = (d) => d.regions || String(d.region).split(/\s*\/\s*/);
  function driverTime(d) {
    return `${dayLabel(d.startDay || TODAY)} ${time12(d.startTime || "15:00")}–${d.endDay && d.endDay !== (d.startDay || TODAY) ? dayLabel(d.endDay) + " " : ""}${time12(d.endTime || "18:30")} 可接活`;
  }
  function seed() {
    // Synthetic distances share the discovery origin; these are not live GPS readings.
    model.apartments.forEach((a, i) => {
      a.distance = {
        meters: [12, 37, 55][i],
        basis: "boundary",
        quality: "fresh",
      };
    });
    Object.assign(model.apartments[0].codes[0], { value: "*0128#", time: 10 });
    Object.assign(model.apartments[0].codes[1], { value: "#105682", time: 12 });
    model.apartments[1].codes[0].value = "07412*";
    Object.assign(model.jobs[0], {
      pickup: "Los Angeles",
      pickupLocation: { ...warehouses[0], kind: "warehouse" },
      pickupEnd: "16:30",
    });
    Object.assign(model.jobs[1], {
      pickup: "Los Angeles",
      pickupLocation: { ...warehouses[1], kind: "warehouse" },
      pickupEnd: "16:00",
    });
    Object.assign(model.jobs[2], {
      pickupLocation: { kind: "contact_handoff" },
      pickupEnd: "",
    });
    model.jobs.push({
      ...structuredClone(model.jobs[0]),
      id: "j4",
      owner: "d2",
      publisher: "Mia",
      carrier: "SpeedX",
      region: "Alhambra",
      qty: 120,
      remaining: 120,
      date: TOMORROW,
      endDate: TOMORROW,
      start: "07:00",
      end: "10:00",
      pickupEnd: "09:30",
      pickupLocation: { ...warehouses[1], kind: "warehouse" },
    });
    model.jobs.push({
      ...structuredClone(model.jobs[0]),
      id: "j5",
      qty: 80,
      remaining: 80,
      price: 195,
      min: 30,
      start: "16:00",
      pickupEnd: "17:00",
      pickupLocation: { ...warehouses[1], kind: "warehouse" },
    });
    for (const d of model.drivers)
      Object.assign(d, {
        startDay: TODAY,
        endDay: TODAY,
        startTime: "15:00",
        endTime: "18:30",
        regions: regionsOf(d),
      });
    model.drivers[0].regions = ["Pasadena", "Alhambra"];
    model.drivers[0].region = "Pasadena / Alhambra";
    model.drivers.push({
      id: "d4",
      name: "阿峰",
      carrier: "GOFO",
      region: "West Covina",
      regions: ["West Covina"],
      startDay: TOMORROW,
      endDay: TOMORROW,
      startTime: "07:00",
      endTime: "12:00",
      capacity: null,
      available: true,
      vehicle: "SUV",
      bio: "熟悉东区，具体件数可联系商量。",
    });
  }
  seed();
  isOpen = (j) =>
    !!j &&
    j.status === "open" &&
    laInstant(j.endDate || j.date, j.end || "23:59") > ex.now;
  supportJobs = () => {
    const f = supportFilter();
    return model.jobs.filter(
      (j) =>
        isOpen(j) &&
        (!f.region || j.region === f.region) &&
        (!f.day || j.date === f.day) &&
        (!f.kind || j.kind === f.kind) &&
        (!f.text ||
          `${j.region} ${j.pickup} ${j.carrier} ${j.route}`
            .toLowerCase()
            .includes(f.text.toLowerCase())) &&
        !model.blocks.includes(j.owner),
    );
  };
  supportDrivers = () => {
    const f = supportFilter();
    return model.drivers.filter((d) => {
      if (!d.available || model.blocks.includes(d.id)) return false;
      const start = laInstant(d.startDay || TODAY, d.startTime || "15:00"),
        end = laInstant(d.endDay || d.startDay || TODAY, d.endTime || "18:30");
      return (
        end > ex.now &&
        (!f.day ||
          (start < laInstant(dayAfter(f.day)) && end > laInstant(f.day))) &&
        (!f.region || regionsOf(d).includes(f.region)) &&
        (!f.text || d.carrier.toLowerCase().includes(f.text.toLowerCase()))
      );
    });
  };
  function results() {
    return state.homeView === "jobs" ? supportJobs() : supportDrivers();
  }
  function selectedResult() {
    const rs = results(),
      key = state.homeView === "jobs" ? "selectedJob" : "selectedDriver";
    const item = rs.find((r) => r.id === state[key]) || rs[0];
    state[key] = item?.id || null;
    return item;
  }
  function querySupport(mode = state.homeView) {
    if (!["jobs", "people"].includes(mode)) return;
    const generation = ++ex.generation[mode],
      scenario = $("#support-scenario").value;
    ex.status[mode] = "loading";
    render();
    setTimeout(
      () => {
        if (generation !== ex.generation[mode]) return;
        ex.status[mode] =
          scenario === "error"
            ? "error"
            : scenario === "empty"
              ? "empty"
              : "ready";
        if (state.homeView === mode) render();
      },
      scenario === "slow" ? 2000 : 100,
    );
  }
  function readCode(id, { retry = false } = {}) {
    const generation = ++ex.readGeneration;
    ex.code = { id, status: "loading" };
    setTimeout(() => {
      if (
        generation !== ex.readGeneration ||
        state.apt !== id ||
        state.homeView !== "apartments"
      )
        return;
      ex.code = {
        id,
        status: state.scenario === "offline" && !retry ? "error" : "ready",
      };
      render();
    }, 120);
  }
  function setApt(id, manual = true) {
    state.apt = id;
    state.temporaryDestination = null;
    state.expanded = false;
    ex.reading = manual;
    if (["street", "house", "commercial"].includes(state.scenario))
      state.scenario = "normal";
    readCode(id);
    render();
  }
  function mapArtwork(mode = state.homeView, warehouse = null) {
    if (mode === "apartments" || warehouse) {
      const lots = [
        [142, 272, 82, 66, "a1", "1200"],
        [251, 193, 62, 70, "a2", "1228"],
        [61, 390, 66, 76, "a3", "1185"],
        [29, 151, 47, 58, "", "1216"],
        [100, 125, 48, 64, "", "1220"],
        [290, 368, 69, 61, "", "1256"],
        [205, 441, 64, 65, "", "1144"],
        [21, 542, 66, 52, "", "1160"],
        [233, 568, 62, 67, "", "1136"],
        [113, 573, 58, 56, "", "1168"],
      ];
      return `<svg viewBox="0 0 390 720" preserveAspectRatio="none" aria-hidden="true"><rect width="390" height="720" fill="#EDEDEA"/><path d="M295 20h95v126h-95z" fill="#DCE7D8"/><path d="M-30 245 430 90M-30 429 430 276M-20 610 430 457M79-40 330 760M-88 8 155 760M267-60 518 720" fill="none" stroke="#D7DBDC" stroke-width="29"/><path d="M-30 245 430 90M-30 429 430 276M-20 610 430 457M79-40 330 760M-88 8 155 760M267-60 518 720" fill="none" stroke="#FFF" stroke-width="25"/>${lots.map(([x, y, w, h, id, n]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${!warehouse && id === state.apt ? "#C5DAF9" : "#DDDCD7"}" stroke="${!warehouse && id === state.apt ? "#1467D8" : "#D3D3CE"}" stroke-width="${id === state.apt ? 2 : 1}"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" class="ex-roof ${id === state.apt ? "active" : ""}">${warehouse ? "" : n}</text>`).join("")}<g fill="#737977" font-family="Arial" font-size="12"><text x="100" y="238" transform="rotate(-18 100 238)">${warehouse ? esc(warehouse.street || "取件街道") : "W Pine Ave"}</text><text x="270" y="429" transform="rotate(72 270 429)">S Grove St</text><text x="51" y="586" transform="rotate(-18 51 586)">W 8th St</text><text x="312" y="87" font-size="10">PARK</text></g></svg>`;
    }
    return `<svg viewBox="0 0 390 720" preserveAspectRatio="none" aria-hidden="true"><rect width="390" height="720" fill="#E9EDE9"/><path d="M0 0h390v145l-70-14-90 41-90-42L0 160z" fill="#D6E3D0"/><g stroke="#DCE0DC" stroke-width="7">${Array.from({ length: 9 }, (_, i) => `<path d="M${20 + i * 48} 150v570M-40 ${175 + i * 62}h500"/>`).join("")}</g><g stroke="#FFF" stroke-width="4">${Array.from({ length: 9 }, (_, i) => `<path d="M${20 + i * 48} 150v570M-40 ${175 + i * 62}h500"/>`).join("")}</g><path d="M-20 590Q100 390 260 280T430 220M-30 360Q160 370 200 480T400 640" fill="none" stroke="#D0D6D8" stroke-width="12"/><path d="M-20 590Q100 390 260 280T430 220M-30 360Q160 370 200 480T400 640" fill="none" stroke="#FFF" stroke-width="8"/><path d="m55 720 17-260 40-130-5-170" fill="none" stroke="#CBDCE8" stroke-width="9"/><g fill="#8C9690" font-family="Arial" font-size="10"><text x="18" y="270">LOS ANGELES</text><text x="270" y="178">SAN GABRIEL MOUNTAINS</text><text x="175" y="585">POMONA FWY</text><text x="305" y="665">CHINO HILLS</text></g></svg>`;
  }
  const regionPositions = {
    Pasadena: [53, 38],
    Alhambra: [40, 46],
    "West Covina": [77, 48],
    "City of Industry": [67, 63],
    Koreatown: [20, 61],
    Chino: [83, 75],
    Ontario: [83, 68],
    "Los Angeles": [20, 54],
  };
  function mapPins() {
    if (state.homeView === "apartments")
      return model.apartments
        .slice(0, 3)
        .map((a, i) => {
          const [x, y] = [
            [47, 42],
            [72, 32],
            [24, 60],
          ][i];
          return `<button class="ex-building-hit" style="left:${x}%;top:${y}%" data-action="ex-apt" data-id="${a.id}" aria-label="选择公寓 ${esc(a.address)}" aria-pressed="${state.apt === a.id}"></button>`;
        })
        .join("");
    if (ex.status[state.homeView] !== "ready") return "";
    const rs = results(),
      selected = selectedResult(),
      selectedRegions = selected
        ? state.homeView === "jobs"
          ? [selected.region]
          : regionsOf(selected)
        : [],
      counts = new Map();
    for (const r of rs)
      for (const region of state.homeView === "jobs"
        ? [r.region]
        : regionsOf(r)) {
        if (!supportFilter().region || supportFilter().region === region) {
          const set = counts.get(region) || new Set();
          set.add(r.id);
          counts.set(region, set);
        }
      }
    return [...counts]
      .map(([region, ids]) => {
        const [x, y] = regionPositions[region] || [50, 50];
        return `<button class="ex-region ${selectedRegions.includes(region) ? "selected" : ""}" data-object-selected="${selectedRegions.includes(region)}" data-filter-selected="${supportFilter().region === region}" style="left:${x}%;top:${y}%" data-action="ex-region" data-id="${esc(region)}" aria-label="${esc(region)}，当前结果${ids.size}${state.homeView === "jobs" ? "条需求" : "位司机"}${selectedRegions.includes(region) ? "，当前卡片服务区域" : ""}"><span>${esc(region)}</span><b>${ids.size}</b></button>`;
      })
      .join("");
  }
  function mapLayer() {
    const c = camera();
    return `<div class="ex-map" data-ex-map aria-label="${state.homeView === "apartments" ? "公寓" : "服务区域"}地图"><div class="ex-map-world" style="transform:translate(${c.x}px,${c.y}px) scale(${c.zoom})">${mapArtwork()}${mapPins()}${state.scenario !== "denied" ? '<span class="ex-blue-dot" role="img" aria-label="本人位置"></span>' : ""}</div></div>`;
  }
  homeToolbar = () => {
    const people = state.homeView === "people",
      support = isSupport();
    const title = support
      ? people
        ? "筛选服务区域、日期或经验"
        : "筛选配送区域、日期或类型"
      : "搜索门牌或街道";
    return `<div class="home-toolbar ex-toolbar"><div class="search-row"><button class="search-trigger" data-action="search">${I(support ? "filter" : "search")}<span>${title}</span></button><button class="icon-btn message-trigger" data-action="inbox" aria-label="消息">${I("chat")}<i class="ex-unread"></i></button></div><div class="map-mode-row"><div class="view-tabs" role="tablist" aria-label="首页内容">${[
      ["apartments", "公寓"],
      ["jobs", "找活"],
      ["people", "找人"],
    ]
      .map(
        ([id, label]) =>
          `<button role="tab" aria-selected="${state.homeView === id}" class="${state.homeView === id ? "active" : ""}" data-action="map-view" data-id="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div>${support ? `<button class="map-view-toggle" data-action="${state.homeList ? "return-map" : "map-list"}" aria-label="切换为${state.homeList ? "地图" : "列表"}">${I(state.homeList ? "map" : "list")}${state.homeList ? "地图" : "列表"}</button>` : ""}</div>${support ? supportSummary() : ""}</div>`;
  };
  function supportSummary() {
    const f = supportFilter(),
      st = ex.status[state.homeView];
    const count =
      st === "ready"
        ? `当前结果 · ${results().length}${state.homeView === "jobs" ? "条需求" : "位司机"}`
        : st === "loading"
          ? "正在加载"
          : st === "error"
            ? "暂时无法读取"
            : "当前结果 · 0";
    return `<div class="ex-query"><button data-action="search">${esc(f.region || "全部区域")}${I("down")}</button>${f.day ? `<span class="ex-filter-chip">${dayLabel(f.day)}</span>` : ""}${f.text ? `<span class="ex-filter-chip">${esc(f.text)}</span>` : ""}<span class="ex-result-count" aria-live="polite">${count}</span>${f.region || f.day || f.text || f.kind ? ib("clear-support-filters", "close", "清除筛选") : ""}</div>`;
  }
  function distanceBadge(a) {
    const d = a.distance,
      quality = $("#distance-quality")?.value || "fresh";
    if (state.scenario === "denied" || !d || !Number.isFinite(d.meters))
      return "";
    if (quality === "stale" || d.quality === "stale") return "";
    if (quality === "approximate" || d.quality === "approximate")
      return '<span class="ex-distance muted">位置较粗略</span>';
    const feet = d.meters * 3.28084;
    const value =
      feet < 1000
        ? `${Math.max(10, Math.round(feet / 10) * 10)} ft`
        : `${(feet / 5280).toFixed(1)} mi`;
    const label = d.basis === "boundary" ? "至边界" : "直线";
    return `<span class="ex-distance" aria-label="距公寓${label}约${value}">约${value} · ${label}</span>`;
  }
  function cardBody(a, active) {
    const head = `${distanceBadge(a)}<h2>${addressHTML(a.address)}</h2>`;
    if (!active) return head + '<div class="ex-card-placeholder"></div>';
    if (!state.logged || !state.qualified)
      return (
        head +
        `<p class="ex-card-state">${state.logged ? "暂未开通资料查看资格" : "登录后查看密码"}</p>${!state.logged ? btn("login-access", "登录", "text-btn") : ""}`
      );
    if (ex.code.status === "loading" || ex.code.id !== a.id)
      return head + '<div class="ex-skeleton" aria-label="正在读取密码"></div>';
    if (ex.code.status === "error")
      return (
        head +
        `<p class="ex-card-state">密码暂时无法加载</p>${btn("ex-retry-code", "重新读取", "text-btn")}`
      );
    const codes = state.scenario === "empty" ? [] : rankCodes(a);
    if (!codes.length)
      return (
        head +
        `<p class="ex-card-state">暂无共享密码</p>${btn("add-code", I("plus") + "添加密码", "ex-inline-add")}`
      );
    return `${head}<div class="ex-code">${esc(codes[0].value)}</div><div class="ex-code-meta">${esc(contributionLabel(codes[0]))}</div><span class="ex-card-chevron" aria-hidden="true">${I("up")}</span>`;
  }
  function apartmentSurface() {
    if (state.temporaryDestination)
      return `<section class="ex-floating ex-address-card"><h2>${addressHTML(state.temporaryDestination.address)}</h2><p class="meta">暂未匹配到公寓资料</p>${btn("add-unknown-code", "添加密码", "button secondary")}</section>`;
    if (
      [
        "street",
        "house",
        "commercial",
        "departure-pending",
        "unknown",
      ].includes(state.scenario)
    )
      return `<div class="ex-quiet">${btn("lib-contribute", I("plus") + "贡献公寓密码", "ex-contribute")}</div>`;
    if (state.scenario === "denied")
      return `<section class="ex-floating ex-address-card"><p>暂时无法获取位置</p>${btn("locate", "重试定位", "button secondary")}</section>`;
    const a = getApt(),
      codes = state.scenario === "empty" ? [] : rankCodes(a);
    if (state.expanded && (!state.logged || !state.qualified))
      return `<section class="home-sheet ex-expanded ex-no-access" aria-label="公寓资料"><button class="sheet-handle" data-action="collapse" aria-label="收起公寓卡片"></button><div class="ex-expanded-scroll"><div class="apartment-heading"><h2>${addressHTML(a.address, true)}</h2>${ib("collapse", "down", "收起密码记录")}</div><p>${state.logged ? "暂未开通资料查看资格" : "登录后查看密码"}</p>${state.logged ? "" : btn("login-access", "登录", "button")}</div></section>`;
    if (state.expanded)
      return `<section class="home-sheet ex-expanded" aria-label="公寓密码详情"><button class="sheet-handle" data-action="collapse" aria-label="收起公寓卡片"></button><div class="ex-expanded-scroll" id="sheet-scroll"><div class="apartment-heading"><div class="address-heading"><h2>${addressHTML(a.address, true)}</h2><div class="address">${esc(a.address.split(",").slice(1).join(","))}</div><div class="address">${esc(a.name)}</div></div>${ib("collapse", "down", "收起密码记录")}</div>${btn("add-code", I("plus") + "添加密码", "button secondary")}${ex.code.status === "loading" || ex.code.id !== a.id ? '<div class="ex-skeleton" aria-label="正在读取密码"></div>' : ex.code.status === "error" ? `<div class="ex-error">密码暂时无法加载${btn("ex-retry-code", "重新读取", "text-btn")}</div>` : codes.map((c) => `<article class="code-record" data-record="${c.id}"><div class="ex-code">${esc(c.value)}</div><div class="scope">${esc(c.scope || "大门")}</div><div class="caption">${esc(contributionLabel(c))}</div><div class="feedback-row">${btn("vote", I("thumb") + "有用", "feedback-btn", `data-id="${c.id}" data-vote="useful" aria-pressed="${c.vote === "useful"}"`)}${btn("vote", "不能用", "feedback-btn", `data-id="${c.id}" data-vote="not_useful" aria-pressed="${c.vote === "not_useful"}"`)}</div></article>`).join("") || '<p class="ex-card-state">暂无共享密码</p>'}</div></section>`;
    return mapCardCarousel(
      "apartments",
      model.apartments.filter((p) => p.nearby !== false || p.id === a.id),
      a.id,
    );
  }
  function mapCardCarousel(kind, items, selectedId) {
    const name = { apartments: "公寓", jobs: "需求", people: "司机" }[kind];
    return `<section class="ex-carousel ${items.length === 1 ? "ex-single-card" : ""}" data-card-kind="${kind}" data-active-id="${selectedId}" ${kind === "apartments" ? `data-active-apt="${selectedId}"` : ""} aria-label="${name}卡片，可左右滑动">${items
      .map((item) => {
        const active = item.id === selectedId;
        const body =
          kind === "apartments"
            ? cardBody(item, active)
            : (kind === "jobs" ? jobCard(item) : driverCard(item))
                .replace(/^<button /, "<div ")
                .replace(/ data-action="(?:job|driver)" data-id="[^"]+"/, "")
                .replace(/<\/button>$/, "</div>");
        return `<article class="ex-map-card ${kind === "apartments" ? "ex-apartment-card" : "ex-support-card"}" data-card-id="${item.id}" ${kind === "apartments" ? `data-apt="${item.id}"` : ""} ${active ? `tabindex="0" role="button" data-action="ex-open-card" data-id="${item.id}" aria-label="${kind === "apartments" ? "展开 " + esc(item.address) : "查看" + (kind === "jobs" ? esc(item.region) + "需求" : esc(item.name) + "的可接活声明")}"` : 'aria-hidden="true" inert'}><div class="card-handle" aria-hidden="true"></div>${body}</article>`;
      })
      .join("")}</section>`;
  }
  jobCard = (j) =>
    `<button class="support-job-card ex-job-card" data-action="job" data-id="${j.id}"><span class="top-inline"><span class="ex-tag">${kindLabel(j.kind)}</span><span class="caption">${dayLabel(j.date)} ${time12(j.start)}</span></span><div class="top-inline ex-job-title"><h3>${esc(j.region)}</h3><b class="quote">${money(j)}</b></div><span class="ex-job-facts">${j.remaining} 件${j.remainingDrivers ? ` · 需${j.remainingDrivers}人` : ""}${j.min ? ` · 最低${j.min}件` : ""}</span><span class="meta">${I("warehouse")}取件 ${esc(j.pickup || "联系确认")}<span class="ex-dot-separator">·</span>派送 ${esc(j.region)}</span><span class="meta">${esc(j.carrier)} · ${esc(j.publisher)}${j.partial ? " · 可拆分" : ""}</span></button>`;
  driverCard = (d) =>
    `<button class="driver-result-card ex-driver-card" data-action="driver" data-id="${d.id}"><div class="ex-driver-head">${avatar(d.id)}<div><b>${esc(d.name)}</b><span class="meta">${esc(driverTime(d))}</span></div>${I("chevron")}</div><span>${esc(regionsOf(d).join(" / "))}${d.capacity ? ` · 最多${d.capacity}件` : " · 件数联系商量"}</span><span class="meta">${esc(d.carrier)} · 自报经验</span></button>`;
  function supportSurface() {
    const st = ex.status[state.homeView],
      people = state.homeView === "people";
    if (st === "loading")
      return `<section class="ex-floating ex-result-status" role="status"><div class="ex-skeleton"></div><p>正在加载${people ? "可接活声明" : "需求"}</p></section>`;
    if (st === "error")
      return `<section class="ex-floating ex-result-status" role="alert"><h3>暂时无法读取，请重试</h3>${btn("ex-retry-support", "重新加载", "button secondary")}</section>`;
    const r = st === "empty" ? null : selectedResult();
    if (!r)
      return `<section class="ex-floating ex-result-status"><h3>${people ? "暂无符合条件的可接活声明" : "该区域暂无符合条件的需求"}</h3>${btn("search", "调整筛选", "button secondary")}</section>`;
    return mapCardCarousel(state.homeView, results(), r.id);
  }
  home = () => {
    const support = isSupport();
    if (state.homeList && support) return mapList();
    return `<div class="root-content"><div class="home ex-home ${state.homeView} ${state.expanded ? "ex-is-expanded" : ""}">${mapLayer()}${homeToolbar()}<div class="ex-scale"><span>${support ? "0.5 mi" : camera().zoom > 1.5 ? "50 ft" : "100 ft"}</span><i></i></div>${state.homeView === "people" ? btn("availability", I("plus") + "我能接活", "ex-availability") : ""}<div class="map-tools ex-map-tools">${ib("locate", "locate", "回到当前位置")}<button class="fab" data-action="publish">${I("plus")}发需求</button></div>${support ? supportSurface() : apartmentSurface()}</div></div>${bottomNav("home")}`;
  };
  mapList = () => {
    const people = state.homeView === "people",
      st = ex.status[state.homeView],
      rs = st === "ready" ? results() : [];
    return `<div class="root-content"><div class="home ex-home ex-list-home">${homeToolbar()}<div class="home-list ex-home-list page-scroll">${st === "ready" && rs.length ? rs.map((r) => (people ? driverCard(r) : jobCard(r))).join("") : supportSurface()}</div>${people ? btn("availability", I("plus") + "我能接活", "ex-availability") : ""}</div></div>${bottomNav("home")}`;
  };
  function pickupBlock(j) {
    const p = j.pickupLocation;
    if (!p || p.kind !== "warehouse" || !p.address)
      return `<section class="ex-pickup"><h3>取件地点</h3><p>${esc(j.pickup || "")}</p><p class="meta">具体取件地点请联系确认</p></section>`;
    return `<section class="ex-pickup"><div class="ex-pickup-title">${I("warehouse")}<h3>取件仓库</h3></div><p class="ex-pickup-time">${dayLabel(j.date)} ${time12(j.start)}${j.pickupEnd ? "–" + time12(j.pickupEnd) : ""}${j.pickupEnd ? " 可取件" : " 开始取件"}</p>${p.label ? `<b>${esc(p.label)}</b>` : ""}<button class="ex-address-link" data-action="ex-pickup-map" data-id="${j.id}" aria-label="查看取件位置">${I("pin")}<span>${esc(p.address)}</span>${I("chevron")}</button><div class="button-row">${btn("ex-copy-address", I("copy") + "复制地址", "button secondary", `data-id="${j.id}"`)}${btn("ex-navigate", I("send") + "导航", "button secondary", `data-id="${j.id}"`)}</div></section>`;
  }
  jobDetail = (id) => {
    const j = getJob(id),
      html = base.jobDetail(id);
    return j && j.pickup
      ? html.replace(row("取件区域", j.pickup), pickupBlock(j))
      : html;
  };
  function pickupFields(f) {
    return `<div class="ex-pickup-fields"><div class="field-label">取件方式</div><div class="ex-segment">${[
      ["warehouse", "仓库取件"],
      ["contact_handoff", "途中交接"],
    ]
      .map(([id, label]) =>
        btn(
          "ex-pickup-kind",
          label,
          f.pickupKind === id ? "active" : "",
          `data-id="${id}" aria-pressed="${f.pickupKind === id}"`,
        ),
      )
      .join(
        "",
      )}</div>${f.pickupKind === "warehouse" ? `${field("request", "pickupName", "仓库名称", "text", { optional: true, max: 100 })}${field("request", "pickupAddress", "取件地址", "text", { placeholder: "门牌、街道、城市、州", max: 300 })}<div class="ex-address-suggestions" id="pickup-suggestions"></div><p class="caption">将向登录司机展示</p>${f.pickupAddress ? btn("ex-form-map", I("pin") + "查看取件位置", "text-btn") : ""}${field("request", "pickupEnd", "最迟取件时间", "time", { optional: true })}` : '<p class="meta">具体取件地点请联系确认</p>'}</div>`;
  }
  defaultDraft = (kind) => ({
    ...base.defaultDraft(kind),
    pickupKind: "warehouse",
    pickupName: "",
    pickupAddress: "",
    pickupFixture: null,
    pickupEnd: "",
  });
  draftFromJob = (j) => ({
    ...base.draftFromJob(j),
    pickupKind: j.pickupLocation?.kind || "contact_handoff",
    pickupName: j.pickupLocation?.label || "",
    pickupAddress: j.pickupLocation?.address || "",
    pickupFixture: j.pickupLocation?.id || null,
    pickupEnd: j.pickupEnd || "",
  });
  requestForm = () => {
    const f = state.forms.request;
    f.pickupKind ??= "warehouse";
    return base.requestForm().replace(
      field("request", "pickup", "取件区域", "text", {
        choices: [["", "请选择"], ...areas],
      }),
      field("request", "pickup", "取件区域", "text", {
        choices: [["", "请选择"], ...areas],
      }) + pickupFields(f),
    );
  };
  jobFromForm = (f, existing) => ({
    ...base.jobFromForm(f, existing),
    pickupLocation:
      f.pickupKind === "warehouse"
        ? {
            kind: "warehouse",
            label: f.pickupName || "",
            address: (f.pickupAddress || "").trim(),
            id: f.pickupFixture,
            street: warehouses.find((w) => w.id === f.pickupFixture)?.street,
          }
        : { kind: "contact_handoff" },
    pickupEnd: f.pickupKind === "warehouse" ? f.pickupEnd || "" : "",
  });
  availabilityPage = function () {
    const f = (state.forms.availability ||= structuredClone(
      model.availability,
    ));
    f.date ??= TODAY;
    f.endDate ??= f.date;
    return formPage(
      "可接活设置",
      "availability",
      `${formError()}<label class="ex-availability-switch"><span><b>开启本次可接活时段</b></span><input type="checkbox" role="switch" name="enabled" data-field="enabled" data-form-key="availability" ${f.enabled ? "checked" : ""}></label><p class="meta">关闭后停止推荐，已有会话保留</p>${f.enabled ? `<div class="form-section"><h2 class="section-title">本次时段</h2><div class="ex-date-quick">${btn("ex-date", "今天", f.date === TODAY ? "active" : "", `data-id="${TODAY}"`)}${btn("ex-date", "明天", f.date === TOMORROW ? "active" : "", `data-id="${TOMORROW}"`)}</div><div class="ex-field-pair">${field("availability", "date", "开始日期", "date")}${field("availability", "start", "开始时间", "time")}</div><div class="ex-field-pair">${field("availability", "endDate", "结束日期", "date")}${field("availability", "end", "结束时间", "time")}</div>${f.endDate > f.date ? `<p class="meta">结束于 ${f.endDate}（次日）</p>` : ""}</div><div class="form-section"><h2 class="section-title">我愿意去的区域</h2><div class="ex-area-choices">${areas.map((r) => `<label class="check-row"><input type="checkbox" data-region="${esc(r)}" ${f.regions.includes(r) ? "checked" : ""}><span>${esc(r)}</span></label>`).join("")}</div>${state.errors.regions ? `<p class="field-error">${esc(state.errors.regions)}</p>` : ""}</div>${field("availability", "capacity", "最多可接包裹", "number", { optional: true, min: 1 })}` : ""}`,
      "保存可接活状态",
    );
  };
  function pickupSource(m) {
    if (m.form) {
      const f = state.forms.request;
      return {
        label: f.pickupName,
        address: f.pickupAddress,
        id: f.pickupFixture,
        street: warehouses.find((w) => w.id === f.pickupFixture)?.street,
      };
    }
    return getJob(m.id)?.pickupLocation;
  }
  function placeMap(m) {
    const p = pickupSource(m),
      fail = $("#pickup-map-fail").checked || !p?.id;
    return `<section class="ex-place-map" role="dialog" aria-modal="true" aria-label="取件位置"><div class="ex-place-canvas ex-map" data-ex-map="place"><div class="ex-map-world ex-place-world" style="transform:translate(${ex.placeCamera.x}px,${ex.placeCamera.y}px) scale(${ex.placeCamera.zoom})">${fail ? "" : mapArtwork("warehouse", p)}${fail ? "" : `<div class="ex-warehouse-marker">${I("warehouse")}</div>`}</div></div><div class="ex-place-top">${ib("close-modal", "close", "关闭取件地图")}<b>取件位置</b></div>${fail ? `<div class="ex-map-failure"><p>暂时无法显示位置</p>${btn("ex-retry-place", "重新加载", "button secondary")}</div>` : `<div class="ex-place-scale">${ex.placeCamera.zoom > 1.5 ? "50 ft" : "100 ft"} ━━━</div>`}<div class="ex-place-card">${p?.label ? `<h2>${esc(p.label)}</h2>` : ""}<p>${esc(p?.address || "具体取件地点请联系确认")}</p><div class="button-row">${btn("ex-copy-address", I("copy"), "button secondary ex-copy-square", `aria-label="复制地址" ${m.form ? 'data-form="true"' : `data-id="${m.id}"`}`)}${btn("ex-navigate", I("send") + "导航", "button", m.form ? 'data-form="true"' : `data-id="${m.id}"`)}</div></div></section>`;
  }
  function remember() {
    if (isSupport()) {
      ex.lists[state.homeView] = state.homeList;
      ex.listScroll[state.homeView] =
        $(".ex-home-list")?.scrollTop || ex.listScroll[state.homeView];
    }
  }
  nav = function (view, args = {}, replace = false) {
    if (state.route.view === "home") remember();
    base.nav(view, args, replace);
  };
  renderModal = function () {
    const m = state.modal;
    if (m?.type === "ex-place") {
      const p = pickupSource(m),
        key = `${m.form ? "form" : m.id}:${p?.address}`;
      if (ex.placeKey !== key) {
        ex.placeCamera = { x: 0, y: 0, zoom: 1 };
        ex.placeKey = key;
      }
      $("#overlay").innerHTML = placeMap(m);
      bindMap($('.ex-place-map [data-ex-map="place"]'));
      return;
    }
    if (m?.type === "ex-navigate") {
      const p = pickupSource(m),
        addr = p?.address || "",
        encoded = encodeURIComponent(addr);
      $("#overlay").innerHTML =
        `<section class="dialog ex-nav-dialog" role="dialog" aria-modal="true" aria-label="选择导航地图"><div class="close-row"><h2>选择地图</h2>${ib("ex-nav-cancel", "close", "关闭导航选择")}</div><p class="ex-navigation-address">${esc(addr)}</p><a class="ex-map-choice" target="_blank" rel="noopener noreferrer" data-provider="google" href="https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving">${I("map")}Google Maps${I("chevron")}</a><a class="ex-map-choice" target="_blank" rel="noopener noreferrer" data-provider="apple" href="https://maps.apple.com/directions?destination=${encoded}&mode=driving">${I("map")}Apple Maps${I("chevron")}</a>${btn("ex-nav-cancel", "取消", "text-btn wide-link")}</section>`;
      return;
    }
    if (m?.type === "ex-copy") {
      $("#overlay").innerHTML =
        `<section class="dialog" role="dialog" aria-modal="true" aria-label="复制地址"><h2>复制地址</h2><p class="meta">请长按选择并复制地址</p><textarea aria-label="完整取件地址" readonly>${esc(m.address)}</textarea>${btn("close-modal", "关闭", "button secondary")}</section>`;
      return;
    }
    if (m?.type === "request-preview") {
      const f = state.forms.request;
      $("#overlay").innerHTML =
        `<section class="dialog ex-preview" role="dialog" aria-modal="true" aria-label="核对本次支援"><h2>核对本次支援</h2>${row("派送区域", f.region)}${row("取件地区", f.pickup)}${f.pickupKind === "warehouse" ? `<div class="ex-preview-address"><b>取件仓库</b><p>${esc(f.pickupName || "")}</p><p>${esc(f.pickupAddress)}</p><span class="caption">将向登录司机展示</span></div>` : row("取件方式", "途中交接，联系确认")}${row("开始取件", dayLabel(f.date) + " " + time12(f.start))}${f.pickupEnd ? row("最迟取件", time12(f.pickupEnd)) : ""}${row("包裹数量", f.qty + " 件")}${row("报价", f.unit === "negotiable" ? "联系议价" : "$" + f.price + " / " + (f.unit === "per_route" ? "线路" : "件"))}${btn("commit-request", state.editing ? "保存变更" : "发布需求", "button")}${btn("close-modal", "继续编辑", "button secondary")}</section>`;
      return;
    }
    base.renderModal();
    if (m?.type === "support-filter") {
      const region = $('#overlay [name="region"]'),
        label = region?.closest("label")?.querySelector(".field-label");
      if (label)
        label.textContent = state.homeView === "jobs" ? "配送区域" : "服务区域";
    }
  };
  async function copyAddress(b) {
    const source = { id: b.dataset.id, form: !!b.dataset.form },
      p = pickupSource(source);
    if (!p?.address) return;
    try {
      await navigator.clipboard.writeText(p.address);
      toast("地址已复制");
    } catch {
      modal("ex-copy", { address: p.address });
    }
  }
  actions = function (a, b) {
    const id = b?.dataset.id;
    switch (a) {
      case "map-view":
        remember();
        state.homeView = id;
        state.homeList = ex.lists[id] || false;
        state.expanded = false;
        state.modal = null;
        if (id !== "apartments") querySupport(id);
        else {
          readCode(state.apt);
          render();
        }
        return;
      case "ex-region": {
        const f = supportFilter();
        f.region = id;
        selectedResult();
        querySupport();
        return;
      }
      case "ex-retry-support":
        querySupport();
        return;
      case "clear-support-filters":
        state.supportFilters[state.homeView] = {
          region: "",
          text: "",
          day: "",
          kind: "",
        };
        state.modal = null;
        querySupport();
        return;
      case "map-list":
        remember();
        state.homeList = true;
        ex.lists[state.homeView] = true;
        render();
        return;
      case "return-map":
        remember();
        state.homeList = false;
        ex.lists[state.homeView] = false;
        render();
        return;
      case "ex-apt":
      case "select-apt":
      case "choose-apt":
        setApt(id);
        if (state.route.view !== "home") nav("home", {}, true);
        return;
      case "ex-open-card":
        if (ex.dragEnded && performance.now() - ex.dragEnded < 350) return;
        if (state.homeView !== "apartments") {
          state[state.homeView === "jobs" ? "selectedJob" : "selectedDriver"] =
            id;
          base.actions(state.homeView === "jobs" ? "job" : "driver", b);
          return;
        }
      // Apartment details stay on the same selected card.
      case "ex-expand":
        if (ex.dragEnded && performance.now() - ex.dragEnded < 350) return;
        ex.reading = true;
        state.expanded = true;
        render();
        return;
      case "expand":
      case "toggle-sheet":
        ex.reading = true;
        break;
      case "ex-retry-code":
        readCode(state.apt, { retry: true });
        render();
        return;
      case "locate":
        Object.assign(camera(), { x: 0, y: 0, zoom: 1 });
        if (state.homeView === "apartments") {
          ex.reading = false;
          state.scenario = "normal";
          $("#scenario").value = "normal";
          state.temporaryDestination = null;
          setApt("a1", false);
        } else render();
        return;
      case "ex-zoom-in":
        camera().zoom = Math.min(2.4, camera().zoom + 0.2);
        render();
        return;
      case "ex-zoom-out":
        camera().zoom = Math.max(0.8, camera().zoom - 0.2);
        render();
        return;
      case "ex-pickup-kind":
        state.forms.request.pickupKind = id;
        if (id !== "warehouse") {
          Object.assign(state.forms.request, {
            pickupName: "",
            pickupAddress: "",
            pickupFixture: null,
            pickupEnd: "",
          });
        }
        render();
        return;
      case "ex-pickup-choice": {
        const p = warehouses.find((w) => w.id === id);
        Object.assign(state.forms.request, {
          pickupAddress: p.address,
          pickupName: state.forms.request.pickupName || p.label,
          pickupFixture: p.id,
          pickup: p.region,
        });
        capture();
        render();
        return;
      }
      case "ex-pickup-map":
        modal("ex-place", { id });
        return;
      case "ex-form-map":
        modal("ex-place", { form: true });
        return;
      case "ex-retry-place":
        toast("暂时无法显示位置，地址已保留");
        return;
      case "ex-navigate": {
        const p = pickupSource({ id, form: !!b.dataset.form });
        if (!p?.address) {
          toast("具体取件地点请联系确认");
          return;
        }
        modal("ex-navigate", {
          id,
          form: !!b.dataset.form,
          parent: state.modal?.type === "ex-place" ? { ...state.modal } : null,
        });
        return;
      }
      case "ex-nav-cancel": {
        const parent = state.modal.parent;
        state.modal = parent || null;
        renderModal();
        return;
      }
      case "ex-copy-address":
        void copyAddress(b);
        return;
      case "ex-date": {
        const f = state.forms.availability;
        const previous = f.date;
        f.date = id;
        if (!f.endDate || f.endDate === previous) f.endDate = id;
        render();
        return;
      }
      default:
        break;
    }
    if (a === "job" && id) state.selectedJob = id;
    if (a === "driver" && id) state.selectedDriver = id;
    base.actions(a, b);
  };
  submitForm = function (type, form) {
    if (type === "request" && state.forms.request.pickupKind === "warehouse") {
      const f = state.forms.request;
      if (
        !/^\d\S*\s+.+,\s*.+,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(
          (f.pickupAddress || "").trim(),
        )
      ) {
        state.errors.pickupAddress = "请填写完整取件地址";
        render();
        return;
      }
      if (f.pickupEnd && f.start && f.pickupEnd < f.start) {
        state.errors.pickupEnd = "最迟取件时间不能早于开始时间";
        render();
        return;
      }
    }
    if (type === "supportFilter") {
      state.supportFilters[state.homeView] = { ...state.forms.supportFilter };
      state.modal = null;
      selectedResult();
      querySupport();
      return;
    }
    if (type === "availability" && state.forms.availability.enabled) {
      const f = state.forms.availability,
        start = laInstant(f.date, f.start),
        end = laInstant(f.endDate, f.end);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end <= ex.now ||
        end - start > 86400000 ||
        start > ex.now + 7 * 86400000
      ) {
        state.errors._ = "请核对本次起止时段，最长24小时";
        render();
        return;
      }
    }
    base.submitForm(type, form);
  };
  function paintCamera(surface) {
    const c = surface.dataset.exMap === "place" ? ex.placeCamera : camera();
    surface.querySelector(".ex-map-world").style.transform =
      `translate(${c.x}px,${c.y}px) scale(${c.zoom})`;
    const scale =
      surface.dataset.exMap === "place"
        ? $(".ex-place-scale")
        : $(".ex-scale span");
    if (scale)
      scale.textContent =
        surface.dataset.exMap === "place"
          ? c.zoom > 1.5
            ? "50 ft ━━━"
            : "100 ft ━━━"
          : isSupport()
            ? c.zoom > 1.5
              ? "0.25 mi"
              : "0.5 mi"
            : c.zoom > 1.5
              ? "50 ft"
              : "100 ft";
  }
  function bindMap(surface = $("[data-ex-map]")) {
    const current = () =>
      surface.dataset.exMap === "place" ? ex.placeCamera : camera();
    if (!surface) return;
    let start = null,
      pinch = null;
    const pointers = new Map();
    surface.tabIndex = 0;
    surface.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: e.clientX, y: e.clientY, px: current().x, py: current().y };
      surface.setPointerCapture(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: current().zoom,
        };
      }
    });
    surface.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        current().zoom = Math.max(
          0.8,
          Math.min(
            2.4,
            (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
          ),
        );
      } else if (start) {
        current().x = start.px + e.clientX - start.x;
        current().y = start.py + e.clientY - start.y;
      }
      paintCamera(surface);
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      pinch = null;
      start = null;
    };
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", end);
    surface.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        current().zoom = Math.max(
          0.8,
          Math.min(2.4, current().zoom + (e.deltaY < 0 ? 0.1 : -0.1)),
        );
        paintCamera(surface);
      },
      { passive: false },
    );
    surface.addEventListener("keydown", (e) => {
      if (["+", "=", "-"].includes(e.key)) {
        e.preventDefault();
        current().zoom = Math.max(
          0.8,
          Math.min(2.4, current().zoom + (e.key === "-" ? -0.2 : 0.2)),
        );
        paintCamera(surface);
      }
    });
  }
  function bindCarousel() {
    ex.carouselResize?.disconnect();
    const track = $(".ex-carousel");
    if (!track) return;
    const gap = 12,
      kind = track.dataset.cardKind,
      key = {
        apartments: "apt",
        jobs: "selectedJob",
        people: "selectedDriver",
      }[kind],
      cards = [...track.children],
      index = Math.max(
        0,
        cards.findIndex((c) => c.dataset.cardId === state[key]),
      );
    const step = () => cards[0].getBoundingClientRect().width + gap;
    track.scrollLeft = index * step();
    ex.carouselResize = new ResizeObserver(() => {
      if (!track.isConnected || $(".ex-carousel") !== track) return;
      track.scrollLeft =
        Math.max(
          0,
          cards.findIndex((c) => c.dataset.cardId === state[key]),
        ) * step();
      alignTools();
    });
    ex.carouselResize.observe(track);
    let timer,
      dragging = null;
    const select = (id) => {
      if (kind === "apartments") setApt(id);
      else {
        state[key] = id;
        render();
      }
    };
    const settle = () => {
      if (
        !track.isConnected ||
        $(".ex-carousel") !== track ||
        state.homeView !== kind
      )
        return;
      const n = Math.max(
        0,
        Math.min(cards.length - 1, Math.round(track.scrollLeft / step())),
      );
      if (cards[n]?.dataset.cardId !== state[key])
        select(cards[n].dataset.cardId);
    };
    track.addEventListener(
      "scroll",
      () => {
        clearTimeout(timer);
        timer = setTimeout(settle, 160);
      },
      { passive: true },
    );
    track.addEventListener("keydown", (e) => {
      if (["Enter", " "].includes(e.key) && e.target.matches(".ex-map-card")) {
        e.preventDefault();
        actions("ex-open-card", e.target);
        return;
      }
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const next = Math.min(
        cards.length - 1,
        Math.max(0, index + (e.key === "ArrowRight" ? 1 : -1)),
      );
      select(cards[next].dataset.cardId);
      $(".ex-map-card[tabindex]")?.focus();
    });
    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.target.closest("button")) return;
      dragging = { x: e.clientX, left: track.scrollLeft, moved: false };
    });
    track.addEventListener("pointermove", (e) => {
      if (!dragging || !(e.buttons & 1)) return;
      const dx = e.clientX - dragging.x;
      if (Math.abs(dx) > 5) {
        dragging.moved = true;
        track.style.scrollSnapType = "none";
        track.scrollLeft = dragging.left - dx;
      }
    });
    const end = () => {
      if (!dragging) return;
      if (dragging.moved) {
        ex.dragEnded = performance.now();
        track.style.scrollSnapType = "";
        settle();
      }
      dragging = null;
    };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointerleave", end);
    track.addEventListener(
      "wheel",
      (e) => {
        if (!e.deltaX && e.deltaY) {
          e.preventDefault();
          track.scrollLeft += e.deltaY;
        }
      },
      { passive: false },
    );
  }
  alignTools = function () {
    const s = $(".ex-carousel,.ex-floating,.ex-expanded"),
      t = $(".ex-map-tools");
    if (s && t) t.style.bottom = s.getBoundingClientRect().height + 30 + "px";
  };
  render = function () {
    if (
      state.homeView === "apartments" &&
      ex.code.id !== state.apt &&
      state.route.view === "home"
    )
      readCode(state.apt);
    base.render();
    $("#device").dataset.mode = state.homeView;
    if (state.route.view === "home") {
      bindMap();
      bindCarousel();
      alignTools();
      if (state.homeList && $(".ex-home-list"))
        $(".ex-home-list").scrollTop = ex.listScroll[state.homeView] || 0;
    }
    if (state.route.view === "driver") {
      const d = getDriver(state.route.args.id),
        n = $(".available-card");
      if (d && n)
        n.innerHTML = `<b>${esc(driverTime(d))}</b><div class="meta">${d.capacity ? "最多可接" + d.capacity + "件" : "件数可联系商量"}</div>`;
    }
  };
  document.addEventListener("input", (e) => {
    if (e.target.dataset.field !== "pickupAddress") return;
    state.forms.request.pickupFixture = null;
    const q = e.target.value.toLowerCase().trim(),
      node = $("#pickup-suggestions");
    if (node)
      node.innerHTML =
        q.length < 2
          ? ""
          : warehouses
              .filter((w) => w.address.toLowerCase().includes(q))
              .map((w) =>
                btn(
                  "ex-pickup-choice",
                  `${I("pin")}<span>${esc(w.address)}</span>`,
                  "ex-suggestion",
                  `data-id="${w.id}"`,
                ),
              )
              .join("");
  });
  document.addEventListener(
    "click",
    (e) => {
      if (
        ex.dragEnded &&
        e.target.closest('[data-action="ex-expand"]') &&
        performance.now() - ex.dragEnded < 350
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  $("#scenario").addEventListener("change", () => {
    readCode(state.apt);
    render();
  });
  $("#distance-quality").addEventListener("change", () => render());
  $("#support-scenario").addEventListener("change", () => {
    if (isSupport()) querySupport();
  });
  document.querySelectorAll("[data-ex-flow]").forEach((b) =>
    b.addEventListener("click", () => {
      const flow = b.dataset.exFlow;
      if (flow === "reset") {
        resetPrototype();
        return;
      }
      state.stack = [];
      state.modal = null;
      state.errors = {};
      state.route = { view: flow === "publish" ? "publish" : "home", args: {} };
      state.homeView = flow === "publish" ? "jobs" : flow;
      state.homeList = false;
      if (isSupport()) querySupport();
      else {
        state.scenario = "normal";
        state.logged = true;
        state.qualified = true;
        setApt("a1", false);
      }
    }),
  );
  resetPrototype = function () {
    $("#distance-quality").value = "fresh";
    ++ex.readGeneration;
    for (const m of ["jobs", "people"]) {
      ++ex.generation[m];
      ex.status[m] = "ready";
      ex.lists[m] = false;
      ex.listScroll[m] = 0;
    }
    for (const c of Object.values(ex.contexts))
      Object.assign(c, { x: 0, y: 0, zoom: 1 });
    ex.code = { id: null, status: "loading" };
    ex.reading = false;
    base.resetPrototype();
    seed();
    $("#support-scenario").value = "ready";
    $("#pickup-map-fail").checked = false;
    render();
  };
  // The existing filter modal and underlying fixtures use this same LA demo date.
  readCode("a1");
  render();
  window.abasongExperience = {
    version: "3.2-r3-core",
    demoDay: TODAY,
    state: ex,
    warehouses,
    laInstant,
    setApt,
    querySupport,
  };
  // Review shortcuts live outside the product. Human usability sessions start at home.
  const reviewTask = new URLSearchParams(location.search).get("task");
  if (reviewTask === "contribution") actions("lib-contribute", { dataset: {} });
  if (reviewTask === "correction") {
    nav("contributions", {}, true);
    actions("lib-tab", { dataset: { id: "shared" } });
  }
  if (reviewTask === "support")
    actions("map-view", { dataset: { id: "jobs" } });
  if (reviewTask === "messages") nav("inbox", {}, true);
})();
