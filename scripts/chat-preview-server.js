'use strict';

// Lokale preview met een nagebootst modelantwoord. Niet het startcommando van Railway.
// Zet de widget aan en laat /api/chat/message een vast, Nederlands antwoord geven
// zodat de prijsregel op de server blijft beslissen.

process.env.CHAT_WIDGET_ENABLED = 'true';
delete process.env.XAI_API_KEY;

const chat = require('../lib/chat-api');
const app = require('../server');

chat.setComplete(function (payload) {
  const sys = payload.messages[0].content;
  const last = payload.messages[payload.messages.length - 1].content;
  if (/CONTACT_GEGEVEN: ja/.test(sys)) {
    return Promise.resolve({
      reply: 'Dank u. Op de tarievenpagina staat een arbeidsdeskundig onderzoek voor € 1.095 (standaard) of € 1.295 (geregistreerde arbeidsdeskundige). De controle van de WHK-beschikking is gratis. Bel 06-50213593 of laat uw gegevens achter.'
    });
  }
  if (/teruggebeld|offerte|kennismaking/i.test(last) && !/kost|prijs|tarief/i.test(last)) {
    return Promise.resolve({ reply: 'Dan zet ik het formulier voor u klaar. [[LEADFORM]]' });
  }
  if (/kost|prijs|tarief/i.test(last)) {
    return Promise.resolve({ reply: 'Een arbeidsdeskundig onderzoek kost € 1.095.' });
  }
  return Promise.resolve({
    reply: 'De Werkhervattingskas is de gedifferentieerde premie met een ZW-deel en een WGA-deel. In 2026 ligt het landelijk gemiddelde van de WGA-premie op 0,96%. De bijlage bij de beschikking is het stuk om te controleren. Bij twijfel doet u de gratis WHK-check op de homepage.'
  });
});

const port = Number(process.env.PORT || 3456);
app.listen(port, '0.0.0.0', function () {
  console.log('Chat-preview op http://127.0.0.1:' + port + '/?chatpreview=1');
});
