'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { CropMode, CropSettings } from '@/types';

interface CropPreviewPanelProps {
  cropSettings: CropSettings;
  file?: File | null;
  hasFile?: boolean;
  onCropModeChange?: (mode: CropMode) => void;
  onCustomCropChange?: (field: 'width' | 'height' | 'x' | 'y', value: string) => void;
  disabled?: boolean;
}

interface PreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  note?: string;
}

function formatPercent(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function getPresetRect(ratio: number, sourceRatio: number): PreviewRect {
  const safeSourceRatio = sourceRatio > 0 ? sourceRatio : 16 / 9;

  if (ratio > safeSourceRatio) {
    const height = (safeSourceRatio / ratio) * 100;
    return {
      left: 0,
      top: (100 - height) / 2,
      width: 100,
      height,
      label: `Aspect ${ratio.toFixed(2)}:1`,
    };
  }

  const width = (ratio / safeSourceRatio) * 100;
  return {
    left: (100 - width) / 2,
    top: 0,
    width,
    height: 100,
    label: `Aspect ${ratio.toFixed(2)}:1`,
  };
}

function getPreviewRect(cropSettings: CropSettings, sourceRatio: number): PreviewRect {
  if (cropSettings.mode === 'none') {
    return { left: 0, top: 0, width: 100, height: 100, label: 'Original Frame' };
  }

  if (cropSettings.mode === 'custom') {
    const widthPct = Number(cropSettings.custom.width);
    const heightPct = Number(cropSettings.custom.height);
    const xPct = cropSettings.custom.x ? Number(cropSettings.custom.x) : 0;
    const yPct = cropSettings.custom.y ? Number(cropSettings.custom.y) : 0;

    if (!Number.isFinite(widthPct) || !Number.isFinite(heightPct) || widthPct <= 0 || heightPct <= 0) {
      return { left: 0, top: 0, width: 100, height: 100, label: 'Custom', note: 'Set width and height percentages (1-100) to preview.' };
    }
    if (widthPct > 100 || heightPct > 100) {
      return { left: 0, top: 0, width: 100, height: 100, label: 'Custom', note: 'Width and height percentages must be <= 100.' };
    }
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct) || xPct < 0 || yPct < 0 || xPct > 100 || yPct > 100) {
      return { left: 0, top: 0, width: 100, height: 100, label: 'Custom', note: 'X and Y percentages must be between 0 and 100.' };
    }
    if (xPct + widthPct > 100 || yPct + heightPct > 100) {
      return { left: 0, top: 0, width: 100, height: 100, label: 'Custom', note: 'X + Width and Y + Height must be <= 100%.' };
    }

    return {
      left: xPct,
      top: yPct,
      width: widthPct,
      height: heightPct,
      label: `Custom ${formatPercent(widthPct)}%×${formatPercent(heightPct)}%`,
      note: 'Values are percentages of the original frame.',
    };
  }

  const ratioMap: Record<'9:16' | '16:9' | '4:3' | '3:4', number> = {
    '9:16': 9 / 16,
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
  };

  const rect = getPresetRect(ratioMap[cropSettings.mode], sourceRatio);
  return { ...rect, label: `Aspect ${cropSettings.mode}` };
}

type FramePreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SourceDimensions {
  width: number;
  height: number;
}

