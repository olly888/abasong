"use strict";
// Local interaction prototype only. Never invokes Share, clipboard, photos, download or network.
(() => {
  const base = { render, renderModal, actions, resetPrototype };
  const target = "https://abasong.example/invite";
  const headline = "到了公寓进不去？先看看同行共享的门禁码。";
  const text = `跑快递遇到公寓进不去，可以看看 Abasong：查附近公寓的共享门禁码，也能通过截图或手填，把自己有权共享的资料加进去。有空找活、送不完找人，和跑同一区域的同行一起用。\n\n${target}`;
  const ui = { scenario: "ready", receiver: "unavailable", error: "", copied: false, saved: false };
  let lastPage = "";
  const overlay = html => { if ($("#overlay").innerHTML !== html) $("#overlay").innerHTML = html; };
  const brand = () => '<div class="invite-brand"><img class="brand-wordmark" src="../assets/brand/abasong_wordmark_primary.svg" alt="Abasong 阿巴送"></div>';
  const scene = () => `<svg class="invite-scene" viewBox="0 0 310 100" aria-hidden="true"><path fill="var(--ab-color-brandSurface)" d="M0 0h310v100H0z"/><path fill="var(--ab-palette-blue-100)" d="M22 22h62v67H22zm205-8h60v75h-60z"/><path fill="var(--ab-palette-blue-200)" d="M90 8h115v81H90z"/><path fill="#fff" d="M102 20h18v13h-18zm30 0h18v13h-18zm30 0h18v13h-18zm-60 25h18v13h-18zm60 0h18v13h-18z"/><path fill="var(--ab-color-brandPrimary)" d="M131 50h26v39h-26z"/><path stroke="var(--ab-color-brandPressed)" stroke-width="3" fill="none" d="M18 90h274M31 90V60m0 9 11-9m223 30V56m0 11-11-9"/><circle fill="#fff" cx="150" cy="71" r="2"/><circle fill="var(--ab-color-brandPrimary)" cx="204" cy="62" r="7"/><path stroke="var(--ab-color-brandPrimary)" stroke-width="6" stroke-linecap="round" fill="none" d="m203 74-3 13m4-13 9 12m-8-14 12 3"/><path fill="#fff" stroke="var(--ab-color-brandPrimary)" stroke-width="2" d="m216 69 13-2 3 14-13 2z"/></svg>`;
  function poster() {
    return `<section class="invite-poster" aria-label="TEST 邀请图">${brand()}<h2><span>到了公寓进不去？</span>先看看同行共享的<em>门禁码。</em></h2>${scene()}<div class="invite-benefits"><span>${I("pin")}附近查码</span><span>${I("plus")}便捷共享</span><span>${I("users")}找活找人</span></div><div class="invite-qr-row"><img class="invite-qr" src="assets/invitation-qr-test.svg" alt="TEST 邀请二维码，目标为 abasong.example/invite" width="112" height="112"/><div class="invite-qr-copy"><b>扫码了解 Abasong</b><p>分享给跑同一区域的同行</p><span class="invite-test">TEST 体验原型</span></div></div></section>`;
  }
  function invitePage() {
    return `<div class="root-content"><div class="page-scroll invite-scroll">${header("邀请司机")}${poster()}<p class="invite-source">门禁资料由同行共享，覆盖持续积累。</p>${ui.error ? `<p class="invite-inline-error" role="alert">${esc(ui.error)}</p>` : ""}<div class="invite-operations">${btn("invite-share", I("share") + "分享邀请", "button")}<div class="invite-secondary">${btn("invite-save", "保存邀请图", "text-btn")}${btn("invite-copy", "复制文案与链接", "text-btn")}</div></div></div></div>`;
  }
  function distribution() {
    if (ui.receiver === "installed") return `<h2>继续使用 Abasong</h2><p>查附近公寓，也把经验分享给同行。</p>${btn("invite-enter", "打开 Abasong", "button")}`;
    if (ui.receiver === "ios-pilot") return `<h2>iPhone 内测版</h2><p>先了解内测使用条件，再前往分发入口。</p>${btn("invite-pilot", "查看内测入口", "button")}`;
    if (ui.receiver === "wechat") return `<h2>在浏览器中继续</h2><p>当前页面无法打开 App，可复制链接后在浏览器打开。</p>${btn("invite-copy-link", "复制链接", "button secondary")}`;
    if (ui.receiver === "android-unavailable") return `<h2>Android 版暂未开放</h2><p>现在可以先了解 Abasong，开放后再加入。</p>`;
    return `<h2>内测准备中</h2><p>获取入口尚未开放。你可以先了解 Abasong。</p>`;
  }
  function receivePage() {
    return `<div class="root-content"><div class="page-scroll invite-receive"><div class="invite-web-header">${brand()}<span class="invite-test">体验原型</span></div><h1><span>到了公寓进不去？</span>多一个<em>查码的办法。</em></h1><p class="invite-web-intro">Abasong，让跑配送的同行互相帮一把。</p>${scene()}<section aria-label="Abasong 能帮你做什么"><div class="invite-feature">${I("pin")}<div><b>看附近公寓的共享门禁码</b><p>核对门牌地址，再查看同行共享的资料。</p></div></div><div class="invite-feature">${I("plus")}<div><b>把知道的资料便捷共享</b><p>选截图或手动填写，核对后再共享。</p></div></div><div class="invite-feature">${I("users")}<div><b>有空找活，送不完找人</b><p>查看配送需求，和对方直接联系。</p></div></div></section><p class="invite-source">门禁资料由同行共享，覆盖持续积累。</p><section class="invite-distribution" aria-label="获取 Abasong">${distribution()}${ui.error ? `<p class="invite-inline-error" role="alert">${esc(ui.error)}</p>` : ""}</section><footer class="invite-web-footer">${btn("invite-privacy", "隐私与使用说明", "text-btn")}${btn("invite-about", "联系 Abasong", "text-btn")}</footer></div></div>`;
  }
  function feedback(message) { ui.error = message; capture(); render(); }
  function copy(linkOnly = false) {
    if (ui.scenario === "copy-error") return modal("invite-copy-fallback", { linkOnly });
    ui.copied = true;
    ui.error = "";
    if (state.modal) closeModal();
    render();
    toast(linkOnly ? "演示：链接已复制" : "演示：文案与链接已复制");
  }
  actions = (a, b) => {
    if (a === "back" && state.route.view === "invite" && !state.stack.length) { nav("me", {}, true); return; }
    if (a === "invite-open") { ui.error = ""; nav("invite"); return; }
    if (a === "invite-preview") { ui.error = ""; nav("inviteReceive"); return; }
    if (a === "invite-share") {
      if (ui.scenario === "share-error") return feedback("暂时无法分享，可复制文案或保存邀请图。");
      ui.error = ""; modal("invite-share"); return;
    }
    if (a === "invite-save") {
      if (ui.scenario === "save-denied") return feedback("未允许保存图片，仍可分享或复制链接。");
      if (ui.scenario === "save-error") return feedback("邀请图未保存，请重试。");
      ui.saved = true; ui.error = ""; capture(); render(); toast("演示：邀请图已保存"); return;
    }
    if (a === "invite-copy") return copy();
    if (a === "invite-copy-link") return copy(true);
    if (a === "invite-copy-retry") {
      if (ui.scenario === "copy-error") return;
      return copy(!!state.modal?.linkOnly);
    }
    if (a === "invite-enter") {
      const enter = () => { state.stack = []; nav("home", {}, true); };
      if (!requireLogin(enter)) return;
      enter(); return;
    }
    if (a === "invite-pilot") return modal("info", { title: "内测入口预览", text: "这是分发入口的交互演示，当前没有真实下载链接。" });
    if (a === "invite-privacy") return modal("info", { title: "隐私与使用说明", text: "邀请内容不附带你的联系方式、位置或门禁资料。实际查看和共享按账号资格与使用条件执行。本页是原型说明，不替代正式政策。" });
    if (a === "invite-about") return modal("info", { title: "联系 Abasong", text: "正式版本提供项目确认后的支持渠道，当前原型不收集联系方式。" });
    base.actions(a, b);
  };
  renderModal = () => {
    const m = state.modal;
    if (m?.type === "invite-share") {
      overlay(`<section class="dialog invite-dialog" role="dialog" aria-modal="true" aria-label="分享预览"><div class="close-row"><h2>分享预览</h2>${ib("close-modal", "close", "关闭")}</div><div class="invite-share-preview"><strong>Abasong｜跑配送的同行，一起少走弯路</strong><p>查附近公寓的共享门禁资料，让下一次配送多一个办法。</p><div class="invite-link">${target}</div></div><p class="invite-preview-note">原型演示，不会向任何人发送邀请。</p>${btn("invite-preview", "体验接收邀请页", "button")}${btn("invite-copy", "复制文案与链接", "button secondary")}${btn("close-modal", "取消", "text-btn wide-link")}</section>`);
      return;
    }
    if (m?.type === "invite-copy-fallback") {
      overlay(`<section class="dialog invite-dialog" role="dialog" aria-modal="true" aria-label="复制未成功"><div class="close-row"><h2>复制未成功</h2>${ib("close-modal", "close", "关闭")}</div><p>可长按选择文案与链接，或稍后重试。</p><div class="invite-copy-text" tabindex="0">${esc(m.linkOnly ? target : text)}</div>${btn("invite-copy-retry", "重新复制", "button")}${btn("close-modal", "返回", "button secondary")}</section>`);
      return;
    }
    base.renderModal();
  };
  render = () => {
    const v = state.route.view;
    if (!["invite", "inviteReceive"].includes(v)) { lastPage = ""; base.render(); return; }
    history.replaceState({ abPrototype: true, route: structuredClone(state.route), stack: structuredClone(state.stack) }, "", location.pathname + location.search + "#" + v);
    const html = v === "invite" ? invitePage() : receivePage();
    // Unrelated late apartment responses must not replace a page being read or clicked.
    if (html !== lastPage) { $("#app").innerHTML = html; lastPage = html; }
    const s = screens[v];
    $("#screen-title").textContent = s[1];
    $("#screen-id").textContent = s[0];
    if (state.route.scroll) $("#app .page-scroll").scrollTop = state.route.scroll;
    renderModal();
  };
  resetPrototype = () => {
    Object.assign(ui, { scenario: "ready", receiver: "unavailable", error: "", copied: false, saved: false });
    $("#invite-scenario").value = "ready";
    $("#invite-receiver-state").value = "unavailable";
    base.resetPrototype();
  };
  $("#invite-scenario").addEventListener("change", (e) => { ui.scenario = e.target.value; ui.error = ""; capture(); render(); });
  $("#invite-receiver-state").addEventListener("change", (e) => { ui.receiver = e.target.value; ui.error = ""; capture(); render(); });
  screens.invite = ["U15", "邀请司机"];
  screens.inviteReceive = ["X02", "接收产品邀请"];
  for (const [view, screen] of [["invite", screens.invite], ["inviteReceive", screens.inviteReceive]]) {
    const o = document.createElement("option"); o.value = view; o.textContent = screen.join(" · "); $("#inspect-page").append(o);
  }
  window.abasongInvitation = { version: "3.2-r3-invite", target, headline, text, ui };
  const task = new URLSearchParams(location.search).get("task");
  if (task === "invite") nav("invite", {}, true);
  else if (task === "invite-receive") { state.logged = false; state.qualified = false; nav("inviteReceive", {}, true); }
  else render();
})();
