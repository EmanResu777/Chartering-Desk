const fs = require('fs');

const cases = [];

// Helper to push M cases
function addM(id, desc, cargo, vessels, best, action, rejected = undefined) {
    const criticalFields = {
        best_vessel: best,
        recommended_action: action
    };
    if (rejected !== undefined) {
        criticalFields.rejected_vessels = rejected;
    }
    cases.push({
        id: id,
        category: "MATCHING",
        endpoint: "/api/ai/matchVessels",
        payload: {
            testMode: true,
            dryRun: true,
            cargo: cargo,
            vessels: vessels
        },
        expected: {
            modelExpected: "gemini-2.5-pro",
            endpointExpected: "/api/ai/matchVessels",
            criticalFields: criticalFields,
            humanExpectedDecision: action,
            severityIfFailed: "High",
            shouldReject: action === "Reject",
            shouldFlagRisk: action === "Reject" || action === "Check",
            shouldNotHallucinateFields: [
                "freight_idea"
            ]
        }
    });
}

// M-001: Perfect match
addM("M-001", "Perfect match", 
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "15-20 June", quantity: "30000mt", cargo_type: "Grains" },
    [
        { vessel_name: "MV Perfect Fit", dwt: 35000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Too Big", dwt: 150000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Too Late", dwt: 35000, open_port: "Houston", open_date: "25 June" },
        { vessel_name: "MV Too Small", dwt: 15000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Far Away", dwt: 35000, open_port: "Singapore", open_date: "10 June" }
    ],
    "MV Perfect Fit", "Proceed"
);
// For M-001, M-015, M-019, M-020 proceed without operational risk -> shouldFlagRisk: false
cases[0].expected.shouldFlagRisk = false;

// M-002: DWT too small
addM("M-002", "DWT too small", 
    { load_port: "Miami", discharge_port: "Santos", laycan: "1-5 July", quantity: "45000mt", cargo_type: "Sugar" },
    [
        { vessel_name: "MV Tiny 1", dwt: 10000, open_port: "Miami", open_date: "1 July" },
        { vessel_name: "MV Tiny 2", dwt: 20000, open_port: "Miami", open_date: "1 July" },
        { vessel_name: "MV Tiny 3", dwt: 25000, open_port: "Miami", open_date: "1 July" },
        { vessel_name: "MV Tiny 4", dwt: 30000, open_port: "Miami", open_date: "1 July" },
        { vessel_name: "MV Tiny 5", dwt: 15000, open_port: "Miami", open_date: "1 July" }
    ],
    "None", "Reject"
);

// M-003: DWT too large / poor economics
addM("M-003", "DWT too large",
    { load_port: "Santos", discharge_port: "Lisbon", laycan: "10-20 Aug", quantity: "10000mt", cargo_type: "Sugar" },
    [
        { vessel_name: "MV Cape 1", dwt: 180000, open_port: "Santos", open_date: "10 Aug" },
        { vessel_name: "MV Cape 2", dwt: 175000, open_port: "Santos", open_date: "10 Aug" },
        { vessel_name: "MV Panamax 1", dwt: 75000, open_port: "Santos", open_date: "10 Aug" },
        { vessel_name: "MV Panamax 2", dwt: 80000, open_port: "Santos", open_date: "10 Aug" },
        { vessel_name: "MV Kamsarmax", dwt: 82000, open_port: "Santos", open_date: "10 Aug" }
    ],
    "None", "Reject"
);

// M-004: Bad laycan
addM("M-004", "Bad laycan",
    { load_port: "Durban", discharge_port: "Mombasa", laycan: "1-5 Sept", quantity: "20000mt", cargo_type: "Coal" },
    [
        { vessel_name: "MV Late 1", dwt: 25000, open_port: "Durban", open_date: "15 Sept" },
        { vessel_name: "MV Late 2", dwt: 25000, open_port: "Durban", open_date: "20 Sept" },
        { vessel_name: "MV Late 3", dwt: 25000, open_port: "Durban", open_date: "25 Sept" },
        { vessel_name: "MV Late 4", dwt: 25000, open_port: "Durban", open_date: "10 Sept" },
        { vessel_name: "MV Late 5", dwt: 25000, open_port: "Durban", open_date: "18 Sept" }
    ],
    "None", "Reject"
);

