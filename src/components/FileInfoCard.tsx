'use client';

import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ConversionStatus } from '@/types';
import { formatFileSize } from '@/utils/sizeUtils';

interface FileInfoCardProps {
  file: File | null;
  status: ConversionStatus;
  errorMessage: string | null;
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

export default function FileInfoCard({ file, status, errorMessage }: FileInfoCardProps) {
  if (!file) return null;

  const color = STATUS_COLOR[status];

  return (
    <Box
      data-testid="file-info-card"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
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
          {file.name}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.4)' }}
          data-testid="file-size"
        >
          {formatFileSize(file.size)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {status === 'done' && <CheckCircleIcon sx={{ color: '#69F0AE', fontSize: 18 }} />}
        {status === 'error' && <ErrorIcon sx={{ color: '#FF5252', fontSize: 18 }} />}
        <Chip
          label={STATUS_LABEL[status]}
          size="small"
          data-testid="status-chip"
          sx={{
            color,
            border: `1px solid ${color}`,
            background: `${color}15`,
            fontWeight: 600,
          }}
        />
      </Box>

      {errorMessage && (
        <Typography
          variant="caption"
          sx={{ color: '#FF5252', width: '100%' }}
          data-testid="error-message"
        >
          {errorMessage}
        </Typography>
      )}
    </Box>
  );
}
