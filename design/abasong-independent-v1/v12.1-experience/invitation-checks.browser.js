// Browser-only TEST acceptance. System share, photos, clipboard and distribution are not invoked.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1400, height: 980 } });
  await context.addInitScript(() => {
    window.invitationSideEffects = { clipboard: 0, share: 0, open: 0 };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { window.invitationSideEffects.clipboard++; throw Error("unexpected clipboard"); } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => { window.invitationSideEffects.share++; throw Error("unexpected system share"); } });
    window.open = () => { window.invitationSideEffects.open++; return null; };
  });
  const p = await context.newPage(), checks = [], errors = [], external = [], effects = [];
  let downloads = 0;
  p.setDefaultTimeout(5000);
  p.on("pageerror", e => errors.push(e.message));
  p.on("download", () => downloads++);
  p.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:8765/") && !r.url().startsWith("data:")) external.push(new URL(r.url()).hostname); });
  const assert = (v, label) => { if (!v) throw Error(label); };
  const action = a => p.locator(`#app [data-action="${a}"]`);
  const fresh = async (task = "invite") => { await p.setViewportSize({ width: 1400, height: 980 }); await p.goto(`http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-invite&task=${task}&case=${checks.length}`); await p.waitForFunction(() => window.abasongInvitation); };
  const run = async (name, f, task = "invite") => { try { await fresh(task); await f(); checks.push({ name, status: "PASS" }); } catch (e) { checks.push({ name, status: "FAIL", reason: e.message.slice(0,600) }); } effects.push(await p.evaluate(() => window.invitationSideEffects)); };
  await run("我的：保留开关/共享/管理分组，邀请与我的团队在次级组、设置之前", async () => {
    assert(await p.locator(".account-main-tools").evaluate(n => n.nextElementSibling.classList.contains("account-secondary-tools")), "secondary after main");
    assert((await p.locator(".account-secondary-tools [data-action]").allTextContents()).join("|").includes("邀请司机|我的团队"), "menu order");
    await action("invite-open").click(); assert((await p.locator("#screen-id").innerText()) === "U15", "invitation screen");
    await action("back").click(); assert((await p.locator("#screen-id").innerText()) === "U01", "back to My");
  }, "me");
  await run("未创建团队的司机可直接打开团队资料", async () => {
    await p.evaluate(() => { window.abasongAccount.state.team = null; window.abasongAccount.state.teamIntent = false; model.organization = ""; render(); });
    assert(await action("invite-open").isVisible(), "all drivers");
    assert((await action("organization").innerText()).includes("添加团队资料"), "team setup visible");
    assert(!/常联系|邀请成员|会员|钱包/.test(await p.locator("#app").innerText()), "no scope expansion");
    await action("organization").click();
    assert((await p.locator("#screen-id").innerText()) === "U10", "team editor reachable");
    assert((await p.locator('[name="name"]').inputValue()) === "", "blank initial team");
    await action("back").click();
    assert((await p.locator("#screen-id").innerText()) === "U01", "return to My");
  }, "me");
  await run("邀请图价值/覆盖说明清楚，二维码与链接同源，不附个人/业务资料", async () => {
    const body = await p.locator("#app").innerText(), meta = await p.evaluate(() => ({ target: abasongInvitation.target, text: abasongInvitation.text, name: model.profile.name }));
    assert(body.includes("到了公寓进不去？") && body.includes("覆盖持续积累"), "honest value");
    const svg = await (await p.request.get("http://127.0.0.1:8765/v12.1-experience/assets/invitation-qr-test.svg")).text();
    assert(svg.includes(meta.target) && meta.text.endsWith(meta.target), "QR/link canonical TEST target");
    assert(!meta.text.includes(meta.name) && !/TEST-0|@|202-555|token=|user_id|latitude|邀请码/.test(meta.text), "no sensitive payload");
    assert((await action("invite-share").count()) === 1 && (await action("invite-save").count()) === 1 && (await action("invite-copy").count()) === 1, "three clear actions");
  });
  await run("分享预览可取消，回原页且不出现邀请成功/人数", async () => {
    await action("invite-share").click(); assert(await p.getByRole("dialog", { name: "分享预览" }).isVisible(), "preview dialog");
    await p.locator("#overlay [data-action=close-modal]").last().click(); assert((await p.locator("#overlay").innerText()) === "", "dismissed");
    assert((await p.locator("#screen-id").innerText()) === "U15" && !/邀请成功|邀请人数/.test(await p.locator("#app").innerText()), "no false success");
  });
  await run("预览进入公开接收页，返回仍为邀请页，不发送邀请", async () => {
    await action("invite-share").click(); await p.locator("#overlay [data-action=invite-preview]").click();
    assert((await p.locator("#screen-id").innerText()) === "X02", "receiving");
    await p.goBack(); assert((await p.locator("#screen-id").innerText()) === "U15", "same invitation");
  });
  await run("系统分享不可用：地址/邀请图保留，仍可使用其他方式", async () => {
    await p.selectOption("#invite-scenario", "share-error"); await action("invite-share").click();
    assert((await p.locator("[role=alert]").innerText()).includes("暂时无法分享"), "failure distinct");
    assert(await p.locator(".invite-qr").isVisible() && await action("invite-copy").isEnabled() && await action("invite-save").isEnabled(), "alternatives retained");
  });
  await run("图片保存权限拒绝，不申请实际权限、不阻断其他分享", async () => {
    await p.selectOption("#invite-scenario", "save-denied"); await action("invite-save").click();
    assert((await p.locator("[role=alert]").innerText()).includes("未允许保存图片"), "permission state");
    assert(!(await p.evaluate(() => abasongInvitation.ui.saved)), "no false save");
    await action("invite-share").click(); assert(await p.getByRole("dialog", { name: "分享预览" }).isVisible(), "share remains");
  });
  await run("保存失败后重试，保留邀请图和页面上下文", async () => {
    await p.selectOption("#invite-scenario", "save-error"); await action("invite-save").click(); assert((await p.locator("[role=alert]").innerText()).includes("未保存"), "error");
    await p.selectOption("#invite-scenario", "ready"); await action("invite-save").click();
    assert((await p.locator("#toast").innerText()).includes("演示：邀请图已保存"), "explicit synthetic save"); assert((await p.locator("#screen-id").innerText()) === "U15", "same screen");
  });
  await run("复制仅演示；文案不包含邀请人/接收者资料", async () => {
    await action("invite-copy").click(); assert((await p.locator("#toast").innerText()).includes("演示"), "synthetic feedback");
    assert(await p.evaluate(() => abasongInvitation.ui.copied), "simulated copied");
    assert(!/邀请码|邀请名单|奖励/.test(await p.locator("#app").innerText()), "no extra growth system");
  });
  await run("复制失败：可选择完整文案/链接，取消和重试均可达", async () => {
    await p.selectOption("#invite-scenario", "copy-error"); await action("invite-copy").click();
    assert((await p.locator(".invite-copy-text").innerText()).endsWith("https://abasong.example/invite"), "selectable full content");
    await p.locator("#overlay [data-action=invite-copy-retry]").click(); assert(await p.getByRole("dialog", { name: "复制未成功" }).isVisible(), "still failed");
    await p.selectOption("#invite-scenario", "ready"); await p.locator("#overlay [data-action=invite-copy-retry]").click();
    assert(await p.getByRole("dialog").count() === 0, "retry recovered");
  });
  await run("公开接收页：未登录先看价值，无假下载/登录强迫/数据名单", async () => {
    assert((await p.locator("#screen-id").innerText()) === "X02" && !(await p.evaluate(() => state.logged)), "guest public");
    assert((await p.locator(".invite-distribution").innerText()).includes("内测准备中"), "distribution honest");
    assert(await p.locator(".invite-distribution").locator("button,a[href]").count() === 0, "no fake download");
    assert(await p.locator("#app input").count() === 0 && await p.locator("#app .bottom-nav").count() === 0, "not signup or app navigation");
  }, "invite-receive");
  await run("已安装：游客走现有登录，不因邀请开放资格或新建团队", async () => {
    const before = await p.evaluate(() => ({ qualified: state.qualified, team: abasongAccount.state.team?.id }));
    await p.selectOption("#invite-receiver-state", "installed"); await action("invite-enter").click();
    assert((await p.locator("#screen-id").innerText()) === "A02", "existing login");
    assert(await p.evaluate(() => state.qualified) === before.qualified, "no grant");
    assert(await p.evaluate(() => abasongAccount.state.team?.id) === before.team, "no membership");
    assert(await p.locator("#app [name=invite_code]").count() === 0, "no code field");
  }, "invite-receive");
  await run("已登录：模拟打开首页，保持账号/资格/团队/报名关系", async () => {
    const before = await p.evaluate(() => JSON.stringify([model.profile, model.applications, abasongAccount.state.team, state.qualified]));
    await p.locator("[data-action=invite-preview]").first().click(); await p.selectOption("#invite-receiver-state", "installed"); await action("invite-enter").click();
    assert((await p.locator("#screen-id").innerText()) === "H01", "home"); assert(await p.evaluate(() => JSON.stringify([model.profile, model.applications, abasongAccount.state.team, state.qualified])) === before, "no identity changes");
  });
  await run("iOS内测入口只模拟、不下载；Android未开放没有假操作", async () => {
    await p.selectOption("#invite-receiver-state", "ios-pilot"); await action("invite-pilot").click();
    assert((await p.locator("#overlay").innerText()).includes("没有真实下载链接"), "pilot demo");
    await p.locator("#overlay [data-action=close-modal]").last().click(); await p.selectOption("#invite-receiver-state", "android-unavailable");
    assert((await p.locator(".invite-distribution").innerText()).includes("Android 版暂未开放") && await p.locator(".invite-distribution button").count() === 0, "unavailable");
  }, "invite-receive");
  await run("微信受阻：可复制链接；失败保持可选文字，不强制外部跳转", async () => {
    await p.selectOption("#invite-receiver-state", "wechat"); await p.selectOption("#invite-scenario", "copy-error"); await action("invite-copy-link").click();
    assert((await p.locator(".invite-copy-text").innerText()) === "https://abasong.example/invite", "link-only fallback");
    await p.keyboard.press("Escape"); assert((await p.locator("#screen-id").innerText()) === "X02", "same page");
  }, "invite-receive");
  await run("隐私/联系说明可关闭；不收集电话、门禁码或联系人", async () => {
    await action("invite-privacy").click(); assert((await p.locator("#overlay").innerText()).includes("不附带你的联系方式"), "privacy");
    await p.keyboard.press("Escape"); await action("invite-about").click(); assert(await p.locator("#overlay input").count() === 0, "no capture"); await p.keyboard.press("Escape");
  }, "invite-receive");
  await run("键盘：菜单与主操作可触发，分享弹窗焦点限制且Escape可关闭", async () => {
    await action("invite-share").focus(); await p.keyboard.press("Enter");
    assert(await p.getByRole("dialog").isVisible(), "keyboard activation");
    await p.locator("#overlay [data-action=close-modal]").last().focus(); await p.keyboard.press("Tab");
    assert(await p.evaluate(() => !!document.activeElement.closest("#overlay")), "focus stays within dialog");
    await p.keyboard.press("Escape"); assert(await p.getByRole("dialog").count() === 0, "closed");
  });
  await run("320/390/430：邀请/接收页无横向溢出，操作可滚动到，热区达标", async () => {
    for (const width of [320,390,430]) {
      await p.setViewportSize({ width, height: 844 });
      await p.evaluate(() => nav("invite", {}, true));
      for (const a of ["invite-share", "invite-save", "invite-copy"]) { await action(a).scrollIntoViewIfNeeded(); const b = await action(a).boundingBox(); assert(b.width >= 48 && b.height >= 48, a + " touch size"); }
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector(".invite-scroll").scrollWidth <= document.querySelector(".invite-scroll").clientWidth), "invite overflow");
      await p.evaluate(() => nav("inviteReceive", {}, true)); await action("invite-about").scrollIntoViewIfNeeded();
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector(".invite-receive").scrollWidth <= document.querySelector(".invite-receive").clientWidth), "receiver overflow");
    }
  });
  await run("浏览器文字放大200%：文案换行、主操作可滚动到，无裁剪式横溢出", async () => {
    await p.setViewportSize({ width: 320, height: 844 });
    for (const view of ["invite", "inviteReceive"]) {
      await p.evaluate(v => nav(v, {}, true), view);
      await p.locator("#app h1,#app h2,#app p,#app b,#app .text-btn,#app .button,#app .invite-benefits,#app .invite-test").evaluateAll(ns => ns.forEach(n => n.style.fontSize = parseFloat(getComputedStyle(n).fontSize) * 2 + "px"));
      await p.locator(view === "invite" ? "#app [data-action=invite-share]" : "#app [data-action=invite-about]").scrollIntoViewIfNeeded();
      assert(await p.locator("#app .page-scroll").evaluate(n => n.scrollWidth <= n.clientWidth + 1), "large text width");
    }
  });
  await run("弱网/离线重渲染仍可读本地内容；重置清掉错误但不造邀请结果", async () => {
    await context.setOffline(true); await action("invite-share").click(); assert(await p.getByRole("dialog").isVisible(), "local preview offline"); await p.keyboard.press("Escape");
    await p.locator("[data-ex-flow=reset]").click(); assert((await p.locator("#screen-id").innerText()) === "H01", "reset home");
    assert(await p.evaluate(() => !abasongInvitation.ui.copied && !abasongInvitation.ui.saved && !abasongInvitation.ui.error), "reset state"); await context.setOffline(false);
  });
  const folder = "/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence";
  await fresh("me"); await p.locator("#device").screenshot({ path: folder + "/invite-my.png" });
  await action("invite-open").click(); await p.locator("#device").screenshot({ path: folder + "/invite-driver.png" });
  await action("invite-share").click(); await p.locator("#device").screenshot({ path: folder + "/invite-share.png" });
  await p.locator("#overlay [data-action=invite-preview]").click(); await p.locator("#device").screenshot({ path: folder + "/invite-receive.png" });
  const result = { prototype_version: "3.2-r3-invite", executed_at: new Date().toISOString(), scope: "isolated Chromium TEST invitation UI; no real share/clipboard/photos/download/Auth/Mapbox", checks, passed: checks.filter(x => x.status === "PASS").length, failed: checks.filter(x => x.status === "FAIL").length, console_errors: errors, external_request_hosts: [...new Set(external)], actual_downloads: downloads, unexpected_side_effects: effects.filter(x => x.clipboard || x.share || x.open), human_participants: 0, native_acceptance: false };
  await context.close(); return result;
}
