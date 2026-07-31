import base64, ipaddress, json, os, socket
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS
from google import genai
from google.genai import types

app=Flask(__name__)
CORS(app,resources={r"/*":{"origins":os.getenv("ALLOWED_ORIGIN","*")}})
client=genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

TEXT_MODEL=os.getenv("TEXT_MODEL","gemini-2.5-flash")
IMAGE_MODEL=os.getenv("IMAGE_MODEL","gemini-2.5-flash-image")
MAX_PDF_B64=22_000_000

ANALYSIS_SCHEMA={
 "type":"object",
 "properties":{
  "summary":{"type":"string"},
  "strengths":{"type":"array","items":{"type":"string"}},
  "improvements":{"type":"array","items":{"type":"string"}},
  "whys":{"type":"array","items":{"type":"string"}},
  "nextSteps":{"type":"array","items":{"type":"string"}}
 },
 "required":["summary","strengths","improvements","whys","nextSteps"]
}

@app.get("/")
def health(): return {"ok":True}

@app.post("/generate-image")
def generate_image():
 d=request.get_json(silent=True) or {}
 raw=d.get("imageBase64","")
 if not raw:return jsonify(ok=False,error="ページ画像がありません。"),400
 styles={"space":"深い紺色の宇宙・未来技術風","science":"白と青の科学研究ポスター風","nature":"緑と青の環境・自然風","career":"洗練された職業紹介パンフレット風","simple":"学校向けの簡潔で読みやすい資料風"}
 prompt=f"""添付画像は高校生の探究資料PDFの1ページです。内容を保ちながら、縦長の高品質な日本語インフォグラフィックへ再構成してください。
班名：{d.get('groupName','')}　ページ：{d.get('pageNumber','')}
デザイン：{styles.get(d.get('style'),styles['simple'])}
追加指示：{d.get('extraPrompt','特になし')}
元資料にない事実・数値・出典を作らない。判読不能箇所を推測しない。タイトル、背景、中心図解、要点、応用・将来性を視覚的に整理する。人物は実在人物に似せない。完成画像のみを返す。"""
 try:
  response=client.models.generate_content(
   model=IMAGE_MODEL,
   contents=[types.Part.from_bytes(data=base64.b64decode(raw),mime_type="image/png"),prompt],
   config=types.GenerateContentConfig(response_modalities=["IMAGE"])
  )
  for part in response.candidates[0].content.parts:
   if getattr(part,"inline_data",None):
    data=part.inline_data.data
    if isinstance(data,bytes):data=base64.b64encode(data).decode()
    return jsonify(ok=True,imageBase64=data,mimeType=part.inline_data.mime_type or "image/png")
  return jsonify(ok=False,error="画像が返されませんでした。"),502
 except Exception as e:return jsonify(ok=False,error=f"画像生成に失敗しました: {e}"),500

@app.post("/analyze-pdf")
def analyze_pdf():
 d=request.get_json(silent=True) or {};raw=d.get("pdfBase64","")
 if not raw:return jsonify(ok=False,error="PDFがありません。"),400
 if len(raw)>MAX_PDF_B64:return jsonify(ok=False,error="PDFが大きすぎます。"),413
 prompt="""高校生の探究資料を分析してください。資料にないことは断定せず、生徒を否定しない具体的な助言にしてください。
資料の要約、良い点3つ、改善点3つ、資料内容に直接関係する異なる観点の「なぜ？」を必ず5つ、次に取り組むこと3つを返してください。"""
 return run_analysis([types.Part.from_bytes(data=base64.b64decode(raw),mime_type="application/pdf"),prompt])

@app.post("/analyze-site")
def analyze_site():
 d=request.get_json(silent=True) or {};url=d.get("url","").strip()
 try:
  validate_public_url(url)
  r=requests.get(url,timeout=15,headers={"User-Agent":"TankyuSchoolAnalyzer/1.0"},allow_redirects=True)
  r.raise_for_status()
  if len(r.content)>3_000_000:raise ValueError("ページの容量が大きすぎます。")
  soup=BeautifulSoup(r.text,"html.parser")
  for x in soup(["script","style","nav","footer","noscript"]):x.decompose()
  text=" ".join(soup.get_text(" ",strip=True).split())[:30000]
  title=soup.title.get_text(strip=True) if soup.title else ""
  prompt=f"""次の公開Webサイトを高校生の探究成果として分析してください。
タイトル：{title}
URL：{url}
本文：{text}
内容の要約、良い点3つ、改善点3つ、内容に即した異なる観点の「なぜ？」を必ず5つ、次に取り組むこと3つを返してください。
本文から確認できないデザインや機能は断定しないでください。"""
  return run_analysis([prompt])
 except Exception as e:return jsonify(ok=False,error=f"サイトを取得できませんでした: {e}"),400

def run_analysis(contents):
 try:
  response=client.models.generate_content(
   model=TEXT_MODEL,contents=contents,
   config=types.GenerateContentConfig(response_mime_type="application/json",response_json_schema=ANALYSIS_SCHEMA,temperature=.3)
  )
  result=json.loads(response.text)
  if len(result.get("whys",[]))!=5:raise ValueError("5つの「なぜ？」を取得できませんでした。")
  return jsonify(ok=True,result=result)
 except Exception as e:return jsonify(ok=False,error=f"分析に失敗しました: {e}"),500

def validate_public_url(url):
 p=urlparse(url)
 if p.scheme not in ("http","https") or not p.hostname:raise ValueError("正しいhttp/httpsのURLを入力してください。")
 for info in socket.getaddrinfo(p.hostname,None):
  ip=ipaddress.ip_address(info[4][0])
  if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:raise ValueError("公開サイトだけを指定してください。")

if __name__=="__main__":app.run(host="0.0.0.0",port=int(os.getenv("PORT","8080")))
