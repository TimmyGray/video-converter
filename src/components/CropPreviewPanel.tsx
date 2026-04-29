'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { CropSettings } from '@/types';

interface CropPreviewPanelProps {
  cropSettings: CropSettings;
  file?: File | null;
  hasFile?: boolean;
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

export default function CropPreviewPanel({ cropSettings, file, hasFile }: CropPreviewPanelProps) {
  const hasSourceFile = Boolean(file) || Boolean(hasFile);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(16 / 9);
  const [sourceDimensions, setSourceDimensions] = useState<SourceDimensions | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [framePreviewStatus, setFramePreviewStatus] = useState<FramePreviewStatus>('idle');

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
    if (framePreviewStatus === 'ready' && sourceDimensions) {
      return `Source ${sourceDimensions.width}x${sourceDimensions.height}`;
    }

    return 'Based on selected crop settings';
  }, [hasSourceFile, framePreviewStatus, sourceDimensions]);

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
              }}
            />
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
