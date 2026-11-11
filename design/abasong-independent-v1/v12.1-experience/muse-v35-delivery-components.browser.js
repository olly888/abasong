// Actual React Native components on Expo web, using the DEV-only memory transport.
// This is not native iOS/Android gesture or compilation acceptance.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p = await context.newPage(); p.setDefaultTimeout(5000);
  const checks = [], errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const button = name => p.getByRole('button',{name,exact:true});
  const fresh = async scene => {
    await p.goto('http://127.0.0.1:8081/delivery-lab?scene='+encodeURIComponent(scene));
    await p.getByText('TEST · '+scene+' · 仅内存',{exact:true}).or(p.getByText('TEST · '+scene+' · 仅内存，不发布',{exact:true})).waitFor();
    // A pre-existing development-only warning toast can cover the footer.
    const dismiss = p.locator('button[class*=dismissButton]');
    if(await dismiss.count()) await dismiss.first().click({timeout:500}).catch(()=>{});
  };
  const run = async(name, fn) => { try { await fn(); checks.push({name,status:'PASS'}); } catch(e) { checks.push({name,status:'FAIL',reason:e.message.slice(0,1000)}); } };
  const shot = name => p.screenshot({path:'/Users/olly/Abasong/artifacts/muse-m5-01/'+name+'.png'});
  try {
    await run('实际组件：390宽详情摘要、完整取件地址和地图工具',async()=>{
      await fresh('仓库详情');
      const text=await p.locator('body').innerText();
      assert(text.indexOf('$1.85/件')<text.indexOf('取件与派送'),'terms before location');
      assert(text.includes('2445 E Del Mar Blvd, Pasadena, CA 91107'),'full address');
      assert(await p.getByRole('button',{name:/^查看仓库地图/}).count()===1,'warehouse map');
      for(const name of ['复制地址','导航']) assert(await button(name).count()===1,name);
      await shot('component-detail-390');
    });
    await run('实际组件：报名先核对地址再填写，错误滚动到件数字段',async()=>{
      await button('报名接活').click();
      const text=await p.locator('body').innerText();
      assert(text.lastIndexOf('2445 E Del Mar Blvd')<text.lastIndexOf('本次可接活'),'address precedes fields');
      const capacity=p.getByRole('textbox',{name:'本次可接件数（选填）',exact:true});
      await capacity.fill('0'); await button('提交报名').click();
      await p.getByText('请填写本次可接件数的正整数',{exact:true}).waitFor();
      await p.waitForFunction(()=>{const n=document.querySelector('input[aria-label="本次可接件数（选填）"]');const b=n?.getBoundingClientRect();return b&&b.y>0&&b.bottom<750;});
      await shot('component-application-error-390');
      await capacity.fill(''); await button('提交报名').click();
      await p.getByText('TEST · TEST · 报名成功，进入联系 · 仅内存',{exact:true}).waitFor();
    });
    await run('实际组件：未知件数可留空，失败保留并重试',async()=>{
      await fresh('报名重试');
      const input=p.getByRole('textbox',{name:'本次可接件数（选填）',exact:true});
      assert(await input.inputValue()==='','unknown remains empty');
      await button('提交报名').click();
      await p.getByText('TEST · 报名未送出，请重试',{exact:true}).waitFor();
      assert(await input.inputValue()==='','failure keeps empty capacity');
      await shot('component-application-retry-390');
      await button('重试报名').click();
      await p.getByText('TEST · TEST · 报名成功，进入联系 · 仅内存',{exact:true}).waitFor();
    });
    await run('实际组件：核对摘要顺序与返回修改不丢输入',async()=>{
      await fresh('保存重试'); await button('核对需求').click();
      const text=await p.locator('body').innerText();
      assert(text.indexOf('任务量与报价')<text.indexOf('取件与派送')&&text.indexOf('发布身份')>text.indexOf('接手要求'),'review order');
      await shot('component-review-390');
      await button('修改任务量与报价').click();
      assert(await p.getByRole('textbox',{name:'报价 · USD / 件',exact:true}).inputValue()==='1.85','quote preserved');
      await button('核对需求').click(); await button('确认发布').click();
      await p.getByText('TEST · 保存失败，填写内容已保留',{exact:true}).waitFor();
      assert((await p.locator('body').innerText()).includes('$1.85/件'),'failed review preserved');
      await button('确认发布').click();
      await p.getByText('TEST · TEST · 发布成功 · 仅内存',{exact:true}).waitFor();
    });
    await run('实际组件：版本冲突锁住旧条件并提供重新读取',async()=>{
      await fresh('版本变化');await button('核对需求').click();await button('确认发布').click();
      await button('重新读取当前需求').waitFor();
      assert(!(await button('确认发布').count()),'stale submit unavailable');
    });
    await run('实际组件：320/390/430长地址及大金额不横向溢出',async()=>{
      for(const width of [320,390,430]){
        await p.setViewportSize({width,height:844});await fresh('长地址');
        assert(await p.locator('body').evaluate(n=>n.scrollWidth<=innerWidth+1),'body overflow '+width);
        const address=p.getByText('100 TEST Very Long Warehouse Boulevard Building Three, TEST City With A Long Name, CA 91107',{exact:true});
        const b=await address.boundingBox();assert(b&&b.x>=0&&b.x+b.width<=width+1,'address fits '+width);
        await shot('component-long-address-'+width);
      }
    });
    return {checks,errors,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length};
  } finally {await context.close();}
}
