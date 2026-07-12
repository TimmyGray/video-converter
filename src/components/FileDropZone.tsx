'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import { ConversionMode } from '@/types';
import { isValidSourceFile } from '@/utils/formatUtils';

interface FileDropZoneProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  conversionMode?: ConversionMode;
}

export default function FileDropZone({
  file,
  onFileSelect,
  disabled,
  conversionMode = 'video',
}: FileDropZoneProps) {
  const acceptsAudio = conversionMode === 'transcription';
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = useCallback(
    (f: File) => {
      setError(null);
      if (!isValidSourceFile(f, conversionMode)) {
        setError(
          acceptsAudio
            ? 'Please select a valid video or audio file'
            : 'Please select a valid video file'
        );
        return;
      }
      onFileSelect(f);
    },
    [onFileSelect, conversionMode, acceptsAudio]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) processFile(droppedFile);
    },
    [disabled, processFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) processFile(selectedFile);
      e.currentTarget.value = '';
    },
    [processFile]
  );

  return (
    <Box
      data-testid="file-drop-zone"
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      sx={{
        border: `2px dashed ${isDragging ? '#FFD700' : file ? '#FF8C00' : 'rgba(255,140,0,0.3)'}`,
        borderRadius: 4,
        p: 4,
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s ease',
        background: isDragging ? 'rgba(255,215,0,0.05)' : 'rgba(255,140,0,0.03)',
        opacity: disabled ? 0.5 : 1,
        minHeight: 160,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={
          acceptsAudio
            ? 'video/*,audio/*,.mkv,.avi,.mov,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba,.wma'
            : 'video/*,.mkv,.avi,.mov'
        }
        style={{ display: 'none' }}
        onClick={(e) => {
          // Allow selecting the same file repeatedly after reset/retry.
          (e.currentTarget as HTMLInputElement).value = '';
        }}
        onChange={handleInputChange}
        data-testid="file-input"
      />

      {file ? (
        <>
          <VideoFileIcon sx={{ fontSize: 48, color: '#FF8C00' }} />
          <Typography variant="subtitle1" sx={{ color: '#FFB74D', fontWeight: 600 }}>
            {file.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,183,77,0.6)' }}>
            Click or drop to replace
          </Typography>
        </>
      ) : (
        <>
          <CloudUploadIcon
            sx={{
              fontSize: 56,
              color: isDragging ? '#FFD700' : 'rgba(255,140,0,0.6)',
              transition: 'all 0.3s ease',
            }}
          />
          <Typography variant="h6" sx={{ color: isDragging ? '#FFD700' : '#FFB74D' }}>
            {isDragging
              ? acceptsAudio
                ? 'Drop your file here!'
                : 'Drop your video here!'
              : acceptsAudio
                ? 'Drag & drop a video or audio file'
                : 'Drag & drop a video file'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            {acceptsAudio
              ? 'or click to browse — video files plus MP3, WAV, M4A, AAC, OGG, FLAC supported'
              : 'or click to browse — MP4, AVI, MOV, MKV, WEBM, GIF supported'}
          </Typography>
        </>
      )}

      {error && (
        <Typography variant="caption" sx={{ color: '#FF5252', mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
