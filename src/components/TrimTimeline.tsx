'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { TrimRange } from '@/types';
import { formatClock } from '@/utils/formatUtils';

interface TrimTimelineProps {
  file: File | null;
  /** The cut currently applied to the job, or null for the whole file. */
  appliedRange: TrimRange | null;
  onApply: (range: TrimRange | null) => void;
  disabled?: boolean;
}

type HandleId = 'start' | 'end';

/** Smallest selectable region, so the cut never collapses to nothing. */
export const MIN_TRIM_SECONDS = 0.5;
const KEY_STEP_SECONDS = 1;
const KEY_STEP_LARGE_SECONDS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Moves one handle to `value`, keeping both inside [0, duration] and at least MIN apart. */
export function moveHandle(
  range: TrimRange,
  handle: HandleId,
  value: number,
  duration: number
): TrimRange {
  const minGap = Math.min(MIN_TRIM_SECONDS, duration);
  if (handle === 'start') {
    return { start: roundMs(clamp(value, 0, range.end - minGap)), end: range.end };
  }
  return { start: range.start, end: roundMs(clamp(value, range.start + minGap, duration)) };
}

export default function TrimTimeline({ file, appliedRange, onApply, disabled }: TrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [range, setRange] = useState<TrimRange>({ start: 0, end: 0 });
  const [dragging, setDragging] = useState<HandleId | null>(null);

  // Read the media duration from metadata whenever the source file changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDuration(null);
    if (!file) return;

    let disposed = false;
    const objectUrl = URL.createObjectURL(file);
    const media = document.createElement('video');
    media.preload = 'metadata';

    const onMetadata = () => {
      if (disposed || !Number.isFinite(media.duration) || media.duration <= 0) return;
      setDuration(media.duration);
      setRange({ start: 0, end: roundMs(media.duration) });
    };

    media.addEventListener('loadedmetadata', onMetadata);
    media.src = objectUrl;

    return () => {
      disposed = true;
      media.removeEventListener('loadedmetadata', onMetadata);
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Follow the applied cut when it changes from outside (e.g. Reset, new file).
  useEffect(() => {
    if (duration === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange(appliedRange ?? { start: 0, end: roundMs(duration) });
  }, [appliedRange, duration]);

  const timeFromPointer = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration === null) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return clamp((clientX - rect.left) / rect.width, 0, 1) * duration;
    },
    [duration]
  );

  if (!file || duration === null) return null;

  const startPercent = (range.start / duration) * 100;
  const endPercent = (range.end / duration) * 100;
  const isFullRange = range.start <= 0 && range.end >= roundMs(duration);
  const isApplied =
    appliedRange !== null && appliedRange.start === range.start && appliedRange.end === range.end;
  const canCut = !disabled && !isFullRange && !isApplied;

  const updateHandle = (handle: HandleId, value: number) =>
    setRange((prev) => moveHandle(prev, handle, value, duration));

  const handlePointerDown = (handle: HandleId) => (event: React.PointerEvent<HTMLElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(handle);
  };

  const handlePointerMove = (handle: HandleId) => (event: React.PointerEvent<HTMLElement>) => {
    if (dragging !== handle) return;
    updateHandle(handle, timeFromPointer(event.clientX));
  };

  const handlePointerUp = () => setDragging(null);

  const handleKeyDown = (handle: HandleId) => (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? KEY_STEP_LARGE_SECONDS : KEY_STEP_SECONDS;
    const current = handle === 'start' ? range.start : range.end;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = duration;
    if (next === null) return;
    event.preventDefault();
    updateHandle(handle, next);
  };

  const renderHandle = (handle: HandleId) => {
    const isStart = handle === 'start';
    const value = isStart ? range.start : range.end;
    return (
      <Box
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={isStart ? 'Cut start' : 'Cut end'}
        aria-valuemin={isStart ? 0 : range.start + MIN_TRIM_SECONDS}
        aria-valuemax={isStart ? range.end - MIN_TRIM_SECONDS : duration}
        aria-valuenow={value}
        aria-valuetext={formatClock(value, true)}
        aria-disabled={disabled || undefined}
        data-testid={`trim-handle-${handle}`}
        onPointerDown={handlePointerDown(handle)}
        onPointerMove={handlePointerMove(handle)}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown(handle)}
        sx={{
          position: 'absolute',
          top: '50%',
          left: `${isStart ? startPercent : endPercent}%`,
          width: 18,
          height: 18,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          background: isStart ? '#000' : '#FF8C00',
          border: `2px solid ${isStart ? '#FF8C00' : '#000'}`,
          boxShadow: '0 0 0 2px rgba(255,255,255,0.35)',
          cursor: disabled ? 'not-allowed' : 'grab',
          touchAction: 'none',
          zIndex: dragging === handle ? 3 : 2,
          '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 },
          '&:active': { cursor: disabled ? 'not-allowed' : 'grabbing' },
        }}
      />
    );
  };

  return (
    <Card
      elevation={0}
      data-testid="trim-timeline"
      sx={{
        borderRadius: 4,
        border: '1px solid rgba(255,140,0,0.15)',
        background: 'rgba(255,140,0,0.05)',
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}
          >
            Cut
          </Typography>
          {appliedRange && (
            <Chip
              size="small"
              label={`Applied ${formatClock(appliedRange.start, true)} – ${formatClock(appliedRange.end, true)}`}
              data-testid="trim-applied-chip"
              sx={{
                color: '#FFB74D',
                border: '1px solid rgba(255,183,77,0.5)',
                background: 'rgba(255,183,77,0.12)',
                fontWeight: 600,
              }}
            />
          )}
        </Box>

        <Box sx={{ px: '9px' }}>
          <Box ref={trackRef} sx={{ position: 'relative', height: 28 }}>
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 6,
                transform: 'translateY(-50%)',
                borderRadius: 3,
                background: 'rgba(255,255,255,0.18)',
              }}
            />
            <Box
              data-testid="trim-selection"
              sx={{
                position: 'absolute',
                top: '50%',
                left: `${startPercent}%`,
                width: `${Math.max(endPercent - startPercent, 0)}%`,
                height: 6,
                transform: 'translateY(-50%)',
                borderRadius: 3,
                background: 'linear-gradient(90deg, #FF8C00, #FFB74D)',
              }}
            />
            {renderHandle('start')}
            {renderHandle('end')}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" data-testid="trim-start-label" sx={{ color: 'rgba(255,255,255,0.8)' }}>
            Start {formatClock(range.start, true)}
          </Typography>
          <Typography variant="caption" data-testid="trim-length-label" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Length {formatClock(range.end - range.start, true)} of {formatClock(duration, true)}
          </Typography>
          <Typography variant="caption" data-testid="trim-end-label" sx={{ color: 'rgba(255,255,255,0.8)' }}>
            End {formatClock(range.end, true)}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<ContentCutIcon />}
            disabled={!canCut}
            onClick={() => onApply(range)}
            data-testid="trim-cut-button"
          >
            Cut
          </Button>
          {appliedRange && (
            <Button
              variant="outlined"
              color="secondary"
              disabled={disabled}
              onClick={() => onApply(null)}
              data-testid="trim-reset-button"
            >
              Reset cut
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
