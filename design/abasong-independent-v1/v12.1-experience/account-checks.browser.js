// TEST synthetic account data only. Clipboard stubbed; no service, Auth phone or real contact.
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
  const assert = (v, s) => {
    if (!v) throw Error(s);
  };
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:8765/") &&
      !r.url().startsWith("data:")
    )
      external.push(new URL(r.url()).hostname);
  });
  const fresh = async () => {
    await p.goto(
      "http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-account&task=me&case=" +
        checks.length,
    );
    await p.waitForFunction(() => window.abasongAccount);
  };
  const run = async (name, fn) => {
    try {
      await fresh();
      await fn();
      checks.push({ name, status: "PASS" });
    } catch (e) {
      checks.push({ name, status: "FAIL", reason: e.message.slice(0, 450) });
    }
  };
  const profile = async () =>
    p.locator('[data-action="edit-profile"]').first().click();
  const team = async () =>
    p.locator('[data-action="organization"]').first().click();
  const back = async () => {
    await p.locator('.page-head [data-action="back"]').click();
    await p.waitForTimeout(70);
  };
  const submit = async () => {
    await p.locator('#app button[type="submit"]').click();
    await p.waitForTimeout(380);
  };
  const close = async () =>
    p.locator('#overlay [data-action="close-modal"]').click();
  const input = async (name, v) => p.locator('[name="' + name + '"]').fill(v);
  const select = async (form, key, value) =>
    p
      .locator(
        `[data-account-form="${form}"][data-account-array="${key}"][value="${value}"]`,
      )
      .check();
  const personalPhone = async () => {
    if (
      !(await p.locator("[data-account-contact-settings]").getAttribute("open"))
    ) {
      if (!(await p.locator('[name="phone"]').isVisible()))
        await p.locator("[data-account-contact-settings] summary").click();
    }
  };
  const openPeer = async () => {
    await p.locator('.bottom-nav [data-id="home"]').click();
    await p.evaluate(() => nav("driver", { id: "d3" }));
  };
  const clipboard = async () =>
    p.evaluate(() => {
      window.testClipboard = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (v) => {
            window.testClipboard.push(v);
          },
        },
      });
    });
  await run(
    "我的顺序、唯一贡献入口与底部设置，无收费/成员/重复消息",
    async () => {
      const text = await p.locator("#app").innerText();
      assert(
        text.indexOf("贡献公寓密码") < text.indexOf("我的公寓") &&
          text.indexOf("我的公寓") < text.indexOf("我的发布"),
        "core priorities",
      );
      assert(
        (await p.locator('[data-action="lib-contribute"]').count()) === 1,
        "one contribution",
      );
      assert(
        (await p
          .locator('.account-scroll [data-action="settings"]')
          .count()) === 1,
        "bottom settings",
      );
      assert(
        (await p
          .locator(
            '.page-head [data-action="settings"],.page-head [data-action="inbox"]',
          )
          .count()) === 0,
        "no duplicate icons",
      );
      assert(
        !/组织来源|会员|订阅|钱包|成员管理|加入团队/.test(text),
        "no old jargon/fees/membership",
      );
    },
  );
  await run("统一登录无司机/DSP二选一，游客不能编辑资料", async () => {
    await p.selectOption("#scenario", "guest");
    await p.locator('.bottom-nav [data-id="me"]').click();
    await p.locator('[data-action="login"]').click();
    assert((await p.locator('[name="phone"]').count()) === 1, "phone login");
    assert(
      (await p
        .locator('[name="role"],[name="accountType"],[name="dsp"]')
        .count()) === 0,
      "unified account",
    );
    assert(
      !/团队名称|车型/.test(await p.locator("#app").innerText()),
      "minimal signup",
    );
  });
  await run("司机资料多选与其他快递保存，回到本人资料保持", async () => {
    await profile();
    await input("name", "TEST 小林");
    await input("otherCarrier", "TEST Carrier");
    await select("accountProfile", "carriers", "UniUni");
    await select("accountProfile", "regions", "Koreatown");
    await submit();
    assert(
      (await p.locator(".account-identity strong").innerText()) === "TEST 小林",
      "saved name",
    );
    await profile();
    assert(
      (await p.locator('[name="otherCarrier"]').inputValue()) ===
        "TEST Carrier",
      "other carrier editable",
    );
    assert(
      await p
        .locator('[data-account-array="carriers"][value="UniUni"]')
        .isChecked(),
      "multicarrier retained",
    );
  });
  await run(
    "只找人的DSP不必填写车型，保存不改变资格且仍可选择接活",
    async () => {
      await profile();
      await p.locator('[name="delivery"]').uncheck();
      await input("name", "TEST DSP");
      await submit();
      assert(
        (await p.locator(".account-availability").count()) === 0,
        "no irrelevant card",
      );
      assert(
        (await p.locator('[data-action="organization"]').count()) === 1,
        "team remains",
      );
      assert(
        await p.evaluate(() => state.qualified === true),
        "capability unchanged",
      );
      await profile();
      await p.locator('[name="delivery"]').check();
      assert(
        (await p.locator('[name="vehicle"]').count()) === 1,
        "can opt into delivery",
      );
    },
  );
  await run("资料保存失败保留全部字段并重试，未伪造保存成功", async () => {
    await profile();
    await input("name", "TEST profile retry");
    await select("accountProfile", "carriers", "SpeedX");
    await personalPhone();
    await input("phone", "+1 202-555-0108");
    await p.locator("#account-save-fail").check();
    await submit();
    assert(
      (await p.locator(".form-error").innerText()).includes("保存未成功"),
      "error",
    );
    assert(
      (await p.locator('[name="name"]').inputValue()) === "TEST profile retry",
      "retained input",
    );
    assert(
      await p.evaluate(() => model.profile.name === "小林"),
      "no false save",
    );
    await submit();
    assert(
      (await p.locator(".account-identity strong").innerText()) ===
        "TEST profile retry",
      "retry",
    );
  });
  await run("未修改直接返回；修改后继续/保留/放弃各自明确", async () => {
    await profile();
    await back();
    assert(
      (await p.locator('#overlay [role="dialog"]').count()) === 0,
      "no unnecessary confirm",
    );
    await profile();
    await input("name", "TEST draft");
    await back();
    await close();
    assert(
      (await p.locator('[name="name"]').inputValue()) === "TEST draft",
      "continue editing",
    );
    await back();
    await p.locator('[data-action="account-keep"]').click();
    await profile();
    assert(
      (await p.locator('[name="name"]').inputValue()) === "TEST draft",
      "kept session draft",
    );
    await back();
    await p.locator('[data-action="account-discard"]').click();
    await profile();
    assert(
      (await p.locator('[name="name"]').inputValue()) === "小林",
      "discard",
    );
  });
  await run("个人电话/微信只在本人资料和自愿复制处，不自动发消息", async () => {
    await profile();
    await personalPhone();
    assert(
      (await p.locator('[name="phone"]').inputValue()) === "",
      "no Auth phone prefill",
    );
    await input("phone", "+1 202-555-0108");
    await input("wechat", "abasong_test_self");
    await submit();
    await p.locator('[data-action="contacts"]').click();
    await p.locator('[data-action="contact"]').click();
    await p.locator('[data-action="chat-more"]').click();
    await p.locator('[data-action="account-my-contact"]').click();
    await clipboard();
    const n = await p.evaluate(() => model.chats[0].messages.length);
    await p.locator('[data-action="account-copy"][data-id="wechat"]').click();
    assert(
      await p.evaluate(() => window.testClipboard.length === 1),
      "explicit copy",
    );
    assert(
      (await p.evaluate(() => model.chats[0].messages.length)) === n,
      "not autosent",
    );
    await close();
    await p.evaluate(() => nav("driver", { id: "me" }));
    assert(
      !(await p.locator("#app").innerText()).includes("abasong_test_self"),
      "private phone absent in public profile",
    );
  });
  await run(
    "DSP团队可编辑多快递/多区域，数据自填不提供核验/成员/收费开关",
    async () => {
      await team();
      await input("name", "TEST 灵活配送");
      await select("accountTeam", "carriers", "UniUni");
      await select("accountTeam", "regions", "Pasadena");
      assert(
        !/线路编号|每件报价|成员|订阅|已认证/.test(
          await p.locator("#app").innerText(),
        ),
        "team scope",
      );
      await submit();
      await team();
      assert(
        (await p.locator('[name="name"]').inputValue()) === "TEST 灵活配送",
        "team updated",
      );
      assert(
        await p
          .locator('[data-account-array="carriers"][value="UniUni"]')
          .isChecked(),
        "multiple carriers",
      );
    },
  );
  await run("业务联系方式默认关闭，填写但未开放时需求不显示", async () => {
    await team();
    assert(
      !(await p.locator('[name="publicContact"]').isChecked()),
      "closed by default",
    );
    await input("phone", "+1 202-555-0108");
    await input("wechat", "abasong_test_team");
    await submit();
    await p.evaluate(() => nav("job", { id: "j3" }));
    assert(
      (await p.locator('[data-action="account-view-contact"]').count()) === 0,
      "not returned in detail",
    );
    assert(
      !(await p.locator("#app").innerText()).includes("abasong_test_team"),
      "not raw text",
    );
  });
  await run("本人主动开放后资料/需求可查看，关闭后停止展示", async () => {
    await team();
    await input("wechat", "abasong_test_team");
    await p.locator('[name="publicContact"]').check();
    await submit();
    await p.evaluate(() => nav("job", { id: "j3" }));
    await p.locator('[data-action="account-view-contact"]').click();
    assert(
      (await p.locator("#overlay").innerText()).includes("abasong_test_team"),
      "opt-in shown",
    );
    await close();
    await p.evaluate(() => nav("me", {}, true));
    await team();
    await p.locator('[name="publicContact"]').uncheck();
    await submit();
    await p.evaluate(() => nav("job", { id: "j3" }));
    assert(
      (await p.locator('[data-action="account-view-contact"]').count()) === 0,
      "revoked display",
    );
  });
  await run("公开业务电话仍不进入地图、列表、通知或公开分享摘要", async () => {
    await team();
    await input("wechat", "abasong_test_team");
    await p.locator('[name="publicContact"]').check();
    await submit();
    await p.locator('.bottom-nav [data-id="home"]').click();
    assert(
      !(await p.locator("#app").innerText()).includes("abasong_test_team"),
      "no map disclosure",
    );
    await p.evaluate(() => {
      const j = getJob("j3");
      model.shares.push({
        token: "TEST-ACCOUNT-SHARE",
        job: j.id,
        revoked: false,
      });
      nav("public", { id: j.id, token: "TEST-ACCOUNT-SHARE" });
    });
    assert(
      !(await p.locator("#app").innerText()).includes("abasong_test_team"),
      "no H5 contact",
    );
  });
  await run("开放无联系方式、坏号码与空名称均须修正", async () => {
    await team();
    await p.locator('[name="publicContact"]').check();
    await submit();
    assert(
      (await p.locator(".form-error").innerText()).includes("至少一种"),
      "no empty public flag",
    );
    await input("phone", "bad");
    await submit();
    assert(
      (await p.locator("#app").innerText()).includes("请核对联系电话"),
      "phone validation",
    );
    await input("phone", "");
    await p.locator('[name="publicContact"]').uncheck();
    await input("name", "");
    await submit();
    assert(
      (await p.locator("#app").innerText()).includes("请输入团队名称"),
      "name validation",
    );
  });
  await run("团队保存失败保留展示开关及输入，不更改已保存团队", async () => {
    await team();
    await input("name", "TEST team retry");
    await input("wechat", "abasong_test_team");
    await p.locator('[name="publicContact"]').check();
    await p.locator("#account-save-fail").check();
    await submit();
    assert(
      await p.locator('[name="publicContact"]').isChecked(),
      "intent retained",
    );
    assert(
      await p.evaluate(() => model.organization === "西岸配送团队"),
      "old team retained",
    );
    await submit();
    assert(
      await p.evaluate(() => model.organization === "TEST team retry"),
      "saved on retry",
    );
  });
  await run(
    "已有团队改名不覆盖历史需求发布来源，已发布需求身份锁定",
    async () => {
      await team();
      await input("name", "TEST New Name");
      await submit();
      assert(
        await p.evaluate(() => getJob("j3").org === "西岸配送团队"),
        "history preserved",
      );
      const result = await p.evaluate(() => {
        const old = getJob("j3");
        const next = jobFromForm({ ...draftFromJob(old), asOrg: true }, old);
        return next.org === old.org;
      });
      assert(result, "edit builder preserves source");
      await p.evaluate(() => {
        state.editing = "j3";
        state.forms.request = draftFromJob(getJob("j3"));
        nav("requestForm");
      });
      assert(
        (await p.locator('[data-action="account-publisher"]').count()) === 0,
        "no source switch on published job",
      );
    },
  );
  await run(
    "普通司机可个人发需求；首次添加团队后回原表单并保留条件",
    async () => {
      await p.evaluate(() => {
        window.abasongAccount.state.team = null;
        window.abasongAccount.state.teamIntent = false;
        model.organization = "";
        state.forms.request = defaultDraft("partial_route");
        state.forms.request.route = "TEST preserved route";
        nav("requestForm");
      });
      assert(
        (await p
          .locator('[data-action="account-publisher"][data-id="personal"]')
          .getAttribute("aria-pressed")) === "true",
        "personal default",
      );
      await p.locator('[data-action="account-create-team"]').click();
      await input("name", "TEST New Team");
      await submit();
      assert(
        (await p.locator('[name="route"]').inputValue()) ===
          "TEST preserved route",
        "form retained",
      );
      assert(
        await p.evaluate(() => state.forms.request.asOrg),
        "explicit create intent selected",
      );
    },
  );
  await run("常联系备注保存失败保留，重试只改本人备注", async () => {
    await p.locator('[data-action="contacts"]').click();
    await p.locator('[data-action="edit-note"]').click();
    await p.locator('[name="note"]').fill("TEST 私人备注");
    await p.locator("#account-save-fail").check();
    await p.locator('#overlay [type="submit"]').click();
    await p.waitForTimeout(320);
    assert(
      (await p.locator('[name="note"]').inputValue()) === "TEST 私人备注",
      "kept note",
    );
    assert(
      await p.evaluate(() => model.contacts[0].note !== "TEST 私人备注"),
      "no fake success",
    );
    await p.locator('#overlay [type="submit"]').click();
    await p.waitForTimeout(320);
    assert(
      (await p.locator(".account-private-note").innerText()) ===
        "TEST 私人备注",
      "private note saved",
    );
  });
  await run("移出常联系有确认且不删除会话，也不要求互加好友", async () => {
    await p.locator('[data-action="contacts"]').click();
    const n = await p.evaluate(() => model.chats.length);
    await p.locator('[data-action="remove-contact"]').click();
    await p.locator('[data-action="confirm-modal"]').click();
    assert(
      (await p.locator("#app").innerText()).includes("还没有常联系"),
      "removed",
    );
    assert(
      (await p.evaluate(() => model.chats.length)) === n,
      "history retained",
    );
  });
  await run("列表空/失败分开，重新加载恢复原联系人", async () => {
    await p.locator('[data-action="contacts"]').click();
    await p.locator("#account-contacts-error").check();
    assert(
      (await p.locator("#app").innerText()).includes("常联系暂时无法加载"),
      "failure not empty",
    );
    await p.locator('[data-action="account-contacts-retry"]').click();
    assert(
      (await p.locator('[data-contact-id="d1"]').count()) === 1,
      "same contact recovered",
    );
  });
  await run("已屏蔽联系人保留本人备注，不能新联系或由保存解锁", async () => {
    await p.evaluate(() => {
      model.blocks.push("d1");
      nav("contacts");
    });
    assert(
      (await p.locator("#app").innerText()).includes("已屏蔽"),
      "blocked marker",
    );
    assert(
      await p
        .locator('[data-contact-id="d1"] [data-action="contact"]')
        .isDisabled(),
      "contact disabled",
    );
    assert(
      (await p.locator(".account-private-note").count()) === 1,
      "private note retained",
    );
  });
  await run("对方关闭展示或注销，大图层式联系方式不残留旧号码", async () => {
    await openPeer();
    await p.locator("#account-peer-state").selectOption("open");
    await p.locator('[data-action="account-view-contact"]').click();
    await p.locator("#account-peer-state").selectOption("private");
    assert(
      !(await p.locator("#overlay").innerText()).includes("abasong_test_dsp"),
      "no stale contact",
    );
    assert(
      (await p.locator('[data-action="account-copy"]').count()) === 0,
      "copy not available",
    );
    await close();
    await p.locator("#account-peer-state").selectOption("deleted");
    assert(
      (await p.locator("#app").innerText()).includes("账号已注销"),
      "deleted target",
    );
  });
  await run("复制失败保留可手动选择的联系文字，不假装已复制", async () => {
    await openPeer();
    await p.locator("#account-peer-state").selectOption("open");
    await p.locator('[data-action="account-view-contact"]').click();
    await p.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error("TEST denied");
          },
        },
      }),
    );
    await p.locator('[data-action="account-copy"]').first().click();
    await p.waitForSelector("#overlay .form-error");
    assert(
      (await p.locator("#overlay .form-error").innerText()).includes(
        "复制未成功",
      ),
      "copy failure",
    );
    assert(
      (await p.locator(".account-contact-value>b").count()) === 2,
      "values retained for manual copy",
    );
  });
  await run("关闭接活用途须确认关闭已有声明，取消不改已保存状态", async () => {
    await p.evaluate(() => {
      model.availability.enabled = true;
      render();
    });
    await profile();
    await p.locator('[name="delivery"]').uncheck();
    await p.locator('#app [type="submit"]').click();
    await close();
    assert(
      await p.evaluate(() => model.availability.enabled),
      "cancel retained declaration",
    );
    await p.locator('#app [type="submit"]').click();
    await p.locator('[data-action="confirm-modal"]').click();
    await p.waitForTimeout(380);
    assert(
      await p.evaluate(
        () =>
          !model.availability.enabled && !window.abasongAccount.state.delivery,
      ),
      "explicit close",
    );
    await p.evaluate(() => {
      model.availability = {
        ...model.availability,
        enabled: true,
        date: "2026-11-03",
        endDate: "2026-11-03",
        end: "17:00",
      };
      render();
    });
    assert(
      (await p.locator('[data-action="availability"]').count()) === 0,
      "expired declaration does not keep DSP-only menu visible",
    );
  });
  await run("账号退出丢弃未保存资料，迟到保存不覆盖其他界面", async () => {
    await profile();
    await input("name", "TEST late save");
    await p.locator('#app [type="submit"]').click();
    await p.selectOption("#scenario", "guest");
    await p.waitForTimeout(400);
    assert(
      await p.evaluate(() => model.profile.name === "小林"),
      "no late mutation",
    );
    assert(
      await p.evaluate(
        () => !state.forms.accountProfile && !state.forms.accountTeam,
      ),
      "drafts cleared",
    );
  });
  await run("320/390/430布局，个人/团队的保存和输入始终可达", async () => {
    for (const width of [320, 390, 430]) {
      await p.setViewportSize({ width, height: 844 });
      await profile();
      assert(
        await p.locator('#app [type="submit"]').isVisible(),
        "profile save visible",
      );
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "profile no overflow",
      );
      await back();
      await team();
      assert(
        await p.locator('#app [type="submit"]').isVisible(),
        "team save visible",
      );
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "team no overflow",
      );
      await back();
    }
    await p.setViewportSize({ width: 1400, height: 980 });
  });
  const folder =
    "/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence";
  await fresh();
  await p.locator("#device").screenshot({ path: folder + "/account-my.png" });
  await profile();
  await p.locator(".page-scroll").evaluate((n) => (n.scrollTop = 0));
  await p
    .locator("#device")
    .screenshot({ path: folder + "/account-profile.png" });
  await back();
  await team();
  await p.locator(".page-scroll").evaluate((n) => (n.scrollTop = 0));
  await p.locator("#device").screenshot({ path: folder + "/account-team.png" });
  await back();
  await p.locator('[data-action="contacts"]').click();
  await p
    .locator("#device")
    .screenshot({ path: folder + "/account-contacts.png" });
  await fresh();
  await openPeer();
  await p.locator("#account-peer-state").selectOption("open");
  await p.locator('[data-action="account-view-contact"]').click();
  await p
    .locator("#device")
    .screenshot({ path: folder + "/account-business-contact.png" });
  const result = {
    prototype_version: "3.2-account",
    executed_at: new Date().toISOString(),
    scope:
      "isolated synthetic UI; TEST fixtures only; no Auth phone, services, roles, subscriptions or real contact; clipboard stubbed",
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
