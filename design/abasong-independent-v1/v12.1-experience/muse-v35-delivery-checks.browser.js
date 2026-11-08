// M5-01: Muse delivery regression. Synthetic browser state only, not native acceptance.
// Run with browser_run_code_unsafe; server on localhost:8765.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await context.newPage();
  p.setDefaultTimeout(4000);
  const checks = [], errors = [], external = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:8765/") && !r.url().startsWith("data:")) external.push(new URL(r.url()).hostname);
  });
  const url = "http://127.0.0.1:8765/v12.1-experience/index.html";
  const fresh = (task, ux = "v34") => p.goto(`${url}?layout=muse&ux=${ux}&task=${task}&audit=${checks.length}`);
  const action = (a, id) => p.locator(`[data-action="${a}"]${id ? `[data-id="${id}"]` : ""}`).first();
  const field = (name) => p.locator(`#app [name="${name}"]`).first();
  const choose = (name) => p.getByRole("radio", { name, exact: true }).check();
  const review = () => p.getByRole("button", { name: "核对需求", exact: true }).click();
  const dialog = () => p.getByRole("dialog", { name: "核对配送需求" });
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  const measure = () => p.locator(".delivery-form").evaluate((n) => ({ height: n.scrollHeight, visible: n.clientHeight, scroll: n.scrollHeight - n.clientHeight }));
  const run = async (name, check) => {
    try { await check(); checks.push({ name, status: "PASS" }); }
    catch (error) { checks.push({ name, status: "FAIL", reason: error.message.split("\n").slice(0, 5).join("\n") }); }
  };
  const warehouse = async () => {
    await fresh("delivery");
    await action("delivery-scene", "warehouse").click();
  };
  const fillWarehouse = async () => {
    await field("pickupAddress").fill("5685");
    await action("ex-pickup-choice").click();
    await action("v34-confirm-warehouse").click();
    await field("region").selectOption("Pasadena");
    await choose("SwiftX");
    await field("start").fill("15:00");
    await field("qty").fill("120");
    await field("price").fill("1.85");
  };
  const rescue = async () => {
    await fresh("delivery");
    await action("delivery-scene", "rescue").click();
  };
  const compose = async () => {
    await fresh("circle");
    await action("circle-publish").click();
    await action("new-post").click();
  };
  try {
    await run("仓库默认约时间、约数、1人，缺项定位到仓库地址", async () => {
      await warehouse();
      assert(await field("start").inputValue() === "" && await field("drivers").inputValue() === "1", "warehouse defaults");
      assert(await p.getByRole("radio", { name: "约数", exact: true }).isChecked(), "estimate default");
      await review();
      assert(await p.evaluate(() => document.activeElement.name) === "pickupAddress", "focus first invalid");
      assert(await p.locator(".field-error").count() > 0 && await dialog().count() === 0, "blocked incomplete");
    });
    await run("仓库从零发布，核对显示默认下架，修改分组保留输入及失败后重试", async () => {
      await warehouse(); await fillWarehouse();
      await action("v34-drivers", "1").click();
      await review();
      const summary = await dialog().innerText();
      assert(/11:59 PM/.test(summary) && /2 人/.test(summary) && summary.includes("$1.85 / 件"), "default expiry, headcount and unit");
      await dialog().getByRole("button", { name: "修改任务量与报价" }).click();
      assert(await field("price").inputValue() === "1.85" && await p.evaluate(() => document.activeElement.id) === "delivery-load", "review return focus and inputs");
      await p.locator("#delivery-extra > summary").click();
      await field("route").fill("TEST-R34"); await choose("已理货");
      await review();
      assert((await dialog().innerText()).includes("TEST-R34") && (await dialog().innerText()).includes("已理货"), "optional facts retained");
      await p.locator("#delivery-save-fail").evaluate((n) => { n.checked = true; });
      await dialog().getByRole("button", { name: "确认发布" }).click();
      await p.getByText("保存未成功，填写内容已保留，请重试。", { exact: true }).waitFor();
      assert(await field("qty").inputValue() === "120" && await field("price").inputValue() === "1.85", "preserved after failed publish");
      await review(); await dialog().getByRole("button", { name: "确认发布" }).click();
      assert(await p.evaluate(() => model.jobs.filter((j) => j.route === "TEST-R34" && j.status === "open").length) === 1, "published once");
    });
    await run("改计价须重输金额，换仓库须重确认且保留业务字段", async () => {
      await warehouse(); await fillWarehouse();
      await choose("按线路");
      assert(await field("price").inputValue() === "", "amount not carried across units");
      await field("price").fill("80");
      await action("v34-change-warehouse").click();
      await action("v34-manual-warehouse").click();
      await field("warehouseStreet").fill("100 TEST Way");
      await field("warehouseCity").fill("Pasadena");
      await action("v34-save-warehouse").click();
      await field("pickup").selectOption("Pasadena");
      await review();
      assert(await dialog().count() === 0 && await p.evaluate(() => document.activeElement.dataset.action) === "v34-confirm-warehouse", "new address must be confirmed");
      await action("v34-confirm-warehouse").click(); await review();
      const summary = await dialog().innerText();
      assert(summary.includes("100 TEST Way, Pasadena, CA") && summary.includes("$80 / 线路") && summary.includes("120 件"), "retains quantities and quote");
    });
    await run("保存草稿后恢复地址与报价，确认发布沿用原草稿", async () => {
      await warehouse(); await fillWarehouse(); await action("save-draft").click();
      const id = await p.evaluate(() => model.jobs[0].id);
      assert(await p.evaluate((key) => getJob(key).status, id) === "draft", "private draft status");
      await action("edit-job", id).click();
      assert(await action("v34-confirm-warehouse").getAttribute("aria-pressed") === "true" && await field("price").inputValue() === "1.85", "saved address and price restored");
      await review(); await dialog().getByRole("button", { name: "确认发布" }).click();
      assert(await p.evaluate((key) => getJob(key).status, id) === "open", "same draft becomes open");
    });
    await run("代送默认尽快和确定件数，未来日必须重选时间并保持选中地点", async () => {
      await rescue();
      assert(await p.getByRole("radio", { name: "确定", exact: true }).isChecked() && await p.getByRole("radio", { name: "尽快到场" }).isChecked(), "rescue defaults");
      assert(await field("drivers").count() === 0 && await field("pickupAddress").count() === 0, "rescue has no default warehouse or headcount");
      await field("pickup").selectOption("West Covina"); await action("v34-same-region").click();
      await choose("GOFO"); await choose("待确认"); await choose("联系议价");
      await action("delivery-date", "2026-11-05").click();
      assert(await field("start").inputValue() === "", "future has no guessed time");
      await review();
      assert(await p.evaluate(() => document.activeElement.name) === "start", "future time required");
      await field("start").fill("07:00"); await review();
      const summary = await dialog().innerText();
      assert(summary.includes("West Covina") && summary.includes("明天 7:00 AM") && summary.includes("数量待确认") && summary.includes("联系议价"), "future summary");
    });
    await run("整线必须确认件数，自定义下架不能晚于最迟接手", async () => {
      await rescue(); await field("pickup").selectOption("West Covina"); await action("v34-same-region").click(); await choose("GOFO"); await choose("待确认"); await choose("联系议价");
      await p.locator("#delivery-conditions > summary").click();
      await choose("整条线路接手");
      assert((await p.locator(".field-error").allTextContents()).some((x) => x.includes("整线接手请确认件数")), "shows quantity requirement immediately");
      await choose("确定"); await field("qty").fill("50");
      await p.locator("#delivery-extra > summary").click(); await field("pickupEnd").fill("16:00");
      await field("customExpiry").check(); await field("end").fill("17:00"); await review();
      assert(await dialog().count() === 0 && (await p.locator(".field-error").allTextContents()).some((x) => x.includes("不能晚于最迟接手")), "expiry guard");
    });
    await run("核对页任务报价在前、身份在末，原分组修改入口保留", async () => {
      await warehouse(); await fillWarehouse(); await review();
      const groups = await dialog().locator(".v34-review-group header").allTextContents();
      assert(groups[0].includes("任务量与报价") && groups.at(-1).includes("发布身份"), "review hierarchy");
      assert(await dialog().locator(".m35-delivery-band").count() === 1, "one core terms band");
      assert(!(await dialog().innerText()).includes("<span"), "plain quote without escaped markup");
      assert(await dialog().getByRole("button", {name:"修改到场与下架"}).count() === 1, "schedule edit preserved");
      await p.screenshot({path:"/Users/olly/Abasong/artifacts/muse-m5-01/prototype-review-390.png"});
    });
    await run("详情与报名显示同一任务摘要和完整仓库地址", async () => {
      await warehouse(); await fillWarehouse(); await review();
      await dialog().getByRole("button", { name: "确认发布" }).click();
      await p.evaluate(() => { state.route={view:"job",args:{id:model.jobs[0].id}}; render(); });
      await p.locator(".m35-delivery-detail").waitFor();
      const detail = await p.locator(".m35-delivery-detail").innerText();
      assert(detail.includes("$1.85 / 件") && detail.includes("5685") && !detail.includes("<span"), "detail summary");
      assert(await action("ex-pickup-map").count() === 1, "warehouse map entry");
      await p.waitForFunction(() => !document.querySelector("#toast.show"));
      await p.screenshot({path:"/Users/olly/Abasong/artifacts/muse-m5-01/prototype-detail-390.png"});
      await p.evaluate(() => { state.route={view:"apply",args:{id:model.jobs[0].id}}; render(); });
      await p.locator(".m35-application").waitFor();
      const application = await p.locator(".m35-application").innerText();
      assert(application.includes("$1.85 / 件") && application.includes("5685") && application.includes("本次可接活"), "application summary and pickup");
      await p.screenshot({path:"/Users/olly/Abasong/artifacts/muse-m5-01/prototype-application-390.png"});
    });
    const measurements = [];
    await run("320／390／430 宽度下无横向溢出，常用控件至少48高", async () => {
      for (const width of [320, 390, 430]) {
        await p.setViewportSize({ width, height: 844 });
        for (const scene of ["warehouse", "rescue"]) {
          const versions = {};
          for (const ux of ["v34"]) {
            await fresh("delivery", ux); await action("delivery-scene", scene).click(); versions[ux] = await measure();
          }
          assert(await p.locator(".delivery-form").evaluate((n) => n.scrollWidth <= n.clientWidth + 1), "form does not overflow");
          const boxes = await p.locator(".v34-choice label > span").evaluateAll((nodes) => nodes.filter((n) => n.getClientRects().length).map((n) => n.getBoundingClientRect().height));
          assert(boxes.length > 0 && boxes.every((h) => h >= 48), "option touch size");
          measurements.push({ width, scene, ...versions });
        }
      }
    });
    return { checks, measurements, errors, external, passed: checks.filter((c) => c.status === "PASS").length, failed: checks.filter((c) => c.status === "FAIL").length };
  } finally { await context.close(); }
}
