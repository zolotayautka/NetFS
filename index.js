(async function(){
  const userLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  let lang = 'en';
  if(userLang.startsWith('ja')) lang = 'ja';
  else if(userLang.startsWith('ko')) lang = 'ko';
  else lang = 'en';
  const t = (key) => i18n[lang][key] || key;
  const listBody = document.getElementById('listBody');
  const btnHome = document.getElementById('btnHome');
  const btnUp = document.getElementById('btnUp');
  const btnAddFolder = document.getElementById('btnAddFolder');
  const btnUpload = document.getElementById('btnUpload');
  btnHome.textContent = t('home');
  btnUp.textContent = t('up');
  btnAddFolder.textContent = t('newFolder');
  btnUpload.textContent = t('upload');
  document.getElementById('thFileName').textContent = t('fileName');
  document.getElementById('thFileSize').textContent = t('fileSize');
  document.getElementById('thDate').textContent = t('date');
  document.getElementById('thActions').textContent = t('actions');
  document.getElementById('loadingText').textContent = t('loading');
  const crumb = document.getElementById('crumb');
  const pathHeader = document.getElementById('pathHeader');
  const status = document.getElementById('status');
  const modalBack = document.getElementById('modalBack');
  const modalRoot = document.getElementById('modal');
  let currentNode = null;
  function closeModal(){ modalBack.style.display='none'; modalRoot.innerHTML = ''; }
  function openModal(content){ modalRoot.innerHTML = content; modalBack.style.display='flex'; }
  modalBack.addEventListener('click', (e)=>{ if(e.target === modalBack) closeModal(); });
  function fmtSize(n){ if(!n && n !== 0) return '-'; const u=['B','KB','MB','GB']; let i=0; let v=n; while(v>=1024 && i<u.length-1){ v/=1024; i++; } return (Math.round(v*10)/10) + ' ' + u[i]; }
  function safe(s){ return (''+s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  async function apiGET(url){ const r = await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  async function apiPOST(url, body){ const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); if(!r.ok) throw new Error('HTTP '+r.status); try{return await r.json();}catch(e){return {ok:true}} }
  async function loadNode(id){
    try{
      const url = id ? '/node/' + id : '/node/';
      const node = await apiGET(url);
      currentNode = node;
      render(node);
    }catch(e){ listBody.innerHTML = `<tr><td colspan=4 style='padding:22px;color:#900'>${t('error')}: ${e.message}</td></tr>`; }
  }
  function render(node){
    const name = node.name || '/';
    const path = node.path || (name === '/' ? '/' : (node.oya_id ? '/' + name : name));
    pathHeader.innerText = path;
      crumb.innerHTML = `${safe(name)}`;
    const children = node.ko || [];
    if(children.length === 0){
      listBody.innerHTML = `<tr><td colspan=4 style='padding:18px;color:#666'>${t('empty')}</td></tr>`;
      return;
    }
    listBody.innerHTML = '';
    children.forEach(c => {
      const isDir = c.is_dir;
      const isMedia = !isDir && isMediaByName(c.name);
      const nameHtml = isDir ? `📁 <a href='#' data-id='${c.id}' class='open'>${safe(c.name)}/</a>` : `📄 <a href='#' data-id='${c.id}' data-name='${safe(c.name)}' class='download'>${safe(c.name)}</a>`;
      const sizeHtml = isDir ? '-' : (c.size ? fmtSize(c.size) : '-');
      const dateHtml = c.updated_at ? new Date(c.updated_at).toLocaleString() : '-';
      const actions = [];
      if(isDir){
        actions.push(`<button data-id='${c.id}' class='btnAction openBtn'>${t('open')}</button>`);
      } else if(isMedia){
        actions.push(`<button data-id='${c.id}' data-name='${safe(c.name)}' class='btnAction playBtn'>${t('play')}</button>`);
        actions.push(`<button data-id='${c.id}' class='btnAction downloadBtn'>${t('download')}</button>`);
      } else {
        actions.push(`<button data-id='${c.id}' class='btnAction downloadBtn'>${t('download')}</button>`);
      }
      actions.push(`<button data-id='${c.id}' class='btnAction copyBtn'>${t('copy')}</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction moveBtn'>${t('move')}</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction renameBtn'>${t('rename')}</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction deleteBtn' style='color:#900'>${t('delete')}</button>`);
      const row = `<tr>
        <td>${nameHtml}</td>
        <td>${sizeHtml}</td>
        <td>${dateHtml}</td>
        <td class='actions'>${actions.join(' ')}</td>
      </tr>`;
      listBody.insertAdjacentHTML('beforeend', row);
    });
    listBody.querySelectorAll('.open').forEach(el=> el.addEventListener('click', (e)=>{ e.preventDefault(); const id = el.getAttribute('data-id'); loadNode(id);}));
    listBody.querySelectorAll('.openBtn').forEach(b=> b.addEventListener('click', ()=>{ const id=b.getAttribute('data-id'); loadNode(id);}));
    listBody.querySelectorAll('.playBtn').forEach(b=> b.addEventListener('click', ()=>{ const id=b.getAttribute('data-id'); const name=b.getAttribute('data-name'); const mediaType=isMediaByName(name); if(mediaType) playerModal(id, name, mediaType);}));
    listBody.querySelectorAll('.downloadBtn').forEach(b=> b.addEventListener('click', ()=>{ const id=b.getAttribute('data-id'); const a = document.createElement('a'); a.href = '/file/' + id; a.download = ''; document.body.appendChild(a); a.click(); a.remove();}));
    listBody.querySelectorAll('.copyBtn').forEach(b=> b.addEventListener('click', ()=>{ copyModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.moveBtn').forEach(b=> b.addEventListener('click', ()=>{ moveModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.renameBtn').forEach(b=> b.addEventListener('click', ()=>{ renameModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.deleteBtn').forEach(b=> b.addEventListener('click', ()=>{ deleteModal(Number(b.getAttribute('data-id'))); }));
  }
  function isMediaByName(name){
    if(!name) return false;
    const ext = (name.split('.').pop() || '').toLowerCase();
    const audio = ['mp3','m4a','wav','ogg','flac','aac'];
    const video = ['mp4','webm','ogg','mov','mkv'];
    if(audio.includes(ext)) return 'audio';
    if(video.includes(ext)) return 'video';
    return false;
  }
  function playerModal(id, name, mediaType){
    const src = '/file/' + id + '?inline=1';
    const mediaTag = mediaType === 'audio' ? `<audio controls style='width:100%' src='${src}'></audio>` : `<video controls style='width:100%;max-height:70vh' src='${src}'></video>`;
    openModal(`<h3>${safe(name)}</h3><div style='margin-bottom:8px'>${mediaTag}</div><div class='foot'><button id='closePlayer'>${t('close')}</button> <a href='/file/${id}' style='margin-left:8px'>${t('download')}</a></div>`);
    const closeBtn = document.getElementById('closePlayer');
    closeBtn.addEventListener('click', ()=>{ closeModal(); });
  }
  function addFolderModal(){
    openModal(`<h3>${t('folderCreate')}</h3>
      <div class='row'><label>${t('folderName')}</label></div>
      <div class='row'><input id='folderName' type='text' /></div>
      <div class='foot'><button id='cancel'>${t('cancel')}</button><button id='create'>${t('create')}</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('create').addEventListener('click', async ()=>{
      const name = document.getElementById('folderName').value.trim();
        if(!name){ alert(t('enterName')); return; }
      try{
        const fd = new FormData(); fd.append('filename', name); fd.append('is_dir', 'true'); if(currentNode && currentNode.id) fd.append('oya_id', currentNode.id);
        const res = await fetch('/upload', { method: 'POST', body: fd });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json(); closeModal(); status.innerText = t('createSuccess') + ': ' + (j.name || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert(t('createFailed') + ': ' + e.message); }
    });
  }
  function uploadModal(){
    openModal(`<h3>${t('fileUpload')}</h3>
      <div class='row'><label>${t('file')}</label></div>
      <div class='row'><input id='uploadFileInput' type='file' /></div>
      <div class='row'><label>${t('name')}</label></div>
      <div class='row'><input id='uploadName' type='text' placeholder='${t('namePlaceholder')}' /></div>
      <div class='row'><label>${t('progress')}</label> <div class='progress' style='margin-left:8px'><div id='uploadBar' class='bar'></div></div> <div id='uploadPct' style='min-width:40px;margin-left:8px' class='muted'>0%</div></div>
      <div class='foot'><button id='cancel2'>${t('cancel')}</button><button id='startUpload'>${t('upload')}</button></div>`);
    let es = null;
    let uploading = false;
    const startBtn = document.getElementById('startUpload');
    const cancelBtn = document.getElementById('cancel2');
    const fileInputEl = document.getElementById('uploadFileInput');
    cancelBtn.addEventListener('click', ()=>{ if(es) es.close(); closeModal(); });
    startBtn.addEventListener('click', async ()=>{
      if(uploading) return;
      uploading = true;
      startBtn.disabled = true;
      fileInputEl.disabled = true;
      cancelBtn.disabled = true;
      const prevText = startBtn.innerText;
      startBtn.innerText = t('uploading');
      const fileEl = document.getElementById('uploadFileInput');
      if(!fileEl.files || fileEl.files.length === 0){ alert(t('selectFile')); return; }
      const file = fileEl.files[0];
      const name = document.getElementById('uploadName').value.trim() || file.name;
      const uploadId = 'u' + Date.now() + Math.floor(Math.random()*9999);
      es = new EventSource('/upload/progress?upload_id=' + encodeURIComponent(uploadId));
      const bar = document.getElementById('uploadBar');
      const pct = document.getElementById('uploadPct');
      es.onmessage = (e)=>{ const p = Number(e.data); bar.style.width = p + '%'; pct.innerText = p + '%'; if(p>=100){ es.close(); } };
      const fd = new FormData();
      fd.append('filename', name);
      fd.append('is_dir', 'false');
      if(currentNode && currentNode.id) fd.append('oya_id', currentNode.id);
      fd.append('upload_id', uploadId);
      fd.append('file', file);
      try{
        const res = await fetch('/upload', { method:'POST', body:fd });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json();
        status.innerText = t('uploadSuccess') + ': ' + (j.name || '');
        loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
        bar.style.width = '100%'; pct.innerText='100%';
        setTimeout(()=>{ if(es) es.close(); closeModal(); }, 600);
        return;
      }catch(e){ alert(t('uploadFailed') + ': ' + e.message); if(es) es.close(); }
      uploading = false;
      startBtn.disabled = false;
      fileInputEl.disabled = false;
      cancelBtn.disabled = false;
      startBtn.innerText = prevText;
    });
  }
  async function folderPickerModal(title, startId, onPick){
    openModal(`<h3>${title}</h3>
      <div style='margin-bottom:8px'><strong id='pickerPath' class='muted'></strong></div>
      <div id='pickerList' style='max-height:300px;overflow:auto;border:1px solid #eee;padding:6px;margin-bottom:8px'></div>
      <div style='display:flex;gap:8px;align-items:center'><button id='pickerBack'>${t('back')}</button><button id='pickerHome'>${t('root')}</button><div style='flex:1'></div><div class='muted'>${t('selected')}: <span id='pickerSelected'>${t('none')}</span></div></div>
      <div class='foot'><button id='pickerCancel'>${t('cancel')}</button><button id='pickerChoose'>${t('choose')}</button></div>`);
    let pickCurrentId = startId || null;
    let currentPickerNode = null;
    async function loadPickerNode(id){
      try{
        const url = id ? '/node/' + id : '/node/';
        const node = await apiGET(url);
        currentPickerNode = node;
        document.getElementById('pickerPath').innerText = `${node.path || node.name}`;
        pickCurrentId = node.id;
        document.getElementById('pickerSelected').innerText = pickCurrentId ? (node.path || node.name) : t('none');
        const list = document.getElementById('pickerList');
        list.innerHTML = '';
        const children = (node.ko || []).filter(c => c.is_dir);
        if(children.length === 0) { list.innerHTML = `<div style='color:#666;padding:8px'>${t('noFolders')}</div>`; return; }
        children.forEach(c => {
          const el = document.createElement('div');
          el.style.padding = '6px'; el.style.borderBottom = '1px solid #f2f2f2';
          el.innerHTML = `📁 <strong>${safe(c.name)}</strong> <span style='float:right'><button data-id='${c.id}' class='pickerOpen'>${t('open')}</button> <button data-id='${c.id}' data-name='${safe(c.name)}' class='pickerSelect'>${t('choose')}</button></span>`;
          list.appendChild(el);
        });
        list.querySelectorAll('.pickerOpen').forEach(b=> b.addEventListener('click', (e)=>{ const id = b.getAttribute('data-id'); loadPickerNode(id); }));
        list.querySelectorAll('.pickerSelect').forEach(b=> b.addEventListener('click', (e)=>{ pickCurrentId = Number(b.getAttribute('data-id')); document.getElementById('pickerSelected').innerText = pickCurrentId; }));
      }catch(err){ document.getElementById('pickerList').innerHTML = `<div style='color:#900;padding:8px'>${t('error')}: ${err.message}</div>`; }
    }
    document.getElementById('pickerCancel').addEventListener('click', closeModal);
    document.getElementById('pickerBack').addEventListener('click', ()=>{
      if(currentPickerNode && currentPickerNode.oya_id) loadPickerNode(currentPickerNode.oya_id);
      else loadPickerNode();
    });
    document.getElementById('pickerHome').addEventListener('click', ()=> loadPickerNode());
    document.getElementById('pickerChoose').addEventListener('click', async ()=>{
      if(!pickCurrentId){ alert(t('selectFolder')); return; }
      try{ await onPick(pickCurrentId); closeModal(); }catch(e){ alert(t('operationFailed') + ': '+e.message); }
    });
    await loadPickerNode(startId || currentNode && currentNode.id);
  }
  async function copyModal(srcId){
    let srcMeta;
    try{ srcMeta = await apiGET('/node/' + srcId); }catch(e){ alert(t('cannotGetSource') + ': '+e.message); return; }
    folderPickerModal(t('selectDest'), currentNode && currentNode.id, async (dst)=>{
      try{
        const dest = await apiGET('/node/' + dst);
        const conflict = (dest.ko || []).find(c => c.name === srcMeta.name && c.is_dir === srcMeta.is_dir);
        let res;
        if(conflict){
          if(!confirm(t('conflict'))){
            return;
          }
          res = await apiPOST('/copy', {src_id: srcId, dst_id: dst, overwrite: true});
        } else {
          res = await apiPOST('/copy', {src_id: srcId, dst_id: dst});
        }
        status.innerText = t('copied') + ': ' + (res.name || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert(t('copyFailed') + ': ' + e.message); }
    });
  }
  async function moveModal(srcId){
    let srcMeta;
    try{ srcMeta = await apiGET('/node/' + srcId); }catch(e){ alert(t('cannotGetSource') + ': '+e.message); return; }
    folderPickerModal(t('selectMoveDest'), currentNode && currentNode.id, async (dst)=>{
      try{
        const dest = await apiGET('/node/' + dst);
        const conflict = (dest.ko || []).find(c => c.name === srcMeta.name && c.is_dir === srcMeta.is_dir);
        let res2;
        if(conflict){
          if(!confirm(t('conflict'))){
            return;
          }
          res2 = await apiPOST('/move', {src_id: srcId, dst_id: dst, overwrite: true});
        } else {
          res2 = await apiPOST('/move', {src_id: srcId, dst_id: dst});
        }
        status.innerText = t('moved') + ': ' + (res2.name || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert(t('moveFailed') + ': ' + e.message); }
    });
  }
  function renameModal(id){
    openModal(`<h3>${t('renameTo')}</h3><div class='row'><label>${t('newName')}</label></div><div class='row'><input id='newName' type='text' /></div><div class='foot'><button id='cancel'>${t('cancel')}</button><button id='do'>${t('confirm')}</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('do').addEventListener('click', async ()=>{
      const nn = document.getElementById('newName').value.trim(); if(!nn){ alert(t('enterNewName')); return; }
      try{ await apiPOST('/rename', {src_id: id, new_name: nn}); status.innerText = t('renamed'); closeModal(); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);}catch(e){ alert(t('renameFailed') + ': ' + e.message); }
    });
  }
  function deleteModal(id){
    openModal(`<h3>${t('deleteConfirm')}</h3><div style='margin-top:8px'>${t('deleteMsg')}</div><div class='foot'><button id='cancel'>${t('cancel')}</button><button id='do' style='color:#900'>${t('delete')}</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('do').addEventListener('click', async ()=>{
      try{ await apiPOST('/delete', {src_id: id}); status.innerText=t('deleted'); closeModal(); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);}catch(e){ alert(t('deleteFailed') + ': ' + e.message); }
    });
  }
  btnHome.addEventListener('click', ()=> loadNode());
  btnUp.addEventListener('click', ()=>{ if(currentNode && currentNode.oya_id) loadNode(currentNode.oya_id); else loadNode(); });
  btnAddFolder.addEventListener('click', addFolderModal);
  btnUpload.addEventListener('click', uploadModal);
  await loadNode();
})();