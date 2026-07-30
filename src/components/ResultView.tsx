import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, RefreshCcw, Check, Loader2, Sparkles, ZoomIn, X, Download, Camera, RotateCw, AlertTriangle, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { PreviewUpdate, FinalResult } from '../types';
import { t } from '../utils/i18n';

interface ResultViewProps {
  previews: PreviewUpdate[];
  finalResult: FinalResult | null;
  onPrint: (variantId: number, useOriginal?: boolean) => void;
  onRestart: () => void;
  onRegenerate: (variantId: number, customPrompt?: string, keepSeed?: boolean) => void;
  capturedImage: string | null;
  capturedImages: string[];
  failedCapturesCount?: number;
  parallelJobs: number;
  printerEnabled: boolean;
  selectedPrinterName?: string;
  multiSelectEnabled?: boolean;
  autoCloseEnabled?: boolean;
  genaiEnabled?: boolean;
  comfyLivePreviewsEnabled?: boolean;
  customPromptModeEnabled?: boolean;
  onCancelGeneration?: () => void;
  genaiFilterOn?: boolean;
  setGenaiFilterOn?: (val: boolean) => void;
  isActive?: boolean;
  onOpenSettings?: () => void;
}

export default function ResultView({
  previews,
  finalResult,
  onPrint,
  onRestart,
  onRegenerate,
  capturedImage,
  capturedImages = [],
  failedCapturesCount = 0,
  parallelJobs,
  printerEnabled,
  selectedPrinterName,
  multiSelectEnabled = true,
  autoCloseEnabled = true,
  genaiEnabled = true,
  comfyLivePreviewsEnabled = true,
  customPromptModeEnabled = false,
  onCancelGeneration,
  genaiFilterOn = true,
  setGenaiFilterOn,
  isActive = false,
  onOpenSettings,
}: ResultViewProps) {
  const [selectedVariants, setSelectedVariants] = useState<number[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  // Discard selection/zoom state when results view is inactive
  useEffect(() => {
    if (!isActive) {
      setSelectedVariants([]);
      setZoomedIndex(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (!multiSelectEnabled) {
      setSelectedVariants(prev => prev.length > 1 ? [prev[prev.length - 1]] : prev);
    }
  }, [multiSelectEnabled]);
  
  // Helper to dynamically resolve deep image paths for general state sync
  const getImgUrlForIndex = (i: number) => {
    const isItemCompleted = !finalResult ? false : (finalResult.completed?.[i] !== false);
    const rawImg = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages[i] : undefined;
    const origImg = (typeof rawImg === 'string' ? rawImg : undefined) || displayImage;
    return isItemCompleted 
      ? (genaiFilterOn ? (finalResult?.variants?.[i] || displayImage) : origImg) 
      : ((comfyLivePreviewsEnabled && genaiFilterOn) ? (previews.find(p => p.batch === i)?.preview || origImg) : origImg);
  };
  
  // Seed strategy options "Keep / New Seed"
  const [keepSeed, setKeepSeed] = useState(true);

  // States for one-off custom prompt edits during selective regeneration
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');

  const [isLandscape, setIsLandscape] = useState(false);

  const fallbackSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
      <rect width="100%" height="100%" fill="#18181b"/>
      <text x="600" y="900" fill="#71717a" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">NO CAPTURE SIGNAL</text>
    </svg>`
  )}`;

  const displayImage = capturedImage || localStorage.getItem('last_captured_image') || fallbackSvg;
  const zoomedImage = zoomedIndex === null
    ? null
    : getImgUrlForIndex(zoomedIndex);

  // Dynamic Landscape Orientation Detector
  useEffect(() => {
    if (displayImage) {
      const img = new Image();
      img.onload = () => {
        if (img.width > img.height) {
          setIsLandscape(true);
        } else {
          setIsLandscape(false);
        }
      };
      img.src = displayImage;
    }
  }, [displayImage]);

  const triggerRegeneration = () => {
    if (customPromptModeEnabled) {
      // Open prompt and seed option customizer modal
      setShowCustomPromptModal(true);
    } else {
      if (selectedVariants.length === 0) return;
      selectedVariants.forEach(idx => {
        // Just regenerate with default parameters (no custom prompt, don't force keepSeed/newSeed constraints in popup)
        onRegenerate(idx, undefined, false);
      });
    }
  };

  const handleStartCustomRegen = () => {
    if (selectedVariants.length === 0) return;
    selectedVariants.forEach(idx => {
      onRegenerate(idx, customPromptText, keepSeed);
    });
    setShowCustomPromptModal(false);
  };

  // Navigation helper for lightbox zoom
  const handlePrevZoom = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (zoomedIndex === null) return;
    const total = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs;
    if (total <= 1) return;
    const nextIdx = (zoomedIndex - 1 + total) % total;
    setZoomedIndex(nextIdx);
  };

  const handleNextZoom = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (zoomedIndex === null) return;
    const total = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs;
    if (total <= 1) return;
    const nextIdx = (zoomedIndex + 1) % total;
    setZoomedIndex(nextIdx);
  };

  const toggleCurrentSelection = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (zoomedIndex !== null) {
      toggleVariantSelection(zoomedIndex);
    }
  };

  // Escape key support + ArrowLeft and ArrowRight to navigate zoomed images
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedIndex(null);
      } else if (e.key === 'ArrowLeft') {
        if (zoomedIndex !== null) {
          const total = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs;
          if (total > 1) {
            const nextIdx = (zoomedIndex - 1 + total) % total;
            setZoomedIndex(nextIdx);
          }
        }
      } else if (e.key === 'ArrowRight') {
        if (zoomedIndex !== null) {
          const total = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs;
          if (total > 1) {
            const nextIdx = (zoomedIndex + 1) % total;
            setZoomedIndex(nextIdx);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedIndex, capturedImages.length, failedCapturesCount, parallelJobs]);

  const handlePrintRequest = () => {
    if (selectedVariants.length === 0) return;
    setShowConfirm(true);
  };

  const confirmPrint = () => {
    setShowConfirm(false);
    setIsPrinting(true);
    selectedVariants.forEach(idx => {
      onPrint(idx, !genaiFilterOn);
    });
    setTimeout(() => {
      setIsPrinting(false);
      if (autoCloseEnabled) {
        onRestart();
      }
    }, 2000);
  };

  const toggleVariantSelection = (idx: number) => {
    setSelectedVariants(prev => {
      if (prev.includes(idx)) {
        return prev.filter(v => v !== idx);
      }
      return multiSelectEnabled ? [...prev, idx].sort((a, b) => a - b) : [idx];
    });
  };

  const handleDownloadRequest = () => {
    if (selectedVariants.length === 0 || !finalResult) return;
    selectedVariants.forEach(idx => {
      const targetImg = genaiFilterOn
        ? (finalResult?.variants?.[idx] || displayImage)
        : (capturedImages[idx] || displayImage);
      const link = document.createElement('a');
      link.href = targetImg;
      link.download = `booth-output-${idx + 1}${!genaiFilterOn ? '-original' : ''}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    if (autoCloseEnabled) {
      onRestart();
    }
  };

  // Build grid responsive classes based on job count and landscape orientation
  const effectiveJobsCount = (capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs;
  const gridClass = effectiveJobsCount <= 1 
    ? "max-w-md w-full mx-auto" 
    : effectiveJobsCount === 2 
    ? "grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl" 
    : "grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl";

  return (
    <div className="min-h-screen bg-[#FCFCFD] text-zinc-900 font-sans p-2 flex flex-col items-center relative">
      {/* Floating Settings Button for Light Theme */}
      {onOpenSettings && (
        <div className="fixed top-8 right-8 z-[100]">
          <button
            onClick={onOpenSettings}
            className="settings-toggle w-12 h-12 bg-white/80 hover:bg-white text-zinc-600 hover:text-zinc-950 border border-zinc-200/90 rounded-full flex items-center justify-center transition-all shadow-md hover:shadow-lg backdrop-blur-md active:scale-95 cursor-pointer"
            title={t('cameraView.titleSettings')}
          >
            <Settings size={20} />
          </button>
        </div>
      )}

      {/* Grid container */}
      <div className="w-full max-w-6xl flex-1 flex flex-col justify-center">
        {/* Failed Captures Unobtrusive Warning */}
        {failedCapturesCount > 0 && (
          <div className="mb-4 max-w-lg mx-auto bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-center gap-3.5 text-amber-800 shadow-sm w-full">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-bold leading-normal text-amber-900">
                {failedCapturesCount} {failedCapturesCount === 1 ? 'image' : 'images'} failed to capture
              </span>
              <span className="text-[10px] text-amber-700/90 leading-tight">
                Showing only successfully captured images.
              </span>
            </div>
          </div>
        )}

        {/* Progress header showing active jobs count in real-time */}
        {(() => {
          if (!genaiEnabled || !genaiFilterOn) return null;
          const totalJobs = capturedImages.length;
          const completedCount = finalResult?.completed?.filter(c => c).length || 0;
          const hasUnfinished = finalResult && completedCount < totalJobs;

          if (hasUnfinished) {
            return (
              <div className="space-y-4 mb-4">
                <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between max-w-lg mx-auto shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-650 animate-pulse">
                      <Loader2 size={16} className="animate-spin animate-duration-1000" />
                    </div>
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider text-zinc-800">{t('resultView.processingJobs')}</h2>
                      <p className="text-[10px] text-zinc-400">Completed variants: {completedCount} / {totalJobs}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono bg-green-50 text-green-700 font-extrabold px-2.5 py-1 rounded-full uppercase">
                      Running
                    </span>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Show Original Toggle Container */}
        {genaiEnabled && (
          <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 p-2.5 px-5 mb-4 rounded-2xl shadow-sm hover:bg-zinc-100/60 transition-colors select-none">
            <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500">{t('resultView.genaiFilterLabel')}</span>
            <button
              onClick={() => {
                if (setGenaiFilterOn) {
                  setGenaiFilterOn(!genaiFilterOn);
                }
              }}
              className={`relative w-11 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${genaiFilterOn ? 'bg-green-500' : 'bg-zinc-300'}`}
              title={t('resultView.genaiFilterTitle')}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${genaiFilterOn ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        )}

        {/* Unified progressive photobooth grid */}
        <div className="flex flex-col items-center gap-8 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={gridClass}
          >
            {((capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages : Array.from({ length: parallelJobs })).map((rawImg, idx) => {
              const isItemCompleted = !finalResult ? false : (finalResult.completed?.[idx] !== false);
              const isFailed = finalResult?.failed?.[idx] === true;
              const origImg = (typeof rawImg === 'string' ? rawImg : capturedImages[idx]) || displayImage;
              
              const imgUrl = isItemCompleted 
                ? (genaiFilterOn ? (finalResult?.variants?.[idx] || displayImage) : origImg) 
                : ((comfyLivePreviewsEnabled && genaiFilterOn) ? (previews.find(p => p.batch === idx)?.preview || origImg) : origImg);

              const isSelected = selectedVariants.includes(idx);
              const canInteract = isItemCompleted || !genaiFilterOn;

              return (
                <motion.div 
                  key={idx}
                  className={`relative rounded-[1.8rem] overflow-hidden transition-all duration-300 shadow-xl border bg-white group select-none
                    aspect-${isLandscape ? '[4/3]' : '[3/4]'}
                    ${!canInteract ? 'cursor-wait border-zinc-200 opacity-90' : isSelected ? 'ring-8 ring-green-500 ring-offset-4 border-transparent cursor-pointer' : 'border-zinc-200 hover:border-zinc-300 cursor-pointer'}
                  `}
                  onClick={() => {
                    if (canInteract) {
                      toggleVariantSelection(idx);
                    }
                  }}
                >
                  <img 
                    src={imgUrl} 
                    className={`w-full h-full object-cover transition-all duration-500 ${(!isItemCompleted && genaiFilterOn) ? 'blur-[4px] scale-102 saturate-50 brightness-95' : ''}`} 
                    alt={t('resultView.outputLabel', { index: idx + 1 })}
                  />

                  {/* Identification badge in lower-left */}
                  <div className="absolute bottom-4 left-4 bg-black/75 px-3 py-1.5 rounded-xl backdrop-blur-sm text-white font-mono text-[9px] tracking-wider z-10 select-none">
                    {t('resultView.outputLabel', { index: idx + 1 })}
                  </div>

                  {/* GenAI Failure alert display inside the card wrapper if enabled */}
                  {isItemCompleted && genaiFilterOn && isFailed && (
                     <div className="absolute inset-0 bg-amber-50/95 flex flex-col items-center justify-center p-6 text-center z-20">
                      <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-3 border border-amber-200">
                        <AlertTriangle size={24} strokeWidth={2.5} />
                      </div>
                      <span className="block text-xs font-black uppercase text-amber-800 tracking-wider">{t('resultView.genaiFailedLabel')}</span>
                      <p className="text-[10px] text-zinc-650 mt-1 max-w-[150px] leading-relaxed font-semibold">
                        {t('resultView.genaiFailedDescription')}
                      </p>
                    </div>
                  )}

                  {!canInteract && (
                    /* Processing Glassmorphism Overlay */
                    <div className="absolute inset-0 bg-white/20 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-6 text-center">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="mb-3 text-green-500 bg-white p-3.5 rounded-full shadow-lg border border-zinc-100"
                      >
                        <Loader2 size={22} className="animate-spin" />
                      </motion.div>
                      <div className="bg-white/95 border border-zinc-100/50 p-2.5 px-3.5 rounded-2xl shadow-xl max-w-[150px]">
                        <p className="text-[9px] uppercase font-black tracking-wider text-zinc-900 leading-none">
                          {t('common.processing')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Zoom remains available while the image is processing. */}
                  {!(genaiFilterOn && isFailed) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoomedIndex(idx);
                      }}
                      className="absolute bottom-4 right-4 bg-white hover:bg-zinc-100 text-zinc-800 p-2 h-9 w-9 rounded-xl shadow-lg border border-zinc-200 transition-all flex items-center justify-center z-30 hover:scale-105"
                      title={t('resultView.zoomImage')}
                    >
                      <ZoomIn size={15} />
                    </button>
                  )}

                  {canInteract && (
                    <>
                      {/* Selection checkmark in the upper-left */}
                      {isSelected ? (
                        <motion.div 
                          layoutId={`check-${idx}`}
                          className="absolute top-4 left-4 w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/30 z-30 cursor-pointer border border-green-600 hover:scale-105 duration-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVariantSelection(idx);
                          }}
                        >
                          <Check size={18} strokeWidth={3} />
                        </motion.div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVariantSelection(idx);
                          }}
                          className="absolute top-4 left-4 w-9 h-9 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center shadow-lg border border-white/20 z-30 transition-all hover:scale-105"
                          title={t('resultView.selectImage')}
                        >
                          <Check size={16} strokeWidth={2.5} className="opacity-60" />
                        </button>
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Action Button Group */}
        <div className="flex flex-col items-center gap-5 pt-6 border-t border-zinc-200/60 max-w-4xl mx-auto w-full">

          <div className="flex flex-wrap items-center justify-center gap-3.5 w-full">
            {/* Retake Photo Trigger */}
            <button
              onClick={onRestart}
              className="bg-white hover:bg-zinc-50 text-zinc-800 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-zinc-200 shadow-md transition-all flex items-center gap-2.5 active:scale-95 duration-200"
            >
              <Camera size={16} className="text-zinc-500" />
              {t('resultView.retakePhotos')}
            </button>
            
             {/* Print / Save Trigger */}
            {printerEnabled ? (
              <button
                onClick={handlePrintRequest}
                disabled={selectedVariants.length === 0 || isPrinting || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                className="bg-zinc-950 hover:bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all flex items-center gap-2.5 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none border border-zinc-200/20 active:scale-95 duration-200"
              >
                {isPrinting ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    {t('resultView.printingJob')}
                  </>
                ) : (
                  <>
                    <Printer size={16} />
                    {t('resultView.printSelectedCount', { count: selectedVariants.length })}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleDownloadRequest}
                disabled={selectedVariants.length === 0 || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                className="bg-zinc-950 hover:bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all flex items-center gap-2.5 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none border border-zinc-200/20 active:scale-95 duration-200"
              >
                <Download size={16} />
                {t('resultView.downloadSelectedCount', { count: selectedVariants.length })}
              </button>
            )}

            {/* Regenerate Trigger */}
            {genaiEnabled && (
              <button
                onClick={triggerRegeneration}
                disabled={selectedVariants.length === 0 || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                className="bg-white hover:bg-zinc-50 text-zinc-800 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-zinc-200 shadow-md transition-all flex items-center gap-2.5 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:border-zinc-100 active:scale-95 duration-200"
              >
                <RotateCw size={16} />
                {t('resultView.regenerateSelectedCount', { count: selectedVariants.length })}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zoom / Lightbox Modal Overlay */}
      <AnimatePresence>
        {zoomedIndex !== null && zoomedImage && (
          <motion.div
            key="result-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
              onClick={() => {
                setZoomedIndex(null);
              }}
            />
            
            {/* Title at top center */}
            {zoomedIndex !== null && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-3 bg-black/60 border border-white/10 px-6 py-3 rounded-full backdrop-blur-xl shadow-2xl pointer-events-none">
                <span className="text-white font-black uppercase tracking-widest text-sm">
                  {t('resultView.outputLabel', { index: zoomedIndex + 1 })}
                </span>
              </div>
            )}

            {/* Close trigger button */}
            <button 
              onClick={() => {
                setZoomedIndex(null);
              }}
              className="absolute top-8 right-8 z-[210] w-12 h-12 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-full flex items-center justify-center transition-all duration-200"
            >
              <X size={20} />
            </button>

            {/* Left navigation arrow */}
            {((capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs) > 1 && (
              <button 
                onClick={handlePrevZoom}
                className="absolute left-8 top-1/2 -translate-y-1/2 z-[210] w-14 h-14 bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 border border-white/10 text-white rounded-full flex items-center justify-center transition-all duration-200"
                title={t('common.prev') || 'Previous'}
              >
                <ChevronLeft size={28} strokeWidth={2} />
              </button>
            )}

            {/* Right navigation arrow */}
            {((capturedImages.length > 0 || failedCapturesCount > 0) ? capturedImages.length : parallelJobs) > 1 && (
              <button 
                onClick={handleNextZoom}
                className="absolute right-8 top-1/2 -translate-y-1/2 z-[210] w-14 h-14 bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 border border-white/10 text-white rounded-full flex items-center justify-center transition-all duration-200"
                title={t('common.next') || 'Next'}
              >
                <ChevronRight size={28} strokeWidth={2} />
              </button>
            )}

            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`relative max-w-5xl max-h-[70vh] overflow-hidden rounded-[2rem] border shadow-2xl z-[205] transition-colors duration-200 ${
                zoomedIndex !== null && selectedVariants.includes(zoomedIndex)
                  ? 'border-green-500 ring-8 ring-green-500/35'
                  : 'border-white/10'
              }`}
            >
              <img 
                src={zoomedImage} 
                className={`w-auto h-auto max-w-full max-h-[70vh] object-contain select-none cursor-pointer rounded-[2rem] transition-all duration-200 ${
                  zoomedIndex !== null && selectedVariants.includes(zoomedIndex)
                    ? 'border-4 border-green-500'
                    : 'border-4 border-transparent hover:border-white/5'
                }`}
                alt={t('resultView.zoomedViewAlt')}
                onClick={toggleCurrentSelection}
              />

              {/* Processing Glassmorphism Overlay inside Lightbox if image is generating */}
              {zoomedIndex !== null && (!finalResult ? false : (finalResult.completed?.[zoomedIndex] !== false)) === false && genaiFilterOn && (
                <div className="absolute inset-0 bg-white/20 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-6 text-center pointer-events-none z-20">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="mb-3 text-green-500 bg-white p-3.5 rounded-full shadow-lg border border-zinc-100"
                  >
                    <Loader2 size={22} className="animate-spin" />
                  </motion.div>
                  <div className="bg-white/95 border border-zinc-100/50 p-2.5 px-3.5 rounded-2xl shadow-xl max-w-[150px]">
                    <p className="text-[9px] uppercase font-black tracking-wider text-zinc-900 leading-none">
                      {t('common.processing')}
                    </p>
                  </div>
                </div>
              )}

              {/* Checkmark inside zoomed image (upper left corner of the image card) */}
              {zoomedIndex !== null && (
                selectedVariants.includes(zoomedIndex) ? (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCurrentSelection();
                    }}
                    className="absolute top-8 left-8 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow-2xl z-30 animate-scaleIn cursor-pointer border border-green-600 hover:scale-105 duration-150"
                  >
                    <Check size={24} strokeWidth={3} />
                  </div>
                ) : (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCurrentSelection();
                    }}
                    className="absolute top-8 left-8 w-12 h-12 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center shadow-2xl border border-white/20 z-30 cursor-pointer hover:scale-105 duration-150"
                  >
                    <Check size={20} strokeWidth={2.5} className="opacity-60" />
                  </div>
                )
              )}
            </motion.div>
 
            {/* Bottom action controls inside lightbox overlay */}
            {zoomedIndex !== null && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[210] flex items-center gap-3.5 bg-black/60 border border-white/10 px-6 py-4 rounded-3xl backdrop-blur-xl shadow-2xl max-w-full overflow-x-auto">
                {/* Retake Photo Trigger */}
                <button
                  onClick={onRestart}
                  className="bg-white hover:bg-zinc-50 text-zinc-800 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-zinc-200 shadow-md transition-all flex items-center gap-2.5 active:scale-95 duration-200 whitespace-nowrap flex-shrink-0"
                >
                  <Camera size={16} className="text-zinc-500" />
                  {t('resultView.retakePhotos')}
                </button>
                
                 {/* Print / Save Trigger */}
                {printerEnabled ? (
                  <button
                    onClick={handlePrintRequest}
                    disabled={selectedVariants.length === 0 || isPrinting || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                    className="bg-zinc-950 hover:bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all flex items-center gap-2.5 disabled:bg-zinc-850 disabled:text-zinc-500 disabled:shadow-none border border-white/10 active:scale-95 duration-200 whitespace-nowrap flex-shrink-0"
                  >
                    {isPrinting ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        {t('resultView.printingJob')}
                      </>
                    ) : (
                      <>
                        <Printer size={16} />
                        {t('resultView.printSelectedCount', { count: selectedVariants.length })}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleDownloadRequest}
                    disabled={selectedVariants.length === 0 || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                    className="bg-zinc-950 hover:bg-green-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all flex items-center gap-2.5 disabled:bg-zinc-850 disabled:text-zinc-500 disabled:shadow-none border border-white/10 active:scale-95 duration-200 whitespace-nowrap flex-shrink-0"
                  >
                    <Download size={16} />
                    {t('resultView.downloadSelectedCount', { count: selectedVariants.length })}
                  </button>
                )}
 
                {/* Regenerate Trigger */}
                {genaiEnabled && (
                  <button
                    onClick={triggerRegeneration}
                    disabled={selectedVariants.length === 0 || (genaiFilterOn && finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
                    className="bg-white hover:bg-zinc-50 text-zinc-800 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-zinc-200 shadow-md transition-all flex items-center gap-2.5 disabled:bg-zinc-850 disabled:text-zinc-500 active:scale-95 duration-200 whitespace-nowrap flex-shrink-0"
                  >
                    <RotateCw size={16} />
                    {t('resultView.regenerateSelectedCount', { count: selectedVariants.length })}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Window */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md"
              onClick={() => setShowConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl overflow-hidden border border-zinc-100"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-green-500" />
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-6 border border-green-100">
                  <Printer size={28} />
                </div>
                <h3 className="text-xl font-black mb-1.5 uppercase italic tracking-tight">{t('resultView.confirmTitle')}</h3>
                <p className="text-zinc-500 text-xs leading-relaxed mb-6">
                  {t('resultView.confirmBulkDescription', { count: selectedVariants.length, printer: selectedPrinterName || "the printer" })}
                </p>
                
                <div className="flex flex-col w-full gap-2 font-black uppercase tracking-widest text-xs">
                  <button 
                    onClick={confirmPrint}
                    className="w-full bg-green-500 text-white py-4 rounded-xl hover:bg-green-600 transition-all shadow-lg shadow-green-500/10 active:scale-95"
                  >
                    {t('resultView.confirmButton')}
                  </button>
                  <button 
                    onClick={() => setShowConfirm(false)}
                    className="w-full text-zinc-400 py-3 text-[10px] hover:text-zinc-800 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Prompt Edit Overlay Dialog Modal */}
      <AnimatePresence>
        {showCustomPromptModal && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-zinc-200 rounded-[2rem] p-6 w-full max-w-md shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-green-500" />
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-800 flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-green-500 animate-pulse" />
                {t('resultView.regenerateSelected')}
              </h3>
              <p className="text-[10px] text-zinc-400 mb-4 leading-relaxed font-sans">
                {t('resultView.regenerateSelectedSub', { count: selectedVariants.length })}
              </p>
              
              <div className="space-y-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">{t('resultView.modifyPromptPhrase')}</span>
                  <textarea
                    value={customPromptText}
                    onChange={(e) => setCustomPromptText(e.target.value)}
                    placeholder="Enter custom prompt..."
                    rows={3}
                    className="w-full text-xs font-mono font-bold bg-zinc-50 border border-zinc-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 rounded-2xl p-4 text-zinc-700 outline-none transition-all placeholder:text-zinc-300"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 select-none">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">{t('resultView.seedStrategyOption')}</span>
                  <div className="flex gap-6 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-sans text-xs font-semibold text-zinc-700">
                      <input
                        type="radio"
                        name="seed_strategy_option"
                        checked={keepSeed}
                        onChange={() => setKeepSeed(true)}
                        className="text-green-500 focus:ring-green-500 h-4 w-4"
                      />
                      {t('resultView.keepSeed')}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-sans text-xs font-semibold text-zinc-700">
                      <input
                        type="radio"
                        name="seed_strategy_option"
                        checked={!keepSeed}
                        onChange={() => setKeepSeed(false)}
                        className="text-green-500 focus:ring-green-500 h-4 w-4"
                      />
                      {t('resultView.newSeed')}
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2.5 justify-end font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomPromptModal(false);
                  }}
                  className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-750 text-[10px] font-black uppercase tracking-widest rounded-xl border border-zinc-200 transition-all cursor-pointer active:scale-95"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleStartCustomRegen}
                  className="px-6 py-3 bg-zinc-950 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2"
                >
                  <RotateCw size={12} className="text-green-400" />
                  {t('resultView.regenerateBtn')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
