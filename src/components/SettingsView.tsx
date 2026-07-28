import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Globe, Check, Sliders, ShieldAlert, Moon, Code, Sparkles, Key, Info, Cpu, Printer } from 'lucide-react';
import {
  getComfySystemStats,
  openComfyWebSocket,
  parseComfyUrl,
} from '../services/comfyService';
import { parsePrinterUrl, listPrinters } from '../services/printService';
import { t } from '../utils/i18n';

interface SettingsViewProps {
  onClose: () => void;
  selectedWebcamId: string;
  genaiBackendUrl: string;
  genaiApiKey: string;
  sleepTimeout: number;
  comfyWorkflow: string;
  parallelJobs: number;
  webcamRotation: string;
  genaiEnabled: boolean;
  userPrompt: string;
  burstDelay: number;
  seedStrategy: 'timestamp' | 'sequence' | 'random';
  soundEffectsEnabled: boolean;
  comfyLivePreviewsEnabled: boolean;
  customPromptModeEnabled: boolean;
  // Module 3 - Printer properties
  printerEnabled: boolean;
  printerUrl: string;
  printerApiKey: string;
  selectedPrinter: string;
  // Remote Camera properties
  remoteCameraUrl: string;
  remoteCameraApiKey: string;
  showRemoteActivityLog: boolean;
  parallelCapturesEnabled: boolean;
  apiNativeBurstEnabled: boolean;
  onSave: (
    webcamId: string,
    url: string,
    apiKey: string,
    sleepTimeout: number,
    comfyWorkflow: string,
    parallelJobs: number,
    webcamRotation: string,
    genaiEnabled: boolean,
    userPrompt: string,
    burstDelay: number,
    seedStrategy: 'timestamp' | 'sequence' | 'random',
    // Module 3 - Printer properties saved
    printerEnabled: boolean,
    printerUrl: string,
    printerApiKey: string,
    selectedPrinter: string,
    soundEffectsEnabled: boolean,
    comfyLivePreviewsEnabled: boolean,
    customPromptModeEnabled: boolean,
    // Remote camera params
    remoteCameraUrl: string,
    remoteCameraApiKey: string,
    showRemoteActivityLog: boolean,
    parallelCapturesEnabled: boolean,
    apiNativeBurstEnabled: boolean
  ) => void;
}

