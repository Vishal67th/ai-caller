const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'uploads/' });
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Serve UI
app.use(express.static(path.join(__dirname, 'public')));

// Upload endpoint
app.post('/upload', upload.single('csvFile'), (req, res) => {
  const filePath = path.join(__dirname, 'uploads/phone_number.csv');
  fs.rename(req.file.path, filePath, (err) => {
    if (err) return res.status(500).send('❌ Upload failed');
    res.send('✅ Uploaded successfully');
  });
});

// Call start
app.get('/upload/start-calling', (req, res) => {
  const filePath = path.join(__dirname, 'uploads/phone_number.csv');
  const numbers = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => row.phone && numbers.push(row.phone))
    .on('end', async () => {
      for (const number of numbers) {
        try {
          await client.calls.create({
            to: number,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${process.env.NGROK_URL}/twiml`,
          });
          console.log(`📞 Calling: ${number}`);
        } catch (err) {
          console.error(`❌ Error calling ${number}:`, err.message);
        }
      }
      res.send('📞 All calls initiated.');
    });
});

// TwiML response
aapp.all('/twiml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.status(200).send(`
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="Polly.Aditi-Neural" language="hi-IN">
        SecureSwipe se call hai. Yeh ek test hai. Dhanyavaad.
      </Say>
    </Response>
  `.trim());
});



app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
