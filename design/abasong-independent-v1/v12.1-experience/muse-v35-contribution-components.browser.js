// Actual RN components rendered on Expo web; synthetic memory transport only.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await context.newPage(), checks=[], errors=[]; p.setDefaultTimeout(5000);
  p.on('pageerror',e=>errors.push(e.message)); p.on('dialog',d=>d.accept());
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const button=name=>p.getByRole('button',{name,exact:true});
  const field=name=>p.getByRole('textbox',{name,exact:true});
  const consent=()=>p.getByRole('checkbox',{name:/我已核对/});
  const fresh=async(route,scene)=>{
    await p.goto('http://127.0.0.1:8081/'+route+'?scene='+encodeURIComponent(scene));
    await p.getByText(/TEST · .*仅内存/).first().waitFor();
    await p.locator('button[class*=dismissButton]').first().click({timeout:700}).catch(()=>{});
  };
  const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,900)});}};
  const shot=name=>p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m5-02/'+name+'.png'});
  try {
    await run('手填：选项可取消、#/*与前导零保留、失败可重试',async()=>{
      await fresh('contribution-lab','保存重试');await field('门禁码').fill('*0012#');
      for(const name of ['行人门','车库门','大堂门']) assert(await p.getByText(name,{exact:true}).count()===1,'exactly three doors');
      await p.getByText('行人门',{exact:true}).click();await consent().click();
      await p.getByText('行人门',{exact:true}).click(); assert(await consent().getAttribute('aria-checked')==='false','door change resets consent');
      assert(await field('门禁码').inputValue()==='*0012#','literal value');
      await consent().click();await button('确认共享').click();await p.getByText('暂时无法保存，请重试',{exact:true}).waitFor();
      assert(await field('门禁码').inputValue()==='*0012#','failure retains');await shot('component-manual-retry-390');
      await button('确认共享').click();await p.getByText('TEST · 共享成功回程已触发',{exact:true}).waitFor();assert((await p.locator('body').innerText()).includes('2445'),'same target');
    });
    await run('地址更换：保留门禁码和门别，清除来源确认',async()=>{
      await fresh('contribution-lab','卡片入口');await field('门禁码').fill('#0008*');await p.getByText('车库门',{exact:true}).click();await consent().click();
      await button('更换地址').click();await field('公寓地址').fill('385');await p.getByRole('button',{name:/385 S Catalina/}).first().click();
      assert(await field('门禁码').inputValue()==='#0008*','keeps code');assert(await consent().getAttribute('aria-checked')==='false','address resets consent');
      await consent().click();await button('确认共享').click();await p.getByText('TEST · 共享成功回程已触发',{exact:true}).waitFor();assert((await p.locator('body').innerText()).includes('385 S Catalina'),'returned new address');
    });
    await run('纠正：不换地址，修改后重确认、失败保留与回程',async()=>{
      await fresh('access-contribution-lab','纠正重试');await field('正确门禁码').fill('#0008*');await consent().click();await field('正确门禁码').fill('#0010*');
      assert(await consent().getAttribute('aria-checked')==='false','code resets consent');assert(await button('更换地址').count()===0,'fixed target');
      await p.getByText('行人门',{exact:true}).click();await consent().click();await button('确认纠正并共享').click();await p.getByText('TEST · 结果尚未确认，请重试',{exact:true}).waitFor();
      assert(await field('正确门禁码').inputValue()==='#0010*','retry keeps literal');await shot('component-correction-retry-390');await button('确认纠正并共享').click();
      await p.getByText('TEST · 纠正回程',{exact:true}).waitFor();assert((await p.locator('body').innerText()).includes('#0010* · 门别未注明'),'blank door explicit');
    });
    await run('纠正：历史门别保留；版本冲突锁定提交',async()=>{
      await fresh('access-contribution-lab','历史门别');await p.getByText('原门别 · TEST 东侧入口',{exact:true}).waitFor();assert(await p.getByRole('textbox').count()===1,'no free-text door');
      await fresh('access-contribution-lab','版本冲突');await field('正确门禁码').fill('0012#');await consent().click();await button('确认纠正并共享').click();await button('刷新当前记录').waitFor();
      assert(!(await field('正确门禁码').isEditable()),'conflict locks editing');await shot('component-correction-conflict-390');
    });
    await run('截图：两条地址独立，待核对不可选，编辑清除确认且保留符号',async()=>{
      await fresh('access-contribution-lab','截图核对');assert(await p.getByRole('checkbox',{name:'选择第 2 条',exact:true}).isDisabled(),'uncertain not selectable');
      await consent().click();await button('核对').first().click();await field('门禁码').fill('*0007#');await p.getByText('大堂门',{exact:true}).click();await p.locator('button[class*=dismissButton]').first().click({timeout:700}).catch(()=>{});await button('完成核对').click();
      await p.getByText('*0007#',{exact:true}).waitFor();const selected=p.getByRole('checkbox',{name:'选择第 1 条',exact:true});assert(await selected.getAttribute('aria-checked')==='false','edit clears selection');await selected.click();assert(await consent().getAttribute('aria-checked')==='false','edit resets consent');
      assert(await button('确认共享 1 条').isDisabled(),'must re-confirm');await shot('component-import-390');
    });
    await run('320/390/430宽：三选门别、输入及底部操作无横向溢出',async()=>{
      for(const width of [320,390,430]) {
        await p.setViewportSize({width,height:844});await fresh('contribution-lab','卡片入口');await field('门禁码').fill('*0012#');
        const box=await field('门禁码').boundingBox();assert(box.x>=0&&box.x+box.width<=width,'field fits');
        for(const name of ['行人门','车库门','大堂门']) {const b=await p.getByText(name,{exact:true}).boundingBox();assert(b.x>=0&&b.x+b.width<=width,'door fits');}
        assert(await button('确认共享').isVisible(),'primary visible');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');await shot('component-manual-'+width);
      }
    });
    return {scope:'RN-web actual components / TEST memory; not native gestures or OCR quality',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
  } finally {await context.close();}
}
