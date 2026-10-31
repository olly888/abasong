'use strict';
// Synthetic interaction extension. No image upload, OCR, real access code or cloud request.
(() => {
  const fixtures = [
    { id:'s1', title:'Westline · 行人门', lines:['Westline Apartments','1200 W Pine Ave, Los Angeles, CA','Pedestrian gate: 0017#'], rows:[{apt:'a1',code:'0017#',scope:'行人门',status:'ready'}] },
    { id:'s2', title:'Westline · 已有资料', lines:['Westline Apartments','1200 W Pine Ave, Los Angeles, CA','Pedestrian gate: 1268#'], rows:[{apt:'a1',code:'1268#',scope:'行人门',status:'ready'}] },
    { id:'s3', title:'Palm Court · 字符待确认', lines:['Palm Court','1228 W Pine Ave, Los Angeles, CA','Main gate: #74I2'], rows:[{apt:'a2',code:'#74I2',scope:'大门',status:'needs_review',reason:'请确认 I 是字母还是数字'}] },
    { id:'s4', title:'Olive House · 地址不完整', lines:['Olive House','Side gate: *0390','Building address unavailable'], rows:[{apt:null,code:'*0390',scope:'侧门',status:'needs_review',reason:'请选择所属公寓'}] },
    { id:'s5', title:'两处公寓资料', lines:['1200 W Pine Ave, Los Angeles, CA','Pedestrian gate: 0146#','1228 W Pine Ave, Los Angeles, CA','Side gate: *1020'], rows:[{apt:'a1',code:'0146#',scope:'行人门',status:'ready'},{apt:'a2',code:'*1020',scope:'侧门',status:'ready'}] },
    { id:'s6', title:'新公寓 · 尚未收录', lines:['Cedar Flats','1610 W Cedar Ave, Los Angeles, CA','Main gate: 0073*'], rows:[{apt:null,address:'1610 W Cedar Ave, Los Angeles, CA',name:'Cedar Flats',code:'0073*',scope:'大门',status:'needs_review',reason:'尚未匹配到公寓'}] },
  ];
  let jobs=[], selected=new Set(), gallery=false, current=null, serial=0, editing=null, editDraft=null, entryIntent='share', adding=false;
  const finished=new Set(['submitted','duplicate','pending','saved_private']);
  const statusText={ready:'已匹配',needs_review:'待处理',submitted:'已贡献',duplicate:'已有相同记录',pending:'待审核',failed:'保存失败',saved_private:'仅自己保存',removed:'已移除'};
  const source=id=>fixtures.find(f=>f.id===id);
  const apartment=id=>model.apartments.find(a=>a.id===id);
  const batch=()=>jobs.find(j=>j.id===current);
  const blocked=()=>!state.logged;
  const control=(action,label,extra='')=>btn('import-'+action,label,'button',extra);
  const secondary=(action,label,extra='')=>btn('import-'+action,label,'button secondary',extra);
  const attr=id=>`data-id="${esc(id)}"`;
  const getRow=id=>batch()?.rows.find(r=>r.id===id);
  function frame(title,body,footer='',extra='') {
    return `<div class="root-content import-page"><div class="page-scroll">${header(title,extra)}${body}</div>${footer?`<div class="import-actions">${footer}</div>`:''}</div>`;
  }
  function gate() {
    return frame('贡献公寓资料',empty(state.logged?'贡献资格待核验':'请先登录',''),control(state.logged?'home':'login',state.logged?'返回首页':'登录'));
  }
  function open(intent='share') {
    if(!state.logged){beginAuth(()=>open(intent));return;}
    adding=false;entryIntent=intent==='private'?'private':'share';selected=new Set();gallery=false;editing=null;nav('importUpload');
  }
  function uploadPage() {
    if(blocked())return gate();
    if(gallery)return frame('选择截图',`<div class="import-grid">${fixtures.map(f=>`<button class="import-photo ${selected.has(f.id)?'selected':''}" data-action="import-select" ${attr(f.id)} aria-label="选择${esc(f.title)}" aria-pressed="${selected.has(f.id)}"><img src="samples/${f.id}.svg" alt="${esc(f.title)}"><span class="photo-check">${selected.has(f.id)?I('check'):''}</span><span class="photo-title">${esc(f.title)}</span></button>`).join('')}</div>`,control('chosen',`添加 ${selected.size} 张`,selected.size?'':'disabled'));
    return frame('从截图添加',`${selected.size?`<div class="import-count"><b>已选 ${selected.size} 张</b>${btn('import-gallery','继续添加','text-btn')}</div><div class="import-grid">${[...selected].map(id=>`<article class="import-photo"><img src="samples/${id}.svg" alt="${esc(source(id).title)}">${ib('import-remove-source','close','移除'+source(id).title,attr(id))}</article>`).join('')}</div>`:'<p class="import-empty">添加公寓地址和密码截图</p>'}`,control(selected.size?'recognize':'gallery',selected.size?`识别 ${selected.size} 张截图`:'选择截图'));

  }
  function address(r){return apartment(r.apt)?.address||r.address||'尚未确认地址';}
  function item(r) {
    const editable=!finished.has(r.status)&&r.status!=='removed';
    return `<article class="import-row ${r.status==='needs_review'?'attention':''}" data-import-row="${r.id}"><div class="import-row-head">${r.status==='ready'?`<input type="checkbox" data-import-check="${r.id}" aria-label="提交${esc(address(r))} ${esc(r.scope)} ${esc(r.code)}" ${r.selected?'checked':''}>`:I(r.status==='needs_review'?'warning':'check')}<div class="import-row-main"><b>${esc(apartment(r.apt)?.name||r.name||'公寓待确认')}</b><div class="address">${esc(address(r))}</div></div><span class="import-badge ${r.status==='needs_review'||r.status==='failed'?'warning':''}">${r.propose&&r.status==='ready'?'公寓提议':statusText[r.status]}</span></div><div class="import-code">${esc(r.code)}</div><div class="caption">${esc(r.scope||'大门')}</div>${r.reason&&!finished.has(r.status)?`<p class="import-issue">${esc(r.reason)}</p>`:''}<div class="import-row-actions">${editable?btn('import-edit','编辑','text-btn',attr(r.id)):''}</div></article>`;
  }
  function editor(original) {
    const r=editDraft||original;
    return `<form class="import-editor" data-submit="import-edit">${btn('import-preview','查看截图','text-btn',attr(r.source))}<label class="field"><span class="field-label">所属公寓</span><select name="apt"><option value="">选择公寓</option>${model.apartments.map(a=>`<option value="${a.id}" ${r.apt===a.id?'selected':''}>${esc(a.name)} · ${esc(a.address)}</option>`).join('')}<option value="new" ${r.propose?'selected':''}>提交尚未收录的公寓</option></select></label><label class="field"><span class="field-label">未收录公寓的英文地址</span><input name="address" value="${esc(r.address||'')}" maxlength="300" placeholder="选择已有公寓时无需填写"></label><label class="field"><span class="field-label">密码</span><input name="code" value="${esc(r.code)}" maxlength="32" autocomplete="off" spellcheck="false"></label><label class="field"><span class="field-label">适用门别</span><input name="scope" value="${esc(r.scope)}" maxlength="100"></label>${state.errors.import?`<p class="error" role="alert">${esc(state.errors.import)}</p>`:''}<div class="import-editor-actions"><button class="button" type="submit">确认修改</button>${secondary('cancel-edit','取消修改')}${btn('import-remove-row','移除这条资料','text-btn danger',attr(r.id))}</div></form>`;
  }
  function reviewPage() {
    if(blocked())return gate();const j=batch();if(!j)return frame('识别结果',empty('暂无待确认资料',''),secondary('open','选择截图'));
    if(editing&&getRow(editing))return frame('编辑资料',editor(getRow(editing)));
    const ready=j.rows.filter(r=>r.status==='ready'), pending=j.rows.filter(r=>r.status==='needs_review'||r.status==='failed');
    const n=ready.filter(r=>r.selected).length;
    return frame('确认识别结果',`${j.paused?secondary('resume-recognize','继续识别剩余截图'):''}<div class="import-summary">${ready.length+pending.length} 条资料 · 已选 ${n} 条</div>${ready.map(item).join('')}${pending.length?`<h2 class="import-section">需要补充 ${pending.length}</h2>${pending.map(item).join('')}`:''}${!ready.length&&!pending.length?empty('没有待确认资料',''):''}${j.failedSources.length?`<div class="flat-card"><b>${j.failedSources.length} 张未识别成功</b>${secondary('retry-ocr','重试这些截图')}</div>`:''}`,`<button class="import-scope-summary" data-action="import-scope-menu" ${j.modeLocked?'disabled':''}><span>保存方式</span><b>${j.share?'共享并保存':'仅自己保存'}</b>${j.modeLocked?'':'<em>更改</em>'}</button>${j.share&&!state.qualified?'<p class="error">共享资格待核验</p>':''}${n?`<label class="check-row import-consent"><input type="checkbox" data-import-consent ${j.confirmed?'checked':''}><span>我已核对，并有权${j.share?'共享':'保存'}所选资料</span></label>`:''}${control('submit',`${j.share?'确认共享':'确认保存'} ${n} 条`,n&&j.confirmed&&(!j.share||state.qualified)?'':'disabled')}`,j.modeLocked?'':ib('import-more','more','更多操作'));
  }
  function resultPage() {
    if(blocked())return gate();const j=batch();if(!j)return frame('导入记录',empty('还没有导入记录',''),control('open','选择截图'));
    if(j.status==='processing'||j.status==='submitting')return frame(j.status==='processing'?'正在整理截图':'正在提交',`<div class="import-working"><span class="import-spinner"></span><h2>${j.status==='processing'?'正在匹配公寓':'保存已确认的资料'}</h2><p>${j.sources.length} 张截图</p></div>`,j.status==='processing'?secondary('pause','停止识别'):'');
    if(j.status==='cancelled')return frame('导入已取消',empty('未提交的资料已清除','已贡献记录不受影响。'),control('open','重新选择截图'));
    const count=s=>j.rows.filter(r=>r.status===s).length;
    const needs=j.rows.filter(r=>['needs_review','ready','failed'].includes(r.status)).length;
    const visible=j.rows.filter(r=>r.status!=='removed');
    return frame('导入结果',`<div class="import-result-title">${I(needs||j.failedSources.length?'clock':'check')}<h2>${needs||j.failedSources.length?'还有资料待处理':'本批资料已处理'}</h2></div><div class="import-metrics"><div><b>${count('submitted')}</b><span>已贡献</span></div><div><b>${count('saved_private')}</b><span>仅自己保存</span></div><div><b>${count('duplicate')}</b><span>相同记录</span></div><div><b>${count('pending')}</b><span>待审核</span></div><div><b>${needs+j.failedSources.length}</b><span>待处理</span></div></div>${visible.map(item).join('')}${j.failedSources.length?`<div class="flat-card">${j.failedSources.length} 张截图识别失败${secondary('retry-ocr','重试失败截图')}</div>`:''}${btn('import-cancel','移除未提交资料','text-btn danger')}`,`${count('failed')?control('retry-submit','重试提交失败项'):needs?control('review','继续确认'):control('contributions','查看我的公寓')}${secondary('later','稍后继续')}`);
  }
  function createBatch() {
    if(blocked()||!selected.size)return;
    const previous=batch();if(adding&&previous&&!previous.modeLocked){previous.sources.push(...[...selected].filter(id=>!previous.sources.includes(id)));adding=false;editing=null;nav('importResult');process(previous,false);return;}
    const j={id:'import-'+(++serial),sources:[...selected],rows:[],failedSources:[],confirmed:false,share:entryIntent==='share',modeLocked:false,status:'processing',generation:0,created:new Date().toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'})};jobs.unshift(j);current=j.id;editing=null;nav('importResult');process(j,false);
  }
  function process(j,retry) {
    const version=++j.generation;j.status='processing';render();
    setTimeout(()=>{if(j.generation!==version||j.status!=='processing')return;
      if(blocked()){j.status='needs_review';render();return;}
      const sources=retry?[...j.failedSources]:j.sources;const fail=$('#import-ocr-fail')?.checked;
      if(fail)$('#import-ocr-fail').checked=false;
      j.failedSources=[];
      sources.forEach((id,i)=>{if(fail&&i===sources.length-1){j.failedSources.push(id);return;}
        source(id).rows.forEach((r,index)=>{const key=j.id+'-'+id+'-'+index;if(j.rows.some(x=>x.id===key))return;j.rows.push({...r,id:key,source:id,selected:r.status==='ready',propose:false});});});
      j.status='needs_review';if(state.modal)render();else if(current===j.id&&['importResult','importReview'].includes(state.route.view))nav('importReview',{},true);else render();
    },650);
  }
  function publish(j,onlyFailed=false) {
    if(blocked()||j.status==='submitting')return;
    const rows=j.rows.filter(r=>onlyFailed?r.status==='failed':r.status==='ready'&&r.selected);
    if(!rows.length||(!onlyFailed&&!j.confirmed))return;
    if(j.share&&!state.qualified){toast('共享资格待核验，可以先仅自己保存');return;}
    j.modeLocked=true;j.status='submitting';editing=null;nav('importResult');const version=++j.generation;
    setTimeout(()=>{if(j.generation!==version||j.status!=='submitting')return;
      if(blocked()){j.status='needs_review';render();return;}
      const fail=$('#import-submit-fail')?.checked;if(fail)$('#import-submit-fail').checked=false;
      rows.forEach((r,i)=>{
        if(fail&&i===rows.length-1){r.status='failed';r.reason='连接中断，尚未保存';return;}
        if(j.share&&!state.qualified){r.status='failed';r.reason='共享资格已变化，请稍后重试';return;}
        window.apartmentLibrary.saveImport(r);
        if(!j.share){r.status='saved_private';return;}
        if(r.propose){r.status='pending';return;}
        const apt=apartment(r.apt);if(!apt){r.status='needs_review';r.selected=false;r.reason='公寓已不可用，请重新核对';return;}
        const same=apt.codes.find(c=>c.status==='active'&&c.value===r.code&&(c.scope||'大门')===(r.scope||'大门'));
        if(same){r.status='duplicate';same.validatedByMe=true;return;}
        apt.codes.push({id:uid(),value:r.code,scope:r.scope||'大门',time:1000+serial,when:'刚刚贡献 · 实测日期未知',author:model.profile.name,helpful:false,mine:true,vote:null,status:'active'});r.status='submitted';
      });j.status='needs_review';j.confirmed=false;render();
    },550);
  }
  function openReview(){editing=null;nav('importReview');}
  function importAction(a,b) {
    const id=b?.dataset.id;
    if(a==='open'){open();return;}
    if(a==='login'){beginAuth(()=>open(intent));return;}
    if(a==='home'){nav('home');return;}
    if(blocked()){toast('请先登录');render();return;}
    const j=batch();
    switch(a){
      case'gallery':gallery=true;render();break;
      case'more':modal('menu',{title:'更多',items:[{action:'import-save-progress',label:'保存进度'},{action:'import-add-more',label:'继续添加截图'}]});break;
      case'save-progress':closeModal();toast('本页进度已保留');break;
      case'add-more':closeModal();adding=true;selected=new Set();gallery=true;nav('importUpload');break;
      case'scope-menu':if(!j.modeLocked)modal('menu',{title:'保存方式',items:[{action:'import-scope-share',label:'共享并保存'},{action:'import-scope-private',label:'仅自己保存'}]});break;
      case'scope-share':case'scope-private':if(!j.modeLocked){j.share=a==='scope-share';j.confirmed=false;closeModal();render();}break;
      case'select':selected.has(id)?selected.delete(id):selected.add(id);render();break;
      case'chosen':gallery=false;render();break;
      case'remove-source':selected.delete(id);render();break;
      case'recognize':createBatch();break;
      case'pause':j.generation++;j.paused=true;j.status='needs_review';nav('importReview');break;
      case'resume-recognize':j.paused=false;nav('importResult');process(j,false);break;
      case'review':openReview();break;
      case'edit':editing=id;editDraft={...getRow(id)};state.errors.import=null;if(state.route.view!=='importReview')nav('importReview');else render();$('.import-editor input[name="code"]')?.focus();break;
      case'cancel-edit':editing=null;editDraft=null;state.errors.import=null;render();break;
      case'remove-row':{const r=getRow(id);if(r&&!finished.has(r.status)){r.status='removed';r.selected=false;j.confirmed=false;editing=null;editDraft=null;render();}break;}
      case'preview':modal('import-preview',{id});break;
      case'submit':publish(j);break;
      case'retry-submit':publish(j,true);break;
      case'retry-ocr':process(j,true);nav('importResult');break;
      case'later':editing=null;nav('contributions');break;
      case'contributions':nav('contributions');break;
      case'resume':current=id;nav('importResult');break;
      case'cancel':if(j)confirmAction('移除未提交资料？','已经贡献的记录会保留。',()=>{j.generation++;j.status='cancelled';j.rows=j.rows.filter(r=>finished.has(r.status));j.failedSources=[];j.sources=[];closeModal();render();},true);break;
    }
  }
  Object.assign(screens,{importUpload:['B04','截图导入'],importReview:['B05','识别结果确认'],importResult:['B06','导入进度与结果']});
  for(const view of ['importUpload','importReview','importResult']){const o=document.createElement('option');o.value=view;o.textContent=screens[view].join(' · ');$('#inspect-page').append(o);}
  const baseRender=render;
  render=function(){
    if(['importUpload','importReview','importResult'].includes(state.route.view)) {
      history.replaceState({abPrototype:true,route:structuredClone(state.route),stack:structuredClone(state.stack)},'',location.pathname+location.search+'#'+state.route.view);
      $('#app').innerHTML=state.route.view==='importUpload'?uploadPage():state.route.view==='importReview'?reviewPage():resultPage();
      $('#screen-title').textContent=screens[state.route.view][1];$('#screen-id').textContent=screens[state.route.view][0];renderModal();return;
    }
    baseRender();const v=state.route.view;
    if(v==='me'&&state.logged)$('.menu-section')?.insertAdjacentHTML('afterbegin',menu('贡献公寓资料','','import-open'));
    if(v==='code')$('[data-submit="code"]')?.insertAdjacentHTML('beforebegin',secondary('open','截图贡献多个公寓'));
    if(v==='contributions'){
      const sc=$('.page-scroll');sc?.querySelector('.page-head')?.insertAdjacentHTML('afterend',`<div class="import-contribute">${control('open','从截图添加')}</div>${state.logged?jobs.map(j=>`<button class="import-batch" data-action="import-resume" ${attr(j.id)}><span><b>截图导入 · ${esc(j.created)}</b><small>${j.status==='cancelled'?'已取消':j.status==='processing'?'正在识别':j.status==='submitting'?'正在提交':`${j.rows.filter(r=>finished.has(r.status)).length} 条已处理 · ${j.rows.filter(r=>['ready','needs_review','failed'].includes(r.status)).length+j.failedSources.length} 条待处理`}</small></span>${I('chevron')}</button>`).join(''):''}`);
    }
  };
  const baseModal=renderModal;
  renderModal=function(){if(state.modal?.type==='import-preview'){const f=source(state.modal.id);$('#overlay').innerHTML=`<section class="dialog import-preview" role="dialog" aria-modal="true" aria-label="截图预览"><div class="close-row"><h2>截图预览</h2>${ib('close-modal','close','关闭')}</div><img src="samples/${f.id}.svg" alt="${esc(f.title)}"></section>`;}else baseModal();};
  const baseActions=actions;
  actions=function(a,b){if(a.startsWith('import-')){importAction(a.slice(7),b);return;}if(a==='back'&&state.route.view==='importUpload'&&gallery){gallery=false;render();return;}if(a==='back'&&state.route.view==='importReview'&&editing){editing=null;render();return;}baseActions(a,b);};
  document.addEventListener('change',e=>{const box=e.target;if(box.matches('[data-import-mode]')){const j=batch();if(!j.modeLocked){j.share=box.value==='share';j.confirmed=false;capture();render();}}if(box.matches('[data-import-check]')){const r=getRow(box.dataset.importCheck);if(r&&r.status==='ready'){r.selected=box.checked;batch().confirmed=false;capture();render();}}if(box.matches('[data-import-consent]')){batch().confirmed=box.checked;capture();render();}});
  document.addEventListener('input',e=>{if(!e.target.closest('[data-submit="import-edit"]')||!editDraft)return;const t=e.target;if(t.name==='apt'){editDraft.apt=t.value==='new'?null:t.value;editDraft.propose=t.value==='new';}else if(['code','scope','address'].includes(t.name))editDraft[t.name]=t.value;});
  document.addEventListener('submit',e=>{if(!e.target.matches('[data-submit="import-edit"]'))return;e.preventDefault();if(blocked())return;const r=getRow(editing);if(!r)return;const fd=new FormData(e.target),apt=String(fd.get('apt')||''),code=String(fd.get('code')||'').trim(),addr=String(fd.get('address')||'').trim();if(!apt||!code||(apt==='new'&&!addr)){state.errors.import='请确认公寓和密码；新公寓需填写英文地址';render();return;}r.apt=apt==='new'?null:apt;r.propose=apt==='new';r.address=addr;r.code=code;r.scope=String(fd.get('scope')||'').trim()||'大门';r.status='ready';r.selected=true;r.reason='';batch().confirmed=false;editing=null;state.errors.import=null;render();});
  const baseReset=resetPrototype;
  resetPrototype=function(){jobs.forEach(j=>j.generation++);jobs=[];selected.clear();current=null;editing=null;gallery=false;serial=0;for(const id of ['import-submit-fail','import-ocr-fail'])$('#'+id).checked=false;baseReset();};
  document.querySelectorAll('[data-import-lab]').forEach(b=>b.addEventListener('click',()=>{state.logged=true;state.qualified=true;state.scenario='normal';$('#scenario').value='normal';if(b.dataset.importLab==='mixed'){selected=new Set(fixtures.map(f=>f.id));createBatch();}else open();}));
  window.abasongImports={open,list:()=>jobs.map(j=>({id:j.id,created:j.created,status:j.status,done:j.rows.filter(r=>finished.has(r.status)).length,pending:j.rows.filter(r=>['ready','needs_review','failed'].includes(r.status)).length+j.failedSources.length})),resume:id=>importAction('resume',{dataset:{id}})};
  if(new URLSearchParams(location.search).get('flow')==='screenshots'){state.route={view:'importUpload',args:{}};state.stack=[];}
  render();
})();
