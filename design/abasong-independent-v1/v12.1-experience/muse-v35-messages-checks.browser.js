// Synthetic prototype only, no real notification acknowledgement or external share.
async (page) => {
 const c=await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage(),checks=[],errors=[];
 p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));
 const assert=(v,m)=>{if(!v)throw Error(m);},action=a=>p.locator('#app [data-action="'+a+'"]').first();
 const fresh=async view=>{await p.goto('http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse');await p.waitForFunction(()=>document.body.classList.contains('muse-v35'));await p.evaluate(v=>{state.logged=true;nav(v);},view);};
 const shot=async n=>p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m6-02/'+n+'.png'});
 const run=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,700)});}};
 try {
  await run('统一消息分类与未读；阅读通知不清对话',async()=>{
   await fresh('inbox');await p.evaluate(()=>{model.notifications.push({id:'TEST-circle',kind:'circle_reply',title:'TEST 圈内回复',sub:'TEST 同行',apt:'a1',read:false});render();});await p.getByRole('tab',{name:/^通知/}).click();await p.getByText('其中司机圈回复 1 条',{exact:true}).waitFor();await shot('prototype-notifications-390');const before=await p.evaluate(()=>model.chats[0].unread);await p.locator('[data-action=notice][data-id=TEST-circle]').click();assert(await p.evaluate(()=>model.chats[0].unread)===before,'chat remains unread');await p.evaluate(()=>nav('inbox'));assert(await p.getByText('其中司机圈回复 1 条',{exact:true}).count()===0,'only circle reply read');
  });
  await run('邀请分享取消无成功统计；接收邀请不自动增权',async()=>{
   await fresh('invite');await p.evaluate(()=>{state.qualified=false;});await action('invite-share').click();await p.getByRole('dialog',{name:'分享预览'}).waitFor();await p.locator('#overlay [data-action=close-modal]').first().click();assert(!(await p.locator('#app').innerText()).includes('邀请成功'),'no success');assert(await p.evaluate(()=>state.qualified)===false,'share no qualification');await action('invite-share').click();await p.locator('#overlay [data-action=invite-preview]').click();assert(await p.evaluate(()=>state.qualified)===false,'receiver no qualification');await shot('prototype-receiver-390');
  });
  await run('320/390/430 消息与邀请的层次、触控和宽度',async()=>{
   for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await fresh('inbox');for(const t of await p.getByRole('tab').all()){const b=await t.boundingBox();assert(b.height>=48,'tab touch target');assert(b.width>=(width-60)/2,'segmented tabs fill equal halves');}assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'inbox overflow');await fresh('invite');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'invite overflow');await shot('prototype-invitation-'+width);}
  });
  return {scope:'HTML prototype synthetic only',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
 } finally {await c.close();}
}
