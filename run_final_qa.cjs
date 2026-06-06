const fs = require('fs');
async function request(ep, body) {
  try {
    const res = await fetch('http://127.0.0.1:3000' + ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch(e) {
    return { error: e.message };
  }
}

async function run() {
  const rs = {};
  
  rs.A = await request('/api/ai/parseEmail', { email: { subject: 'Cargo open', sender: 'broker@cargo.com', rawBody: 'Firm 30,000 mt wheat, Houston to Rotterdam, laycan 15-20 June.' } });
  
  rs.B = await request('/api/ai/parseEmail', { email: { subject: 'Cargo query', sender: 'broker@cargo.com', rawBody: 'Need 25,000 mt bagged rice from Kandla to Chittagong. Please advise.' } });
  
  rs.C = await request('/api/ai/parseEmail', { email: { subject: 'Vessel open', sender: 'owner@vessel.com', rawBody: 'MV PACIFIC 50,000 dwt open Singapore 20-25 June.' } });
  
  rs.D = await request('/api/ai/parseEmail', { email: { subject: 'Vessel open', sender: 'owner@vessel.com', rawBody: 'MV ATLANTIC open Rotterdam 12 July.' } });
  
  rs.E = await request('/api/ai/parseEmail', { email: { subject: 'Vessel open', sender: 'owner@vessel.com', rawBody: 'MV STALE 40,000 dwt open Dubai 1 May.' } });
  
  rs.F = await request('/api/ai/matchVessels', { cargo: { commodity: "wheat", quantity: "30,000 mt", loadPort: "Houston", dischargePort: "Rotterdam", laycan: "15-20 June" }, vessels: [ { name: "MV PERFECT", dwt: "35,000", openPort: "Houston", openDate: "16 June" }, { name: "MV WRONG", dwt: "10,000", openPort: "Singapore", openDate: "1 August" } ] });
  
  rs.G = await request('/api/ai/matchVessels', { cargo: { commodity: "wheat", quantity: "30,000 mt", loadPort: "Houston", dischargePort: "Rotterdam", laycan: "15-20 June" }, vessels: [ { name: "MV RISKY", dwt: "35,000", openPort: "Houston", openDate: "16 June", remarks: "Vessel has outstanding class recommendations and unresolved detentions" } ] });
  
  rs.H = await request('/api/ai/routeTask', { taskType: 'analyze_risk', payload: { vessel: {name: 'OCEANIC'}, terms: 'Customary Quick Dispatch (CQD) at load port' } });
  
  rs.I = await request('/api/ai/routeTask', { taskType: 'analyze_risk', payload: { vessel: {name: 'OCEANIC'}, terms: 'Analyze fixture risk: Freight USD 20/mt. Laytime 10,000 mt SHINC load / 8,000 mt SHEX discharge. Demurrage/despatch not stated.' } });
  
  fs.writeFileSync('final_qa_out.json', JSON.stringify(rs, null, 2));
}

run();
