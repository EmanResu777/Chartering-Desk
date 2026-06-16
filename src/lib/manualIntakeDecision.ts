// Manual-paste render decision — the single source of truth for what the
// Cargo/Vessel "Paste Text" modal renders.
//
// PILOT-BLOCKER-16. Roman's real iPhone UI kept failing because the modal
// depended on the backend /api/ai/parseEmail round-trip. In the AI Studio
// preview that request is unreliable: cargo returned a stale/empty body
// (global "Incomplete Result") and vessel failed at the network layer
// ("Load failed" = iOS Safari fetch TypeError). The parsers themselves are
// model-free and run fine in the browser, so this module runs them CLIENT-SIDE
// and treats the backend strictly as best-effort enrichment that can never
// erase a local result.
//
// This is a pure function (no React, no network, no I/O) so the render decision
// is unit-testable without a browser. It emits counts/flags only — never raw
// pasted text, AI responses, provider payloads, or secrets.

import { parseDeterministicCargoes } from './deterministicCargoParser';
import { parseDeterministicVessels } from './deterministicVesselParser';

export const PB16_BUILD_MARKER = 'PILOT-BLOCKER-16';

export type RenderedFrom = 'local-deterministic' | 'backend' | 'merged' | 'none';

export interface ManualIntakeDebug {
  buildMarker: string;
  localDeterministicCargoes: number;
  localDeterministicVessels: number;
  localFallbackUsed: boolean;
  backendRequestStarted: boolean;
  backendRequestSucceeded: boolean;
  backendRequestFailed: boolean;
  backendErrorType: string | null;
  backendCargoes: number;
  backendVessels: number;
  renderedFrom: RenderedFrom;
  aiEnrichmentSkippedOrFailed: boolean;
  showedIncompleteWall: boolean;
  showedParseError: boolean;
}

export interface ManualIntakeDecision {
  expectedType: 'CARGO' | 'VESSEL';
  cargoes: any[];
  vessels: any[];
  renderedFrom: RenderedFrom;
  multiCargoDetected: boolean;
  multiVesselDetected: boolean;
  showIncompleteWall: boolean;
  showParseError: boolean;
  enrichmentNote: string | null;
  debug: ManualIntakeDebug;
}

export interface ManualIntakeInput {
  expectedType?: 'CARGO' | 'VESSEL' | string;
  text: string;
  backendResult?: any | null;
  backendError?: any | null;
  backendStarted?: boolean;
}

/** A cargo candidate is meaningful when it carries >= 1 real extracted field. */
export function meaningfulCargo(c: any): boolean {
  return !!c && !!(c.commodity || c.raw_commodity || c.loadPort || c.dischargePort || c.quantity || c.laycan);
}

/** A vessel candidate is meaningful when it carries >= 1 real extracted field. */
export function meaningfulVessel(v: any): boolean {
  return !!v && !!(v.name || v.dwt || v.openPort || v.openDate || v.type || v.built || v.flag || v.grt || v.loa);
}

/** Map an error to a safe category string (no raw message, no secrets). */
function classifyError(err: any): string {
  const msg = (err && (err.message || String(err))) || '';
  const m = msg.toLowerCase();
  if (m.includes('load failed') || m.includes('failed to fetch') || m.includes('networkerror')) return 'network';
  if (m.includes('credit') || m.includes('402')) return 'credit';
  if (m.includes('401') || m.includes('auth') || m.includes('token')) return 'auth';
  if (m.includes('429') || m.includes('quota') || m.includes('rate')) return 'rate-limit';
  if (m.includes('not enough')) return 'incomplete';
  if (m.includes('500') || m.includes('server')) return 'server';
  return 'unknown';
}

function enrichCargo(dst: any, src: any): void {
  if (!src) return;
  if (!dst.loadPort && src.loadPort) dst.loadPort = src.loadPort;
  if (!dst.dischargePort && src.dischargePort) dst.dischargePort = src.dischargePort;
  if (!dst.commodity && (src.commodity || src.raw_commodity)) dst.commodity = src.commodity || src.raw_commodity;
  if (!dst.raw_commodity && (src.raw_commodity || src.commodity)) dst.raw_commodity = src.raw_commodity || src.commodity;
  if (!dst.quantity && src.quantity) dst.quantity = src.quantity;
  if (!dst.laycan && src.laycan) dst.laycan = src.laycan;
  if (!dst.terms && src.terms) dst.terms = src.terms;
  if (!dst.commission && (src.commission || src.comm)) dst.commission = src.commission || src.comm;
  if (!dst.freight_idea && src.freight_idea) dst.freight_idea = src.freight_idea;
  if (!dst.special_requirements && src.special_requirements) dst.special_requirements = src.special_requirements;
}

function enrichVessel(dst: any, src: any): void {
  if (!src) return;
  for (const k of ['name', 'dwt', 'draft', 'built', 'flag', 'grt', 'nrt', 'loa', 'beam', 'depth',
    'capacity', 'holds', 'hatches', 'gear', 'class_society', 'pandi', 'type', 'openPort', 'openDate']) {
    if (!dst[k] && src[k]) dst[k] = src[k];
  }
}

