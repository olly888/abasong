"use strict";
// Synthetic driver-circle prototype. No service, GPS, notifications or messages are sent.
(() => {
  const base = { render, actions, submitForm, resetPrototype, nav, inboxPage };
  const fixtures = [
    { id: "entry", src: "assets/circle-entry.svg", alt: "TEST 公寓入口示意图" },
    {
      id: "courtyard",
      src: "assets/circle-courtyard.svg",
      alt: "TEST 庭院通道示意图",
    },
    {
      id: "parcel",
      src: "assets/circle-parcel-room.svg",
      alt: "TEST 包裹房示意图",
    },
  ];
  const fixture = (id) => fixtures.find((x) => x.id === id);
  const photoMode = () => $("#circle-photo-state").value;
  const photos = (p) => (p?.images || []).filter((x) => fixture(x.id));
  function pictureGrid(p) {
    const list = photos(p);
    if (!list.length) return "";
    return `<div class="circle-pictures circle-pictures-${list.length}">${list.map((x, i) => `<button class="circle-picture" data-action="circle-view-photo" data-id="${p.id}" data-index="${i}" aria-label="查看第${i + 1}张图片，共${list.length}张"><img src="${fixture(x.id).src}" alt="${fixture(x.id).alt}" width="960" height="640" data-circle-thumb="true" draggable="false" /></button>`).join("")}</div>`;
  }
  function photoEditor(f) {
    const list = photos(f),
      disabled = ui.publishing ? "disabled" : "";
    return `<section class="circle-photo-editor" aria-label="添加图片"><div class="circle-photo-heading"><span>图片 <small>选填</small></span><span>${list.length}/3</span></div><div class="circle-photo-thumbs">${list.map((x, i) => `<div class="circle-photo-thumb" data-photo-id="${x.id}"><button class="circle-photo-preview" data-action="circle-preview-draft" data-index="${i}" aria-label="预览第${i + 1}张图片" ${disabled}><img src="${fixture(x.id).src}" alt="${fixture(x.id).alt}" width="960" height="640" draggable="false" /></button><button class="circle-photo-remove" data-action="circle-remove-photo" data-id="${x.id}" aria-label="移除第${i + 1}张图片" ${disabled}>${I("close")}</button>${x.upload === "uploading" ? '<span class="circle-photo-progress" role="status">上传中</span>' : x.upload === "failed" ? '<span class="circle-photo-progress failed">上传失败</span>' : ""}</div>`).join("")}${list.length < 3 ? `<button class="circle-photo-add" data-action="circle-add-photo" aria-label="添加图片" ${disabled}>${I("plus")}<span>添加图片</span></button>` : ""}</div><p class="circle-photo-note">不要上传面单、住户信息或门禁码。</p></section>`;
  }
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
      images: [{ id: "entry" }],
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
    return `<article class="feed-card circle-card" data-post-id="${p.id}">${author(p)}${p.topic ? `<span class="circle-topic">${esc(p.topic)}</span>` : ""}<div class="post-text circle-text ${long && !expanded ? "circle-clamp" : ""}" ${!detail ? `role="button" tabindex="0" data-action="post" data-id="${p.id}" aria-label="查看动态详情"` : ""}>${esc(p.text)}</div>${long && !detail ? btn("circle-expand", expanded ? "收起" : "展开", "circle-text-action", `data-id="${p.id}" aria-expanded="${expanded}"`) : ""}${pictureGrid(p)}${p.job ? sourceCard(p.job) : ""}${detail ? "" : `<div class="circle-footer">${btn("post", I("chat") + (comments.length ? `回复 ${comments.length}` : "回复"), "circle-reply-link", `data-id="${p.id}"`)}</div>`}</article>`;
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
      images: [],
    });
    return `<div class="root-content circle-editor"><div class="page-scroll">${header("发布动态")}<form data-submit="post" novalidate>${ui.publishError ? `<p class="circle-error" role="alert">${esc(ui.publishError)}</p>` : ""}${field("post", "text", "内容", "textarea", { placeholder: "分享配送经验、提问或路上见闻", max: 2000 })}${photoEditor(f)}<div class="circle-editor-options">${field("post", "topic", "内容标签", "text", { optional: true, choices: [["", "不选择"], ...topics] })}${field("post", "region", "配送区域", "text", { optional: true, choices: [["", "不选择"], ...areas] })}${field("post", "job", "关联我的支援需求", "text", { optional: true, choices: [["", "不关联"], ...model.jobs.filter((j) => j.owner === "me" && j.status !== "draft" && !j.discarded).map((j) => [j.id, `${j.region} · ${statusLabel(j.status)}`])] })}</div></form></div><div class="circle-editor-actions"><button class="button" type="submit" form="circle-post-form" ${ui.publishing ? "disabled" : ""}>${ui.publishing ? "发布中" : ui.publishError ? "重新发布" : "发布"}</button></div></div>`;
  };
  const sensitive = (text) =>
    /(?:门禁码|门禁密码|(?:门禁|大门|进门|公寓|行人门|侧门).{0,8}(?:密码|门禁码|门码)|gate\s*code|access\s*code)\s*[:：]?\s*[#*\d]{4,}/i.test(
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
      ui.publishError = "门禁码请通过贡献入口共享";
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
    const data = { ...f, text, images: photos(f).map((x) => ({ ...x })) },
      g = ui.generation,
      failed = failOnce("#circle-post-fail");
    const failPhoto = failOnce("#circle-image-fail");
    ui.publishing = true;
    ui.publishError = null;
    render();
    const active = () => {
      const yes =
        g === ui.generation &&
        state.logged &&
        state.forms.post === f &&
        state.route.view === "postForm";
      if (!yes && g === ui.generation) {
        ui.publishing = false;
        for (const image of f.images || [])
          if (image.upload === "uploading") image.upload = "selected";
      }
      return yes;
    };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 350));
    (async () => {
      let failedThisTime = false;
      for (const x of f.images || []) {
        if (x.upload === "ready") continue;
        x.upload = "uploading";
        if (state.route.view === "postForm") render();
        await tick();
        if (!active()) return;
        if (failPhoto && !failedThisTime) {
          x.upload = "failed";
          failedThisTime = true;
        } else x.upload = "ready";
        if (state.route.view === "postForm") render();
      }
      if (!(f.images || []).length) {
        await tick();
        if (!active()) return;
      }
      ui.publishing = false;
      if ((f.images || []).some((x) => x.upload !== "ready")) {
        ui.publishError = "图片未上传成功，请重试或移除";
        render();
        return;
      }
      if (failed) {
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
        images: data.images.map((x) => ({ id: x.id })),
      };
      model.posts.unshift(p);
      state.forms.post = null;
      nav("post", { id: p.id }, true);
      toast("已发布");
    })();
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
      ui.errors[id] = "门禁码请通过贡献入口共享";
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
  function viewerItems(m) {
    if (m.draft) return photos(state.forms.post);
    const p = post(m.postId);
    return visible(p) && ui.scenario !== "deleted" ? photos(p) : [];
  }
  function addPhotos(ids) {
    const f = state.forms.post;
    if (!f || ui.publishing) return;
    if (photoMode() === "read-error") {
      closeModal();
      ui.publishError = "图片无法读取，请重新选择";
      render();
      return;
    }
    f.images ||= [];
    for (const id of ids)
      if (
        fixture(id) &&
        f.images.length < 3 &&
        !f.images.some((x) => x.id === id)
      )
        f.images.push({ id, upload: "selected" });
    ui.publishError = null;
    closeModal();
    render();
  }
  renderModal = () => {
    const m = state.modal,
      host = $("#overlay");
    if (m?.type === "circle-photo-gallery") {
      const selected = m.selected || [],
        existing = photos(state.forms.post),
        available = fixtures.filter(
          (x) => !existing.some((y) => y.id === x.id),
        );
      host.innerHTML = `<section class="dialog circle-photo-picker" role="dialog" aria-modal="true" aria-label="选择图片"><div class="close-row"><h2>选择图片</h2>${btn("close-modal", "取消", "text-btn")}</div><div class="circle-gallery-grid">${available.map((x) => `<button class="circle-gallery-tile" aria-pressed="${selected.includes(x.id)}" data-action="circle-gallery-toggle" data-id="${x.id}"><img src="${x.src}" alt="${x.alt}" width="960" height="640" draggable="false"/><span>${selected.includes(x.id) ? selected.indexOf(x.id) + 1 : I("plus")}</span></button>`).join("")}</div>${btn("circle-gallery-done", `添加${selected.length ? ` ${selected.length} 张` : ""}`, "button", !selected.length ? "disabled" : "")}</section>`;
      return;
    }
    if (m?.type === "circle-camera") {
      host.innerHTML = `<section class="dialog circle-camera" role="dialog" aria-modal="true" aria-label="拍照"><div class="close-row"><h2>${m.captured ? "照片预览" : "拍照"}</h2>${btn("close-modal", "取消", "text-btn")}</div><img src="${fixture(m.captureId).src}" alt="TEST 相机合成画面" width="960" height="640"/>${m.captured ? btn("circle-camera-use", "使用照片", "button") + btn("circle-camera-retake", "重新拍照", "button secondary") : btn("circle-camera-take", "拍照", "button")}</section>`;
      return;
    }
    if (m?.type === "circle-photo-permission") {
      host.innerHTML = `<section class="dialog" role="dialog" aria-modal="true" aria-label="图片权限"><h2>${m.camera ? "无法使用相机" : "无法访问相册"}</h2><p>可在系统设置中允许访问。</p>${btn(m.camera ? "circle-photo-gallery" : "circle-photo-camera", m.camera ? "从相册选择" : "拍照", "button")}${btn("close-modal", "返回编辑", "button secondary")}</section>`;
      return;
    }
    if (m?.type === "circle-photo-viewer") {
      const list = viewerItems(m);
      m.index = Math.max(0, Math.min(m.index, list.length - 1));
      const unavailable = !list.length,
        failed = m.failed || photoMode() === "view-error";
      host.innerHTML = `<section class="circle-photo-viewer" role="dialog" aria-modal="true" aria-label="查看图片"><div class="circle-viewer-head">${btn("close-modal", I("close"), "circle-viewer-control", 'aria-label="关闭图片"')}<span>${unavailable ? "图片不可查看" : `${m.index + 1} / ${list.length}`}</span><span></span></div><div class="circle-viewer-stage ${m.zoom ? "zoomed" : ""}">${unavailable ? "<p>图片暂不可查看</p>" : failed ? `<div class="circle-viewer-error" role="alert"><p>图片暂时无法加载</p>${btn("circle-viewer-retry", "重新加载", "circle-viewer-retry")}</div>` : `<button class="circle-full-image" data-action="circle-viewer-zoom" aria-label="${m.zoom ? "缩小图片" : "放大图片"}"><img src="${fixture(list[m.index].id).src}" alt="${fixture(list[m.index].id).alt}" width="960" height="640" data-circle-full="true" draggable="false"/></button>`}</div>${list.length > 1 ? `<div class="circle-viewer-nav">${btn("circle-viewer-prev", I("back"), "circle-viewer-control", `aria-label="上一张图片" ${m.index === 0 ? "disabled" : ""}`)}${btn("circle-viewer-next", I("chevron"), "circle-viewer-control", `aria-label="下一张图片" ${m.index === list.length - 1 ? "disabled" : ""}`)}</div>` : ""}</section>`;
      return;
    }
    if (m?.type !== "circle-leave") return baseModal();
    $("#overlay").innerHTML =
      `<section class="dialog" role="dialog" aria-modal="true" aria-label="离开发布动态"><h2>离开发布动态？</h2>${btn("circle-keep-draft", "保留草稿并返回", "button")}${btn("circle-discard", "放弃草稿", "button secondary")}${btn("close-modal", "继续编辑", "text-btn wide-link")}</section>`;
  };
  actions = (a, b) => {
    const id = b?.dataset.id;
    if (a === "circle-add-photo") {
      if (ui.publishing || photos(state.forms.post).length >= 3) return;
      modal("menu", {
        title: "添加图片",
        items: [
          { label: "拍照", action: "circle-photo-camera", icon: "plus" },
          { label: "从相册选择", action: "circle-photo-gallery", icon: "plus" },
        ],
      });
      return;
    }
    if (a === "circle-photo-gallery" || a === "circle-photo-camera") {
      if (
        ui.publishing ||
        !state.forms.post ||
        photos(state.forms.post).length >= 3
      )
        return;
      const camera = a === "circle-photo-camera";
      if (photoMode() === (camera ? "camera-denied" : "gallery-denied"))
        modal("circle-photo-permission", { camera });
      else
        modal(camera ? "circle-camera" : "circle-photo-gallery", {
          selected: [],
          captured: false,
          captureId: fixtures.find(
            (x) => !photos(state.forms.post).some((y) => y.id === x.id),
          )?.id,
        });
      return;
    }
    if (a === "circle-gallery-toggle") {
      const m = state.modal;
      if (m?.type !== "circle-photo-gallery") return;
      if (m.selected.includes(id))
        m.selected = m.selected.filter((x) => x !== id);
      else if (m.selected.length + photos(state.forms.post).length < 3)
        m.selected.push(id);
      else toast("最多添加3张图片");
      renderModal();
      return;
    }
    if (a === "circle-gallery-done") {
      if (state.modal?.type === "circle-photo-gallery")
        addPhotos(state.modal.selected);
      return;
    }
    if (a === "circle-camera-take" || a === "circle-camera-retake") {
      if (state.modal?.type === "circle-camera") {
        state.modal.captured = a === "circle-camera-take";
        renderModal();
      }
      return;
    }
    if (a === "circle-camera-use") {
      if (state.modal?.type === "circle-camera" && state.modal.captured)
        addPhotos([state.modal.captureId]);
      return;
    }
    if (a === "circle-remove-photo") {
      if (ui.publishing || !state.forms.post) return;
      state.forms.post.images = photos(state.forms.post).filter(
        (x) => x.id !== id,
      );
      ui.publishError = null;
      render();
      return;
    }
    if (a === "circle-view-photo" || a === "circle-preview-draft") {
      modal("circle-photo-viewer", {
        draft: a === "circle-preview-draft",
        postId: id,
        index: Number(b.dataset.index) || 0,
        zoom: false,
        failed: false,
      });
      return;
    }
    if (a === "circle-viewer-prev" || a === "circle-viewer-next") {
      const m = state.modal;
      if (m?.type !== "circle-photo-viewer") return;
      m.index = Math.max(
        0,
        Math.min(
          m.index + (a === "circle-viewer-next" ? 1 : -1),
          viewerItems(m).length - 1,
        ),
      );
      m.zoom = false;
      m.failed = false;
      renderModal();
      return;
    }
    if (a === "circle-viewer-zoom") {
      if (Date.now() < suppressPhotoClickUntil) return;
      if (state.modal?.type === "circle-photo-viewer") {
        state.modal.zoom = !state.modal.zoom;
        renderModal();
      }
      return;
    }
    if (a === "circle-viewer-retry") {
      if (state.modal?.type === "circle-photo-viewer") {
        state.modal.failed = false;
        renderModal();
      }
      return;
    }
    if (a === "circle-publish") {
      modal("menu", {
        title: "发布",
        items: [
          { label: "发动态", action: "new-post", icon: "edit" },
          { label: "发配送需求", action: "publish", icon: "box" },
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
      state.forms.post ||= {
        text: "",
        topic: "",
        region: "",
        job: "",
        images: [],
      };
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
      if (state.forms.post?.text.trim() || photos(state.forms.post).length) {
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
    const editorScroll =
      state.route.view === "postForm"
        ? $(".circle-editor>.page-scroll")?.scrollTop
        : null;
    base.render();
    if (editorScroll != null && state.route.view === "postForm")
      $(".circle-editor>.page-scroll").scrollTop = editorScroll;
    if (state.route.view === "circle")
      $(".circle-scroll").scrollTop = staying
        ? ui.feedScroll
        : (state.route.scroll ?? ui.feedScroll);
    if (state.route.view === "postForm") {
      $('[data-submit="post"]').id = "circle-post-form";
      if (ui.publishing)
        document
          .querySelectorAll(
            '[data-submit="post"] input,[data-submit="post"] textarea,[data-submit="post"] select,[data-submit="post"] button',
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
  let swipe = null,
    suppressPhotoClickUntil = 0;
  document.addEventListener("pointerdown", (e) => {
    if (
      state.modal?.type === "circle-photo-viewer" &&
      e.target.closest(".circle-viewer-stage") &&
      !state.modal.zoom
    ) {
      swipe = { x: e.clientX, y: e.clientY };
    }
  });
  document.addEventListener("pointerup", (e) => {
    if (!swipe) return;
    const d = { x: e.clientX - swipe.x, y: e.clientY - swipe.y };
    swipe = null;
    if (
      state.modal?.type === "circle-photo-viewer" &&
      Math.abs(d.x) > 45 &&
      Math.abs(d.x) > Math.abs(d.y)
    ) {
      suppressPhotoClickUntil = Date.now() + 250;
      actions(d.x < 0 ? "circle-viewer-next" : "circle-viewer-prev");
    }
  });
  document.addEventListener("pointercancel", () => {
    swipe = null;
  });
  document.addEventListener("keydown", (e) => {
    if (state.modal?.type !== "circle-photo-viewer") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      actions(
        e.key === "ArrowLeft" ? "circle-viewer-prev" : "circle-viewer-next",
      );
    }
  });
  document.addEventListener(
    "error",
    (e) => {
      if (e.target?.dataset?.circleThumb)
        e.target.parentElement.innerHTML = "<span>图片暂不可查看</span>";
      if (
        e.target?.dataset?.circleFull &&
        state.modal?.type === "circle-photo-viewer"
      ) {
        state.modal.failed = true;
        renderModal();
      }
    },
    true,
  );
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
    $("#circle-photo-state").value = "normal";
    $("#circle-image-fail").checked = false;
    base.resetPrototype();
    seed();
    render();
  };
  window.abasongCircle = { version: "3.2-circle-images", state: ui };
  if (new URLSearchParams(location.search).get("task") === "circle")
    nav("circle", {}, true);
  else render();
})();
