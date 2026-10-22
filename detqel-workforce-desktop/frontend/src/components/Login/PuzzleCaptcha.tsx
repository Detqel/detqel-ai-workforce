"use client";

import {
  CAPTCHA_IMAGES,
  CAPTCHA_INITIAL_TARGET,
  CAPTCHA_INITIAL_BOARD_DIMENSIONS,
  CAPTCHA_PIECE_SIZE,
  CAPTCHA_MIN_TARGET_X_RATIO,
  CAPTCHA_TARGET_HORIZONTAL_PADDING,
  CAPTCHA_TARGET_VERTICAL_PADDING,
  CAPTCHA_PIECE_DISTANCE_PADDING,
  CAPTCHA_PIECE_OFFSET,
  CAPTCHA_SLIDER_HANDLE_WIDTH,
  CAPTCHA_VERIFICATION_TOLERANCE,
  CAPTCHA_SUCCESS_CLOSE_DELAY_MS,
  CAPTCHA_RETRY_DELAY_MS,
  CAPTCHA_INITIALIZATION_DELAY_MS,
  CAPTCHA_LEGACY_MISSING_START_TIME_SECONDS,
  CAPTCHA_LEGACY_MISSING_VERIFY_TIME_SECONDS,
} from "@/constants/captchaConstants";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Check,
  ArrowRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

interface PuzzleCaptchaProps {
  onVerify: (isVerified: boolean) => void;
  isVerified: boolean;
}

