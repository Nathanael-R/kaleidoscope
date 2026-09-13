import type { CaptureResult } from './capture-result.js';

export type ViewMode = 'focus' | 'grid';
export type Lifecycle = 'initializing' | 'ready' | 'failed' | 'disposed';

export interface CaptureRequest {
  url: string;
  devices: string[];
  fullPage: boolean;
}

export interface ResultsState {
  lifecycle: Lifecycle;
  canCallTools: boolean;
  capture: CaptureResult | null;
  capturing: boolean;
  selectedDeviceId: string | null;
  knownDeviceIds: string[];
  captureDeviceIds: string[];
  request: CaptureRequest;
  viewMode: ViewMode;
  fitPreview: boolean;
  zoom: number;
  refreshSeconds: number;
  error: string | null;
  feedback: string;
  updatedAt: Date | null;
}

export type ResultsAction =
  | { type: 'initialized'; canCallTools: boolean }
  | { type: 'initializationFailed'; message: string }
  | { type: 'toolInput'; request: Partial<CaptureRequest> }
  | { type: 'captureStarted' }
  | { type: 'captureSucceeded'; capture: CaptureResult; source: 'manual' | 'auto' | 'host'; now: Date }
  | { type: 'captureFailed'; message: string }
  | { type: 'selectDevice'; deviceId: string }
  | { type: 'toggleCaptureDevice'; deviceId: string; checked: boolean }
  | { type: 'setViewMode'; mode: ViewMode }
  | { type: 'toggleFit' }
  | { type: 'zoomBy'; amount: number }
  | { type: 'setRefresh'; seconds: number }
  | { type: 'disposed' };

export function createInitialState(): ResultsState {
  return {
    lifecycle: 'initializing', canCallTools: false, capture: null, capturing: false,
    selectedDeviceId: null, knownDeviceIds: [], captureDeviceIds: [],
    request: { url: '', devices: [], fullPage: false }, viewMode: 'focus', fitPreview: true,
    zoom: 1, refreshSeconds: 0, error: null, feedback: '', updatedAt: null,
  };
}

export function reduceResultsState(state: ResultsState, action: ResultsAction): ResultsState {
  switch (action.type) {
    case 'initialized': return { ...state, lifecycle: 'ready', canCallTools: action.canCallTools, error: null };
    case 'initializationFailed': return { ...state, lifecycle: 'failed', error: action.message, capturing: false };
    case 'toolInput': return { ...state, request: { ...state.request, ...action.request } };
    case 'captureStarted': return state.capturing ? state : { ...state, capturing: true, error: null, feedback: 'Requesting fresh screenshots…' };
    case 'captureSucceeded': {
      const incoming = action.capture.screenshots.map((entry) => entry.deviceId);
      const knownDeviceIds = [...new Set([...state.knownDeviceIds, ...incoming])];
      const selectedDeviceId = state.selectedDeviceId && incoming.includes(state.selectedDeviceId)
        ? state.selectedDeviceId
        : action.capture.screenshots.find((entry) => !entry.error)?.deviceId ?? incoming[0] ?? null;
      return {
        ...state, capture: action.capture, capturing: false, selectedDeviceId, knownDeviceIds,
        captureDeviceIds: state.captureDeviceIds.length ? state.captureDeviceIds.filter((id) => knownDeviceIds.includes(id)) : incoming,
        request: { ...state.request, url: action.capture.url }, error: null, updatedAt: action.now,
        feedback: action.source === 'host' ? '' : `${action.source === 'auto' ? 'Auto-refreshed' : 'Captured'} ${action.capture.count} device${action.capture.count === 1 ? '' : 's'} just now.`,
      };
    }
    case 'captureFailed': return { ...state, capturing: false, error: action.message, feedback: action.message };
    case 'selectDevice': return state.knownDeviceIds.includes(action.deviceId) ? { ...state, selectedDeviceId: action.deviceId } : state;
    case 'toggleCaptureDevice': {
      const devices = action.checked
        ? [...new Set([...state.captureDeviceIds, action.deviceId])]
        : state.captureDeviceIds.filter((id) => id !== action.deviceId);
      return { ...state, captureDeviceIds: devices, request: { ...state.request, devices } };
    }
    case 'setViewMode': return { ...state, viewMode: action.mode };
    case 'toggleFit': return { ...state, fitPreview: !state.fitPreview, zoom: state.fitPreview ? 1 : state.zoom };
    case 'zoomBy': return { ...state, fitPreview: false, zoom: Math.min(2, Math.max(.25, Math.round((state.zoom + action.amount) * 100) / 100)) };
    case 'setRefresh': return { ...state, refreshSeconds: Math.max(0, action.seconds) };
    case 'disposed': return { ...state, lifecycle: 'disposed', canCallTools: false, capturing: false };
  }
}
