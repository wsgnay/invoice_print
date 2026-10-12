const $=s=>document.querySelector(s);
const configs={invoice:{title:'发票整理',sub:'批量导入发票，自动提取含税金额、汇总与排版打印。',list:'发票清单',export:'导出打印 PDF',accept:'.pdf,.jpg,.jpeg,.png,.webp'},pdf:{title:'PDF 工具',sub:'合并文件、提取页面，重新安排每一页的顺序。',list:'页面清单',export:'导出 PDF',accept:'.pdf'},image:{title:'图片转 PDF',sub:'把零散图片整理成册，自由选择纸张方向与排列方式。',list:'图片清单',export:'导出 PDF',accept:'.jpg,.jpeg,.png,.webp'},word:{title:'PDF 转 Word',sub:'提取 PDF 文字，转换为可以继续编辑的 Word 文档。',list:'页面清单',export:'导出 Word',accept:'.pdf'}};
const states=Object.fromEntries(Object.keys(configs).map(m=>[m,{files:[],pages:[],layout:m==='invoice'?2:1}]));
let mode='invoice',busy=false,preview=0,toastTimer;
const state=()=>states[mode];
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5500)}
function selected(){return state().pages.filter(p=>p.selected)}
function setBusy(value){busy=value;$('#choose').disabled=value;$('#add-more').disabled=value;$('#export').disabled=value||!selected().length;$('#file-input').disabled=value;$('#retry-amounts').disabled=value;document.querySelectorAll('nav button').forEach(b=>b.disabled=value)}
function switchMode(next){if(busy)return;mode=next;preview=0;const c=configs[mode];document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('#breadcrumb').textContent=c.title;$('#title').textContent=c.title;if(mode==='invoice'){const span=document.createElement('span');span.textContent='，一页搞定。';$('#title').append(span)}$('#subtitle').textContent=c.sub;$('#file-input').accept=c.accept;$('#accept-copy').textContent=mode==='pdf'||mode==='word'?'支持 PDF，可一次导入多个文件':mode==='image'?'支持 JPG、PNG、WebP，可一次导入多张图片':'支持 PDF、JPG、PNG、WebP，可一次导入多个文件';$('#layout-settings').hidden=!['invoice','image'].includes(mode);$('#pdf-settings').hidden=mode!=='pdf';$('#word-settings').hidden=mode!=='word';$('#invoice-total').hidden=mode!=='invoice';$('#retry-amounts').hidden=mode!=='invoice';$('#settings-title').textContent=['invoice','image'].includes(mode)?'打印设置':'导出设置';$('#preview-title').textContent=['invoice','image'].includes(mode)?'排版预览':'页面预览';$('#list-note').textContent=mode==='invoice'?'文件可继续拖入此栏；金额自动识别，可点击“校对”修正。':'文件可继续拖入此栏；勾选页面并用箭头调整导出顺序。';$('#export-tip').textContent=mode==='word'?'基础转换 · 不保留复杂版式':'按清单顺序导出所选页面';render()}
async function importFiles(list){if(busy||!list.length)return;setBusy(true);let count=0,errors=[];for(const file of list){try{const ext='.'+file.name.split('.').pop().toLowerCase();if(!configs[mode].accept.split(',').includes(ext))throw Error('此工具不支持该格式');if(file.size>50*1024*1024)throw Error('文件超过 50 MB');notify((mode==='invoice'?'正在自动识别发票金额（扫描页可能需稍候）：':'正在读取 ')+file.name);const form=new FormData();form.append('file',file);form.append('invoice',String(mode==='invoice'));const response=await fetch('/api/inspect',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw Error(data.detail||'读取失败');if(state().pages.length+data.pages.length>200)throw Error('当前工具最多导入 200 页');const id=crypto.randomUUID();state().files.push({id,file});for(const p of data.pages)state().pages.push({...p,id:crypto.randomUUID(),fileId:id,name:file.name,selected:true,amount:p.amount??''});count+=data.pages.length;render()}catch(error){errors.push(file.name+'：'+error.message)}}setBusy(false);render();$('#file-input').value='';notify(`已导入 ${count} 页`+(errors.length?'；'+errors.join('；'):''))}
function render(){const c=configs[mode],s=state(),hasFiles=s.pages.length>0;$('#dropzone').hidden=hasFiles;$('#list-panel').hidden=!hasFiles;$('#list-title').textContent=c.list+' ';const badge=document.createElement('span');badge.textContent=s.pages.length;$('#list-title').append(badge);const container=$('#files');container.replaceChildren();s.pages.forEach((p,index)=>{const row=document.createElement('div');row.className='file-row';const check=document.createElement('input');check.type='checkbox';check.checked=p.selected;check.setAttribute('aria-label','选择 '+p.name+' 第 '+(p.page+1)+' 页');check.onchange=()=>{p.selected=check.checked;updateSummary()};const img=document.createElement('img');img.src=p.thumbnail;img.alt='第 '+(p.page+1)+' 页预览';const info=document.createElement('div');info.className='file-info';const name=document.createElement('strong');name.textContent=p.name;name.title=p.name;const detail=document.createElement('small');detail.textContent=`${String(index+1).padStart(2,'0')} / 原文件第 ${p.page+1} 页`+(mode==='word'&&!p.has_text?' · 扫描页（图片）':'');info.append(name,detail);row.append(check,img,info);if(mode==='invoice'){row.append(amountControl(p));}const actions=document.createElement('div');actions.className='row-actions';[['↑',-1,'上移'],['↓',1,'下移'],['×',0,'删除']].forEach(([label,offset,title])=>{const button=document.createElement('button');button.textContent=label;button.title=title;button.setAttribute('aria-label',title+'第 '+(index+1)+' 页');button.disabled=offset===-1&&index===0||offset===1&&index===s.pages.length-1;button.onclick=()=>{if(busy)return;if(offset)[s.pages[index],s.pages[index+offset]]=[s.pages[index+offset],s.pages[index]];else s.pages.splice(index,1);s.files=s.files.filter(f=>s.pages.some(p=>p.fileId===f.id));render()};actions.append(button)});row.append(actions);container.append(row)});updateSummary()}
function validAmount(value){return /^-?\d{1,10}(\.\d{1,2})?$/.test(value.trim())}
function cents(value){const negative=value.startsWith('-');const [whole,decimal='']=value.replace('-','').split('.');return (Number(whole)*100+Number(decimal.padEnd(2,'0')))*(negative?-1:1)}
function updateSummary(){const pages=selected(),s=state();const valid=pages.filter(p=>validAmount(p.amount));const total=valid.reduce((sum,p)=>sum+cents(p.amount.trim()),0);$('#total b').textContent=(total/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});$('#pending').textContent=!pages.length?'等待导入':valid.length===pages.length?'全部已识别 / 校对':`${pages.length-valid.length} 页需复核，不计入小计`;$('#invoice-total>div>span').textContent=pages.length&&valid.length===pages.length?'发票金额合计':'已填金额小计';$('#selected-count').textContent=`已选择 ${pages.length} 页`;$('#output-count').textContent=['invoice','image'].includes(mode)?`预计 ${Math.ceil(pages.length/s.layout)} 张 A4`:mode==='word'?'.docx 文档':$('#split').checked?'逐页拆分 ZIP':'合并 / 提取 PDF';$('#export').disabled=busy||!pages.length;$('#export').textContent=busy?'正在处理…':'↓ '+(mode==='pdf'&&$('#split').checked?'导出拆分 ZIP':configs[mode].export);document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('active',Number(b.dataset.layout)===s.layout));renderPreview()}
function renderPreview(){const pages=selected(),s=state(),sheet=$('#sheet'),landscape=$('#orientation').value==='landscape';const pageCount=Math.max(1,Math.ceil(pages.length/s.layout));preview=Math.max(0,Math.min(preview,pageCount-1));sheet.classList.toggle('landscape',landscape);sheet.style.gridTemplateColumns=s.layout===4?'1fr 1fr':'1fr';sheet.style.gridTemplateRows=s.layout===1?'1fr':'1fr 1fr';sheet.style.padding=(Number($('#margin').value)/595*(landscape?195:130))+'px';sheet.replaceChildren();for(let i=0;i<s.layout;i++){const slot=document.createElement('div');slot.className='sheet-slot';slot.style.padding='1.3px';const p=pages[preview*s.layout+i];if(p){const img=document.createElement('img');img.src=p.thumbnail;img.alt='排版预览';slot.append(img)}else if(!pages.length){const mock=document.createElement('div');mock.className='placeholder-invoice';mock.textContent=mode==='image'?'图片预览':'电子发票';slot.append(mock)}sheet.append(slot)}$('#preview-info').textContent='A4 · '+(landscape?'横向':'纵向');$('#preview-page').textContent=`第 ${preview+1} / ${pageCount} 页`+(!pages.length?' · 示意':'');$('#prev-preview').disabled=preview===0;$('#next-preview').disabled=preview===pageCount-1}
function exportPages(){let pages=selected();if(mode==='pdf'&&$('#range').value.trim()){const indices=[];for(const token of $('#range').value.replaceAll('，',',').split(',')){const match=token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!match)throw Error('页码格式不正确，请填写例如 1-3, 5');const start=Number(match[1]),end=Number(match[2]||match[1]);if(start<1||end<start||end>state().pages.length)throw Error('页码范围超出当前清单或起止顺序不正确');for(let i=start;i<=end;i++)if(!indices.includes(i-1))indices.push(i-1)}pages=indices.map(i=>state().pages[i]).filter(p=>p.selected)}if(!pages.length)throw Error('没有可导出的页面，请检查勾选项和页码范围');return pages}
async function exportFile(){if(busy)return;try{const pages=exportPages();if(mode==='invoice'&&pages.some(p=>p.amount!==''&&!validAmount(p.amount)))throw Error('金额格式不正确，请输入最多两位小数的数字');const files=state().files.filter(f=>pages.some(p=>p.fileId===f.id));const form=new FormData();files.forEach(f=>form.append('files',f.file));form.append('spec',JSON.stringify({mode,pages:pages.map(p=>({file:files.findIndex(f=>f.id===p.fileId),page:p.page})),layout:state().layout,margin:Number($('#margin').value),landscape:$('#orientation').value==='landscape',split:$('#split').checked}));setBusy(true);updateSummary();notify('正在生成文件，请稍候…');const response=await fetch('/api/export',{method:'POST',body:form});if(!response.ok){const error=await response.json();throw Error(error.detail||'导出失败')}const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=mode==='word'?'wsgnay-转换文档.docx':mode==='pdf'&&$('#split').checked?'wsgnay-拆分页面.zip':'wsgnay-'+configs[mode].title+'.pdf';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('文件已生成，下载已开始')}catch(error){notify(error.message)}finally{setBusy(false);updateSummary()}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{state().layout=Number(b.dataset.layout);preview=0;updateSummary()});$('#choose').onclick=e=>{e.stopPropagation();$('#file-input').click()};$('#add-more').onclick=()=>{if(!busy)$('#file-input').click()};$('#dropzone').onclick=()=>{if(!busy)$('#file-input').click()};$('#dropzone').onkeydown=e=>{if(e.target===$('#dropzone')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('#file-input').click()}};$('#file-input').onchange=e=>importFiles([...e.target.files]);['dragenter','dragover'].forEach(event=>$('#dropzone').addEventListener(event,e=>{e.preventDefault();$('#dropzone').classList.add('drag')}));['dragleave','drop'].forEach(event=>$('#dropzone').addEventListener(event,e=>{e.preventDefault();$('#dropzone').classList.remove('drag')}));$('#dropzone').addEventListener('drop',e=>importFiles([...e.dataTransfer.files]));$('#clear').onclick=()=>{if(busy)return;state().files=[];state().pages=[];render()};$('#select-all').onclick=()=>{if(busy)return;const all=state().pages.every(p=>p.selected);state().pages.forEach(p=>p.selected=!all);render()};$('#orientation').onchange=renderPreview;$('#margin').onchange=renderPreview;$('#split').onchange=updateSummary;$('#prev-preview').onclick=()=>{preview--;renderPreview()};$('#next-preview').onclick=()=>{preview++;renderPreview()};$('#export').onclick=exportFile;$('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();switchMode('invoice');

function amountControl(page) {
  const wrap = document.createElement('div');
  wrap.className = 'amount-control';
  const status = document.createElement('small');
  status.className = 'amount-status';
  status.textContent = page.amount_status === 'manual' ? '已手动校对' : page.amount !== '' ? (page.amount_source === 'ocr' ? 'OCR 自动识别' : '已自动提取') : '需复核';
  status.title = page.amount_message || '请核对原票';
  const input = document.createElement('input');
  input.className = 'amount-input' + (page.amount === '' ? ' missing' : '');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.value = page.amount;
  input.readOnly = true;
  input.placeholder = '未识别';
  input.title = page.amount_message || '自动提取的含税金额';
  input.setAttribute('aria-label', page.name + ' 第 ' + (page.page + 1) + ' 页金额');
  const edit = document.createElement('button');
  edit.className = 'text-button amount-edit';
  edit.textContent = '校对';
  edit.setAttribute('aria-label', '校对 ' + page.name + ' 第 ' + (page.page + 1) + ' 页金额');
  edit.onclick = () => {
    if (busy) return;
    input.readOnly = !input.readOnly;
    edit.textContent = input.readOnly ? '校对' : '完成';
    if (!input.readOnly) { input.focus(); input.select(); }
  };
  input.oninput = () => {
    page.amount = input.value;
    page.amount_status = 'manual';
    page.amount_message = '此金额已由你手动校对';
    status.textContent = '已手动校对';
    input.classList.toggle('missing', !validAmount(page.amount));
    updateSummary();
  };
  wrap.append(status, input, edit);
  return wrap;
}

async function retryAmounts() {
  if (busy || mode !== 'invoice' || !state().pages.length) return;
  setBusy(true);
  try {
    for (const entry of state().files) {
      notify('正在重新识别：' + entry.file.name);
      const form = new FormData();
      form.append('file', entry.file);
      form.append('invoice', 'true');
      const response = await fetch('/api/inspect', {method: 'POST', body: form});
      const data = await response.json();
      if (!response.ok) throw Error(data.detail || '识别失败');
      for (const page of state().pages.filter(p => p.fileId === entry.id && p.amount_status !== 'manual')) {
        const recognized = data.pages.find(p => p.page === page.page);
        if (recognized) Object.assign(page, {amount: recognized.amount ?? '', amount_source: recognized.amount_source,
          amount_status: recognized.amount_status, amount_message: recognized.amount_message});
      }
      render();
    }
    const missing = state().pages.filter(p => !validAmount(p.amount)).length;
    notify(missing ? `识别完成，${missing} 页需复核；已校对金额保留` : '金额已全部识别，汇总已更新');
  } catch (error) {
    notify(error.message);
  } finally {
    setBusy(false);
    render();
  }
}
$('#retry-amounts').onclick = retryAmounts;

const sourceColumn = $('.source-column');
const dropOverlay = $('#drop-overlay');
function draggingFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}
function closeListDrop() {
  sourceColumn.classList.remove('drag-active');
  dropOverlay.hidden = true;
}
sourceColumn.addEventListener('dragenter', event => {
  if (!state().pages.length || !draggingFiles(event)) return;
  event.preventDefault();
  if (busy) return;
  sourceColumn.classList.add('drag-active');
  dropOverlay.hidden = false;
});
sourceColumn.addEventListener('dragover', event => {
  if (!state().pages.length || !draggingFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
});
sourceColumn.addEventListener('dragleave', event => {
  if (event.relatedTarget && sourceColumn.contains(event.relatedTarget)) return;
  closeListDrop();
});
sourceColumn.addEventListener('drop', event => {
  if (!state().pages.length || !draggingFiles(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const files = Array.from(event.dataTransfer.files);
  closeListDrop();
  if (busy) return notify('当前文件仍在处理中，请稍候再添加');
  importFiles(files);
});
window.addEventListener('dragend', closeListDrop);
