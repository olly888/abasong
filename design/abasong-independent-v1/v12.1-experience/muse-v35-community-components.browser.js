// Actual RN components, Expo web, DEV memory transport. No real account or API.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), p=await context.newPage(),checks=[],errors=[];
  p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const button=name=>p.getByRole('button',{name,exact:true});
  const fresh=async scene=>{await p.goto('http://127.0.0.1:8081/community-visual-lab?scene='+scene);await p.getByText(/TEST · M6-01/).waitFor();await p.locator('button[class*=dismissButton]').first().click({timeout:700}).catch(()=>{});};
  const shot=async name=>{await p.locator('button[class*=dismissButton]').first().click({timeout:400}).catch(()=>{});await p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m6-01/'+name+'.png'});};
  const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,850)});}};
  try {
    await run('标签直接选择/取消；可选地区与需求独立失败；文字发布重试保持同一提交',async()=>{
      await fresh('composer');assert(await button('发布').isDisabled(),'empty disabled');assert(await p.getByRole('checkbox').count()===3,'three topics');
      const topic=p.getByRole('checkbox',{name:'经验分享'});await topic.click();assert(await topic.getAttribute('aria-checked')==='true','selected');await topic.click();assert(await topic.getAttribute('aria-checked')==='false','cleared');await topic.click();
      await button('添加配送地区').click();await p.getByText('地区暂时无法加载',{exact:true}).waitFor();await button('重试加载地区').click();await p.getByText('地区暂时无法加载',{exact:true}).waitFor({state:'hidden'});
      await button('添加配送地区').click();await button('关联我发布的需求').click();await p.getByText('部分需求暂时无法加载',{exact:true}).waitFor();await button('关联我发布的需求').click();
      await p.getByRole('textbox',{name:'写一条动态',exact:true}).fill('TEST 配送经验 · 即使选填信息加载失败也可发布正文');await shot('component-composer-390');
      await button('发布').click();await p.getByText('发布结果未确认，请重试',{exact:true}).waitFor();assert(await p.getByRole('textbox').inputValue()==='TEST 配送经验 · 即使选填信息加载失败也可发布正文','draft retained');
      assert(await p.getByRole('checkbox',{name:'经验分享'}).isDisabled(),'uncertain retry locks editing');await shot('component-composer-retry-390');await button('重新发布').click();await p.getByText('TEST · 发布成功，同一提交标识',{exact:true}).waitFor();await p.getByText('动态详情',{exact:true}).waitFor();
    });
    await run('我的：无重复标题、关闭失败保留开启、重试成功；重新开启只进入设置',async()=>{
      await fresh('my');await button('编辑个人资料').waitFor();assert(await p.getByText('我的',{exact:true}).count()===0,'no header');assert(await p.getByRole('switch').isChecked(),'enabled');await shot('component-my-390');
      await p.getByRole('switch').click();await p.getByText('TEST · 未能关闭接活状态，请重试',{exact:true}).waitFor();assert(await p.getByRole('switch').isChecked(),'failed retains enabled');await shot('component-my-retry-390');await button('重试关闭').click();await p.getByText('暂不接活',{exact:true}).waitFor();assert(!(await p.getByRole('switch').isChecked()),'off after save');await p.getByRole('switch').click();await p.getByText('TEST · 打开接活设置；尚未保存',{exact:true}).waitFor();assert(!(await p.getByRole('switch').isChecked()),'no optimistic enable');
    });
    await run('个人资料复用选项；修改保存回我的',async()=>{
      await fresh('my');await button('编辑个人资料').click();await p.getByRole('textbox',{name:'显示名',exact:true}).fill('TEST M6 司机');const c=p.getByRole('checkbox',{name:'GOFO',exact:true});await c.click();assert(await c.getAttribute('aria-checked')==='true','experience');await shot('component-profile-390');await button('保存资料').click();await p.getByText('TEST M6 司机',{exact:true}).waitFor();
    });
    await run('司机圈加载失败和空态独立；重试后可进详情；发布入口两种明确操作',async()=>{
      await fresh('feed-error');await p.getByText('动态暂时无法加载',{exact:true}).waitFor();await shot('component-feed-error-390');await button('重新加载').click();await button('回复 2').waitFor();await shot('component-feed-390');await button('回复 2').click();await p.getByText('动态详情',{exact:true}).waitFor();await button('返回司机圈').click();await button('发布').click();await button('发动态').waitFor();await button('发需求').waitFor();await button('取消').click();
      await fresh('feed-empty');await p.getByText('还没有动态',{exact:true}).waitFor();await shot('component-feed-empty-390');
    });
    await run('320/390/430：标签触控与左右边界；底部发布按钮可见',async()=>{
      for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await fresh('composer');for(const c of await p.getByRole('checkbox').all()){const r=await c.boundingBox();assert(r.height>=48&&r.x>=0&&r.x+r.width<=width,'chip bounds');}const b=await button('发布').boundingBox();assert(b.y+b.height<=844,'footer');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');await shot('component-composer-'+width);await fresh('my');await button('编辑个人资料').waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'account bounds');if(width===320)await shot('component-my-320');}
    });
    return {scope:'Actual RN components on Expo web / memory TEST only / no native gestures or photo picker',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
  }finally{await context.close();}
}
