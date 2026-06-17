import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, RefreshCcw, Check, Loader2, Sparkles, ZoomIn, X, Download, Camera, RotateCw, AlertTriangle } from 'lucide-react';
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
  parallelJobs: number;
  printerEnabled: boolean;
  selectedPrinterName?: string;
  genaiEnabled?: boolean;
  comfyLivePreviewsEnabled?: boolean;
  customPromptModeEnabled?: boolean;
  userPrompt?: string;
  onCancelGeneration?: () => void;
}

export default function ResultView({
  previews,
  finalResult,
  onPrint,
  onRestart,
  onRegenerate,
  capturedImage,
  capturedImages = [],
  parallelJobs,
  printerEnabled,
  selectedPrinterName,
  genaiEnabled = true,
  comfyLivePreviewsEnabled = true,
  customPromptModeEnabled = false,
  userPrompt = '',
  onCancelGeneration,
}: ResultViewProps) {
  const [selectedVariants, setSelectedVariants] = useState<number[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  
  // "Please change the label to GenAI Filter and invert the logic to be default on"
  const [genaiFilterOn, setGenaiFilterOn] = useState(true);

  // Seed strategy options "Keep / New Seed"
  const [keepSeed, setKeepSeed] = useState(true);

  // States for one-off custom prompt edits during selective regeneration
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const [customPromptText, setCustomPromptText] = useState(userPrompt);

  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    setCustomPromptText(userPrompt);
  }, [userPrompt]);

  const displayImage = capturedImage || localStorage.getItem('last_captured_image') || "https://picsum.photos/seed/capture/800/1200";

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
    // Open prompt and seed option customizer modal
    setShowCustomPromptModal(true);
  };

  const handleStartCustomRegen = () => {
    if (selectedVariants.length === 0) return;
    selectedVariants.forEach(idx => {
      onRegenerate(idx, customPromptText, keepSeed);
    });
    setShowCustomPromptModal(false);
  };

  // Escape key support to dismiss the zoomed image
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZoomedImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      onRestart();
    }, 2000);
  };

  const toggleVariantSelection = (idx: number) => {
    setSelectedVariants(prev => {
      if (prev.includes(idx)) {
        return prev.filter(v => v !== idx);
      } else {
        return [...prev, idx];
      }
    });
  };

  // Build grid responsive classes based on job count and landscape orientation
  const gridClass = parallelJobs === 1 
    ? "max-w-md w-full mx-auto" 
    : parallelJobs === 2 
    ? "grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl" 
    : "grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl";

  return (
    <div className="min-h-screen bg-[#FCFCFD] text-zinc-900 font-sans p-2 flex flex-col items-center">
      {/* Grid container */}
      <div className="w-full max-w-6xl flex-1 flex flex-col justify-center">
        {/* Progress header showing active jobs count in real-time */}
        {(() => {
          const totalJobs = parallelJobs;
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
                    {onCancelGeneration && (
                      <button
                        onClick={onCancelGeneration}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-150 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                        id="cancel-generation-btn"
                        title="Cancel remaining jobs"
                      >
                        Cancel
                      </button>
                    )}
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
                setGenaiFilterOn(!genaiFilterOn);
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
            {Array.from({ length: parallelJobs }).map((_, idx) => {
              const isItemCompleted = !finalResult ? false : (finalResult.completed?.[idx] !== false);
              const isFailed = finalResult?.failed?.[idx] === true;
              const origImg = capturedImages[idx] || displayImage;
              
              // Resolve active live WebSocket preview if configured
              const livePreview = comfyLivePreviewsEnabled ? (previews.find(p => p.batch === idx)?.preview) : null;
              
              const imgUrl = isItemCompleted 
                ? (genaiFilterOn ? (finalResult?.variants?.[idx] || displayImage) : origImg) 
                : (livePreview || origImg);

              const isSelected = selectedVariants.includes(idx);

              return (
                <motion.div 
                  key={idx}
                  whileHover={isItemCompleted ? { y: -6 } : {}}
                  className={`relative rounded-[1.8rem] overflow-hidden transition-all duration-300 shadow-xl border bg-white group select-none
                    aspect-${isLandscape ? '[4/3]' : '[3/4]'}
                    ${!isItemCompleted ? 'cursor-wait border-zinc-200 opacity-90' : isSelected ? 'ring-8 ring-green-500 ring-offset-4 border-transparent cursor-pointer' : 'border-zinc-200 hover:border-zinc-300 cursor-pointer'}
                  `}
                  onClick={() => {
                    if (isItemCompleted) {
                      toggleVariantSelection(idx);
                    }
                  }}
                >
                  <img 
                    src={imgUrl} 
                    className={`w-full h-full object-cover transition-all duration-500 ${!isItemCompleted ? 'blur-[4px] scale-102 saturate-50 brightness-95' : ''}`} 
                    alt={`Variant Output ${idx + 1}`}
                  />

                  {/* Identification badge in lower-left */}
                  <div className="absolute bottom-4 left-4 bg-black/75 px-3 py-1.5 rounded-xl backdrop-blur-sm text-white font-mono text-[9px] tracking-wider z-10 select-none">
                    {t('resultView.outputLabel', { index: idx + 1 })}
                  </div>

                  {/* GenAI Failure alert display inside the card wrapper if enabled */}
                  {isItemCompleted && genaiFilterOn && isFailed && (
                    <div className="absolute inset-0 bg-amber-50/95 flex flex-col items-center justify-center p-6 text-center z-20">
                      <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-3 border border-amber-200">
                        <AlertTriangle size={24} strokeWidth={2.5} className="animate-bounce" />
                      </div>
                      <span className="block text-xs font-black uppercase text-amber-800 tracking-wider">{t('resultView.genaiFailedLabel')}</span>
                      <p className="text-[10px] text-zinc-650 mt-1 max-w-[150px] leading-relaxed font-semibold">
                        {t('resultView.genaiFailedDescription')}
                      </p>
                    </div>
                  )}

                  {!isItemCompleted ? (
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
                  ) : (
                    <>
                      {/* Zoom View utility toggle - disable if variant is failed and active context is GenAI */}
                      {!(genaiFilterOn && isFailed) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomedImage(imgUrl);
                          }}
                          className="absolute bottom-4 right-4 bg-white hover:bg-zinc-100 text-zinc-800 p-2 h-9 w-9 rounded-xl shadow-lg border border-zinc-200 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center z-10 hover:scale-105"
                          title={t('resultView.zoomImage')}
                        >
                          <ZoomIn size={15} />
                        </button>
                      )}

                      {/* Checked frame indicator */}
                      {isSelected && (
                        <motion.div 
                          layoutId="check"
                          className="absolute top-6 right-6 w-11 h-11 bg-green-500 rounded-full flex items-center justify-center text-white shadow-xl shadow-green-500/30 z-30"
                        >
                          <Check size={22} strokeWidth={3} />
                        </motion.div>
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
                disabled={selectedVariants.length === 0 || isPrinting || (finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
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
                onClick={() => {
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
                }}
                disabled={selectedVariants.length === 0 || (finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
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
                disabled={selectedVariants.length === 0 || (finalResult && selectedVariants.some(idx => finalResult.completed?.[idx] === false))}
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
        {zoomedImage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
              onClick={() => setZoomedImage(null)}
            />
            
            {/* Close trigger button */}
            <button 
              onClick={() => setZoomedImage(null)}
              className="absolute top-8 right-8 z-[210] w-12 h-12 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-full flex items-center justify-center transition-all duration-200"
            >
              <X size={20} />
            </button>

            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-5xl max-h-[85vh] overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl z-[205]"
            >
              <img 
                src={zoomedImage} 
                className="w-auto h-auto max-w-full max-h-[85vh] object-contain select-none"
                alt={t('resultView.zoomedViewAlt')}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Window */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/65 backdrop-blur-md">
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
