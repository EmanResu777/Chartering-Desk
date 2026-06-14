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
            shouldFlagRisk: action === "Check",
            shouldNotHallucinateFields: [
                "freight_idea",
                "laycan",
                "quantity",
                "dwt",
                "vessel_name"
            ]
        }
    });
}

// M-001: Perfect match
addM("M-001", "Perfect match", 
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "15-20 June", quantity_mt: 30000, cargo_type: "Grains" },
    [
        { vessel_name: "MV Perfect", dwt: 35000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Too Big", dwt: 150000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Too Late", dwt: 35000, open_port: "Houston", open_date: "25 June" },
        { vessel_name: "MV Too Small", dwt: 15000, open_port: "Houston", open_date: "10 June" },
        { vessel_name: "MV Far Away", dwt: 35000, open_port: "Singapore", open_date: "10 June" }
    ],
    "MV Perfect", "Proceed"
);

// M-002: DWT too small
addM("M-002", "DWT too small", 
    { load_port: "Miami", discharge_port: "Santos", laycan: "1-5 July", quantity_mt: 45000, cargo_type: "Sugar" },
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
    { load_port: "Santos", discharge_port: "Lisbon", laycan: "10-20 Aug", quantity_mt: 10000, cargo_type: "Sugar" },
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
    { load_port: "Durban", discharge_port: "Mombasa", laycan: "1-5 Sept", quantity_mt: 20000, cargo_type: "Coal" },
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
    { load_port: "Rotterdam", discharge_port: "New York", laycan: "10-15 Oct", quantity_mt: 30000, cargo_type: "Steel" },
    [
        { vessel_name: "MV Far East", dwt: 35000, open_port: "Tokyo", open_date: "10 Oct" },
        { vessel_name: "MV Australia", dwt: 35000, open_port: "Sydney", open_date: "10 Oct" },
        { vessel_name: "MV South Africa", dwt: 35000, open_port: "Cape Town", open_date: "10 Oct" },
        { vessel_name: "MV West Coast", dwt: 35000, open_port: "Los Angeles", open_date: "10 Oct" },
        { vessel_name: "MV Pacific", dwt: 35000, open_port: "Fiji", open_date: "10 Oct" }
    ],
    "MV Far East", "Reject"
);

// M-006: Gear mismatch
addM("M-006", "Gear mismatch",
    { load_port: "Lagos", discharge_port: "Dakar", laycan: "1-10 Nov", quantity_mt: 20000, cargo_type: "Rice", gear_required: true },
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
    { load_port: "Bremen", discharge_port: "Shanghai", laycan: "15-20 Nov", quantity_mt: 5000, cargo_type: "Project Cargo", max_unit_weight_mt: 200 },
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
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "1-5 Dec", quantity_mt: 30000, cargo_type: "Petcoke" },
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
    { load_port: "New Orleans", discharge_port: "Alexandria", laycan: "10-20 Dec", quantity_mt: 25000, cargo_type: "Wheat" },
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
    { load_port: "Rio Grande", discharge_port: "Dakar", laycan: "1-10 Jan", quantity_mt: 40000, cargo_type: "Grains", max_draft: "10.0m" },
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
    { load_port: "Singapore", discharge_port: "Shanghai", laycan: "1-5 Feb", quantity_mt: 20000, cargo_type: "Steel" },
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
    { load_port: "Bandar Abbas", discharge_port: "Mumbai", laycan: "10-20 Feb", quantity_mt: 30000, cargo_type: "Urea" },
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
    { load_port: "St Petersburg", discharge_port: "Rotterdam", laycan: "1-10 Jan", quantity_mt: 20000, cargo_type: "Steel", required_ice_class: "1A" },
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
    { load_port: "Seattle", discharge_port: "Tokyo", laycan: "1-5 Mar", quantity_mt: 30000, cargo_type: "Woodchips", stowage_factor: 110, cubic_required: 3300000 },
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
    { load_port: "Rotterdam", discharge_port: "Houston", laycan: "10-20 Mar", quantity_mt: 10000, cargo_type: "Steel" },
    [
        { vessel_name: "MV Space Available", dwt: 40000, open_port: "Rotterdam", open_date: "10 Mar", available_capacity_mt: 12000, already_booked: "28000mt Steel for Houston" },
        { vessel_name: "MV Full", dwt: 40000, open_port: "Rotterdam", open_date: "10 Mar", available_capacity_mt: 0 },
        { vessel_name: "MV Too Big", dwt: 150000, open_port: "Rotterdam", open_date: "10 Mar" },
        { vessel_name: "MV Wrong Way", dwt: 35000, open_port: "Rotterdam", open_date: "10 Mar", desired_direction: "Direction Far East" },
        { vessel_name: "MV Far Away", dwt: 35000, open_port: "Shanghai", open_date: "10 Mar" }
    ],
    "MV Space Available", "Proceed"
);

