'use client';

import React from 'react';
import { Card, CardContent, Box, Button, Typography, Divider } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import FileDropZone from './FileDropZone';
import FormatSelector from './FormatSelector';
import CropSelector from './CropSelector';
import CropPreviewPanel from './CropPreviewPanel';
import ConversionProgress from './ConversionProgress';
import FileInfoCard from './FileInfoCard';
import { useFileConverter } from '@/hooks/useFileConverter';

export default function ConverterCard() {
  const {
    job,
    selectFile,
    selectFormat,
    selectCropMode,
    updateCustomCrop,
    startConversion,
    reset,
  } = useFileConverter();

  const isActive = job.status === 'loading' || job.status === 'converting';
  const isDone = job.status === 'done';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 260px' },
        gap: { xs: 2.5, lg: 3 },
        alignItems: 'start',
      }}
    >
      <Card
        elevation={0}
        sx={{
          borderRadius: 4,
          overflow: 'visible',
          position: 'relative',
          maxWidth: 'none',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              minHeight: { xs: 40, sm: 44 },
              mb: 2.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <VideoLibraryIcon
                sx={{
                  color: '#FF8C00',
                  fontSize: { xs: 24, sm: 28 },
                  filter: 'drop-shadow(0 0 8px rgba(255,140,0,0.55))',
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  background: 'linear-gradient(90deg, #FF8C00, #FFD700)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.35px',
                }}
              >
                VideoForge
              </Typography>
            </Box>

            <Typography
              variant="h4"
              component="h1"
              sx={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #FF8C00 0%, #FFD700 50%, #FF8C00 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: { xs: '1.2rem', sm: '1.7rem', md: '2rem' },
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              Convert Any Video
            </Typography>
          </Box>

          <FileDropZone file={job.file} onFileSelect={selectFile} disabled={isActive} />

          <Box sx={{ mt: 3 }}>
            <FileInfoCard
              file={job.file}
              status={job.status}
              errorMessage={job.errorMessage}
              cropSettings={job.cropSettings}
            />
          </Box>

          <Divider sx={{ my: 3, borderColor: 'rgba(255,140,0,0.15)' }} />

          <FormatSelector
            selectedFormat={job.outputFormat}
            onFormatChange={selectFormat}
            disabled={isActive}
          />

          <CropSelector
            cropSettings={job.cropSettings}
            onCropModeChange={selectCropMode}
            onCustomCropChange={updateCustomCrop}
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

      <CropPreviewPanel cropSettings={job.cropSettings} hasFile={Boolean(job.file)} />
    </Box>
  );
}
