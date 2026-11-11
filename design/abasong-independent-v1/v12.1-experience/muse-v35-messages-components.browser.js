// Actual RN components through Expo web; memory-only transport, no messages sent.
async (page) => {
 const c=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage(),checks=[],errors=[];
 p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));
 const assert=(v,m)=>{if(!v)throw Error(m);},tab=n=>p.getByRole('tab',{name:n}),button=n=>p.getByRole('button',{name:n,exact:true});
 const notice=()=>p.getByRole('button',{name:/你的司机圈动态有新回复/});
 const fresh=async scene=>{await p.goto('http://127.0.0.1:8081/inbox-visual-lab?scene='+scene);await p.getByText('TEST · M6-02 · A · 打开0',{exact:true}).waitFor();await p.locator('button[class*=dismissButton]').first().click({timeout:400}).catch(()=>{});};
 const shot=async n=>p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m6-02/'+n+'.png'});
 const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,800)});}};
 try {
  await run('已读仅确认本条；圈内为子集，不清对话/其他通知；重复点读不重复扣数',async()=>{
   await fresh('ready');await p.getByText('其中司机圈回复 1 条',{exact:true}).waitFor();await shot('component-notifications-390');await notice().click();await p.getByText('TEST · M6-02 · A · 打开1',{exact:true}).waitFor();await tab('通知，1条未读').waitFor();assert(await tab('对话，2条未读').count()===1,'chat unread unchanged');assert(await p.getByText('其中司机圈回复 1 条',{exact:true}).count()===0,'subset gone');await notice().click();await p.getByText('TEST · M6-02 · A · 打开2',{exact:true}).waitFor();await tab('通知，1条未读').waitFor();await tab(/对话/).click();await p.getByText('TEST 同行长名字',{exact:true}).waitFor();await shot('component-conversations-390');
  });
  await run('读通知失败保持未读；重试后才打开',async()=>{
   await fresh('retry');await notice().click();await p.getByText('TEST · 未能标记已读',{exact:true}).waitFor();assert(await tab('通知，2条未读').count()===1,'no optimistic clearing');assert(await p.getByText('TEST · M6-02 · A · 打开0',{exact:true}).count()===1,'not opened');await shot('component-read-retry-390');await notice().click();await p.getByText('TEST · M6-02 · A · 打开1',{exact:true}).waitFor();await tab('通知，1条未读').waitFor();
  });
  await run('已删除通知移除；权限失效不保留旧记录、不冒充空态',async()=>{
   await fresh('gone');await notice().click();await p.getByText('这条通知已不可查看',{exact:true}).waitFor();assert(await notice().count()===0,'deleted gone');await tab('对话，2条未读').waitFor();
   await fresh('denied');await notice().click();await p.getByText('TEST · 资格已失效',{exact:true}).waitFor();assert(await notice().count()===0,'denied clears');assert(await p.getByText('暂无通知',{exact:true}).count()===0,'error not empty');await button('重新加载').click();await p.getByText('TEST · 资格已失效',{exact:true}).waitFor();await shot('component-denied-390');
  });
  await run('慢列表切页、换账号：迟到结果不覆盖新页/新账号',async()=>{
   await fresh('slow');await tab(/^通知/).click();await notice().waitFor();await p.waitForTimeout(900);assert(await tab(/^通知/).getAttribute('aria-selected')==='true','tab preserved');assert(await p.getByText('TEST 同行长名字',{exact:true}).count()===0,'old rows absent');await button('切换 TEST 账号').click();await p.getByText('TEST · M6-02 · B · 打开0',{exact:true}).waitFor();assert(await notice().count()===0,'old notices absent immediately');await p.getByText('暂无对话',{exact:true}).waitFor();assert(await p.getByRole('tab',{name:/条未读/}).count()===0,'old counts absent');
  });
  await run('通知已读期间的迟到轮询不复活未读',async()=>{
   await fresh('poll-race');await notice().waitFor();await p.waitForTimeout(12100);await notice().click();await p.getByText('TEST · M6-02 · A · 打开1',{exact:true}).waitFor();await p.waitForTimeout(1000);assert(await tab('通知，1条未读').count()===1,'late poll cannot restore count');assert((await notice().getAttribute('aria-label'))==='你的司机圈动态有新回复','late poll cannot restore dot');
  });
  await run('加载错误可重试；320/390/430 真实组件不溢出',async()=>{
   await fresh('load-error');await p.getByText('TEST · 消息加载失败',{exact:true}).waitFor();assert(await p.getByText('暂无通知',{exact:true}).count()===0,'error distinct');await button('重新加载').click();await notice().waitFor();
   for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await fresh('ready');await notice().waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'message width');for(const t of await p.getByRole('tab').all()){const b=await t.boundingBox();assert(b.height>=48,'touch height');}await fresh('poster');await p.getByText('附近查码',{exact:true}).waitFor();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'invite width');await shot('component-invitation-'+width);}
  });
  await run('连续确认两条通知，先发后到的汇总不恢复旧未读',async()=>{
   await fresh('summary-race');await p.getByText('其中司机圈回复 2 条',{exact:true}).waitFor();await notice().first().click();await p.getByText('TEST · M6-02 · A · 打开1',{exact:true}).waitFor();await notice().nth(1).click();await p.getByText('TEST · M6-02 · A · 打开2',{exact:true}).waitFor();await p.waitForTimeout(1100);assert(await tab('通知，1条未读').count()===0,'earlier summary discarded');assert(await tab('通知').count()===1,'all notifications read');assert(await tab('对话，2条未读').count()===1,'conversation unaffected');assert(await p.getByText(/其中司机圈回复/).count()===0,'subset cleared');
  });
  await run('普通邀请页不开放复制/系统分享/下载，不产生资格或假统计',async()=>{
   await p.setViewportSize({width:390,height:844});await fresh('invite');await p.getByText('邀请分享暂未开放',{exact:true}).waitFor();for(const name of ['分享邀请','保存邀请图','复制文案与链接'])assert(await button(name).count()===0,'closed '+name);const text=await p.locator('body').innerText();assert(!/成功邀请\s*\d|累计奖励|加入团队/.test(text),'no growth claims');await shot('component-invitation-closed-390');
  });
  return {scope:'RN web / DEV in-memory only; not native acceptance',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
 } finally {await c.close();}
}
