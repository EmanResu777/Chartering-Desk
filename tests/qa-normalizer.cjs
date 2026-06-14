// tests/qa-normalizer.cjs

function findNestedObject(res) {
  if (!res || typeof res !== 'object') return res;
  
  const possibleContainers = [
    'data', 'result', 'parsed', 'output', 'extracted', 'cargo', 'vessel',
    'analysis', 'ai', 'payload', 'risk', 'reply'
  ];
  
  let merged = { ...res };
  for (const key of possibleContainers) {
    if (res[key] && typeof res[key] === 'object' && !Array.isArray(res[key])) {
       // if we find a nested structure that is objects container
       merged = { ...merged, ...res[key] };
    }
  }
  return merged;
}

function normalizeCargo(data) {
  const norm = { ...data };
  
  if (norm.commodity !== undefined) norm.cargo_name = norm.commodity;
  if (norm.cargo !== undefined && typeof norm.cargo === 'string') norm.cargo_name = norm.cargo;
  if (norm.cargoName !== undefined) norm.cargo_name = norm.cargoName;
  if (norm.commodity_name !== undefined) norm.cargo_name = norm.commodity_name;
  
  if (norm.qty !== undefined) norm.quantity = norm.qty;
  if (norm.quantity_mt !== undefined) norm.quantity = norm.quantity_mt;
  if (norm.quantityMts !== undefined) norm.quantity = norm.quantityMts;
  
  if (norm.loadPort !== undefined) norm.load_port = norm.loadPort;
  if (norm.loadingPort !== undefined) norm.load_port = norm.loadingPort;
  
  if (norm.dischargePort !== undefined) norm.discharge_port = norm.dischargePort;
  if (norm.dischargingPort !== undefined) norm.discharge_port = norm.dischargingPort;
  
  if (norm.laycan_date !== undefined) norm.laycan = norm.laycan_date;
  
  if (norm.addcom !== undefined) norm.commission = norm.addcom;
  if (norm.addressCommission !== undefined) norm.commission = norm.addressCommission;
  
  if (norm.freightIdea !== undefined) norm.freight_idea = norm.freightIdea;
  if (norm.targetFreight !== undefined) norm.freight_idea = norm.targetFreight;
  if (norm.indication !== undefined) norm.freight_idea = norm.indication;
  
  if (norm.loadingRate !== undefined) norm.loading_rate = norm.loadingRate;
  if (norm.loadRate !== undefined) norm.loading_rate = norm.loadRate;
  
  if (norm.dischargingRate !== undefined) norm.discharging_rate = norm.dischargingRate;
  if (norm.dischargeRate !== undefined) norm.discharging_rate = norm.dischargeRate;
  
  if (norm.commercialStatus !== undefined) norm.commercial_status = norm.commercialStatus;
  
  return norm;
}

function normalizeVessel(data) {
  const norm = { ...data };
  
  if (norm.vesselName !== undefined) norm.vessel_name = norm.vesselName;
  if (norm.name !== undefined) norm.vessel_name = norm.name;
  
  if (norm.deadweight !== undefined) norm.dwt = norm.deadweight;
  if (norm.deadweight_mt !== undefined) norm.dwt = norm.deadweight_mt;
  if (norm.quantity !== undefined && norm.dwt === undefined) norm.dwt = norm.quantity;
  
  if (norm.openPort !== undefined) norm.open_port = norm.openPort;
  if (norm.deliveryPort !== undefined) norm.open_port = norm.deliveryPort;
  
  if (norm.openDate !== undefined) norm.open_date = norm.openDate;
  if (norm.availableDate !== undefined) norm.open_date = norm.availableDate;
  
  if (norm.gearType !== undefined) norm.gear_type = norm.gearType;
  if (norm.cranes !== undefined) norm.gear_cranes = norm.cranes;
  if (norm.gearCranes !== undefined) norm.gear_cranes = norm.gearCranes;
  
  if (norm.craneCapacity !== undefined) norm.gear_capacity_mt = norm.craneCapacity;
  if (norm.gearCapacityMt !== undefined) norm.gear_capacity_mt = norm.gearCapacityMt;
  
  if (norm.combinedCapacity !== undefined) norm.gear_combined_capacity_mt = norm.combinedCapacity;
  if (norm.gearCombinedCapacityMt !== undefined) norm.gear_combined_capacity_mt = norm.gearCombinedCapacityMt;
  
  if (norm.iceClass !== undefined) norm.ice_class = norm.iceClass;
  if (norm.maxDraft !== undefined) norm.max_draft = norm.maxDraft;
  if (norm.cons !== undefined) norm.consumption = norm.cons;
  
  if (norm.timberFitted !== undefined) norm.timber_fitted = norm.timberFitted;
  if (norm.containerFitted !== undefined) norm.container_fitted = norm.containerFitted;
  if (norm.imoFitted !== undefined) norm.imo_fitted = norm.imoFitted;
  
  if (norm.boxShapedHolds !== undefined) norm.box_shaped_holds = norm.boxShapedHolds;
  if (norm.grabFitted !== undefined) norm.grab_fitted = norm.grabFitted;
  if (norm.commercialStatus !== undefined) norm.commercial_status = norm.commercialStatus;
  
  return norm;
}

