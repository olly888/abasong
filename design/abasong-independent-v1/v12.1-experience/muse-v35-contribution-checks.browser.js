// Muse prototype only, all values synthetic; no business API or geolocation.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:390,height:844}}),p=await context.newPage(),checks=[],errors=[];
  p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));
  const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const fresh=async()=>{await p.goto('http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse#home');await p.waitForFunction(()=>document.body.classList.contains('muse-v35'));};
  const run=async(name,fn)=>{try{await fresh();await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',reason:e.message.slice(0,700)});}};
  const manual=()=>p.evaluate(()=>{state.logged=true;state.qualified=true;state.apt='a1';state.forms.code={targetId:'a1',value:'',scope:'',source:false};nav('code');});
  const shot=async name=>{await p.waitForFunction(()=>{const t=document.querySelector('#toast');return !t || (!t.classList.contains('show') && Number(getComputedStyle(t).opacity)===0);});await p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m5-02/'+name+'.png'});};
  try {
    await run('手填：同一门别三选、取消和重新确认、原公寓回程',async()=>{
      await manual();assert(await p.locator('[data-door]').count()===3,'three choices');await p.locator('[name=value]').fill('*0012#');await p.locator('[data-door=行人门]').click();await p.locator('[name=source]').check();await p.locator('[data-door=行人门]').click();
      assert(!(await p.locator('[name=source]').isChecked()),'reconfirm door');assert(await p.locator('[name=scope]').inputValue()==='','blank allowed');await shot('prototype-manual-390');
      await p.locator('[name=source]').check();await p.locator('#app .fixed-actions [type=submit]').click();assert(await p.evaluate(()=>state.apt==='a1'&&model.apartments[0].codes.some(c=>c.value==='*0012#'&&c.scope==='门别未注明')),'same apartment literal');
    });
    await run('纠正：固定地址、改码重确认、可清空门别',async()=>{
      await p.evaluate(()=>{state.logged=true;state.qualified=true;const c=model.apartments[0].codes[0];c.mine=true;c.status='active';c.scope='行人门';modal('library-correct',{id:c.id});});
      const form=p.locator('[data-submit=library-correct]');await form.locator('[name=code]').fill('#0008*');await form.locator('[name=source]').check();await form.locator('[name=code]').fill('#0010*');assert(!(await form.locator('[name=source]').isChecked()),'changed code reconfirm');await form.locator('[data-door=行人门]').click();await form.locator('[name=source]').check();await shot('prototype-correction-390');await form.locator('[type=submit]').click();
      assert(await p.evaluate(()=>model.apartments[0].codes.some(c=>c.value==='#0010*'&&c.scope==='门别未注明'&&c.mine)),'corrected literal');
    });
    await run('截图：独立地址卡、核对后重新选择、明确共享确认',async()=>{
      await p.evaluate(()=>document.querySelector('[data-import-lab=mixed]').click());await p.locator('.m35-import-record').first().waitFor();
      const card=p.locator('.m35-import-record').filter({has:p.locator('[data-import-check]')}).first();await card.locator('[data-action=import-edit]').click();await p.locator('[data-submit=import-edit] [name=code]').fill('*0007#');assert(await p.locator('[data-door]').count()===3,'three edit choices');await p.getByRole('button',{name:'完成核对',exact:true}).click();
      const changed=p.locator('.m35-import-record').filter({hasText:'*0007#'});assert(!(await changed.locator('[data-import-check]').isChecked()),'reselect changed row');assert(!(await p.locator('[data-import-consent]').isChecked()),'reconfirm source');await shot('prototype-import-390');
    });
    await run('320/390/430：门禁输入层级与三选门别不溢出',async()=>{
      for(const width of [320,390,430]){await p.setViewportSize({width,height:844});await manual();const input=p.locator('[name=value]');assert(await input.evaluate(n=>parseFloat(getComputedStyle(n).fontSize))===24,'code scale');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow');for(const b of await p.locator('[data-door]').all()){const x=await b.boundingBox();assert(x.x>=0&&x.x+x.width<=width,'door fits');}}
    });
    return {scope:'HTML prototype synthetic only',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,errors};
  } finally { await context.close(); }
}
