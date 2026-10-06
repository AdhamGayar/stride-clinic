/* Shared JSON format and validation for the patient site and the private editor. */
(() => {
  'use strict';
  const kinds=['categories','videos','surveys','questions','options'];
  const fields={
    categories:['id','title','description','order','active'],
    videos:['id','categoryId','title','description','url','duration','level','order','active'],
    surveys:['id','title','description','order','active'],
    questions:['id','surveyId','title','type','required','order','min','max','hint'],
    options:['questionId','title','order']
  };
  const labels={categories:'الفئات',videos:'الفيديوهات',surveys:'الاستبيانات',questions:'الأسئلة',options:'الخيارات'};
  const types=new Set(['نص','فقرة','تاريخ','فئة','مقياس','اختيار']);
  const clean=value=>String(value??'').trim();
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const idPattern=/^[A-Za-z][A-Za-z0-9_-]*$/;

  function youtubeId(value){
    try{
      const url=new URL(clean(value));
      if(url.protocol!=='https:')return null;
      const host=url.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
      let id='';
      if(host==='youtube.com'||host==='youtube-nocookie.com')id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
      else if(host==='youtu.be')id=url.pathname.slice(1).split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  }

  function validate(content){
    const errors=[];
    if(!plain(content)||content.version!==1)return ['إصدار ملف المحتوى غير مدعوم.'];
    for(const kind of kinds){
      if(!Array.isArray(content[kind])){errors.push('قائمة «'+labels[kind]+'» غير موجودة.');continue;}
      for(const [index,item] of content[kind].entries()){
        if(!plain(item)){errors.push('عنصر غير صالح في «'+labels[kind]+'»، رقم '+(index+1)+'.');continue;}
        for(const key of fields[kind])if(!Object.prototype.hasOwnProperty.call(item,key))errors.push('حقل ناقص في «'+labels[kind]+'»، رقم '+(index+1)+': '+key+'.');
        if(!Number.isSafeInteger(item.order)||item.order<1)errors.push('ترتيب غير صالح في «'+labels[kind]+'»، رقم '+(index+1)+'.');
        if(typeof item.title!=='string'||!clean(item.title))errors.push('عنوان فارغ في «'+labels[kind]+'»، رقم '+(index+1)+'.');
      }
    }
    if(errors.length)return errors;
    for(const kind of ['categories','videos','surveys','questions']){
      const seen=new Set();
      for(const item of content[kind]){
        if(typeof item.id!=='string'||!idPattern.test(item.id))errors.push('معرّف غير صالح في «'+labels[kind]+'».');
        if(seen.has(item.id))errors.push('معرّف مكرر في «'+labels[kind]+'»: '+item.id+'.');
        seen.add(item.id);
      }
    }
    const cats=new Set(content.categories.map(x=>x.id));
    const surveys=new Set(content.surveys.map(x=>x.id));
    const questions=new Set(content.questions.map(x=>x.id));
    for(const cat of content.categories){if(typeof cat.description!=='string'||typeof cat.active!=='boolean')errors.push('بيانات فئة غير صالحة: '+cat.title+'.');}
    for(const video of content.videos){
      if(!cats.has(video.categoryId))errors.push('الفيديو «'+video.title+'» بلا فئة موجودة.');
      if(!youtubeId(video.url))errors.push('رابط يوتيوب غير صالح للفيديو «'+video.title+'».');
      if(typeof video.description!=='string'||typeof video.duration!=='string'||typeof video.level!=='string'||typeof video.active!=='boolean')errors.push('بيانات فيديو غير صالحة: '+video.title+'.');
    }
    for(const survey of content.surveys){if(typeof survey.description!=='string'||typeof survey.active!=='boolean')errors.push('بيانات استبيان غير صالحة: '+survey.title+'.');}
    for(const question of content.questions){
      if(!surveys.has(question.surveyId))errors.push('السؤال «'+question.title+'» بلا استبيان موجود.');
      if(!types.has(question.type))errors.push('نوع غير صالح للسؤال «'+question.title+'».');
      if(typeof question.required!=='boolean'||typeof question.hint!=='string')errors.push('بيانات سؤال غير صالحة: '+question.title+'.');
      if(question.type==='مقياس'&&(!Number.isFinite(Number(question.min))||!Number.isFinite(Number(question.max))||question.min===''||question.max===''||Number(question.min)>=Number(question.max)))errors.push('حدّا المقياس غير صالحين للسؤال «'+question.title+'».');
      if(question.type==='اختيار'&&!content.options.some(x=>x.questionId===question.id))errors.push('السؤال «'+question.title+'» يحتاج خيارًا واحدًا على الأقل.');
    }
    for(const option of content.options){if(!questions.has(option.questionId))errors.push('خيار إجابة بلا سؤال موجود.');}
    return errors;
  }

  function normalize(content){
    const errors=validate(content);
    if(errors.length)throw new Error(errors.slice(0,10).join('\n')+(errors.length>10?'\nوتوجد أخطاء أخرى.':''));
    const result={version:1};
    for(const kind of kinds)result[kind]=content[kind].map(item=>Object.fromEntries(fields[kind].map(key=>[key,item[key]])));
    return result;
  }

  window.ClinicContent={kinds,fields,validate,normalize,youtubeId};
})();
