// Isolated synthetic circle UI checks. No services, personal data, GPS or real sends.
async (page) => {
  const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1400, height: 980 } }),
    p = await context.newPage();
  p.setDefaultTimeout(4000);
  const checks = [],
    errors = [],
    external = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:8765/") &&
      !r.url().startsWith("data:")
    )
      external.push(new URL(r.url()).hostname);
  });
  const assert = (ok, why) => {
    if (!ok) throw Error(why);
  };
  const fresh = async () => {
    await p.goto(
      "http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-images&task=circle&check=" +
        checks.length,
    );
    await p.waitForFunction(() => window.abasongCircle);
  };
  const run = async (name, fn) => {
    try {
      await fresh();
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", reason: e.message.slice(0, 500) });
    }
  };
  const openPost = async (id = "p1") =>
    p.locator(`[data-post-id="${id}"] [data-action="post"]`).first().click();
  const compose = async () => {
    await p.locator('[data-action="circle-publish"]').click();
    await p.locator('[data-action="new-post"]').click();
  };
  const publish = async () => {
    await p.locator('.circle-editor-actions [type="submit"]').click();
    await p.waitForTimeout(400);
  };
  const back = async () => {
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForTimeout(80);
  };
  const readNotices = async () => {
    await p.locator('.bottom-nav [data-id="home"]').click();
    await p.locator('[data-action="inbox"]').click();
    await p.locator('[data-action="inbox-tab"][data-id="notices"]').click();
  };
  await run("根页无返回箭头，发布清晰，空回复无零数值、自然高度", async () => {
    assert(
      (await p.locator('.circle-root-head [data-action="back"]').count()) === 0,
      "no root back",
    );
    assert(
      (await p.locator(".circle-root-head").innerText()).includes("发布"),
      "labelled publish",
    );
    assert(
      !(await p.locator("#app").innerText()).includes("0 条回复"),
      "no zero clutter",
    );
    assert(
      (await p.locator(".circle-card").count()) === 3,
      "three synthetic posts",
    );
    assert(await p.locator(".bottom-nav").isVisible(), "three tab navigation");
  });
  await run("地区与轻量标签、自报作者可读，不显示精确司机距离", async () => {
    const card = p.locator('[data-post-id="p1"]');
    assert((await card.innerText()).includes("Alhambra"), "declared region");
    assert(
      (await card.locator(".circle-topic").innerText()) === "经验分享",
      "topic",
    );
    assert(
      !(await p.locator(".circle-feed").innerText()).match(
        /\b\d+\s*(?:ft|mi)\b|在线人数|活跃司机/,
      ),
      "no driver tracking",
    );
  });
  await run("长文四行展开、收起不跳滚动，详情返回保留列表位置", async () => {
    const card = p.locator('[data-post-id="circle-long"]');
    await card.scrollIntoViewIfNeeded();
    const before = await p
      .locator(".circle-scroll")
      .evaluate((n) => n.scrollTop);
    assert((await card.locator(".circle-clamp").count()) === 1, "clamped");
    await card.locator('[data-action="circle-expand"]').click();
    assert((await card.locator(".circle-clamp").count()) === 0, "expanded");
    await card.locator('[data-action="circle-expand"]').click();
    const after = await p
      .locator(".circle-scroll")
      .evaluate((n) => n.scrollTop);
    assert(Math.abs(before - after) < 3, "stable expand/collapse");
    await card.locator(".post-text").click();
    await back();
    assert(
      Math.abs(
        (await p.locator(".circle-scroll").evaluate((n) => n.scrollTop)) -
          after,
      ) < 3,
      "same feed scroll",
    );
  });
  await run("作者进入最小资料、复用私聊与常联系", async () => {
    await p
      .locator('[data-post-id="p1"] [data-action="circle-author"]')
      .click();
    assert((await p.locator("#screen-id").innerText()) === "D02", "profile");
    await p.locator('[data-action="contact"]').first().click();
    await p.waitForSelector(".composer");
    assert(
      (await p.locator(".message-page .page-head").innerText()).includes("Mia"),
      "same author chat",
    );
    await back();
    await p.locator('[data-action="save-contact"]').first().click();
    assert(
      await p.evaluate(() => model.contacts.some((c) => c.id === "d2")),
      "peer saved after conversation",
    );
  });
  await run("发布菜单分动态与临时需求，后者使用统一发布流程", async () => {
    await p.locator('[data-action="circle-publish"]').click();
    assert(
      (await p.locator("#overlay").innerText()).includes("发动态"),
      "post option",
    );
    await p.locator('#overlay [data-action="publish"]').click();
    assert(
      (await p.locator("#screen-id").innerText()) === "P01",
      "same support flow",
    );
  });
  await run("动态可选地区标签和同ID需求，发布成功出现在最新首位", async () => {
    await compose();
    await p.locator('[name="text"]').fill("TEST 分享今天的理货经验");
    await p.selectOption('[name="topic"]', "路上见闻");
    await p.selectOption('[name="region"]', "Pasadena");
    await p.selectOption('[name="job"]', "j3");
    await publish();
    assert(
      (await p.locator(".circle-detail .circle-text").innerText()) ===
        "TEST 分享今天的理货经验",
      "new text",
    );
    assert(
      (await p.locator(".circle-source").getAttribute("data-request-id")) ===
        "j3",
      "same reference",
    );
    await back();
    assert(
      (
        await p.locator(".circle-feed>.circle-card").first().innerText()
      ).includes("TEST 分享"),
      "latest first",
    );
    assert(
      await p.evaluate(
        () =>
          model.posts.filter((p) => p.text === "TEST 分享今天的理货经验")
            .length === 1,
      ),
      "single publication",
    );
  });
  await run("发布失败保留文字、地区、标签和引用，再试不重复发布", async () => {
    await compose();
    await p.locator('[name="text"]').fill("TEST publish retry");
    await p.selectOption('[name="region"]', "Alhambra");
    await p.selectOption('[name="topic"]', "配送提问");
    await p.selectOption('[name="job"]', "j3");
    await p.locator("#circle-post-fail").check();
    await publish();
    assert(
      (await p.locator(".circle-error").innerText()).includes("发布未成功"),
      "failed",
    );
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST publish retry",
      "text retained",
    );
    assert(
      (await p.locator('[name="region"]').inputValue()) === "Alhambra" &&
        (await p.locator('[name="job"]').inputValue()) === "j3",
      "fields retained",
    );
    assert(
      await p.evaluate(
        () => !model.posts.some((p) => p.text === "TEST publish retry"),
      ),
      "no false success",
    );
    await publish();
    assert(
      await p.evaluate(
        () =>
          model.posts.filter((p) => p.text === "TEST publish retry").length ===
          1,
      ),
      "one after retry",
    );
  });
  await run("空动态校验、不公开明确门码文本", async () => {
    await compose();
    await publish();
    assert(
      (await p.locator(".circle-error").innerText()) === "请输入动态内容",
      "empty validation",
    );
    await p.locator('[name="text"]').fill("TEST 门禁密码：#0123");
    await publish();
    assert(
      (await p.locator(".circle-error").innerText()).includes("贡献入口"),
      "separate contribution",
    );
    assert(
      await p.evaluate(
        () => !model.posts.some((p) => p.text.includes("#0123")),
      ),
      "no public code in synthetic feed",
    );
  });
  await run("离开发动态：继续编辑、保留草稿、放弃各自明确", async () => {
    await compose();
    await p.locator('[name="text"]').fill("TEST memory draft");
    await back();
    await p.locator('#overlay [data-action="close-modal"]').click();
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST memory draft",
      "cancel preserves",
    );
    await back();
    await p.locator('[data-action="circle-keep-draft"]').click();
    await compose();
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST memory draft",
      "return draft",
    );
    await back();
    await p.locator('[data-action="circle-discard"]').click();
    await compose();
    assert((await p.locator('[name="text"]').inputValue()) === "", "discard");
  });
  await run("回复失败不加假回复，保留输入，同条重试只成功一次", async () => {
    await openPost();
    await p.locator("#comment-input").fill("TEST public reply");
    await p.locator("#circle-reply-fail").check();
    await p.locator('.circle-composer [type="submit"]').click();
    await p.waitForTimeout(320);
    assert(
      (await p.locator(".circle-composer .circle-error").innerText()).includes(
        "回复未成功",
      ),
      "failure",
    );
    assert(
      (await p.locator("#comment-input").inputValue()) === "TEST public reply",
      "kept",
    );
    assert(
      await p.evaluate(
        () =>
          !model.posts[0].comments.some((c) => c.text === "TEST public reply"),
      ),
      "no optimistic fake",
    );
    await p.locator('.circle-composer [type="submit"]').click();
    await p.waitForTimeout(320);
    assert(
      await p.evaluate(
        () =>
          model.posts[0].comments.filter((c) => c.text === "TEST public reply")
            .length === 1,
      ),
      "one reply",
    );
    assert(
      (await p.locator("#comment-input").inputValue()) === "",
      "cleared only on success",
    );
  });
  await run("各动态回复草稿隔离，返回后输入仍保留", async () => {
    await openPost("p1");
    await p.locator("#comment-input").fill("TEST draft for p1");
    await back();
    await openPost("p2");
    assert(
      (await p.locator("#comment-input").inputValue()) === "",
      "not copied",
    );
    await back();
    await openPost("p1");
    assert(
      (await p.locator("#comment-input").inputValue()) === "TEST draft for p1",
      "same draft",
    );
  });
  await run("需求引用实时读同对象：价格/缺口/终态更新，无旧副本", async () => {
    await p.evaluate(() => {
      const j = model.jobs.find((j) => j.id === "j3");
      j.price = 210;
      j.remaining = 30;
      j.remainingDrivers = 1;
      j.status = "found";
      j.version++;
      render();
    });
    const source = p.locator('[data-request-id="j3"]');
    const text = await source.innerText();
    assert(
      text.includes("$2.10") &&
        text.includes("剩余 30 件") &&
        text.includes("已找到"),
      "live source state",
    );
    await source.click();
    assert(
      (await p.locator('[data-action="apply"]').count()) === 0,
      "no new application",
    );
  });
  await run("引用不可见时不显示旧报价或完整仓库地址", async () => {
    await p.selectOption("#circle-state", "source-unavailable");
    assert(
      (await p.locator(".circle-source").count()) === 0,
      "no stale reference",
    );
    assert(
      (await p.locator(".circle-source-unavailable").innerText()) ===
        "关联需求暂不可查看",
      "unavailable",
    );
    assert(
      !(await p.locator(".circle-feed").innerText()).includes("5685 Alcoa"),
      "coarse only",
    );
  });
  await run("屏蔽作者即时移除动态和回复通知，其他本人内容保留", async () => {
    await p.locator('[data-post-id="p1"] [data-action="post-more"]').click();
    assert(
      (await p.locator('#overlay [data-action="delete-post"]').count()) === 0,
      "not owner",
    );
    await p.locator('[data-action="block-context"]').click();
    await p.locator('[data-action="confirm-modal"]').click();
    assert(
      (await p.locator('[data-post-id="p1"]').count()) === 0 &&
        (await p.locator('[data-post-id="p2"]').count()) === 1,
      "filtered author",
    );
    await openPost("p2");
    assert(
      (await p.locator('[data-comment-id="circle-demo-reply"]').count()) === 0,
      "filtered replies",
    );
    await back();
    await readNotices();
    assert(
      (await p
        .locator('[data-action="notice"][data-id="circle-notice"]')
        .count()) === 0,
      "filtered notice",
    );
  });
  await run("本人删除与旧通知回跳：显示已删除，无旧正文", async () => {
    await p.locator('[data-post-id="p2"] [data-action="post-more"]').click();
    await p.locator('[data-action="delete-post"]').click();
    await p.locator('[data-action="confirm-modal"]').click();
    assert((await p.locator('[data-post-id="p2"]').count()) === 0, "removed");
    await readNotices();
    await p.locator('[data-action="notice"][data-id="circle-notice"]').click();
    assert(
      (await p.locator("#app").innerText()).includes("动态已删除"),
      "deleted target",
    );
    assert(
      (await p.locator(".circle-composer").count()) === 0,
      "no ghost composer",
    );
  });
  await run("回复通知复用消息中心、打开标已读，圈内不加消息图标", async () => {
    assert(
      (await p.locator('.circle-root [data-action="inbox"]').count()) === 0,
      "one main entry",
    );
    await readNotices();
    await p.locator('[data-action="notice"][data-id="circle-notice"]').click();
    assert(
      (await p.locator(".circle-detail .circle-text").innerText()).includes(
        "东区",
      ),
      "correct post",
    );
    assert(
      await p.evaluate(
        () => model.notifications.find((n) => n.id === "circle-notice").read,
      ),
      "read notice",
    );
  });
  await run("加载/空/失败区分，重试后恢复且无假动态", async () => {
    await p.selectOption("#circle-state", "loading");
    assert((await p.locator(".circle-card").count()) === 0, "not ready");
    await p.selectOption("#circle-state", "error");
    assert(
      (await p.locator(".circle-status").innerText()).includes(
        "动态暂时无法加载",
      ),
      "error not empty",
    );
    await p.locator('[data-action="circle-retry"]').click();
    await p.waitForTimeout(320);
    assert((await p.locator(".circle-card").count()) === 3, "recovered");
    await p.selectOption("#circle-state", "empty");
    assert(
      (await p.locator(".circle-card").count()) === 0 &&
        (await p.locator(".circle-status").innerText()).includes("还没有动态"),
      "real empty",
    );
  });
  await run("退出清除圈内草稿，游客发布需登录且不生成动态", async () => {
    await openPost("p1");
    await p.locator("#comment-input").fill("TEST session-only reply");
    await back();
    await compose();
    assert(
      (await p.locator('[name="topic"]').inputValue()) === "",
      "topic optional",
    );
    await p.locator('[name="text"]').fill("TEST session-only post");
    await back();
    await p.locator('[data-action="circle-keep-draft"]').click();
    await p.selectOption("#scenario", "guest");
    assert(
      await p.evaluate(
        () =>
          !state.forms.post &&
          Object.keys(window.abasongCircle.state.drafts).length === 0,
      ),
      "session cleared",
    );
    await p.locator('.bottom-nav [data-id="circle"]').click();
    await p.locator('[data-action="circle-publish"]').click();
    await p.locator('[data-action="new-post"]').click();
    assert((await p.locator("#app").innerText()).includes("登录"), "auth gate");
    assert(await p.evaluate(() => model.posts.length === 3), "no publication");
  });
  await run("320/390/430窄屏：信息流不横溢出，编辑/回复操作可见", async () => {
    for (const width of [320, 390, 430]) {
      await p.setViewportSize({ width, height: 844 });
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "feed overflow " + width,
      );
      await openPost("p2");
      assert(
        await p.locator('.circle-composer [type="submit"]').isVisible(),
        "reply visible",
      );
      await back();
      await compose();
      assert(
        await p.locator('.circle-editor-actions [type="submit"]').isVisible(),
        "publish visible",
      );
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "editor overflow",
      );
      await back();
    }
    await p.setViewportSize({ width: 1400, height: 980 });
  });
  const folder = "design/abasong-independent-v1/v12.1-experience/evidence";
  await fresh();
  await p.locator("#device").screenshot({ path: folder + "/circle-home.png" });
  await openPost("p1");
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-detail.png" });
  await back();
  await compose();
  await p
    .locator('[name="text"]')
    .fill("TEST 新线路理货时，我会先按门牌分组。");
  await p.selectOption('[name="topic"]', "经验分享");
  await p.selectOption('[name="region"]', "Pasadena");
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-publish.png" });
  const report = {
    prototype_version: "3.2-circle-images",
    executed_at: new Date().toISOString(),
    scope:
      "isolated synthetic circle browser checks; state injection only for reference/version fault; no business services",
    checks,
    passed: checks.filter((c) => c.status === "PASS").length,
    failed: checks.filter((c) => c.status === "FAIL").length,
    console_errors: errors,
    external_request_hosts: [...new Set(external)],
    human_participants: 0,
    native_acceptance: false,
  };
  await context.close();
  return report;
}
