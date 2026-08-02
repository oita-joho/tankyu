import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// Cloud Run公開後に変更
const API_BASE="https://tankyu-support-api.onrender.com";

let imagePdfDoc=null, generatedUrl="";

document.querySelectorAll(".menu-card").forEach(b=>b.onclick=()=>show(b.dataset.screen));
document.querySelectorAll(".back").forEach(b=>b.onclick=()=>show("menu"));

function show(id){
  document.querySelectorAll(".screen,#menu").forEach(el=>el.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  scrollTo({top:0,behavior:"smooth"});
}

const imagePdf=document.getElementById("imagePdf");
const imagePage=document.getElementById("imagePage");
const canvas=document.getElementById("pageCanvas");

imagePdf.onchange=async()=>{
  const file=imagePdf.files[0]; if(!file)return;
  setStatus("imageStatus","PDFを読み込んでいます…");
  imagePdfDoc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  imagePage.innerHTML="";
  for(let i=1;i<=imagePdfDoc.numPages;i++){
    const o=document.createElement("option");o.value=i;o.textContent=`${i}ページ目`;imagePage.appendChild(o);
  }
  await renderPage(1);
  setStatus("imageStatus",`${imagePdfDoc.numPages}ページを読み込みました。`);
};
imagePage.onchange=()=>renderPage(Number(imagePage.value));

async function renderPage(no){
  const page=await imagePdfDoc.getPage(no);
  const viewport=page.getViewport({scale:2});
  canvas.width=viewport.width;canvas.height=viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
}

document.getElementById("generateImageBtn").onclick=async()=>{
  if(!imagePdfDoc)return setStatus("imageStatus","PDFを選択してください。",true);
  const btn=document.getElementById("generateImageBtn");busy(btn,true,"作成中…");
  try{
    const data=await post("/generate-image",{
      imageBase64:canvas.toDataURL("image/png").split(",")[1],
      groupName:document.getElementById("imageGroup").value,
      pageNumber:Number(imagePage.value),
      style:document.getElementById("imageStyle").value,
      extraPrompt:document.getElementById("imagePrompt").value
    });
    generatedUrl=`data:${data.mimeType};base64,${data.imageBase64}`;
    document.getElementById("imageResult").src=generatedUrl;
    document.getElementById("imageResultBox").classList.remove("hidden");
    setStatus("imageStatus","画像を作成しました。");
  }catch(e){setStatus("imageStatus",e.message,true)}
  finally{busy(btn,false,"画像を作成")}
};

document.getElementById("downloadImageBtn").onclick=()=>{
  const a=document.createElement("a");a.href=generatedUrl;
  a.download=`${document.getElementById("imageGroup").value||"班"}_page${imagePage.value}.png`;a.click();
};

document.getElementById("analyzePdfBtn").onclick=async()=>{
  const file=document.getElementById("analysisPdf").files[0];
  if(!file)return setStatus("pdfStatus","PDFを選択してください。",true);
  if(file.size>15*1024*1024)return setStatus("pdfStatus","PDFは15MB以下にしてください。",true);
  const btn=document.getElementById("analyzePdfBtn");busy(btn,true,"分析中…");
  try{
    const data=await post("/analyze-pdf",{
      fileName:file.name,groupName:document.getElementById("pdfGroup").value,
      pdfBase64:await fileBase64(file)
    });
    renderAnalysis("pdfResult",data.result);
    setStatus("pdfStatus","分析が完了しました。");
  }catch(e){setStatus("pdfStatus",e.message,true)}
  finally{busy(btn,false,"PDFを分析")}
};

document.getElementById("analyzeSiteBtn").onclick=async()=>{
  const url=document.getElementById("siteUrl").value.trim();
  if(!url)return setStatus("siteStatus","URLを入力してください。",true);
  const btn=document.getElementById("analyzeSiteBtn");busy(btn,true,"分析中…");
  try{
    const data=await post("/analyze-site",{url});
    renderAnalysis("siteResult",data.result);
    setStatus("siteStatus","分析が完了しました。");
  }catch(e){setStatus("siteStatus",e.message,true)}
  finally{busy(btn,false,"サイトを分析")}
};

async function post(path,body){
  if(!API_BASE.startsWith("https://"))throw new Error("APIのURLを設定してください。");
  const r=await fetch(API_BASE+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"処理に失敗しました。");return data;
}
function fileBase64(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(f)})}
function renderAnalysis(id,r){
  const box=document.getElementById(id);
  box.innerHTML=`<h3>要約</h3><p>${esc(r.summary)}</p>
  <h3>良い点</h3>${list(r.strengths)}
  <h3>改善点</h3>${list(r.improvements)}
  <h3>5つの「なぜ？」</h3>${list(r.whys,"why-list","ol")}
  <h3>次に取り組むこと</h3>${list(r.nextSteps)}`;
  box.classList.remove("hidden");
}
function list(a,c="",tag="ul"){return `<${tag} class="${c}">${(a||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</${tag}>`}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function setStatus(id,msg,err=false){const e=document.getElementById(id);e.textContent=msg;e.style.color=err?"#b91c1c":"#1d4ed8"}
function busy(b,on,text){b.disabled=on;b.textContent=text}
