(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, className='', value) => { const element=document.createElement(tag); if(className)element.className=className; if(value!==undefined)element.textContent=value; return element; };
  const types=['نص','فقرة','تاريخ','فئة','مقياس','اختيار'];
  const data={categories:[],videos:[],surveys:[],questions:[],options:[]};
  let contentLoaded=false,dirty=false,activePage='videos',optionSerial=0,drag=null;
  let auth=null,database=null,authorized=false,remoteFingerprint=null,busy=false;
  const orderOf=item=>Number(item.order)||9999;
  const sorted=items=>[...items].sort((a,b)=>orderOf(a)-orderOf(b));
  function say(value='',kind='ok'){const box=$('message');box.textContent=value;box.className='message'+(value?' visible '+kind:'');}
  function updateControls(){
    $('workflow').classList.toggle('locked',!authorized);
    $('file-input').disabled=!authorized;
    $('pull-button').disabled=!authorized||busy;
    $('export-button').disabled=!authorized||!contentLoaded||busy;
    $('save-button').disabled=!authorized||!contentLoaded||busy;
    $('logout-button').hidden=!authorized;
    $('login-button').hidden=authorized;
    $('admin-email').disabled=authorized;
    $('admin-password').disabled=authorized;
  }
  function changed(){dirty=true;$('file-note').textContent='توجد تعديلات لم تُحفظ على الموقع بعد.';}
  function contentForSave(){return ClinicContent.normalize({version:1,...Object.fromEntries(ClinicContent.kinds.map(kind=>[kind,sorted(data[kind])]))});}
  function loadContent(raw,label){
    const next=ClinicContent.normalize(raw);
    next.options.forEach(o=>o.uid='option-'+(++optionSerial));
    Object.keys(data).forEach(key=>data[key]=next[key]);
    contentLoaded=true;dirty=false;
    $('file-name').textContent=label;
    $('file-note').textContent='عدّل العناصر ثم اضغط «حفظ على الموقع».';
    $('editor').classList.add('visible');updateControls();renderAll();
  }
  async function pullRemote(){
    if(!authorized||busy)return;
    if(dirty&&!confirm('توجد تعديلات لم تُحفظ. هل تريد جلب النسخة المنشورة وفقدها؟'))return;
    busy=true;updateControls();say();
    try{
      const snapshot=await database.ref(CLINIC_FIREBASE.contentPath).get();
      const value=snapshot.val();
      remoteFingerprint=JSON.stringify(value);
      if(!snapshot.exists()){
        Object.keys(data).forEach(key=>data[key]=[]);
        contentLoaded=false;dirty=false;$('editor').classList.remove('visible');
        $('file-name').textContent='لا يوجد محتوى منشور بعد';
        $('file-note').textContent='ارفع ملف content.json الأول، ثم اضغط «حفظ على الموقع».';
        say('قاعدة البيانات فارغة. ارفع نسخة JSON الحالية لبدء النشر.');
        return;
      }
      loadContent(typeof value==='string'?JSON.parse(value):value,'المحتوى المنشور على الموقع');
      say('تم جلب آخر محتوى منشور.');
    }catch(error){say('تعذّر جلب المحتوى: '+(error.message||'تحقق من الاتصال وقواعد القراءة.'),'error');}
    finally{busy=false;updateControls();}
  }
  async function saveRemote(){
    if(!authorized||!contentLoaded||busy)return;
    busy=true;updateControls();say();
    try{
      const result=contentForSave();
      const ref=database.ref(CLINIC_FIREBASE.contentPath);
      if(remoteFingerprint===null) throw new Error('اجلب المحتوى المنشور أولًا للتحقق من أحدث نسخة قبل الحفظ.');
      const serialized=JSON.stringify(result);
      const current=await ref.get();
      if(JSON.stringify(current.val())!==remoteFingerprint) throw new Error('تغيّر المحتوى المنشور منذ فتحه. نزّل نسخة JSON من تعديلاتك، ثم اجلب المنشور وراجع الاختلافات قبل الحفظ.');
      await ref.set(serialized);
      remoteFingerprint=JSON.stringify(serialized);
      dirty=false;
      $('file-name').textContent='المحتوى المنشور على الموقع';
      $('file-note').textContent='حُفظت التعديلات. ستظهر للمرضى عند تحديث الصفحة.';
      say('تم حفظ المحتوى على الموقع بنجاح.');
    }catch(error){say('لم تُحفظ التعديلات: '+(error.message||'تحقق من الاتصال وصلاحيات الإدارة.'),'error');}
    finally{busy=false;updateControls();}
  }
  function resetEditor(){
    Object.keys(data).forEach(key=>data[key]=[]);
    contentLoaded=false;dirty=false;remoteFingerprint=null;
    $('editor').classList.remove('visible');
    $('file-name').textContent='لم يُحمّل المحتوى بعد';
    $('file-note').textContent='بعد الدخول، سيُحمّل المحتوى المنشور تلقائيًا. يمكنك أيضًا رفع نسخة JSON احتياطية.';
    updateControls();
  }
  function button(label,action,className='button secondary small'){const b=make('button',className,label);b.type='button';b.addEventListener('click',action);return b;}
  function handle(kind,id,label){const b=make('button','drag-handle','⋮⋮');b.type='button';b.title=label||'اسحب لتغيير الترتيب';b.setAttribute('aria-label',b.title);b.dataset.dragKind=kind;b.dataset.dragId=id;return b;}
  function field(parent,label,item,key,opts={}){
    const box=make('div','field'+(opts.full?' full':''));const caption=make('label','',label);const control=opts.options?make('select'):opts.multiline?make('textarea'):make('input');
    if(opts.options){for(const [value,title] of opts.options){const option=make('option','',title);option.value=value;control.append(option);}}
    else if(!opts.multiline)control.type=opts.type||'text';
    control.value=item[key]??'';const id='field-'+Math.random().toString(36).slice(2);control.id=id;caption.htmlFor=id;box.append(caption,control);parent.append(box);
    control.addEventListener(opts.options?'change':'input',()=>{item[key]=opts.type==='number'&&control.value!==''?Number(control.value):control.value;changed();if(opts.onChange)opts.onChange(control.value);});return control;
  }
  function check(parent,label,item,key,after){const box=make('label','check field');const input=make('input');input.type='checkbox';input.checked=!!item[key];input.addEventListener('change',()=>{item[key]=input.checked;changed();if(after)after();});box.append(input,make('span','',label));parent.append(box);}
  function editBlock(parent,item,kind,build){const details=make('details','edit');details.dataset.editKind=kind;details.dataset.editId=item.id;details.append(make('summary','','تعديل التفاصيل'));const form=make('div','form-grid');build(form);details.append(form);parent.append(details);}
  function sectionHead(title,note,addText,addAction){const head=make('div','section-head');const copy=make('div');copy.append(make('h2','',title),make('p','',note));head.append(copy);if(addAction)head.append(button(addText,addAction,'button'));return head;}
  const youtubeId=value=>ClinicContent.youtubeId(value);
  async function importFile(file){
    if(!file||!authorized)return;
    if(dirty&&!confirm('توجد تعديلات لم تُحفظ. هل تريد فتح ملف آخر وفقدها؟'))return;
    try{
      if(!window.ClinicContent)throw new Error('تعذّر تشغيل قواعد المحتوى.');
      if(file.size>5*1024*1024)throw new Error('ملف JSON كبير جدًا. الحد الأقصى 5 ميغابايت.');
      let raw;
      try{raw=JSON.parse(await file.text());}catch{throw new Error('ملف JSON غير قابل للقراءة.');}
      loadContent(raw,'الملف المفتوح: '+file.name);
      dirty=true;$('file-note').textContent='نسخة الملف جاهزة للمراجعة. اضغط «حفظ على الموقع» لنشرها.';
      say('تم فتح الملف. لم يتغير المحتوى المنشور بعد.');
    }catch(error){say(error.message||'تعذّر فتح الملف.','error');}
  }
  $('file-input').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';await importFile(file);});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  $('pull-button').addEventListener('click',pullRemote);
  $('save-button').addEventListener('click',saveRemote);
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!auth||authorized)return;
    $('login-button').disabled=true;say();
    try{
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      await auth.signInWithEmailAndPassword($('admin-email').value.trim(),$('admin-password').value);
      $('admin-password').value='';
    }catch(error){say('تعذّر تسجيل الدخول. تحقق من البريد وكلمة المرور وإعدادات Firebase Authentication.','error');$('login-status').textContent='لم يكتمل الدخول.';}
    finally{$('login-button').disabled=false;}
  });
  $('logout-button').addEventListener('click',async()=>{
    if(dirty&&!confirm('توجد تعديلات لم تُحفظ على الموقع. هل تريد الخروج وفقدها؟'))return;
    try{await auth.signOut();}catch(error){say('تعذّر تسجيل الخروج: '+(error.message||''),'error');}
  });
  function initFirebase(){
    if(!window.firebase||!window.CLINIC_FIREBASE){$('login-status').textContent='تعذّر تحميل خدمة Firebase.';say('تحقق من اتصال الإنترنت وملف إعدادات Firebase.','error');return;}
    try{
      const app=firebase.apps.length?firebase.app():firebase.initializeApp(CLINIC_FIREBASE.config);
      auth=app.auth();database=app.database();
      auth.onAuthStateChanged(async user=>{
        if(user&&user.uid!==CLINIC_FIREBASE.adminUid){
          authorized=false;resetEditor();
          $('login-status').textContent='هذا الحساب غير مخوّل بإدارة الموقع.';
          say('هذا الحساب غير مخوّل. استخدم حساب المسؤول.','error');
          await auth.signOut();return;
        }
        authorized=!!user;
        if(authorized){$('login-status').textContent='تم الدخول: '+(user.email||'حساب المسؤول');updateControls();await pullRemote();}
        else{resetEditor();$('login-status').textContent='سجّل الدخول للبدء.';}
      },error=>{say('تعذّر التحقق من جلسة الإدارة: '+(error.message||''),'error');});
    }catch(error){$('login-status').textContent='تعذّر الاتصال بالخدمة.';say('تحقق من إعدادات Firebase.','error');}
  }
  initFirebase();
  function nextId(kind){const prefix={categories:'category',videos:'video',surveys:'survey',questions:'question'}[kind];const used=new Set(data[kind].map(x=>x.id));let n=1;while(used.has(prefix+'-'+String(n).padStart(2,'0')))n++;return prefix+'-'+String(n).padStart(2,'0');}
  function nextOrder(items){return Math.max(0,...items.map(x=>Number(x.order)||0))+1;}
  function newItem(kind,parentId){let item;if(kind==='categories')item={id:nextId(kind),title:'فئة جديدة',description:'',order:nextOrder(data.categories),active:true};if(kind==='videos'){if(!data.categories.length){say('أضف فئة أولًا ثم أضف الفيديو.','error');setPage('categories');return;}const categoryId=parentId||sorted(data.categories)[0].id;item={id:nextId(kind),categoryId,title:'فيديو جديد',description:'',url:'',duration:'',level:'',order:nextOrder(data.videos.filter(x=>x.categoryId===categoryId)),active:true};}if(kind==='surveys')item={id:nextId(kind),title:'استبيان جديد',description:'',order:nextOrder(data.surveys),active:true};if(kind==='questions')item={id:nextId(kind),surveyId:parentId,title:'سؤال جديد',type:'نص',required:false,order:nextOrder(data.questions.filter(x=>x.surveyId===parentId)),min:'',max:'',hint:''};data[kind].push(item);changed();renderAll();openEdit(kind,item.id);say('أُضيف العنصر. أكمل بياناته قبل حفظه على الموقع.');}
  function openEdit(kind,id){const element=[...document.querySelectorAll('details.edit')].find(x=>x.dataset.editKind===kind&&x.dataset.editId===id);if(element){element.open=true;element.scrollIntoView({behavior:'smooth',block:'nearest'});}}
  function removeItem(kind,item){let extra='';if(kind==='categories'){const count=data.videos.filter(x=>x.categoryId===item.id).length;if(count)extra=' وسيُحذف معه '+count+' فيديو.';}if(kind==='surveys'){const count=data.questions.filter(x=>x.surveyId===item.id).length;if(count)extra=' وستُحذف معه '+count+' أسئلة وخياراتها.';}if(kind==='questions')extra=' وستُحذف خياراته.';if(!confirm('حذف «'+(item.title||'هذا العنصر')+'»؟'+extra))return;data[kind]=data[kind].filter(x=>x!==item);if(kind==='categories')data.videos=data.videos.filter(x=>x.categoryId!==item.id);if(kind==='surveys'){const ids=new Set(data.questions.filter(x=>x.surveyId===item.id).map(x=>x.id));data.questions=data.questions.filter(x=>x.surveyId!==item.id);data.options=data.options.filter(x=>!ids.has(x.questionId));}if(kind==='questions')data.options=data.options.filter(x=>x.questionId!==item.id);changed();renderAll();say('حُذف العنصر من النسخة المفتوحة.');}
  function renderVideos(){const page=$('videos');page.replaceChildren(sectionHead('التمارين','اسحب مقبض الفيديو لترتيبه أو انقله إلى فئة أخرى.','إضافة فيديو',()=>newItem('videos')));for(const cat of sorted(data.categories)){const lane=make('section','lane');lane.dataset.dropKind='video-lane';lane.dataset.categoryId=cat.id;const head=make('div','lane-head');head.append(make('h3','',cat.title),make('small','',cat.description));lane.append(head);const grid=make('div','grid');const videos=sorted(data.videos.filter(v=>v.categoryId===cat.id));videos.forEach(v=>grid.append(videoCard(v,cat)));if(!videos.length)grid.append(make('div','empty','اسحب فيديو إلى هذه الفئة أو أضف واحدًا.'));lane.append(grid);page.append(lane);}if(!data.categories.length)page.append(make('div','empty','لا توجد فئات بعد. أضف فئة أولًا.'));}
  function videoCard(item,cat){const card=make('article','card video-card');card.dataset.dropKind='videos';card.dataset.id=item.id;const box=make('div','video-box');const image=make('img');const id=youtubeId(item.url);if(id)image.src='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';else image.style.display='none';image.alt='';image.loading='lazy';image.addEventListener('error',()=>image.style.display='none');box.append(image,make('span','play','▶'));const copy=make('div','video-copy');const tag=make('span','tag',cat.title),title=make('h3','',item.title),description=make('p','',item.description),meta=make('div','meta',[item.duration,item.level].filter(Boolean).join(' · ')||'لا توجد تفاصيل إضافية');copy.append(tag,title,description,meta);const actions=make('div','card-actions');actions.append(handle('videos',item.id,'اسحب لترتيب الفيديو أو نقله إلى فئة أخرى'),button('حذف',()=>removeItem('videos',item),'button danger small'),make('span','status'+(item.active?'':' off'),item.active?'ظاهر على الموقع':'مخفي'));copy.append(actions);card.append(box,copy);editBlock(card,item,'videos',form=>{field(form,'عنوان الفيديو',item,'title',{full:true,onChange:value=>title.textContent=value||'بلا عنوان'});field(form,'الوصف',item,'description',{full:true,multiline:true,onChange:value=>description.textContent=value});field(form,'الفئة',item,'categoryId',{options:sorted(data.categories).map(x=>[x.id,x.title]),onChange:()=>renderAll()});field(form,'رابط يوتيوب',item,'url',{full:true,type:'url',onChange:value=>{const next=youtubeId(value);image.style.display=next?'block':'none';if(next)image.src='https://i.ytimg.com/vi/'+next+'/hqdefault.jpg';}});field(form,'المدة',item,'duration',{onChange:()=>meta.textContent=[item.duration,item.level].filter(Boolean).join(' · ')});field(form,'المستوى أو الأدوات',item,'level',{onChange:()=>meta.textContent=[item.duration,item.level].filter(Boolean).join(' · ')});check(form,'ظاهر على الموقع',item,'active',()=>{const status=actions.querySelector('.status');status.textContent=item.active?'ظاهر على الموقع':'مخفي';status.classList.toggle('off',!item.active);});});return card;}
  function renderCategories(){const page=$('categories');page.replaceChildren(sectionHead('الفئات','تظهر للمرضى بهذا الترتيب. اسحب المقبض لتغييره.','إضافة فئة',()=>newItem('categories')));const grid=make('div','grid category-grid');for(const item of sorted(data.categories)){const card=make('article','card');card.dataset.dropKind='categories';card.dataset.id=item.id;const copy=make('div','card-copy');const title=make('h3','',item.title),description=make('p','',item.description);copy.append(make('span','tag','منطقة علاج'),title,description);const actions=make('div','card-actions');actions.append(handle('categories',item.id),button('حذف',()=>removeItem('categories',item),'button danger small'),make('span','status'+(item.active?'':' off'),item.active?'ظاهرة على الموقع':'مخفية'));copy.append(actions);card.append(copy);editBlock(card,item,'categories',form=>{field(form,'اسم الفئة',item,'title',{full:true,onChange:value=>title.textContent=value||'بلا عنوان'});field(form,'الوصف',item,'description',{full:true,multiline:true,onChange:value=>description.textContent=value});check(form,'ظاهرة على الموقع',item,'active',()=>{const status=actions.querySelector('.status');status.textContent=item.active?'ظاهرة على الموقع':'مخفية';status.classList.toggle('off',!item.active);});});grid.append(card);}page.append(grid);if(!grid.childElementCount)page.append(make('div','empty','لا توجد فئات.'));}
  function renderSurveys(){const page=$('surveys');page.replaceChildren(sectionHead('الاستبيانات','استبيانات المرضى وأسئلتها. اسحب لترتيب الاستبيانات أو الأسئلة.','إضافة استبيان',()=>newItem('surveys')));for(const survey of sorted(data.surveys))page.append(surveyCard(survey));if(!data.surveys.length)page.append(make('div','empty','لا توجد استبيانات.'));}
  function surveyCard(item){const card=make('article','survey-card');card.dataset.dropKind='surveys';card.dataset.id=item.id;const head=make('div','survey-head'),copy=make('div'),title=make('h3','',item.title),description=make('p','',item.description),actions=make('div','card-actions');copy.append(title,description);actions.append(handle('surveys',item.id),button('حذف',()=>removeItem('surveys',item),'button danger small'),make('span','status'+(item.active?'':' off'),item.active?'ظاهر على الموقع':'مخفي'));head.append(copy,actions);card.append(head);editBlock(card,item,'surveys',form=>{field(form,'عنوان الاستبيان',item,'title',{full:true,onChange:value=>title.textContent=value||'بلا عنوان'});field(form,'الوصف',item,'description',{full:true,multiline:true,onChange:value=>description.textContent=value});check(form,'ظاهر على الموقع',item,'active',()=>{const status=actions.querySelector('.status');status.textContent=item.active?'ظاهر على الموقع':'مخفي';status.classList.toggle('off',!item.active);});});const qHead=make('div','question-head');qHead.append(make('h4','','الأسئلة'),button('إضافة سؤال',()=>newItem('questions',item.id),'button secondary small'));card.append(qHead);const list=make('div','question-list');for(const q of sorted(data.questions.filter(x=>x.surveyId===item.id)))list.append(questionCard(q));if(!list.childElementCount)list.append(make('div','empty','لا توجد أسئلة.'));card.append(list);return card;}
  function questionCard(item){const card=make('div','question-card');card.dataset.dropKind='questions';card.dataset.id=item.id;card.dataset.surveyId=item.surveyId;const top=make('div','question-top'),copy=make('div'),title=make('strong','',item.title),summary=make('small','',item.type+(item.required?' · إلزامي':'')),actions=make('div','card-actions');copy.append(title,summary);actions.append(handle('questions',item.id),button('حذف',()=>removeItem('questions',item),'button danger small'));top.append(copy,actions);card.append(top);editBlock(card,item,'questions',form=>{field(form,'نص السؤال',item,'title',{full:true,onChange:value=>title.textContent=value||'سؤال بلا عنوان'});field(form,'نوع السؤال',item,'type',{options:types.map(t=>[t,t]),onChange:()=>{renderAll();openEdit('questions',item.id);}});check(form,'إجابة إلزامية',item,'required',()=>summary.textContent=item.type+(item.required?' · إلزامي':''));field(form,'نص مساعد',item,'hint',{full:true});if(item.type==='مقياس'){field(form,'الحد الأدنى',item,'min',{type:'number'});field(form,'الحد الأقصى',item,'max',{type:'number'});}if(item.type==='اختيار')renderOptions(form,item);});return card;}
  function renderOptions(form,question){const block=make('div','options');block.append(make('h5','','خيارات الإجابة'));const list=make('div');for(const option of sorted(data.options.filter(x=>x.questionId===question.id))){const row=make('div','option-row');row.dataset.dropKind='options';row.dataset.id=option.uid;row.dataset.questionId=question.id;const input=make('input');input.type='text';input.value=option.title;input.setAttribute('aria-label','نص الخيار');input.addEventListener('input',()=>{option.title=input.value;changed();});row.append(handle('options',option.uid,'اسحب لترتيب الخيار'),input,button('حذف',()=>{if(!confirm('حذف هذا الخيار؟'))return;data.options=data.options.filter(x=>x!==option);changed();renderAll();openEdit('questions',question.id);},'button danger small'));list.append(row);}block.append(list,button('إضافة خيار',()=>{data.options.push({uid:'option-'+(++optionSerial),questionId:question.id,title:'خيار جديد',order:nextOrder(data.options.filter(x=>x.questionId===question.id))});changed();renderAll();openEdit('questions',question.id);},'button secondary small'));form.append(block);}
  function renderAll(){renderVideos();renderCategories();renderSurveys();setPage(activePage,false);}
  function setPage(page,scroll=true){activePage=page;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===page));document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));if(scroll)window.scrollTo({top:0,behavior:'smooth'});}
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>setPage(el.dataset.page)));
  function moveRecord(kind,id,targetId,containerId,before){const key=kind==='options'?'uid':'id',item=data[kind].find(x=>x[key]===id);if(!item)return;const parentKey={videos:'categoryId',questions:'surveyId',options:'questionId'}[kind];const newParent=kind==='videos'?containerId:kind==='questions'?containerId:kind==='options'?containerId:null;if(parentKey&&newParent)item[parentKey]=newParent;const siblings=sorted(data[kind].filter(x=>!parentKey||x[parentKey]===item[parentKey])).filter(x=>x!==item);const target=siblings.find(x=>x[key]===targetId);const index=target?siblings.indexOf(target)+(before?0:1):siblings.length;siblings.splice(index,0,item);siblings.forEach((x,i)=>x.order=i+1);changed();renderAll();}
  function validDrop(kind,element){if(!element)return false;const drop=element.dataset.dropKind;if(kind==='videos')return drop==='videos'||drop==='video-lane';return drop===kind;}
  function dropInfo(kind,element,x,y){if(!element)return null;const target=element.closest('[data-drop-kind]');if(!validDrop(kind,target))return null;let containerId=null,targetId=null;if(kind==='videos'){if(target.dataset.dropKind==='video-lane')containerId=target.dataset.categoryId;else{targetId=target.dataset.id;containerId=data.videos.find(v=>v.id===targetId)?.categoryId;}}else if(kind==='questions'){targetId=target.dataset.id;containerId=data.questions.find(q=>q.id===targetId)?.surveyId;}else if(kind==='options'){targetId=target.dataset.id;containerId=data.options.find(o=>o.uid===targetId)?.questionId;}else targetId=target.dataset.id;const rect=target.getBoundingClientRect();return {target,containerId,targetId,before:y<rect.top+rect.height/2};}
  function clearDrag(){if(!drag)return;drag.source?.classList.remove('dragging');drag.over?.classList.remove('drag-over','drop-over');drag.ghost?.remove();drag=null;}
  document.addEventListener('pointerdown',event=>{const grip=event.target.closest('[data-drag-kind]');if(!grip||event.button!==0)return;const kind=grip.dataset.dragKind,id=grip.dataset.dragId;const source=grip.closest('[data-drop-kind]');drag={kind,id,source,startX:event.clientX,startY:event.clientY,moved:false,over:null,ghost:null};grip.setPointerCapture?.(event.pointerId);event.preventDefault();});
  document.addEventListener('pointermove',event=>{if(!drag)return;const distance=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);if(!drag.moved&&distance<5)return;if(!drag.moved){drag.moved=true;drag.source?.classList.add('dragging');drag.ghost=make('div','ghost',drag.source?.querySelector('h3,strong')?.textContent||'نقل العنصر');document.body.append(drag.ghost);}drag.ghost.style.left=Math.min(event.clientX+12,innerWidth-270)+'px';drag.ghost.style.top=Math.min(event.clientY+12,innerHeight-50)+'px';const info=dropInfo(drag.kind,document.elementFromPoint(event.clientX,event.clientY),event.clientX,event.clientY);if(drag.over&&drag.over!==info?.target)drag.over.classList.remove('drag-over','drop-over');drag.over=info?.target||null;if(drag.over)drag.over.classList.add(drag.over.dataset.dropKind==='video-lane'?'drop-over':'drag-over');event.preventDefault();},{passive:false});
  document.addEventListener('pointerup',event=>{if(!drag)return;const {kind,id,moved}=drag;const info=moved?dropInfo(kind,document.elementFromPoint(event.clientX,event.clientY),event.clientX,event.clientY):null;clearDrag();if(info&&info.targetId===id)return;if(info&&info.targetId)moveRecord(kind,id,info.targetId,info.containerId,info.before);else if(info&&kind==='videos'&&info.containerId)moveRecord(kind,id,null,info.containerId,false);});
  document.addEventListener('pointercancel',clearDrag);
  function exportJson(){
    if(!contentLoaded)return;
    try{
      const result=contentForSave();
      const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
      const link=make('a');link.href=url;link.download='content.json';document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('file-note').textContent=dirty?'نُزّلت نسخة احتياطية؛ ما زالت التعديلات غير منشورة.':'تم تنزيل نسخة JSON احتياطية.';
      say('تم تنزيل نسخة JSON احتياطية.');
    }catch(error){say('أصلح البيانات قبل التنزيل:\n'+(error.message||'خطأ غير معروف'),'error');$('message').scrollIntoView({behavior:'smooth',block:'center'});}
  }
  $('export-button').addEventListener('click',exportJson);
})();
