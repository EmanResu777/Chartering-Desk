import fetch from 'node-fetch';

const text = `Saint Petersburg / Puerto Cabello
abt 5,519CBM g/c TOOLS EQUIPMENTS, construction and parts, civil.
25–31.03.2026
FIOS
5 PCT

Pasir Gudang / Rotterdam or Antwerp
8,000-10,000 mts coil u.w. 8 ton to 24 ton but majority 8-12 MT/coils, 3 tiers stackable
Load/ Discharge rate : CQD
19- 26th March 2026
Carrier shall advise and provide the coil loading sequence 3 days prior to actual direct loading.
5 pct`;

async function run() {
  const req = await fetch('http://127.0.0.1:3000/api/ai/parseEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        rawBody: text,
        subject: "Manual Broker Text",
        sender: "Manual Entry"
      },
      userId: "testId123",
      expectedType: "CARGO"
    })
  });
  console.log(req.status);
  const json = await req.json();
  console.log(JSON.stringify(json, null, 2));
}

run();