function backendCargoList(backendResult: any): any[] {
  if (!backendResult) return [];
  if (Array.isArray(backendResult.cargoes) && backendResult.cargoes.length) return backendResult.cargoes;
  if (backendResult.cargo) return [backendResult.cargo];
  return [];
}

function backendVesselList(backendResult: any): any[] {
  if (!backendResult) return [];
  if (Array.isArray(backendResult.vessels) && backendResult.vessels.length) return backendResult.vessels;
  if (backendResult.vessel) return [backendResult.vessel];
  return [];
}

/**
 * Decide what the manual-paste modal renders. Local deterministic parsing is
 * authoritative; the backend can only enrich, never erase. The global Incomplete
 * wall is shown only when BOTH local and backend find nothing; the red Parse
 * Error is shown only when the request failed AND local found nothing.
 */
export function decideManualIntakeRenderState(input: ManualIntakeInput): ManualIntakeDecision {
  const expectedType: 'CARGO' | 'VESSEL' = input.expectedType === 'VESSEL' ? 'VESSEL' : 'CARGO';
  const text = input.text || '';
  const backendResult = input.backendResult || null;
  const backendError = input.backendError || null;
  const backendStarted = input.backendStarted ?? (backendResult !== null || backendError !== null);

  // 1. Client-side deterministic parse (no network — always available).
  const localCargoes = expectedType === 'CARGO' ? parseDeterministicCargoes(text) : [];
  const localVessels = expectedType === 'VESSEL' ? parseDeterministicVessels(text) : [];

  // 2. Backend candidates (best-effort enrichment), filtered to meaningful only.
  const beCargoes = backendCargoList(backendResult).filter(meaningfulCargo);
  const beVessels = backendVesselList(backendResult).filter(meaningfulVessel);

  const backendRequestSucceeded = !!backendResult && !backendError;
  const backendRequestFailed = !!backendError;

  let cargoes: any[] = [];
  let vessels: any[] = [];
  let renderedFrom: RenderedFrom = 'none';

  if (expectedType === 'CARGO') {
    if (localCargoes.length > 0) {
      cargoes = localCargoes.map((c) => ({ ...c }));
      if (beCargoes.length > 0) {
        for (let i = 0; i < cargoes.length; i++) enrichCargo(cargoes[i], beCargoes[i]);
        for (let i = cargoes.length; i < beCargoes.length; i++) cargoes.push(beCargoes[i]);
        renderedFrom = 'merged';
      } else {
        renderedFrom = 'local-deterministic';
      }
    } else if (beCargoes.length > 0) {
      cargoes = beCargoes;
      renderedFrom = 'backend';
    }
  } else {
    if (localVessels.length > 0) {
      vessels = localVessels.map((v) => ({ ...v }));
      if (beVessels.length > 0) {
        for (let i = 0; i < vessels.length; i++) enrichVessel(vessels[i], beVessels[i]);
        for (let i = vessels.length; i < beVessels.length; i++) vessels.push(beVessels[i]);
        renderedFrom = 'merged';
      } else {
        renderedFrom = 'local-deterministic';
      }
    } else if (beVessels.length > 0) {
      vessels = beVessels;
      renderedFrom = 'backend';
    }
  }

  const totalCandidates = cargoes.length + vessels.length;
  const showParseError = totalCandidates === 0 && backendRequestFailed;
  const showIncompleteWall = totalCandidates === 0 && !backendRequestFailed;

  const localFallbackUsed = renderedFrom === 'local-deterministic' || renderedFrom === 'merged';
  const aiEnrichmentSkippedOrFailed =
    backendRequestFailed || (backendRequestSucceeded && beCargoes.length === 0 && beVessels.length === 0);

  const enrichmentNote =
    totalCandidates > 0 && renderedFrom !== 'backend' && aiEnrichmentSkippedOrFailed
      ? 'AI enrichment unavailable; deterministic draft created.'
      : null;

  return {
    expectedType,
    cargoes,
    vessels,
    renderedFrom,
    multiCargoDetected: cargoes.length > 1,
    multiVesselDetected: vessels.length > 1,
    showIncompleteWall,
    showParseError,
    enrichmentNote,
    debug: {
      buildMarker: PB16_BUILD_MARKER,
      localDeterministicCargoes: localCargoes.length,
      localDeterministicVessels: localVessels.length,
      localFallbackUsed,
      backendRequestStarted: backendStarted,
      backendRequestSucceeded,
      backendRequestFailed,
      backendErrorType: backendError ? classifyError(backendError) : null,
      backendCargoes: beCargoes.length,
      backendVessels: beVessels.length,
      renderedFrom,
      aiEnrichmentSkippedOrFailed,
      showedIncompleteWall: showIncompleteWall,
      showedParseError: showParseError,
    },
  };
}
