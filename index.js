const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccount.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: 'YOUR_OPENAI_API_KEY', // replace this
});

const sessions = {};

const initialState = {
  step: 'greet',
  pincode: null,
  hasCard: null,
  history: [],
};

const prompts = {
  greet: "Namaste! Main Navya bol rahi hoon SecureSwipe credit card team se. Kya main aapse kuch second baat kar sakti hoon?",
  pitch: "Hamare paas ek behtareen credit card offer hai — cashback, lounge access aur koi annual fee nahi hai.",
  askPincode: "Kya main aapka pincode jaan sakti hoon taaki main aapke area ke cards dikha sakoon?",
  askBank: "Kya aapke paas HDFC, ICICI ya Axis ka card hai?",
  offer: "Main aapko ek shandar cashback card recommend karti hoon. Kya main uska link bhej doon?",
  close: "Koi baat nahi, dhanyavaad aapka samay dene ke liye. Shubh din ho aapka!",
};

app.post('/webhook', async (req, res) => {
  const userMessage = req.body._transcript?.trim();
  const sessionId = req.body.session_id || req.body.call_id || 'default';

  if (!userMessage) {
    return res.json({
      text: "Main aapki madad ke liye yahan hoon. Kripya kuch boliye.",
      end_call: false
    });
  }

  console.log("📞 User said:", userMessage);

  if (!sessions[sessionId]) {
    sessions[sessionId] = { ...initialState };
  }

  const session = sessions[sessionId];
  const history = session.history;
  history.push({ role: 'user', content: userMessage });

  const yesWords = ['haan', 'yes', 'ok', 'okay', 'sure', 'thik', 'ji'];
  const pinMatch = userMessage.match(/\b\d{6}\b/);
  const mentionedBank = /hdfc|icici|axis/i.test(userMessage);

  if (session.step === 'askPincode' && pinMatch) {
    session.pincode = pinMatch[0];
    session.step = 'askBank';
  } else if (session.step === 'askBank') {
    session.hasCard = mentionedBank;
    session.step = 'offer';
  } else if (session.step === 'offer' && /nah(i|in)|no|nahi/i.test(userMessage)) {
    session.step = 'close';
  }

  let systemPrompt = "";
  const stepPrompts = {
    greet: "Greet the customer and ask for permission to continue.",
    pitch: "Explain the credit card offer with cashback, lounge access, and no annual fee.",
    askPincode: "Ask for the user's 6-digit pincode to show local offers.",
    askBank: "Ask if they already have an HDFC, ICICI, or Axis credit card.",
    offer: "Based on their answers, recommend a cashback card and ask if you should send the link.",
    close: "Politely thank the customer and end the call."
  };

  systemPrompt = `
You are Navya from SecureSwipe, a professional and friendly Indian credit card sales caller.

Your task is: ${stepPrompts[session.step]}

📜 Respond naturally in Roman Hindi or English. Answer any side questions briefly, then continue your step.
📅 Always sound like a real human caller — not robotic or scripted.
🛑 Never say you're an AI.
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
    });

    const reply = completion.choices[0].message.content;
    history.push({ role: 'assistant', content: reply });

    await db.collection('calls').add({
      sessionId,
      timestamp: new Date(),
      userMessage,
      aiReply: reply,
      step: session.step,
      pincode: session.pincode,
      hasCard: session.hasCard
    });

    res.json({
      text: reply,
      end_call: session.step === 'close' || session.step === 'done'
    });

  } catch (err) {
    console.error("❌ OpenAI Error:", err.message);
    res.json({
      text: "Maafi chahti hoon, kuch samasya ho gayi hai. Kripya baad mein call kijiye.",
      end_call: true
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Hybrid AI server running at http://localhost:${PORT}`);
});
