import * as pdfjsLib from
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// Renderの文章分析API
const API_BASE = "https://tankyu-support-api.onrender.com";

let imagePdfDoc = null;
let lastAnalysis = null;
let lastSource = null;

/* ========================================
   画面の切り替え　
======================================== */

document.querySelectorAll(".menu-card").forEach(button => {
  button.onclick = () => show(button.dataset.screen);
});

document.querySelectorAll(".back").forEach(button => {
  button.onclick = () => show("menu");
});

function show(id) {
  document.querySelectorAll(".screen, #menu").forEach(element => {
    element.classList.add("hidden");
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.remove("hidden");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ========================================
   画像作成画面のPDFプレビュー
======================================== */

const imagePdf = document.getElementById("imagePdf");
const imagePage = document.getElementById("imagePage");
const canvas = document.getElementById("pageCanvas");

if (imagePdf) {
  imagePdf.onchange = async () => {
    const file = imagePdf.files[0];

    if (!file) {
      return;
    }

    setStatus("imageStatus", "PDFを読み込んでいます…");

    try {
      imagePdfDoc = await pdfjsLib.getDocument({
        data: new Uint8Array(await file.arrayBuffer())
      }).promise;

      imagePage.innerHTML = "";

      for (let i = 1; i <= imagePdfDoc.numPages; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = `${i}ページ目`;
        imagePage.appendChild(option);
      }

      await renderPage(1);

      setStatus(
        "imageStatus",
        `${imagePdfDoc.numPages}ページを読み込みました。`
      );
    } catch (error) {
      setStatus(
        "imageStatus",
        `PDFを読み込めませんでした：${error.message}`,
        true
      );
    }
  };
}

if (imagePage) {
  imagePage.onchange = () => {
    renderPage(Number(imagePage.value));
  };
}

async function renderPage(pageNumber) {
  if (!imagePdfDoc || !canvas) {
    return;
  }

  const page = await imagePdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport
  }).promise;
}

/* ========================================
   画像作成画面を3つのAI選択式に変更
======================================== */

setupImageAiButtons();

function setupImageAiButtons() {
  const oldButton = document.getElementById("generateImageBtn");

  if (!oldButton) {
    return;
  }

  oldButton.textContent = "画像作成に使うAIを選ぶ";

  let aiBox = document.getElementById("imageAiButtons");

  if (!aiBox) {
    aiBox = document.createElement("div");
    aiBox.id = "imageAiButtons";
    aiBox.className = "ai-tools hidden";

    aiBox.innerHTML = `
      <p class="ai-guide">
        指示文をコピーして、選択したAIを開きます。
      </p>

      <div class="ai-buttons">
        <button type="button" class="chatgpt-btn">
          ChatGPTで画像を作成
        </button>

        <button type="button" class="gemini-btn">
          Geminiで画像を作成
        </button>

        <button type="button" class="claude-btn">
          Claudeで構成案を作成
        </button>
      </div>

      <p class="ai-message"></p>
    `;

    oldButton.insertAdjacentElement("afterend", aiBox);
  }

  oldButton.onclick = () => {
    if (!imagePdfDoc && !lastAnalysis) {
      setStatus(
        "imageStatus",
        "先にPDFを選択するか、PDF・URLの分析を行ってください。",
        true
      );
      return;
    }

    aiBox.classList.remove("hidden");

    setStatus(
      "imageStatus",
      "利用するAIを選んでください。"
    );
  };

  const message = aiBox.querySelector(".ai-message");

  aiBox.querySelector(".chatgpt-btn").onclick = () => {
    const prompt = createImagePrompt("chatgpt");

    copyAndOpen(
      prompt,
      "https://chatgpt.com/",
      message,
      "ChatGPT"
    );
  };

  aiBox.querySelector(".gemini-btn").onclick = () => {
    const prompt = createImagePrompt("gemini");

    copyAndOpen(
      prompt,
      "https://gemini.google.com/",
      message,
      "Gemini"
    );
  };

  aiBox.querySelector(".claude-btn").onclick = () => {
    const prompt = createImagePrompt("claude");

    copyAndOpen(
      prompt,
      "https://claude.ai/",
      message,
      "Claude"
    );
  };

  // AI画像を直接生成しないため、旧ダウンロード欄を非表示
  const resultBox = document.getElementById("imageResultBox");

  if (resultBox) {
    resultBox.classList.add("hidden");
  }
}

/* ========================================
   PDF分析
======================================== */

const analyzePdfButton = document.getElementById("analyzePdfBtn");

if (analyzePdfButton) {
  analyzePdfButton.onclick = async () => {
    const fileInput = document.getElementById("analysisPdf");
    const file = fileInput?.files[0];

    if (!file) {
      setStatus(
        "pdfStatus",
        "PDFを選択してください。",
        true
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setStatus(
        "pdfStatus",
        "PDFは15MB以下にしてください。",
        true
      );
      return;
    }

    busy(analyzePdfButton, true, "分析中…");

    try {
      const data = await post("/analyze-pdf", {
        fileName: file.name,
        groupName:
          document.getElementById("pdfGroup")?.value || "",
        pdfBase64: await fileBase64(file)
      });

      lastAnalysis = data.result;

      lastSource = {
        type: "pdf",
        name: file.name
      };

      renderAnalysis(
        "pdfResult",
        data.result,
        lastSource
      );

      setStatus(
        "pdfStatus",
        "分析が完了しました。"
      );
    } catch (error) {
      setStatus(
        "pdfStatus",
        error.message,
        true
      );
    } finally {
      busy(analyzePdfButton, false, "PDFを分析");
    }
  };
}

/* ========================================
   URL分析
======================================== */

const analyzeSiteButton = document.getElementById("analyzeSiteBtn");

if (analyzeSiteButton) {
  analyzeSiteButton.onclick = async () => {
    const url =
      document.getElementById("siteUrl")?.value.trim();

    if (!url) {
      setStatus(
        "siteStatus",
        "URLを入力してください。",
        true
      );
      return;
    }

    busy(analyzeSiteButton, true, "分析中…");

    try {
      const data = await post("/analyze-site", {
        url
      });

      lastAnalysis = data.result;

      lastSource = {
        type: "site",
        url
      };

      renderAnalysis(
        "siteResult",
        data.result,
        lastSource
      );

      setStatus(
        "siteStatus",
        "分析が完了しました。"
      );
    } catch (error) {
      setStatus(
        "siteStatus",
        error.message,
        true
      );
    } finally {
      busy(analyzeSiteButton, false, "サイトを分析");
    }
  };
}

/* ========================================
   分析結果の表示
======================================== */

function renderAnalysis(id, result, source) {
  const box = document.getElementById(id);

  if (!box) {
    return;
  }

  box.innerHTML = `
    <section class="analysis-section">
      <h3>要約</h3>
      <p>${esc(result.summary)}</p>
    </section>

    <section class="analysis-section">
      <h3>良い点</h3>
      ${list(result.strengths)}
    </section>

    <section class="analysis-section">
      <h3>改善点</h3>
      ${list(result.improvements)}
    </section>

    <section class="analysis-section">
      <h3>考えを深める5つの「なぜ？」</h3>
      ${list(result.whys, "why-list", "ol")}
    </section>

    <section class="analysis-section">
      <h3>次に取り組むこと</h3>
      ${list(result.nextSteps)}
    </section>

    <section class="ai-tools">
      <h3>AIを活用する</h3>

      <p class="ai-guide">
        ボタンを押すと指示文をコピーし、
        選択したAIを開きます。
      </p>

      <div class="ai-buttons">
        <button type="button" class="chatgpt-btn">
          ChatGPTで画像を作成
        </button>

        <button type="button" class="gemini-btn">
          Geminiで画像を作成
        </button>

        <button type="button" class="claude-btn">
          Claudeで構成案を作成
        </button>
      </div>

      <p class="ai-message"></p>
    </section>
  `;

  box.classList.remove("hidden");

  const message = box.querySelector(".ai-message");

  box.querySelector(".chatgpt-btn").onclick = () => {
    const prompt =
      createAnalysisPrompt(result, source, "chatgpt");

    copyAndOpen(
      prompt,
      "https://chatgpt.com/",
      message,
      "ChatGPT"
    );
  };

  box.querySelector(".gemini-btn").onclick = () => {
    const prompt =
      createAnalysisPrompt(result, source, "gemini");

    copyAndOpen(
      prompt,
      "https://gemini.google.com/",
      message,
      "Gemini"
    );
  };

  box.querySelector(".claude-btn").onclick = () => {
    const prompt =
      createAnalysisPrompt(result, source, "claude");

    copyAndOpen(
      prompt,
      "https://claude.ai/",
      message,
      "Claude"
    );
  };
}

/* ========================================
   AI用の指示文を作成
======================================== */

function createAnalysisPrompt(result, source, aiType) {
  const sourceText =
    source.type === "pdf"
      ? `このあと添付するPDF「${source.name}」`　
      : `次のWebサイト\n${source.url}`;

  const common = `${sourceText}と、以下の分析結果をもとに、
高校生の探究発表資料を作成してください。

【要約】
${result.summary}

【良い点】
${numberedText(result.strengths)}

【改善点】
${numberedText(result.improvements)}

【考えを深める5つの「なぜ？」】
${numberedText(result.whys)}

【次に取り組むこと】
${numberedText(result.nextSteps)}

【必ず入れる内容】
・探究テーマ
・現在の課題
・関係する職業
・職業ごとの仕事内容
・必要な知識や技術
・活躍する場所
・未来への展望
・考えを深める「なぜ？」を5つ

【注意】
・資料にない事実や数値を勝手に作らない
・確認できない内容は断定しない
・高校生が理解しやすい日本語にする`;

  if (aiType === "claude") {
    return `${common}

画像そのものではなく、A4縦長の発表ポスターの構成案を作成してください。

各欄について、次の内容を示してください。
・見出し
・掲載する文章
・図やアイコンの案
・配置
・配色
・発表時に補足する内容`;
  }

  if (aiType === "gemini") {
    return `${common}

この内容をもとに、日本語のインフォグラフィック画像を作成してください。

【デザイン】
・A4縦長
・高校生向け
・明るく読みやすい
・イラストやアイコンを多めにする
・内容ごとに枠で整理する
・重要な言葉を目立たせる
・文字が途中で切れないようにする`;
  }

  return `${common}

この内容をもとに、日本語のインフォグラフィック画像を作成してください。

【デザイン】
・A4縦長
・高校生の探究発表用
・見出し、図、アイコン、箇条書きを使う
・職業が分かる人物イラストを入れる
・文字を正確で読みやすくする
・情報を詰め込みすぎない
・学校で掲示できる完成度にする`;
}

function createImagePrompt(aiType) {
  const groupName =
    document.getElementById("imageGroup")?.value.trim() ||
    "班名未入力";

  const pageNumber =
    document.getElementById("imagePage")?.value || "1";

  const style =
    document.getElementById("imageStyle")
      ?.selectedOptions[0]?.textContent ||
    "学校向けの読みやすいデザイン";

  const extra =
    document.getElementById("imagePrompt")?.value.trim();

  const sourceName =
    imagePdf?.files[0]?.name ||
    lastSource?.name ||
    "探究資料";

  const analysisText = lastAnalysis
    ? `
【分析結果】

要約：
${lastAnalysis.summary}

良い点：
${numberedText(lastAnalysis.strengths)}

改善点：
${numberedText(lastAnalysis.improvements)}

5つの「なぜ？」：
${numberedText(lastAnalysis.whys)}

次に取り組むこと：
${numberedText(lastAnalysis.nextSteps)}
`
    : "";

  const base = `このあと添付するPDF「${sourceName}」をもとに、
高校生の探究発表資料を作成してください。

【基本情報】
・班名：${groupName}
・対象ページ：${pageNumber}ページ目
・希望するデザイン：${style}
${extra ? `・追加の希望：${extra}` : ""}

${analysisText}

【必ず入れる内容】
・探究テーマ
・現在の課題
・関係する職業
・職業ごとの仕事内容
・必要な知識や技術
・活躍する場所
・未来への展望
・考えを深める「なぜ？」を5つ

【注意】
・PDFに書かれている内容を中心にする
・PDFにない事実や数値を勝手に追加しない
・判読できない内容を推測しない
・高校生に分かりやすい日本語にする`;

  if (aiType === "claude") {
    return `${base}

画像生成ではなく、A4縦長ポスターの構成案を作成してください。
見出し、文章、配置、配色、図やアイコンの案を示してください。`;
  }

  return `${base}

日本語のA4縦長インフォグラフィック画像を作成してください。
見出し、図、アイコン、箇条書きを使い、
文字が読みやすい学校掲示用ポスターにしてください。`;
}

/* ========================================
   指示文をコピーしてAIを開く
======================================== */

async function copyAndOpen(
  prompt,
  url,
  messageElement,
  aiName
) {
  // ポップアップブロックを避けるため先に画面を開く
  const newWindow = window.open("", "_blank");

  try {
    await copyText(prompt);

    if (messageElement) {
      messageElement.textContent =
        `指示文をコピーしました。${aiName}でPDFを添付し、貼り付けてください。`;
    }

    if (newWindow) {
      newWindow.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  } catch (error) {
    if (newWindow) {
      newWindow.close();
    }

    if (messageElement) {
      messageElement.textContent =
        "指示文をコピーできませんでした。ブラウザの設定を確認してください。";
    }
  }
}

async function copyText(text) {
  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.select();

  const successful =
    document.execCommand("copy");

  textarea.remove();

  if (!successful) {
    throw new Error("コピーに失敗しました。");
  }
}

/* ========================================
   Render APIとの通信
======================================== */

async function post(path, body) {
  const response = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "サーバーから正しい応答を受け取れませんでした。"
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || "処理に失敗しました。"
    );
  }

  return data;
}

/* ========================================
   共通処理
======================================== */

function fileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(
        String(reader.result).split(",")[1]
      );
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function numberedText(items) {
  return (items || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
}

function list(items, className = "", tag = "ul") {
  const content = (items || [])
    .map(item => `<li>${esc(item)}</li>`)
    .join("");

  return `<${tag} class="${className}">${content}</${tag}>`;
}

function esc(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);

  if (!element) {
    return;
  }

  element.textContent = message;
  element.style.color =
    isError ? "#b91c1c" : "#1d4ed8";
}

function busy(button, isBusy, text) {
  if (!button) {
    return;
  }

  button.disabled = isBusy;
  button.textContent = text;
}