// M-005: Long ballast / bad open position
addM("M-005", "Long ballast",
    { load_port: "Rotterdam", discharge_port: "New York", laycan: "10-15 Oct", quantity: "30000mt", cargo_type: "Steel" },
    [
        { vessel_name: "MV Far East", dwt: 35000, open_port: "Tokyo", open_date: "10 Oct" },
        { vessel_name: "MV Australia", dwt: 35000, open_port: "Sydney", open_date: "10 Oct" },
        { vessel_name: "MV South Africa", dwt: 35000, open_port: "Cape Town", open_date: "10 Oct" },
        { vessel_name: "MV West Coast", dwt: 35000, open_port: "Los Angeles", open_date: "10 Oct" },
        { vessel_name: "MV Pacific", dwt: 35000, open_port: "Fiji", open_date: "10 Oct" }
    ],
    "None", "Reject"
);

// M-006: Gear mismatch
addM("M-006", "Gear mismatch",
    { load_port: "Lagos", discharge_port: "Dakar", laycan: "1-10 Nov", quantity: "20000mt", cargo_type: "Rice", gear_required: true },
    [
        { vessel_name: "MV Gearless 1", dwt: 25000, open_port: "Lagos", open_date: "1 Nov", gear_type: "Gearless" },
        { vessel_name: "MV Gearless 2", dwt: 25000, open_port: "Lagos", open_date: "1 Nov", gear_type: "Gearless" },
        { vessel_name: "MV Gearless 3", dwt: 25000, open_port: "Lagos", open_date: "1 Nov", gear_type: "Gearless" },
        { vessel_name: "MV Gearless 4", dwt: 25000, open_port: "Lagos", open_date: "1 Nov", gear_type: "Gearless" },
        { vessel_name: "MV Gearless 5", dwt: 25000, open_port: "Lagos", open_date: "1 Nov", gear_type: "Gearless" }
    ],
    "None", "Reject"
);

// M-007: Project cargo lift impossibility
addM("M-007", "Project cargo lift impossibility",
    { load_port: "Bremen", discharge_port: "Shanghai", laycan: "15-20 Nov", quantity: "5000mt", cargo_type: "Project Cargo", max_unit_weight_mt: 200 },
    [
        { vessel_name: "MV Weak Cranes 1", dwt: 15000, open_port: "Bremen", open_date: "15 Nov", gear_capacity_mt: 30 },
        { vessel_name: "MV Weak Cranes 2", dwt: 15000, open_port: "Bremen", open_date: "15 Nov", gear_capacity_mt: 50 },
        { vessel_name: "MV Weak Cranes 3", dwt: 15000, open_port: "Bremen", open_date: "15 Nov", gear_capacity_mt: 40 },
        { vessel_name: "MV Weak Cranes 4", dwt: 15000, open_port: "Bremen", open_date: "15 Nov", gear_capacity_mt: 30 },
        { vessel_name: "MV Weak Cranes 5", dwt: 15000, open_port: "Bremen", open_date: "15 Nov", gear_capacity_mt: 25 }
    ],
    "None", "Reject"
);

// M-008: Cargo restriction conflict
addM("M-008", "Cargo restriction conflict",
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "1-5 Dec", quantity: "30000mt", cargo_type: "Petcoke" },
    [
        { vessel_name: "MV Clean Only 1", dwt: 35000, open_port: "Houston", open_date: "1 Dec", restrictions: "No dirty cargoes, no petcoke" },
        { vessel_name: "MV Clean Only 2", dwt: 35000, open_port: "Houston", open_date: "1 Dec", restrictions: "No coal, no petcoke" },
        { vessel_name: "MV Clean Only 3", dwt: 35000, open_port: "Houston", open_date: "1 Dec", restrictions: "Clean cargoes only" },
        { vessel_name: "MV Clean Only 4", dwt: 35000, open_port: "Houston", open_date: "1 Dec", restrictions: "Excl petcoke" },
        { vessel_name: "MV Clean Only 5", dwt: 35000, open_port: "Houston", open_date: "1 Dec", restrictions: "Strictly no petcoke" }
    ],
    "None", "Reject"
);