export const PuzzleCaptcha: React.FC<PuzzleCaptchaProps> = ({
  onVerify,
  isVerified,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [sliderPercent, setSliderPercent] = useState(0);
  const [targetX, setTargetX] = useState(CAPTCHA_INITIAL_TARGET.x);
  const [targetY, setTargetY] = useState(CAPTCHA_INITIAL_TARGET.y);
  const [boardDimensions, setBoardDimensions] = useState(CAPTCHA_INITIAL_BOARD_DIMENSIONS);
  const [isDragging, setIsDragging] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifyTime, setVerifyTime] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const currentImage = CAPTCHA_IMAGES[imageIndex];
  const pieceSize = CAPTCHA_PIECE_SIZE;

  const updateBoardDimensions = useCallback(() => {
    if (boardRef.current) {
      const { clientWidth, clientHeight } = boardRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        setBoardDimensions({ width: clientWidth, height: clientHeight });
      }
    }
  }, []);

  const randomizePuzzle = useCallback(() => {
    setImageLoaded(false);
    setImageIndex((prevIndex) => {
      let nextIndex = Math.floor(Math.random() * CAPTCHA_IMAGES.length);
      if (nextIndex === prevIndex) {
        nextIndex = (prevIndex + 1) % CAPTCHA_IMAGES.length;
      }
      return nextIndex;
    });

    const boardWidth = boardRef.current?.clientWidth || CAPTCHA_INITIAL_BOARD_DIMENSIONS.width;
    const boardHeight = boardRef.current?.clientHeight || CAPTCHA_INITIAL_BOARD_DIMENSIONS.height;

    const minX = Math.floor(boardWidth * CAPTCHA_MIN_TARGET_X_RATIO);
    const maxX = Math.floor(boardWidth - pieceSize - CAPTCHA_TARGET_HORIZONTAL_PADDING);
    const minY = CAPTCHA_TARGET_VERTICAL_PADDING;
    const maxY = Math.floor(boardHeight - pieceSize - CAPTCHA_TARGET_VERTICAL_PADDING);

    const randomX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    const randomY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    setTargetX(randomX);
    setTargetY(randomY);
    setSliderPercent(0);
    setIsFailed(false);
    setIsSuccess(false);
  }, [pieceSize]);

  useEffect(() => {
    if (isOpen) {
      updateBoardDimensions();
      const timer = setTimeout(() => {
        randomizePuzzle();
      }, CAPTCHA_INITIALIZATION_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen, updateBoardDimensions, randomizePuzzle]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const img = new window.Image();
    img.src = currentImage.url;
    img.onload = () => {
      if (active) setImageLoaded(true);
    };
    img.onerror = () => {
      if (active) setImageLoaded(true);
    };
    return () => {
      active = false;
    };
  }, [isOpen, currentImage.url]);

  useEffect(() => {
    if (!boardRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setBoardDimensions({ width, height });
        }
      }
    });
    observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  const maxPieceDistance = Math.max(1, boardDimensions.width - pieceSize - CAPTCHA_PIECE_DISTANCE_PADDING);
  const currentPieceX = (sliderPercent / 100) * maxPieceDistance + CAPTCHA_PIECE_OFFSET;

  const handleDragMove = useCallback(
    (clientX: number) => {
      if (!isDragging || isVerified || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawX = clientX - rect.left - CAPTCHA_SLIDER_HANDLE_WIDTH / 2;
      const maxTrackDistance = Math.max(1, rect.width - CAPTCHA_SLIDER_HANDLE_WIDTH);
      const clampedX = Math.max(0, Math.min(rawX, maxTrackDistance));
      const percentage = (clampedX / maxTrackDistance) * 100;
      setSliderPercent(percentage);
    },
    [isDragging, isVerified]
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging || isVerified) return;
    setIsDragging(false);

    const difference = Math.abs(currentPieceX - targetX);
    const tolerance = CAPTCHA_VERIFICATION_TOLERANCE;

    if (difference <= tolerance) {
      const correctPercent =
        ((targetX - CAPTCHA_PIECE_OFFSET) / Math.max(1, boardDimensions.width - pieceSize - CAPTCHA_PIECE_DISTANCE_PADDING)) *
        100;
      setSliderPercent(Math.max(0, Math.min(100, correctPercent)));
      setIsSuccess(true);
      setIsFailed(false);

      const timeTaken = startTime
        ? ((Date.now() - startTime) / 1000).toFixed(1)
        : CAPTCHA_LEGACY_MISSING_START_TIME_SECONDS;
      setVerifyTime(Number(timeTaken));
      onVerify(true);

      setTimeout(() => {
        setIsOpen(false);
      }, CAPTCHA_SUCCESS_CLOSE_DELAY_MS);
    } else {
      setIsFailed(true);
      setIsSuccess(false);
      setTimeout(() => {
        randomizePuzzle();
      }, CAPTCHA_RETRY_DELAY_MS);
    }
  }, [
    isDragging,
    isVerified,
    currentPieceX,
    targetX,
    boardDimensions.width,
    pieceSize,
    startTime,
    onVerify,
    randomizePuzzle,
  ]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleDragMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => handleDragEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const handleStartDrag = () => {
    if (isVerified || isSuccess) return;
    setIsDragging(true);
    setIsFailed(false);
    if (!startTime) {
      setStartTime(Date.now());
    }
  };

  return (
    <div className="w-full select-none">
      {!isOpen && !isVerified && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setStartTime(Date.now());
          }}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:px-4 sm:py-3.5 flex items-center justify-between hover:bg-slate-100/70 hover:border-slate-300 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-[#8a2be2] group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-semibold text-slate-800">
                Security Verification
              </span>
              <span className="text-[11px] text-slate-500">
                Slide puzzle piece to verify you are human
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs font-semibold text-[#8a2be2] group-hover:bg-[#8a2be2] group-hover:text-white transition-all shadow-xs">
            <span>Solve</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </button>
      )}

      {isVerified && (
        <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 sm:px-4 sm:py-3 flex items-center justify-between transition-all shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-semibold text-emerald-900">
                Verification Complete
              </span>
              <span className="text-[10px] sm:text-[11px] text-emerald-700">
                Puzzle solved in {verifyTime || CAPTCHA_LEGACY_MISSING_VERIFY_TIME_SECONDS}s • Human verified
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Passed</span>
          </div>
        </div>
      )}

      {isOpen && !isVerified && (
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-[#8a2be2]" />
              <span>Slide the piece to complete image</span>
            </div>
            <div className="flex items-center gap-1">
              <IconOnlyButton
                onClick={randomizePuzzle}
                title="Change image & reset puzzle"
                aria-label="Change image and reset puzzle"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              />
              <IconOnlyButton
                onClick={() => setIsOpen(false)}
                title="Close"
                aria-label="Close"
                className="text-xs text-slate-400 hover:text-slate-700 p-1.5 font-bold"
                icon={<span>✕</span>}
              />
            </div>
          </div>

          <div
            ref={boardRef}
            className={`relative w-full h-[155px] sm:h-[175px] rounded-xl overflow-hidden select-none border transition-all ${
              isFailed
                ? "border-red-400 animate-shake"
                : isSuccess
                ? "border-emerald-500 ring-2 ring-emerald-500/20"
                : "border-slate-200 shadow-inner"
            }`}
            style={{
              backgroundImage: imageLoaded ? `url(${currentImage.url})` : "none",
              backgroundColor: "#f8fafc",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!imageLoaded && (
              <div className="absolute inset-0 bg-slate-100 flex items-center justify-center text-slate-500 gap-2 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-[#8a2be2]" />
                <span>Loading puzzle image...</span>
              </div>
            )}

            {imageLoaded && (
              <>
                <div
                  className="absolute rounded-xl border-2 border-dashed border-white/90 bg-black/60 backdrop-blur-xs shadow-inner flex items-center justify-center transition-all"
                  style={{
                    width: `${pieceSize}px`,
                    height: `${pieceSize}px`,
                    left: `${targetX}px`,
                    top: `${targetY}px`,
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                </div>

                <div
                  className="absolute overflow-hidden rounded-xl pointer-events-none transition-transform"
                  style={{
                    width: `${pieceSize}px`,
                    height: `${pieceSize}px`,
                    left: `${currentPieceX}px`,
                    top: `${targetY}px`,
                    border: isSuccess
                      ? "2px solid #10b981"
                      : isFailed
                      ? "2px solid #ef4444"
                      : "2px solid #ffffff",
                    boxShadow: isSuccess
                      ? "0 0 18px rgba(16, 185, 129, 0.9)"
                      : isFailed
                      ? "0 0 16px rgba(239, 68, 68, 0.8)"
                      : "0 4px 18px rgba(0, 0, 0, 0.5), 0 0 12px rgba(138, 43, 226, 0.7)",
                  }}
                >
                  <div
                    className="absolute bg-cover bg-center"
                    style={{
                      width: `${boardDimensions.width}px`,
                      height: `${boardDimensions.height}px`,
                      left: `-${targetX}px`,
                      top: `-${targetY}px`,
                      backgroundImage: `url(${currentImage.url})`,
                    }}
                  />
                </div>

                <div className="absolute bottom-2 left-2.5 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-md text-[10px] font-medium text-white/90 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-purple-300" />
                  <span>{currentImage.label}</span>
                </div>
              </>
            )}

            {isSuccess && (
              <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-xs flex items-center justify-center text-white text-xs font-semibold gap-2 animate-in fade-in duration-200">
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span>Verification successful!</span>
              </div>
            )}

            {isFailed && (
              <div className="absolute inset-0 bg-red-950/45 backdrop-blur-xs flex items-center justify-center text-white text-xs font-semibold gap-1.5 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Puzzle not aligned. Generating new image...</span>
              </div>
            )}
          </div>

          <div
            ref={trackRef}
            className="relative w-full h-11 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex items-center select-none"
          >
            <div
              className={`absolute left-0 top-0 bottom-0 transition-all ${
                isSuccess
                  ? "bg-emerald-500/20"
                  : isFailed
                  ? "bg-red-500/20"
                  : "bg-[#8a2be2]/15"
              }`}
              style={{
                width: `calc(4px + (100% - 52px) * ${sliderPercent / 100} + 22px)`,
              }}
            />

            <div className="w-full text-center text-xs font-medium text-slate-400 pointer-events-none pl-12 pr-4">
              {isSuccess
                ? "Puzzle piece aligned!"
                : "Slide right to fit the cutout piece"}
            </div>

            <button
              type="button"
              onMouseDown={handleStartDrag}
              onTouchStart={handleStartDrag}
              disabled={isSuccess}
              className={`absolute top-1 bottom-1 w-11 rounded-lg flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing transition-colors active:scale-95 disabled:cursor-default ${
                isSuccess
                  ? "bg-emerald-600 text-white"
                  : isFailed
                  ? "bg-red-500 text-white"
                  : isDragging
                  ? "bg-[#7823c9] text-white"
                  : "bg-[#8a2be2] text-white hover:bg-[#7823c9]"
              }`}
              style={{
                left: `calc(4px + (100% - 52px) * ${sliderPercent / 100})`,
              }}
              aria-label="Drag slider to solve puzzle"
            >
              {isSuccess ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : (
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