export default function SettingsView({
  onClose,
  selectedWebcamId,
  genaiBackendUrl,
  genaiApiKey,
  sleepTimeout,
  comfyWorkflow,
  parallelJobs,
  webcamRotation,
  genaiEnabled,
  userPrompt,
  burstDelay,
  seedStrategy,
  soundEffectsEnabled,
  comfyLivePreviewsEnabled,
  customPromptModeEnabled,
  printerEnabled,
  printerUrl,
  printerApiKey,
  selectedPrinter,
  onSave,
  remoteCameraUrl,
  remoteCameraApiKey,
  showRemoteActivityLog,
  parallelCapturesEnabled,
  apiNativeBurstEnabled,
}: SettingsViewProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentWebcam, setCurrentWebcam] = useState(selectedWebcamId);
  const [currentRotation, setCurrentRotation] = useState(webcamRotation);
  const [backendUrl, setBackendUrl] = useState(genaiBackendUrl);
  const [backendApiKey, setBackendApiKey] = useState(genaiApiKey);
  const [currentSleepTimeout, setCurrentSleepTimeout] = useState(sleepTimeout);
  const [currentWorkflow, setCurrentWorkflow] = useState(comfyWorkflow);
  const [currentParallelJobs, setCurrentParallelJobs] = useState(parallelJobs);
  const [isGenaiEnabled, setIsGenaiEnabled] = useState(genaiEnabled);
  const [currentUserPrompt, setCurrentUserPrompt] = useState(userPrompt);
  const [currentBurstDelay, setCurrentBurstDelay] = useState(burstDelay);
  const [currentSeedStrategy, setCurrentSeedStrategy] = useState<'timestamp' | 'sequence' | 'random'>(seedStrategy);
  const [currentSoundEffectsEnabled, setCurrentSoundEffectsEnabled] = useState(soundEffectsEnabled);
  const [isComfyLivePreviewsEnabled, setIsComfyLivePreviewsEnabled] = useState(comfyLivePreviewsEnabled);
  const [isCustomPromptModeEnabled, setIsCustomPromptModeEnabled] = useState(customPromptModeEnabled);
  const [currentParallelCapturesEnabled, setCurrentParallelCapturesEnabled] = useState(parallelCapturesEnabled || false);
  const [currentApiNativeBurstEnabled, setCurrentApiNativeBurstEnabled] = useState(apiNativeBurstEnabled ?? true);

  // Module 3 - Printer States
  const [isPrinterEnabled, setIsPrinterEnabled] = useState(printerEnabled);
  const [currentPrinterUrl, setCurrentPrinterUrl] = useState(printerUrl);
  const [currentPrinterApiKey, setCurrentPrinterApiKey] = useState(printerApiKey);
  const [currentSelectedPrinter, setCurrentSelectedPrinter] = useState(selectedPrinter);

  const [jsonError, setJsonError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showRawJson, setShowRawJson] = useState(false);

  // Connection testing states
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [wsTestStatus, setWsTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [comfyVersion, setComfyVersion] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Printer Connection testing state
  const [printerTestStatus, setPrinterTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [printersList, setPrintersList] = useState<string[]>([]);
  const [printerTestError, setPrinterTestError] = useState<string | null>(null);

  // Module 1 Remote Camera States
  const [remoteEnabled, setRemoteEnabled] = useState(selectedWebcamId === 'remote-camera');
  const [remoteUrl, setRemoteUrl] = useState(remoteCameraUrl || '');
  const [remoteApiKey, setRemoteApiKey] = useState(remoteCameraApiKey || '');
  const [cameraTestStatus, setCameraTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [cameraTestError, setCameraTestError] = useState<string | null>(null);
  const [remoteCameraModel, setRemoteCameraModel] = useState<string | null>(null);
  const [currentShowActivityLog, setCurrentShowActivityLog] = useState(showRemoteActivityLog || false);

  const handleVerifyCameraConnection = async () => {
    setCameraTestStatus('testing');
    setCameraTestError(null);
    setRemoteCameraModel(null);

    try {
      const url = remoteUrl ? (remoteUrl.endsWith('/') ? remoteUrl.slice(0, -1) : remoteUrl) : '';
      const connectUrl = url ? `${url}/api/connect` : '/api/connect';
      const statusUrl = url ? `${url}/api/status` : '/api/status';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (remoteApiKey) {
        headers['Authorization'] = `Bearer ${remoteApiKey}`;
      }

      // Try connection first
      await fetch(connectUrl, { method: 'POST', headers });
      
      const res = await fetch(statusUrl, { headers });
      if (!res.ok) {
        throw new Error(`Device API returned status ${res.status}`);
      }
      
      const data = await res.json();
      if (data && data.connected) {
        setRemoteCameraModel(data.model || 'Canon EOS R5');
        setCameraTestStatus('success');
      } else {
        throw new Error(data && data.model === 'No camera' ? t('settingsView.physicalCameraDisconnected') : 'Internal connection offline.');
      }
    } catch (err: any) {
      console.error('Remote camera verification error:', err);
      setCameraTestError(err.message || t('settingsView.verificationCallFailed'));
      setCameraTestStatus('error');
    }
  };

  const handleConnectCamera = async () => {
    setCameraTestStatus('testing');
    setCameraTestError(null);
    setRemoteCameraModel(null);

    try {
      const url = remoteUrl ? (remoteUrl.endsWith('/') ? remoteUrl.slice(0, -1) : remoteUrl) : '';
      const connectUrl = url ? `${url}/api/connect` : '/api/connect';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (remoteApiKey) {
        headers['Authorization'] = `Bearer ${remoteApiKey}`;
      }
      
      const res = await fetch(connectUrl, { method: 'POST', headers });
      if (!res.ok) {
        throw new Error(`Connect returned status ${res.status}`);
      }
      
      const data = await res.json();
      setCameraTestStatus('success');
      const model = (data.status && data.status.model) || data.model || 'Canon EOS R5';
      setRemoteCameraModel(model);
    } catch (err: any) {
      console.error('Remote camera connect error:', err);
      setCameraTestError(err.message || t('settingsView.connectCallFailed'));
      setCameraTestStatus('error');
    }
  };

  const handleDisconnectCamera = async () => {
    setCameraTestStatus('testing');
    setCameraTestError(null);

    try {
      const url = remoteUrl ? (remoteUrl.endsWith('/') ? remoteUrl.slice(0, -1) : remoteUrl) : '';
      const disconnectUrl = url ? `${url}/api/disconnect` : '/api/disconnect';
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (remoteApiKey) {
        headers['Authorization'] = `Bearer ${remoteApiKey}`;
      }
      
      const res = await fetch(disconnectUrl, { method: 'POST', headers });
      if (!res.ok) {
        throw new Error(`Disconnect returned status ${res.status}`);
      }
      
      setCameraTestStatus('idle');
      setRemoteCameraModel(null);
    } catch (err: any) {
      console.error('Remote camera disconnect error:', err);
      setCameraTestError(err.message || t('settingsView.disconnectCallFailed'));
      setCameraTestStatus('error');
    }
  };

  const handleVerifyConnection = async () => {
    if (!backendUrl) {
      setTestError(t('settingsView.missingEndpointError'));
      setTestStatus('error');
      setWsTestStatus('error');
      return;
    }
    setTestStatus('testing');
    setWsTestStatus('testing');
    setTestError(null);
    setComfyVersion(null);

    const config = parseComfyUrl(backendUrl, backendApiKey);
    if (!config) {
      setTestError(t('settingsView.invalidUrlError'));
      setTestStatus('error');
      setWsTestStatus('error');
      return;
    }

    // Try HTTP Stats check first
    try {
      const stats = await getComfySystemStats(config);
      const version = stats?.system?.comfyui_version || stats?.comfyui_version;
      if (version) {
        setComfyVersion(version);
        setTestStatus('success');
      } else {
        setComfyVersion(t('settingsView.unspecifiedVersion'));
        setTestStatus('success');
      }
    } catch (err: any) {
      console.error('Verify connection error:', err);
      setTestError(err.message || 'Verification call failed. Check CORS, SSL or basic-auth credentials.');
      setTestStatus('error');
      setWsTestStatus('error');
      return; // Do not continue to WS test if basic HTTP endpoints fails
    }

    // Now attempt a WebSocket handshake test to verify whether live preview is supported without blocks
    try {
      const clientId = 'test_handshake_' + Math.random().toString(36).substring(7);
      console.log('[WebSocket Handshake Test] Verifying path:', config.wsUrl);
      const testWs = await openComfyWebSocket(config, clientId, 2500);
      testWs.close(1000, 'Connection test complete');
      setWsTestStatus('success');
    } catch (wsErr: any) {
      console.warn('[WebSocket Handshake Test] Encountered error or timeout:', wsErr);
      setWsTestStatus('error');
    }
  };

  const handleTestPrinterConnection = async () => {
    if (!currentPrinterUrl) {
      setPrinterTestError(t('settingsView.missingPrinterUrlError'));
      setPrinterTestStatus('error');
      return;
    }
    setPrinterTestStatus('testing');
    setPrinterTestError(null);
    setPrintersList([]);

    const config = parsePrinterUrl(currentPrinterUrl, currentPrinterApiKey);
    if (!config) {
      setPrinterTestError(t('settingsView.invalidPrinterUrlError'));
      setPrinterTestStatus('error');
      return;
    }

    try {
      const list = await listPrinters(config);
      setPrintersList(list);
      setPrinterTestStatus('success');
      if (list.length > 0 && (!currentSelectedPrinter || !list.includes(currentSelectedPrinter))) {
        setCurrentSelectedPrinter(list[0]);
      }
    } catch (err: any) {
      console.error('Printer connection test error:', err);
      setPrinterTestError(err.message || t('settingsView.printerTestFailedError'));
      setPrinterTestStatus('error');
    }
  };

  const enumVideoDevices = async () => {
    try {
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devList.filter(device => device.kind === 'videoinput');
      setDevices(videoDevs);
      
      const hasLabels = videoDevs.some(dev => dev.label);
      setPermissionGranted(hasLabels || videoDevs.length === 0);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  };

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      await enumVideoDevices();
    } catch (err) {
      console.error('Camera permission denied:', err);
      setPermissionGranted(false);
    }
  };

  useEffect(() => {
    enumVideoDevices();
  }, []);

  // Proactive printers fetch if already configured.
  useEffect(() => {
    if (printerEnabled && printerUrl) {
      const config = parsePrinterUrl(printerUrl, printerApiKey);
      if (config) {
        listPrinters(config)
          .then(list => {
            setPrintersList(list);
            if (selectedPrinter && list.includes(selectedPrinter)) {
              setCurrentSelectedPrinter(selectedPrinter);
            } else if (list.length > 0 && !currentSelectedPrinter) {
              setCurrentSelectedPrinter(list[0]);
            }
          })
          .catch(err => {
            console.warn('Initial printer list fetch caught error silently:', err);
          });
      }
    }
  }, [printerEnabled, printerUrl, printerApiKey, selectedPrinter]);

  const handleSave = () => {
    try {
      JSON.parse(currentWorkflow);
    } catch (err: any) {
      setJsonError(t('settingsView.invalidJsonError', { error: err.message || 'Invalid JSON format' }));
      return;
    }

    setSaveStatus('saving');
    onSave(
      currentWebcam,
      backendUrl,
      backendApiKey,
      currentSleepTimeout,
      currentWorkflow,
      currentParallelJobs,
      currentRotation,
      isGenaiEnabled,
      currentUserPrompt,
      currentBurstDelay,
      currentSeedStrategy,
      // Printer parameters mapping
      isPrinterEnabled,
      currentPrinterUrl,
      currentPrinterApiKey,
      currentSelectedPrinter,
      currentSoundEffectsEnabled,
      isComfyLivePreviewsEnabled,
      isCustomPromptModeEnabled,
      // Remote camera configs
      remoteUrl,
      remoteApiKey,
      currentShowActivityLog,
      currentParallelCapturesEnabled,
      currentApiNativeBurstEnabled
    );
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 800);
    }, 400);
  };

  return (
    <div id="settings-view-overlay" className="settings-overlay-container fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 font-sans">
      <motion.div 
        id="settings-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      <motion.div 
        id="settings-dialog-card"
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-zinc-150 flex flex-col max-h-[90vh]"
      >
        {/* Top Accent line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-green-500" />

        {/* Header toolbar */}
        <div id="settings-header" className="p-6 pb-4 flex justify-between items-start border-b border-zinc-100">
          <div>
            <h2 className="text-xl font-black tracking-tight uppercase text-zinc-900 flex items-center gap-2">
              <Sliders className="text-green-500" size={20} />
              {t('settingsView.title')}
            </h2>
          </div>
          <button 
            id="settings-close-btn"
            onClick={onClose}
            className="w-9 h-9 bg-zinc-50 hover:bg-zinc-100 active:scale-95 rounded-full flex items-center justify-center transition-all group"
          >
            <X className="text-zinc-450 group-hover:text-zinc-900 transition-colors" size={16} />
          </button>
        </div>

        {/* Modular Content scroll container */}
        <div id="settings-content-body" className="flex-1 p-6 overflow-y-auto space-y-6 bg-zinc-50/20 animate-fade-in">
          
          {/* ========================================================== */}
          {/* MODULE 1: WEBCAM                                           */}
          {/* ========================================================== */}
          <section id="module-webcam-card" className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center bg-zinc-50/25 p-3 rounded-xl border border-zinc-100/80">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  remoteEnabled ? 'bg-green-50 text-green-500' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  <Camera size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-450">{t('settingsView.webcamHeader')}</h3>
                  <h4 className="text-sm font-bold text-zinc-805 -mt-0.5">{t('settingsView.remoteCamera')}</h4>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-tight ${
                  remoteEnabled ? 'text-green-600' : 'text-zinc-400'
                }`}>
                  {remoteEnabled ? t('common.enabled') : t('common.disabled')}
                </span>
                <button
                  id="remote-camera-toggle-switch"
                  type="button"
                  onClick={() => {
                    const nextVal = !remoteEnabled;
                    setRemoteEnabled(nextVal);
                    if (nextVal) {
                      setCurrentWebcam('remote-camera');
                    } else {
                      setCurrentWebcam('');
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    remoteEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      remoteEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <hr className="border-zinc-100" />

            {!remoteEnabled && (
              <div className="p-3 bg-zinc-50 border border-zinc-250 rounded-xl">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 font-sans">
                    {t('settingsView.remoteCameraDeactivated')}
                  </span>
                </div>

                {/* Feed Source Selector */}
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500 flex items-center gap-1">
                    {t('settingsView.feedSourceLabel')}
                  </label>
                  <div className="relative">
                    <select
                      value={currentWebcam}
                      onChange={(e) => setCurrentWebcam(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 text-zinc-805 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 cursor-pointer appearance-none transition-all"
                    >
                      <option value="">{t('settingsView.defaultOptionCamera')}</option>
                      {devices.map((device, idx) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || t('settingsView.videoInputModule', { index: idx + 1 })}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <Camera size={14} />
                    </div>
                  </div>
                </div>
              </div>
            )}

             <div>
               {/* Remote Camera Single Row Layout */}
               <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                 {/* Remote Camera URL */}
                 <div className="md:col-span-6 flex flex-col gap-1.5">
                   <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                     remoteEnabled ? 'text-zinc-500' : 'text-zinc-300'
                   }`}>
                     {t('settingsView.remoteCameraServerUrl')}
                   </label>
                   <div className="relative">
                     <input
                       type="url"
                       value={remoteUrl}
                       onChange={(e) => setRemoteUrl(e.target.value)}
                       placeholder="e.g. http://localhost:5000"
                       disabled={!remoteEnabled}
                       className="w-full bg-white disabled:bg-zinc-50 border border-zinc-200 disabled:border-zinc-100 text-zinc-800 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                     />
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                       <Globe size={14} />
                     </div>
                   </div>
                 </div>

                 {/* API Key */}
                 <div className="md:col-span-4 flex flex-col gap-1.5">
                   <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                     remoteEnabled ? 'text-zinc-500' : 'text-zinc-300'
                   }`}>
                     {t('settingsView.remoteCameraApiKey')}
                   </label>
                   <div className="relative">
                     <input
                       type="password"
                       value={remoteApiKey}
                       onChange={(e) => setRemoteApiKey(e.target.value)}
                       placeholder="X-API-Key value"
                       disabled={!remoteEnabled}
                       className="w-full bg-white disabled:bg-zinc-50 border border-zinc-200 disabled:border-zinc-100 text-zinc-805 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                     />
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                       <Key size={14} />
                     </div>
                   </div>
                 </div>

                 {/* Test Button */}
                 <div className="md:col-span-2">
                   <button
                     type="button"
                     onClick={handleVerifyCameraConnection}
                     disabled={!remoteEnabled || cameraTestStatus === 'testing'}
                     className="w-full h-[42px] px-4 py-2 bg-zinc-105 hover:bg-zinc-202 disabled:bg-zinc-50/50 disabled:opacity-50 text-zinc-805 disabled:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 disabled:border-zinc-100 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center active:scale-95 disabled:pointer-events-none"
                   >
                     {cameraTestStatus === 'testing' ? t('settingsView.testingConnection') : t('settingsView.testConnectionBtn')}
                   </button>
                 </div>
               </div>

               {/* Controls and Toggles status representations */}
               {remoteEnabled && (
                  <div className="flex flex-col gap-3 pt-1">
                    {cameraTestStatus === 'testing' && (
                      <div className="p-3 bg-white border border-zinc-200 text-zinc-650 rounded-xl text-xs flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <span>{t('settingsView.processingCameraOperation')}</span>
                      </div>
                    )}

                    {cameraTestStatus === 'success' && (
                      <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-green-900">
                          <Check size={14} className="text-green-600" /> {t('settingsView.cameraHandshakeSucceeded')}
                        </div>
                        <div className="font-mono text-[10px] text-green-700">
                          {t('settingsView.cameraModelLabel', { model: remoteCameraModel })}
                        </div>
                      </div>
                    )}

                    {cameraTestStatus === 'error' && cameraTestError && (
                      <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-1">
                        <div className="font-bold">{t('settingsView.cameraConnectionFailed')}</div>
                        <div className="font-mono text-[10px] text-red-700 leading-normal">{cameraTestError}</div>
                      </div>
                    )}
                  </div>
               )}
             </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* n_captures selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.capturesCountLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={currentParallelJobs}
                    onChange={(e) => setCurrentParallelJobs(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-805 text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
                    min={1}
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentParallelJobs(1)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-707 text-xs font-bold rounded-xl border border-zinc-200 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    {t('common.reset')}
                  </button>
                </div>
              </div>

              {/* burst delay in ms */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.burstDelayLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={currentBurstDelay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setCurrentBurstDelay(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
                    min={0}
                    placeholder={t('settingsView.burstDelayPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentBurstDelay(500)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-707 text-xs font-bold rounded-xl border border-zinc-200 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    {t('common.reset')}
                  </button>
                </div>
              </div>

              {/* Rotation Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-505">
                  {t('settingsView.rotationAngleLabel')}
                </label>
                <div className="relative">
                  <select
                    value={currentRotation}
                    onChange={(e) => setCurrentRotation(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 cursor-pointer appearance-none transition-all"
                  >
                    <option value="0">{t('settingsView.rotationOptionNone')}</option>
                    <option value="90">{t('settingsView.rotationOption90')}</option>
                    <option value="270">{t('settingsView.rotationOption270')}</option>
                    <option value="180">{t('settingsView.rotationOption180')}</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 font-mono text-xs">
                    ↻
                  </div>
                </div>
              </div>

              {/* inactivity sleep timeout */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.sleepTimeoutLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={currentSleepTimeout === 0 ? 0 : Math.round(currentSleepTimeout / 60)}
                    onChange={(e) => {
                      const mins = Math.max(0, parseInt(e.target.value) || 0);
                      setCurrentSleepTimeout(mins * 60);
                    }}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
                    min={0}
                    placeholder={t('settingsView.sleepTimeoutPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setCurrentSleepTimeout(120)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-707 text-xs font-bold rounded-xl border border-zinc-200 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    {t('common.reset')}
                  </button>
                </div>
              </div>
            </div>

            {/* Sound effects toggle */}
            <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-850">{t('settingsView.soundEffectsLabel')}</span>
                <span className="text-[10px] text-zinc-400 font-sans">
                  {t('settingsView.soundEffectsSub')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentSoundEffectsEnabled(prev => !prev)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  currentSoundEffectsEnabled ? 'bg-green-500' : 'bg-zinc-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    currentSoundEffectsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Show Remote Activity Log Toggle */}
            <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-850">{t('settingsView.showActivityLog')}</span>
                <span className="text-[10px] text-zinc-400 font-sans">
                  {t('settingsView.displayRemoteEvents')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentShowActivityLog(prev => !prev)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  currentShowActivityLog ? 'bg-green-500' : 'bg-zinc-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    currentShowActivityLog ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* API-Native DSLR Burst Toggle */}
            <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-850">{t('settingsView.apiNativeDslrBurst')}</span>
                <span className="text-[10px] text-zinc-400 font-sans">
                  {t('settingsView.apiNativeDslrBurstSub')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentApiNativeBurstEnabled(prev => !prev)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  currentApiNativeBurstEnabled ? 'bg-green-500' : 'bg-zinc-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    currentApiNativeBurstEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Parallel App Captures Toggle (Visible only when API-Native burst is disabled) */}
            {!currentApiNativeBurstEnabled && (
              <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3 ml-4 border-l-4 border-l-green-500">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-zinc-850">{t('settingsView.parallelAppCaptures')}</span>
                  <span className="text-[10px] text-zinc-400 font-sans">
                    {t('settingsView.parallelAppCapturesSub')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentParallelCapturesEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    currentParallelCapturesEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      currentParallelCapturesEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}
          </section>

          {/* ========================================================== */}
          {/* MODULE 2: GENAI BACKEND                                    */}
          {/* ========================================================== */}
          <section id="module-genai-card" className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center bg-zinc-50/20 p-2 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isGenaiEnabled ? 'bg-green-50 text-green-500' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  <Cpu size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-450">{t('settingsView.genaiHeader')}</h3>
                  <h4 className="text-sm font-bold text-zinc-805 -mt-0.5">{t('settingsView.genaiSub')}</h4>
                </div>
              </div>
              
              {/* Premium Switch Toggle for Module 2 */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-tight ${
                  isGenaiEnabled ? 'text-green-600' : 'text-zinc-400'
                }`}>
                  {isGenaiEnabled ? t('settingsView.genaiActiveText') : t('settingsView.genaiBypassText')}
                </span>
                <button
                  id="genai-toggle-switch"
                  type="button"
                  onClick={() => setIsGenaiEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isGenaiEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isGenaiEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <hr className="border-zinc-100" />

            {/* Container dims visual content nicely if GenAI pipeline toggle is bypass */}
            <div className={`space-y-4 transition-all duration-300`}>
              {!isGenaiEnabled && (
                <div className="p-3 bg-zinc-50 border border-zinc-250 rounded-xl flex items-center gap-2">
                  <Info size={14} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 font-sans">
                    {t('settingsView.genaiBypassDescription')}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* ComfyUI endpoint URL */}
                <div className="md:col-span-6 flex flex-col gap-1.5">
                  <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                    isGenaiEnabled ? 'text-zinc-500' : 'text-zinc-300'
                  }`}>
                    {t('settingsView.comfyUrlLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={backendUrl}
                      onChange={(e) => setBackendUrl(e.target.value)}
                      placeholder={t('settingsView.comfyUrlPlaceholder')}
                      disabled={!isGenaiEnabled}
                      className="w-full bg-zinc-50 disabled:bg-zinc-50/50 border border-zinc-200 disabled:border-zinc-100 text-zinc-805 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <Globe size={14} />
                    </div>
                  </div>
                </div>

                {/* Optional Key secret header */}
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                    isGenaiEnabled ? 'text-zinc-500' : 'text-zinc-300'
                  }`}>
                    {t('settingsView.apiKeyLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={backendApiKey}
                      onChange={(e) => setBackendApiKey(e.target.value)}
                      placeholder={t('settingsView.apiKeyPlaceholder')}
                      disabled={!isGenaiEnabled}
                      className="w-full bg-zinc-50 disabled:bg-zinc-50/50 border border-zinc-200 disabled:border-zinc-100 text-zinc-800 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <Key size={14} />
                    </div>
                  </div>
                </div>

                {/* Test Button */}
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleVerifyConnection}
                    disabled={!isGenaiEnabled || testStatus === 'testing'}
                    className="w-full h-[42px] px-4 py-2 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-50/50 disabled:opacity-50 text-zinc-805 disabled:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 disabled:border-zinc-100 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center active:scale-95 disabled:pointer-events-none"
                  >
                    {testStatus === 'testing' ? t('settingsView.testingConnection') : t('settingsView.testConnectionBtn')}
                  </button>
                </div>
              </div>

              {/* Connection Status representations */}
              <div className="flex flex-col gap-2 pt-1">
                {testStatus === 'testing' && (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 text-zinc-650 rounded-xl text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                      <span>{t('settingsView.testingConnection')}</span>
                    </div>
                    {wsTestStatus === 'testing' && (
                      <div className="flex items-center gap-2 pl-5 text-[10px] text-zinc-400">
                        <div className="w-2.5 h-2.5 border border-zinc-450 border-t-transparent rounded-full animate-spin" />
                        <span>{t('settingsView.wsTestChecking')}</span>
                      </div>
                    )}
                  </div>
                )}

                {testStatus === 'success' && comfyVersion && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs space-y-2.5">
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-green-900">
                        <Check size={14} className="text-green-600" /> {t('settingsView.testSuccessTitle')}
                      </div>
                      <div className="font-mono text-[10px] text-green-700">
                        {t('settingsView.versionLabel')}: <strong className="font-bold">{comfyVersion}</strong>
                      </div>
                    </div>

                    {/* WebSocket Handshake Check Indicator */}
                    <div className="pt-2 border-t border-green-200/50">
                      {wsTestStatus === 'success' ? (
                        <div className="flex items-start gap-2 text-[11px] text-green-850">
                          <Check size={12} strokeWidth={3} className="text-green-600 mt-0.5" />
                          <div>
                            <p className="mt-0.5 leading-normal font-semibold font-sans">{t('settingsView.wsTestSuccess')}</p>
                          </div>
                        </div>
                      ) : wsTestStatus === 'error' ? (
                        <div className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 animate-pulse flex-shrink-0" />
                          <div>
                            <p className="mt-0.5 leading-normal font-semibold font-sans">{t('settingsView.wsTestFailed')}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {testStatus === 'error' && testError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-1 bg-red-50">
                    <div className="font-bold">{t('settingsView.testFailedTitle')}</div>
                    <div className="font-mono text-[10px] text-red-700 leading-normal">{testError}</div>
                  </div>
                )}
              </div>

              {/* Workflow Template Actions */}
              <div className="p-4 bg-zinc-50 border border-zinc-200/50 rounded-xl space-y-3.5">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <Code size={13} className="text-zinc-500" />
                    <span className="text-[10px] font-bold text-zinc-650 uppercase tracking-tight">{t('settingsView.workflowHeader')}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    {/* Invisible file picker */}
                    <input
                      type="file"
                      id="workflow-json-loader"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const content = event.target?.result as string;
                            const parsed = JSON.parse(content);
                            setCurrentWorkflow(JSON.stringify(parsed, null, 2));
                            setJsonError(null);
                          } catch (err: any) {
                            setJsonError(t('settingsView.invalidJsonError', { error: err.message }));
                          }
                        };
                        reader.readAsText(file);
                      }}
                      className="hidden"
                    />
                    
                    {/* Load template picker trigger */}
                    <button
                      type="button"
                      onClick={() => document.getElementById('workflow-json-loader')?.click()}
                      className="text-[10px] font-black uppercase tracking-wider text-[#10b981] hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg border border-green-200 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={11} />
                      {t('settingsView.loadWorkflowBtn')}
                    </button>
                    
                    {/* Manual JSON code editor toggle */}
                    <button
                      type="button"
                      onClick={() => setShowRawJson(!showRawJson)}
                      className="text-[10px] font-black uppercase tracking-wider text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                    >
                      {t('settingsView.manualEditBtn')}
                    </button>
                  </div>
                </div>

                {showRawJson && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200/40">
                    <textarea
                      value={currentWorkflow}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCurrentWorkflow(val);
                        try {
                          JSON.parse(val);
                          setJsonError(null);
                        } catch (err: any) {
                          setJsonError(err.message || t('settingsView.syntaxError'));
                        }
                      }}
                      rows={6}
                      placeholder={t('settingsView.workflowJsonPlaceholder')}
                      className={`w-full bg-zinc-950 text-zinc-100 font-mono text-[10px] rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-green-500 transition-all ${
                        jsonError ? 'border border-red-400' : 'border border-zinc-850'
                      }`}
                    />
                    {jsonError && (
                      <div className="text-[10px] text-red-630 font-mono bg-red-50 border border-red-200 p-2 rounded-lg">
                        {jsonError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Seed Strategy Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.seedStrategyLabel')}
                </label>
                <div className="relative">
                  <select
                    value={currentSeedStrategy}
                    onChange={(e) => setCurrentSeedStrategy(e.target.value as 'timestamp' | 'sequence' | 'random')}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 cursor-pointer appearance-none transition-all"
                  >
                    <option value="sequence">{t('settingsView.seedStrategyOptionFixed')}</option>
                    <option value="timestamp">{t('settingsView.seedStrategyOptionTimestamp')}</option>
                    <option value="random">{t('settingsView.seedStrategyOptionRandom')}</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <Info size={14} />
                  </div>
                </div>
                <span className="text-[10px] text-zinc-400 font-sans italic leading-tight">
                  {t('settingsView.seedStrategySub')}
                </span>
              </div>

              {/* CLIP Text encode Positive Prompt text input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.promptInputLabel')}
                </label>
                <textarea
                  value={currentUserPrompt}
                  onChange={(e) => setCurrentUserPrompt(e.target.value)}
                  rows={3}
                  placeholder={t('settingsView.promptInputPlaceholder')}
                  className="w-full text-xs p-3 border border-zinc-200 rounded-xl font-sans focus:outline-none focus:border-green-500 transition-all text-zinc-800 bg-zinc-50/20 font-medium"
                />
                <span className="text-[10px] text-zinc-400 font-sans italic leading-tight">
                  {t('settingsView.promptInputSub')}
                </span>
              </div>

              {/* ComfyUI Live Previews toggle */}
              <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                <div className="flex flex-col pr-4">
                  <span className="text-xs font-bold text-zinc-850">{t('settingsView.comfyLivePreviews')}</span>
                  <span className="text-[10px] text-zinc-400 font-sans">
                    {t('settingsView.comfyLivePreviewsSub')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsComfyLivePreviewsEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isComfyLivePreviewsEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isComfyLivePreviewsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Custom Prompt Mode toggle */}
              <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 rounded-xl p-3">
                <div className="flex flex-col pr-4">
                  <span className="text-xs font-bold text-zinc-850">{t('settingsView.customPromptMode')}</span>
                  <span className="text-[10px] text-zinc-400 font-sans">
                    {t('settingsView.customPromptModeSub')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomPromptModeEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isCustomPromptModeEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isCustomPromptModeEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* ========================================================== */}
          {/* MODULE 3: PRINTER MODULE (OPTIONAL)                        */}
          {/* ========================================================== */}
          <section id="module-printer-card" className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center bg-zinc-50/20 p-2 rounded-xl border border-zinc-100">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isPrinterEnabled ? 'bg-green-50 text-green-500' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  <Printer size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-450">{t('settingsView.printerHeader')}</h3>
                  <h4 className="text-sm font-bold text-zinc-805 -mt-0.5">{t('settingsView.printerSub')}</h4>
                </div>
              </div>
              
              {/* Toggle switch for Module 3 */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-tight ${
                  isPrinterEnabled ? 'text-green-600' : 'text-zinc-400'
                }`}>
                  {isPrinterEnabled ? t('settingsView.printerActiveText') : t('settingsView.printerBypassText')}
                </span>
                <button
                  id="printer-toggle-switch"
                  type="button"
                  onClick={() => setIsPrinterEnabled(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isPrinterEnabled ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isPrinterEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <hr className="border-zinc-100" />

            <div className={`space-y-4 transition-all duration-300 ${
              isPrinterEnabled ? 'opacity-100' : 'opacity-60 pointer-events-auto filter grayscale-[15%]'
            }`}>
              {!isPrinterEnabled && (
                <div className="p-3 bg-zinc-50 border border-zinc-250 rounded-xl flex items-center gap-2">
                  <Info size={14} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 font-sans">
                    {t('settingsView.printerBypassDescription')}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* Printer server endpoint URL */}
                <div className="md:col-span-6 flex flex-col gap-1.5">
                  <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                    isPrinterEnabled ? 'text-zinc-500' : 'text-zinc-300'
                  }`}>
                    {t('settingsView.printerUrlLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={currentPrinterUrl || ''}
                      onChange={(e) => setCurrentPrinterUrl(e.target.value)}
                      placeholder={t('settingsView.printerUrlPlaceholder')}
                      disabled={!isPrinterEnabled}
                      className="w-full bg-zinc-50 disabled:bg-zinc-50/50 border border-zinc-200 disabled:border-zinc-100 text-zinc-800 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <Globe size={14} />
                    </div>
                  </div>
                </div>

                {/* API Key */}
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <label className={`text-[10px] uppercase tracking-wider font-extrabold transition-colors ${
                    isPrinterEnabled ? 'text-zinc-500' : 'text-zinc-300'
                  }`}>
                    {t('settingsView.printerApiKeyLabel')}
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={currentPrinterApiKey}
                      onChange={(e) => setCurrentPrinterApiKey(e.target.value)}
                      placeholder={t('settingsView.printerApiKeyPlaceholder')}
                      disabled={!isPrinterEnabled}
                      className="w-full bg-zinc-50 disabled:bg-zinc-50/50 border border-zinc-200 disabled:border-zinc-100 text-zinc-805 disabled:text-zinc-300 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 font-mono disabled:cursor-not-allowed transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <Key size={14} />
                    </div>
                  </div>
                </div>

                {/* Test button */}
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleTestPrinterConnection}
                    disabled={!isPrinterEnabled || printerTestStatus === 'testing'}
                    className="w-full h-[42px] px-4 py-2 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-50/50 disabled:opacity-50 text-zinc-805 disabled:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 disabled:border-zinc-100 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center active:scale-95 disabled:pointer-events-none"
                  >
                    {printerTestStatus === 'testing' ? t('settingsView.testingConnection') : t('settingsView.testConnectionBtn')}
                  </button>
                </div>
              </div>

              {/* Printer Test Status representations */}
              <div className="flex flex-col gap-2 pt-1">
                {printerTestStatus === 'success' && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Check size={14} className="text-green-600" /> {t('settingsView.printerConnectedSuccess')}
                    </div>
                    <div className="font-sans text-[10px] text-green-700 leading-normal">
                      {t('settingsView.printerConnectedSub')}
                    </div>
                  </div>
                )}

                {printerTestStatus === 'error' && printerTestError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs space-y-1">
                    <div className="font-bold">{t('settingsView.printerConnectedFailed')}</div>
                    <div className="font-mono text-[10px] text-red-700 leading-normal">{printerTestError}</div>
                  </div>
                )}
              </div>

              {/* Printer selection dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500">
                  {t('settingsView.selectPrinterLabel')}
                </label>
                <div className="relative">
                  <select
                    value={currentSelectedPrinter}
                    onChange={(e) => setCurrentSelectedPrinter(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 text-zinc-800 text-xs font-semibold rounded-xl p-3 pr-9 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 cursor-pointer appearance-none transition-all"
                  >
                    {!currentSelectedPrinter && printersList.length === 0 && (
                      <option value="">{t('settingsView.noPrintersFetched')}</option>
                    )}
                    {currentSelectedPrinter && !printersList.includes(currentSelectedPrinter) && (
                      <option value={currentSelectedPrinter}>{t('settingsView.savedPrinterLabel', { printerName: currentSelectedPrinter })}</option>
                    )}
                    {printersList.map((pr) => (
                      <option key={pr} value={pr}>
                        {pr}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <Printer size={14} />
                  </div>
                </div>
                <span className="text-[10px] text-zinc-400 font-sans italic leading-tight">
                  {t('settingsView.printerSelectSub')}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Action controllers footer */}
        <div id="settings-footer" className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-zinc-450 hover:text-zinc-800 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            id="settings-save-btn"
            onClick={handleSave}
            disabled={saveStatus !== 'idle'}
            className="bg-zinc-900 border border-zinc-800 hover:bg-green-600 text-white px-7 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:border-transparent flex items-center gap-1.5 active:scale-95 disabled:bg-zinc-300"
          >
            {saveStatus === 'idle' && t('common.save')}
            {saveStatus === 'saving' && t('common.saving')}
            {saveStatus === 'saved' && (
              <>
                <Check size={14} />
                {t('common.saved')}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
