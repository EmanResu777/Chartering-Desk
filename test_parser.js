import fetch from "node-fetch";

async function run() {
  const req = await fetch('http://127.0.0.1:3000/api/ai/parseEmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        rawBody: `loading sequence 3 days prior to actual direct loading.
5 pct`,
        subject: "",
        sender: "Manual Entry"
      },
      userId: "testId123",
      expectedType: "CARGO"
    })
  });
  console.log(req.status);
  const text = await req.text();
  console.log(text);
}
run();