function normalizeMatching(data) {
  const norm = { ...data };
  
  if (norm.bestVessel !== undefined) norm.best_vessel = norm.bestVessel;
  if (norm.selected_vessel !== undefined) norm.best_vessel = norm.selected_vessel;
  if (norm.recommended_vessel !== undefined) norm.best_vessel = norm.recommended_vessel;
  
  if (norm.recommendedAction !== undefined) norm.recommended_action = norm.recommendedAction;
  if (norm.decision !== undefined) norm.recommended_action = norm.decision;
  if (norm.action !== undefined) norm.recommended_action = norm.action;
  
  if (norm.rejectedVessels !== undefined) norm.rejected_vessels = norm.rejectedVessels;
  
  if (norm.matches && Array.isArray(norm.matches) && norm.matches.length > 0) {
    if (norm.best_vessel === undefined) {
      const best = norm.matches[0];
      if (best.vesselId) norm.best_vessel = best.vesselId;
      else if (best.vessel_name) norm.best_vessel = best.vessel_name;
    }
    if (norm.recommended_action === undefined) {
      let highestScore = norm.matches[0].score || 0;
      if (highestScore <= 1.0 && highestScore > 0) highestScore *= 100;
      
      if (highestScore > 75) norm.recommended_action = 'Proceed';
      else if (highestScore > 40) norm.recommended_action = 'Check';
      else norm.recommended_action = 'Reject';
    }
  }
  
  return norm;
}

function normalizeReply(data) {
  const norm = { ...data };
  
  if (norm.reply !== undefined && typeof norm.reply === 'string') norm.generated_reply = norm.reply;
  if (norm.message !== undefined) norm.generated_reply = norm.message;
  if (norm.text !== undefined) norm.generated_reply = norm.text;
  if (norm.content !== undefined) norm.generated_reply = norm.content;
  if (norm.draft !== undefined) norm.generated_reply = norm.draft;
  
  if (norm.commercialIntent !== undefined) norm.commercial_intent = norm.commercialIntent;
  if (norm.intent !== undefined) norm.commercial_intent = norm.intent;
  
  if (norm.mustInclude !== undefined) norm.must_include = norm.mustInclude;
  
  return norm;
}

function normalizeRisk(data) {
  const norm = { ...data };
  
  if (norm.riskType !== undefined) norm.risk_type = norm.riskType;
  if (norm.keyRisk !== undefined) norm.key_risk = norm.keyRisk;
  if (norm.risk !== undefined && typeof norm.risk === 'string') norm.key_risk = norm.risk;
  if (norm.main_risk !== undefined) norm.key_risk = norm.main_risk;
  
  if (norm.recommendedAction !== undefined) norm.recommended_action = norm.recommendedAction;
  if (norm.action !== undefined) norm.recommended_action = norm.action;
  
  if (norm.flagRisk !== undefined) norm.shouldFlagRisk = norm.flagRisk;
  if (norm.risk_flag !== undefined) norm.shouldFlagRisk = norm.risk_flag;
  if (norm.actualRisk !== undefined) norm.shouldFlagRisk = norm.actualRisk;
  
  if (norm.reject !== undefined) norm.shouldReject = norm.reject;
  
  if (norm.text && !norm.risk_type) {
     norm.risk_type = norm.text;
     norm.key_risk = norm.text;
     norm.recommended_action = norm.text;
     norm.severity = norm.text;
  }
  
  return norm;
}

function normalizeQaResponse(tc, rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'object') return { root: rawResponse, normalized: rawResponse };

  let merged = findNestedObject(rawResponse);
  let normalized = { ...merged };

  const category = tc.category;
  
  if (category === 'CARGO') {
    normalized = normalizeCargo(normalized);
  } else if (category === 'VESSEL') {
    normalized = normalizeVessel(normalized);
  } else if (category === 'MATCHING') {
    normalized = normalizeMatching(normalized);
  } else if (category === 'REPLY_GENERATION') {
    normalized = normalizeReply(normalized);
  } else if (category === 'RISK_ANALYSIS') {
    normalized = normalizeRisk(normalized);
  }

  // Derive shouldReject and shouldFlagRisk
  if (normalized.shouldReject === undefined && normalized.recommended_action) {
    const act = String(normalized.recommended_action).toLowerCase();
    if (act.includes('reject')) normalized.shouldReject = true;
    else if (act.includes('proceed') || act.includes('check')) normalized.shouldReject = false;
  }

  if (normalized.shouldFlagRisk === undefined) {
    if (category === 'MATCHING' && normalized.recommended_action) {
       const act = String(normalized.recommended_action).toLowerCase();
       if (act.includes('check') || act.includes('reject')) {
          normalized.shouldFlagRisk = true;
       } else if (act.includes('proceed')) {
          normalized.shouldFlagRisk = false;
       }
    } else if (category === 'RISK_ANALYSIS' && normalized.severity) {
       const sev = String(normalized.severity).toLowerCase();
       if (sev.includes('medium') || sev.includes('high') || sev.includes('critical')) {
          normalized.shouldFlagRisk = true;
       } else {
          normalized.shouldFlagRisk = false;
       }
    } else if (normalized.risk || normalized.risks || (normalized.key_risk && typeof normalized.key_risk === 'string' && normalized.key_risk.toLowerCase() !== 'none')) {
       normalized.shouldFlagRisk = true;
    } else {
       normalized.shouldFlagRisk = false;
    }
  }

  // Missing fields derivation if missingFieldsShouldInclude exists
  if (tc.expected && tc.expected.missingFieldsShouldInclude) {
    if (!normalized.missing_fields || !Array.isArray(normalized.missing_fields)) {
      normalized.missing_fields = [];
      for (const field of tc.expected.missingFieldsShouldInclude) {
         if (normalized[field] === undefined || (typeof normalized[field] === 'string' && normalized[field].trim() === '')) {
            normalized.missing_fields.push(field);
         }
      }
    }
  }

  return { root: rawResponse, normalized };
}

module.exports = { normalizeQaResponse };
