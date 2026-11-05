"use strict";
// Synthetic account/team prototype. No Auth phone, services, billing or real contact calls.
(() => {
  const base = {
    render,
    actions,
    submitForm,
    resetPrototype,
    renderModal,
    requestForm,
    jobDetail,
    jobFromForm,
    chatPage,
  };
  const carriers = ["GOFO", "SwiftX", "SpeedX", "UniUni"];
  const ui = {
    generation: 0,
    busy: false,
    lastLogged: state.logged,
    contactError: null,
    teamPublishIntent: null,
    availabilityBusy: false,
    availabilityError: null,
  };
  let account;
  chatPage = () => {
    const c = model.chats.find((x) => x.id === state.route.args.id);
    const html = base.chatPage();
    return c
      ? html.replace(
          ib("refresh-chat", "refresh", "刷新会话"),
          `<div class="account-header-actions">${ib("refresh-chat", "refresh", "刷新会话")}${ib("chat-more", "more", "会话操作", `data-id="${c.id}"`)}</div>`,
        )
      : html;
  };
  function seed() {
    account = {
      delivery: true,
      teamIntent: true,
      personal: { phone: "", wechat: "" },
      team: {
        id: "team-me",
        name: model.organization,
        carriers: ["GOFO", "SwiftX"],
        regions: ["West Covina"],
        phone: "",
        wechat: "",
        publicContact: false,
      },
      peers: {
        d1: { delivery: true, team: null },
        d2: { delivery: true, team: null },
        d3: {
          delivery: false,
          team: {
            id: "team-d3",
            name: "TEST 东区配送团队",
            carriers: ["SwiftX"],
            regions: ["West Covina"],
            phone: "+1 202-555-0146",
            wechat: "abasong_test_dsp",
            publicContact: false,
          },
        },
      },
      closed: [],
    };
  }
  seed();
  const clean = (s) => String(s || "").trim();
  const own = () => account.team;
  const teamFor = (id) => (id === "me" ? own() : account.peers[id]?.team);
  const nameOf = (id) =>
    id === "me" ? model.profile.name : getDriver(id)?.name || "同行";
  const blocked = (id) =>
    model.blocks.includes(id) || account.closed.includes(id);
  function publicContact(id) {
    const t = teamFor(id);
    return state.logged &&
      !blocked(id) &&
      t?.publicContact &&
      (t.phone || t.wechat)
      ? t
      : null;
  }
  const contactButton = (id) =>
    publicContact(id)
      ? btn(
          "account-view-contact",
          "业务联系方式",
          "text-btn",
          `data-id="${id}"`,
        )
      : "";
  function selection(form, key, title, choices) {
    const f = state.forms[form];
    return `<fieldset class="account-options"><legend>${title}</legend><div>${choices.map((v) => `<label><input type="checkbox" data-account-form="${form}" data-account-array="${key}" value="${esc(v)}" ${(f[key] || []).includes(v) ? "checked" : ""}/><span>${esc(v)}</span></label>`).join("")}</div></fieldset>`;
  }
  const fault = () => {
    const n = $("#account-save-fail"),
      v = n.checked;
    n.checked = false;
    return v;
  };
  function privateContactFields(form) {
    return `${field(form, "phone", "联系电话（含区号）", "tel", { optional: true, max: 24, placeholder: "+1 …" })}${field(form, "wechat", "微信号", "text", { optional: true, max: 60 })}`;
  }
  function profileDraft() {
    const list = clean(model.profile.carrier)
      .split(/[、·,]+/)
      .map(clean)
      .filter(Boolean);
    return {
      name: model.profile.name,
      bio: model.profile.bio || "",
      delivery: account.delivery,
      teamIntent: account.teamIntent,
      carriers: list.filter((x) => carriers.includes(x)),
      otherCarrier: list.filter((x) => !carriers.includes(x)).join("、"),
      regions: clean(model.profile.regions)
        .split("/")
        .map(clean)
        .filter(Boolean),
      vehicle: model.profile.vehicle || "",
      phone: account.personal.phone,
      wechat: account.personal.wechat,
    };
  }
  function teamDraft() {
    return {
      ...(own() || {
        name: "",
        carriers: [],
        regions: [],
        phone: "",
        wechat: "",
        publicContact: false,
      }),
      carriers: [...(own()?.carriers || [])].filter((x) =>
        carriers.includes(x),
      ),
      otherCarrier: (own()?.carriers || [])
        .filter((x) => !carriers.includes(x))
        .join("、"),
      regions: [...(own()?.regions || [])],
    };
  }
  function declaration(d) {
    if (!d?.available) return "";
    const ex = window.abasongExperience,
      day = d.startDay || ex.demoDay,
      end = d.endDay || day;
    if (ex.laInstant(end, d.endTime || "18:30") <= ex.state.now) return "";
    const label = (x) =>
      x === ex.demoDay ? "今天" : x === "2026-11-05" ? "明天" : x;
    return `${label(day)} ${time12(d.startTime || "15:00")}–${end !== day ? label(end) + " " : ""}${time12(d.endTime || "18:30")} 可接活`;
  }
  function item(action, title, sub = "") {
    return `<button class="account-row" data-action="${action}"><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${I("chevron")}</button>`;
  }
  function effectiveAvailability() {
    const a = model.availability,
      ex = window.abasongExperience;
    return (
      !!a.enabled &&
      ex.laInstant(a.endDate || a.date || ex.demoDay, a.end) > ex.state.now
    );
  }
  mePage = () => {
    if (!state.logged)
      return `<div class="root-content"><div class="page-scroll account-scroll">${rootHeader("我的")}<div class="profile-hero">${I("user")}<h2>欢迎使用 Abasong</h2></div>${btn("login", "登录", "button")}</div></div>${bottomNav("me")}`;
    const av = model.availability,
      live = effectiveAvailability();
    const summary = live
      ? `${av.date === window.abasongExperience.demoDay ? "今天" : av.date === "2026-11-05" ? "明天" : esc(av.date || "")} ${time12(av.start)}–${av.endDate && av.endDate !== av.date ? esc(av.endDate) + " " : ""}${time12(av.end)} · ${esc(av.regions.join(" / "))}`
      : "暂不接活";
    return `<div class="root-content"><div class="page-scroll account-scroll">${rootHeader("我的")}<button class="account-identity" data-action="edit-profile" aria-label="编辑个人资料">${avatar("me")}<span><strong>${esc(model.profile.name)}</strong><small>个人资料与联系方式</small></span>${I("chevron")}</button><section class="account-availability-row"><div><b>接活状态</b>${live ? `<button class="account-availability-summary" data-action="availability" aria-label="修改接活时段">${summary}</button>` : `<small>${summary}</small>`}</div><button class="switch ${live ? "on" : ""}" role="switch" aria-label="接活状态" aria-checked="${live}" aria-busy="${!!ui.availabilityBusy}" data-action="account-toggle-availability" ${ui.availabilityBusy ? "disabled" : ""}></button></section>${ui.availabilityError ? `<div class="account-availability-error" role="alert">${esc(ui.availabilityError)}</div>` : ""}<div class="account-contribution">${btn("lib-contribute", I("plus") + "共享门禁码", "button")}</div><section class="account-group account-main-tools">${item("lib-list", "我的公寓", "我保存的 · 我共享的")}${item("my-posts", "我的发布")}${item("my-applications", "我的报名")}</section><section class="account-group account-secondary-tools">${item("invite-open", "邀请司机")}${account.teamIntent || own()?.name ? item("organization", "我的团队", own()?.name || "添加团队资料") : ""}</section><section class="account-group">${item("settings", "设置")}</section></div></div>${bottomNav("me")}`;
  };

  profilePage = () => {
    const f = (state.forms.accountProfile ||= profileDraft());
    return formPage(
      "个人资料",
      "account-profile",
      `${formError()}${field("accountProfile", "name", "显示名", "text", { max: 60 })}${field("accountProfile", "bio", "简短介绍", "textarea", { optional: true, max: 500 })}<section class="account-form-section"><h2>使用用途</h2>${check("accountProfile", "delivery", "我接临时配送")}${check("accountProfile", "teamIntent", "我代表 DSP 找人")}</section>${f.delivery ? `<section class="account-form-section"><h2>配送经验</h2>${selection("accountProfile", "carriers", "配送过的快递公司", carriers)}${field("accountProfile", "otherCarrier", "其他快递公司", "text", { optional: true, max: 80 })}${selection("accountProfile", "regions", "熟悉区域（最多5个）", areas)}${field("accountProfile", "vehicle", "车型", "text", { choices: [["", "不填写"], "轿车", "SUV", "Van", "其他"] })}</section>` : ""}<details class="account-form-section" data-account-contact-settings ${f.contactOpen || f.phone || f.wechat ? "open" : ""}><summary>联系方式（选填）</summary><p class="account-caption">仅自己可见，可在聊天中自愿提供。</p>${privateContactFields("accountProfile")}</details><div class="account-form-section">${btn("organization", own()?.name ? "编辑团队资料" : "添加团队资料", "text-btn")}</div>`,
      ui.busy ? "保存中" : "保存资料",
      { disabled: ui.busy },
    );
  };
  organizationPage = () => {
    state.forms.accountTeam ||= teamDraft();
    return formPage(
      "团队资料（DSP）",
      "account-team",
      `${formError()}${field("accountTeam", "name", "团队名称", "text", { max: 120 })}<div class="account-contact-person"><span>联系人</span><b>${esc(model.profile.name)}</b>${btn("edit-profile", "编辑个人资料", "text-btn")}</div>${selection("accountTeam", "carriers", "合作快递公司", carriers)}${field("accountTeam", "otherCarrier", "其他合作快递", "text", { optional: true, max: 80 })}${selection("accountTeam", "regions", "主要配送区域（最多5个）", areas)}<section class="account-form-section"><h2>业务联系方式（选填）</h2>${privateContactFields("accountTeam")}${check("accountTeam", "publicContact", "向登录用户展示业务联系方式")}</section><p class="account-caption">资料由本人填写</p>`,
      ui.busy ? "保存中" : "保存团队资料",
      { disabled: ui.busy },
    );
  };
  driverPage = (id) => {
    const d = getDriver(id);
    if (!d || account.closed.includes(id))
      return page("个人资料", empty("账号已注销"));
    const peer =
        id === "me" ? account : account.peers[id] || { delivery: true },
      t = teamFor(id),
      b = blocked(id),
      time = declaration(d);
    return page(
      "个人资料",
      `<div class="profile-hero">${avatar(id)}<h2>${esc(nameOf(id))}</h2>${peer.delivery && d.vehicle ? `<p class="account-caption">${esc(d.vehicle)}</p>` : ""}</div>${peer.delivery ? `${time ? `<div class="available-card"><b>${esc(time)}</b></div>` : ""}${row("配送过的快递公司", d.carrier || "未填写")}${row("熟悉区域", d.region || model.profile.regions || "未填写")}` : ""}${d.bio ? `<p class="account-bio">${esc(d.bio)}</p>` : ""}${t?.name ? `<section class="account-team-summary"><h3>${esc(t.name)}</h3>${row("联系人", nameOf(id))}${t.carriers.length ? row("合作快递公司", t.carriers.join("、")) : ""}${t.regions.length ? row("主要配送区域", t.regions.join(" / ")) : ""}${contactButton(id)}</section>` : ""}<div class="button-row">${id === "me" ? btn("edit-profile", "编辑个人资料", "button") : btn("contact", b ? "已屏蔽" : "联系", "button", `data-person="${id}" ${b ? "disabled" : ""}`)}</div>`,
      id !== "me"
        ? ib("person-more", "more", "更多操作", `data-id="${id}"`)
        : "",
    );
  };
  requestForm = () => {
    const f = state.forms.request,
      j = getJob(state.editing);
    const picker =
      j && j.status !== "draft"
        ? `<section class="account-form-section">${row("发布身份", j.org || "个人")}</section>`
        : `<section class="account-form-section"><h2>发布身份</h2><div class="account-publisher-options">${btn("account-publisher", "个人", !f.asOrg ? "active" : "", 'data-id="personal" aria-pressed="' + !f.asOrg + '"')}${btn(own()?.name ? "account-publisher" : "account-create-team", own()?.name ? "代表 " + esc(own().name) : "添加团队资料", f.asOrg ? "active" : "", 'data-id="team" aria-pressed="' + !!f.asOrg + '"')}</div></section>`;
    return base
      .requestForm()
      .replace(
        check(
          "request",
          "asOrg",
          `以${model.organization || "我的团队"}名义发布`,
        ),
        "",
      )
      .replace(/(<form[^>]*data-submit="request"[^>]*>)/, "$1" + picker);
  };
  jobFromForm = (f, existing) => {
    const j = base.jobFromForm(f, existing);
    if (existing && existing.status !== "draft") {
      j.org = existing.org;
      j.teamId = existing.teamId;
    } else {
      j.org = f.asOrg ? own()?.name || null : null;
      j.teamId = f.asOrg ? own()?.id || null : null;
    }
    return j;
  };
  jobDetail = (id, publicOnly = false) => {
    const j = getJob(id),
      html = base.jobDetail(id, publicOnly);
    if (!j || publicOnly || state.route.view === "public") return html;
    const old = person(
      j.owner,
      j.org ? `${j.org} · 自报组织来源` : "个人发布",
      "driver",
    );
    const block = `<section class="account-publisher-summary">${person(j.owner, j.org ? `${j.org} · 联系人` : "个人发布", "driver")}${j.org ? contactButton(j.owner) : ""}</section>`;
    return html.replace(old, block);
  };
  function validContact(f) {
    const phone = clean(f.phone),
      wechat = clean(f.wechat),
      digits = phone.replace(/\D/g, "");
    if (
      phone &&
      (!/^\+?[\d ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15)
    )
      return { phone: "请核对联系电话与区号" };
    if (wechat.length > 60 || /[\r\n]/.test(wechat))
      return { wechat: "请核对微信号" };
    if (f.publicContact && !phone && !wechat)
      return { _: "请填写至少一种业务联系方式，或关闭展示" };
    return null;
  }
  function save(kind, commit) {
    if (ui.busy || !state.logged) return;
    const f = state.forms[kind],
      g = ui.generation,
      route = state.route.view,
      failed = fault();
    ui.busy = true;
    state.errors = {};
    render();
    setTimeout(() => {
      if (g !== ui.generation) return;
      ui.busy = false;
      if (
        !state.logged ||
        state.route.view !== route ||
        state.forms[kind] !== f
      )
        return;
      if (failed) {
        state.errors._ = "保存未成功，填写内容已保留";
        render();
        return;
      }
      commit(f);
      state.forms[kind] = null;
      state.errors = {};
      back();
      toast("已保存");
    }, 300);
  }
  const originalModal = renderModal;
  renderModal = () => {
    const m = state.modal;
    if (m?.type === "account-leave") {
      $("#overlay").innerHTML =
        `<section class="dialog" role="dialog" aria-modal="true" aria-label="离开资料编辑"><h2>${m.key === "accountProfile" ? "离开个人资料？" : "离开团队资料？"}</h2>${btn("account-keep", "保留草稿并返回", "button")}${btn("account-discard", "放弃草稿", "button secondary")}${btn("close-modal", "继续编辑", "text-btn wide-link")}</section>`;
      return;
    }
    if (m?.type === "account-contact") {
      const c = m.self
        ? state.logged
          ? account.personal
          : null
        : publicContact(m.person);
      const title = m.self
        ? "我的联系方式"
        : `${nameOf(m.person)} · 业务联系方式`;
      $("#overlay").innerHTML =
        `<section class="dialog account-contact-dialog" role="dialog" aria-modal="true" aria-label="联系方式"><div class="close-row"><h2>${esc(title)}</h2>${ib("close-modal", "close", "关闭")}</div>${c && (c.phone || c.wechat) ? `${c.phone ? `<div class="account-contact-value"><span>电话</span><b>${esc(c.phone)}</b>${btn("account-copy", "复制号码", "text-btn", 'data-id="phone"')}</div>` : ""}${c.wechat ? `<div class="account-contact-value"><span>微信号</span><b>${esc(c.wechat)}</b>${btn("account-copy", "复制微信号", "text-btn", 'data-id="wechat"')}</div>` : ""}${ui.contactError ? `<p class="form-error" role="alert">${esc(ui.contactError)}</p>` : ""}` : m.self ? `<p>尚未填写联系方式</p>${btn("edit-profile", "去填写", "button")}` : "<p>联系方式暂不可查看</p>"}</section>`;
      return;
    }
    if (m?.type === "menu")
      m.items = m.items.filter(
        (x) =>
          !["save-contact", "contacts", "edit-note", "remove-contact"].includes(
            x.action,
          ),
      );
    originalModal();
  };
  actions = (a, b) => {
    const id = b?.dataset.id,
      pid = b?.dataset.person || id;
    if (a === "edit-profile") {
      if (!requireLogin(() => actions(a, b))) return;
      closeModal();
      state.forms.accountProfile ||= profileDraft();
      state.errors = {};
      nav("profile");
      return;
    }
    if (a === "organization" || a === "account-create-team") {
      if (!requireLogin(() => actions(a, b))) return;
      closeModal();
      state.forms.accountTeam ||= teamDraft();
      state.errors = {};
      ui.teamPublishIntent =
        a === "account-create-team" ? state.forms.request : null;
      nav("organization");
      return;
    }
    if (a === "account-publisher") {
      if (!state.editing || getJob(state.editing)?.status === "draft") {
        state.forms.request.asOrg = id === "team" && !!own()?.name;
        render();
      }
      return;
    }
    if (a === "account-view-contact" || a === "account-my-contact") {
      if (!state.logged || (a === "account-view-contact" && !publicContact(id)))
        return;
      ui.contactError = null;
      modal("account-contact", {
        person: id,
        self: a === "account-my-contact",
      });
      return;
    }
    if (a === "account-copy") {
      const m = state.modal,
        c =
          m?.type === "account-contact"
            ? m.self
              ? state.logged
                ? account.personal
                : null
              : publicContact(m.person)
            : null,
        value = c?.[id];
      if (!value) return;
      Promise.resolve()
        .then(() => navigator.clipboard.writeText(value))
        .then(() => {
          if (state.modal === m) toast("已复制");
        })
        .catch(() => {
          if (state.modal === m) {
            ui.contactError = "复制未成功，请长按选择上方内容";
            renderModal();
          }
        });
      return;
    }
    if (
      a === "back" &&
      ["profile", "organization"].includes(state.route.view)
    ) {
      if (ui.busy) return;
      const key =
        state.route.view === "profile" ? "accountProfile" : "accountTeam";
      const saved = key === "accountProfile" ? profileDraft() : teamDraft(),
        fields =
          key === "accountProfile"
            ? [
                "name",
                "bio",
                "delivery",
                "teamIntent",
                "carriers",
                "otherCarrier",
                "regions",
                "vehicle",
                "phone",
                "wechat",
              ]
            : [
                "name",
                "carriers",
                "otherCarrier",
                "regions",
                "phone",
                "wechat",
                "publicContact",
              ];
      const take = (f) => fields.map((k) => f?.[k] ?? "");
      ui.teamPublishIntent = null;
      if (
        state.forms[key] &&
        JSON.stringify(take(state.forms[key])) !== JSON.stringify(take(saved))
      ) {
        modal("account-leave", { key });
        return;
      }
      state.forms[key] = null;
      back();
      return;
    }
    if (a === "account-keep" || a === "account-discard") {
      if (state.modal?.type !== "account-leave") return;
      if (a === "account-discard") state.forms[state.modal.key] = null;
      ui.teamPublishIntent = null;
      closeModal();
      back();
      return;
    }
    if (
      [
        "contacts",
        "save-contact",
        "edit-note",
        "remove-contact",
        "account-contacts-retry",
      ].includes(a)
    )
      return;
    if (a === "account-toggle-availability") {
      if (!state.logged || ui.availabilityBusy) return;
      ui.availabilityError = null;
      if (!effectiveAvailability()) {
        base.actions("availability", b);
        state.forms.availability.enabled = true;
        state.forms.availability.fromToggle = true;
        render();
        return;
      }
      const g = ui.generation,
        failed = fault();
      ui.availabilityBusy = true;
      render();
      setTimeout(() => {
        if (g !== ui.generation || !state.logged) return;
        ui.availabilityBusy = false;
        if (failed) ui.availabilityError = "未能关闭接活状态，请重试";
        else {
          model.availability.enabled = false;
          toast("已停止接活");
        }
        render();
      }, 180);
      return;
    }
    base.actions(a, b);
    if (a === "chat-more" && state.modal?.type === "menu") {
      const c = model.chats.find((x) => x.id === id);
      if (state.logged && c && !blocked(c.person)) {
        state.modal.items.unshift({
          label: "我的联系方式",
          action: "account-my-contact",
          icon: "user",
        });
        renderModal();
      }
    }
  };
  submitForm = (kind, form) => {
    if (kind === "account-profile") {
      const f = state.forms.accountProfile;
      if (!clean(f.name) || clean(f.name).length > 60) {
        fail({ name: "请输入显示名（最多60字）" });
        return;
      }
      const e = validContact(f);
      if (e) {
        fail(e);
        return;
      }
      const commit = (x) => {
        account.delivery = x.delivery;
        account.teamIntent = x.teamIntent;
        account.personal = { phone: clean(x.phone), wechat: clean(x.wechat) };
        model.profile = {
          ...model.profile,
          name: clean(x.name),
          bio: clean(x.bio),
        };
        if (x.delivery)
          Object.assign(model.profile, {
            carrier: [...x.carriers, clean(x.otherCarrier)]
              .filter(Boolean)
              .join("、"),
            regions: x.regions.join(" / "),
            vehicle: x.vehicle,
          });
      };
      if (!f.delivery && effectiveAvailability()) {
        confirmAction(
          "同时关闭可接活状态？",
          "关闭后不再推荐本次可接活时段。",
          () => {
            closeModal();
            save("accountProfile", (x) => {
              model.availability.enabled = false;
              commit(x);
            });
          },
        );
        return;
      }
      save("accountProfile", commit);
      return;
    }
    if (kind === "account-team") {
      const f = state.forms.accountTeam;
      if (!clean(f.name) || clean(f.name).length > 120) {
        fail({ name: "请输入团队名称（最多120字）" });
        return;
      }
      const e = validContact(f);
      if (e) {
        fail(e);
        return;
      }
      save("accountTeam", (x) => {
        account.team = {
          id: own()?.id || "team-me",
          name: clean(x.name),
          carriers: [...x.carriers, clean(x.otherCarrier)].filter(Boolean),
          regions: [...x.regions],
          phone: clean(x.phone),
          wechat: clean(x.wechat),
          publicContact: !!x.publicContact,
        };
        account.teamIntent = true;
        model.organization = account.team.name;
        if (
          ui.teamPublishIntent &&
          ui.teamPublishIntent === state.forms.request
        )
          state.forms.request.asOrg = true;
        ui.teamPublishIntent = null;
      });
      return;
    }
    base.submitForm(kind, form);
  };
  render = () => {
    if (state.route.view === "contacts") {
      state.route = { view: "me", args: {} };
      state.stack = [];
    }

    if (state.route.view === "profile" && state.forms.accountProfile) {
      const panel = $("[data-account-contact-settings]");
      if (panel) state.forms.accountProfile.contactOpen = panel.open;
    }
    if (ui.lastLogged && !state.logged) {
      ui.availabilityBusy = false;
      ui.availabilityError = null;
      ui.generation++;
      ui.busy = false;
      state.forms.accountProfile = null;
      state.forms.accountTeam = null;
      ui.teamPublishIntent = null;
      ui.contactError = null;
    }
    ui.lastLogged = state.logged;
    const scroll = ["profile", "organization", "contacts"].includes(
      state.route.view,
    )
      ? $(".account-form,.account-contacts")?.closest(".page-scroll")?.scrollTop
      : null;
    base.render();
    if (["profile", "organization"].includes(state.route.view)) {
      const f = $(
        '[data-submit="account-profile"],[data-submit="account-team"]',
      );
      if (f) f.classList.add("account-form");
      if (scroll != null && f) f.closest(".page-scroll").scrollTop = scroll;
      if (ui.busy)
        document
          .querySelectorAll(
            ".account-form input,.account-form select,.account-form textarea,.account-form button",
          )
          .forEach((n) => (n.disabled = true));
    }
    if (
      state.route.view === "contacts" &&
      scroll != null &&
      $(".account-contacts")
    )
      $(".account-contacts").closest(".page-scroll").scrollTop = scroll;
    if (["profile", "organization"].includes(state.route.view)) {
      $("#screen-title").textContent =
        state.route.view === "profile" ? "个人资料" : "团队资料（DSP）";
    }
  };
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.accountArray) {
      const f = state.forms[t.dataset.accountForm],
        k = t.dataset.accountArray;
      if (!f) return;
      const next = t.checked
        ? [...new Set([...f[k], t.value])]
        : f[k].filter((x) => x !== t.value);
      if (next.length > 5) toast("最多选择5项");
      else f[k] = next;
      capture();
      render();
      return;
    }
    if (
      t.dataset.formKey === "accountProfile" &&
      ["delivery", "teamIntent"].includes(t.dataset.field)
    ) {
      capture();
      render();
    }
  });
  $("#account-peer-state").addEventListener("change", (e) => {
    account.peers.d3.team.publicContact = e.target.value === "open";
    account.closed = e.target.value === "deleted" ? ["d3"] : [];
    render();
  });
  resetPrototype = () => {
    ui.generation++;
    ui.busy = false;
    ui.contactError = null;
    ui.teamPublishIntent = null;
    ui.availabilityBusy = false;
    ui.availabilityError = null;
    $("#account-save-fail").checked = false;
    $("#account-peer-state").value = "private";
    base.resetPrototype();
    seed();
    render();
  };
  $("#inspect-page option[value=contacts]")?.remove();
  delete screens.contacts;
  screens.profile = ["U02", "个人资料"];
  screens.organization = ["U10", "团队资料（DSP）"];
  for (const v of ["profile", "organization"]) {
    const n = $(`#inspect-page option[value="${v}"]`);
    if (n) n.textContent = screens[v].join(" · ");
  }
  window.abasongAccount = {
    version: "3.2-account",
    get state() {
      return account;
    },
    ui,
  };
  if (new URLSearchParams(location.search).get("task") === "me")
    nav("me", {}, true);
  else render();
})();
