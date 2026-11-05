// Execute with Playwright's browser_run_code_unsafe filename argument.
// Uses an isolated browser context; never opens navigation providers or business services.
async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1400, height: 980 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedAddress = value;
        },
      },
    });
  });
  const p = await context.newPage();
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
  const assert = (yes, message) => {
    if (!yes) throw new Error(message);
  };
  const fresh = async () => {
    await p.goto(
      "http://127.0.0.1:8765/v12.1-experience/index.html?check=" +
        checks.length,
    );
    await p.waitForFunction(
      () => window.abasongExperience?.state.code.status === "ready",
    );
  };
  const mode = async (id) => {
    await p.locator(`[data-action="map-view"][data-id="${id}"]`).click();
    if (id !== "apartments")
      await p.waitForFunction(
        (id) => window.abasongExperience.state.status[id] === "ready",
        id,
      );
    else await p.waitForTimeout(160);
  };
  const run = async (name, fn) => {
    try {
      await fresh();
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", reason: e.message.slice(0, 700) });
    }
  };
  const openFilter = async () => {
    await p.locator(".search-trigger").click();
  };
  const applyFilter = async () => {
    await p.locator("#overlay [type=submit]").click();
    await p.waitForFunction(
      () =>
        window.abasongExperience.state.status[
          document.querySelector("#device").dataset.mode
        ] === "ready",
    );
  };
  const selectRegion = async (region) => {
    await p.locator(`.ex-region[data-id="${region}"]`).click();
    await p.waitForFunction(
      () =>
        window.abasongExperience.state.status[
          document.querySelector("#device").dataset.mode
        ] === "ready",
    );
  };
  await run("公寓独立192px卡、完整符号与贡献人，无重复标题", async () => {
    const cards = p.locator(".ex-apartment-card");
    assert((await cards.count()) === 3, "three cards");
    assert(
      (await p
        .locator(".ex-apartment-card:not([inert]) .ex-code")
        .innerText()) === "*0128#",
      "code symbols",
    );
    const heights = await cards.evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().height)),
    );
    assert(
      heights.every((h) => h === 192),
      "equal card heights",
    );
    assert(
      (await p.locator(".ex-code-meta").innerText()).includes("阿杰"),
      "contributor",
    );
    assert(
      !(await p.locator("#app").innerText()).includes("门禁密码"),
      "no extra caption",
    );
  });
  await run("鼠标横拖切公寓，地图/密码同步，展开收起保持选择", async () => {
    const box = await p.locator(".ex-carousel").boundingBox();
    await p.mouse.move(box.x + box.width - 75, box.y + 80);
    await p.mouse.down();
    await p.mouse.move(box.x + 52, box.y + 80, { steps: 15 });
    await p.mouse.up();
    await p.waitForFunction(
      () => document.querySelector(".ex-carousel")?.dataset.activeApt === "a2",
    );
    await p.waitForTimeout(400);
    assert(
      (await p
        .locator(".ex-apartment-card:not([inert]) .ex-code")
        .innerText()) === "07412*",
      "second code",
    );
    await p.locator(".ex-apartment-card:not([inert])").click();
    assert((await p.locator(".ex-expanded").count()) === 1, "expanded");
    await p.locator('[aria-label="收起公寓卡片"]').click();
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-apt")) ===
        "a2",
      "same card",
    );
  });
  await run("公寓无码可直接贡献并返回同地址", async () => {
    await p.locator('[data-action="ex-apt"][data-id="a3"]').click();
    await p.waitForTimeout(170);
    assert(
      (await p.locator(".ex-apartment-card:not([inert])").innerText()).includes(
        "暂无共享密码",
      ),
      "no code",
    );
    await p
      .locator('.ex-apartment-card:not([inert]) [data-action="add-code"]')
      .click();
    await p.locator('[name="value"]').fill("*0078#");
    await p.locator('[name="scope"]').fill("侧门");
    await p.locator('[name="source"]').check();
    await p.locator(".fixed-actions [type=submit]").click();
    await p.waitForFunction(
      () => document.querySelector(".ex-expanded") !== null,
    );
    assert(
      (await p.locator(".ex-expanded h2").innerText()).includes("1185"),
      "same apartment",
    );
    assert(
      (await p.locator(".ex-expanded .ex-code").allTextContents()).includes(
        "*0078#",
      ),
      "new code",
    );
  });
  await run("查码失败保持地址且不冒充无码，重试恢复", async () => {
    await p.selectOption("#scenario", "offline");
    await p.waitForTimeout(200);
    assert(
      (await p.locator(".ex-apartment-card:not([inert])").innerText()).includes(
        "密码暂时无法加载",
      ),
      "error",
    );
    assert(
      (await p.locator(".ex-apartment-card .ex-code").count()) === 0,
      "no old code",
    );
    await p.locator('[data-action="ex-retry-code"]').click();
    await p.waitForTimeout(170);
    assert(
      (await p.locator(".ex-apartment-card:not([inert]) .ex-code").count()) ===
        1,
      "recovered",
    );
  });
  await run("无公寓低高度统一贡献入口；首页与我的入口一致", async () => {
    await p.selectOption("#scenario", "street");
    await p.locator(".ex-contribute").click();
    const first = await p.locator("#overlay").innerText();
    await p.locator('#overlay [data-action="close-modal"]').click();
    await p.locator('.bottom-nav [data-id="me"]').click();
    await p.locator('[data-action="lib-contribute"]').click();
    assert(
      (await p.locator("#overlay").innerText()) === first,
      "same contribution menu",
    );
  });
  await run("点区域真实筛选，地图列表同源", async () => {
    await mode("jobs");
    await selectRegion("Pasadena");
    assert(
      (await p.locator(".ex-query").innerText()).includes("2条需求"),
      "region count",
    );
    await p.locator('[data-action="map-list"]').click();
    assert(
      (await p.locator(".ex-home-list .ex-job-card").count()) === 2,
      "same list",
    );
    await p.locator('[data-action="return-map"]').click();
    assert(
      (await p.locator(".ex-region").count()) === 1,
      "one selected region",
    );
  });
  await run("需求日期按接手日；今天明天与有效截止分开", async () => {
    await mode("jobs");
    await openFilter();
    await p.selectOption('#overlay [name="day"]', "2026-11-05");
    await applyFilter();
    assert(
      (await p.locator(".ex-query").innerText()).includes("1条需求"),
      "tomorrow count",
    );
    assert(
      (await p.locator(".ex-map-card:not([inert])").innerText()).includes(
        "明天",
      ),
      "tomorrow label",
    );
  });
  await run("司机多服务区总人数去重，日期与经验筛选独立", async () => {
    await mode("people");
    await openFilter();
    await p.locator('#overlay [name="text"]').fill("GOFO");
    await applyFilter();
    assert(
      (await p.locator(".ex-query").innerText()).includes("2位司机"),
      "unique count",
    );
    assert(
      (await p.locator(".ex-region").count()) === 3,
      "three declared regions",
    );
    await openFilter();
    await p.selectOption('#overlay [name="day"]', "2026-11-05");
    await applyFilter();
    assert(
      (await p.locator(".ex-map-card:not([inert])").innerText()).includes(
        "阿峰",
      ),
      "future driver",
    );
  });
  await run("详情往返保留区域、列表和相机；定位不清筛选", async () => {
    await mode("jobs");
    await selectRegion("Pasadena");
    const b = await p.locator("[data-ex-map]").boundingBox();
    await p.mouse.move(b.x + 90, b.y + 330);
    await p.mouse.down();
    await p.mouse.move(b.x + 130, b.y + 345, { steps: 8 });
    await p.mouse.up();
    const before = await p.evaluate(() =>
      JSON.stringify(window.abasongExperience.state.contexts.jobs),
    );
    await p.locator('[data-action="map-list"]').click();
    await p.locator('.ex-home-list [data-id="j5"]').click();
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForSelector(".ex-home-list");
    assert(
      (await p.locator(".ex-home-list .ex-job-card").count()) === 2,
      "return to list",
    );
    await p.locator('[data-action="return-map"]').click();
    assert(
      before ===
        (await p.evaluate(() =>
          JSON.stringify(window.abasongExperience.state.contexts.jobs),
        )),
      "camera preserved",
    );
    await p.locator('[data-action="locate"]').click();
    assert(
      (await p.locator(".ex-query").innerText()).includes("Pasadena"),
      "filter preserved",
    );
    assert(
      await p.evaluate(
        () => window.abasongExperience.state.contexts.jobs.x === 0,
      ),
      "camera recentered",
    );
  });
  await run("不同模式慢响应不覆盖当前结果", async () => {
    await mode("jobs");
    await p.selectOption("#support-scenario", "slow");
    await p.waitForTimeout(80);
    await p.locator('[data-action="map-view"][data-id="people"]').click();
    await p.selectOption("#support-scenario", "ready");
    await p.waitForTimeout(2200);
    assert(
      (await p.locator("#device").getAttribute("data-mode")) === "people",
      "still people",
    );
    assert(
      (await p.locator(".ex-result-count").innerText()).includes("位司机"),
      "no job result",
    );
  });
  await run("读取失败不是0，调整场景后重试恢复", async () => {
    await mode("jobs");
    await p.selectOption("#support-scenario", "error");
    await p.waitForTimeout(180);
    assert(
      (await p.locator(".ex-result-count").innerText()) === "暂时无法读取",
      "failure scope",
    );
    assert((await p.locator(".ex-job-card").count()) === 0, "no stale cards");
    await p.selectOption("#support-scenario", "ready");
    await p.waitForTimeout(180);
    assert(
      (await p.locator(".ex-map-card:not([inert]) .ex-job-card").count()) === 1,
      "recovered",
    );
  });
  await run("仓库地址/地图/导航取消回原图，复制内容准确", async () => {
    await mode("jobs");
    await p.locator(".ex-map-card:not([inert])").click();
    const address = await p.locator(".ex-address-link span").innerText();
    await p.locator('[data-action="ex-copy-address"]').click();
    assert(
      (await p.evaluate(() => window.__copiedAddress)) === address,
      "copied full address",
    );
    await p.locator('[data-action="ex-pickup-map"]').click();
    await p.locator('.ex-place-map [data-action="ex-navigate"]').click();
    const links = await p
      .locator("a[data-provider]")
      .evaluateAll((nodes) => nodes.map((n) => n.href));
    assert(
      links.length === 2 &&
        links.every((s) => decodeURIComponent(s).includes(address)),
      "destination",
    );
    assert(
      links.every((s) => !/[?&](origin|source|access_token|token)=/.test(s)),
      "no origin or token",
    );
    await p.locator('[data-action="ex-nav-cancel"]').first().click();
    assert((await p.locator(".ex-place-map").count()) === 1, "back to map");
    await p.locator('.ex-place-map [data-action="close-modal"]').click();
    assert((await p.locator(".ex-pickup").count()) === 1, "back to detail");
  });
  await run("仓库地图失败仍能复制和选择导航", async () => {
    await mode("jobs");
    await p.locator(".ex-map-card:not([inert])").click();
    await p.check("#pickup-map-fail");
    await p.locator('[data-action="ex-pickup-map"]').click();
    assert(
      (await p.locator(".ex-place-map").innerText()).includes(
        "暂时无法显示位置",
      ),
      "map error",
    );
    assert(
      (await p.locator(".ex-warehouse-marker").count()) === 0,
      "no invented pin",
    );
    assert(
      await p
        .locator('.ex-place-map [data-action="ex-copy-address"]')
        .isVisible(),
      "copy available",
    );
    assert(
      await p.locator('.ex-place-map [data-action="ex-navigate"]').isVisible(),
      "navigate available",
    );
  });
  await run("途中交接没有假仓库点或导航", async () => {
    await mode("jobs");
    await selectRegion("West Covina");
    await p.locator(".ex-map-card:not([inert])").click();
    assert(
      (await p.locator(".ex-pickup").innerText()).includes("联系确认"),
      "contact",
    );
    assert(
      (await p.locator('[data-action="ex-pickup-map"]').count()) === 0,
      "no fake map",
    );
  });
  await run("发布：完整仓库地址必填，候选/预览/存储一致", async () => {
    await p.locator('[data-ex-flow="publish"]').click();
    await p
      .locator('[data-action="publish-kind"][data-id="partial_route"]')
      .click();
    await p.locator('.fixed-actions [type="submit"]').click();
    assert(
      (await p.locator(".field-error").allTextContents()).includes(
        "请填写完整取件地址",
      ),
      "required address",
    );
    await p.selectOption('[name="carrier"]', "SwiftX");
    await p.selectOption('[name="region"]', "Pasadena");
    await p.locator('[name="pickupAddress"]').fill("5685");
    await p.locator('[data-action="ex-pickup-choice"][data-id="w1"]').click();
    await p.locator('[name="date"]').fill("2026-11-04");
    await p.locator('[name="start"]').fill("15:00");
    await p.locator('[name="end"]').fill("19:00");
    await p.locator('[name="qty"]').fill("120");
    await p.locator('[name="price"]').fill("1.90");
    await p.locator(".fixed-actions [type=submit]").click();
    assert(
      (await p.locator(".ex-preview-address").count()) === 1,
      "address in preview",
    );
    await p.locator('[data-action="commit-request"]').click();
    assert(
      await p.evaluate(
        () =>
          model.jobs[0].pickupLocation.address ===
          "5685 Alcoa Ave, Los Angeles, CA 90058",
      ),
      "stored address",
    );
    assert(
      await p.evaluate(
        () => !("pickupLocation" in publicSummary(model.jobs[0])),
      ),
      "no exact address in public summary",
    );
  });
  await run("仓库/途中切换清理旧地点，草稿输入保留", async () => {
    await p.locator('[data-ex-flow="publish"]').click();
    await p
      .locator('[data-action="publish-kind"][data-id="partial_route"]')
      .click();
    await p.locator('[name="pickupAddress"]').fill("5685");
    await p.locator('[data-action="ex-pickup-choice"]').click();
    await p
      .locator('[data-action="ex-pickup-kind"][data-id="contact_handoff"]')
      .click();
    assert(
      (await p.locator('[name="pickupAddress"]').count()) === 0,
      "hidden address",
    );
    assert(
      await p.evaluate(() => state.forms.request.pickupAddress === ""),
      "stale address cleared",
    );
  });
  await run("可接活快捷日期/跨日明确，关闭旧时段可保存", async () => {
    await mode("people");
    await p.locator('[data-action="availability"]').click();
    await p.locator('[role="switch"]').check();
    await p.locator('[data-action="ex-date"][data-id="2026-11-05"]').click();
    assert(
      (await p.locator('[name="date"]').inputValue()) === "2026-11-05",
      "tomorrow",
    );
    await p.locator('[name="date"]').fill("");
    await p.locator('[role="switch"]').uncheck();
    await p.locator('.fixed-actions [type="submit"]').click();
    await p.waitForSelector(".ex-home");
    assert(
      await p.evaluate(() => model.availability.enabled === false),
      "closed",
    );
  });
  await run("地图缩放改变比例尺，卡片保持；定位恢复推荐", async () => {
    const map = p.locator("[data-ex-map]");
    await map.focus();
    for (let i = 0; i < 4; i++) await p.keyboard.press("+");
    assert(
      (await p.locator(".ex-scale span").innerText()) === "50 ft",
      "scale changed",
    );
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-apt")) ===
        "a1",
      "same apartment",
    );
    await p.locator(".ex-apartment-card:not([inert])").focus();
    await p.keyboard.press("ArrowRight");
    await p.locator('[data-action="locate"]').click();
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-apt")) ===
        "a1",
      "recommendation restored",
    );
  });
  await run("未登录或无查看资格，展开不展示合成密码", async () => {
    for (const scenario of ["guest", "unqualified"]) {
      await p.selectOption("#scenario", scenario);
      await p.waitForTimeout(150);
      await p.locator(".ex-apartment-card:not([inert])").click();
      assert(
        (await p.locator(".ex-expanded .ex-code").count()) === 0,
        "no code",
      );
      assert(
        (await p.locator('.ex-expanded [data-action="add-code"]').count()) ===
          0,
        "no misleading contribute action",
      );
      await p.locator('[aria-label="收起公寓卡片"]').click();
    }
  });
  await run("手填完整仓库地址未定位时，不画假点而可复制/导航", async () => {
    await p.locator('[data-ex-flow="publish"]').click();
    await p
      .locator('[data-action="publish-kind"][data-id="partial_route"]')
      .click();
    await p
      .locator('[name="pickupAddress"]')
      .fill("900 TEST Warehouse Ave, Pasadena, CA 91101");
    await p.locator('[data-action="ex-form-map"]').click();
    assert(
      (await p.locator(".ex-warehouse-marker").count()) === 0,
      "no guessed point",
    );
    assert(
      (await p.locator('.ex-place-map [data-action="ex-navigate"]').count()) ===
        1,
      "address navigation available",
    );
  });
  await run("洛杉矶日期边界包含DST短日与长日", async () => {
    const values = await p.evaluate(() => {
      const f = window.abasongExperience.laInstant;
      return [
        (f("2026-03-09") - f("2026-03-08")) / 3600000,
        (f("2026-11-02") - f("2026-11-01")) / 3600000,
      ];
    });
    assert(values[0] === 23 && values[1] === 25, "LA day lengths");
  });
  await run(
    "320/390/430小屏：卡片等高、无整页横溢出、固定操作可见",
    async () => {
      for (const width of [320, 390, 430]) {
        await p.setViewportSize({ width, height: 844 });
        await p.waitForTimeout(80);
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "page horizontal overflow at " + width,
        );
        const sizes = await p
          .locator(".ex-apartment-card")
          .evaluateAll((n) =>
            n.map((x) => Math.round(x.getBoundingClientRect().height)),
          );
        assert(
          sizes.every((h) => h === 192),
          "heights at " + width,
        );
        assert(await p.locator(".bottom-nav").isVisible(), "navigation");
      }
      await p.setViewportSize({ width: 1400, height: 980 });
    },
  );
  await run("同城两个仓库按需求保持独立，不串地址", async () => {
    await mode("jobs");
    await selectRegion("Pasadena");
    await p.locator('[data-action="map-list"]').click();
    await p.locator('.ex-home-list [data-id="j1"]').click();
    const first = await p.locator(".ex-address-link span").innerText();
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForSelector(".ex-home-list");
    await p.locator('.ex-home-list [data-id="j5"]').click();
    const second = await p.locator(".ex-address-link span").innerText();
    assert(
      first !== second &&
        first.includes("Los Angeles") &&
        second.includes("Los Angeles"),
      "distinct same-city warehouses",
    );
    await p.locator('[data-action="ex-navigate"]').click();
    const url = await p
      .locator('[data-provider="google"]')
      .getAttribute("href");
    assert(
      decodeURIComponent(url).includes(second) &&
        !decodeURIComponent(url).includes(first),
      "only current destination",
    );
  });
  await run("取件地图可缩放，导航取消保留视野且不改首页相机", async () => {
    await mode("jobs");
    const before = await p.evaluate(() =>
      JSON.stringify(window.abasongExperience.state.contexts.jobs),
    );
    await p.locator(".ex-map-card:not([inert])").click();
    await p.locator('[data-action="ex-pickup-map"]').click();
    await p.locator('.ex-place-map [data-ex-map="place"]').focus();
    for (let i = 0; i < 4; i++) await p.keyboard.press("+");
    assert(
      (await p.locator(".ex-place-scale").innerText()).includes("50 ft"),
      "place scale",
    );
    await p.locator('.ex-place-map [data-action="ex-navigate"]').click();
    await p.locator('[data-action="ex-nav-cancel"]').first().click();
    assert(
      (await p.locator(".ex-place-scale").innerText()).includes("50 ft"),
      "place camera retained",
    );
    assert(
      before ===
        (await p.evaluate(() =>
          JSON.stringify(window.abasongExperience.state.contexts.jobs),
        )),
      "home camera unchanged",
    );
  });
  const swipeNext = async () => {
    const track = p.locator(".ex-carousel");
    const before = await track.getAttribute("data-active-id");
    await p.locator(".ex-map-card:not([inert])").focus();
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction(
      (id) => document.querySelector(".ex-carousel")?.dataset.activeId !== id,
      before,
    );
    await p.waitForTimeout(200);
  };
  await run("地址分级与近似距离，不挤占单行街道", async () => {
    const style = await p
      .locator(".ex-apartment-card:not([inert]) .address-primary")
      .evaluate((n) => ({
        street: getComputedStyle(n).fontWeight,
        number: getComputedStyle(n.querySelector("b")).fontWeight,
        size: getComputedStyle(n).fontSize,
        nowrap: getComputedStyle(n).whiteSpace,
      }));
    assert(
      style.street === "400" &&
        Number(style.number) >= 700 &&
        style.size === "20px" &&
        style.nowrap === "nowrap",
      "address hierarchy",
    );
    assert(
      (await p
        .locator(".ex-apartment-card:not([inert]) .ex-distance")
        .innerText()) === "约40 ft · 至边界",
      "discovery-boundary distance",
    );
    await p.locator(".ex-apartment-card:not([inert])").click();
    assert(
      (await p.locator(".ex-expanded").getAttribute("aria-label")) ===
        "公寓密码详情",
      "valid expanded markup",
    );
    assert(
      (await p.locator(".ex-expanded .address-heading").innerText()).includes(
        "CA",
      ),
      "full address in detail",
    );
  });
  await run(
    "定位粗略弱化距离、过期隐藏数值，仍保留公寓地址与密码",
    async () => {
      await p.selectOption("#distance-quality", "approximate");
      assert(
        (await p
          .locator(".ex-apartment-card:not([inert]) .ex-distance")
          .innerText()) === "位置较粗略",
        "no false precision",
      );
      await p.selectOption("#distance-quality", "stale");
      assert(
        (await p.locator(".ex-distance").count()) === 0,
        "stale distances hidden",
      );
      assert(
        (await p
          .locator(".ex-apartment-card:not([inert]) .ex-code")
          .innerText()) === "*0128#",
        "code remains same property",
      );
    },
  );
  await run("三模式共用192px外框与12px间距，找人不是精确司机定位", async () => {
    for (const kind of ["apartments", "jobs", "people"]) {
      if (kind !== "apartments") await mode(kind);
      const frame = await p
        .locator(".ex-carousel")
        .evaluate((n) => ({
          gap: getComputedStyle(n).gap,
          items: [...n.children].map((c) => ({
            h: c.getBoundingClientRect().height,
            r: getComputedStyle(c).borderRadius,
            w: c.getBoundingClientRect().width,
            overflow: c.scrollHeight > c.clientHeight,
          })),
        }));
      assert(
        frame.gap === "12px" &&
          frame.items.every(
            (c) => c.h === 192 && c.r === "24px" && !c.overflow,
          ),
        "frame " + kind,
      );
      if (kind === "people")
        assert(
          !(await p.locator(".ex-carousel").innerText()).match(
            /(?:\b\d+(?:\.\d+)?\s*(?:ft|mi)\b|距您|距你)/,
          ),
          "no driver GPS distance",
        );
    }
  });
  await run("找活横滑高亮当前配送区，不改全部区域或自动报名", async () => {
    await mode("jobs");
    await swipeNext();
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "second job",
    );
    assert(
      (await p
        .locator('.ex-region[data-object-selected="true"]')
        .getAttribute("data-id")) === "Alhambra",
      "current delivery region",
    );
    assert(
      (await p.locator(".ex-query").innerText()).includes("全部区域"),
      "filter unchanged",
    );
    assert(
      (await p.locator(".ex-map-card:not([inert])").innerText()).includes(
        "Alhambra",
      ),
      "card matches region",
    );
    assert(
      (await p.locator("#screen-id").innerText()) === "H02",
      "no apply navigation",
    );
    await p.locator('[data-action="locate"]').click();
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "support recenter preserves selection",
    );
  });
  await run("找活滑卡进入详情、列表再返回仍是同一对象", async () => {
    await mode("jobs");
    await swipeNext();
    await p.locator(".ex-map-card:not([inert])").click();
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForSelector(".ex-carousel");
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "detail return",
    );
    await p.locator('[data-action="map-list"]').click();
    assert(
      (await p.locator(".ex-home-list .ex-job-card").count()) === 5,
      "same results",
    );
    await p.locator('[data-action="return-map"]').click();
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "list return",
    );
  });
  await run("找人跨区一人一卡，滑卡同步声明区域并保留经验筛选", async () => {
    await mode("people");
    await openFilter();
    await p.locator('#overlay [name="text"]').fill("GOFO");
    await applyFilter();
    assert(
      (await p.locator(".ex-map-card").count()) === 2,
      "one card per unique driver",
    );
    assert(
      (await p.locator('.ex-region[data-object-selected="true"]').count()) ===
        2,
      "first driver declares two regions",
    );
    await swipeNext();
    assert(
      (await p.locator(".ex-map-card:not([inert])").innerText()).includes(
        "阿峰",
      ),
      "next driver",
    );
    assert(
      (await p
        .locator('.ex-region[data-object-selected="true"]')
        .getAttribute("data-id")) === "West Covina",
      "next region",
    );
    assert(
      (await p.locator(".ex-query").innerText()).includes("GOFO"),
      "experience unchanged",
    );
    await p.locator(".ex-map-card:not([inert])").click();
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForSelector(".ex-carousel");
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "d4",
      "driver return",
    );
  });
  await run(
    "单结果无假邻卡，多结果中间卡露两边且过滤不被滑动修改",
    async () => {
      await mode("jobs");
      await selectRegion("Pasadena");
      await swipeNext();
      assert(
        (await p.locator(".ex-carousel").getAttribute("data-active-id")) ===
          "j5",
        "same region next",
      );
      assert(
        (await p.locator(".ex-query").innerText()).includes("Pasadena"),
        "region retained",
      );
      await p.locator('[data-action="clear-support-filters"]').click();
      await p.waitForTimeout(200);
      await p.locator(".ex-map-card:not([inert])").focus();
      await p.keyboard.press("ArrowLeft");
      await p.waitForTimeout(200);
      const peek = await p.locator(".ex-carousel").evaluate((n) => {
        const c = n.querySelector("[tabindex]");
        const b = c.getBoundingClientRect(),
          l = c.previousElementSibling?.getBoundingClientRect(),
          r = c.nextElementSibling?.getBoundingClientRect(),
          t = n.getBoundingClientRect();
        return (
          !!l && !!r && l.right > t.left && r.left < t.right && b.left > t.left
        );
      });
      assert(peek, "both neighboring edges");
      await openFilter();
      await p.selectOption('#overlay [name="day"]', "2026-11-05");
      await applyFilter();
      assert(
        (await p
          .locator(".ex-carousel.ex-single-card .ex-map-card")
          .count()) === 1,
        "single real result",
      );
    },
  );
  await run("320/390/430三模式同高且距离不重叠门牌或拖柄", async () => {
    for (const width of [320, 390, 430]) {
      await p.setViewportSize({ width, height: 844 });
      for (const kind of ["apartments", "jobs", "people"]) {
        await mode(kind);
        const frame = await p
          .locator(".ex-carousel")
          .evaluate((n) => ({
            h: [...n.children].map((c) =>
              Math.round(c.getBoundingClientRect().height),
            ),
            overflow: [...n.children].some(
              (c) => c.scrollHeight > c.clientHeight,
            ),
          }));
        assert(
          frame.h.every((h) => h === frame.h[0] && h >= 192) && !frame.overflow,
          "equal adaptive frames " + width + " " + kind,
        );
        if (width >= 390)
          assert(
            frame.h.every((h) => h === 192),
            "standard frames " + width + " " + kind,
          );
        if (kind === "apartments") {
          const overlap = await p
            .locator(".ex-map-card:not([inert])")
            .evaluate((n) => {
              const d = n.querySelector(".ex-distance").getBoundingClientRect(),
                h = n.querySelector(".card-handle").getBoundingClientRect(),
                a = n.querySelector("h2").getBoundingClientRect();
              return (
                (d.left < h.right &&
                  d.right > h.left &&
                  d.top < h.bottom &&
                  d.bottom > h.top) ||
                d.bottom > a.top
              );
            });
          assert(!overlap, "distance overlap " + width);
        }
      }
    }
    await p.setViewportSize({ width: 1400, height: 980 });
  });
  await run("找活与找人鼠标横拖切卡，不误开详情", async () => {
    for (const kind of ["jobs", "people"]) {
      await mode(kind);
      const before = await p
        .locator(".ex-carousel")
        .getAttribute("data-active-id");
      const box = await p.locator(".ex-carousel").boundingBox();
      await p.mouse.move(box.x + box.width - 75, box.y + 90);
      await p.mouse.down();
      await p.mouse.move(box.x + 52, box.y + 90, { steps: 15 });
      await p.mouse.up();
      await p.waitForFunction(
        (id) => document.querySelector(".ex-carousel")?.dataset.activeId !== id,
        before,
      );
      assert(
        (await p.locator(".ex-home").count()) === 1,
        "drag did not open detail " + kind,
      );
    }
  });
  await run("快速切公寓不串密码，调整屏宽保持选中对象", async () => {
    await p.locator(".ex-map-card:not([inert])").focus();
    await p.keyboard.press("ArrowRight");
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(350);
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "a3",
      "third apartment",
    );
    assert(
      (await p.locator(".ex-map-card:not([inert]) .ex-code").count()) === 0,
      "no previous password",
    );
    await mode("jobs");
    await swipeNext();
    await p.setViewportSize({ width: 320, height: 844 });
    await p.waitForTimeout(350);
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "selected through resize",
    );
    await p.setViewportSize({ width: 1400, height: 980 });
    await p.waitForTimeout(350);
    assert(
      (await p.locator(".ex-carousel").getAttribute("data-active-id")) === "j2",
      "selected after restore",
    );
  });
  // Capture clean review states, not assertions of native or physical-device acceptance.
  const folder = "design/abasong-independent-v1/v12.1-experience/evidence";
  await fresh();
  await p.setViewportSize({ width: 1400, height: 980 });
  await p.locator("#device").screenshot({ path: folder + "/home.png" });
  await mode("jobs");
  await p.locator("#device").screenshot({ path: folder + "/jobs.png" });
  await swipeNext();
  await p.locator("#device").screenshot({ path: folder + "/jobs-middle.png" });
  await p.locator(".ex-map-card:not([inert])").focus();
  await p.keyboard.press("ArrowLeft");
  await p.waitForTimeout(200);
  await p.locator(".ex-map-card:not([inert])").click();
  await p
    .locator(".ex-pickup")
    .screenshot({ path: folder + "/pickup-detail.png" });
  await p.locator('[data-action="ex-pickup-map"]').click();
  await p.locator("#device").screenshot({ path: folder + "/pickup-map.png" });
  await fresh();
  await mode("people");
  await p.locator("#device").screenshot({ path: folder + "/people.png" });
  await swipeNext();
  await p
    .locator("#device")
    .screenshot({ path: folder + "/people-middle.png" });
  await fresh();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator("#device").screenshot({ path: folder + "/mobile-home.png" });
  await fresh();
  await p.setViewportSize({ width: 320, height: 844 });
  await mode("jobs");
  await p.locator("#device").screenshot({ path: folder + "/jobs-small.png" });
  const report = {
    prototype_version: "3.2-r2a2",
    executed_at: new Date().toISOString(),
    scope:
      "isolated Chromium prototype; synthetic business data; external navigation not opened; clipboard stubbed",
    checks,
    console_errors: errors,
    external_request_hosts: [...new Set(external)],
    passed: checks.filter((c) => c.status === "PASS").length,
    failed: checks.filter((c) => c.status === "FAIL").length,
    native_acceptance: false,
  };
  await context.close();
  return report;
}
