'use client';

import React from 'react';
import { Card, CardContent, Box, Button, Typography, Divider } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FileDropZone from './FileDropZone';
import FormatSelector from './FormatSelector';
import ConversionProgress from './ConversionProgress';
import FileInfoCard from './FileInfoCard';
import { useFileConverter } from '@/hooks/useFileConverter';

export default function ConverterCard() {
  const { job, selectFile, selectFormat, startConversion, reset } = useFileConverter();

  const isActive = job.status === 'loading' || job.status === 'converting';
  const isDone = job.status === 'done';

  return (
    <Card
      elevation={0}
      sx={{
        maxWidth: 680,
        mx: 'auto',
        borderRadius: 4,
        overflow: 'visible',
        position: 'relative',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Typography
          variant="h5"
          sx={{
            mb: 3,
            background: 'linear-gradient(90deg, #FF8C00, #FFD700)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 700,
          }}
        >
          Convert Your Video
        </Typography>

        <FileDropZone file={job.file} onFileSelect={selectFile} disabled={isActive} />

        <Box sx={{ mt: 3 }}>
          <FileInfoCard file={job.file} status={job.status} errorMessage={job.errorMessage} />
        </Box>

        <Divider sx={{ my: 3, borderColor: 'rgba(255,140,0,0.15)' }} />

        <FormatSelector
          selectedFormat={job.outputFormat}
          onFormatChange={selectFormat}
          disabled={isActive}
        />

        <ConversionProgress status={job.status} progress={job.progress} />

        <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!isDone && (
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<AutoFixHighIcon />}
              onClick={startConversion}
              disabled={!job.file || isActive}
              sx={{ flexGrow: 1 }}
            >
              {isActive ? 'Converting\u2026' : 'Convert'}
            </Button>
          )}

          {isDone && job.outputUrl && (
            <Button
              variant="contained"
              color="success"
              size="large"
              startIcon={<DownloadIcon />}
              component="a"
              href={job.outputUrl}
              download={job.outputFileName ?? 'output'}
              sx={{
                flexGrow: 1,
                background: 'linear-gradient(135deg, #00C853, #69F0AE)',
                boxShadow: '0 0 20px rgba(0,200,83,0.4)',
              }}
            >
              Download {job.outputFileName}
            </Button>
          )}

          <Button
            variant="outlined"
            color="secondary"
            size="large"
            startIcon={<RestartAltIcon />}
            onClick={reset}
            disabled={isActive}
          >
            Reset
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