// M-016: Good operational fit but weak economics
addM("M-016", "Weak economics",
    { load_port: "Durban", discharge_port: "Mombasa", laycan: "1-10 Apr", quantity_mt: 30000, cargo_type: "Coal", freight_idea: "Low" },
    [
        { vessel_name: "MV Expensive Position", dwt: 35000, open_port: "Durban", open_date: "1 Apr", owner_idea: "High" },
        { vessel_name: "MV Wrong Gear", dwt: 35000, open_port: "Durban", open_date: "1 Apr", gear_type: "Gearless" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "Durban", open_date: "1 Apr" },
        { vessel_name: "MV Big", dwt: 150000, open_port: "Durban", open_date: "1 Apr" },
        { vessel_name: "MV Far", dwt: 35000, open_port: "Singapore", open_date: "1 Apr" }
    ],
    "MV Expensive Position", "Check"
);

// M-017: Good commercial fit but operational risk
addM("M-017", "Operational risk",
    { load_port: "Shanghai", discharge_port: "Los Angeles", laycan: "10-15 Apr", quantity_mt: 40000, cargo_type: "Steel" },
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
    { load_port: "Unknown", discharge_port: "Unknown", laycan: "End May", quantity_mt: 30000, cargo_type: "General Cargo" },
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
    { load_port: "Singapore", discharge_port: "Jakarta", laycan: "1-5 Jun", quantity_mt: 20000, cargo_type: "Cement" },
    [
        { vessel_name: "MV Right Here", dwt: 25000, open_port: "Singapore", open_date: "1 Jun" },
        { vessel_name: "MV Small", dwt: 10000, open_port: "Singapore", open_date: "1 Jun" },
        { vessel_name: "MV Far Time", dwt: 25000, open_port: "Singapore", open_date: "20 Jun" },
        { vessel_name: "MV Far Space", dwt: 25000, open_port: "Tokyo", open_date: "1 Jun" },
        { vessel_name: "MV Big", dwt: 80000, open_port: "Singapore", open_date: "1 Jun" }
    ],
    "MV Right Here", "Proceed"
);

// M-020: Triangulation opportunity
addM("M-020", "Triangulation opportunity",
    { load_port: "Houston", discharge_port: "Rotterdam", laycan: "15-20 Jun", quantity_mt: 30000, cargo_type: "Grains" },
    [
        { vessel_name: "MV Perfect Triangulation", dwt: 35000, open_port: "New Orleans", open_date: "15 Jun", next_employment_preference: "Continent" },
        { vessel_name: "MV Wrong Direction", dwt: 35000, open_port: "Houston", open_date: "15 Jun", next_employment_preference: "Far East Only" },
        { vessel_name: "MV Far", dwt: 35000, open_port: "Rotterdam", open_date: "15 Jun" },
        { vessel_name: "MV Small", dwt: 15000, open_port: "Houston", open_date: "15 Jun" },
        { vessel_name: "MV Big", dwt: 80000, open_port: "Houston", open_date: "15 Jun" }
    ],
    "MV Perfect Triangulation", "Proceed"
);