// M-009: Grain cargo requiring clean holds
addM("M-009", "Hold cleaning risk",
    { load_port: "New Orleans", discharge_port: "Alexandria", laycan: "10-20 Dec", quantity: "25000mt", cargo_type: "Wheat" },
    [
        { vessel_name: "MV Dirty Last 1", dwt: 30000, open_port: "New Orleans", open_date: "10 Dec", last_cargo: "Coal" },
        { vessel_name: "MV Far", dwt: 30000, open_port: "Tokyo", open_date: "10 Dec", last_cargo: "Grains" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "New Orleans", open_date: "10 Dec", last_cargo: "Grains" },
        { vessel_name: "MV Big", dwt: 150000, open_port: "New Orleans", open_date: "10 Dec", last_cargo: "Grains" },
        { vessel_name: "MV Dirty Last 2", dwt: 30000, open_port: "New Orleans", open_date: "10 Dec", last_cargo: "Petcoke" }
    ],
    "MV Dirty Last 1", "Check"
);

// M-010: Draft / port limitation
addM("M-010", "Draft limitation",
    { load_port: "Rio Grande", discharge_port: "Dakar", laycan: "1-10 Jan", quantity: "40000mt", cargo_type: "Grains", max_draft: "10.0m" },
    [
        { vessel_name: "MV Deep Draft 1", dwt: 45000, open_port: "Rio Grande", open_date: "1 Jan", draft: "12.5m" },
        { vessel_name: "MV Deep Draft 2", dwt: 45000, open_port: "Rio Grande", open_date: "1 Jan", draft: "11.5m" },
        { vessel_name: "MV Deep Draft 3", dwt: 45000, open_port: "Rio Grande", open_date: "1 Jan", draft: "12.0m" },
        { vessel_name: "MV Deep Draft 4", dwt: 45000, open_port: "Rio Grande", open_date: "1 Jan", draft: "13.0m" },
        { vessel_name: "MV Deep Draft 5", dwt: 45000, open_port: "Rio Grande", open_date: "1 Jan", draft: "11.8m" }
    ],
    "None", "Reject"
);

// M-011: Wrong trade direction
addM("M-011", "Wrong trade direction",
    { load_port: "Singapore", discharge_port: "Shanghai", laycan: "1-5 Feb", quantity: "20000mt", cargo_type: "Steel" },
    [
        { vessel_name: "MV Westbound Only 1", dwt: 25000, open_port: "Singapore", open_date: "1 Feb", desired_direction: "Direction Med" },
        { vessel_name: "MV Westbound Only 2", dwt: 25000, open_port: "Singapore", open_date: "1 Feb", desired_direction: "Direction USG" },
        { vessel_name: "MV Westbound Only 3", dwt: 25000, open_port: "Singapore", open_date: "1 Feb", desired_direction: "Direction Continent" },
        { vessel_name: "MV Westbound Only 4", dwt: 25000, open_port: "Singapore", open_date: "1 Feb", desired_direction: "Direction Black Sea" },
        { vessel_name: "MV Westbound Only 5", dwt: 25000, open_port: "Singapore", open_date: "1 Feb", desired_direction: "Direction UK" }
    ],
    "None", "Reject"
);

// M-012: Sanctions restriction
addM("M-012", "Sanctions restriction",
    { load_port: "Bandar Abbas", discharge_port: "Mumbai", laycan: "10-20 Feb", quantity: "30000mt", cargo_type: "Urea" },
    [
        { vessel_name: "MV Safe 1", dwt: 35000, open_port: "Bandar Abbas", open_date: "10 Feb", restrictions: "Excl sanctioned countries/cargoes" },
        { vessel_name: "MV Safe 2", dwt: 35000, open_port: "Bandar Abbas", open_date: "10 Feb", restrictions: "No Iran" },
        { vessel_name: "MV Safe 3", dwt: 35000, open_port: "Bandar Abbas", open_date: "10 Feb", restrictions: "No sanctioned zones" },
        { vessel_name: "MV Safe 4", dwt: 35000, open_port: "Bandar Abbas", open_date: "10 Feb", restrictions: "Trading excluding OFAC sanctioned countries" },
        { vessel_name: "MV Safe 5", dwt: 35000, open_port: "Bandar Abbas", open_date: "10 Feb", restrictions: "Strictly worldwide excl sanctioned" }
    ],
    "None", "Reject"
);

