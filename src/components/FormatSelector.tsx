'use client';

import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { VideoFormat } from '@/types';
import { FORMAT_INFO, getSupportedFormats } from '@/utils/formatUtils';

interface FormatSelectorProps {
  selectedFormat: VideoFormat;
  onFormatChange: (format: VideoFormat) => void;
  disabled?: boolean;
}

export default function FormatSelector({
  selectedFormat,
  onFormatChange,
  disabled,
}: FormatSelectorProps) {
  const formats = getSupportedFormats();

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 1.5,
          color: 'rgba(255,255,255,0.6)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Output Format
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {formats.map((fmt) => {
          const info = FORMAT_INFO[fmt];
          const isSelected = fmt === selectedFormat;
          return (
            <Chip
              key={fmt}
              label={info.label}
              onClick={() => !disabled && onFormatChange(fmt)}
              disabled={disabled}
              data-testid={`format-chip-${fmt}`}
              sx={{
                fontWeight: 700,
                fontSize: '0.85rem',
                px: 1,
                border: `2px solid ${isSelected ? info.color : 'transparent'}`,
                background: isSelected
                  ? `linear-gradient(135deg, ${info.color}30, ${info.color}15)`
                  : 'rgba(255,255,255,0.05)',
                color: isSelected ? info.color : 'rgba(255,255,255,0.6)',
                transition: 'all 0.2s ease',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