interface EditableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_CROP_PERCENT = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function CropPreviewPanel({
  cropSettings,
  file,
  hasFile,
  onCropModeChange,
  onCustomCropChange,
  disabled,
}: CropPreviewPanelProps) {
  const hasSourceFile = Boolean(file) || Boolean(hasFile);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(16 / 9);
  const [sourceDimensions, setSourceDimensions] = useState<SourceDimensions | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [framePreviewStatus, setFramePreviewStatus] = useState<FramePreviewStatus>('idle');
  const [isDraggingRect, setIsDraggingRect] = useState(false);

  useEffect(() => {
    if (!file) {
      setSourceAspectRatio(16 / 9);
      setSourceDimensions(null);
      setFrameDataUrl(null);
      setFramePreviewStatus('idle');
      return;
    }

    let disposed = false;
    let captured = false;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');

    setFrameDataUrl(null);
    setSourceDimensions(null);
    setFramePreviewStatus('loading');

    const captureFrame = () => {
      if (disposed || captured) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      setSourceAspectRatio(width / height);
      setSourceDimensions({ width, height });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        setFramePreviewStatus('error');
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      setFrameDataUrl(canvas.toDataURL('image/jpeg', 0.86));
      setFramePreviewStatus('ready');
      captured = true;
    };

    const onLoadedMetadata = () => {
      if (disposed) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      setSourceAspectRatio(width / height);
      setSourceDimensions({ width, height });
    };

    const onLoadedData = () => {
      captureFrame();
    };

    const onCanPlay = () => {
      captureFrame();
    };

    const onError = () => {
      if (disposed) return;
      setFrameDataUrl(null);
      setFramePreviewStatus('error');
    };

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.load();

    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const rect = useMemo(
    () => getPreviewRect(cropSettings, sourceAspectRatio),
    [cropSettings, sourceAspectRatio]
  );

  const helperText = useMemo(() => {
    if (!hasSourceFile) return 'Select a file to apply crop settings';
    if (framePreviewStatus === 'loading') return 'Extracting first frame...';
    if (framePreviewStatus === 'ready' && sourceDimensions && onCustomCropChange && !disabled) {
      return `Source ${sourceDimensions.width}x${sourceDimensions.height} - drag frame borders to adjust crop`;
    }
    if (framePreviewStatus === 'ready' && sourceDimensions) {
      return `Source ${sourceDimensions.width}x${sourceDimensions.height}`;
    }

    return 'Based on selected crop settings';
  }, [hasSourceFile, framePreviewStatus, sourceDimensions, onCustomCropChange, disabled]);

  const canEditPreview = hasSourceFile && !disabled && typeof onCustomCropChange === 'function';

  const applyRectToInputs = useCallback(
    (nextRect: EditableRect) => {
      if (!onCustomCropChange) return;

      onCustomCropChange('x', formatPercent(nextRect.x));
      onCustomCropChange('y', formatPercent(nextRect.y));
      onCustomCropChange('width', formatPercent(nextRect.width));
      onCustomCropChange('height', formatPercent(nextRect.height));
    },
    [onCustomCropChange]
  );

  const startDrag = useCallback(
    (handle: DragHandle) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (!canEditPreview || !onCustomCropChange) return;

      if (event.button !== 0) return;

      const frameElement = frameRef.current;
      if (!frameElement) return;

      const frameBounds = frameElement.getBoundingClientRect();
      if (!frameBounds.width || !frameBounds.height) return;

      event.preventDefault();
      event.stopPropagation();

      const startRect: EditableRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };

      if (cropSettings.mode !== 'custom') {
        if (!onCropModeChange) return;
        onCropModeChange('custom');
      }

      applyRectToInputs(startRect);
      setIsDraggingRect(true);

      const startX = event.clientX;
      const startY = event.clientY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dxPercent = ((moveEvent.clientX - startX) / frameBounds.width) * 100;
        const dyPercent = ((moveEvent.clientY - startY) / frameBounds.height) * 100;

        const right = startRect.x + startRect.width;
        const bottom = startRect.y + startRect.height;

        let nextX = startRect.x;
        let nextY = startRect.y;
        let nextWidth = startRect.width;
        let nextHeight = startRect.height;

        if (handle === 'move') {
          nextX = clamp(startRect.x + dxPercent, 0, 100 - startRect.width);
          nextY = clamp(startRect.y + dyPercent, 0, 100 - startRect.height);
        }

        if (handle.includes('e')) {
          nextWidth = clamp(startRect.width + dxPercent, MIN_CROP_PERCENT, 100 - nextX);
        }

        if (handle.includes('s')) {
          nextHeight = clamp(startRect.height + dyPercent, MIN_CROP_PERCENT, 100 - nextY);
        }

        if (handle.includes('w')) {
          nextX = clamp(startRect.x + dxPercent, 0, right - MIN_CROP_PERCENT);
          nextWidth = clamp(right - nextX, MIN_CROP_PERCENT, 100 - nextX);
        }

        if (handle.includes('n')) {
          nextY = clamp(startRect.y + dyPercent, 0, bottom - MIN_CROP_PERCENT);
          nextHeight = clamp(bottom - nextY, MIN_CROP_PERCENT, 100 - nextY);
        }

        applyRectToInputs({
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        });
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        setIsDraggingRect(false);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [applyRectToInputs, canEditPreview, cropSettings.mode, onCropModeChange, onCustomCropChange, rect]
  );

  const resizeHandles: Array<{
    key: DragHandle;
    cursor: string;
    style: React.CSSProperties;
  }> = useMemo(
    () => [
      { key: 'nw', cursor: 'nwse-resize', style: { top: -6, left: -6 } },
      { key: 'ne', cursor: 'nesw-resize', style: { top: -6, right: -6 } },
      { key: 'sw', cursor: 'nesw-resize', style: { bottom: -6, left: -6 } },
      { key: 'se', cursor: 'nwse-resize', style: { bottom: -6, right: -6 } },
      { key: 'n', cursor: 'ns-resize', style: { top: -6, left: '50%', transform: 'translateX(-50%)' } },
      { key: 's', cursor: 'ns-resize', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' } },
      { key: 'e', cursor: 'ew-resize', style: { right: -6, top: '50%', transform: 'translateY(-50%)' } },
      { key: 'w', cursor: 'ew-resize', style: { left: -6, top: '50%', transform: 'translateY(-50%)' } },
    ],
    []
  );

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 4,
        border: '1px solid rgba(255,140,0,0.15)',
        background: 'rgba(255,140,0,0.05)',
        height: 'fit-content',
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Typography
          variant="subtitle2"
          sx={{
            mb: 1.5,
            color: 'rgba(255,255,255,0.6)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Crop Preview
        </Typography>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid rgba(255,183,77,0.25)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <Box
            ref={frameRef}
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: `${sourceAspectRatio}`,
              borderRadius: 0,
              overflow: 'hidden',
              background: 'linear-gradient(140deg, rgba(255,140,0,0.18), rgba(13,13,13,0.9))',
            }}
            data-testid="crop-preview-frame"
          >
            {frameDataUrl && (
              <Box
                component="img"
                src={frameDataUrl}
                alt="Video first frame preview"
                data-testid="crop-preview-image"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}

            {!frameDataUrl && (
              <Typography
                variant="caption"
                data-testid="crop-preview-placeholder"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  display: 'grid',
                  placeItems: 'center',
                  px: 2,
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.62)',
                }}
              >
                {!hasSourceFile
                  ? 'Select a video to preview its first frame'
                  : framePreviewStatus === 'loading'
                    ? 'Loading first frame...'
                    : 'Unable to render first frame preview'}
              </Typography>
            )}

            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                opacity: 0.15,
                backgroundImage:
                  'repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 18px), repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 18px)',
              }}
            />

            <Box
              data-testid="crop-preview-rect"
              onMouseDown={canEditPreview ? startDrag('move') : undefined}
              sx={{
                position: 'absolute',
                left: `${rect.left}%`,
                top: `${rect.top}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
                border: '2px solid #FFB74D',
                boxShadow: '0 0 0 999px rgba(0,0,0,0.38)',
                borderRadius: 0,
                zIndex: 3,
                cursor: canEditPreview ? (isDraggingRect ? 'grabbing' : 'grab') : 'default',
              }}
            />

            {canEditPreview && (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${rect.left}%`,
                  top: `${rect.top}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                  zIndex: 4,
                  pointerEvents: 'none',
                }}
              >
                {resizeHandles.map((handle) => (
                  <Box
                    key={handle.key}
                    data-testid={`crop-preview-handle-${handle.key}`}
                    onMouseDown={startDrag(handle.key)}
                    sx={{
                      position: 'absolute',
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      border: '1px solid rgba(0,0,0,0.5)',
                      background: '#FFB74D',
                      boxShadow: '0 0 0 1px rgba(255,183,77,0.7)',
                      cursor: handle.cursor,
                      pointerEvents: 'auto',
                      ...handle.style,
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={rect.label}
            size="small"
            data-testid="crop-preview-label"
            sx={{
              color: '#FFB74D',
              border: '1px solid rgba(255,183,77,0.5)',
              background: 'rgba(255,183,77,0.12)',
              fontWeight: 600,
            }}
          />

          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
            {helperText}
          </Typography>
        </Box>

        {rect.note && (
          <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: 'rgba(255,255,255,0.45)' }}>
            {rect.note}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
