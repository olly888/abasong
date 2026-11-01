'use strict';
// Synthetic S01 interaction only. No camera, photo upload, OCR or provider call.
(() => {
  iconPaths.camera = '<rect x="2" y="6" width="20" height="15" rx="3"/><path d="M8 6V3h8v3"/><circle cx="12" cy="13" r="4"/>';
  const originalSearch = searchPage, originalActions = actions, originalRender = render;
  let photo = null, previous = null, revision = 0;
  const stop = () => { revision++; photo = null; previous = null; };
  const retake = () => { revision++; previous = photo; photo = { stage: 'camera' }; render(); };
  const camera = () => ib('photo-camera', 'camera', '拍面单查地址');
  searchPage = function () {
    const root = document.createElement('div'); root.innerHTML = originalSearch();
    if (state.homeView !== 'apartments') return root.innerHTML;
    root.querySelector('.page-search').insertAdjacentHTML('beforeend', camera());
    const results = root.querySelector('#search-results');
    if (photo?.stage === 'camera') results.innerHTML = `<div class="photo-camera"><div class="photo-viewfinder"><span>To: TEST DRIVER</span><strong>1200 W Pine Ave</strong><span>Los Angeles, CA</span></div><div class="photo-camera-actions">${btn('photo-cancel','取消','button secondary')}${btn('photo-shutter','拍照','button')}</div></div>`;
    if (photo?.stage === 'recognizing') results.innerHTML = `<div class="photo-status">正在识别地址${btn('photo-cancel','取消识别','text-btn')}</div>`;
    if (photo?.stage === 'review') results.innerHTML = `<section class="photo-review"><h2>${photo.choices.length > 1 ? '选择收件地址' : '核对收件地址'}</h2>${photo.choices.length > 1 ? photo.choices.map((q,i)=>menu(q,'','photo-choice','pin',`data-id="${i}"`)).join('') : `<p class="photo-address">${esc(state.search)}</p>${btn('photo-confirm','查找此地址','button',state.search.trim().length < 2 ? 'disabled' : '')}`}${btn('photo-camera','重新拍照','text-btn')}</section>`;
    if (photo?.stage === 'error') results.innerHTML = `<section class="photo-review"><h2>${photo.permission?'需要相机权限才能拍面单':'没识别到收件地址'}</h2>${btn(photo.permission?'photo-settings':'photo-camera',photo.permission?'打开系统设置':'重新拍照')}${btn('photo-manual','手动输入','text-btn')}</section>`;
    return root.innerHTML;
  };
  actions = function (a,b) {
    if (a === 'photo-camera') { retake(); return; }
    if (a === 'photo-cancel') { revision++; photo = previous; previous = null; render(); return; }
    if (a === 'photo-manual') { stop(); render(); $('#search-input')?.focus(); return; }
    if (a === 'photo-settings') { toast('原生版本打开系统设置'); return; }
    if (a === 'photo-shutter') {
      const version = ++revision;
      photo = { stage: 'recognizing' }; render();
      setTimeout(() => {
        if(version !== revision || state.route.view !== 'search') return;
        const scene = $('#photo-scene').value;
        if (['empty','permission'].includes(scene)) photo = { stage:'error', permission:scene==='permission' };
        else {
          const choices = scene==='multiple' ? ['1200 W Pine Ave, Los Angeles, CA','1228 W Pine Ave, Los Angeles, CA'] : [scene==='unmatched'?'1440 W Pine Ave, Los Angeles, CA':'1200 W Pine Ave, Los Angeles, CA'];
          photo = { stage:'review', choices };
          state.search = choices.length===1 ? choices[0] : '';
        }
        render();
      }, 700);
      return;
    }
    if (a==='photo-choice') { const chosen=photo.choices[Number(b.dataset.id)]; photo.choices=[chosen]; state.search=chosen; render(); return; }
    if (a==='photo-confirm') { if(state.search.trim().length>=2){stop();render();} return; }
    if (a==='back' || a==='clear-search' || a==='choose-apt' || a==='choose-address') stop();
    return originalActions(a,b);
  };
  render = function () { if(state.route.view!=='search') stop(); originalRender(); };
  document.addEventListener('input',e=>{if(e.target.id==='search-input' && (!e.target.value.trim() || ['camera','recognizing','error'].includes(photo?.stage))) stop();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Enter' && e.target.id==='search-input' && photo?.stage==='review'){e.preventDefault();actions('photo-confirm');}});
  document.querySelector('.lab.right').insertAdjacentHTML('afterbegin','<div class="lab-control"><label for="photo-scene">拍面单 · 合成场景</label><select id="photo-scene"><option value="single">一个地址</option><option value="multiple">多个地址</option><option value="empty">没识别到</option><option value="permission">权限关闭</option><option value="unmatched">未收录地址</option></select><p class="prototype-note">仅演示单张拍照及核对交互，不读取真实照片。</p></div>');
  render();
})();
