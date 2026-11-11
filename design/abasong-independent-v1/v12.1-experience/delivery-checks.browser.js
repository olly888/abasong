// TEST-only browser acceptance for the approved two-scenario prototype; no real service calls.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1400, height: 980 } });
  const p = await context.newPage(), checks = [], errors = [], external = [];
  p.setDefaultTimeout(5000);
  p.on("pageerror", e => errors.push(e.message));
  p.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:8765/") && !r.url().startsWith("data:")) external.push(new URL(r.url()).hostname); });
  const assert = (v, message) => { if (!v) throw Error(message); };
  const action = a => p.locator(`#app [data-action="${a}"]`);
  const save = () => p.locator("#app .fixed-actions [type=submit]").click();
  const fresh = async () => { await p.setViewportSize({ width: 1400, height: 980 }); await p.goto(`http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-delivery&task=delivery&case=${checks.length}`); await p.waitForFunction(() => window.abasongDelivery); };
  const run = async (name, f) => { try { await fresh(); await f(); checks.push({ name, status: "PASS" }); } catch (e) { checks.push({ name, status: "FAIL", reason: e.message.slice(0,700) }); } };
  const open = s => p.locator(`[data-action=delivery-scene][data-id=${s}]`).click();
  const more = async () => { if (!(await p.locator(".delivery-options").getAttribute("open"))) { if (!(await p.locator(".delivery-options").evaluate(n => n.open))) await p.locator(".delivery-options > summary").click(); } };
  const fill = async (s = "warehouse", mode = "estimate") => {
    await open(s); await p.selectOption('[name=region]', 'Pasadena'); await p.selectOption('[name=carrier]', 'SwiftX');
    if (s === 'warehouse') { await p.locator('[name=pickupAddress]').fill('5685'); await action('ex-pickup-choice').first().click(); await p.locator('[name=start]').fill('15:00'); }
    else await p.selectOption('[name=pickup]', 'West Covina');
    await p.locator(`[name=quantityMode][value=${mode}]`).check();
    if (mode !== 'unknown') await p.locator('[name=qty]').fill('120');
    if (s === 'warehouse') await p.locator('[name=drivers]').fill('2');
    await p.locator('[name=price]').fill('1.85');
  };
  const publish = async () => { await save(); await p.locator('#overlay [data-action=commit-request]').click(); return p.evaluate(() => model.jobs[0].id); };
  await run('入口仅两个场景，取消回到原首页；P1专用求助不伪装可发布', async () => {
    assert((await action('delivery-scene').allTextContents()).join('|').includes('仓库缺人，找司机') && await action('delivery-scene').count() === 2, 'two scenarios');
    assert(await action('publish-kind').count() === 0 && await p.locator('#inspect-page option[value=helpForm]').count() === 0, 'no third/legacy picker');
    await action('back').click(); assert((await p.locator('#screen-id').innerText()) === 'H01', 'home');
  });
  await run('仓库场景默认仓库/约数/1人，身份不自动切为DSP', async () => {
    await open('warehouse'); assert(await p.evaluate(() => state.forms.request.pickupKind === 'warehouse' && state.forms.request.quantityMode === 'estimate' && !state.forms.request.asOrg), 'warehouse defaults');
    assert(await p.locator('[name=drivers]').inputValue() === '1', 'one requested by default'); assert(await p.locator('[name=pickup]').count() === 0, 'no duplicate pickup region');
  });
  await run('代送场景默认途中交接/尽快，不索要或公开当前位置', async () => {
    await open('rescue'); assert(await p.evaluate(() => state.forms.request.asap && state.forms.request.pickupKind === 'contact_handoff'), 'rescue defaults');
    assert(await p.locator('[name=pickupAddress]').count() === 0 && await p.locator('[name=drivers]').count() === 0, 'conditional fields');
    assert((await p.locator('#app').innerText()).includes('具体交接地点联系确认'), 'private handoff');
  });
  await run('主表单收敛；线路/理货/最低量/自定义下架仅补充设置，草稿可达', async () => {
    await open('warehouse'); assert(!(await p.locator('.delivery-options').evaluate(n => n.open)), 'advanced closed');
    for (const name of ['route','sorted','min','terms']) assert(!(await p.locator(`[name=${name}]`).isVisible()), name + ' not mandatory foreground');
    assert(await p.locator('[name=end]').count() === 0 && await action('save-draft').isVisible(), 'expiry derived, draft retained');
  });
  await run('必填缺失有定位错误，不发布、不清输入', async () => {
    await open('warehouse'); await p.locator('[name=price]').fill('1.85'); const n = await p.evaluate(() => model.jobs.length); await save();
    assert((await p.locator('.field-error').allTextContents()).includes('请填写完整取件地址'), 'address error');
    assert(await p.locator('[name=price]').inputValue() === '1.85' && await p.evaluate(() => model.jobs.length) === n, 'no write/data loss');
  });
  await run('公寓及找活迟到响应不重建发布表单，地址候选和焦点保持', async () => {
    await open('warehouse');await p.evaluate(()=>abasongExperience.setApt(state.apt));await p.locator('[name=pickupAddress]').fill('5685');await p.waitForTimeout(160);assert(await action('ex-pickup-choice').first().isVisible(),'candidate survives');assert(await p.locator('[name=pickupAddress]').evaluate(n=>n===document.activeElement),'focus survives');await action('ex-pickup-choice').first().click();assert((await p.locator('[name=pickupAddress]').inputValue()).includes('5685 Alcoa'),'selection works');await p.evaluate(()=>{state.homeView='jobs';nav('publish',{},true);document.querySelector('#support-scenario').value='slow';abasongExperience.querySupport('jobs');});await open('warehouse');await p.locator('[name=pickupAddress]').fill('5685');await p.waitForTimeout(2100);assert(await action('ex-pickup-choice').first().isVisible(),'slow jobs response preserves candidates');assert(await p.locator('[name=pickupAddress]').evaluate(n=>n===document.activeElement),'slow jobs response preserves focus');
  });
  await run('仓库候选后修改为手填地址，清旧关联/自动名称，以新城市展示', async () => {
    await fill(); await p.locator('[name=pickupAddress]').fill('100 TEST Street, Ontario, CA 91761');
    assert(await p.evaluate(() => !state.forms.request.pickupFixture && !state.forms.request.pickup && !state.forms.request.pickupName), 'derived fields cleared');
    await save(); assert((await p.locator('.ex-preview-address').innerText()).includes('100 TEST Street, Ontario'), 'new address preview');
    await p.locator('#overlay [data-action=commit-request]').click(); assert(await p.evaluate(() => model.jobs[0].pickup) === 'Ontario', 'explicit address city');
  });
  await run('仓库切途中清旧地址，交接区重新确认；其他输入保留', async () => {
    await fill(); await action('ex-pickup-kind').filter({ hasText: '途中交接' }).click();
    assert(await p.evaluate(() => !state.forms.request.pickupAddress && !state.forms.request.pickupFixture && !state.forms.request.pickup), 'no stale location');
    assert(await p.locator('[name=price]').inputValue() === '1.85', 'price retained');
  });
  await run('仓库约数发布：预览/管理/地图一致，不假算每人分配；重复确认不重复', async () => {
    await fill(); await save(); assert((await p.locator('#overlay').innerText()).includes('约 120 件 · 需2人'), 'clear total and people');
    const n = await p.evaluate(() => model.jobs.length); await p.locator('#overlay [data-action=commit-request]').click();
    await p.evaluate(() => actions('commit-request')); assert(await p.evaluate(() => model.jobs.length) === n + 1, 'idempotent confirmation');
    assert((await p.locator('#app').innerText()).includes('约 120 件 / 2人'), 'manage approximate');
    await p.evaluate(() => { state.homeView='jobs';nav('home',{},true); }); assert((await p.locator('.ex-job-card').allTextContents()).some(t => t.includes('约 120 件')), 'card approximate');
  });
  await run('途中代送：尽快/明确件数/交接区可发布，送完与下架分开', async () => {
    await fill('rescue','exact'); await p.selectOption('[name=completion]','same_day'); await save();
    const body = await p.locator('#overlay').innerText(); assert(body.includes('尽快接手') && body.includes('当天送完') && body.includes('11:59 PM'), 'three time meanings');
    await p.locator('#overlay [data-action=commit-request]').click(); assert(await p.evaluate(() => model.jobs[0].pickupLocation.kind) === 'contact_handoff', 'no warehouse point');
  });
  await run('待确认件数：预览/管理/详情/动态/公开摘要不显示0或null件', async () => {
    await fill('warehouse','unknown'); const id = await publish();
    assert(await p.evaluate(() => model.jobs[0].qty === null && model.jobs[0].remaining === null), 'unknown remains null');
    for (const view of ['manage','job','share']) { await p.evaluate(({view,id}) => nav(view,{id},true), {view,id}); const t = await p.locator('#app').innerText(); assert(t.includes('件数待确认') && !/null\s*件|0\s*件/.test(t), view+' honest unknown'); }
    await p.evaluate(id=>{model.posts[0].job=id;nav('circle',{},true);},id);const sourceText=await p.locator('.circle-source[data-request-id="'+id+'"]').first().innerText();assert(sourceText.includes('件数待确认')&&!sourceText.includes('null'),'circle reference honest');
    const summary = await p.evaluate(() => publicSummary(model.jobs[0])); assert(summary.quantityMode === 'unknown' && !('pickupLocation' in summary), 'public summary safe');
    await p.evaluate(id => { const token=uid();model.shares.push({token,job:id,revoked:false});nav('public',{id,token},true); },id);
    assert(!/null\s*件|0\s*件/.test(await p.locator('#app').innerText()), 'public presentation');
  });
  await run('待确认件数仍能报名；不强填假件数，不自动扣减人数或任务量', async () => {
    await fill('warehouse','unknown'); const id = await publish(); await p.evaluate(id => { const j=getJob(id);j.owner='d1';j.publisher='TEST peer';actions('apply',{dataset:{id}}); }, id);
    await p.locator('[name=arrival]').fill('15:30'); await p.locator('#overlay [type=submit],.support-panel [type=submit]').first().click();
    assert(await p.evaluate(() => model.applications.at(-1).capacity === null && model.jobs[0].remaining === null && model.jobs[0].remainingDrivers === 2), 'no implied allocation');
  });
  await run('约数报名不作为剩余上限；意向不是已接单', async () => {
    await fill(); const id=await publish(); await p.evaluate(id => { getJob(id).owner='d1';actions('apply',{dataset:{id}}); },id);
    await p.locator('[name=capacity]').fill('150'); await p.locator('.support-panel [type=submit]').click();
    assert(await p.evaluate(() => model.applications.at(-1).status === 'applied' && model.jobs[0].remaining === 120), 'capacity declaration, no reservation');
  });
  await run('整线范围在表单内，件数不确定时阻止假整批承诺', async () => {
    await fill('rescue','unknown'); await more(); await p.selectOption('[name=taskScope]','whole'); await save();
    assert((await p.locator('[role=alert]').allTextContents()).some(t=>t.includes('整线接手请确认件数')), 'visible corrective error');
    assert(await p.getByRole('dialog',{name:'核对配送需求'}).count()===0, 'no unsafe preview');
  });
  await run('明天快捷关闭尽快，日期变化重新计算默认下架', async () => {
    await fill('rescue','exact'); await p.locator('[data-action=delivery-date][data-id="2026-11-05"]').click(); await p.locator('[name=start]').fill('07:00'); await save();
    const t=await p.locator('#overlay').innerText(); assert(t.includes('明天 7:00 AM') && t.includes('2026-11-05 11:59 PM') && !t.includes('尽快接手'), 'future explicit');
  });
  await run('最迟接手生成默认下架；非法自定义下架/过去时间明确报错', async () => {
    await fill(); await more(); await p.locator('[name=pickupEnd]').fill('16:00'); await save(); assert((await p.locator('#overlay').innerText()).includes('4:00 PM'), 'latest pickup'); await p.locator('#overlay [data-action=close-modal]').last().click();
    await p.locator('[name=customExpiry]').check(); await p.locator('[name=end]').fill('14:00'); await save();
    assert((await p.locator('.field-error').allTextContents()).some(t=>t.includes('下架时间')), 'invalid expiry visible');await p.locator('[name=start]').fill('13:00');await save();assert((await p.locator('.field-error').allTextContents()).some(t=>t.includes('尚未过去')), 'past start');
  });
  await run('硬性账号/经验条件在核对及详情可见；付款仍私下约定', async () => {
    await fill(); await p.selectOption('[name=handoff]','carrier_account'); await more(); await p.selectOption('[name=experience]','carrier_experience'); await p.locator('[name=terms]').fill('TEST 当天私下结算'); await save();
    assert((await p.locator('#overlay').innerText()).includes('熟悉该快递公司') && (await p.locator('#overlay').innerText()).includes('需已有该快递公司账号'), 'conditions preview');
    await p.locator('#overlay [data-action=commit-request]').click(); await p.evaluate(()=>nav('job',{id:model.jobs[0].id})); assert((await p.locator('#app').innerText()).includes('TEST 当天私下结算'), 'private terms display');
  });
  await run('模拟保存失败保留场景/地址/金额，原页重试只发布一次', async () => {
    await fill(); const count=await p.evaluate(()=>model.jobs.length); await save(); await p.locator('#delivery-save-fail').check(); await p.locator('#overlay [data-action=commit-request]').click();
    assert((await p.locator('.form-error').innerText()).includes('填写内容已保留') && await p.locator('[name=price]').inputValue()==='1.85', 'failure retained');
    assert(await p.evaluate(()=>model.jobs.length)===count,'no failed write');await save();await p.locator('#overlay [data-action=commit-request]').click();assert(await p.evaluate(()=>model.jobs.length)===count+1,'retry one write');
  });
  await run('已发布版本冲突阻止覆盖，已有发布身份锁定', async () => {
    await fill(); const id=await publish(); await p.evaluate(id=>actions('edit-job',{dataset:{id}}),id); await p.locator('[name=price]').fill('1.95'); await save(); await p.evaluate(id=>getJob(id).version++,id); await p.locator('#overlay [data-action=commit-request]').click();
    assert((await p.locator('.form-error').innerText()).includes('条件已变化') && await p.evaluate(id=>getJob(id).price,id)===185,'version preserved');
    assert(await action('account-publisher').count()===0,'published identity locked');
  });
  await run('本人明确团队身份可沿用；新需求预填不替换历史来源', async () => {
    await fill(); await p.locator('.delivery-identity > summary').click(); await p.locator('[data-action=account-publisher][data-id=team]').click(); const id=await publish();
    assert(await p.evaluate(id=>getJob(id).org,id)==='西岸配送团队','explicit team'); await p.evaluate(()=>nav('publish'));await open('warehouse');assert(await p.evaluate(()=>state.forms.request.asOrg),'last explicit choice');
  });
  await run('保存草稿/复制草稿保留场景与未知口径；未完整草稿不公开', async () => {
    await open('warehouse'); await p.locator('[name=quantityMode][value=unknown]').check(); await action('save-draft').click();
    assert(await p.evaluate(()=>model.jobs[0].status==='draft'&&model.jobs[0].quantityMode==='unknown'),'draft not published');await action('edit-job').click();assert(await p.locator('[name=quantityMode][value=unknown]').isChecked(),'draft restored');const id=await p.evaluate(()=>model.jobs[0].id);await p.evaluate(id=>actions('clone-job',{dataset:{id}}),id);assert(await p.evaluate(()=>state.forms.request.scene==='warehouse'&&state.forms.request.quantityMode==='unknown'&&state.forms.request.expiryMode==='auto'),'clone preserves meaning');
  });
  await run('取消核对保持输入，离开编辑有确认；公寓列表仍P1未显示', async () => {
    await fill();await save();await p.locator('#overlay [data-action=close-modal]').last().click();assert(await p.locator('[name=qty]').inputValue()==='120','preview cancel');await action('back').click();assert(await p.getByRole('dialog').isVisible(),'leave confirm');
    await p.locator('#overlay [data-action=close-modal]').last().click();await p.evaluate(()=>{state.homeView='apartments';nav('home',{},true);});assert(await action('map-list').count()===0,'no P1 list');
  });
  await run('公寓城市左/距离右，明确门别旁置，贡献人/符号保留，仍192等高', async () => {
    await p.evaluate(()=>nav('home',{},true));await p.waitForFunction(()=>abasongExperience.state.code.status==='ready');const c=p.locator('.ex-apartment-card:not([inert])'),city=await c.locator('.ex-card-city').boundingBox(),distance=await c.locator('.ex-distance').boundingBox();
    assert(distance.x>city.x+city.width && (await c.locator('.ex-code').innerText())==='*0128#','anchors/code');assert((await c.locator('.delivery-door').innerText())==='行人门'&&(await c.locator('.ex-code-meta').innerText()).includes('阿杰'),'scope and author');assert(Math.abs((await c.boundingBox()).height-192)<1,'compact');
  });
  await run('无明确门别不猜填；切卡、空/错误/资格状态无串码或假暂无', async () => {
    await p.evaluate(()=>{delete getApt().codes[0].scope;nav('home',{},true);});await p.waitForFunction(()=>abasongExperience.state.code.status==='ready');assert(await p.locator('.ex-apartment-card:not([inert]) .delivery-door').count()===0,'no invented door');
    for(const [v,label] of [['empty','暂无共享门禁码'],['offline','门禁码暂时无法加载'],['unqualified','暂未开通资料查看资格']]){await p.selectOption('#scenario',v);if(v==='offline')await p.waitForFunction(()=>abasongExperience.state.code.status==='error');if(v==='empty')await p.waitForFunction(()=>abasongExperience.state.code.status==='ready');const c=p.locator('.ex-apartment-card:not([inert])');assert((await c.innerText()).includes(label)&&await c.locator('.delivery-door,.ex-code').count()===0,'separate '+v);}
  });
  await run('320/390/430：两场景表单/核对/固定操作无横溢出，长门别不挤完整密码', async () => {
    for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await p.evaluate(()=>nav('publish',{},true));await fill('rescue','exact');await save();assert(await p.getByRole('dialog',{name:'核对配送需求'}).isVisible(),'preview reachable');await p.locator('#overlay [data-action=close-modal]').last().click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'form no overflow');
      await p.evaluate(()=>{getApt().codes[0].scope='TEST 长门别入口标记';state.homeView='apartments';nav('home',{},true);});await p.waitForFunction(()=>abasongExperience.state.code.status==='ready');const c=p.locator('.ex-apartment-card:not([inert])');assert((await c.locator('.ex-code').innerText())==='*0128#','code intact');assert(await c.evaluate(n=>n.scrollWidth<=n.clientWidth),'card no overflow');}
  });
  const folder='/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence';await fresh();await p.locator('#device').screenshot({path:folder+'/delivery-picker.png'});await fill();await p.locator('#device').screenshot({path:folder+'/delivery-warehouse.png'});await save();await p.locator('#device').screenshot({path:folder+'/delivery-preview.png'});await fresh();await open('rescue');await p.locator('#device').screenshot({path:folder+'/delivery-rescue.png'});await p.evaluate(()=>nav('home',{},true));await p.waitForFunction(()=>abasongExperience.state.code.status==='ready');await p.locator('#device').screenshot({path:folder+'/delivery-apartment.png'});
  const result={prototype_version:'3.2-r3-delivery',executed_at:new Date().toISOString(),scope:'isolated synthetic browser UI; no live publishing, API, GPS, SMS or settlement',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,console_errors:errors,external_request_hosts:[...new Set(external)],human_participants:0,native_acceptance:false};await context.close();return result;
}