// M-013: Ice class requirement
addM("M-013", "Ice class requirement",
    { load_port: "St Petersburg", discharge_port: "Rotterdam", laycan: "1-10 Jan", quantity: "20000mt", cargo_type: "Steel", required_ice_class: "1A" },
    [
        { vessel_name: "MV Summer 1", dwt: 25000, open_port: "St Petersburg", open_date: "1 Jan", ice_class: "None" },
        { vessel_name: "MV Summer 2", dwt: 25000, open_port: "St Petersburg", open_date: "1 Jan", ice_class: "None" },
        { vessel_name: "MV Summer 3", dwt: 25000, open_port: "St Petersburg", open_date: "1 Jan", ice_class: "None" },
        { vessel_name: "MV Summer 4", dwt: 25000, open_port: "St Petersburg", open_date: "1 Jan", ice_class: "None" },
        { vessel_name: "MV Summer 5", dwt: 25000, open_port: "St Petersburg", open_date: "1 Jan", ice_class: "None" }
    ],
    "None", "Reject"
);

// M-014: High stowage factor / volume mismatch
addM("M-014", "Stowage factor mismatch",
    { load_port: "Seattle", discharge_port: "Tokyo", laycan: "1-5 Mar", quantity: "30000mt", cargo_type: "Woodchips", stowage_factor: 110, cubic_required: 3300000 },
    [
        { vessel_name: "MV Heavy Cargo 1", dwt: 35000, open_port: "Seattle", open_date: "1 Mar", cubic_capacity: 1500000 },
        { vessel_name: "MV Heavy Cargo 2", dwt: 35000, open_port: "Seattle", open_date: "1 Mar", cubic_capacity: 1400000 },
        { vessel_name: "MV Heavy Cargo 3", dwt: 35000, open_port: "Seattle", open_date: "1 Mar", cubic_capacity: 1600000 },
        { vessel_name: "MV Heavy Cargo 4", dwt: 35000, open_port: "Seattle", open_date: "1 Mar", cubic_capacity: 1550000 },
        { vessel_name: "MV Heavy Cargo 5", dwt: 35000, open_port: "Seattle", open_date: "1 Mar", cubic_capacity: 1450000 }
    ],
    "None", "Reject"
);

// M-015: Partial cargo / top-up opportunity
addM("M-015", "Top-up opportunity",
    { load_port: "Rotterdam", discharge_port: "Houston", laycan: "10-20 Mar", quantity: "10000mt", cargo_type: "Steel" },
    [
        { vessel_name: "MV Space Available", dwt: 40000, open_port: "Rotterdam", open_date: "10 Mar", available_capacity_mt: 12000, already_booked: "28000mt Steel for Houston" },
        { vessel_name: "MV Full", dwt: 40000, open_port: "Rotterdam", open_date: "10 Mar", available_capacity_mt: 0 },
        { vessel_name: "MV Too Big", dwt: 150000, open_port: "Rotterdam", open_date: "10 Mar" },
        { vessel_name: "MV Wrong Way", dwt: 35000, open_port: "Rotterdam", open_date: "10 Mar", desired_direction: "Direction Far East" },
        { vessel_name: "MV Far Away", dwt: 35000, open_port: "Shanghai", open_date: "10 Mar" }
    ],
    "MV Space Available", "Proceed"
);
cases[14].expected.shouldFlagRisk = false;

// M-016: Good operational fit but weak economics
addM("M-016", "Weak economics",
    { load_port: "Durban", discharge_port: "Mombasa", laycan: "1-10 Apr", quantity: "30000mt", cargo_type: "Coal", freight_idea: "Low" },
    [
        { vessel_name: "MV Expensive Position", dwt: 35000, open_port: "Durban", open_date: "1 Apr", owner_idea: "High" },
        { vessel_name: "MV Wrong Gear", dwt: 35000, open_port: "Durban", open_date: "1 Apr", gear_type: "Gearless" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "Durban", open_date: "1 Apr" },
        { vessel_name: "MV Big", dwt: 150000, open_port: "Durban", open_date: "1 Apr" },
        { vessel_name: "MV Far", dwt: 35000, open_port: "Singapore", open_date: "1 Apr" }
    ],
    "MV Expensive Position", "Check"
);
cases[15].expected.shouldNotHallucinateFields = [];

