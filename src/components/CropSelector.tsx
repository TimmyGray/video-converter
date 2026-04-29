'use client';

import React, { useCallback } from 'react';
import { Box, Chip, TextField, Typography } from '@mui/material';
import { CropMode, CropSettings } from '@/types';

interface CropSelectorProps {
  cropSettings: CropSettings;
  onCropModeChange: (mode: CropMode) => void;
  onCustomCropChange: (field: 'width' | 'height' | 'x' | 'y', value: string) => void;
  disabled?: boolean;
}

type CustomField = 'width' | 'height' | 'x' | 'y';

interface CustomFieldMeta {
  field: CustomField;
  label: string;
  min: number;
  max: number;
  testId: string;
}

const CROP_TEMPLATES: CropMode[] = ['none', '9:16', '16:9', '4:3', '3:4', 'custom'];

const TEMPLATE_LABEL: Record<CropMode, string> = {
  none: 'Original',
  '9:16': '9:16',
  '16:9': '16:9',
  '4:3': '4:3',
  '3:4': '3:4',
  custom: 'Custom',
};

const CUSTOM_FIELDS: CustomFieldMeta[] = [
  { field: 'width', label: 'Width (%)', min: 1, max: 100, testId: 'crop-custom-width' },
  { field: 'height', label: 'Height (%)', min: 1, max: 100, testId: 'crop-custom-height' },
  { field: 'x', label: 'X (%)', min: 0, max: 100, testId: 'crop-custom-x' },
  { field: 'y', label: 'Y (%)', min: 0, max: 100, testId: 'crop-custom-y' },
];

const numericFieldSx = {
  '& .MuiInputLabel-root': {
    color: 'rgba(255,255,255,0.55)',
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: '#FFB74D',
  },
  '& .MuiOutlinedInput-root': {
    color: 'rgba(255,255,255,0.9)',
    background: 'rgba(255,255,255,0.04)',
    '& fieldset': {
      borderColor: 'rgba(255,183,77,0.35)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(255,183,77,0.6)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#FFB74D',
    },
  },
  '& input[type=number]': {
    MozAppearance: 'textfield',
  },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
};

function normalizePercentValue(field: CustomField, raw: string): string {
  if (raw === '') return '';

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return '';

  const min = field === 'width' || field === 'height' ? 1 : 0;
  const clamped = Math.max(min, Math.min(100, parsed));
  return Number(clamped.toFixed(2)).toString();
}

export default function CropSelector({
  cropSettings,
  onCropModeChange,
  onCustomCropChange,
  disabled,
}: CropSelectorProps) {
  const isCustomMode = cropSettings.mode === 'custom';
  const customInputsDisabled = Boolean(disabled) || !isCustomMode;

  const handleCustomChange = useCallback(
    (field: CustomField) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onCustomCropChange(field, normalizePercentValue(field, e.target.value));
    },
    [onCustomCropChange]
  );

  const handleScrubStart = useCallback(
    (field: CustomField, min: number, max: number) => (e: React.MouseEvent<HTMLInputElement>) => {
      if (e.button !== 0 || customInputsDisabled) return;

      const startX = e.clientX;
      const parsedStart = Number(cropSettings.custom[field]);
      const startValue = Number.isFinite(parsedStart) ? parsedStart : min;
      let lastValue = startValue;

      const originalUserSelect = document.body.style.userSelect;
      const originalCursor = document.body.style.cursor;

      const cleanup = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = originalUserSelect;
        document.body.style.cursor = originalCursor;
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const sensitivity = field === 'x' || field === 'y' ? 3 : 4;
        const nextValue = Math.max(min, Math.min(max, startValue + Math.trunc(deltaX / sensitivity)));

        if (nextValue === lastValue) return;
        lastValue = nextValue;
        onCustomCropChange(field, String(nextValue));
      };

      const onMouseUp = () => {
        cleanup();
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [cropSettings.custom, customInputsDisabled, onCustomCropChange]
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography
        variant="subtitle2"
        sx={{
          mb: 1.5,
          color: 'rgba(255,255,255,0.6)',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Crop Ratio
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {CROP_TEMPLATES.map((template) => {
          const isSelected = cropSettings.mode === template;
          return (
            <Chip
              key={template}
              label={TEMPLATE_LABEL[template]}
              onClick={() => !disabled && onCropModeChange(template)}
              disabled={disabled}
              data-testid={`crop-template-${template.replace(':', '-')}`}
              sx={{
                fontWeight: 700,
                fontSize: '0.85rem',
                px: 1,
                border: `2px solid ${isSelected ? '#FFB74D' : 'transparent'}`,
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(255,183,77,0.25), rgba(255,183,77,0.12))'
                  : 'rgba(255,255,255,0.05)',
                color: isSelected ? '#FFB74D' : 'rgba(255,255,255,0.6)',
                transition: 'all 0.2s ease',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            />
          );
        })}
      </Box>

      <Box
        data-testid="crop-custom-grid"
        sx={{
          mt: 2,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, minmax(0, 1fr))' },
          opacity: isCustomMode ? 1 : 0.55,
          transition: 'opacity 0.2s ease',
        }}
      >
        {CUSTOM_FIELDS.map(({ field, label, min, max, testId }) => (
          <TextField
            key={field}
            label={label}
            size="small"
            type="number"
            value={cropSettings.custom[field]}
            onChange={handleCustomChange(field)}
            disabled={customInputsDisabled}
            slotProps={{
              htmlInput: {
                min,
                max,
                step: 0.1,
                onMouseDown: handleScrubStart(field, min, max),
                style: { cursor: customInputsDisabled ? 'not-allowed' : 'ew-resize' },
              },
            }}
            sx={numericFieldSx}
            data-testid={testId}
          />
        ))}
      </Box>

      <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'rgba(255,255,255,0.45)' }}>
        {isCustomMode
          ? 'Tip: drag left or right to scrub percentages. Values are relative to original frame size.'
          : 'Select Custom to edit percentage-based crop values.'}
      </Typography>
    </Box>
  );
}
