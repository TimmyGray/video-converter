'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Box,
  Button,
  Typography,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  TextField,
  Link,
} from '@mui/material';
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
import SaveDestinationDialog from './SaveDestinationDialog';
import TranscriptPanel from './TranscriptPanel';
import { useFileConverter } from '@/hooks/useFileConverter';
import { getSupportedFormats, isValidSourceFile } from '@/utils/formatUtils';
import { getHfToken, setHfToken } from '@/utils/hfToken';

const TRANSCRIPTION_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'italian', label: 'Italian' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'russian', label: 'Russian' },
  { value: 'ukrainian', label: 'Ukrainian' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'korean', label: 'Korean' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'hindi', label: 'Hindi' },
];

const AUTO_DETECT_LANGUAGE = 'auto';

export default function ConverterCard() {
  const {
    job,
    selectFile,
    selectConversionMode,
    selectFormat,
    selectCropMode,
    updateCustomCrop,
    selectTranscriptionLanguage,
    setTranscriptionTranslate,
    startConversion,
    reset,
  } = useFileConverter();

  const isActive = job.status === 'loading' || job.status === 'converting';
  const isDone = job.status === 'done';
  const isAudioExtractionMode = job.conversionMode === 'audio-extraction';
  const isTranscriptionMode = job.conversionMode === 'transcription';
  const isVideoMode = job.conversionMode === 'video';
  const formatOptions = getSupportedFormats(job.conversionMode);
  const hasValidSource = job.file !== null && isValidSourceFile(job.file, job.conversionMode);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  // HF token lives in localStorage. ConverterCard is client-only (dynamic ssr:false), so a lazy
  // initializer reads it safely with no hydration mismatch.
  const [hfToken, setHfTokenState] = useState(() => getHfToken());
  const handleHfTokenChange = (value: string) => {
    setHfTokenState(value);
    setHfToken(value);
  };

  const modeLabel = isTranscriptionMode
    ? 'Transcription Mode'
    : isAudioExtractionMode
      ? 'Audio Extraction Mode'
      : 'Video Conversion Mode';
  const modeAccentColor = isTranscriptionMode ? '#4FC3F7' : isAudioExtractionMode ? '#64DD17' : '#FFB74D';
  const convertLabel = isTranscriptionMode
    ? isActive
      ? 'Transcribing…'
      : 'Transcribe'
    : isActive
      ? 'Converting…'
      : 'Convert';

  const handleReset = () => {
    setIsSaveDialogOpen(false);
    reset();
  };

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
              position: { xs: 'static', sm: 'relative' },
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: { xs: 0.75, sm: 0 },
              minHeight: { xs: 'auto', sm: 44 },
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
                position: { xs: 'static', sm: 'absolute' },
                left: { sm: '50%' },
                transform: { sm: 'translateX(-50%)' },
                alignSelf: { xs: 'center', sm: 'auto' },
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

          <FileDropZone
            file={job.file}
            onFileSelect={selectFile}
            disabled={isActive}
            conversionMode={job.conversionMode}
          />

          <Box sx={{ mt: 3 }}>
            <FileInfoCard
              file={job.file}
              status={job.status}
              errorMessage={job.errorMessage}
              cropSettings={job.cropSettings}
              outputSizeBytes={job.outputSizeBytes}
              conversionDurationMs={job.conversionDurationMs}
              ffmpegMode={job.ffmpegMode}
              performanceNote={job.performanceNote}
            />
          </Box>

          <Divider sx={{ my: 3, borderColor: 'rgba(255,140,0,0.15)' }} />

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1.25,
              mb: 2.5,
            }}
          >
            <ToggleButtonGroup
              size="small"
              exclusive
              disabled={isActive}
              value={job.conversionMode}
              onChange={(_, mode) => {
                if (mode) {
                  selectConversionMode(mode);
                }
              }}
              aria-label="conversion mode"
              data-testid="conversion-mode-toggle"
              sx={{
                '& .MuiToggleButton-root': {
                  color: 'rgba(255,255,255,0.7)',
                  borderColor: 'rgba(255,183,77,0.45)',
                  textTransform: 'none',
                  fontWeight: 700,
                },
                '& .Mui-selected': {
                  color: '#1A1200',
                  background: 'linear-gradient(135deg, #FFD54F 0%, #FFB74D 100%)',
                },
              }}
            >
              <ToggleButton value="video">Video Conversion</ToggleButton>
              <ToggleButton value="audio-extraction">Audio Extraction Mode</ToggleButton>
              <ToggleButton value="transcription">Transcription</ToggleButton>
            </ToggleButtonGroup>

            <Chip
              data-testid="conversion-mode-chip"
              label={modeLabel}
              size="small"
              sx={{
                fontWeight: 700,
                color: modeAccentColor,
                border: `1px solid ${modeAccentColor}`,
                background: `${modeAccentColor}1F`,
              }}
            />
          </Box>

          <FormatSelector
            selectedFormat={job.outputFormat}
            onFormatChange={selectFormat}
            formats={formatOptions}
            disabled={isActive}
          />

          {isTranscriptionMode && (
            <Box
              data-testid="transcription-options"
              sx={{ mt: 2.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}
            >
              <FormControl size="small" sx={{ minWidth: 180 }} disabled={isActive}>
                <InputLabel id="transcription-language-label">Spoken language</InputLabel>
                <Select
                  labelId="transcription-language-label"
                  label="Spoken language"
                  value={job.transcriptionLanguage ?? AUTO_DETECT_LANGUAGE}
                  onChange={(event) => {
                    const value = event.target.value;
                    selectTranscriptionLanguage(value === AUTO_DETECT_LANGUAGE ? null : value);
                  }}
                  data-testid="transcription-language-select"
                >
                  <MenuItem value={AUTO_DETECT_LANGUAGE}>Auto-detect</MenuItem>
                  {TRANSCRIPTION_LANGUAGES.map((language) => (
                    <MenuItem key={language.value} value={language.value}>
                      {language.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={job.transcriptionTranslate}
                    onChange={(event) => setTranscriptionTranslate(event.target.checked)}
                    disabled={isActive}
                    data-testid="transcription-translate-checkbox"
                  />
                }
                label="Translate to English"
              />

              <TextField
                type="password"
                size="small"
                label="Hugging Face token (optional)"
                placeholder="hf_…"
                value={hfToken}
                onChange={(event) => handleHfTokenChange(event.target.value)}
                disabled={isActive}
                data-testid="hf-token-input"
                sx={{ flexBasis: '100%' }}
                helperText={
                  <>
                    With a{' '}
                    <Link
                      href="https://huggingface.co/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: '#4FC3F7' }}
                    >
                      token
                    </Link>
                    , transcription runs on Hugging Face&rsquo;s hosted whisper-large-v3 for higher
                    accuracy — this uploads your audio to Hugging Face. Leave blank to keep everything
                    on-device. Falls back to on-device automatically if the hosted call fails.
                  </>
                }
              />
            </Box>
          )}

          {isVideoMode && (
            <CropSelector
              cropSettings={job.cropSettings}
              onCropModeChange={selectCropMode}
              onCustomCropChange={updateCustomCrop}
              disabled={isActive}
            />
          )}

          <ConversionProgress status={job.status} progress={job.progress} />

          {isTranscriptionMode && (
            <TranscriptPanel text={job.transcriptText} streaming={job.status === 'converting'} />
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {!isDone && (
              <Button
                variant="contained"
                color="primary"
                size="large"
                startIcon={<AutoFixHighIcon />}
                onClick={startConversion}
                disabled={!hasValidSource || isActive}
                sx={{ flexGrow: 1 }}
              >
                {convertLabel}
              </Button>
            )}

            {isDone && job.outputUrl && (
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<DownloadIcon />}
                onClick={() => setIsSaveDialogOpen(true)}
                sx={{
                  flexGrow: 1,
                  background: 'linear-gradient(135deg, #00C853, #69F0AE)',
                  boxShadow: '0 0 20px rgba(0,200,83,0.4)',
                }}
              >
                Save {job.outputFileName}
              </Button>
            )}

            <Button
              variant="outlined"
              color="secondary"
              size="large"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
              disabled={isActive}
            >
              Reset
            </Button>
          </Box>
        </CardContent>
      </Card>

      {isVideoMode && (
        <CropPreviewPanel
          cropSettings={job.cropSettings}
          file={job.file}
          onCropModeChange={selectCropMode}
          onCustomCropChange={updateCustomCrop}
          disabled={isActive}
        />
      )}

      <SaveDestinationDialog
        open={isSaveDialogOpen}
        onClose={() => setIsSaveDialogOpen(false)}
        outputUrl={job.outputUrl}
        outputFileName={job.outputFileName}
        outputFormat={job.outputFormat}
        outputSizeBytes={job.outputSizeBytes}
        conversionDurationMs={job.conversionDurationMs}
        ffmpegMode={job.ffmpegMode}
        performanceNote={job.performanceNote}
      />
    </Box>
  );
}
