"use strict";
// Synthetic driver-circle prototype. No service, GPS, notifications or messages are sent.
(() => {
  const base = { render, actions, submitForm, resetPrototype, nav, inboxPage };
  const topics = ["配送提问", "经验分享", "路上见闻"];
  const ui = {
    scenario: "normal",
    feedScroll: 0,
    expanded: new Set(),
    drafts: {},
    errors: {},
    busy: new Set(),
    generation: 0,
    publishing: false,
    publishError: null,
    lastView: null,
    lastLogged: state.logged,
    order: 200,
  };
  const post = (id) => model.posts.find((p) => p.id === id);
  const visible = (p) => p && !model.blocks.includes(p.author);
  function seed() {
    Object.assign(model.posts[0], {
      region: "Alhambra",
      topic: "经验分享",
      order: 100,
    });
    Object.assign(model.posts[1], {
      region: "West Covina",
      topic: "配送提问",
      order: 90,
    });
    model.posts.push({
      id: "circle-long",
      author: "d1",
      region: "Pasadena",
      topic: "经验分享",
      order: 80,
      time: "2小时前",
      job: null,
      comments: [],
      text: "换到不熟悉的线路，我会先把相近门牌的包裹放在一起，避免到了公寓门口再翻找。\n同一条街的单双号有时在道路两边，先核对面单的门牌和街道，再看建筑上的数字。\n一个社区有不同门牌时，也不能因为名字相同就默认从同一扇门进去。遇到资料不明确的地方，我会先停好车，再核对当前地址。\n你们跑新线路时，有什么能少绕路的小习惯？",
    });
    const own = post("p2");
    own.comments.push({
      id: "circle-demo-reply",
      author: "d2",
      time: "刚刚",
      text: "我下午有时间，先看看需求里的取件安排。",
    });
    model.notifications.unshift({
      id: "circle-notice",
      title: "同行回复了你的动态",
      sub: "查看回复",
      post: "p2",
      actor: "d2",
      read: false,
    });
  }
  seed();
  function sourceCard(id) {
    const j = getJob(id);
    if (
      !j ||
      j.discarded ||
      j.status === "draft" ||
      model.blocks.includes(j.owner) ||
      ui.scenario === "source-unavailable"
    )
      return '<div class="circle-source-unavailable">关联需求暂不可查看</div>';
    const label = isOpen(j)
      ? statusLabel("open")
      : statusLabel(j.status === "open" ? "expired" : j.status);
    return `<button class="circle-source" data-action="circle-job" data-id="${j.id}" data-request-id="${j.id}" data-version="${j.version}"><span class="circle-source-meta">${esc(kindLabel(j.kind))}<span>${esc(label)}</span></span><span class="circle-source-title"><b>${esc(j.region)}</b><strong>${money(j)}</strong></span><span class="circle-source-facts">${j.date === window.abasongExperience.demoDay ? "今天" : j.date === "2026-11-05" ? "明天" : esc(j.date)} ${time12(j.start)} · 剩余 ${j.remaining} 件${j.remainingDrivers ? ` · 需${j.remainingDrivers}人` : ""}</span><span class="circle-source-meta">取件 ${esc(j.pickup || "联系确认")}</span></button>`;
  }
  function author(p) {
    const name =
      p.author === "me"
        ? model.profile.name
        : getDriver(p.author)?.name || "同行";
    return `<div class="circle-author-row"><button class="circle-author" data-action="circle-author" data-id="${p.author}" aria-label="查看${esc(name)}的资料">${avatar(p.author)}<span><b>${esc(name)}</b><small>${esc([p.region, p.time].filter(Boolean).join(" · "))}</small></span></button>${ib("post-more", "more", "动态操作", `data-id="${p.id}"`)}</div>`;
  }
  postCard = (p, detail = false) => {
    const expanded = detail || ui.expanded.has(p.id),
      long = p.text.length > 100;
    const comments = p.comments.filter((c) => !model.blocks.includes(c.author));
    return `<article class="feed-card circle-card" data-post-id="${p.id}">${author(p)}${p.topic ? `<span class="circle-topic">${esc(p.topic)}</span>` : ""}<div class="post-text circle-text ${long && !expanded ? "circle-clamp" : ""}" ${!detail ? `role="button" tabindex="0" data-action="post" data-id="${p.id}" aria-label="查看动态详情"` : ""}>${esc(p.text)}</div>${long && !detail ? btn("circle-expand", expanded ? "收起" : "展开", "circle-text-action", `data-id="${p.id}" aria-expanded="${expanded}"`) : ""}${p.job ? sourceCard(p.job) : ""}${detail ? "" : `<div class="circle-footer">${btn("post", I("chat") + (comments.length ? `回复 ${comments.length}` : "回复"), "circle-reply-link", `data-id="${p.id}"`)}</div>`}</article>`;
  };
  circlePage = () => {
    const list =
      ui.scenario === "empty"
        ? []
        : model.posts
            .filter(visible)
            .sort((a, b) => (b.order || 0) - (a.order || 0));
    let content;
    if (ui.scenario === "loading")
      content = '<div class="circle-status" role="status">正在加载动态</div>';
    else if (ui.scenario === "error")
      content = `<div class="circle-status" role="alert"><p>动态暂时无法加载</p>${btn("circle-retry", "重新加载", "button secondary")}</div>`;
    else
      content = list.length
        ? list.map((p) => postCard(p)).join("")
        : `<div class="circle-status"><h2>还没有动态</h2>${btn("new-post", "发布动态", "button secondary")}</div>`;
    return `<div class="root-content circle-root"><div class="page-scroll circle-scroll"><div class="page-head circle-root-head"><span class="spacer"></span><h1>司机圈</h1>${btn("circle-publish", "发布", "circle-publish")}</div><div class="circle-feed">${content}</div></div></div>${bottomNav("circle")}`;
  };
  inboxPage = () => {
    if (state.inboxTab !== "notices") return base.inboxPage();
    const notices = model.notifications.filter(
      (n) => !n.actor || !model.blocks.includes(n.actor),
    );
    return page(
      "消息",
      `<div class="segmented">${btn("inbox-tab", "对话", "", 'data-id="chats"')}${btn("inbox-tab", "通知", "active", 'data-id="notices"')}</div>${notices.length ? notices.map((n) => `<button class="list-button" data-action="notice" data-id="${n.id}"><span class="avatar">${I("bell")}</span><div class="list-main"><div class="list-title">${esc(n.title)}</div><div class="list-sub">${esc(n.sub)}</div></div>${n.read ? "" : '<span class="notification-dot"></span>'}</button>`).join("") : empty("暂无通知")}`,
    );
  };
  function unavailable(title) {
    return page(
      "动态",
      `<div class="circle-status"><h2>${title}</h2>${btn("circle-home", "返回司机圈", "button secondary")}</div>`,
    );
  }
  postPage = () => {
    const p = post(state.route.args.id);
    if (!p || ui.scenario === "deleted") return unavailable("动态已删除");
    if (!visible(p)) return unavailable("已屏蔽该作者");
    const comments = p.comments.filter((c) => !model.blocks.includes(c.author)),
      busy = ui.busy.has(p.id);
    const draft = ui.drafts[p.id] || "";
    return `<div class="root-content circle-detail"><div class="circle-detail-head">${header("动态与回复")}</div><div class="page-scroll circle-detail-scroll">${postCard(p, true)}<section class="circle-comments" aria-label="回复"><h2>${comments.length ? `回复 ${comments.length}` : "还没有回复"}</h2>${comments.map((c) => `<article class="circle-comment" data-comment-id="${c.id}"><div class="circle-comment-head"><button data-action="circle-author" data-id="${c.author}">${esc(c.author === "me" ? model.profile.name : getDriver(c.author)?.name || "同行")}</button><span>${esc(c.time || "刚刚")}${c.author === "me" ? btn("delete-comment", "删除", "text-btn", `data-post="${p.id}" data-id="${c.id}"`) : ""}</span></div><p>${esc(c.text)}</p></article>`).join("")}</section></div><form class="circle-composer" data-submit="comment">${ui.errors[p.id] ? `<p class="circle-error" role="alert">${esc(ui.errors[p.id])}</p>` : ""}<label class="sr-only" for="comment-input">回复动态</label><textarea id="comment-input" maxlength="1000" placeholder="分享你的看法" ${busy ? "disabled" : ""}>${esc(draft)}</textarea><button class="button" type="submit" ${busy || !draft.trim() ? "disabled" : ""}>${busy ? "发送中" : "发送"}</button></form></div>`;
  };
  postForm = () => {
    const f = (state.forms.post ||= {
      text: "",
      topic: "",
      region: "",
      job: "",
    });
    return `<div class="root-content circle-editor"><div class="page-scroll">${header("发布动态")}<form data-submit="post" novalidate>${ui.publishError ? `<p class="circle-error" role="alert">${esc(ui.publishError)}</p>` : ""}${field("post", "text", "内容", "textarea", { placeholder: "分享配送经验、提问或路上见闻", max: 2000 })}<div class="circle-editor-options">${field("post", "topic", "内容标签", "text", { optional: true, choices: [["", "不选择"], ...topics] })}${field("post", "region", "配送区域", "text", { optional: true, choices: [["", "不选择"], ...areas] })}${field("post", "job", "关联我的支援需求", "text", { optional: true, choices: [["", "不关联"], ...model.jobs.filter((j) => j.owner === "me" && j.status !== "draft" && !j.discarded).map((j) => [j.id, `${j.region} · ${statusLabel(j.status)}`])] })}</div></form></div><div class="circle-editor-actions"><button class="button" type="submit" form="circle-post-form" ${ui.publishing ? "disabled" : ""}>${ui.publishing ? "发布中" : "发布"}</button></div></div>`;
  };
  const sensitive = (text) =>
    /(?:(?:门禁|大门|进门|公寓|行人门|侧门).{0,8}(?:密码|门码)|gate\s*code|access\s*code)\s*[:：]?\s*[#*\d]{4,}/i.test(
      text,
    );
  const failOnce = (id) => {
    const n = $(id),
      yes = !!n?.checked;
    if (n) n.checked = false;
    return yes;
  };
  function publish() {
    if (ui.publishing) return;
    if (!state.logged) {
      beginAuth(publish);
      return;
    }
    const f = state.forms.post,
      text = (f?.text || "").trim();
    if (!text) {
      ui.publishError = "请输入动态内容";
      render();
      return;
    }
    if (text.length > 2000) {
      ui.publishError = "内容最多2000字";
      render();
      return;
    }
    if (sensitive(text)) {
      ui.publishError = "公寓密码请通过贡献入口共享";
      render();
      return;
    }
    const j = f.job ? getJob(f.job) : null;
    if (
      f.job &&
      (!j || j.owner !== "me" || j.discarded || j.status === "draft")
    ) {
      ui.publishError = "关联需求暂不可查看，请重新选择";
      render();
      return;
    }
    const data = { ...f, text },
      g = ui.generation,
      failed = failOnce("#circle-post-fail");
    ui.publishing = true;
    ui.publishError = null;
    render();
    setTimeout(() => {
      if (g !== ui.generation) return;
      ui.publishing = false;
      if (!state.logged || failed) {
        ui.publishError = "发布未成功，填写内容已保留";
        if (state.route.view === "postForm") render();
        return;
      }
      const linked = data.job ? getJob(data.job) : null;
      if (
        data.job &&
        (!linked ||
          linked.owner !== "me" ||
          linked.discarded ||
          linked.status === "draft")
      ) {
        ui.publishError = "关联需求暂不可查看，请重新选择";
        render();
        return;
      }
      const p = {
        id: uid(),
        author: "me",
        text: data.text,
        topic: data.topic,
        region: data.region,
        job: data.job || null,
        time: "刚刚",
        order: ++ui.order,
        comments: [],
      };
      model.posts.unshift(p);
      state.forms.post = null;
      nav("post", { id: p.id }, true);
      toast("已发布");
    }, 320);
  }
  function reply() {
    const id = state.route.args.id,
      p = post(id),
      text = ($("#comment-input")?.value || "").trim();
    if (!state.logged) {
      beginAuth(reply);
      return;
    }
    if (!visible(p) || ui.busy.has(id) || !text) return;
    ui.drafts[id] = text;
    if (sensitive(text)) {
      ui.errors[id] = "公寓密码请通过贡献入口共享";
      render();
      return;
    }
    const g = ui.generation,
      failed = failOnce("#circle-reply-fail");
    ui.busy.add(id);
    ui.errors[id] = null;
    render();
    setTimeout(() => {
      if (g !== ui.generation) return;
      ui.busy.delete(id);
      if (!visible(post(id)) || !state.logged) return render();
      if (failed) {
        ui.errors[id] = "回复未成功，内容已保留";
      } else {
        post(id).comments.push({ id: uid(), author: "me", text, time: "刚刚" });
        ui.drafts[id] = "";
        ui.errors[id] = null;
      }
      if (state.route.view === "post" && state.route.args.id === id) render();
    }, 260);
  }
  const baseModal = renderModal;
  renderModal = () => {
    if (state.modal?.type !== "circle-leave") return baseModal();
    $("#overlay").innerHTML =
      `<section class="dialog" role="dialog" aria-modal="true" aria-label="离开发布动态"><h2>离开发布动态？</h2>${btn("circle-keep-draft", "保留草稿并返回", "button")}${btn("circle-discard", "放弃草稿", "button secondary")}${btn("close-modal", "继续编辑", "text-btn wide-link")}</section>`;
  };
  actions = (a, b) => {
    const id = b?.dataset.id;
    if (a === "circle-publish") {
      modal("menu", {
        title: "发布",
        items: [
          { label: "发动态", action: "new-post", icon: "edit" },
          { label: "发临时需求", action: "publish", icon: "box" },
        ],
      });
      return;
    }
    if (a === "new-post") {
      closeModal();
      if (!state.logged) {
        beginAuth(() => actions("new-post"));
        return;
      }
      state.forms.post ||= { text: "", topic: "", region: "", job: "" };
      ui.publishError = null;
      nav("postForm");
      return;
    }
    if (a === "post") {
      ui.errors[id] = null;
      nav("post", { id });
      return;
    }
    if (a === "circle-author") {
      if (id === "me") nav("profile");
      else if (model.blocks.includes(id)) toast("已屏蔽该作者");
      else nav("driver", { id });
      return;
    }
    if (a === "circle-expand") {
      ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
      render();
      return;
    }
    if (a === "circle-job") {
      base.actions("job", b);
      return;
    }
    if (a === "circle-home") {
      nav("circle", {}, true);
      return;
    }
    if (a === "circle-retry") {
      $("#circle-state").value = "normal";
      ui.scenario = "loading";
      render();
      const g = ui.generation;
      setTimeout(() => {
        if (g === ui.generation) {
          ui.scenario = "normal";
          render();
        }
      }, 250);
      return;
    }
    if (a === "notice") {
      const n = model.notifications.find((n) => n.id === id);
      if (n?.post) {
        n.read = true;
        if (n.actor && model.blocks.includes(n.actor)) {
          toast("该通知暂不可查看");
          return;
        }
        nav("post", { id: n.post });
        return;
      }
    }
    if (a === "back" && state.route.view === "postForm") {
      if (ui.publishing) return;
      if (state.forms.post?.text.trim()) {
        modal("circle-leave");
        return;
      }
      back();
      return;
    }
    if (a === "circle-keep-draft" || a === "circle-discard") {
      if (a === "circle-discard") state.forms.post = null;
      closeModal();
      back();
      return;
    }
    base.actions(a, b);
  };
  submitForm = (type, form) => {
    if (type === "post") return publish();
    if (type === "comment") return reply();
    return base.submitForm(type, form);
  };
  render = () => {
    if (ui.lastLogged && !state.logged) {
      ++ui.generation;
      ui.drafts = {};
      ui.errors = {};
      ui.busy.clear();
      ui.publishing = false;
      ui.publishError = null;
      state.forms.post = null;
    }
    ui.lastLogged = state.logged;
    const staying = ui.lastView === "circle" && state.route.view === "circle";
    if (staying)
      ui.feedScroll = $(".circle-scroll")?.scrollTop ?? ui.feedScroll;
    base.render();
    if (state.route.view === "circle")
      $(".circle-scroll").scrollTop = staying
        ? ui.feedScroll
        : (state.route.scroll ?? ui.feedScroll);
    if (state.route.view === "postForm") {
      $('[data-submit="post"]').id = "circle-post-form";
      if (ui.publishing)
        document
          .querySelectorAll(
            '[data-submit="post"] input,[data-submit="post"] textarea,[data-submit="post"] select',
          )
          .forEach((n) => (n.disabled = true));
    }
    ui.lastView = state.route.view;
  };
  document.addEventListener("input", (e) => {
    if (e.target.id !== "comment-input" || state.route.view !== "post") return;
    ui.drafts[state.route.args.id] = e.target.value;
    const send = $('.circle-composer [type="submit"]');
    if (send) send.disabled = !e.target.value.trim();
  });
  $("#circle-state").addEventListener("change", (e) => {
    ui.scenario = e.target.value;
    render();
  });
  resetPrototype = () => {
    ++ui.generation;
    ui.expanded.clear();
    ui.drafts = {};
    ui.errors = {};
    ui.busy.clear();
    ui.scenario = "normal";
    ui.feedScroll = 0;
    ui.lastView = null;
    ui.publishing = false;
    ui.publishError = null;
    ui.order = 200;
    $("#circle-state").value = "normal";
    $("#circle-post-fail").checked = false;
    $("#circle-reply-fail").checked = false;
    base.resetPrototype();
    seed();
    render();
  };
  window.abasongCircle = { version: "3.2-circle", state: ui };
  if (new URLSearchParams(location.search).get("task") === "circle")
    nav("circle", {}, true);
  else render();
})();
