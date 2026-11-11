// HTML prototype, synthetic records and images only. Does not call business services.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await context.newPage(),checks=[],errors=[];
  p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const action=a=>p.locator('#app [data-action="'+a+'"]').first();
  const fresh=async view=>{await p.goto('http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse');await p.waitForFunction(()=>document.body.classList.contains('muse-v35'));await p.evaluate(v=>{state.logged=true;nav(v);},view);};
  const compose=async()=>{await fresh('circle');await action('circle-publish').click();await p.locator('[data-action=new-post]').first().click();};
  const shot=async name=>{await p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m6-01/'+name+'.png'});};
  const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,700)});}};
  try {
    await run('我的：资料在前、接活/共享/分组工具顺序、无重复标题',async()=>{
      await fresh('me');assert(await p.locator('.account-scroll .page-head,.account-scroll .profile-hero').count()===0,'no duplicate heading');const text=await p.locator('#app').innerText();for(const t of ['编辑资料','接活状态','共享门禁码','我的公寓','我的发布','我的报名','邀请司机','设置'])assert(text.includes(t),'missing '+t);await shot('prototype-my-390');
    });
    await run('正文优先、三标签点选取消、选填信息默认折叠',async()=>{
      await compose();assert(await p.locator('.circle-editor-actions button').isDisabled(),'empty disabled');assert(await p.locator('[data-post-option][open]').count()===0,'options collapsed');assert(await p.locator('[data-action=circle-topic]').count()===3,'three topics');await p.locator('[name=text]').fill('TEST M6 分享配送经验');const t=p.locator('[data-action=circle-topic][data-id="经验分享"]');await t.click();assert(await t.getAttribute('aria-pressed')==='true','selected');await t.click();assert(await t.getAttribute('aria-pressed')==='false','cleared');await shot('prototype-composer-390');await p.locator('.circle-editor-actions button').click();await p.locator('.circle-detail').waitFor();
    });
    await run('三图选择、失败保留文字与图片、重试发布',async()=>{
      await compose();await p.locator('[name=text]').fill('TEST M6 合成图片');await action('circle-add-photo').click();await p.locator('[data-action=circle-photo-gallery]').click();for(const id of ['entry','courtyard','parcel'])await p.locator('[data-action=circle-gallery-toggle][data-id="'+id+'"]').click();await p.locator('[data-action=circle-gallery-done]').click();assert(await p.locator('.circle-photo-thumb').count()===3,'three photos');await p.locator('#circle-image-fail').evaluate(n=>{n.checked=true;});await p.locator('.circle-editor-actions button').click();await p.getByRole('button',{name:'重新发布',exact:true}).waitFor();assert(await p.locator('[name=text]').inputValue()==='TEST M6 合成图片','text retained');assert(await p.locator('.circle-photo-thumb').count()===3,'photos retained');await shot('prototype-composer-images-retry-390');await p.getByRole('button',{name:'重新发布',exact:true}).click();await p.locator('.circle-detail').waitFor();assert(await p.locator('.circle-detail .circle-picture').count()===3,'posted photos');
    });
    await run('320/390/430：选项与我的工具列表不横向溢出',async()=>{
      for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await compose();for(const c of await p.locator('[data-action=circle-topic]').all()){const b=await c.boundingBox();assert(b.height>=48 && b.x>=0 && b.x+b.width<=width,'chip bounds');}assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');await fresh('me');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'account fits');}
      await p.setViewportSize({width:390,height:844});await fresh('circle');await shot('prototype-feed-390');
    });
    return {scope:'HTML prototype synthetic only',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
  }finally{await context.close();}
}
