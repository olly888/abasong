// Synthetic browser photo flows. TEST fixtures only; no camera, files, service or real upload.
async (page) => {
  const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width: 1400, height: 980 } }),
    p = await context.newPage();
  p.setDefaultTimeout(5000);
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
  const assert = (ok, label) => {
    if (!ok) throw Error(label);
  };
  const fresh = async () => {
    await p.goto(
      "http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-images&task=circle&test=" +
        checks.length,
    );
    await p.waitForFunction(
      () => window.abasongCircle?.version === "3.2-circle-images",
    );
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
  const compose = async () => {
    await p.locator('[data-action="circle-publish"]').click();
    await p.locator('[data-action="new-post"]').click();
  };
  const text = async (value = "TEST 图片配送经验") =>
    p.locator('[name="text"]').fill(value);
  const gallery = async () => {
    await p.locator('[data-action="circle-add-photo"]').click();
    await p.locator('[data-action="circle-photo-gallery"]').click();
  };
  const choose = async (ids) => {
    await gallery();
    for (const id of ids)
      await p
        .locator('[data-action="circle-gallery-toggle"][data-id="' + id + '"]')
        .click();
    await p.locator('[data-action="circle-gallery-done"]').click();
  };
  const submit = async () =>
    p.locator('.circle-editor-actions [type="submit"]').click();
  const published = async () => p.waitForSelector(".circle-detail");
  const back = async () => {
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForTimeout(60);
  };
  const close = async () =>
    p.locator('#overlay [data-action="close-modal"]').click();
  const images = async () =>
    p.evaluate(
      () =>
        state.forms.post?.images?.map((x) => ({
          id: x.id,
          upload: x.upload,
        })) || [],
    );
  await run("单图限制高度、点击查看，不增加回复图片入口", async () => {
    const picture = p.locator('[data-post-id="p1"] .circle-picture');
    assert((await picture.count()) === 1, "single thumbnail");
    const box = await picture.boundingBox();
    assert(box.height <= 220, "bounded height");
    await picture.click();
    assert(
      (await p.locator(".circle-viewer-head").innerText()).includes("1 / 1"),
      "large image",
    );
    await close();
    await p.locator('[data-post-id="p1"] [data-action="post"]').first().click();
    assert(
      (await p
        .locator('.circle-composer [data-action="circle-add-photo"]')
        .count()) === 0,
      "replies text only",
    );
  });
  await run("相册最多三张并按选择顺序，不重复添加", async () => {
    await compose();
    await choose(["parcel", "entry", "courtyard"]);
    assert(
      JSON.stringify((await images()).map((x) => x.id)) ===
        JSON.stringify(["parcel", "entry", "courtyard"]),
      "selection order",
    );
    assert(
      (await p.locator(".circle-photo-thumb").count()) === 3,
      "three images",
    );
    assert(
      (await p.locator('[data-action="circle-add-photo"]').count()) === 0,
      "no fourth slot",
    );
  });
  await run("取消相册不改变文字、字段和已选图片", async () => {
    await compose();
    await text("TEST 取消相册保留");
    await p.selectOption('[name="region"]', "Pasadena");
    await choose(["entry"]);
    await gallery();
    await p
      .locator('[data-action="circle-gallery-toggle"][data-id="courtyard"]')
      .click();
    await close();
    assert((await images()).length === 1, "pending picks discarded");
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST 取消相册保留",
      "text kept",
    );
    assert(
      (await p.locator('[name="region"]').inputValue()) === "Pasadena",
      "region kept",
    );
  });
  await run("移除中间图片后补选，顺序和其他输入保留", async () => {
    await compose();
    await text();
    await choose(["entry", "courtyard", "parcel"]);
    await p
      .locator('[data-action="circle-remove-photo"][data-id="courtyard"]')
      .click();
    assert(
      JSON.stringify((await images()).map((x) => x.id)) ===
        '["entry","parcel"]',
      "removed only chosen image",
    );
    await choose(["courtyard"]);
    assert(
      JSON.stringify((await images()).map((x) => x.id)) ===
        '["entry","parcel","courtyard"]',
      "reselection appended",
    );
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST 图片配送经验",
      "body kept",
    );
  });
  await run("发布前大图预览与关闭，保留图片和编辑位置", async () => {
    await compose();
    await text();
    await choose(["entry", "courtyard"]);
    await p
      .locator(".circle-editor>.page-scroll")
      .evaluate((n) => (n.scrollTop = 100));
    const before = await p
      .locator(".circle-editor>.page-scroll")
      .evaluate((n) => n.scrollTop);
    await p.locator('[data-action="circle-preview-draft"]').first().click();
    const imageBox = await p.locator(".circle-full-image").boundingBox();
    await p.mouse.move(
      imageBox.x + imageBox.width * 0.8,
      imageBox.y + imageBox.height * 0.5,
    );
    await p.mouse.down();
    await p.mouse.move(
      imageBox.x + imageBox.width * 0.2,
      imageBox.y + imageBox.height * 0.5,
      { steps: 10 },
    );
    await p.mouse.up();
    assert(
      (await p.locator(".circle-viewer-head").innerText()).includes("2 / 2"),
      "swipe advances one",
    );
    assert(
      (await p.locator(".circle-viewer-stage.zoomed").count()) === 0,
      "swipe does not click zoom",
    );
    assert(
      (await p.locator(".circle-viewer-head").innerText()).includes("2 / 2"),
      "draft viewer",
    );
    await close();
    assert((await images()).length === 2, "draft images kept");
    assert(
      Math.abs(
        (await p
          .locator(".circle-editor>.page-scroll")
          .evaluate((n) => n.scrollTop)) - before,
      ) < 3,
      "scroll kept",
    );
  });
  await run("拍照、重拍、取消不丢输入，确认后才添加", async () => {
    await compose();
    await text("TEST camera");
    await p.locator('[data-action="circle-add-photo"]').click();
    await p.locator('[data-action="circle-photo-camera"]').click();
    await p.locator('[data-action="circle-camera-take"]').click();
    await p.locator('[data-action="circle-camera-retake"]').click();
    await close();
    assert((await images()).length === 0, "camera cancel no attachment");
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST camera",
      "text preserved",
    );
    await p.locator('[data-action="circle-add-photo"]').click();
    await p.locator('[data-action="circle-photo-camera"]').click();
    await p.locator('[data-action="circle-camera-take"]').click();
    await p.locator('[data-action="circle-camera-use"]').click();
    assert((await images()).length === 1, "camera confirmation attaches");
  });
  await run("相册及相机不可用可返回或改用另一方式，不误清空", async () => {
    await compose();
    await text();
    await p.selectOption("#circle-photo-state", "gallery-denied");
    await gallery();
    assert(
      (await p.locator("#overlay").innerText()).includes("无法访问相册"),
      "gallery denial",
    );
    await p.locator('[data-action="circle-photo-camera"]').click();
    await p.locator('[data-action="circle-camera-take"]').click();
    await p.locator('[data-action="circle-camera-use"]').click();
    await p.selectOption("#circle-photo-state", "camera-denied");
    await p.locator('[data-action="circle-add-photo"]').click();
    await p.locator('[data-action="circle-photo-camera"]').click();
    assert(
      (await p.locator("#overlay").innerText()).includes("无法使用相机"),
      "camera denial",
    );
    await close();
    assert((await images()).length === 1, "previous image kept");
    assert(
      (await p.locator('[name="text"]').inputValue()) === "TEST 图片配送经验",
      "text kept",
    );
  });
  await run("坏图读取失败保留原图片与正文，可重新选择", async () => {
    await compose();
    await text();
    await choose(["entry"]);
    await p.selectOption("#circle-photo-state", "read-error");
    await choose(["courtyard"]);
    assert((await images()).length === 1, "no broken attachment");
    assert(
      (await p.locator(".circle-error").innerText()).includes("图片无法读取"),
      "read failure",
    );
    await p.selectOption("#circle-photo-state", "normal");
    await choose(["courtyard"]);
    assert((await images()).length === 2, "recovered selection");
  });
  await run("部分上传失败不发布，重试只处理失败图且成功仅一条", async () => {
    await compose();
    await text("TEST partial photo retry");
    await p.selectOption('[name="region"]', "Alhambra");
    await choose(["entry", "courtyard"]);
    await p.locator("#circle-image-fail").check();
    await submit();
    await p.waitForFunction(() => !window.abasongCircle.state.publishing);
    let list = await images();
    assert(
      list[0].upload === "failed" && list[1].upload === "ready",
      "partial states",
    );
    assert(
      await p.evaluate(
        () => !model.posts.some((x) => x.text === "TEST partial photo retry"),
      ),
      "no partial publication",
    );
    assert(
      (await p.locator(".circle-error").innerText()).includes("图片未上传成功"),
      "actionable failure",
    );
    assert(
      (await p.locator('[name="region"]').inputValue()) === "Alhambra",
      "metadata preserved",
    );
    await submit();
    list = await images();
    assert(
      list[0].upload === "uploading" && list[1].upload === "ready",
      "retry skips ready",
    );
    assert(
      await p.locator('.circle-editor-actions [type="submit"]').isDisabled(),
      "duplicate blocked",
    );
    await published();
    assert(
      await p.evaluate(
        () =>
          model.posts.filter((x) => x.text === "TEST partial photo retry")
            .length === 1,
      ),
      "single post",
    );
    assert(
      (await p.locator(".circle-detail .circle-picture").count()) === 2,
      "two published pictures",
    );
  });
  await run("图片上传成功但发帖失败，重试保留并复用全部图片", async () => {
    await compose();
    await text("TEST post failure after upload");
    await choose(["entry", "courtyard"]);
    await p.locator("#circle-post-fail").check();
    await submit();
    await p.waitForFunction(() => !window.abasongCircle.state.publishing);
    assert(
      (await images()).every((x) => x.upload === "ready"),
      "ready images retained",
    );
    assert(
      (await p.locator(".circle-error").innerText()).includes("发布未成功"),
      "post failure distinct",
    );
    await submit();
    await published();
    assert(
      await p.evaluate(
        () =>
          model.posts.filter((x) => x.text === "TEST post failure after upload")
            .length === 1,
      ),
      "single post after retry",
    );
  });
  await run("三图网格顺序、大图切换缩放和关闭保持原位置", async () => {
    await compose();
    await text("TEST three photos");
    await choose(["parcel", "entry", "courtyard"]);
    await submit();
    await published();
    assert(
      (await p.locator(".circle-pictures-3 .circle-picture").count()) === 3,
      "grid",
    );
    await p.locator(".circle-detail .circle-picture").first().click();
    assert(
      (await p.locator(".circle-full-image img").getAttribute("src")).includes(
        "parcel",
      ),
      "first image order",
    );
    await p.locator('[data-action="circle-viewer-next"]').click();
    await p.keyboard.press("ArrowRight");
    assert(
      (await p.locator(".circle-viewer-head").innerText()).includes("3 / 3"),
      "keyboard next",
    );
    await p.locator('[data-action="circle-viewer-prev"]').click();
    await p.locator('[data-action="circle-viewer-zoom"]').click();
    assert(
      (await p.locator(".circle-viewer-stage.zoomed").count()) === 1,
      "zoom",
    );
    await close();
    assert(
      (await p.locator(".circle-detail .circle-text").innerText()) ===
        "TEST three photos",
      "same post after close",
    );
  });
  await run("大图加载失败可重试，不影响帖子正文和图片顺序", async () => {
    await p.selectOption("#circle-photo-state", "view-error");
    await p.locator('[data-post-id="p1"] .circle-picture').click();
    assert(
      (await p.locator(".circle-full-image").count()) === 0,
      "no false loaded image",
    );
    assert(
      (await p.locator(".circle-viewer-error").innerText()).includes(
        "图片暂时无法加载",
      ),
      "view failure",
    );
    await p.locator('[data-action="circle-viewer-retry"]').click();
    assert(
      (await p.locator(".circle-viewer-error").count()) === 1,
      "failure persists until recovered",
    );
    await p.selectOption("#circle-photo-state", "normal");
    await p.locator('[data-action="circle-viewer-retry"]').click();
    assert(
      (await p.locator(".circle-full-image").count()) === 1,
      "retry recovered",
    );
    await close();
    assert(
      (await p.locator('[data-post-id="p1"] .circle-text').count()) === 1,
      "post body preserved",
    );
  });
  await run("动态删除或屏蔽后大图不保留可见内容", async () => {
    await p.locator('[data-post-id="p1"] .circle-picture').click();
    await p.evaluate(() => {
      model.blocks.push("d2");
      render();
    });
    assert(
      (await p.locator(".circle-full-image").count()) === 0,
      "blocked target removed",
    );
    assert(
      (await p.locator(".circle-photo-viewer").innerText()).includes(
        "图片暂不可查看",
      ),
      "unavailable",
    );
  });
  await run(
    "纯图片仍需文字；图片草稿可保留、放弃并在退出登录清除",
    async () => {
      await compose();
      await choose(["entry"]);
      await submit();
      assert(
        (await p.locator(".circle-error").innerText()).includes(
          "请输入动态内容",
        ),
        "body required",
      );
      await back();
      await p.locator('[data-action="circle-keep-draft"]').click();
      await compose();
      assert((await images()).length === 1, "image-only draft retained");
      await back();
      await p.locator('[data-action="circle-discard"]').click();
      await compose();
      assert((await images()).length === 0, "discard releases selection");
      await choose(["entry"]);
      await p.selectOption("#scenario", "guest");
      assert(
        await p.evaluate(() => !state.forms.post),
        "logout clears photo draft",
      );
    },
  );
  await run("上传中离开或重置，不产生迟到动态或残留上传状态", async () => {
    await compose();
    await text("TEST interrupted upload");
    await choose(["entry", "courtyard"]);
    await submit();
    await p.keyboard.press("Escape");
    await p.waitForTimeout(1000);
    assert(
      await p.evaluate(
        () => !model.posts.some((x) => x.text === "TEST interrupted upload"),
      ),
      "no late publication",
    );
    assert(
      await p.evaluate(() => !window.abasongCircle.state.publishing),
      "not stuck",
    );
    await p.evaluate(() => resetPrototype());
    await p.waitForTimeout(400);
    assert(
      await p.evaluate(() => model.posts.length === 3),
      "reset generation isolated",
    );
  });
  await run("320/390/430宽度：选图网格、发布和大图关闭均可见", async () => {
    for (const width of [320, 390, 430]) {
      await p.setViewportSize({ width, height: 844 });
      await compose();
      await text();
      await choose(["entry", "courtyard", "parcel"]);
      assert(
        await p.locator(".circle-editor-actions button").isVisible(),
        "publish visible " + width,
      );
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "no editor overflow " + width,
      );
      await p.locator('[data-action="circle-preview-draft"]').first().click();
      assert(
        await p
          .locator('.circle-viewer-head [data-action="close-modal"]')
          .isVisible(),
        "close visible " + width,
      );
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "viewer no overflow",
      );
      await close();
      await back();
      await p.locator('[data-action="circle-discard"]').click();
    }
    await p.setViewportSize({ width: 1400, height: 980 });
  });
  await run("缩略图损坏仍保留正文和回复，不显示假图片", async () => {
    await p.route("**/assets/circle-entry.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: "not an image",
      }),
    );
    await p.reload();
    await p.waitForSelector('[data-post-id="p1"] .circle-picture span');
    assert(
      (
        await p.locator('[data-post-id="p1"] .circle-picture').innerText()
      ).includes("图片暂不可查看"),
      "thumbnail fallback",
    );
    assert(
      (await p.locator('[data-post-id="p1"] [data-action="post"]').count()) ===
        2,
      "text and reply usable",
    );
    await p.unroute("**/assets/circle-entry.svg");
  });
  const folder =
    "/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence";
  await fresh();
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-images-feed.png" });
  await compose();
  await text("TEST 这边是侧面入口，先核对门牌再进入。");
  await choose(["entry", "courtyard", "parcel"]);
  await p
    .locator(".circle-editor>.page-scroll")
    .evaluate((n) => (n.scrollTop = 0));
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-images-editor.png" });
  await p.locator('[data-action="circle-preview-draft"]').first().click();
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-images-viewer.png" });
  await close();
  await p.locator("#circle-image-fail").check();
  await submit();
  await p.waitForFunction(() => !window.abasongCircle.state.publishing);
  await p
    .locator(".circle-editor>.page-scroll")
    .evaluate((n) => (n.scrollTop = 0));
  await p
    .locator("#device")
    .screenshot({ path: folder + "/circle-images-retry.png" });
  const result = {
    prototype_version: "3.2-circle-images",
    executed_at: new Date().toISOString(),
    scope:
      "isolated synthetic browser photos; TEST SVG fixtures; no device camera, picker, uploads, services or real data",
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