// M-017: Good commercial fit but operational risk
addM("M-017", "Operational risk",
    { load_port: "Shanghai", discharge_port: "Los Angeles", laycan: "10-15 Apr", quantity: "40000mt", cargo_type: "Steel" },
    [
        { vessel_name: "MV Congested", dwt: 45000, open_port: "Shanghai", open_date: "14 Apr", current_status: "Waiting in congestion for 10 days" },
        { vessel_name: "MV Clear", dwt: 45000, open_port: "Shanghai", open_date: "25 Apr" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "Shanghai", open_date: "10 Apr" },
        { vessel_name: "MV Big", dwt: 150000, open_port: "Shanghai", open_date: "10 Apr" },
        { vessel_name: "MV Far", dwt: 45000, open_port: "Rotterdam", open_date: "10 Apr" }
    ],
    "MV Congested", "Check"
);

// M-018: Ambiguous data requiring more information
addM("M-018", "Ambiguous data",
    { load_port: "Unknown", discharge_port: "Unknown", laycan: "End May", quantity: "30000mt", cargo_type: "General Cargo" },
    [
        { vessel_name: "MV Ready 1", dwt: 35000, open_port: "Houston", open_date: "25 May" },
        { vessel_name: "MV Ready 2", dwt: 35000, open_port: "Rotterdam", open_date: "25 May" },
        { vessel_name: "MV Ready 3", dwt: 35000, open_port: "Singapore", open_date: "25 May" },
        { vessel_name: "MV Ready 4", dwt: 35000, open_port: "Shanghai", open_date: "25 May" },
        { vessel_name: "MV Ready 5", dwt: 35000, open_port: "Durban", open_date: "25 May" }
    ],
    "None", "Check"
);

// M-019: Same-port prompt opportunity
addM("M-019", "Same-port prompt",
    { load_port: "Singapore", discharge_port: "Jakarta", laycan: "1-5 Jun", quantity: "20000mt", cargo_type: "Cement" },
    [
        { vessel_name: "MV Right Here", dwt: 25000, open_port: "Singapore", open_date: "1 Jun" },
        { vessel_name: "MV Small", dwt: 10000, open_port: "Singapore", open_date: "1 Jun" },
        { vessel_name: "MV Far Time", dwt: 25000, open_port: "Singapore", open_date: "20 Jun" },
        { vessel_name: "MV Far Space", dwt: 25000, open_port: "Tokyo", open_date: "1 Jun" },
        { vessel_name: "MV Big", dwt: 80000, open_port: "Singapore", open_date: "1 Jun" }
    ],
    "MV Right Here", "Proceed"
);
cases[18].expected.shouldFlagRisk = false;

// M-020: Triangulation opportunity
addM("M-020", "Triangulation opportunity",
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "15-20 Jun", quantity: "30000mt", cargo_type: "Grains" },
    [
        { vessel_name: "MV Perfect Triangulation", dwt: 35000, open_port: "New Orleans", open_date: "15 Jun", next_employment_preference: "Continent" },
        { vessel_name: "MV Wrong Direction", dwt: 35000, open_port: "Houston", open_date: "15 Jun", next_employment_preference: "Far East Only" },
        { vessel_name: "MV Far", dwt: 35000, open_port: "Rotterdam", open_date: "15 Jun" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "Houston", open_date: "15 Jun" },
        { vessel_name: "MV Big", dwt: 80000, open_port: "Houston", open_date: "15 Jun" }
    ],
    "MV Perfect Triangulation", "Proceed"
);
cases[19].expected.shouldFlagRisk = false;


// Helper for R cases
function addR(id, contents, tone, commercial_intent, must_include, shouldNotHallucinateFields) {
    cases.push({
        id: id,
        category: "REPLY_GENERATION",
        endpoint: "/api/ai/routeTask",
        payload: {
            testMode: true,
            dryRun: true,
            taskType: "generate_reply",
            payload: {
                contents: contents
            }
        },
        expected: {
            modelExpected: "gemini-2.5-flash",
            endpointExpected: "/api/ai/routeTask",
            criticalFields: {
                tone: tone,
                commercial_intent: commercial_intent,
                must_include: must_include
            },
            humanExpectedDecision: "Proceed",
            severityIfFailed: "High",
            shouldReject: false,
            shouldFlagRisk: false,
            shouldNotHallucinateFields: shouldNotHallucinateFields || [
                "freight_rate",
                "vessel_name",
                "laycan"
            ]
        }
    });
}

