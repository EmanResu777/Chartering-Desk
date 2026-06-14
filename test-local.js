const email = {
  id: 'manual-123',
  sender: 'Manual Entry',
  subject: 'Manual Entry: Cargo',
  rawBody: 'loading sequence 3 days prior to actual direct loading.\n5 pct'
};
fetch('http://127.0.0.1:3000/api/ai/parseEmail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email, userId: 'testId123', expectedType: 'CARGO' })
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
}).catch(console.error);
