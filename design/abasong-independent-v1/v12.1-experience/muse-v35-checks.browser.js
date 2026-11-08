// Browser-only synthetic acceptance; this does not certify native or service authorization.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await context.newPage(); p.setDefaultTimeout(3500);
  const checks = [], errors = [], external = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:8765/") && !r.url().startsWith("data:")) external.push(r.url().split("/")[2]); });
  const root = "http://127.0.0.1:8765/v12.1-experience/index.html";
  let runId = 0;
  const fresh = async () => { await p.goto(root + "?layout=muse&v=m11&audit=" + (++runId) + "#home"); await p.waitForTimeout(200); };
  const act = (action, id) => p.locator(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ""}`).first();
  const assert = (value, label) => { if (!value) throw new Error(label); };
  const run = async (name, fn) => { try { await fn(); checks.push({ name, status: "PASS" }); } catch(e) { checks.push({ name, status: "FAIL", reason: e.message.slice(0,700) }); } };
  const mode = async name => { await act("m35-mode", name).click(); await p.waitForTimeout(250); };
  const scene = async name => { await p.evaluate(x => abasongMuse.scene(x), name); await p.waitForTimeout(150); };
  const evidence = "/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence/muse-v35/m11/";
  try {
    for (const width of [320,390,430]) {
      await run(`${width}px 三模式上下分区、无横向溢出、安全区`, async () => {
        await p.setViewportSize({ width, height: 844 }); await fresh();
        for (const m of ["apartments","jobs","people"]) {
          await mode(m);
          const r = await p.evaluate(() => {
            const rect = s => document.querySelector(s).getBoundingClientRect();
            const map = rect('.m35-map'), panel = rect('.m35-panel'), nav = rect('.bottom-nav'), list = document.querySelector('.m35-results');
            return { split: Math.abs(map.bottom - panel.top)<2, overlap: panel.bottom<=nav.top+1, overflow: list.scrollWidth<=list.clientWidth, tabs: document.querySelectorAll('[role="tablist"][aria-label="首页内容"]').length, x: document.documentElement.scrollWidth<=innerWidth, controls: [...document.querySelectorAll('.m35-tabs button,.m35-locate,.m35-search')].every(n=>n.getBoundingClientRect().height>=48) };
          });
          assert(r.split && r.overlap && r.overflow && r.tabs===1 && r.x && r.controls, JSON.stringify({m,...r}));
          if (width===390) await p.screenshot({path:evidence + m + '-390.png'});
        }
      });
    }
    await p.setViewportSize({width:390,height:844});
    await run("逐字搜索地址并点候选，回到对应卡片", async () => {
      await fresh();await act('search').click();await p.locator('#search-input').pressSequentially('1228',{delay:35});
      await act('choose-apt','a2').click();await p.waitForTimeout(250);
      assert(await p.evaluate(()=>state.apt==='a2' && state.route.view==='home'),'search return');
      assert((await p.locator('[data-row="a2"]').innerText()).includes('07412*'),'address code link');
    });
    await run("我的与首页共享入口使用同一手填表单", async () => {
      await fresh();await act('root','me').click();await act('lib-contribute').click();await act('lib-contribute-manual').click();
      assert(await p.locator('#code-address-query').count()===1 && await p.locator('input[data-field="value"]').count()===1,'direct form');
      assert(await p.getByRole('button',{name:'确认共享',exact:true}).count()===1,'unified primary action');
    });
    await run("地图点第二张→详情→返回保留选中与滚动", async () => {
      await fresh();await act('m35-select','a2').click();await p.waitForTimeout(400);
      const scroll = await p.locator('.m35-results').evaluate(n=>n.scrollTop);
      await act('m35-open','a2').click();assert((await p.locator('#app').innerText()).includes('07412*'),'second code');
      await act('back').click();await p.waitForTimeout(200);
      assert(await p.evaluate(()=>state.apt==='a2') && Math.abs(await p.locator('.m35-results').evaluate(n=>n.scrollTop)-scroll)<2,'return anchor');
    });
    await run("纵向滚动停稳后同步地图，不改区域筛选", async () => {
      await fresh();await p.locator('.m35-results').evaluate(n=>{const card=n.querySelector('[data-row="a2"]');n.scrollTop+=card.getBoundingClientRect().top-n.getBoundingClientRect().top-25;});await p.waitForTimeout(450);
      assert(await p.evaluate(()=>state.apt==='a2' && document.querySelector('.m35-map-pin.selected').dataset.id==='a2'),'scroll map focus');
      await mode('jobs');await p.locator('.m35-results').evaluate(n=>n.scrollTop=240);await p.waitForTimeout(300);
      assert(await p.evaluate(()=>state.supportFilters.jobs.region===''),'scroll is not filter');
    });
    await run("模式各自保存列表位置和镜头；定位不清除找人筛选", async () => {
      await fresh();await act('m35-select','a2').click();await p.waitForTimeout(400);
      const before=await p.locator('.m35-results').evaluate(n=>n.scrollTop);
      const area=await p.locator('.m35-map-surface').boundingBox();await p.mouse.move(area.x+70,area.y+190);await p.mouse.down();await p.mouse.move(area.x+95,area.y+210);await p.mouse.up();
      const camera=await p.evaluate(()=>JSON.stringify(abasongExperience.state.contexts.apartments));
      await mode('people');await act('ex-region','Alhambra').click();await p.waitForTimeout(250);await act('m35-locate').click();
      assert(await p.evaluate(()=>state.supportFilters.people.region==='Alhambra'),'location preserves filter');
      await mode('apartments');assert(await p.evaluate(()=>state.apt==='a2') && Math.abs(await p.locator('.m35-results').evaluate(n=>n.scrollTop)-before)<2,'mode restores row');
      assert(await p.evaluate(()=>JSON.stringify(abasongExperience.state.contexts.apartments))===camera,'camera retained');
      await act('m35-locate').click();assert(await p.evaluate(()=>state.apt==='a1' && abasongExperience.state.contexts.apartments.x===0),'recenter recommendations');
    });
    await run("第三张无码→统一表单→失败保留→重试→原公寓完整码", async () => {
      await fresh();await act('m35-select','a3').click();await act('m35-add','a3').click();
      assert((await p.locator('#app').innerText()).includes('1185 S Grove St'),'prefill');
      await p.locator('input[data-field="value"]').fill('*0012#');await p.getByText('行人门',{exact:true}).click();await p.locator('input[data-field="source"]').check();
      await p.evaluate(()=>state.scenario='contribution-save-error');await p.getByRole('button',{name:'确认共享',exact:true}).click();
      assert(await p.locator('input[data-field="value"]').inputValue()==='*0012#' && await p.evaluate(()=>state.route.view==='code'),'draft retained');
      await p.evaluate(()=>state.scenario='normal');await p.getByRole('button',{name:'确认共享',exact:true}).click();await p.waitForTimeout(250);
      assert(await p.evaluate(()=>state.apt==='a3' && state.route.view==='home'),'return a3');assert((await p.locator('[data-row="a3"]').innerText()).includes('*0012#'),'complete symbols');
      await p.screenshot({path:evidence+'contributed.png'});
    });
    await run("本人纠正保留前导零，返回原公寓；旧值不再显示", async () => {
      await act('m35-open','a3').click();await act('lib-correct').click();await p.locator('#overlay input[name="code"]').fill('#0008*');
      await p.locator('#overlay input[name="source"]').check();await p.getByRole('button',{name:'确认纠正并共享',exact:true}).click();
      const text = await p.locator('#app').innerText();assert(text.includes('#0008*') && !text.includes('*0012#'),'correction visible');
      await act('back').click();await p.waitForTimeout(200);assert(await p.evaluate(()=>state.apt==='a3'),'corrected return');
    });
    await run("详情有用反馈采用现有排序，不新增点赞计数", async () => {
      await fresh();await act('m35-open','a1').click();await p.locator('[data-action="vote"][data-id="r2"][data-vote="useful"]').click();
      const codes=await p.locator('.m35-record .m35-code').allTextContents();assert(codes[0]==='#105682','useful then newest');
    });
    await run("未收录搜索地址可确认后贡献，不丢地址", async () => {
      await fresh();await p.evaluate(()=>{state.temporaryDestination={address:'204 TEST Ave, TEST City, CA'};render();});await act('add-unknown-code').click();
      assert(await p.locator('input[name="address_line1"]').inputValue()==='204 TEST Ave','unknown address prefilled');
    });
    for (const s of ['house-nearby','house','denied','guest','unqualified','paused']) {
      await run(`场景 ${s}：准确状态与正文隔离`, async () => {
        await fresh();await scene(s);const text=await p.locator('.m35-results').innerText();
        if(s==='house-nearby') assert(await p.locator('[data-row]').count()===3,'house does not exclude nearby');
        if(s==='house') assert(text.includes('附近未匹配到公寓') && await p.locator('[data-row]').count()===0 && await p.locator('[data-building].selected').count()===0,'house empty without false target');
        if(s==='denied') assert(text.includes('开启位置') && await p.locator('.m35-position,.m35-distance').count()===0,'no fabricated gps');
        if(['guest','unqualified'].includes(s)) assert(!text.includes('*0128#') && !text.includes('07412*'),'no gated body');
        if(s==='paused') assert(!await p.locator('[data-row="a1"]').innerText().then(t=>t.includes('*0128#')) && text.includes('暂不提供共享'),'paused not empty');
      });
    }
    await run("第二张失败与无码区分，单张重试不影响其他地址", async () => {
      await fresh();await scene('one-error');const text=await p.locator('[data-row="a2"]').innerText();assert(text.includes('暂时无法读取') && !text.includes('暂无共享'),'distinct error');
      await act('m35-retry-code','a2').click();await p.waitForTimeout(750);assert((await p.locator('[data-row="a2"]').innerText()).includes('07412*'),'retry row');
      assert((await p.locator('[data-row="a1"]').innerText()).includes('*0128#'),'other row intact');
    });
    await run("慢响应期间切模式再返回，迟到内容只填原地址", async () => {
      await fresh();await scene('slow');await act('m35-select','a2').click();await mode('jobs');await p.waitForTimeout(2600);
      assert(await p.evaluate(()=>state.homeView==='jobs'),'late response cannot switch mode');await mode('apartments');
      assert(await p.evaluate(()=>state.apt==='a2'),'manual selection retained');assert((await p.locator('[data-row="a2"]').innerText()).includes('07412*'),'no wrong code');
    });
    await run("附近发现失败有重试，与正常零结果不同", async () => {
      await fresh();await scene('nearby-error');assert((await p.locator('.m35-results').innerText()).includes('无法加载'),'error');await act('m35-retry-nearby').click();assert(await p.locator('[data-row]').count()===3,'recovered');
    });
    await run("距离失效隐藏数值；粗略位置标约", async () => {
      await fresh();await p.locator('#distance-quality').selectOption('stale', {force:true});assert(await p.locator('.m35-distance').count()===0,'stale hidden');
      await p.locator('#distance-quality').selectOption('approximate', {force:true});assert((await p.locator('.m35-distance').first().innerText()).includes('约'),'approximate');
    });
    await run("筛选仅两场景；无结果清除筛选；地图点区域真实过滤", async () => {
      await fresh();await mode('jobs');await act('search').click();assert(await p.locator('#overlay select[name="kind"] option').count()===3,'two scenes');
      await p.locator('#overlay select[name="region"]').selectOption('Chino');await p.getByRole('button',{name:'查看结果',exact:true}).click();await p.waitForTimeout(250);
      assert((await p.locator('.m35-results').innerText()).includes('没有符合筛选'),'filtered empty');await act('clear-support-filters').click();await p.waitForTimeout(250);assert(await p.locator('[data-row]').count()===5,'clear restores');
      await act('ex-region','Pasadena').click();await p.waitForTimeout(250);assert(await p.locator('[data-row]').count()===2,'region filter');
    });
    await run("找活失败、空态和加载中分别呈现", async () => {
      await fresh();await mode('jobs');await p.locator('#support-scenario').selectOption('error', {force:true});await p.waitForTimeout(300);
      assert((await p.locator('.m35-results').innerText()).includes('无法加载'),'support error');await act('m35-retry-support').click();await p.waitForTimeout(300);assert(await p.locator('[data-row]').count()===5,'support retry');
      await p.locator('#support-scenario').selectOption('empty', {force:true});await p.waitForTimeout(300);assert((await p.locator('.m35-results').innerText()).includes('暂无开放配送需求'),'support empty');
      await p.locator('#support-scenario').selectOption('slow', {force:true});assert((await p.locator('.m35-results').innerText()).includes('正在查找'),'support loading');
    });
    await run("需求详情仓库地图及返回、报名入口保持可达", async () => {
      await fresh();await mode('jobs');await act('m35-open','j1').click();
      assert((await p.locator('#app').innerText()).includes('5685 Alcoa Ave'),'warehouse full address');
      assert(await p.locator('[data-action="ex-pickup-map"]').count()>0,'map entry');await act('ex-pickup-map').click();
      assert((await p.locator('#app').innerText()).includes('5685 Alcoa Ave'),'map address');await act('close-modal').click();await p.waitForTimeout(200);
      assert(await p.evaluate(()=>state.route.view==='job'),'back to detail');assert(await p.locator('[data-action="apply"]').count()>0,'apply entry');
    });
    await run("模式发布入口复用 V3.4 两场景及表单", async () => {
      await fresh();await mode('jobs');await act('publish').click();assert(await p.locator('[data-action="delivery-scene"]').count()===2,'two scenes');
      await act('delivery-scene','rescue').click();assert(await p.locator('.v34-flow').count()>0 || (await p.locator('#app').innerText()).includes('途中'),'form reachable');
    });
    await run("大字号及320×568小屏可滚动操作，不横向裁切", async () => {
      await p.setViewportSize({width:320,height:568});await fresh();await scene('large');
      assert(await p.evaluate(()=>{const n=document.querySelector('.m35-results');return n.scrollHeight>n.clientHeight && n.scrollWidth<=n.clientWidth && n.clientHeight>80;}),'small scroll area');
      await act('m35-select','a3').click();await act('m35-add','a3').click();assert(await p.getByRole('button',{name:'确认共享',exact:true}).isVisible(),'form action reachable');
      await p.screenshot({path:evidence+'small-form.png'});
    });
    await run("三模式首屏完整第一张，并露出第二张主要信息", async () => {
      for (const width of [320,390,430]) {
        await p.setViewportSize({width,height:844});await fresh();
        for(const m of ['apartments','jobs','people']) {
          await mode(m);
          const metrics=await p.evaluate(()=>{const list=document.querySelector('.m35-results').getBoundingClientRect(),cards=[...document.querySelectorAll('[data-row]')].map(n=>n.getBoundingClientRect());return{first:cards[0].bottom<=list.bottom,second:Math.min(list.bottom,cards[1].bottom)-Math.max(list.top,cards[1].top)};});
          assert(metrics.first && metrics.second>=60,JSON.stringify({width,m,...metrics}));
        }
      }
    });
    await run("整卡键盘进入详情，添加按钮独立且不重复跳转", async () => {
      await p.setViewportSize({width:390,height:844});await fresh();
      assert(await p.locator('button button,[role="button"] button').count()===0,'no nested interactive target');
      const card=act('m35-open','a2');await card.focus();await card.press('Enter');
      assert(await p.evaluate(()=>state.route.view==='museApartment' && state.apt==='a2'),'keyboard opens second object');
      await act('back').click();await act('m35-select','a3').click();await act('m35-add','a3').focus();await act('m35-add','a3').press('Enter');
      assert(await p.evaluate(()=>state.route.view==='code' && state.forms.code.targetId==='a3'),'direct action remains on form');
    });
    await run("公寓卡保留城市与来源；长街道和长码不横向溢出", async () => {
      await p.setViewportSize({width:320,height:844});await fresh();
      await p.evaluate(()=>{model.apartments[0].address='1200 N TEST Very Long Street Name Boulevard, TEST City, CA 90000';rankCodes(model.apartments[0])[0].value='*000123456789000#';render();});
      const row=p.locator('[data-row="a1"]');const text=await row.innerText();
      assert(text.includes('TEST City') && text.includes('贡献 · 阿杰') && text.includes('*000123456789000#'),'source preserved');
      assert(await row.evaluate(n=>n.scrollWidth<=n.clientWidth),'long content fits');
      assert((await act('m35-open','a1').getAttribute('aria-label')).includes('CA 90000'),'complete accessible address');
      await act('m35-open','a1').click();assert((await p.locator('.m35-detail-heading').innerText()).includes('CA 90000'),'detail full address');
    });
    await run("跨日可接时段保留结束日期；未来不冒充当前可用", async () => {
      await p.setViewportSize({width:390,height:844});await fresh();
      await p.evaluate(()=>{Object.assign(model.drivers[0],{startDay:abasongExperience.demoDay,startTime:'23:00',endDay:'2026-11-05',endTime:'01:00'});});await mode('people');
      const text=await p.locator('[data-row="d1"]').innerText();assert(text.includes('待开始') && text.includes('明天 1:00 AM'),'cross-day semantics');
      assert(!text.includes('距你') && !text.includes('日均'),'no invented distance/performance');
    });
    await run("议价、待确认件数和尽快到场保持真实语义", async () => {
      await fresh();await p.evaluate(()=>{Object.assign(model.jobs[0],{unit:'negotiable',price:null,quantityMode:'unknown',remaining:null,asap:true});});await mode('jobs');
      const text=await p.locator('[data-row="j1"]').innerText();assert(text.includes('联系议价') && text.includes('件数待确认') && text.includes('尽快到仓') && !text.includes('NaN'),'unknown fields not fabricated');
    });
    await run("筛选入口可达，应用条件后显示摘要并可清除", async () => {
      await fresh();await mode('jobs');await p.locator('.m35-filter-control').click();await p.locator('#overlay select[name="region"]').selectOption('Pasadena');await p.getByRole('button',{name:'查看结果',exact:true}).click();await p.waitForTimeout(250);
      assert((await p.locator('.m35-filter-summary').innerText()).includes('Pasadena'),'visible applied filter');
      await act('clear-support-filters').click();await p.waitForTimeout(250);assert(await p.locator('.m35-filter-summary').count()===0 && await p.locator('[data-row]').count()===5,'clear restored');
    });
    await run("320×568小屏搜索、消息和定位入口仍可点击", async () => {
      await p.setViewportSize({width:320,height:568});await fresh();
      const message=act('inbox');assert(await message.isVisible() && await act('search').isVisible() && await act('m35-locate').isVisible(),'small controls present');await message.click();assert(await p.evaluate(()=>state.route.view==='inbox'),'small message reachable');
    });
    await run("地图标记不把无码或无资格对象暗示为已有门禁码", async () => {
      await p.setViewportSize({width:390,height:844});await fresh();
      const glyph=await p.evaluate(()=>({known:document.querySelector('[data-action="m35-select"][data-id="a1"] svg').innerHTML,empty:document.querySelector('[data-action="m35-select"][data-id="a3"] svg').innerHTML}));
      assert(glyph.known!==glyph.empty,'distinct neutral location pin');await scene('unqualified');
      assert(await p.locator('[data-action="m35-select"][data-id="a1"] svg').innerHTML()===glyph.empty,'no implied availability behind entitlement');
    });
    await run("旧版入口未启用新布局", async () => {await p.goto(root+'?v=brand-v1#home');assert(await p.locator('.m35-home').count()===0 && await p.locator('.ex-home').count()===1,'old view intact');});
    await run("无运行异常、无外部服务请求", async () => {assert(!errors.length && !external.length,JSON.stringify({errors,external}));});
    return { checks, passed:checks.filter(x=>x.status==='PASS').length, failed:checks.filter(x=>x.status==='FAIL').length, errors, external, scope:'Synthetic browser prototype only; no native, Mapbox or API acceptance.' };
  } finally { await context.close(); }
}