// R-001
addR("R-001", "Draft a short broker reply declining MV ALPHA because her open dates are too late for the cargo laycan. Keep it polite and professional.",
    "polite and professional", "decline vessel due to dates", ["MV ALPHA", "dates are too late", "laycan"], ["freight_rate"]);
// R-002
addR("R-002", "Draft a short broker reply expressing firm interest in 30,000 mt urea cargo Bandar Abbas to Mersin and asking charterers to send full terms.",
    "professional and direct", "express firm interest and request full terms", ["firm interest", "30,000 mt urea", "Bandar Abbas", "Mersin", "full terms"], ["freight_rate", "vessel_name", "laycan"]);
// R-003
addR("R-003", "Owners offered freight USD 35/mt. Draft a concise charterer-side counter at USD 32.50/mt, subject stem, otherwise all terms as per last.",
    "concise negotiating", "counter freight rate", ["USD 32.50/mt", "subject stem", "otherwise all terms as per last"], ["vessel_name", "laycan"]);
// R-004
addR("R-004", "Draft a short broker message asking charterers to advise firm freight idea for the 50,000 mt coal cargo before owners can indicate.",
    "short and professional", "request missing freight idea", ["firm freight idea", "50,000 mt coal"], ["vessel_name", "laycan"]);
// R-005
addR("R-005", "Draft a short broker message asking for exact laycan for the 25,000 mt bagged rice cargo.",
    "short and professional", "request exact laycan", ["exact laycan", "25,000 mt bagged rice"], ["freight_rate", "vessel_name"]);
// R-006
addR("R-006", "Draft an owner-facing update: Charterers are checking port draft restrictions and expect to revert tomorrow. Keep it short.",
    "owner-facing update", "update owner on charterer checking port restrictions", ["checking port draft restrictions", "revert tomorrow"], ["freight_rate", "vessel_name", "laycan"]);
// R-007
addR("R-007", "Draft a charterer-facing reply: Owners need minimum USD 15/mt freight to make the cargo workable.",
    "firm but commercial", "state owners' minimum freight", ["minimum USD 15/mt", "workable"], ["vessel_name", "laycan"]);
// R-008
addR("R-008", "Draft a polite but firm follow-up asking for a reply on our firm offer for MV GAMMA, as owners are pressing.",
    "polite but firm", "follow up for reply", ["MV GAMMA", "owners are pressing", "reply"], ["freight_rate", "laycan"]);
// R-009
addR("R-009", "Draft a short broker reply saying an indication is not enough and owners need a firm offer to proceed.",
    "firm and professional", "push for firm offer", ["indication is not enough", "firm offer", "proceed"], ["freight_rate", "vessel_name", "laycan"]);
// R-010
addR("R-010", "Draft a cautious broker reply holding interest in the vessel subject to board approval and without firm commitment.",
    "cautious and protective", "hold interest without firm commitment", ["subject to board approval", "without firm commitment"], ["freight_rate", "vessel_name", "laycan"]);

// Helper for F cases
function addF(id, contents, risk_type, key_risk, recommended_action, severity, expectedDecision, shouldReject, shouldFlagRisk, shouldNotHallucinateFields) {
    cases.push({
        id: id,
        category: "RISK_ANALYSIS",
        endpoint: "/api/ai/routeTask",
        payload: {
            testMode: true,
            dryRun: true,
            taskType: "analyze_risk",
            payload: {
                contents: contents
            }
        },
        expected: {
            modelExpected: "gemini-2.5-pro",
            endpointExpected: "/api/ai/routeTask",
            criticalFields: {
                risk_type: risk_type,
                key_risk: key_risk,
                recommended_action: recommended_action,
                severity: severity
            },
            humanExpectedDecision: expectedDecision,
            severityIfFailed: "High",
            shouldReject: shouldReject,
            shouldFlagRisk: shouldFlagRisk,
            shouldNotHallucinateFields: shouldNotHallucinateFields || [
                "freight_rate",
                "laycan",
                "demurrage",
                "commission"
            ]
        }
    });
}

