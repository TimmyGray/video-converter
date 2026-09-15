'use client';

import React, { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface TranscriptPanelProps {
  text: string | null;
  streaming?: boolean;
}

export default function TranscriptPanel({ text, streaming }: TranscriptPanelProps) {
  const [copied, setCopied] = useState(false);

  if (!text) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable (insecure context / permissions); ignore.
    }
  };

  return (
    <Box sx={{ mt: 3 }} data-testid="transcript-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Transcript
          </Typography>
          {streaming && (
            <Typography
              variant="caption"
              data-testid="transcript-streaming-indicator"
              sx={{
                color: '#4FC3F7',
                fontWeight: 700,
                animation: 'transcript-pulse 1.2s ease-in-out infinite',
                '@keyframes transcript-pulse': {
                  '0%, 100%': { opacity: 0.35 },
                  '50%': { opacity: 1 },
                },
              }}
            >
              ● Transcribing…
            </Typography>
          )}
        </Box>
        <Button
          size="small"
          onClick={handleCopy}
          startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
          data-testid="copy-transcript-button"
          sx={{ color: copied ? '#64DD17' : '#4FC3F7', textTransform: 'none', fontWeight: 700 }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Box>
      <Box
        component="pre"
        data-testid="transcript-text"
        sx={{
          m: 0,
          p: 2,
          maxHeight: 260,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'inherit',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.9)',
          borderRadius: 2,
          border: '1px solid rgba(79,195,247,0.35)',
          background: 'rgba(79,195,247,0.06)',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}
