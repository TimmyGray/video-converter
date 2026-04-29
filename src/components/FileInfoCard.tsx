'use client';

import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ConversionStatus, CropSettings } from '@/types';
import { formatFileSize } from '@/utils/sizeUtils';

interface FileInfoCardProps {
  file: File | null;
  status: ConversionStatus;
  errorMessage: string | null;
  cropSettings: CropSettings;
}

const STATUS_COLOR: Record<ConversionStatus, string> = {
  idle: 'rgba(255,255,255,0.4)',
  loading: '#FFB74D',
  converting: '#FFD700',
  done: '#69F0AE',
  error: '#FF5252',
};

const STATUS_LABEL: Record<ConversionStatus, string> = {
  idle: 'Ready',
  loading: 'Loading\u2026',
  converting: 'Converting\u2026',
  done: 'Complete',
  error: 'Error',
};

function getCropPreviewLabel(cropSettings: CropSettings): string {
  if (cropSettings.mode === 'none') return 'Crop: Original';
  if (cropSettings.mode !== 'custom') return `Crop: ${cropSettings.mode}`;

  const { width, height, x, y } = cropSettings.custom;
  if (!width || !height) return 'Crop: Custom';
  return `Crop: ${width}%×${height}% @ ${x || '0'}%,${y || '0'}%`;
}

export default function FileInfoCard({ file, status, errorMessage, cropSettings }: FileInfoCardProps) {
  const hasFile = Boolean(file);

  const color = STATUS_COLOR[status];
  const statusLabel = hasFile ? STATUS_LABEL[status] : 'Waiting';

  return (
    <Box
      data-testid="file-info-card"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        minHeight: 84,
        borderRadius: 3,
        background: 'rgba(255,140,0,0.05)',
        border: '1px solid rgba(255,140,0,0.15)',
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: '#FFB74D',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          data-testid="file-name"
        >
          {file ? file.name : 'No file selected yet'}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.4)' }}
          data-testid="file-size"
        >
          {file ? formatFileSize(file.size) : 'Select a video to start conversion'}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {hasFile && status === 'done' && <CheckCircleIcon sx={{ color: '#69F0AE', fontSize: 18 }} />}
        {hasFile && status === 'error' && <ErrorIcon sx={{ color: '#FF5252', fontSize: 18 }} />}
        <Chip
          label={statusLabel}
          size="small"
          data-testid="status-chip"
          sx={{
            color,
            border: `1px solid ${color}`,
            background: `${color}15`,
            fontWeight: 600,
          }}
        />
        <Chip
          label={getCropPreviewLabel(cropSettings)}
          size="small"
          data-testid="crop-preview-chip"
          sx={{
            color: '#FFB74D',
            border: '1px solid rgba(255,183,77,0.5)',
            background: 'rgba(255,183,77,0.12)',
            fontWeight: 600,
            maxWidth: '100%',
          }}
        />
      </Box>

      {hasFile && status === 'error' && (
        <Typography
          variant="caption"
          sx={{ color: '#FF5252', width: '100%' }}
          data-testid="error-message"
        >
          {errorMessage || 'An unexpected error occurred. Please try a different file or format.'}
        </Typography>
      )}
    </Box>
  );
}