// F-001
addF("F-001", "Analyze fixture risk: Load CQD / Disch 5,000 mt SHINC. Demurrage USD 15,000 pdpr. Cargo 25,000 mt grain Santos to Algiers.",
    "CQD risk", "Load CQD exposes Owners to uncertain laytime/demurrage protection at load port", "Clarify load port laytime or convert CQD to fixed load rate", "High", "Check", false, true, ["freight_rate", "laycan", "commission"]);
// F-002
addF("F-002", "Analyze fixture risk: Cargo 20,000 mt steel coils. Terms FIOS mentioned, but no loading rate, discharging rate, stevedoring responsibility, or lashing responsibility stated.",
    "FIOS ambiguity", "Operational cost and responsibility unclear", "Clarify loading/discharging rates and cost responsibility", "High", "Check", false, true, ["freight_rate", "laycan", "demurrage", "commission"]);
// F-003
addF("F-003", "Analyze fixture risk: Freight USD 20/mt. Laytime 10,000 mt SHINC load / 8,000 mt SHEX discharge. Demurrage/despatch not stated.",
    "Missing demurrage rate", "No agreed compensation for time lost after laytime expires", "Do not fix until demurrage/despatch is agreed", "Critical", "Reject", true, true, ["laycan", "commission"]);
// F-004
addF("F-004", "Analyze fixture risk: Option A: 10 days total reversible laytime. Option B: 5 days load + 5 days discharge non-reversible. Cargo 40,000 mt bulk.",
    "Reversible vs non-reversible laytime", "Non-reversible laytime reduces flexibility and can increase demurrage exposure", "Clarify whether laytime is reversible and price risk accordingly", "Medium", "Check", false, true, ["freight_rate", "laycan", "demurrage", "commission"]);
// F-005
addF("F-005", "Analyze fixture risk: Load 8,000 mt SHINC / Disch 5,000 mt SHEX EIU. Sundays and holidays treatment not otherwise clarified.",
    "SHINC/SHEX/EIU", "Different time-counting treatment may materially change laytime", "Confirm exactly when time counts at each port", "Medium", "Check", false, true, ["freight_rate", "laycan", "demurrage", "commission"]);
// F-006
addF("F-006", "Analyze fixture risk: NOR can be tendered WIBON/WIFPON/WCCON, time to count 12 hours after valid NOR. Port known for congestion.",
    "NOR tendering", "WIBON/WIFPON protects Owners by allowing NOR before berth/free pratique in certain conditions", "Confirm NOR validity wording and port practice", "Medium", "Proceed", false, true, ["freight_rate", "laycan", "demurrage", "commission"]);
// F-007
addF("F-007", "Analyze fixture risk: Laytime 5,000 mt WWD at load port during monsoon season. Cargo 30,000 mt bulk.",
    "Weather Working Days", "Bad weather stops laytime and may delay loading without demurrage", "Account for weather delay risk in freight or negotiate SHINC/fixed rate", "Medium", "Check", false, true, ["freight_rate", "laycan", "demurrage", "commission"]);
// F-008
addF("F-008", "Analyze fixture risk: Cargo laycan 10-12 May. Vessel ETA load port 12 May 23:00, subject weather and port congestion.",
    "Laycan squeeze", "High risk of missing cancelling date", "Seek laycan extension or avoid proposing vessel as firm", "High", "Check", false, true, ["freight_rate", "demurrage", "commission"]);
// F-009
addF("F-009", "Analyze fixture risk: Commission stated as 2.5% total, but there are three brokers in the chain and addcom was mentioned separately in earlier emails.",
    "Unclear commission", "Broker payment and commission distribution unclear", "Confirm full commission split in recap before fixing", "High", "Check", false, true, ["freight_rate", "laycan", "demurrage"]);
// F-010
addF("F-010", "Analyze fixture risk: Recap says 'subs lifted', but earlier negotiations included subject stem, subject receivers approval, and subject board approval. Recap does not list which subjects were lifted.",
    "Missing subjects in recap", "Fixture certainty risk if not all subjects were clearly lifted", "Confirm all subjects lifted in writing before treating fixture as clean", "Critical", "Reject", true, true, ["freight_rate", "laycan", "demurrage", "commission"]);

fs.writeFileSync('tests/out_batch3.json', JSON.stringify(cases, null, 2));

