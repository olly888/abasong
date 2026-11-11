"use strict";
// M5-01 visual alignment only. Existing draft, time, save and application
// handlers stay in delivery.js; all values here are synthetic prototype data.
(() => {
  if (new URLSearchParams(location.search).get("layout") !== "muse") return;
  const base = { jobDetail, applyPage, renderModal };
  const scene = j => j.deliveryScene === "warehouse" ? "仓库缺人，找司机" : "送不完，找人代送";
  const quantity = j => j.quantityMode === "unknown" ? "数量待确认" : j.quantityMode === "estimate" ? `约 ${j.qty} 件` : j.remaining != null && j.remaining !== j.qty ? `剩余 ${j.remaining} 件` : `${j.qty} 件`;
  const arrival = j => `${j.date} · ${j.asap ? "尽快到场" : time12(j.start)}`;
  function summary(j, showArrival = true) {
    const price = htmlRoot(money(j)).content.textContent;
    const drivers = j.deliveryScene === "warehouse" && j.drivers ? `<span>${j.remainingDrivers != null && j.remainingDrivers !== j.drivers ? "还需" : "需要"}司机 ${j.remainingDrivers ?? j.drivers} 人</span>` : "";
    return `<div class="m35-delivery-summary"><p class="m35-muted">${esc(scene(j))}</p><h2>${esc(j.region || "派送区域待确认")}</h2><div class="m35-delivery-band"><strong>${esc(price)}</strong><div><b>${esc(quantity(j))}</b>${drivers}</div></div>${showArrival ? row("到场时间", arrival(j)) : ""}</div>`;
  }
  function htmlRoot(html) { const t = document.createElement("template"); t.innerHTML = html; return t; }
  jobDetail = id => {
    const j = getJob(id), t = htmlRoot(base.jobDetail(id));
    if (!j?.deliveryScene) return t.innerHTML;
    const title = t.content.querySelector(".title-block");
    if (title) title.outerHTML = `<p class="m35-delivery-status">${esc(statusLabel(j.status))}</p>${summary(j)}`;
    t.content.querySelector(".facts")?.remove();
    const content = t.content.querySelector(".page-scroll");
    content?.classList.add("m35-delivery-detail");
    // Arrival already lives beside the core terms, not repeated below pickup.
    if (content) for (const r of content.querySelectorAll(":scope > .detail-row")) {
      if (["接手时间", "开始时间"].includes(r.firstElementChild?.textContent)) r.remove();
    }
    if (content) {
      const section = (title, html) => `<section class="m35-delivery-section"><h3>${esc(title)}</h3>${html}</section>`;
      const pickup = content.querySelector(".ex-pickup");
      pickup?.querySelector(".ex-pickup-time")?.remove();
      const warehouse = j.pickupLocation?.kind === "warehouse";
      const place = warehouse ? (pickup?.outerHTML || "") + row("取件区域", j.pickup || "联系确认") : row("交接地区", `${j.pickup || "联系确认"} · 具体地点联系确认`);
      pickup?.remove();
      let conditions = "", expiry = "";
      for (const r of content.querySelectorAll(":scope > .detail-row")) {
        const label = r.firstElementChild?.textContent;
        if (label === "配送区域") { r.remove(); continue; }
        if (label === "需求下架") { expiry += r.outerHTML; r.remove(); continue; }
        if (["包裹分担", "理货状态", "接手要求", "配送经验", "送完要求"].includes(label)) { conditions += r.outerHTML; r.remove(); }
      }
      const places = place + row("派送区域", j.region) + row("快递公司", j.carrier || "联系确认") + (j.route ? row("线路编号", j.route) : "");
      content.querySelector(".m35-delivery-summary")?.insertAdjacentHTML("afterend", section(warehouse ? "取件与派送" : "交接与派送", places) + section("接手要求", conditions) + (expiry ? section("截止时间 · 洛杉矶", expiry) : ""));
    }
    return t.innerHTML;
  };
  applyPage = () => {
    const j = getJob(state.route.args.id), t = htmlRoot(base.applyPage());
    if (!j?.deliveryScene) return t.innerHTML;
    const panel = t.content.querySelector(".support-panel");
    if (!panel) return t.innerHTML;
    panel.classList.add("m35-application");
    panel.setAttribute("aria-label", "报名接活");
    panel.querySelector("h2").textContent = "报名接活";
    const pickup = j.pickupLocation;
    const location = pickup?.kind === "warehouse" && pickup.address
      ? `<div class="m35-apply-address"><span>取件仓库</span><p>${esc(pickup.address)}</p></div>`
      : row("交接地区", `${j.pickup || "联系确认"} · 具体地点联系确认`);
    const old = panel.querySelector(".application-summary");
    if (old) old.outerHTML = summary(j) + location;
    panel.querySelector("form")?.insertAdjacentHTML("afterbegin", '<h3 class="m35-delivery-section-title">本次可接活</h3>');
    return t.innerHTML;
  };
  renderModal = () => {
    base.renderModal();
    if (state.modal?.type !== "delivery-preview") return;
    const body = document.querySelector(".v34-review-body");
    const f = state.forms.request;
    if (!body || !f || body.dataset.m35) return;
    body.dataset.m35 = "true";
    const group = id => body.querySelector(`[data-action="v34-review-edit"][data-id="${id}"]`)?.closest(".v34-review-group");
    const load = group("load"), identity = group("identity");
    const j = jobFromForm(f, state.editing ? getJob(state.editing) : null);
    if (load) {
      for (const r of load.querySelectorAll(".detail-row")) if (["件数", "报价", "需要司机"].includes(r.firstElementChild?.textContent)) r.remove();
      load.querySelector("header").insertAdjacentHTML("afterend", summary(j, false));
      body.prepend(load);
    }
    if (identity) {
      for (const r of identity.querySelectorAll(".detail-row")) if (r.firstElementChild?.textContent === "场景") r.remove();
      body.append(identity);
    }
  };
  render();
})();
