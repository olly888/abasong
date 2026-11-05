// Isolated synthetic interaction checks. No real service, clipboard, account or message.
async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1400, height: 980 } });
  const p = await context.newPage(),
    checks = [],
    errors = [],
    external = [];
  p.setDefaultTimeout(4000);
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
  const fresh = async (task = "") => {
    await p.goto(
      "http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-core&task=" +
        task +
        "&case=" +
        checks.length,
    );
    await p.waitForFunction(() => window.abasongExperience);
  };
  const run = async (name, fn) => {
    try {
      await fresh();
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", reason: e.message.slice(0, 400) });
    }
  };
  const screenshots = async (ids) => {
    await p
      .locator('[data-action="lib-contribute"]')
      .count()
      .then(async (n) => {
        if (n) await p.locator('[data-action="lib-contribute"]').click();
        else
          await p
            .locator('.bottom-nav [data-id="me"]')
            .click()
            .then(() => p.locator('[data-action="lib-contribute"]').click());
      });
    await p.locator('[data-action="lib-contribute-screenshots"]').click();
    await p.locator('[data-action="import-gallery"]').click();
    for (const id of ids)
      await p.locator(`[data-action="import-select"][data-id="${id}"]`).click();
    await p.locator('[data-action="import-chosen"]').click();
    await p.locator('[data-action="import-recognize"]').click();
    await p.waitForSelector(".import-scope-summary");
  };
  const share = async () => {
    await p.locator("[data-import-consent]").check();
    await p.locator('[data-action="import-submit"]').click();
    await p.waitForSelector('[data-action="import-done"]');
  };
  await run("截图两张：有疑字符不自动共享，核对后确认完整符号", async () => {
    await screenshots(["s1", "s3"]);
    assert(
      await p.evaluate(
        () => !model.apartments[1].codes.some((c) => c.value === "#74I2"),
      ),
      "unconfirmed not published",
    );
    await p
      .locator('.import-row.attention [data-action="import-edit"]')
      .click();
    await p.locator('.import-editor [name="code"]').fill("#7412");
    await p.locator('.import-editor [type="submit"]').click();
    await share();
    assert(
      await p.evaluate(
        () =>
          model.apartments[0].codes.some((c) => c.value === "0017#") &&
          model.apartments[1].codes.some((c) => c.value === "#7412"),
      ),
      "confirmed exact codes",
    );
    await p.locator('[data-action="import-done"]').click();
    assert(await p.locator(".bottom-nav").isVisible(), "returns to origin");
  });
  await run("未收录截图：完整地址须本人确认，共享后不造附近位置", async () => {
    await screenshots(["s6"]);
    await p.locator('[data-action="import-edit"]').click();
    await p.selectOption('.import-editor [name="apt"]', "new");
    await p.locator('.import-editor [type="submit"]').click();
    assert(
      (await p.locator(".import-editor").innerText()).includes(
        "请核对完整英文地址",
      ),
      "address confirmation required",
    );
    await p.locator('[name="addressConfirmed"]').check();
    await p.locator("#device").screenshot({
      path: "design/abasong-independent-v1/v12.1-experience/evidence/core-new-address.png",
    });
    await p.locator('.import-editor [type="submit"]').click();
    await share();
    assert(
      await p.evaluate(() => {
        const a = model.apartments.find(
          (a) => a.address === "1610 W Cedar Ave, Los Angeles, CA",
        );
        return a?.nearby === false && a.codes.some((c) => c.value === "0073*");
      }),
      "confirmed address/code",
    );
    await p.locator('[data-action="import-done"]').click();
    await p.locator('.bottom-nav [data-id="home"]').click();
    assert(
      !(await p.locator(".ex-carousel").innerText()).includes("1610"),
      "unknown coordinates not nearby",
    );
  });
  await run("纠正本人来源：同码他人资料保留，旧来源不再展示密码", async () => {
    await fresh("correction");
    await p
      .locator('[data-action="lib-correct"][data-id="library-example"]')
      .click();
    await p
      .locator('[data-submit="library-correct"] [name="code"]')
      .fill("#0099*");
    await p.locator('[data-submit="library-correct"] [name="source"]').check();
    await p.locator('[data-submit="library-correct"] [type="submit"]').click();
    assert(
      await p.evaluate(() => {
        const a = model.apartments[0],
          old = a.codes.find((c) => c.id === "library-example");
        return (
          old.myCorrected &&
          old.status === "active" &&
          a.codes.some((c) => c.value === "#0099*" && c.mine)
        );
      }),
      "source isolation",
    );
    const history = p
      .locator(".library-shared")
      .filter({ hasText: "本人已纠正" });
    assert(
      (await history.locator(".import-code").count()) === 0,
      "old secret hidden",
    );
    assert(
      (await p.locator('[data-action*="withdraw"]').count()) === 0,
      "no ordinary withdrawal",
    );
    await p.locator("#device").screenshot({
      path: "design/abasong-independent-v1/v12.1-experience/evidence/core-correction.png",
    });
  });
  await run("纠正取消保留原资料、不生成新来源", async () => {
    await fresh("correction");
    const before = await p.evaluate(() => model.apartments[0].codes.length);
    await p.locator('[data-action="lib-correct"]').first().click();
    await p.locator('[name="code"]').fill("#0088*");
    await p.locator('#overlay [data-action="close-modal"]').click();
    assert(
      await p.evaluate(
        (n) =>
          model.apartments[0].codes.length === n &&
          !model.apartments[0].codes.some((c) => c.value === "#0088*"),
        before,
      ),
      "cancel is not mutation",
    );
  });
  await run("支援条件变化：重新核对后报名，进入同一来源会话", async () => {
    await fresh("support");
    await p.waitForFunction(
      () => window.abasongExperience.state.status.jobs === "ready",
    );
    await p.locator(".ex-map-card:not([inert])").click();
    await p.locator('[data-action="apply"]').click();
    await p.locator('[name="capacity"]').fill("60");
    await p.locator("#change-price").check();
    await p.locator('[data-submit="apply"] [type="submit"]').click();
    assert(
      (await p.locator('[data-submit="apply"]').innerText()).includes(
        "需求条件已更新",
      ),
      "version change",
    );
    await p.locator('[data-submit="apply"] [type="submit"]').click();
    await p.waitForSelector(".composer");
    assert(
      await p.evaluate(
        () =>
          model.applications.filter((a) => a.job === "j1" && a.user === "me")
            .length === 1,
      ),
      "one application",
    );
    assert(
      (await p.locator(".message-source").innerText()).includes("Pasadena"),
      "source preserved",
    );
    await p.locator("#device").screenshot({
      path: "design/abasong-independent-v1/v12.1-experience/evidence/core-contact.png",
    });
  });
  await run("文字发送失败与重试：同条恢复，无重复气泡或假已读", async () => {
    await fresh("messages");
    await p.locator('[data-action="chat"]').first().click();
    await p.locator("#send-fail").check();
    await p.locator("#message-input").fill("TEST availability question");
    await p.locator('.composer [type="submit"]').click();
    assert(
      (await p.locator(".chat-meta").allTextContents()).some((t) =>
        t.includes("发送失败"),
      ),
      "failed state",
    );
    await p.locator('[data-action="retry-message"]').click();
    assert(
      (await p
        .locator(".bubble")
        .filter({ hasText: "TEST availability question" })
        .count()) === 1,
      "single retried message",
    );
    assert(
      !(
        await p
          .locator(".chat-row")
          .filter({ hasText: "TEST availability question" })
          .innerText()
      ).includes("对方已读"),
      "no fake read",
    );
  });
  await run("截图退出后从头添加，不出现跨次续填", async () => {
    await screenshots(["s3"]);
    await p.locator('.page-head [data-action="back"]').click();
    await p.locator('.page-head [data-action="back"]').click();
    await p.locator('#overlay [data-action="confirm-modal"]').click();
    await p.locator('[data-action="lib-contribute"]').click();
    await p.locator('[data-action="lib-contribute-screenshots"]').click();
    assert(
      (await p.locator("#app").innerText()).includes("添加公寓地址和密码截图"),
      "fresh picker",
    );
    assert(
      !(await p.locator("#app").innerText()).includes("继续上次"),
      "no resume",
    );
  });
  await run("截图部分失败只重试未成功项，已共享不重复", async () => {
    await screenshots(["s5"]);
    await p.locator("#import-submit-fail").evaluate((n) => {
      n.checked = true;
    }); // Inject one synthetic save fault.
    await p.locator("[data-import-consent]").check();
    await p.locator('[data-action="import-submit"]').click();
    await p.waitForSelector('[data-action="import-retry-submit"]');
    assert(
      await p.evaluate(
        () =>
          model.apartments[0].codes.filter((c) => c.value === "0146#")
            .length === 1 &&
          !model.apartments[1].codes.some((c) => c.value === "*1020"),
      ),
      "partial success only",
    );
    await p.locator('[data-action="import-retry-submit"]').click();
    await p.waitForSelector('[data-action="import-done"]');
    assert(
      await p.evaluate(
        () =>
          model.apartments[0].codes.filter((c) => c.value === "0146#")
            .length === 1 &&
          model.apartments[1].codes.filter((c) => c.value === "*1020")
            .length === 1,
      ),
      "only failed retried",
    );
  });
  await run("DSP标记已找到：停止展示，保留已有消息和记录", async () => {
    const before = await p.evaluate(() => model.chats.length);
    await p.selectOption("#inspect-page", "manage");
    await p.locator('[data-action="found"]').click();
    await p.locator('#overlay [data-action="confirm-modal"]').click();
    assert(
      await p.evaluate(
        (n) =>
          model.jobs.find((j) => j.id === "j3").status === "found" &&
          model.chats.length === n,
        before,
      ),
      "close preserves history",
    );
    await p.locator('.page-head [data-action="back"]').click();
    await p.locator('[data-action="map-view"][data-id="jobs"]').click();
    await p.waitForFunction(
      () => window.abasongExperience.state.status.jobs === "ready",
    );
    assert(
      (await p.locator('.ex-map-card[data-card-id="j3"]').count()) === 0,
      "not offered after found",
    );
  });
  await run("评审快捷入口不计作用户测试，产品无研究备注", async () => {
    await p.goto("http://127.0.0.1:8765/v12.1-experience/review.html");
    assert(
      (await p.locator("article").count()) === 7,
      "five core tasks plus circle and account follow-ups",
    );
    await p.locator("nav a").click();
    await p.waitForFunction(() => window.abasongExperience);
    assert(
      !(await p.locator("#app").innerText()).match(
        /参与者|可用性测试|代码差异/,
      ),
      "no engineering labels in product",
    );
  });
  const result = {
    prototype_version: "3.2-r3-core",
    executed_at: new Date().toISOString(),
    scope:
      "isolated Chromium synthetic core flow checks; not human/native/field acceptance",
    checks,
    passed: checks.filter((x) => x.status === "PASS").length,
    failed: checks.filter((x) => x.status === "FAIL").length,
    console_errors: errors,
    external_request_hosts: [...new Set(external)],
    human_participants: 0,
    native_acceptance: false,
  };
  await context.close();
  return result;
}
