// DTL-01 actual prototype DOM checks; not native, GPS, API or real screen-reader acceptance.
async (page) => {
  const ctx = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p = await ctx.newPage(); p.setDefaultTimeout(4000);
  const checks=[], metrics=[], errors=[]; p.on('pageerror',e=>errors.push(e.message));
  let seq=0;
  const fresh=async()=>{await p.goto(`http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse&v=compact-results&geometry=${++seq}#home`);await p.waitForTimeout(100);};
  const assert=(v,m)=>{if(!v)throw new Error(m);};
  const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,450)});}};
  const mode=async m=>{await p.locator(`[data-action="m35-mode"][data-id="${m}"]`).click();await p.waitForTimeout(300);};
  const geometry=()=>p.evaluate(()=>{
    const list=document.querySelector('.m35-results'),r=list.getBoundingClientRect(),cards=[...list.querySelectorAll('[data-row]')];
    const rows=cards.map(n=>{const c=n.getBoundingClientRect(),h=n.querySelector('.m35-title-slot').getBoundingClientRect(),i=n.querySelector('.m35-core-slot').getBoundingClientRect(),f=n.querySelector('.m35-footer-slot').getBoundingClientRect();return{height:c.height,width:c.width,top:c.top,bottom:c.bottom,heading:h.height,core:i.top-c.top,footer:f.top-c.top,overflow:n.scrollWidth>n.clientWidth};});
    return{map:document.querySelector('.m35-map').clientHeight,list:r.height,listTop:r.top,listBottom:r.bottom,rows,preview:rows[1]?Math.max(0,Math.min(r.bottom,rows[1].bottom)-Math.max(r.top,rows[1].top)):0,overflow:document.documentElement.scrollWidth>innerWidth||list.scrollWidth>list.clientWidth,nav:document.querySelector('.bottom-nav').getBoundingClientRect().top};
  });
  try {
    for(const [width,height] of [[390,844],[430,932],[320,568],[360,640]]) {
      await p.setViewportSize({width,height});await fresh();
      for(const m of ['apartments','jobs','people']) await run(`${width}×${height} ${m} 同槽位/首卡/安全区`,async()=>{
        await mode(m);const r=await geometry();metrics.push({width,height,mode:m,...r});
        assert(r.rows.length>1&&!r.overflow&&r.rows.every(c=>c.height===156&&!c.overflow),JSON.stringify(r));
        assert(r.rows.every(c=>m==='apartments'?c.heading===32&&c.core===52&&c.footer===106:c.heading===46&&c.core===59&&c.footer===111),'slot mismatch');
        assert(r.rows[0].bottom<=r.listBottom+1&&r.listBottom<=r.nav+1,'first card or nav clipped');
        if(height>=844)assert(r.preview>70,'second card constrained to title');
        if(width===390)assert(r.map>=310,'map unexpectedly small');
        if(width===390)await p.screenshot({path:`/Users/olly/Abasong/design/abasong-independent-v1/v12.1-experience/evidence/muse-v35/dtl01/${m}-390.png`});
      });
    }
    await run('第二张卡片可见高度随屏幕空间变化',async()=>{
      const normal=metrics.find(row=>row.width===390&&row.mode==='apartments');
      const tall=metrics.find(row=>row.width===430&&row.mode==='apartments');
      assert(normal&&tall&&tall.preview>normal.preview,'second card is capped');
    });
    await p.setViewportSize({width:390,height:844});await fresh();
    await run('首页地址单行、距离在右上角，详情保留完整地址',async()=>{
      const first=p.locator('[data-row="a1"]');
      assert(await first.locator('.m35-title-slot .address-primary').count()===1,'missing street title');
      assert(await first.locator('.m35-title-slot .m35-meta').count()===0,'extra locality row');
      const title=await first.locator('.m35-card-head h3').boundingBox(), distance=await first.locator('.m35-card-head .m35-distance').boundingBox();
      assert(title&&distance&&distance.x>=title.x+title.width&&Math.abs(distance.y-title.y)<title.height,'distance outside the upper right of the title row');
      await first.locator('[data-action="m35-open"]').click();
      const locality=await p.evaluate(()=>model.apartments[0].address.split(',').slice(1).join(',').trim());
      assert(locality&&(await p.locator('.m35-detail-heading').innerText()).includes(locality),'detail address incomplete');
      await fresh();
    });
    for(const s of ['normal','empty','one-error','slow','guest','unqualified','paused']) await run(`${s} 卡片等高/地址保留`,async()=>{
      await p.evaluate(s=>abasongMuse.scene(s),s);const r=await geometry();assert(r.rows.every(c=>c.height===156)&&r.preview>70,'state changes geometry');
      const text=await p.locator('.m35-results').innerText();if(['guest','unqualified'].includes(s))assert(!text.includes('*0128#')&&!text.includes('贡献 ·'),'gated metadata leak');
    });
    for(const s of ['house','nearby-error','denied']) await run(`${s} 不制造空白公寓卡`,async()=>{
      await p.evaluate(s=>abasongMuse.scene(s),s);assert(await p.locator('.m35-result-card').count()===0,'fake result');assert(await p.locator('.m35-state button').count()===1,'one meaningful action');
    });
    await run('下一张卡片可聚焦并打开详情',async()=>{
      await fresh();await p.locator('.m35-results').evaluate(n=>n.dispatchEvent(new Event('scroll')));await p.waitForTimeout(200);
      assert(await p.evaluate(()=>state.apt)==='a1','next row steals focus');
      await p.locator('[data-action="m35-open"][data-id="a2"]').focus();const r=await geometry();assert(r.rows[1].top>=r.listTop&&r.rows[1].bottom<=r.listBottom,'keyboard target still clipped');
      await p.keyboard.press('Enter');assert(await p.evaluate(()=>state.route.view)==='museApartment','keyboard activation');
    });
    await run('32字符完整保留，核心条增高，后续槽位不重叠',async()=>{
      await fresh();await p.evaluate(()=>{rankCodes(model.apartments[0])[0].value='*'+('0'.repeat(30))+'#';render();});
      const card=p.locator('[data-row="a1"].m35-content-expanded');await card.waitFor({state:'visible'});
      const r=await card.evaluate(n=>{const core=n.querySelector('.m35-core-slot').getBoundingClientRect(),foot=n.querySelector('.m35-footer-slot').getBoundingClientRect(),code=n.querySelector('.m35-code');return{height:n.getBoundingClientRect().height,fits:code.scrollWidth<=code.clientWidth,code:code.textContent.length,separate:core.bottom<=foot.top};});
      assert(r.height>156&&r.fits&&r.code===32&&r.separate,JSON.stringify(r));
    });
    await run('大字下三模式允许增高，来源及跨日时段可滚动读取',async()=>{
      await p.setViewportSize({width:320,height:568});await fresh();await p.evaluate(()=>abasongMuse.scene('large'));
      for(const m of ['apartments','jobs','people']){await mode(m);const r=await geometry();assert(!r.overflow&&r.list>80&&r.rows.every(c=>c.height>=156&&!c.overflow),JSON.stringify(r));}
    });
    await run('无脚本运行异常',async()=>assert(!errors.length,JSON.stringify(errors)));
    return{checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,metrics,errors,scope:'Synthetic HTML prototype only'};
  } finally {await ctx.close();}
}
