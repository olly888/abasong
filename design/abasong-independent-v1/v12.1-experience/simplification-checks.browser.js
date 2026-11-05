// Isolated TEST browser fixtures only; no Auth/Mapbox/GPS/SMS/contact services.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1400,height:980}}),p=await context.newPage(),checks=[],errors=[],external=[];
  p.setDefaultTimeout(5000);
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/')&&!r.url().startsWith('data:'))external.push(new URL(r.url()).hostname);});
  const assert=(v,s)=>{if(!v)throw Error(s);};
  const fresh=async()=>{await p.goto('http://127.0.0.1:8765/v12.1-experience/index.html?v=r3-simple&task=me&case='+checks.length);await p.waitForFunction(()=>window.abasongAccount);};
  const run=async(name,f)=>{try{await fresh();await f();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,600)});}};
  const sw=()=>p.getByRole('switch',{name:'接活状态',exact:true});
  const manual=async()=>{await p.locator('[data-action="lib-contribute"]').click();await p.locator('[data-action="lib-contribute-manual"]').click();};
  const choose=async(q)=>{await p.locator('#code-address-query').fill(q);await p.locator('[data-action="code-address-choice"]').first().click();};
  const save=async()=>p.locator('#app .fixed-actions [type=submit]').click();
  const leave=async()=>{await p.locator('.page-head [data-action=back]').click();await p.locator('[data-action=confirm-modal]').click();};
  await run('我的：资料→接活开关→共享；公寓/发布/报名同组，48px开关热区',async()=>{
    const order=await p.locator('.account-scroll').evaluate(n=>[...n.children].map(x=>x.className));
    assert(order.indexOf('account-identity')<order.indexOf('account-availability-row')&&order.indexOf('account-availability-row')<order.indexOf('account-contribution'),'order');
    assert((await p.locator('.account-main-tools [data-action]').allTextContents()).join('|')==='我的公寓我保存的 · 我共享的|我的发布|我的报名','one group');
    assert((await sw().getAttribute('aria-checked'))==='false','off');const box=await sw().boundingBox();assert(box.width>=48&&box.height>=48,'touch target');
    assert(!/常联系|加入团队|订阅|钱包/.test(await p.locator('#app').innerText()),'no retired/paid/member UI');
  });
  await run('开启只进入本次设置；取消不提前开启；保存未来时段后明确显示明天',async()=>{
    await sw().click();assert(await p.evaluate(()=>!model.availability.enabled),'not enabled before save');
    await leave();assert((await sw().getAttribute('aria-checked'))==='false','cancel stays off');await sw().click();
    await p.locator('[data-action=ex-date][data-id="2026-11-05"]').click();await save();
    assert((await sw().getAttribute('aria-checked'))==='true','saved on');assert((await p.locator('.account-availability-summary').innerText()).includes('明天'),'future not online');
  });
  await run('接活保存失败保留表单和关闭状态；重试成功；关闭失败保持开启后可重试',async()=>{
    await sw().click();await p.locator('#account-save-fail').check();await save();
    assert(await p.evaluate(()=>!model.availability.enabled),'failure not on');assert((await p.locator('[name=start]').inputValue())==='15:00','times retained');
    await save();assert((await sw().getAttribute('aria-checked'))==='true','retry on');const before=await p.evaluate(()=>[model.chats.length,model.applications.length]);
    await p.locator('#account-save-fail').check();await sw().click();await p.waitForTimeout(220);assert((await sw().getAttribute('aria-checked'))==='true','off failure retains');assert((await p.locator('.account-availability-error').innerText()).includes('重试'),'retry error');
    await sw().click();await p.waitForTimeout(220);assert((await sw().getAttribute('aria-checked'))==='false','off success');assert(JSON.stringify(before)===JSON.stringify(await p.evaluate(()=>[model.chats.length,model.applications.length])),'messages/applications unaffected');
  });
  await run('时段到期显示关闭；退出账号时迟到关闭操作不写入',async()=>{
    await p.evaluate(()=>{Object.assign(model.availability,{enabled:true,date:'2026-11-03',endDate:'2026-11-03',end:'18:00'});render();});assert((await sw().getAttribute('aria-checked'))==='false','expired off');
    await p.evaluate(()=>{Object.assign(model.availability,{enabled:true,date:'2026-11-04',endDate:'2026-11-04',end:'18:00'});render();});await sw().click();await p.selectOption('#scenario','guest');await p.waitForTimeout(220);assert(await p.evaluate(()=>model.availability.enabled),'no late account write');
  });
  await run('常联系首版完整退役：资料/会话无入口，旧路由回我的，旧操作不改关系',async()=>{
    const count=await p.evaluate(()=>model.contacts.length);await p.evaluate(()=>nav('driver',{id:'d1'}));assert((await p.locator('[data-action=save-contact]').count())===0,'profile no save');
    await p.locator('[data-action=contact]').click();await p.locator('[data-action=chat-more]').click();assert(!/常联系|私人备注/.test(await p.locator('#overlay').innerText()),'chat no CRM');
    await p.evaluate(()=>{closeModal();actions('save-contact',{dataset:{person:'d2'}});nav('contacts');});assert((await p.locator('#screen-id').innerText())==='U01','retired route');assert((await p.evaluate(()=>model.contacts.length))===count,'retired handler inert');
  });
  await run('通用手填直接同一添加表单，无公寓目录/重复截图按钮；未确认地址不共享',async()=>{
    await manual();assert((await p.locator('[data-submit=code]').count())===1,'canonical form');assert((await p.locator('select[name=apt]').count())===0,'no directory');assert((await p.locator('[data-action=import-open],[data-action=import-open-share]').count())===0,'no second import CTA');
    await p.locator('[name=value]').fill('*0007#');await p.locator('[name=source]').check();const count=await p.evaluate(()=>model.apartments.flatMap(a=>a.codes).length);await save();assert((await p.locator('#app').innerText()).includes('核对完整地址'),'address required');assert((await p.evaluate(()=>model.apartments.flatMap(a=>a.codes).length))===count,'no guessed target');
  });
  await run('地址候选选择后保留输入，符号/前导零直接共享并回到正确公寓',async()=>{
    await manual();await p.locator('[name=value]').fill('*0007#');await p.locator('[name=scope]').fill('TEST-SHARE');await choose('1228');assert((await p.locator('[name=value]').inputValue())==='*0007#','input retained');assert(!(await p.locator('[name=source]').isChecked()),'must confirm chosen address');
    await p.locator('[name=source]').check();await save();await p.waitForFunction(()=>window.abasongExperience.state.code.status==='ready');assert((await p.locator('.ex-expanded h2').innerText()).includes('1228'),'same target');assert((await p.locator('.ex-expanded .ex-code').allTextContents()).includes('*0007#'),'literal code');
  });
  await run('首页卡添加复用相同字段；更换地址清来源确认，失败保留正确目标/密码',async()=>{
    await p.locator('.bottom-nav [data-id=home]').click();await p.locator('[data-action=ex-apt][data-id=a3]').click();await p.waitForTimeout(180);await p.locator('.ex-apartment-card:not([inert]) [data-action=add-code]').click();
    assert((await p.locator('.code-address-summary').innerText()).includes('1185'),'card address prefilled');assert((await p.locator('[data-submit=code] input[name=value]').count())===1,'same form');
    await p.locator('[name=value]').fill('#0099*');await p.locator('[name=source]').check();await p.locator('[data-action=code-change-address]').click();assert(!(await p.locator('[name=source]').isChecked()),'source reset');await choose('1200');await p.locator('[name=source]').check();await p.evaluate(()=>{state.scenario='contribution-save-error';render();});await save();
    assert((await p.locator('[name=value]').inputValue())==='#0099*','error retains');assert((await p.locator('.code-address-summary').innerText()).includes('1200'),'new address retained');await p.evaluate(()=>{state.scenario='normal';render();});await save();await p.waitForFunction(()=>window.abasongExperience.state.code.status==='ready');assert((await p.locator('.ex-expanded h2').innerText()).includes('1200'),'not old target');
  });
  await run('未收录地址可在同一表单手动核对；保存不伪造附近坐标或距离',async()=>{
    await manual();await p.locator('#code-address-query').fill('9999 TEST Unlisted Ave');await p.locator('[data-action=code-address-manual]').click();await p.locator('[name=city]').fill('Los Angeles');await p.locator('[name=state]').fill('CA');await p.locator('[name=postal_code]').fill('90001');await p.locator('[name=value]').fill('*0011#');await p.locator('[name=scope]').fill('TEST-UNKNOWN');await p.locator('[name=source]').check();await save();
    assert(await p.evaluate(()=>{const a=model.apartments.find(a=>a.address.includes('9999 TEST'));return a&&a.codes.some(c=>c.value==='*0011#')&&!a.distance&&!a.geometry&&!a.latitude;}),'business association only');
  });
  await run('屏蔽保留但下沉：无记录无空菜单，屏蔽后设置可解除，不恢复常联系',async()=>{
    await p.locator('[data-action=settings]').click();assert((await p.locator('[data-action=blocked-users]').count())===0,'empty hidden');await p.locator('.page-head [data-action=back]').click();await p.evaluate(()=>nav('driver',{id:'d1'}));await p.locator('[data-action=person-more]').click();await p.locator('[data-action=block-context]').click();await p.locator('[data-action=confirm-modal]').click();assert(await p.locator('[data-action=contact]').isDisabled(),'new contact stopped');
    await p.locator('.page-head [data-action=back]').click();await p.locator('[data-action=settings]').click();assert((await p.locator('.settings-privacy').innerText()).includes('已屏蔽用户'),'low-frequency privacy group');await p.locator('[data-action=blocked-users]').click();await p.locator('[data-action=unblock]').click();assert((await p.locator('[data-action=blocked-users]').count())===0,'recovered');
  });
  await run('城市/米制距离复用辅助行，门牌街道单行；过期不留距离数值',async()=>{
    await p.locator('.bottom-nav [data-id=home]').click();await p.waitForFunction(()=>window.abasongExperience.state.code.status==='ready');const card=p.locator('.ex-apartment-card:not([inert])');assert((await card.locator('.ex-card-city').innerText())==='Los Angeles','city');assert((await card.locator('.ex-distance').innerText())==='约 10 m','metric');assert(!/至边界|直线|\bft\b|\bmi\b/.test(await card.innerText()),'no technical caption');
    const first=await card.locator('h2').innerText();assert(first.includes('1200')&&!first.includes('Los Angeles'),'single street line');await p.selectOption('#distance-quality','stale');assert((await card.locator('.ex-distance').count())===0,'stale hidden');assert((await card.locator('.ex-card-city').innerText())==='Los Angeles','city remains');
  });
  await run('320/390/430：我的分组、开关、地址联想及保存操作不溢出',async()=>{
    for(const width of [320,390,430]){await p.setViewportSize({width,height:844});assert(await sw().isVisible(),'switch visible');await manual();await p.locator('#code-address-query').fill('1200');assert(await p.locator('[data-action=code-address-choice]').first().isVisible(),'candidate visible');assert(await p.locator('.fixed-actions [type=submit]').isVisible(),'save visible');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');await leave();}
    await p.setViewportSize({width:1400,height:980});
  });
  const folder='/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence';await fresh();await p.locator('#device').screenshot({path:folder+'/simple-my.png'});await sw().click();await p.locator('#device').screenshot({path:folder+'/simple-availability.png'});await leave();await manual();await p.locator('#code-address-query').fill('1200');await p.locator('#device').screenshot({path:folder+'/simple-address-candidates.png'});await choose('1200');await p.locator('#device').screenshot({path:folder+'/simple-manual.png'});await fresh();await p.locator('.bottom-nav [data-id=home]').click();await p.waitForFunction(()=>window.abasongExperience.state.code.status==='ready');await p.locator('#device').screenshot({path:folder+'/simple-apartment.png'});
  const result={prototype_version:'3.2-simple',executed_at:new Date().toISOString(),scope:'isolated Chromium synthetic UI; no real Mapbox/OCR/Auth/GPS/contact service',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,console_errors:errors,external_request_hosts:[...new Set(external)],human_participants:0,native_acceptance:false};await context.close();return result;
}
