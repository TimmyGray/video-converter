'use client';

import React from 'react';
import { Box, LinearProgress, Typography, CircularProgress } from '@mui/material';
import { ConversionStatus } from '@/types';

interface ConversionProgressProps {
  status: ConversionStatus;
  progress: number;
}

export default function ConversionProgress({ status, progress }: ConversionProgressProps) {
  if (status !== 'loading' && status !== 'converting') return null;

  const isLoading = status === 'loading';

  return (
    <Box data-testid="conversion-progress" sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        {isLoading && (
          <CircularProgress
            size={18}
            sx={{ color: '#FFB74D' }}
            data-testid="loading-spinner"
          />
        )}
        <Typography variant="body2" sx={{ color: '#FFB74D', fontWeight: 600 }}>
          {isLoading ? 'Loading FFmpeg engine\u2026' : `Converting\u2026 ${progress}%`}
        </Typography>
      </Box>
      <LinearProgress
        variant={isLoading ? 'indeterminate' : 'determinate'}
        value={isLoading ? undefined : progress}
        data-testid="progress-bar"
      />
    </Box>
  );
}
