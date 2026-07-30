import React, { useState, useEffect } from 'react';
import CameraView from './components/CameraView';
import ResultView from './components/ResultView';
import SettingsView from './components/SettingsView';
import { AppView, PreviewUpdate, FinalResult } from './types';
import { Settings, Moon, VideoOff, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { 
  DEFAULT_COMFY_WORKFLOW, 
  parseComfyUrl, 
  uploadImageToComfy, 
  queuePromptToComfy, 
  fetchComfyViewUrl,
  openComfyWebSocket,
  waitForComfyHistory,
} from './services/comfyService';
import { parsePrinterUrl, printImage } from './services/printService';
import { t } from './utils/i18n';

export default function App() {
  const [view, setView] = useState<AppView>('CAMERA');
  const [showSettings, setShowSettings] = useState(false);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('');
  
  // Settings persistence
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>(() => {
    return localStorage.getItem('selected_webcam_id') || '';
  });
  const [genaiBackendUrl, setGenaiBackendUrl] = useState<string>(() => {
    const raw = localStorage.getItem('genai_backend_url') || '';
    return raw.trim().replace(/\/api\/?$/, '');
  });
  const [genaiApiKey, setGenaiApiKey] = useState<string>(() => {
    return localStorage.getItem('genai_api_key') || '';
  });
  const [comfyWorkflow, setComfyWorkflow] = useState<string>(() => {
    const saved = localStorage.getItem('comfy_workflow');
    return saved || JSON.stringify(DEFAULT_COMFY_WORKFLOW, null, 2);
  });
  const [parallelJobs, setParallelJobs] = useState<number>(() => {
    const saved = localStorage.getItem('parallel_jobs');
    return saved !== null ? parseInt(saved, 10) : 1;
  });
  const [webcamRotation, setWebcamRotation] = useState<string>(() => {
    return localStorage.getItem('webcam_rotation') || '0';
  });
  const [genaiEnabled, setGenaiEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('genai_enabled');
    return saved !== null ? saved === 'true' : false;
  });
  const [burstDelay, setBurstDelay] = useState<number>(() => {
    const saved = localStorage.getItem('burst_delay');
    return saved !== null ? parseInt(saved, 10) : 500;
  });
  const sequenceCaptureEnabled = burstDelay > 0;
  const [originalSeeds, setOriginalSeeds] = useState<number[]>([]);
  const [seedStrategy, setSeedStrategy] = useState<'timestamp' | 'sequence' | 'random'>(() => {
    const saved = localStorage.getItem('seed_strategy');
    if (saved === 'sequence' || saved === 'timestamp' || saved === 'random') {
      return saved;
    }
    return 'timestamp';
  });

  const [printerEnabled, setPrinterEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('printer_enabled');
    return saved === 'true';
  });
  const [printerUrl, setPrinterUrl] = useState<string>(() => {
    return localStorage.getItem('printer_url') || '';
  });
  const [printerApiKey, setPrinterApiKey] = useState<string>(() => {
    return localStorage.getItem('printer_api_key') || '';
  });
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    return localStorage.getItem('selected_printer') || '';
  });
  const [printerMultiSelectEnabled, setPrinterMultiSelectEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('printer_multi_select_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [printerAutoCloseEnabled, setPrinterAutoCloseEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('printer_auto_close_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('sound_effects_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [comfyLivePreviewsEnabled, setComfyLivePreviewsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('comfy_live_previews_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [customPromptModeEnabled, setCustomPromptModeEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('custom_prompt_mode_enabled');
    return saved !== null ? saved === 'true' : false;
  });

  const [remoteCameraUrl, setRemoteCameraUrl] = useState<string>(() => {
    return localStorage.getItem('remote_camera_url') || '';
  });
  const [remoteCameraApiKey, setRemoteCameraApiKey] = useState<string>(() => {
    return localStorage.getItem('remote_camera_api_key') || '';
  });
  const [showRemoteActivityLog, setShowRemoteActivityLog] = useState<boolean>(() => {
    return localStorage.getItem('show_remote_activity_log') === 'true';
  });
  const [parallelCapturesEnabled, setParallelCapturesEnabled] = useState<boolean>(() => {
    return localStorage.getItem('parallel_captures_enabled') === 'true';
  });
  // Sleep mode configuration and state
  const [isAsleep, setIsAsleep] = useState(false);
  const [sleepTimeout, setSleepTimeout] = useState<number>(() => {
    const saved = localStorage.getItem('sleep_timeout');
    return saved !== null ? parseInt(saved, 10) : 120; // Default 2 minutes (120 seconds)
  });

  // Last captured snapshot data-url
  const [lastCapturedImage, setLastCapturedImage] = useState<string | null>(null);
  const [lastCapturedImages, setLastCapturedImages] = useState<string[]>([]);
  const [failedCapturesCount, setFailedCapturesCount] = useState<number>(0);

  // Local processing states instead of WebSocket synchronization
  const [previews, setPreviews] = useState<PreviewUpdate[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [printErrorAlert, setPrintErrorAlert] = useState<string | null>(null);
  const [delay, setDelay] = useState(() => {
    const saved = localStorage.getItem('exposure_delay');
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  const [genaiFilterOn, setGenaiFilterOn] = useState<boolean>(true);
  const [generationTriggered, setGenerationTriggered] = useState<boolean>(false);

  // Trigger delayed generation if user clicks the GenAI toggle inside ResultView
  useEffect(() => {
    if (view === 'RESULT' && genaiEnabled && genaiFilterOn && !generationTriggered && lastCapturedImages.length > 0) {
      console.log('GenAI Filter turned on. Initiating delayed generation pipeline...');
      handleCapture(lastCapturedImages);
    }
  }, [genaiFilterOn, view, genaiEnabled, generationTriggered, lastCapturedImages]);

  useEffect(() => {
    if (sleepTimeout <= 0) {
      setIsAsleep(false);
      return;
    }

    let timer: NodeJS.Timeout;

    const resetTimer = (e?: Event) => {
      if (e && e.target) {
        const target = e.target as HTMLElement;
        if (target.closest('.settings-toggle') || target.closest('.settings-overlay-container')) {
          // Do not wake up when clicking settings controls
          return;
        }
      }
      if (isAsleep) {
        // If system is asleep, ONLY clicking the sleep/standby overlay awakens it.
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(() => {
        if (view === 'CAMERA') {
          console.log(`System idle limit reached (${sleepTimeout} seconds). Entering Sleep Mode...`);
          setIsAsleep(true);
        }
      }, sleepTimeout * 1000);
    };

    const inputEvents = ['click', 'touchstart', 'keypress'];
    inputEvents.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    // Init timer
    resetTimer();

    return () => {
      clearTimeout(timer);
      inputEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [sleepTimeout, view]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCapture = async (images: string[]) => {
    // Detect failed visual indicators (like error SVGs) and remove them from display list
    const isErrorImage = (img: string) => {
      if (!img) return true;
      let decoded = img;
      try {
        decoded = decodeURIComponent(img);
      } catch (e) {}
      
      if (decoded.includes('data:image/svg+xml') && (
        decoded.includes('CAPTURE OFFLINE') || 
        decoded.includes('Error') || 
        decoded.includes('Failed') || 
        decoded.includes('Webcam Not Active') || 
        decoded.includes('No Active') || 
        decoded.includes('Canvas Context') || 
        decoded.includes('Unavailable') || 
        decoded.includes('NO CAPTURE SIGNAL') ||
        decoded.includes('Missing burst frame')
      )) {
        return true;
      }
      return false;
    };

    const finalImages = images.filter(img => !isErrorImage(img));
    const failedCount = images.length - finalImages.length;
    setFailedCapturesCount(failedCount);

    // Primary captured image can just be the first image in the list
    const fallbackSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
        <rect width="100%" height="100%" fill="#18181b"/>
        <text x="600" y="900" fill="#71717a" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">NO CAPTURE SIGNAL</text>
      </svg>`
    )}`;
    const base64Image = finalImages[0] || fallbackSvg;
    localStorage.setItem('last_captured_image', base64Image);
    setLastCapturedImage(base64Image);
    setLastCapturedImages(finalImages);
    setView('RESULT');

    setPreviews([]);

    // If GenAI is disabled, we skip generation/ComfyUI completely and instantly show the results!
    if (!genaiEnabled) {
      console.log('GenAI Mode is deactivated. Displaying captured photo(s) instantly.');
      setFinalResult({
        variants: finalImages,
        completed: Array(finalImages.length).fill(true)
      });
      return;
    }

    if (!genaiFilterOn) {
      console.log('GenAI Filter is currently off. Deferring generation until activated.');
      setFinalResult({
        variants: finalImages,
        completed: Array(finalImages.length).fill(false)
      });
      setGenerationTriggered(false);
      return;
    }

    setGenerationTriggered(true);

    // Initialize finalResult immediately with original images as placeholders and completed state as false
    setFinalResult({
      variants: finalImages,
      completed: Array(finalImages.length).fill(false)
    });

    // Try ComfyUI integration if URL is configured
    const config = parseComfyUrl(genaiBackendUrl, genaiApiKey);
    if (config) {
      console.log('Initiating ComfyUI pipeline to:', config.baseUrl);
      
      const wsConnections: WebSocket[] = [];
      const completionAbort = new AbortController();

      // Ensure we clear connections on unmount or retry
      const cleanUp = () => {
        completionAbort.abort();
        wsConnections.forEach(ws => {
          try {
            ws.close();
          } catch (e) {}
        });
      };

      try {
        // Step 1: Upload input snapshots with encoded timestamps.
        console.log('Uploading snap shots to ComfyUI in parallel...');
        const timestamp = Date.now();
        const uploadPromises = finalImages.map((img, idx) => {
          const filename = `booth_upload_${timestamp}_${idx}.jpg`;
          return uploadImageToComfy(config, img, filename);
        });
        const uploadResults = await Promise.all(uploadPromises);
        console.log('Uploads complete:', uploadResults);

        // Step 2 & 3: Inject images into separate job clones and queue them
        interface ComfyJobState {
          promptId: string;
          clientId: string;
          completed: boolean;
          imageUrl: string | null;
          step: number;
          socket: WebSocket | null;
        }

        const jobs: ComfyJobState[] = [];
        const basePromptObj = JSON.parse(comfyWorkflow);
        const localSeeds: number[] = [];

        const finishIfAllJobsCompleted = () => {
          if (
            jobs.length === finalImages.length &&
            jobs.every(job => job.completed)
          ) {
            console.log('All parallel jobs finished.');
            cleanUp();
          }
        };

        const failJob = (job: ComfyJobState, index: number, error: unknown) => {
          if (job.completed) return;
          console.error(`ComfyUI Job ${index + 1} failed:`, error);
          job.completed = true;
          job.socket?.close(1011, 'Job failed');
          setFinalResult(prev => {
            if (!prev) return prev;
            const updatedCompleted = prev.completed ? [...prev.completed] : Array(finalImages.length).fill(false);
            const updatedFailed = prev.failed ? [...prev.failed] : Array(finalImages.length).fill(false);
            updatedCompleted[index] = true;
            updatedFailed[index] = true;
            return {
              ...prev,
              completed: updatedCompleted,
              failed: updatedFailed
            };
          });
          finishIfAllJobsCompleted();
        };

        const completeJob = async (
          job: ComfyJobState,
          index: number,
          historyEntry: any
        ) => {
          if (job.completed) return;
          const imgOutputs = historyEntry.outputs ?? {};
          job.imageUrl = finalImages[index] || base64Image;

          for (const nodeId in imgOutputs) {
            const outImages = imgOutputs[nodeId].images;
            if (outImages && Array.isArray(outImages) && outImages.length > 0) {
              const img = outImages[0];
              job.imageUrl = await fetchComfyViewUrl(config, img.filename, img.subfolder, img.type);
              break;
            }
          }

          job.completed = true;
          job.step = 4;
          job.socket?.close(1000, 'Job complete');
          setFinalResult(prev => {
            if (!prev) return prev;
            const updatedVariants = [...prev.variants];
            const updatedCompleted = prev.completed ? [...prev.completed] : Array(finalImages.length).fill(false);
            const updatedFailed = prev.failed ? [...prev.failed] : Array(finalImages.length).fill(false);
            updatedVariants[index] = job.imageUrl || finalImages[index] || base64Image;
            updatedCompleted[index] = true;
            updatedFailed[index] = false;
            return {
              ...prev,
              variants: updatedVariants,
              completed: updatedCompleted,
              failed: updatedFailed
            };
          });
          finishIfAllJobsCompleted();
        };

        for (let i = 0; i < finalImages.length; i++) {
          const clientId = 'booth_' + Math.random().toString(36).substring(2, 11) + '_' + i;
          const job: ComfyJobState = {
            promptId: 'pending',
            clientId,
            completed: false,
            imageUrl: null,
            step: 0,
            socket: null
          };
          
          // Deep clone the base template
          const activePromptObj = JSON.parse(JSON.stringify(basePromptObj));
          let jobSeedValue = 0;
          
          // Inject node parameter values using precise custom handlers
          for (const nodeId in activePromptObj) {
            const node = activePromptObj[nodeId];
            if (node && node.class_type && node.inputs && typeof node.inputs === 'object') {
              if (node.class_type === 'LoadImage') {
                const uploadedName = uploadResults[i]?.name || uploadResults[0]?.name;
                node.inputs.image = uploadedName;
                console.log(`[LoadImage] Injected image ${uploadedName} into node #${nodeId} for Job ${i + 1}`);
              } else if (node.class_type === 'RandomNoise' || node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
                let calculatedSeedValue = 0;
                if (seedStrategy === 'sequence') {
                  calculatedSeedValue = i;
                } else if (seedStrategy === 'random') {
                  calculatedSeedValue = Math.floor(Math.random() * 2000000000);
                } else {
                  // Timestamp-based high precision unique seed
                  calculatedSeedValue = Math.floor(Date.now() + i + Math.random() * 105);
                }
                const seedKey = node.class_type === 'RandomNoise' ? 'noise_seed' : 'seed';
                node.inputs[seedKey] = calculatedSeedValue;
                jobSeedValue = calculatedSeedValue;
                console.log(`[${node.class_type}] Injected ${seedKey} of ${calculatedSeedValue} utilizing strategy ${seedStrategy} into node #${nodeId} for Job ${i + 1}`);
              }
            }
          }
          localSeeds.push(jobSeedValue);

          // Establish the live preview websocket if enabled
          if (comfyLivePreviewsEnabled) {
            try {
              console.log(`[WebSocket] Connecting primary live preview WS for Job ${i + 1} client: ${clientId}`);
              const ws = await openComfyWebSocket(config, clientId);
              job.socket = ws;
              ws.binaryType = 'arraybuffer';
              ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                  try {
                    const view = new DataView(event.data);
                    const eventType = view.getInt32(0);
                    if (eventType === 1) { // Binary preview jpeg
                      const imageBytes = event.data.slice(8);
                      const blob = new Blob([imageBytes], { type: 'image/jpeg' });
                      const previewUrl = URL.createObjectURL(blob);
                      
                      setPreviews(prev => {
                        const existingIdx = prev.findIndex(p => p.batch === i);
                        const next = [...prev];
                        if (existingIdx !== -1) {
                          next[existingIdx] = { ...next[existingIdx], preview: previewUrl };
                        } else {
                          next.push({ step: 0, batch: i, preview: previewUrl });
                        }
                        return next;
                      });
                    }
                  } catch (e) {
                    console.warn(`[WebSocket] Binary parse error on primary Job ${i + 1}:`, e);
                  }
                }
              };
              ws.onclose = () => {
                console.log(`[WebSocket] Primary WS for Job ${i + 1} closed`);
              };
              ws.onerror = (err) => {
                console.warn(`[WebSocket] Primary correlation error on Job ${i + 1}:`, err);
              };
              wsConnections.push(ws);
            } catch (wsErr) {
              console.warn(`[WebSocket] Failure on primary Job ${i + 1} socket initialization:`, wsErr);
            }
          }

          try {
            console.log(`Queueing workflow prompt for concurrent Job ${i + 1}/${finalImages.length}...`);
            const promptRes = await queuePromptToComfy(config, activePromptObj, clientId);
            job.promptId = promptRes.prompt_id;
            jobs.push(job);
            void waitForComfyHistory(
              config,
              job.promptId,
              job.socket,
              completionAbort.signal
            ).then(historyEntry => completeJob(job, i, historyEntry))
              .catch(error => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                failJob(job, i, error);
              });
          } catch (qErr) {
            console.error(`Queueing prompt failed for concurrent Job ${i + 1}:`, qErr);
            job.promptId = 'failed';
            jobs.push(job);
            failJob(job, i, qErr);
          }
        }

        setOriginalSeeds(localSeeds);

        const updateVisualPreviews = () => {
          setPreviews(current => {
            const next = [];
            for (let b = 0; b < finalImages.length; b++) {
              next.push(current.find(preview => preview.batch === b) ?? {
                step: jobs[b].step,
                batch: b,
                preview: finalImages[b] || base64Image
              });
            }
            return next;
          });
        };

        // Initialize progress
        updateVisualPreviews();
        finishIfAllJobsCompleted();

        (window as any).__comfyCleanup = cleanUp;
        return;

      } catch (comfyErr) {
        console.error('ComfyUI parallel integration encountered errors. Declaring GenAI failure...', comfyErr);
        cleanUp();
        setFinalResult({
          variants: finalImages,
          completed: Array(finalImages.length).fill(true),
          failed: Array(finalImages.length).fill(true)
        });
        return;
      }
    }

    // Fallback simulation (staggered delay with raw captured photos)
    const timers: NodeJS.Timeout[] = [];
    finalImages.forEach((img, idx) => {
      const tId = setTimeout(() => {
        setFinalResult(prev => {
          if (!prev) return prev;
          const updatedVariants = [...prev.variants];
          const updatedCompleted = [...(prev.completed || Array(finalImages.length).fill(false))];
          updatedVariants[idx] = img;
          updatedCompleted[idx] = true;
          return {
            variants: updatedVariants,
            completed: updatedCompleted
          };
        });
      }, 1000 + idx * 800);
      timers.push(tId);
    });

    (window as any).__comfyCleanup = () => {
      timers.forEach(clearTimeout);
    };
  };

  const handleRestart = () => {
    if (typeof (window as any).__comfyCleanup === 'function') {
      (window as any).__comfyCleanup();
    }
    setFailedCapturesCount(0);
    setGenerationTriggered(false);
    // setGenaiFilterOn(true);
    setView('CAMERA');
  };

  const handleCancelGeneration = () => {
    console.log('User cancelled active generation process.');
    if (typeof (window as any).__comfyCleanup === 'function') {
      try {
        (window as any).__comfyCleanup();
      } catch (err) {
        console.warn('ComfyUI cleanup execution threw error:', err);
      }
    }
    // Set all pending completed items to true to cancel the spinners
    setFinalResult(prev => {
      if (!prev) return prev;
      const completed = Array(prev.variants.length).fill(true);
      return {
        ...prev,
        completed
      };
    });
  };

  const handleRegenerate = async (index: number, customPrompt?: string, keepSeed = false) => {
    const customPromptOverride = customPrompt?.trim();
    if (lastCapturedImages.length === 0 || index < 0 || index >= lastCapturedImages.length) return;
    
    // Set only the targeted variant to non-completed state and clear failed
    setFinalResult(prev => {
      if (!prev) return prev;
      const updatedCompleted = prev.completed ? [...prev.completed] : Array(prev.variants.length).fill(true);
      const updatedFailed = prev.failed ? [...prev.failed] : Array(prev.variants.length).fill(false);
      updatedCompleted[index] = false;
      updatedFailed[index] = false;
      return {
        ...prev,
        completed: updatedCompleted,
        failed: updatedFailed
      };
    });

    if (!genaiEnabled) {
      setFinalResult(prev => {
        if (!prev) return prev;
        const updatedCompleted = [...(prev.completed || Array(prev.variants.length).fill(true))];
        updatedCompleted[index] = true;
        return {
          ...prev,
          completed: updatedCompleted
        };
      });
      return;
    }

    const config = parseComfyUrl(genaiBackendUrl, genaiApiKey);
    const base64Image = lastCapturedImages[index];

    if (config) {
      console.log(`[Regenerate] Starting single ComfyUI job for index ${index}...`);
      let ws: WebSocket | null = null;
      const completionAbort = new AbortController();

      const cleanUpRegen = () => {
        completionAbort.abort();
        if (ws) {
          try {
            ws.close();
          } catch (e) {}
        }
      };

      // Expose cleanup to global window for cancellations
      (window as any).__comfyCleanup = cleanUpRegen;

      try {
        const timestamp = Date.now();
        const uploadRes = await uploadImageToComfy(config, base64Image, `booth_regen_${timestamp}_${index}.jpg`);
        
        const clientId = 'booth_regen_' + Math.random().toString(36).substring(2, 11) + '_' + index;
        const activePromptObj = JSON.parse(comfyWorkflow);

        let seedToUse = Math.floor(Math.random() * 2000000000);
        if (keepSeed && originalSeeds[index] !== undefined) {
          seedToUse = originalSeeds[index];
          console.log(`[Regenerate #] Keeping previous seed: ${seedToUse}`);
        } else {
          console.log(`[Regenerate #] Generating brand new seed: ${seedToUse}`);
          setOriginalSeeds(prev => {
            const next = [...prev];
            next[index] = seedToUse;
            return next;
          });
        }

        // Inject node parameters
        for (const nodeId in activePromptObj) {
          const node = activePromptObj[nodeId];
          if (node && node.class_type && node.inputs && typeof node.inputs === 'object') {
            if (node.class_type === 'LoadImage') {
              node.inputs.image = uploadRes.name;
            } else if (node.class_type === 'RandomNoise' || node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') {
              const seedKey = node.class_type === 'RandomNoise' ? 'noise_seed' : 'seed';
              node.inputs[seedKey] = seedToUse;
            } else if (customPromptOverride && node.class_type === 'CLIPTextEncode') {
              const textVal = String(node.inputs.text || '').toLowerCase();
              const titleVal = String(node._meta?.title || '').toLowerCase();
              const isNegative = textVal.includes('blurry') || 
                                  textVal.includes('bad anatomy') || 
                                  textVal.includes('monochrome') || 
                                  titleVal.includes('negative');
              if (!isNegative) {
                node.inputs.text = customPromptOverride;
                console.log(`[CLIPTextEncode] Injected one-off custom prompt into node #${nodeId} to regenerate index ${index + 1}`);
              }
            }
          }
        }

        // Establish live preview websocket client if enabled
        if (comfyLivePreviewsEnabled) {
          try {
            console.log(`[WebSocket] Selective regenerate connection to ws client: ${clientId}`);
            ws = await openComfyWebSocket(config, clientId);
            ws.binaryType = 'arraybuffer';
            ws.onmessage = (event) => {
              if (event.data instanceof ArrayBuffer) {
                try {
                  const view = new DataView(event.data);
                  const eventType = view.getInt32(0);
                  if (eventType === 1) { // Binary preview jpeg
                    const imageBytes = event.data.slice(8);
                    const blob = new Blob([imageBytes], { type: 'image/jpeg' });
                    const previewUrl = URL.createObjectURL(blob);
                    
                    setPreviews(prev => {
                      const existingIdx = prev.findIndex(p => p.batch === index);
                      const next = [...prev];
                      if (existingIdx !== -1) {
                        next[existingIdx] = { ...next[existingIdx], preview: previewUrl };
                      } else {
                        next.push({ step: 0, batch: index, preview: previewUrl });
                      }
                      return next;
                    });
                  }
                } catch (e) {
                  console.warn('[WebSocket] Binary parsing error during regen:', e);
                }
              }
            };
          } catch (wsErr) {
            console.warn('[WebSocket] Selective regenerate WS error:', wsErr);
          }
        }

        const promptRes = await queuePromptToComfy(config, activePromptObj, clientId);
        const promptId = promptRes.prompt_id;
        const historyEntry = await waitForComfyHistory(
          config,
          promptId,
          ws,
          completionAbort.signal
        );
        const imgOutputs = historyEntry.outputs ?? {};
        let finalUrl = base64Image;

        for (const nodeId in imgOutputs) {
          const outImages = imgOutputs[nodeId].images;
          if (outImages && Array.isArray(outImages) && outImages.length > 0) {
            const img = outImages[0];
            finalUrl = await fetchComfyViewUrl(config, img.filename, img.subfolder, img.type);
            break;
          }
        }

        cleanUpRegen();
        setFinalResult(prev => {
          if (!prev) return prev;
          const updatedVariants = [...prev.variants];
          const updatedCompleted = prev.completed ? [...prev.completed] : Array(prev.variants.length).fill(true);
          const updatedFailed = prev.failed ? [...prev.failed] : Array(prev.variants.length).fill(false);
          updatedVariants[index] = finalUrl;
          updatedCompleted[index] = true;
          updatedFailed[index] = false;
          return {
            ...prev,
            variants: updatedVariants,
            completed: updatedCompleted,
            failed: updatedFailed
          };
        });
        return;
      } catch (err) {
        console.error('Failed selective regeneration, falling back...', err);
        cleanUpRegen();
        setFinalResult(prev => {
          if (!prev) return prev;
          const updatedCompleted = prev.completed ? [...prev.completed] : Array(prev.variants.length).fill(true);
          const updatedFailed = prev.failed ? [...prev.failed] : Array(prev.variants.length).fill(false);
          updatedCompleted[index] = true;
          updatedFailed[index] = true;
          return {
            ...prev,
            completed: updatedCompleted,
            failed: updatedFailed
          };
        });
        return;
      }
    }

    // Fallback simulation for single regeneration
    let fallbackTimer = setTimeout(() => {
      setFinalResult(prev => {
        if (!prev) return prev;
        const updatedVariants = [...prev.variants];
        const updatedCompleted = [...(prev.completed || Array(prev.variants.length).fill(true))];
        updatedCompleted[index] = true;
        return {
          variants: updatedVariants,
          completed: updatedCompleted
        };
      });
    }, 1500);
  };

  const handleSaveSettings = (
    webcamId: string,
    url: string,
    apiKey: string,
    timeout: number,
    workflow: string,
    pJobs: number,
    rotation: string,
    gEnabled: boolean,
    bDelay: number,
    sStrategy: 'timestamp' | 'sequence' | 'random',
    pEnabled: boolean,
    pUrl: string,
    pApiKey: string,
    sPrinter: string,
    pMultiSelectEnabled: boolean,
    pAutoCloseEnabled: boolean,
    sEffectsEnabled: boolean,
    comfyPreviewsEnabled: boolean,
    promptModeEnabled: boolean,
    rcUrl: string,
    rcApiKey: string,
    rcShowLog: boolean,
    parallelCaptures: boolean
  ) => {
    const cleanedUrl = url ? url.trim().replace(/\/api\/?$/, '') : '';
    setSelectedWebcamId(webcamId);
    setGenaiBackendUrl(cleanedUrl);
    setGenaiApiKey(apiKey);
    setSleepTimeout(timeout);
    setComfyWorkflow(workflow);
    setParallelJobs(pJobs);
    setWebcamRotation(rotation);
    setGenaiEnabled(gEnabled);
    setBurstDelay(bDelay);
    setSeedStrategy(sStrategy);
    setPrinterEnabled(pEnabled);
    setPrinterUrl(pUrl);
    setPrinterApiKey(pApiKey);
    setSelectedPrinter(sPrinter);
    setPrinterMultiSelectEnabled(pMultiSelectEnabled);
    setPrinterAutoCloseEnabled(pAutoCloseEnabled);
    setSoundEffectsEnabled(sEffectsEnabled);
    setComfyLivePreviewsEnabled(comfyPreviewsEnabled);
    setCustomPromptModeEnabled(promptModeEnabled);
    setRemoteCameraUrl(rcUrl);
    setRemoteCameraApiKey(rcApiKey);
    setShowRemoteActivityLog(rcShowLog);
    setParallelCapturesEnabled(parallelCaptures);

    localStorage.setItem('selected_webcam_id', webcamId);
    localStorage.setItem('genai_backend_url', cleanedUrl);
    localStorage.setItem('genai_api_key', apiKey);
    localStorage.setItem('sleep_timeout', timeout.toString());
    localStorage.setItem('comfy_workflow', workflow);
    localStorage.setItem('parallel_jobs', pJobs.toString());
    localStorage.setItem('webcam_rotation', rotation);
    localStorage.setItem('genai_enabled', gEnabled.toString());
    localStorage.setItem('burst_delay', bDelay.toString());
    localStorage.setItem('seed_strategy', sStrategy);
    localStorage.setItem('printer_enabled', pEnabled.toString());
    localStorage.setItem('printer_url', pUrl);
    localStorage.setItem('printer_api_key', pApiKey);
    localStorage.setItem('selected_printer', sPrinter);
    localStorage.setItem('printer_multi_select_enabled', pMultiSelectEnabled.toString());
    localStorage.setItem('printer_auto_close_enabled', pAutoCloseEnabled.toString());
    localStorage.setItem('sound_effects_enabled', sEffectsEnabled.toString());
    localStorage.setItem('comfy_live_previews_enabled', comfyPreviewsEnabled.toString());
    localStorage.setItem('custom_prompt_mode_enabled', promptModeEnabled.toString());
    localStorage.setItem('remote_camera_url', rcUrl);
    localStorage.setItem('remote_camera_api_key', rcApiKey);
    localStorage.setItem('show_remote_activity_log', rcShowLog.toString());
    localStorage.setItem('parallel_captures_enabled', parallelCaptures.toString());
  };

  const handlePrintAction = async (variantId: number, useOriginal = false) => {
    if (!printerEnabled || !printerUrl) {
      console.warn('Printer disabled.');
      return;
    }
    const targetImage = useOriginal 
      ? lastCapturedImages[variantId] 
      : (finalResult?.variants?.[variantId]);
    if (!targetImage) {
      console.error('No selected target variant to print.');
      return;
    }

    const config = parsePrinterUrl(printerUrl, printerApiKey);

    try {
      console.log(`[Print] Submitting variant image index #${variantId + 1} to printer endpoint: ${selectedPrinter}`);
      await printImage(config, selectedPrinter, targetImage);
      console.log('[Print] Successfully printed image via fast-api endpoint!');
    } catch (err: any) {
      console.error('[Print] Print request failed:', err);
      // Fallback
      try {
        const link = document.createElement('a');
        link.href = targetImage;
        link.download = `booth-variant-${variantId + 1}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (dlErr) {
        console.error('Print failure auto-download crashed:', dlErr);
      }
      setPrintErrorAlert(t('printerAlert.failed'));
    }
  };

  return (
    <div className="w-full min-h-screen bg-black relative">
      {/* Floating Controls (Top Right Setting Only) */}
      {!showSettings && (
        <>
          {/* Top Right: Settings (Only visible in CAMERA view) */}
          {view === 'CAMERA' && (
            <div className="fixed top-8 right-8 z-[220]">
              <button 
                onClick={() => setShowSettings(true)}
                className="settings-toggle w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/20 transition-all text-white/50 hover:text-white border border-white/10 active:scale-95 shadow-2xl"
                title={t('cameraView.titleSettings')}
              >
                <Settings size={20} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Main Views */}
      <div className="w-full h-screen relative overflow-hidden">
        <div className={`w-full h-full absolute inset-0 transition-opacity duration-500 ${view === 'CAMERA' ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <CameraView 
            selectedWebcamId={selectedWebcamId}
            onCapture={handleCapture}
            onSetDelay={setDelay}
            isAsleep={isAsleep}
            setIsAsleep={setIsAsleep}
            webcamRotation={webcamRotation}
            parallelJobs={parallelJobs}
            sequenceEnabled={sequenceCaptureEnabled}
            burstDelay={burstDelay}
            soundEffectsEnabled={soundEffectsEnabled}
            onCameraLabelChange={setActiveCameraLabel}
            isActive={view === 'CAMERA'}
            remoteCameraUrl={remoteCameraUrl}
            remoteCameraApiKey={remoteCameraApiKey}
            showRemoteActivityLog={showRemoteActivityLog}
            parallelCapturesEnabled={parallelCapturesEnabled}
          />
        </div>
        <div className={`w-full h-full absolute inset-0 transition-opacity duration-500 overflow-y-auto ${view === 'RESULT' ? 'opacity-100 z-20 bg-[#FCFCFD]' : 'opacity-0 pointer-events-none z-0'}`}>
          <ResultView 
            previews={previews}
            finalResult={finalResult}
            onPrint={handlePrintAction}
            onRestart={handleRestart}
            onRegenerate={handleRegenerate}
            capturedImage={lastCapturedImage}
            capturedImages={lastCapturedImages}
            failedCapturesCount={failedCapturesCount}
            parallelJobs={parallelJobs}
            printerEnabled={printerEnabled}
            selectedPrinterName={selectedPrinter}
            multiSelectEnabled={printerMultiSelectEnabled}
            autoCloseEnabled={printerAutoCloseEnabled}
            genaiEnabled={genaiEnabled}
            comfyLivePreviewsEnabled={comfyLivePreviewsEnabled}
            customPromptModeEnabled={customPromptModeEnabled}
            onCancelGeneration={handleCancelGeneration}
            genaiFilterOn={genaiFilterOn}
            setGenaiFilterOn={setGenaiFilterOn}
            isActive={view === 'RESULT'}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
      </div>

      {/* Sleep Mode Overlay */}
      <AnimatePresence>
        {isAsleep && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsAsleep(false)}
            className="fixed inset-0 z-[190] bg-[#09090b] text-white flex flex-col items-center justify-center p-8 tracking-tight font-sans cursor-pointer select-none"
          >
            {/* Elegant glowing background circles */}
            <div className="absolute w-[600px] h-[600px] bg-green-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[4000ms]" />
            
            <div className="relative text-center max-w-sm space-y-6 flex flex-col items-center">
              <motion.div 
                animate={{ 
                  scale: [1, 1.05, 1],
                  opacity: [0.7, 1, 0.7]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-20 h-20 bg-green-500/5 border border-green-500/20 text-green-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.15)]"
              >
                <Moon size={32} />
              </motion.div>

              <div className="space-y-2">
                <span className="p-1 px-3 text-[10px] bg-green-950 text-green-400 border border-green-500/20 rounded-full font-black uppercase tracking-widest">
                  {t('sleepMode.standby')}
                </span>
                <h3 className="text-2xl font-black uppercase tracking-tight italic pt-2">{t('sleepMode.inactiveSleep')}</h3>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-xs font-mono">
                  {t('sleepMode.description', { seconds: sleepTimeout })}
                </p>
              </div>

              <div className="pt-4">
                <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl animate-pulse">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-bounce" />
                  {t('sleepMode.awakenMessage')}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <SettingsView 
            onClose={() => setShowSettings(false)} 
            selectedWebcamId={selectedWebcamId}
            genaiBackendUrl={genaiBackendUrl}
            genaiApiKey={genaiApiKey}
            sleepTimeout={sleepTimeout}
            comfyWorkflow={comfyWorkflow}
            parallelJobs={parallelJobs}
            webcamRotation={webcamRotation}
            genaiEnabled={genaiEnabled}
            burstDelay={burstDelay}
            seedStrategy={seedStrategy}
            soundEffectsEnabled={soundEffectsEnabled}
            comfyLivePreviewsEnabled={comfyLivePreviewsEnabled}
            customPromptModeEnabled={customPromptModeEnabled}
            printerEnabled={printerEnabled}
            printerUrl={printerUrl}
            printerApiKey={printerApiKey}
            selectedPrinter={selectedPrinter}
            printerMultiSelectEnabled={printerMultiSelectEnabled}
            printerAutoCloseEnabled={printerAutoCloseEnabled}
            remoteCameraUrl={remoteCameraUrl}
            remoteCameraApiKey={remoteCameraApiKey}
            showRemoteActivityLog={showRemoteActivityLog}
            parallelCapturesEnabled={parallelCapturesEnabled}
            onSave={handleSaveSettings}
          />
        )}
      </AnimatePresence>

      {/* Printer Error Alert Toast/Modal */}
      <AnimatePresence>
        {printErrorAlert && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[250] max-w-sm bg-amber-50 border border-amber-200 shadow-xl rounded-2xl p-4 flex gap-3 items-start"
          >
            <div className="p-1.5 bg-amber-100/80 rounded-lg text-amber-600">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="block text-xs font-black uppercase text-amber-800 tracking-wider">{t('printerAlert.notificationTitle')}</span>
              <p className="text-[11px] font-sans text-amber-900 leading-normal font-medium">{printErrorAlert}</p>
              <div className="pt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrintErrorAlert(null)}
                  className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide bg-amber-600 hover:bg-amber-700 text-white rounded-lg active:scale-95 transition-all cursor-pointer"
                >
                  {t('common.ok')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
