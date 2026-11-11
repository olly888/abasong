// Synthetic browser checks only; real HTTP/permissions are verified separately.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p = await context.newPage();p.setDefaultTimeout(5000);
  const checks=[], errors=[];p.on('pageerror',e=>errors.push(e.message));
  const assert=(v,s)=>{if(!v)throw new Error(s);};
  const act=(a,id)=>p.locator(`[data-action="${a}"]${id ? `[data-id="${id}"]`:''}`).first();
  const fresh=async (mode,kind)=>{await p.goto(`http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse&pagination=${kind}#home`);await act('m35-mode',mode).click();await p.waitForTimeout(300);};
  const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,350)});}};
  try {
    for(const width of [320,390,430])for(const mode of ['jobs','people']){
      await p.setViewportSize({width,height:844});
      await run(`${width}px ${mode} 追加失败保留/重试去重/详情回程`,async()=>{
        await fresh(mode,'retry');
        const first=await p.locator('[data-row]').first().getAttribute('data-row');
        assert(await p.locator('[data-row]').count()===1,'initial page');
        await act('m35-more').click();await p.waitForTimeout(600);
        assert((await p.locator('.m35-results').innerText()).includes('已加载内容保留'),'partial retry message');
        assert(await p.locator('[data-row]').count()===1,'failure retains existing row');
        const layout=await p.evaluate(()=>{const n=document.querySelector('.m35-results');return n.scrollWidth<=n.clientWidth;});assert(layout,'horizontal overflow');
        if(width===390)await p.screenshot({path:`/Users/olly/Abasong/artifacts/muse-m4-02/${mode}-retry-390.png`});
        await act('m35-more').click();await p.waitForTimeout(600);
        assert(await p.locator('[data-row]').count()===2,'retry appends exactly one');
        assert(await p.locator('[data-row]').first().getAttribute('data-row')===first,'first identity retained');
        await act('m35-open',first).click();await act('back').click();
        assert(await p.locator('[data-row]').count()===2,'detail return retains loaded pages');
      });
      await run(`${width}px ${mode} 上限提示与模式隔离`,async()=>{
        await fresh(mode,'limit');
        assert((await p.locator('.m35-results').innerText()).includes('结果较多，请缩小筛选范围'),'limit notice');
        assert(await p.locator('[data-action="m35-more"]').count()===0,'no unbounded more');
        await act('m35-mode','apartments').click();
        assert(!(await p.locator('.m35-results').innerText()).includes('缩小筛选范围'),'no support pagination on apartments');
      });
    }
    await run('慢分页后切换区域，旧结果不混入',async()=>{
      await fresh('jobs','slow');await act('m35-more').click();
      await p.locator('.m35-filter-control').click();
      await p.locator('#overlay select[name="region"]').selectOption('Pasadena');
      await p.getByRole('button',{name:'查看结果',exact:true}).click();await p.waitForTimeout(2800);
      assert(await p.locator('[data-row]').count()===1,'stale next page ignored');
      assert((await p.locator('.m35-filter-summary').innerText()).includes('Pasadena'),'filter retained');
    });
    await run('切换模式保留各自分页；清除筛选重置页数',async()=>{
      await fresh('jobs','retry');await act('m35-more').click();await p.waitForTimeout(600);await act('m35-more').click();await p.waitForTimeout(600);
      await act('m35-mode','people').click();await p.waitForTimeout(300);assert(await p.locator('[data-row]').count()===1,'people starts first page');
      await act('m35-mode','jobs').click();await p.waitForTimeout(300);assert(await p.locator('[data-row]').count()===2,'jobs retained');
      await p.locator('.m35-filter-control').click();await p.locator('#overlay select[name="region"]').selectOption('Pasadena');await p.getByRole('button',{name:'查看结果',exact:true}).click();await p.waitForTimeout(300);
      await act('clear-support-filters').click();await p.waitForTimeout(300);assert(await p.locator('[data-row]').count()===1,'filter reset pages');
    });
    assert(errors.length===0,JSON.stringify(errors));
    return {checks,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,errors};
  }finally{await context.close();}
}