// Helper for R cases
function addR(id, expectedDecision, tone, commercial_intent, must_include) {
    cases.push({
        id: id,
        category: "REPLY_GENERATION",
        endpoint: "/api/ai/routeTask",
        payload: {
            testMode: true,
            dryRun: true,
            taskType: "generate_reply",
            payload: {
                contents: "Please draft a message to " + tone + " regarding " + commercial_intent
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
            humanExpectedDecision: expectedDecision,
            severityIfFailed: "High",
            shouldReject: false,
            shouldFlagRisk: false,
            shouldNotHallucinateFields: []
        }
    });
}

// R-001: Polite decline
addR("R-001", "Proceed", "Polite but firm", "Decline vessel due to dates not working", "Dates do not work");
// R-002: Firm interest
addR("R-002", "Proceed", "Professional and direct", "Express firm interest and request full terms", "Firm interest, send full terms");
// R-003: Counter offer
addR("R-003", "Proceed", "Negotiating", "Counter freight rate", "Counter offer");
// R-004: Request missing freight idea
addR("R-004", "Proceed", "Inquiring", "Ask charterer for firm freight idea", "Firm freight idea");
// R-005: Request missing laycan
addR("R-005", "Proceed", "Inquiring", "Ask for exact laycan", "Exact laycan");
// R-006: Owner-facing reply
addR("R-006", "Proceed", "Informative", "Tell owner charterer is checking draft/port restrictions", "Charterer checking draft");
// R-007: Charterer-facing reply
addR("R-007", "Proceed", "Negotiating", "Tell charterer owners need minimum freight to work", "Minimum freight required");
// R-008: Follow-up after no response
addR("R-008", "Proceed", "Polite follow-up", "Push for reply without sounding weak", "Awaiting your reply");
// R-009: Push for firm offer
addR("R-009", "Proceed", "Firm", "Indication not enough, ask for firm offer", "Need firm offer");
// R-010: Protect position without overcommitting
addR("R-010", "Proceed", "Cautious", "Hold interest subject approval without firm commitment", "Subject to approval");

// Helper for F cases
function addF(id, risk_type, key_risk, recommended_action, expectedDecision) {
    cases.push({
        id: id,
        category: "RISK_ANALYSIS",
        endpoint: "/api/ai/routeTask",
        payload: {
            testMode: true,
            dryRun: true,
            taskType: "analyze_risk",
            payload: {
                contents: "Please analyze risk for " + risk_type
            }
        },
        expected: {
            modelExpected: "gemini-2.5-pro",
            endpointExpected: "/api/ai/routeTask",
            criticalFields: {
                risk_type: risk_type,
                key_risk: key_risk,
                recommended_action: recommended_action,
                severity: expectedDecision === "Proceed" ? "Low" : (expectedDecision === "Reject" ? "Critical" : "Medium")
            },
            humanExpectedDecision: expectedDecision,
            severityIfFailed: "High",
            shouldReject: expectedDecision === "Reject",
            shouldFlagRisk: expectedDecision === "Check",
            shouldNotHallucinateFields: []
        }
    });
}

// F-001: CQD risk
addF("F-001", "CQD Risk", "Owner laytime/demurrage exposure due to CQD", "Clarify demurrage terms or convert to fixed laytime", "Check");
// F-002: FIOS ambiguity
addF("F-002", "FIOS Ambiguity", "Missing operational load/discharge rates", "Request specific rates", "Check");
// F-003: Missing demurrage rate
addF("F-003", "Missing Demurrage", "Freight/laytime present but demurrage missing", "Add demurrage rate", "Reject");
// F-004: Reversible vs non-reversible laytime
addF("F-004", "Reversible Laytime", "Commercial flexibility differences", "Clarify laytime terms", "Check");
// F-005: SHINC / SHEX / EIU
addF("F-005", "SHINC/SHEX/EIU", "Time counting ambiguity during weekends/holidays", "Specify exact terms", "Check");
// F-006: NOR tendering / WIBON / WIFPON
addF("F-006", "NOR Tendering", "Owner protection and waiting time start", "Ensure WIBON/WIFPON included", "Check");
// F-007: Weather Working Days
addF("F-007", "Weather Working Days", "Laytime stops during weather delays", "Verify weather definitions", "Check");
// F-008: Unsafe ETA / laycan squeeze
addF("F-008", "Laycan Squeeze", "Risk of missing cancelling date", "Expand laycan", "Check");
// F-009: Unclear commission
addF("F-009", "Unclear Commission", "Payment/distribution risk with multiple brokers", "Clarify commission structure", "Check");
// F-010: Missing subjects in recap
addF("F-010", "Missing Subjects", "Fixture certainty risk due to incomplete subjects list", "List all subjects explicitly", "Check");

fs.writeFileSync('batch3.json', JSON.stringify(cases, null, 2));

