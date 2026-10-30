'use strict';
// Synthetic personal library: memory only. No real code storage, analytics or API.
(() => {
  let tab='saved', region='all', saved=[], editTarget=null;
  const regionOf=id=>id==='a3'?'Mid-City':['a1','a2'].includes(id)?'Koreatown':'未分类';
  const apt=id=>model.apartments.find(a=>a.id===id);
  const entries=()=>model.apartments.flatMap(a=>a.codes.filter(c=>c.mine||c.validatedByMe).map(c=>({a,c})));
  const frame=(title,body,footer='')=>`<div class="root-content import-page library-page"><div class="page-scroll">${header(title)}${body}</div>${footer?`<div class="import-actions">${footer}</div>`:''}</div>`;
  const act=(a,label,cls='button',id='')=>btn('lib-'+a,label,cls,id?`data-id="${esc(id)}"`:'');
  const getEntry=id=>saved.find(e=>e.id===id);
  function keep(aid,address,name){
    let e=saved.find(e=>aid?e.apt===aid:e.address===address);
    if(!e){e={id:uid(),apt:aid||null,name:name||apt(aid)?.name||'我的公寓',address:address||apt(aid)?.address||'',region:regionOf(aid),favorite:true,records:[]};saved.unshift(e);}return e;
  }
  function saveImport(r){const e=keep(r.apt,r.address,r.name);if(!e.records.some(p=>p.value===r.code&&p.scope===r.scope))e.records.push({id:uid(),value:r.code,scope:r.scope||'大门',note:'',when:'刚刚保存'});return e;}
  function seed(){
    saved=[];tab='saved';region='all';
    const a=keep('a1');a.records.push({id:'private-demo',value:'0017#',scope:'行人门',note:'常跑线路的自用记录',when:'10月29日保存'});keep('a2');
    if(!apt('a1').codes.some(c=>c.id==='library-example'))apt('a1').codes.push({id:'library-example',value:'0632#',scope:'侧门',time:3,when:'10月28日贡献',author:model.profile.name,helpful:true,mine:true,vote:null,status:'active',stats:{views:12,useful:2,notUseful:1,last:'10月29日'},otherContributors:true});
  }
  seed();
  function loggedOut(){return frame('我的公寓',empty('登录后管理我的公寓',''),act('login','登录'));}
  function list(){
    if(!state.logged)return loggedOut();
    const selected=saved.filter(e=>region==='all'||e.region===region);
    const shares=entries();
    const batches=window.abasongImports.list();
    return frame('我的公寓',`<div class="library-tabs" role="tablist" aria-label="我的公寓分类">${btn('lib-tab','我保存的','library-tab '+(tab==='saved'?'active':''),'data-id="saved" role="tab" aria-selected="'+(tab==='saved')+'"')}${btn('lib-tab','我共享的','library-tab '+(tab==='shared'?'active':''),'data-id="shared" role="tab" aria-selected="'+(tab==='shared')+'"')}</div>${tab==='saved'?`<label class="library-region">区域<select aria-label="筛选保存的公寓区域" data-library-region><option value="all">全部区域</option>${[...new Set(saved.map(e=>e.region))].map(r=>`<option ${r===region?'selected':''}>${esc(r)}</option>`).join('')}</select></label>${selected.length?selected.map(e=>`<button class="library-card" data-action="lib-detail" data-id="${e.id}"><span><b>${esc(e.name)}</b><small>${esc(e.address)}</small><span class="library-tags"><i>${esc(e.region)}</i><i>${e.records.length?'私人记录 '+e.records.length+' 条':'已收藏'}</i></span></span>${I('chevron')}</button>`).join(''):empty('这个区域还没有公寓','可以收藏地图中的公寓，或添加自己的资料。')}`:`<p class="library-caption">反馈按记录展示；被查看不等于成功进入。</p>${shares.length?shares.map(({a,c})=>sharedCard(a,c)).join(''):empty('还没有共享记录','私存资料可在确认后主动共享。')}`}${batches.length?`<h2 class="import-section">导入记录</h2>${batches.map(j=>`<button class="import-batch" data-action="lib-batch" data-id="${j.id}"><span><b>截图导入 · ${esc(j.created)}</b><small>${j.status==='processing'?'正在整理':j.status==='submitting'?'正在保存':j.status==='cancelled'?'已取消':`${j.done} 条已处理 · ${j.pending} 条待处理`}</small></span>${I('chevron')}</button>`).join('')}`:''}`,act('import','从截图添加')+act('new','手动添加','button secondary'));
  }
  function sharedCard(a,c){
    const stats=c.stats||{views:0,useful:0,notUseful:0,last:null};
    const status=c.myWithdrawn?'本人已撤回':c.myCorrected?'本人已纠正 · 原记录待复核':c.status==='withdrawn'?'本人已撤回':c.status==='pending'?'待审核':c.status==='invalid'?'已失效':c.mine?'我的共享':'同码贡献';
    return `<article class="library-shared"><span class="import-badge">${status}</span><h2>${esc(a.name)}</h2><div class="address">${esc(a.address)}</div>${state.qualified&&c.status==='active'?`<div class="import-code">${esc(c.value)}</div><div class="caption">${esc(c.scope)} · ${esc(c.when)}</div>`:`<p class="library-caption">${esc(c.when)}</p>`}<div class="library-feedback"><span><b>${stats.views}</b>被其他司机查看</span><span><b>${stats.useful}</b>有用反馈</span><span><b>${stats.notUseful}</b>不能用</span></div><p class="caption">${stats.last?'最近反馈：'+esc(stats.last):'暂无反馈'}</p><div class="library-inline">${act('public','查看公寓','text-btn',a.id)}${!c.myCorrected&&!c.myWithdrawn&&c.status==='active'&&state.qualified?act('correct','纠正密码','text-btn',c.id):''}${c.mine&&!c.myCorrected&&!c.myWithdrawn&&c.status==='active'?act('withdraw','撤回本人贡献','text-btn danger',c.id):''}</div></article>`;
  }
  function detail(){
    if(!state.logged)return loggedOut();const e=getEntry(state.route.args.id);if(!e)return frame('我的公寓',empty('这条记录已移除',''),act('list','返回我的公寓'));
    const a=apt(e.apt),shared=a?rankCodes(a):[];
    return frame(e.name,`<div class="library-address"><p>${esc(e.address)}</p><span class="import-badge">${esc(e.region)}</span>${act('region','设置区域','text-btn',e.id)}</div><section class="library-section"><div class="library-section-head"><h2>我的记录</h2><span>仅自己可见</span></div>${e.records.length?e.records.map(r=>`<article class="library-private"><div class="import-code">${esc(r.value)}</div><div class="caption">${esc(r.scope)} · ${esc(r.when)}</div>${r.note?`<p>${esc(r.note)}</p>`:''}<div class="library-inline">${act('edit-private','修改','text-btn',r.id)}${state.qualified?act('share','共享这条','text-btn',r.id):'<span class="caption">共享资格待核验</span>'}${act('delete-private','删除私存','text-btn danger',r.id)}</div></article>`).join(''):empty('还没有私人记录','')} ${act('new-private','添加私人记录','button secondary',e.id)}</section><section class="library-section"><div class="library-section-head"><h2>共享资料</h2><span>随资料库更新</span></div>${!state.qualified?'<p class="library-caption">资料查看资格待审核</p>':shared.length?shared.map(c=>`<article class="library-public"><div class="import-code">${esc(c.value)}</div><div class="caption">${esc(c.scope)} · ${esc(c.when)}</div>${c.helpful?'<span class="import-badge">有用反馈</span>':''}</article>`).join(''):empty('暂无共享资料','你的私人记录不会自动共享。')}</section>${act('remove-apartment','移除我的公寓','text-btn danger',e.id)}`,a?act('public','在地图查看','button',a.id):act('list','返回我的公寓'));
  }
  function findPrivate(id){for(const e of saved){const r=e.records.find(r=>r.id===id);if(r)return{e,r};}return null;}
  function openPrivate(eid,rid){editTarget={e:eid?getEntry(eid):null,r:rid?findPrivate(rid)?.r:null};modal('library-private',{title:rid?'修改私人记录':'添加私人记录'});}
  const baseModal=renderModal;
  renderModal=function(){const m=state.modal;
    if(m?.type==='library-region'){const e=getEntry(m.id);$('#overlay').innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="设置区域"><div class="close-row"><h2>设置区域</h2>${ib('close-modal','close','关闭')}</div><form data-submit="library-region"><label class="field"><span class="field-label">区域名称</span><input name="region" value="${esc(e?.region||'')}" maxlength="60" required></label><button class="button" type="submit">保存区域</button></form></section>`;return;}
    if(m?.type==='library-private'){
      const e=editTarget?.e,r=editTarget?.r;
      $('#overlay').innerHTML=`<section class="dialog library-dialog" role="dialog" aria-modal="true" aria-label="${r?'修改私人记录':'添加私人记录'}"><div class="close-row"><h2>${r?'修改私人记录':'添加私人记录'}</h2>${ib('close-modal','close','关闭')}</div><form data-submit="library-private">${!e?`<label class="field"><span class="field-label">公寓</span><select name="apt" required>${model.apartments.map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.address)}</option>`).join('')}<option value="new">添加尚未收录的公寓</option></select></label><div data-library-new hidden><label class="field"><span class="field-label">英文地址</span><input name="address" maxlength="300"></label><label class="field"><span class="field-label">公寓名称（选填）</span><input name="apartmentName" maxlength="160"></label></div>`:`<p class="address">${esc(e.address)}</p>`}<label class="field"><span class="field-label">密码</span><input name="code" value="${esc(r?.value||'')}" maxlength="32" autocomplete="off" required></label><label class="field"><span class="field-label">门别</span><input name="scope" value="${esc(r?.scope||'大门')}" maxlength="100"></label><label class="field"><span class="field-label">私人备注</span><textarea name="note" maxlength="300">${esc(r?.note||'')}</textarea></label><button class="button" type="submit">仅保存到我的公寓</button></form></section>`;return;
    }
    if(m?.type==='library-correct'){
      const pair=entries().find(x=>x.c.id===m.id);if(!pair){state.modal=null;baseModal();return;}
      $('#overlay').innerHTML=`<section class="dialog library-dialog" role="dialog" aria-modal="true" aria-label="纠正密码"><div class="close-row"><h2>纠正密码</h2>${ib('close-modal','close','关闭')}</div><p class="address">${esc(pair.a.address)} · ${esc(pair.c.scope)}</p><p class="library-caption">提交正确密码，保留原贡献与反馈历史。</p><form data-submit="library-correct"><label class="field"><span class="field-label">正确密码</span><input name="code" maxlength="32" autocomplete="off" required></label><label class="check-row"><input type="checkbox" name="source" required><span>我已核对，并有权共享这条资料</span></label><button class="button" type="submit">确认纠正并共享</button></form></section>`;return;
    }
    baseModal();
  };
  const baseRender=render;
  render=function(){
    if(state.route.view==='contributions'||state.route.view==='notebook'){
      history.replaceState({abPrototype:true,route:structuredClone(state.route),stack:structuredClone(state.stack)},'',location.pathname+location.search+'#'+state.route.view);
      $('#app').innerHTML=state.route.view==='contributions'?list():detail();$('#screen-title').textContent=state.route.view==='contributions'?'我的公寓':'公寓详情与我的记录';$('#screen-id').textContent=state.route.view==='contributions'?'U06':'U09';renderModal();return;
    }
    baseRender();
    if(state.route.view==='me'&&state.logged){const old=$('[data-action="import-open"]');if(old)old.remove();const entry=$('[data-action="contributions"]');if(entry)entry.outerHTML=menu('我的公寓','','lib-list');}
    if(state.route.view==='home'&&state.homeView==='apartments'){
      const a=getApt(),found=saved.some(e=>e.apt===a.id);$('#sheet-scroll')?.insertAdjacentHTML('beforeend',`<div class="library-inline">${act('favorite',found?'已收藏':'收藏公寓','text-btn',a.id)}${act('list','我的公寓','text-btn')}</div>`);
    }
  };
  const baseActions=actions;
  actions=function(a,b){if(!a.startsWith('lib-')){baseActions(a,b);return;}const action=a.slice(4),id=b?.dataset.id;
    if(!state.logged){beginAuth(()=>nav('contributions'));return;}
    switch(action){
      case'login':beginAuth(()=>nav('contributions'));break;
      case'list':nav('contributions');break;
      case'tab':tab=id;render();break;
      case'detail':nav('notebook',{id});break;
      case'import':window.abasongImports.open();break;
      case'batch':window.abasongImports.resume(id);break;
      case'new':openPrivate(null,null);break;
      case'region':modal('library-region',{id});break;
      case'new-private':openPrivate(id,null);break;
      case'edit-private':{const p=findPrivate(id);if(p)openPrivate(p.e.id,id);break;}
      case'delete-private':confirmAction('删除私人记录？','只删除我的私存，共享资料保留。',()=>{const p=findPrivate(id);if(p)p.e.records=p.e.records.filter(r=>r.id!==id);closeModal();render();},true);break;
      case'remove-apartment':confirmAction('移除我的公寓？','移除本人的收藏与私人记录，共享资料保留。',()=>{saved=saved.filter(e=>e.id!==id);closeModal();nav('contributions',{},true);},true);break;
      case'favorite':if(saved.some(e=>e.apt===id)){toast('已保存在我的公寓');nav('notebook',{id:saved.find(e=>e.apt===id).id});}else{keep(id);toast('已收藏公寓');render();}break;
      case'public':state.apt=id;state.homeView='apartments';state.expanded=true;nav('home');break;
      case'share':{const p=findPrivate(id);if(!p||!state.qualified){toast('共享资格待核验');return;}confirmAction('共享这条资料？','共享给有资格的司机；私人备注不会共享。',()=>{if(!state.qualified||!state.logged)return;const a=apt(p.e.apt);if(!a){toast('公寓尚未收录，需先核对地址');closeModal();return;}let c=a.codes.find(c=>c.status==='active'&&c.value===p.r.value&&c.scope===p.r.scope);if(c)c.validatedByMe=true;else{c={id:uid(),value:p.r.value,scope:p.r.scope,time:2000,when:'刚刚贡献 · 实测日期未知',author:model.profile.name,mine:true,helpful:false,vote:null,status:'active'};a.codes.push(c);}closeModal();tab='shared';nav('contributions');toast('已提交共享');});break;}
      case'correct':if(state.qualified&&entries().some(x=>x.c.id===id))modal('library-correct',{id});break;
      case'withdraw':confirmAction('撤回本人贡献？','保留历史，不删除其他司机的贡献或反馈。',()=>{const p=entries().find(x=>x.c.id===id);if(p){p.c.myWithdrawn=true;if(!p.c.otherContributors)p.c.status='withdrawn';}closeModal();render();},true);break;
    }
  };
  document.addEventListener('change',e=>{if(e.target.closest('[data-submit="library-private"]')&&e.target.name==='apt'){const box=$('[data-library-new]');if(box){box.hidden=e.target.value!=='new';box.querySelector('input[name="address"]').required=!box.hidden;}}if(e.target.matches('[data-library-region]')){region=e.target.value;render();}});
  document.addEventListener('submit',e=>{const type=e.target.dataset.submit;if(!['library-private','library-correct','library-region'].includes(type))return;e.preventDefault();if(!state.logged)return;const fd=new FormData(e.target);if(type==='library-region'){const e=getEntry(state.modal.id);const name=String(fd.get('region')||'').trim();if(e&&name)e.region=name;region='all';closeModal();render();return;}const value=String(fd.get('code')||'').trim();if(!value)return;
    if(type==='library-private'){
      const aid=String(fd.get('apt')||'');const addr=String(fd.get('address')||'').trim();if(!editTarget?.e&&aid==='new'&&!addr)return;const entry=editTarget?.e||keep(aid==='new'?null:aid,addr,String(fd.get('apartmentName')||'').trim());const record=editTarget?.r;const scope=String(fd.get('scope')||'').trim()||'大门',note=String(fd.get('note')||'').trim();
      if(record)Object.assign(record,{value,scope,note,when:'刚刚修改'});else if(!entry.records.some(r=>r.value===value&&r.scope===scope))entry.records.push({id:uid(),value,scope,note,when:'刚刚保存'});
      closeModal();nav('notebook',{id:entry.id},true);toast('已仅自己保存');return;
    }
    if(!state.qualified||!fd.get('source'))return;const p=entries().find(x=>x.c.id===state.modal?.id);if(!p)return;
    if(value===p.c.value){toast('新密码与原记录相同');return;}
    p.c.myCorrected=true;if(!p.c.otherContributors)p.c.status='withdrawn';else p.c.reportedIncorrect=true;
    let next=p.a.codes.find(c=>c.status==='active'&&c.value===value&&c.scope===p.c.scope);
    if(next)next.validatedByMe=true;else p.a.codes.push({id:uid(),value,scope:p.c.scope,time:3000,when:'刚刚纠正 · 实测日期未知',author:model.profile.name,mine:true,helpful:false,vote:null,status:'active'});
    closeModal();render();toast('已提交纠正，原历史保留');
  });
  const baseReset=resetPrototype;resetPrototype=function(){baseReset();seed();render();};
  window.apartmentLibrary={saveImport};
  screens.contributions=['U06','我的公寓'];screens.notebook=['U09','公寓详情与我的记录'];
  const option=document.createElement('option');option.value='notebook';option.textContent='U09 · 公寓详情与我的记录';$('#inspect-page').append(option);
  const existing=$('#inspect-page option[value="contributions"]');if(existing)existing.textContent='U06 · 我的公寓';
  if(new URLSearchParams(location.search).get('flow')==='library'){state.route={view:'contributions',args:{}};state.stack=[];}
  render();
})();
