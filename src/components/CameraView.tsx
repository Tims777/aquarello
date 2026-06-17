import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Minus, Timer, VideoOff, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    onSetDelay(delay);
    localStorage.setItem('exposure_delay', delay.toString());
  }, [delay, onSetDelay]);

  // Handle webcam stream initialization
  useEffect(() => {
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

  useEffect(() => {
    if (onCameraLabelChange) {
      onCameraLabelChange(cameraLabel);
    }
  }, [cameraLabel, onCameraLabelChange]);

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
    const capturedImagesList: string[] = [];
    
    setCapturingSequence(true);
    setSequenceCount(0);
    
    // Trigger visual flash feedback and sound
    setFlashActive(true);
    if (soundEffectsEnabled) {
      playShutterSound();
    }
    setTimeout(() => setFlashActive(false), 400);

    const performSingleCapture = () => {
      let base64Result = '';
      if (!videoRef.current) {
        base64Result = "https://picsum.photos/seed/fallback/" + Math.random().toString() + "/800/1200";
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
            base64Result = "https://picsum.photos/seed/fallback/1/800/1200";
          }
        } catch (err) {
          console.error("Failed capturing frame stream to canvas:", err);
          base64Result = "https://picsum.photos/seed/fallback/2/800/1200";
        }
      }

      capturedImagesList.push(base64Result);
      // Display amount of completed captures
      setSequenceCount(capturedImagesList.length);

      const nextCount = capturedImagesList.length;
      if (nextCount < totalToCapture) {
        // Delay before the next capture (using custom user configuration)
        setTimeout(() => {
          setFlashActive(true);
          if (soundEffectsEnabled) {
            playShutterSound();
          }
          setTimeout(() => setFlashActive(false), 400);
          
          // Slight 80ms delay to let sound start playing smoothly before canvas blocks the thread
          setTimeout(() => {
            performSingleCapture();
          }, 80);
        }, burstDelay);
      } else {
        // Finished capturing sequence successfully - small timeout to let user see final count
        setTimeout(() => {
          setCapturingSequence(false);
          setSequenceCount(0);
          
          if (sequenceEnabled) {
            onCapture(capturedImagesList);
          } else {
            // If sequence capture is disabled, replicate the captured single photo n times as before
            const multiplexedRange = Array(parallelJobs).fill(capturedImagesList[0]);
            onCapture(multiplexedRange);
          }
        }, 400);
      }
    };

    // Slight 80ms delay to let sound start playing smoothly before canvas blocks the thread
    setTimeout(() => {
      performSingleCapture();
    }, 80);
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
      
      {/* Real Webcam Video Stream */}
      <video 
        ref={videoRef}
        style={{ transform: `scaleX(-1) rotate(${webcamRotation}deg)` }}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        autoPlay 
        playsInline
        muted
      />

      {!cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-center p-8 z-[5]">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
            <VideoOff size={32} />
          </div>
          <h2 className="text-lg font-black uppercase tracking-widest text-zinc-100">{t('cameraView.sourceIdle')}</h2>
          <p className="text-zinc-500 text-xs max-w-xs mt-2 font-mono">
            {t('cameraView.permissionHint')}
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
        {/* Left: Prominent Countdown Timer Control */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2.5 px-4 rounded-[1.5rem] shadow-2xl backdrop-blur-md">
          <button 
            onClick={() => adjustDelay(-1)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 text-white/50 hover:text-white"
            title="Decrease countdown"
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
            title="Increase countdown"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
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

        {/* Right: Active Webcam without top label */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-2.5 px-3.5 rounded-[1.5rem] shadow-2xl backdrop-blur-md max-w-[220px]">
          <button 
            onClick={() => setIsAsleep(true)}
            className="text-white/60 hover:text-white hover:bg-white/10 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 border border-white/5 bg-white/5"
            title={t('cameraView.titleStandby')}
          >
            <VideoOff size={15} />
          </button>
          <span className="text-xs font-sans font-black text-white uppercase tracking-wide truncate max-w-[140px] select-none" title={cameraLabel}>
            {cameraLabel || t('cameraView.noCameraStream')}
          </span>
        </div>
      </div>

      {/* Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%]" />
    </div>
  );
}
