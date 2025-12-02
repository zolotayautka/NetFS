(async function(){
  const listBody = document.getElementById('listBody');
  const btnHome = document.getElementById('btnHome');
  const btnUp = document.getElementById('btnUp');
  const btnAddFolder = document.getElementById('btnAddFolder');
  const btnUpload = document.getElementById('btnUpload');
  const crumb = document.getElementById('crumb');
  const pathHeader = document.getElementById('pathHeader');
  const status = document.getElementById('status');
  const modalBack = document.getElementById('modalBack');
  const modalRoot = document.getElementById('modal');
  let pathStack = [];
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
    }catch(e){ listBody.innerHTML = `<tr><td colspan=4 style='padding:22px;color:#900'>エラー: ${e.message}</td></tr>`; }
  }
  function render(node){
    const name = node.name || '/';
    const path = node.path || (name === '/' ? '/' : (node.oya_id ? '/' + name : name));
    pathHeader.innerText = path;
    crumb.innerHTML = `${safe(name)} <span class='muted'>#${node.id}</span>`;
    const children = node.ko || [];
    if(children.length === 0){
      listBody.innerHTML = `<tr><td colspan=4 style='padding:18px;color:#666'>Directory is empty</td></tr>`;
      return;
    }
    listBody.innerHTML = '';
    children.forEach(c => {
      const isDir = c.is_dir;
      const nameHtml = isDir ? `📁 <a href='#' data-id='${c.id}' class='open'>${safe(c.name)}/</a>` : `📄 <a href='#' data-id='${c.id}' class='download'>${safe(c.name)}</a>`;
      const sizeHtml = isDir ? '-' : (c.size ? fmtSize(c.size) : '-');
      const dateHtml = c.updated_at ? new Date(c.updated_at).toLocaleString() : '-';
      const idLabel = `<div class='muted' style='font-size:12px;margin-top:6px'>#${c.id}</div>`;
      const actions = [];
      actions.push(`<button data-id='${c.id}' class='btnAction openBtn'>${isDir? 'Open':'Download'}</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction copyBtn'>Copy</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction moveBtn'>Move</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction renameBtn'>Rename</button>`);
      actions.push(`<button data-id='${c.id}' class='btnAction deleteBtn' style='color:#900'>Delete</button>`);
      const row = `<tr>
        <td>${nameHtml}${idLabel}</td>
        <td>${sizeHtml}</td>
        <td>${dateHtml}</td>
        <td class='actions'>${actions.join(' ')}</td>
      </tr>`;
      listBody.insertAdjacentHTML('beforeend', row);
    });
    listBody.querySelectorAll('.open').forEach(el=> el.addEventListener('click', (e)=>{ e.preventDefault(); const id = el.getAttribute('data-id'); loadNode(id);}));
    listBody.querySelectorAll('.download').forEach(el => el.addEventListener('click', (e)=>{ e.preventDefault(); const id = el.getAttribute('data-id'); downloadFile(id);}));
    listBody.querySelectorAll('.openBtn').forEach(b=> b.addEventListener('click', ()=>{ const id=b.getAttribute('data-id'); if(b.innerText==='Open') loadNode(id); else downloadFile(id);}));
    listBody.querySelectorAll('.copyBtn').forEach(b=> b.addEventListener('click', ()=>{ copyModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.moveBtn').forEach(b=> b.addEventListener('click', ()=>{ moveModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.renameBtn').forEach(b=> b.addEventListener('click', ()=>{ renameModal(Number(b.getAttribute('data-id'))); }));
    listBody.querySelectorAll('.deleteBtn').forEach(b=> b.addEventListener('click', ()=>{ deleteModal(Number(b.getAttribute('data-id'))); }));
  }
  async function downloadFile(id){
    const a = document.createElement('a'); a.href = '/file/' + id; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function addFolderModal(){
    openModal(`<h3>フォルダ作成</h3>
      <div class='row'><label>フォルダ名</label></div>
      <div class='row'><input id='folderName' type='text' /></div>
      <div class='foot'><button id='cancel'>キャンセル</button><button id='create'>作成</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('create').addEventListener('click', async ()=>{
      const name = document.getElementById('folderName').value.trim();
      if(!name){ alert('名前を入力してください'); return; }
      try{
        const fd = new FormData(); fd.append('filename', name); fd.append('is_dir', 'true'); if(currentNode && currentNode.id) fd.append('oya_id', currentNode.id);
        const res = await fetch('/upload', { method: 'POST', body: fd });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json(); closeModal(); status.innerText = '作成成功: ' + (j.name || j.node_id || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert('フォルダ作成失敗: ' + e.message); }
    });
  }
  function uploadModal(){
    openModal(`<h3>ファイルアップロード</h3>
      <div class='row'><label>ファイル</label></div>
      <div class='row'><input id='uploadFileInput' type='file' /></div>
      <div class='row'><label>名前（空欄の場合は元のファイル名）</label></div>
      <div class='row'><input id='uploadName' type='text' placeholder='Leave blank to use file name' /></div>
      <div class='row'><label>進捗</label> <div class='progress' style='margin-left:8px'><div id='uploadBar' class='bar'></div></div> <div id='uploadPct' style='min-width:40px;margin-left:8px' class='muted'>0%</div></div>
      <div class='foot'><button id='cancel2'>キャンセル</button><button id='startUpload'>アップロード</button></div>`);
    let es = null;
    document.getElementById('cancel2').addEventListener('click', ()=>{ if(es) es.close(); closeModal(); });
    document.getElementById('startUpload').addEventListener('click', async ()=>{
      const fileEl = document.getElementById('uploadFileInput');
      if(!fileEl.files || fileEl.files.length === 0){ alert('アップロードするファイルを選択してください'); return; }
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
        status.innerText = 'アップロード成功: ' + (j.name || j.node_id || '');
        loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
        bar.style.width = '100%'; pct.innerText='100%';
        setTimeout(()=>{ if(es) es.close(); closeModal(); }, 600);
      }catch(e){ alert('アップロード失敗: ' + e.message); if(es) es.close(); }
    });
  }
  async function folderPickerModal(title, startId, onPick){
    openModal(`<h3>${title}</h3>
      <div style='margin-bottom:8px'><strong id='pickerPath' class='muted'></strong></div>
      <div id='pickerList' style='max-height:300px;overflow:auto;border:1px solid #eee;padding:6px;margin-bottom:8px'></div>
      <div style='display:flex;gap:8px;align-items:center'><button id='pickerBack'>上位</button><button id='pickerHome'>ルート</button><div style='flex:1'></div><div class='muted'>選択: <span id='pickerSelected'>(なし)</span></div></div>
      <div class='foot'><button id='pickerCancel'>キャンセル</button><button id='pickerChoose'>選択</button></div>`);
    let pickCurrentId = startId || null;
    let currentPickerNode = null;
    async function loadPickerNode(id){
      try{
        const url = id ? '/node/' + id : '/node/';
        const node = await apiGET(url);
        currentPickerNode = node;
        document.getElementById('pickerPath').innerText = `${node.path || node.name} (#${node.id})`;
        pickCurrentId = node.id;
        document.getElementById('pickerSelected').innerText = pickCurrentId ? pickCurrentId : '(none)';
        const list = document.getElementById('pickerList');
        list.innerHTML = '';
        const children = (node.ko || []).filter(c => c.is_dir);
        if(children.length === 0) { list.innerHTML = `<div style='color:#666;padding:8px'>フォルダがありません — この場所が選択されます</div>`; return; }
        children.forEach(c => {
          const el = document.createElement('div');
          el.style.padding = '6px'; el.style.borderBottom = '1px solid #f2f2f2';
          el.innerHTML = `📁 <strong>${safe(c.name)}</strong> <span class='muted' style='margin-left:8px'>#${c.id}</span> <span style='float:right'><button data-id='${c.id}' class='pickerOpen'>開く</button> <button data-id='${c.id}' class='pickerSelect'>選択</button></span>`;
          list.appendChild(el);
        });
        list.querySelectorAll('.pickerOpen').forEach(b=> b.addEventListener('click', (e)=>{ const id = b.getAttribute('data-id'); loadPickerNode(id); }));
        list.querySelectorAll('.pickerSelect').forEach(b=> b.addEventListener('click', (e)=>{ pickCurrentId = Number(b.getAttribute('data-id')); document.getElementById('pickerSelected').innerText = pickCurrentId; }));
      }catch(err){ document.getElementById('pickerList').innerHTML = `<div style='color:#900;padding:8px'>エラー: ${err.message}</div>`; }
    }
    document.getElementById('pickerCancel').addEventListener('click', closeModal);
    document.getElementById('pickerBack').addEventListener('click', ()=>{
      if(currentPickerNode && currentPickerNode.oya_id) loadPickerNode(currentPickerNode.oya_id);
      else loadPickerNode();
    });
    document.getElementById('pickerHome').addEventListener('click', ()=> loadPickerNode());
    document.getElementById('pickerChoose').addEventListener('click', async ()=>{
      if(!pickCurrentId){ alert('対象フォルダを選択してください'); return; }
      try{ await onPick(pickCurrentId); closeModal(); }catch(e){ alert('操作に失敗しました: '+e.message); }
    });
    await loadPickerNode(startId || currentNode && currentNode.id);
  }

  async function copyModal(srcId){
    let srcMeta;
    try{ srcMeta = await apiGET('/node/' + srcId); }catch(e){ alert('ソース情報を取得できません: '+e.message); return; }
    folderPickerModal('コピー先フォルダを選択', currentNode && currentNode.id, async (dst)=>{
      try{
        const dest = await apiGET('/node/' + dst);
        const conflict = (dest.ko || []).find(c => c.name === srcMeta.name && c.is_dir === srcMeta.is_dir);
        let res;
        if(conflict){
          if(!confirm('宛先フォルダに同じ名前の項目があります。上書きしますか？')){
            return;
          }
          res = await apiPOST('/copy', {src_id: srcId, dst_id: dst, overwrite: true});
        } else {
          res = await apiPOST('/copy', {src_id: srcId, dst_id: dst});
        }
        status.innerText = 'コピーされました: ' + (res.name || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert('コピー失敗: ' + e.message); }
    });
  }
  async function moveModal(srcId){
    let srcMeta;
    try{ srcMeta = await apiGET('/node/' + srcId); }catch(e){ alert('ソース情報を取得できません: '+e.message); return; }
    folderPickerModal('移動先フォルダを選択', currentNode && currentNode.id, async (dst)=>{
      try{
        const dest = await apiGET('/node/' + dst);
        const conflict = (dest.ko || []).find(c => c.name === srcMeta.name && c.is_dir === srcMeta.is_dir);
        let res2;
        if(conflict){
          if(!confirm('宛先フォルダに同じ名前の項目があります。上書きしますか？')){
            return;
          }
          res2 = await apiPOST('/move', {src_id: srcId, dst_id: dst, overwrite: true});
        } else {
          res2 = await apiPOST('/move', {src_id: srcId, dst_id: dst});
        }
        status.innerText='移動しました: ' + (res2.name || ''); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);
      }catch(e){ alert('移動失敗: ' + e.message); }
    });
  }
  function renameModal(id){
    openModal(`<h3>名前を変更</h3><div class='row'><label>新しい名前</label></div><div class='row'><input id='newName' type='text' /></div><div class='foot'><button id='cancel'>キャンセル</button><button id='do'>変更</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('do').addEventListener('click', async ()=>{
      const nn = document.getElementById('newName').value.trim(); if(!nn){ alert('新しい名前を入力してください'); return; }
      try{ await apiPOST('/rename', {src_id: id, new_name: nn}); status.innerText = '名前が変更されました'; closeModal(); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);}catch(e){ alert('名前の変更に失敗しました: ' + e.message); }
    });
  }
  function deleteModal(id){
    openModal(`<h3>削除の確認</h3><div style='margin-top:8px'>本当に削除しますか？</div><div class='foot'><button id='cancel'>キャンセル</button><button id='do' style='color:#900'>削除</button></div>`);
    document.getElementById('cancel').addEventListener('click', closeModal);
    document.getElementById('do').addEventListener('click', async ()=>{
      try{ await apiPOST('/delete', {src_id: id}); status.innerText='削除されました'; closeModal(); loadNode(currentNode && currentNode.id ? currentNode.id : undefined);}catch(e){ alert('削除失敗: ' + e.message); }
    });
  }
  btnHome.addEventListener('click', ()=> loadNode());
  btnUp.addEventListener('click', ()=>{ if(currentNode && currentNode.oya_id) loadNode(currentNode.oya_id); else loadNode(); });
  btnAddFolder.addEventListener('click', addFolderModal);
  btnUpload.addEventListener('click', uploadModal);
  await loadNode();
})();