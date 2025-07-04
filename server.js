
require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors());
const PORT = process.env.PORT || 5001;

app.use(express.json());

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Add this new endpoint to list available models
app.get('/models', async (req, res) => {
  try {
    const { models } = await genAI.listModels();
    const modelNames = models.map(model => model.name);
    res.json(modelNames);
  } catch (error) {
    console.error("Error listing models:", error);
    res.status(500).send("Error listing models.");
  }
});

app.post('/chat', async (req, res) => {
  const { history, message, patientSetting } = req.body;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const chat = model.startChat({
    history: history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.parts[0].text }]
    })),
    generationConfig: {
      maxOutputTokens: 200,
    },
  });

  let prompt = "";
  if (patientSetting === "firstTime") {
    prompt = `あなたは心不全に初めてなった患者です。看護師の指導に対して、素直に耳を傾け、分からないことは質問してください。看護師からの問いかけに対して、患者として応答してください。看護師の発言は生成せず、患者としての返答のみを生成してください。`;
  } else if (patientSetting === "nonCompliant") {
    prompt = `あなたは心不全で入退院を繰り返しているコンプライアンスの悪い患者です。看護師の指導に対して、「そんなことできないよ」「分からない」など否定的な気持ちを表出してください。看護師からの問いかけに対して、患者として応答してください。看護師の発言は生成せず、患者としての返答のみを生成してください。`;
  }

  try {
    const result = await chat.sendMessage(prompt + message);
    const response = await result.response;
    const text = response.text();
    res.send(text);
  } catch (error) {
    console.error("Error communicating with Gemini API:", error);
    res.status(500).send("Error communicating with AI.");
  }
});

// 評価エンドポイント
app.post('/evaluate', async (req, res) => {
  const { history, patientSetting } = req.body;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const historyText = history.map(msg => {
    const role = msg.role === 'user' ? '看護師' : '患者';
    return `${role}: ${msg.parts[0].text}`;
  }).join('\n');

  let evaluationPrompt = `あなたは心不全指導シミュレーターの評価者です。以下のチャット履歴を元に、看護師の指導内容を100点満点で評価し、その評価ポイントを具体的に説明してください。

**評価の最重要項目は、医療的な観点からの内容の正確性です。誤った指導は患者の状態を著しく悪化させる危険があるため、重大な減点対象となります。**

学習者のモチベーションを高めるため、ポジティブな言葉遣いを心がけることは重要ですが、それ以上に、正確で安全な指導ができているかを厳しく評価してください。良かった点、そして特に改善が必要な点を、具体的な理由と共に明確に指摘してください。

**評価の参考情報として、以下の心不全診療ガイドラインの要点を考慮してください。**

*   **心不全の定義:** 何らかの心臓機能障害によって体の需要に見合う血液を供給できなくなった状態。
*   **診断:** 症状、身体所見、バイオマーカー（BNP/NT-proBNP）、心エコー検査などを通じて行われる。
*   **治療の基本方針:** 生命予後の改善と生活の質（QOL）の向上を目標とし、心不全の進行ステージ（AからD）に応じた介入が推奨される。
*   **薬物療法 (GDMT):** ACE阻害薬/ARB、β遮断薬、MRA、SGLT2阻害薬を基本薬とする。
*   **うっ血管理:** 利尿薬による管理が重要。
*   **非薬物療法:** 運動療法や植込み型デバイス（ICD/CRT）などが病態に応じて選択される。
*   **急性増悪時の対応:** 酸素投与や呼吸管理、血管拡張薬や強心薬を用いた初期対応が重要。
*   **包括的アプローチ:** 緩和ケアの重要性や、多職種チームによる疾病管理、患者教育、社会復帰支援が必要。

患者設定: ${patientSetting === "firstTime" ? "心不全に初めてなった患者" : "心不全で入退院を繰り返しているコンプライアンスの悪い患者"}

チャット履歴:
${historyText}

評価は以下の形式で出力してください。

点数: [点数]/100
評価ポイント: [具体的な評価ポイント。良かった点、改善点などをポジティブな言葉で記述。}]`;

  try {
    const result = await model.generateContent(evaluationPrompt);
    const response = await result.response;
    const text = response.text();
    res.json({ evaluation: text });
  } catch (error) {
    console.error("Error evaluating simulation:", error);
    res.status(500).send("Error generating evaluation.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
