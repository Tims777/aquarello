import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Minus, Timer, VideoOff, Loader2, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { playCountdownBeep, playShutterSound } from '../utils/soundEffects';
import { t } from '../utils/i18n';

interface CameraViewProps {
  onCapture: (images: string[]) => void;
  onSetDelay: (delay: number) => void;
  selectedWebcamId?: string;
  isAsleep: boolean;
  setIsAsleep: (asleep: boolean) => void;
  webcamRotation?: string;
  parallelJobs: number;
  sequenceEnabled: boolean;
  burstDelay?: number;
  soundEffectsEnabled?: boolean;
  onCameraLabelChange?: (label: string) => void;
  isActive?: boolean;
  remoteCameraUrl?: string;
  remoteCameraApiKey?: string;
  showRemoteActivityLog?: boolean;
  parallelCapturesEnabled?: boolean;
  apiNativeBurstEnabled?: boolean;
}

export default function CameraView({
  onCapture,
  onSetDelay,
  selectedWebcamId,
  isAsleep,
  setIsAsleep,
  webcamRotation = '0',
  parallelJobs,
  sequenceEnabled,
  burstDelay = 500,
  soundEffectsEnabled = true,
  onCameraLabelChange,
  isActive = true,
  remoteCameraUrl,
  remoteCameraApiKey,
  showRemoteActivityLog = false,
  parallelCapturesEnabled = false,
  apiNativeBurstEnabled = true,
}: CameraViewProps) {
  const [delay, setDelay] = useState(() => {
    const saved = localStorage.getItem('exposure_delay');
    return saved !== null ? Math.min(10, Math.max(0, parseInt(saved, 10))) : 0;
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLabel, setCameraLabel] = useState<string>('');
  const [flashActive, setFlashActive] = useState(false);
  const [capturingSequence, setCapturingSequence] = useState(false);
  const [sequenceCount, setSequenceCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Remote DSLR simulation states
  const [remoteStatus, setRemoteStatus] = useState<{ connected: boolean; model: string; batteryLevel?: number }>({
    connected: false,
    model: 'No camera'
  });
  const [evfRunning, setEvfRunning] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const [remoteLogs, setRemoteLogs] = useState<{ time: string; text: string; isError?: boolean }[]>([]);
  const [evfStreamKey, setEvfStreamKey] = useState<number>(Date.now());
  const logRef = useRef<HTMLDivElement>(null);
  const downloadedCaptureIds = useRef<Set<string>>(new Set());

  const getCameraApiUrl = (path: string) => {
    let url = '';
    if (!remoteCameraUrl) {
      url = path;
    } else {
      const base = remoteCameraUrl.endsWith('/') ? remoteCameraUrl.slice(0, -1) : remoteCameraUrl;
      url = `${base}${path.startsWith('/') ? path : '/' + path}`;
    }
    
    if (remoteCameraApiKey && (path.includes('/stream') || path.includes('/events'))) {
      const joiner = url.includes('?') ? '&' : '?';
      url = `${url}${joiner}apiKey=${encodeURIComponent(remoteCameraApiKey)}`;
    }
    return url;
  };

  const resolveRemoteImageUrl = (rawUrl: string) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/')) {
      return getCameraApiUrl(rawUrl);
    }
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      try {
        const parsed = new URL(rawUrl);
        return getCameraApiUrl(parsed.pathname + parsed.search);
      } catch (e) {
        return rawUrl;
      }
    }
    return rawUrl;
  };

  const parseBurstCaptureResponse = (data: any): string[] => {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map(item => {
        if (typeof item === 'string') return resolveRemoteImageUrl(item);
        if (item && typeof item === 'object') {
          return resolveRemoteImageUrl(item.url || item.path || item.uri || '');
        }
        return '';
      }).filter(Boolean);
    }
    const potentialArrays = ['captures', 'images', 'urls', 'results', 'data', 'photos'];
    for (const key of potentialArrays) {
      if (data[key] && Array.isArray(data[key])) {
        return data[key].map((item: any) => {
          if (typeof item === 'string') return resolveRemoteImageUrl(item);
          if (item && typeof item === 'object') {
            return resolveRemoteImageUrl(item.url || item.path || item.uri || '');
          }
          return '';
        }).filter(Boolean);
      }
    }
    if (data.url) {
      return [resolveRemoteImageUrl(data.url)];
    }
    if (data.path) {
      return [resolveRemoteImageUrl(data.path)];
    }
    return [];
  };

  const createErrorIndicatorSvg = (message: string, isRemote = false) => {
    const width = 1200;
    const height = 1800;
    const cleanMessage = message.replace(/[\n\r]/g, ' ').replace(/"/g, "'").substring(0, 80);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#18181b"/>
      <circle cx="600" cy="850" r="100" fill="#ef4444" opacity="0.12"/>
      <path d="M600 790v100M600 930h.01" stroke="#ef4444" stroke-width="12" stroke-linecap="round"/>
      <text x="600" y="1040" fill="#f4f4f5" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="950" text-anchor="middle" letter-spacing="1">${t('cameraView.captureOffline')}</text>
      <text x="600" y="1090" fill="#71717a" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="650" text-anchor="middle" uppercase="true">${cleanMessage}</text>
      <text x="600" y="1135" fill="#3f3f46" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" text-anchor="middle">${t('cameraView.cameraEventStream')}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const getCameraHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (remoteCameraApiKey) {
      headers['Authorization'] = `Bearer ${remoteCameraApiKey}`;
    }
    return headers;
  };

  const logRemote = (text: string, isError = false) => {
    const time = new Date().toLocaleTimeString();
    setRemoteLogs(prev => [...prev, { time, text, isError }].slice(-30));
  };

  const runRemoteAction = async (label: string, action: () => Promise<any>) => {
    setBusyCount(prev => prev + 1);
    logRemote(label);
    try {
      const result = await action();
      await refreshRemoteStatus();
      return result;
    } catch (err: any) {
      console.error('[Remote DSLR Action error]:', err);
      logRemote(err.message || String(err), true);
    } finally {
      setBusyCount(prev => Math.max(0, prev - 1));
    }
  };

  const refreshRemoteStatus = async () => {
    try {
      const res = await fetch(getCameraApiUrl('/api/status'), { headers: getCameraHeaders() });
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      const batteryVal = typeof data.batteryLevel === 'number' 
        ? data.batteryLevel 
        : (data.batteryLevel ? parseInt(data.batteryLevel, 10) : undefined);
      setRemoteStatus({
        connected: data.connected === true,
        model: data.model || 'No camera',
        batteryLevel: batteryVal
      });
      if (data.connected && data.model) {
        setCameraLabel(data.model + (typeof batteryVal === 'number' ? ` (${batteryVal}%)` : ''));
      } else {
        setCameraLabel(t('settingsView.remoteCameraOption') || 'Remote Camera Mode');
      }
    } catch (err) {
      console.warn('Silent refresh status error', err);
      setCameraLabel('Remote Camera (offline)');
    }
  };

  const downloadCaptureFile = (capture: { id: string; url: string; fileName?: string }) => {
    if (!capture?.id || !capture?.url || downloadedCaptureIds.current.has(capture.id)) {
      return;
    }

    downloadedCaptureIds.current.add(capture.id);
    const link = document.createElement("a");
    link.href = resolveRemoteImageUrl(capture.url);
    link.download = capture.fileName || `capture-${capture.id}.jpg`;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
  };

  // Scroll terminal logs downward on new trace events
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [remoteLogs]);

  useEffect(() => {
    onSetDelay(delay);
    localStorage.setItem('exposure_delay', delay.toString());
  }, [delay, onSetDelay]);

  // Handle webcam stream initialization
  useEffect(() => {
    if (selectedWebcamId === 'remote-camera') {
      setCameraActive(true);
      refreshRemoteStatus();
      return;
    }

    let activeStream: MediaStream | null = null;
    setCameraActive(false);

    if (isAsleep) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraLabel('');
      return;
    }

    const startCamera = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedWebcamId 
            ? { deviceId: { exact: selectedWebcamId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            setCameraLabel(videoTrack.label || t('cameraView.activeWebcam'));
          } else {
            setCameraLabel(t('cameraView.activeWebcam'));
          }
        }
      } catch (err) {
        console.warn('Exact device constraints failed, falling back to flexible camera search...', err);
        try {
          const fallbackConstraints: MediaStreamConstraints = {
            video: true,
            audio: false,
          };
          const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setCameraActive(true);
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              setCameraLabel(videoTrack.label || t('cameraView.activeWebcam'));
            } else {
              setCameraLabel(t('cameraView.activeWebcam'));
            }
          }
        } catch (fallbackErr) {
          console.error('All webcam hardware access queries failed:', fallbackErr);
          setCameraActive(false);
          setCameraLabel('');
        }
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      setCameraLabel('');
    };
  }, [selectedWebcamId, isAsleep]);

  // Keep remote DSLR camera connected at all times
  useEffect(() => {
    if (selectedWebcamId !== 'remote-camera') return;

    runRemoteAction('Establishing Remote DSLR camera connection...', async () => {
      const response = await fetch(getCameraApiUrl('/api/connect'), { method: 'POST', headers: getCameraHeaders() });
      if (!response.ok) throw new Error('Connect API endpoint failed');
    });
  }, [selectedWebcamId, remoteCameraUrl, remoteCameraApiKey]);

  // Handle Event Socket pipeline connection
  useEffect(() => {
    if (selectedWebcamId !== 'remote-camera') return;

    let eventSocket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectEvents = () => {
      let url = '';
      if (!remoteCameraUrl) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${protocol}//${window.location.host}/api/events`;
        if (remoteCameraApiKey) {
          url += `?apiKey=${encodeURIComponent(remoteCameraApiKey)}`;
        }
      } else {
        url = remoteCameraUrl.replace(/^http/, 'ws');
        if (!url.endsWith('/api/events') && !url.endsWith('/api/events/')) {
          const base = url.endsWith('/') ? url.slice(0, -1) : url;
          url = `${base}/api/events`;
        }
        if (remoteCameraApiKey) {
          url += `?apiKey=${encodeURIComponent(remoteCameraApiKey)}`;
        }
      }
      console.log('[RemoteCamera Events] Connecting to WebSocket:', url);
      
      const socket = new WebSocket(url);
      eventSocket = socket;

      socket.addEventListener('open', () => {
        if (!isMounted) return;
        logRemote('WebSocket event sync connection active.');
      });

      socket.addEventListener('message', (event) => {
        if (!isMounted) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'snapshot') {
            const payload = message.payload;
            const batteryVal = payload && typeof payload.batteryLevel === 'number' 
              ? payload.batteryLevel 
              : (payload && payload.batteryLevel ? parseInt(payload.batteryLevel, 10) : undefined);
            setRemoteStatus({
              connected: payload?.connected === true,
              model: payload?.model || 'No camera',
              batteryLevel: batteryVal
            });
            if (payload?.connected && payload?.model) {
              setCameraLabel(payload.model + (typeof batteryVal === 'number' ? ` (${batteryVal}%)` : ''));
            } else {
              setCameraLabel(t('settingsView.remoteCameraOption') || 'Remote Camera Mode');
            }
          } else if (message.type === 'captureDownloaded') {
            const capture = message.payload;
            logRemote(`Captured event processed: ${capture?.fileName || 'HQ Photo'}`);
          } else if (message.type === 'error') {
            logRemote(`Hardware Fault reported: ${message.payload?.code || 'Error'}`, true);
          }
        } catch (err) {
          console.error('[RemoteCamera WS JSON parse error]:', err);
        }
      });

      socket.addEventListener('close', () => {
        if (!isMounted) return;
        logRemote('WebSocket connection lost. Reconnecting in 1.5s...');
        reconnectTimeout = setTimeout(connectEvents, 1500);
      });

      socket.addEventListener('error', (e) => {
        if (!isMounted) return;
        console.warn('[RemoteCamera WS error event]');
      });
    };

    connectEvents();

    return () => {
      isMounted = false;
      if (eventSocket) {
        eventSocket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [selectedWebcamId, remoteCameraUrl, remoteCameraApiKey]);

  // Turn EVF stream on and off when system transitions asleep or active
  useEffect(() => {
    if (selectedWebcamId !== 'remote-camera') return;

    if (!isAsleep && isActive) {
      runRemoteAction('Starting Live Preview EVF...', async () => {
        const response = await fetch(getCameraApiUrl('/api/evf/start'), { method: 'POST', headers: getCameraHeaders() });
        if (!response.ok) throw new Error('Failed to start EVF');
        setEvfRunning(true);
        setEvfStreamKey(Date.now());
      });
    } else {
      runRemoteAction('Stopping Live Preview EVF...', async () => {
        const response = await fetch(getCameraApiUrl('/api/evf/stop'), { method: 'POST', headers: getCameraHeaders() });
        if (!response.ok) throw new Error('Failed to stop EVF');
        setEvfRunning(false);
      });
    }

    return () => {
      fetch(getCameraApiUrl('/api/evf/stop'), { method: 'POST', headers: getCameraHeaders() }).catch(() => {});
    };
  }, [selectedWebcamId, isAsleep, isActive, remoteCameraUrl, remoteCameraApiKey]);

  useEffect(() => {
    if (onCameraLabelChange) {
      onCameraLabelChange(cameraLabel);
    }
  }, [cameraLabel, onCameraLabelChange]);

  const handleCanvasClick = () => {
    if (selectedWebcamId !== 'remote-camera' || !remoteStatus.connected || busyCount > 0) return;
    runRemoteAction('Triggering Auto Focus on canvas click...', async () => {
      const res = await fetch(getCameraApiUrl('/api/evf/af-center'), { method: 'POST', headers: getCameraHeaders() });
      if (!res.ok) throw new Error('Focus failed');
    });
  };

  const handleStartCountdown = () => {
    if (countdown !== null || capturingSequence) return;
    if (delay === 0) {
      startCaptureSequence();
    } else {
      setCountdown(delay);
    }
  };

  const startCaptureSequence = () => {
    const totalToCapture = sequenceEnabled ? parallelJobs : 1;
    
    setCapturingSequence(true);
    setSequenceCount(0);
    
    // Trigger visual flash feedback and sound
    setFlashActive(true);
    if (soundEffectsEnabled) {
      playShutterSound();
    }
    setTimeout(() => setFlashActive(false), 400);

    if (selectedWebcamId === 'remote-camera' && apiNativeBurstEnabled) {
      const runRemoteBurst = async () => {
        let soundInterval: NodeJS.Timeout | null = null;
        let completedSoundCount = 1;

        // Trigger intermediate sounds and flashes to simulate physical shutter burst speed:
        setSequenceCount(1);
        soundInterval = setInterval(() => {
          if (completedSoundCount < totalToCapture) {
            setFlashActive(true);
            if (soundEffectsEnabled) {
              playShutterSound();
            }
            setTimeout(() => setFlashActive(false), 400);
            completedSoundCount++;
            setSequenceCount(completedSoundCount);
          } else {
            if (soundInterval) clearInterval(soundInterval);
          }
        }, burstDelay || 150);

        try {
          const bUrl = getCameraApiUrl(`/api/capture?count=${totalToCapture}&intervalMs=${burstDelay}&autoFocus=false`);
          logRemote(`Triggering DSLR burst with count=${totalToCapture} and intervalMs=${burstDelay}...`);
          
          const res = await fetch(bUrl, { method: 'POST', headers: getCameraHeaders() });
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          
          const data = await res.json();
          const urls = parseBurstCaptureResponse(data);
          logRemote(`DSLR burst capture completed. Received ${urls.length} images.`);
          
          const finalUrls = [...urls];
          while (finalUrls.length < totalToCapture) {
            finalUrls.push(createErrorIndicatorSvg('Missing burst frame', true));
          }
          if (finalUrls.length > totalToCapture) {
            finalUrls.length = totalToCapture;
          }

          setSequenceCount(totalToCapture);
          if (soundInterval) clearInterval(soundInterval);

          setTimeout(() => {
            setCapturingSequence(false);
            setSequenceCount(0);
            
            if (sequenceEnabled) {
              onCapture(finalUrls);
            } else {
              const multiplexedRange = Array(parallelJobs).fill(finalUrls[0]);
              onCapture(multiplexedRange);
            }
          }, 400);

        } catch (err: any) {
          if (soundInterval) clearInterval(soundInterval);
          console.error('[Remote DSLR burst capture failed]:', err);
          logRemote(`Burst Capture error: ${err.message || String(err)}`, true);
          
          const finalUrls = Array.from({ length: totalToCapture }).map((_, idx) => 
            createErrorIndicatorSvg(`DSLR Burst Error Frame [${idx + 1}]: ${err.message || String(err)}`, true)
          );
          
          setSequenceCount(totalToCapture);
          setTimeout(() => {
            setCapturingSequence(false);
            setSequenceCount(0);
            onCapture(finalUrls);
          }, 400);
        }
      };

      runRemoteBurst();
      return;
    }

    if (parallelCapturesEnabled) {
      const capturedImagesList: string[] = Array(totalToCapture).fill('');
      let completedCount = 0;

      const triggerCapture = async (index: number) => {
        if (index > 0) {
          setFlashActive(true);
          if (soundEffectsEnabled) {
            playShutterSound();
          }
          setTimeout(() => setFlashActive(false), 400);
        }

        let base64Result = '';
        if (selectedWebcamId === 'remote-camera') {
          try {
            const res = await fetch(getCameraApiUrl('/api/capture?autoFocus=false'), { method: 'POST', headers: getCameraHeaders() });
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const capture = await res.json();
            base64Result = resolveRemoteImageUrl(capture.url);
            logRemote(`Captured successfully (Parallel [${index + 1}/${totalToCapture}]): ${capture.fileName || 'photo'}`);
          } catch (err: any) {
            console.error('[Remote DSLR parallel capture failed]:', err);
            logRemote(`Parallel Capture [${index + 1}] error: ${err.message || String(err)}`, true);
            base64Result = createErrorIndicatorSvg(`Parallel DSLR Error: ${err.message || String(err)}`, true);
          }
        } else {
          if (!videoRef.current) {
            base64Result = createErrorIndicatorSvg('Webcam Not Active');
          } else {
            try {
              const canvas = document.createElement('canvas');
              const angle = parseInt(webcamRotation || '0', 10) || 0;
              const vWidth = videoRef.current.videoWidth || 1280;
              const vHeight = videoRef.current.videoHeight || 720;

              if (angle === 90 || angle === 270) {
                canvas.width = vHeight;
                canvas.height = vWidth;
              } else {
                canvas.width = vWidth;
                canvas.height = vHeight;
              }

              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((angle * Math.PI) / 180);

                if (angle === 90 || angle === 270) {
                  ctx.drawImage(videoRef.current, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
                } else {
                  ctx.drawImage(videoRef.current, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
                }

                base64Result = canvas.toDataURL('image/jpeg', 0.9);
              } else {
                base64Result = createErrorIndicatorSvg('Canvas Context Unavailable');
              }
            } catch (err) {
              console.error("Failed capturing frame stream to canvas:", err);
              base64Result = createErrorIndicatorSvg('Canvas Capture Failed');
            }
          }
        }

        capturedImagesList[index] = base64Result;
        completedCount++;
        setSequenceCount(completedCount);

        if (completedCount === totalToCapture) {
          setTimeout(() => {
            setCapturingSequence(false);
            setSequenceCount(0);
            
            if (sequenceEnabled) {
              onCapture(capturedImagesList);
            } else {
              const multiplexedRange = Array(parallelJobs).fill(capturedImagesList[0]);
              onCapture(multiplexedRange);
            }
          }, 400);
        }
      };

      for (let i = 0; i < totalToCapture; i++) {
        setTimeout(() => {
          triggerCapture(i);
        }, i * (burstDelay + 80) + 80);
      }
    } else {
      const capturedImagesList: string[] = [];

      const performSingleCapture = async () => {
        let base64Result = '';
        if (selectedWebcamId === 'remote-camera') {
          try {
            const res = await fetch(getCameraApiUrl('/api/capture?autoFocus=false'), { method: 'POST', headers: getCameraHeaders() });
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const capture = await res.json();
            base64Result = resolveRemoteImageUrl(capture.url);
            logRemote(`Captured successfully: ${capture.fileName || 'photo'}`);
          } catch (err: any) {
            console.error('[Remote DSLR single capture failed]:', err);
            logRemote(`Capture error: ${err.message || String(err)}`, true);
            base64Result = createErrorIndicatorSvg(`DSLR Error: ${err.message || String(err)}`, true);
          }
        } else {
          if (!videoRef.current) {
            base64Result = createErrorIndicatorSvg('Webcam Not Active');
          } else {
            try {
              const canvas = document.createElement('canvas');
              const angle = parseInt(webcamRotation || '0', 10) || 0;
              const vWidth = videoRef.current.videoWidth || 1280;
              const vHeight = videoRef.current.videoHeight || 720;

              if (angle === 90 || angle === 270) {
                canvas.width = vHeight;
                canvas.height = vWidth;
              } else {
                canvas.width = vWidth;
                canvas.height = vHeight;
              }

              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((angle * Math.PI) / 180);

                if (angle === 90 || angle === 270) {
                  ctx.drawImage(videoRef.current, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
                } else {
                  ctx.drawImage(videoRef.current, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
                }

                base64Result = canvas.toDataURL('image/jpeg', 0.9);
              } else {
                base64Result = createErrorIndicatorSvg('Canvas Context Unavailable');
              }
            } catch (err) {
              console.error("Failed capturing frame stream to canvas:", err);
              base64Result = createErrorIndicatorSvg('Canvas Capture Failed');
            }
          }
        }

        capturedImagesList.push(base64Result);
        setSequenceCount(capturedImagesList.length);

        const nextCount = capturedImagesList.length;
        if (nextCount < totalToCapture) {
          setTimeout(() => {
            setFlashActive(true);
            if (soundEffectsEnabled) {
              playShutterSound();
            }
            setTimeout(() => setFlashActive(false), 400);
            
            setTimeout(() => {
              performSingleCapture();
            }, 80);
          }, burstDelay);
        } else {
          setTimeout(() => {
            setCapturingSequence(false);
            setSequenceCount(0);
            
            if (sequenceEnabled) {
              onCapture(capturedImagesList);
            } else {
              const multiplexedRange = Array(parallelJobs).fill(capturedImagesList[0]);
              onCapture(multiplexedRange);
            }
          }, 400);
        }
      };

      setTimeout(() => {
        performSingleCapture();
      }, 80);
    }
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      if (soundEffectsEnabled) {
        playCountdownBeep(880, 0.08);
      }
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCountdown(null);
      startCaptureSequence();
    }
  }, [countdown, soundEffectsEnabled]);

  const adjustDelay = (val: number) => {
    setDelay((prev) => Math.min(10, Math.max(0, prev + val)));
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center text-white font-sans">
      
      {/* Real Webcam Video Stream or Remote DSLR EVF Stream */}
      {selectedWebcamId === 'remote-camera' ? (
        <img 
          src={evfRunning ? getCameraApiUrl(`/api/evf/stream?cache=${evfStreamKey}`) : undefined}
          style={{ transform: `rotate(${webcamRotation}deg)` }}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 cursor-crosshair ${evfRunning && remoteStatus.connected ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          alt="Remote EVF Video Live Feed"
          referrerPolicy="no-referrer"
          onClick={handleCanvasClick}
          title="Click to perform auto focus"
        />
      ) : (
        <video 
          ref={videoRef}
          style={{ transform: `scaleX(-1) rotate(${webcamRotation}deg)` }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          autoPlay 
          playsInline
          muted
        />
      )}

      {/* Floating Activity Log Terminal (Top Left) */}
      {selectedWebcamId === 'remote-camera' && showRemoteActivityLog && (
        <div className="absolute top-6 left-6 z-30 font-sans">
          <div className="bg-white/5 border border-white/10 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl w-[320px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-extrabold text-white">
              <span>Activity Log</span>
            </div>
            <div className="h-[100px] overflow-y-auto scrollbar-none text-[10px] font-mono space-y-1 pr-1.5 flex flex-col" ref={logRef}>
              {remoteLogs.length === 0 ? (
                <span className="text-white/30 italic">No events or activities logged...</span>
              ) : (
                remoteLogs.map((lg, idx) => (
                  <div key={idx} className={`leading-tight ${lg.isError ? 'text-red-700' : 'text-white'}`}>
                    <span className="text-white/40 font-semibold mr-1.5">[{lg.time}]</span>
                    {lg.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show idle screen warning */}
      {((selectedWebcamId === 'remote-camera' && (!remoteStatus.connected || !evfRunning)) ||
        (selectedWebcamId !== 'remote-camera' && !cameraActive)) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-center p-8 z-[5]">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
            <VideoOff size={32} />
          </div>
          <h2 className="text-lg font-black uppercase tracking-widest text-zinc-100">
            {selectedWebcamId === 'remote-camera'
              ? (!remoteStatus.connected ? t('cameraView.cameraDisconnected') : t('cameraView.evfStreamStopped'))
              : t('cameraView.sourceIdle')}
          </h2>
          <p className="text-zinc-500 text-xs max-w-xs mt-2 font-mono leading-normal">
            {selectedWebcamId === 'remote-camera'
              ? (!remoteStatus.connected 
                  ? t('cameraView.remoteDisconnectedDesc')
                  : t('cameraView.evfSuspendedDesc'))
              : t('cameraView.permissionHint')}
          </p>
        </div>
      )}



      {/* Camera Flash Screen Overlay */}
      <AnimatePresence>
        {flashActive && (
          <motion.div 
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 bg-white z-[100] pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Sequence Capture Status Overlay removed in favor of minimalistic lower right info */}

      {/* Countdown Overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 2, opacity: 0 }}
            key={countdown}
            className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <span className="text-[350px] font-extrabold text-green-500 drop-shadow-[0_0_60px_rgba(34,197,94,0.6)] select-none leading-none">
              {countdown}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls */}
      <div className="absolute bottom-12 inset-x-0 px-12 flex items-center justify-between z-20">
        {/* Left: Merged Camera Panel */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2.5 px-4 rounded-[1.5rem] shadow-2xl backdrop-blur-md max-w-[320px]">
          {/* Camera Off / Standby button */}
          <button 
            onClick={() => setIsAsleep(true)}
            className="text-white/60 hover:text-white hover:bg-white/10 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 border border-white/5 bg-white/5 flex-shrink-0"
            title={t('cameraView.titleStandby')}
          >
            <VideoOff size={15} />
          </button>

          {/* Camera Model/Label & Battery */}
          <span className="text-xs font-sans font-black text-white uppercase tracking-wide truncate max-w-[170px]" title={selectedWebcamId === 'remote-camera' ? (remoteStatus.connected ? remoteStatus.model : t('cameraView.noCameraSynchronized')) : cameraLabel}>
            {selectedWebcamId === 'remote-camera' 
              ? (remoteStatus.connected ? remoteStatus.model : t('cameraView.noCameraSynchronized')) 
              : (cameraLabel || t('cameraView.noCameraStream'))
            }
          </span>
          {selectedWebcamId === 'remote-camera' && remoteStatus.connected && typeof remoteStatus.batteryLevel === 'number' && (
            <span className={`text-xs font-mono font-semibold ${
              remoteStatus.batteryLevel >= 66 
                ? 'text-green-400' 
                : remoteStatus.batteryLevel >= 33 
                  ? 'text-yellow-400' 
                  : 'text-red-500'
            }`}>
              {remoteStatus.batteryLevel}%
            </span>
          )}
        </div>

        {/* Center: Shutter & Progress Information stacked vertically */}
        <div className="flex flex-col items-center gap-4">
          <AnimatePresence>
            {capturingSequence && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="flex items-center gap-2.5 bg-black/60 backdrop-blur-md border border-white/10 p-2 px-4 rounded-full shadow-lg"
              >
                <Loader2 size={14} className="text-green-500 animate-spin" />
                <span className="text-xs font-bold font-mono text-white/95 leading-none">
                  {sequenceCount} / {sequenceEnabled ? parallelJobs : 1}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Shutter Button */}
          <button 
            onClick={handleStartCountdown}
            className="group relative flex items-center justify-center"
          >
            <div className="absolute w-24 h-24 rounded-full border-2 border-white/20 scale-125 group-hover:scale-150 transition-transform duration-500 group-hover:border-green-500/50" />
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)] group-hover:bg-green-500 transition-all duration-300 group-active:scale-90 shadow-inner">
              <Camera className="text-black group-hover:text-white transition-colors" size={32} strokeWidth={2.5} />
            </div>
          </button>
        </div>

        {/* Right: Prominent Countdown Timer Control */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2.5 px-4 rounded-[1.5rem] shadow-2xl backdrop-blur-md">
          <button 
            onClick={() => adjustDelay(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 text-white/50 hover:text-white"
            title={t('cameraView.decreaseCountdown')}
          >
            <Minus size={18} strokeWidth={2.5} />
          </button>
          <div className="flex flex-col items-center min-w-[36px] select-none">
            <span className="text-xl font-mono font-black text-white leading-none">{delay}</span>
            <span className="text-[8px] uppercase tracking-wider text-white/40 font-bold mt-0.5">{t('cameraView.sec')}</span>
          </div>
          <button 
            onClick={() => adjustDelay(1)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 text-white/50 hover:text-white"
            title={t('cameraView.increaseCountdown')}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%]" />
    </div>
  );
}
