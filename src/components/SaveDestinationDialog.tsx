'use client';

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { VideoFormat } from '@/types';
import { getFormatInfo } from '@/utils/formatUtils';
import { formatFileSize } from '@/utils/sizeUtils';

interface SaveDestinationDialogProps {
  open: boolean;
  onClose: () => void;
  outputUrl: string | null;
  outputFileName: string | null;
  outputFormat: VideoFormat;
  outputSizeBytes: number | null;
  conversionDurationMs: number | null;
  ffmpegMode: 'multithreaded' | 'single-threaded' | null;
  performanceNote: string | null;
}

interface WritableHandle {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveHandle {
  createWritable: (options?: { keepExistingData?: boolean }) => Promise<WritableHandle>;
  queryPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (descriptor?: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

type SavePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<SaveHandle>;

interface RuntimeWindow extends Window {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

interface NativeSaveCapability {
  available: boolean;
  reason?: string;
}

interface NativeSaveResponse {
  saved: boolean;
  cancelled?: boolean;
  error?: string;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '-';
  const totalSeconds = ms / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function ensureFileExtension(fileName: string, format: VideoFormat): string {
  const ext = `.${getFormatInfo(format).extension}`;
  if (fileName.toLowerCase().endsWith(ext.toLowerCase())) return fileName;
  return `${fileName}${ext}`;
}

async function ensureReadWritePermission(handle: SaveHandle): Promise<boolean> {
  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
    if (current === 'denied') return false;
  }

  if (typeof handle.requestPermission === 'function') {
    const requested = await handle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }

  return true;
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const runtimeWindow = window as RuntimeWindow;
  return typeof runtimeWindow.__TAURI_INTERNALS__ !== 'undefined' || typeof runtimeWindow.__TAURI__ !== 'undefined';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read converted file for desktop save.'));
    };

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file read result for desktop save.'));
        return;
      }

      const delimiterIndex = result.indexOf(',');
      resolve(delimiterIndex >= 0 ? result.slice(delimiterIndex + 1) : result);
    };

    reader.readAsDataURL(blob);
  });
}

async function saveWithDesktopNativeDialog(outputUrl: string, fileName: string): Promise<'saved' | 'cancelled'> {
  const [{ invoke }] = await Promise.all([import('@tauri-apps/api/core')]);
  const outputBlob = await fetch(outputUrl).then((response) => response.blob());
  const dataBase64 = await blobToBase64(outputBlob);

  const saved = await invoke<boolean>('save_file_with_dialog', {
    fileName,
    dataBase64,
  });

  return saved ? 'saved' : 'cancelled';
}

async function getNativeServerCapability(): Promise<NativeSaveCapability> {
  try {
    const response = await fetch('/api/native-save', {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return { available: false };
    }

    const payload = (await response.json()) as NativeSaveCapability;
    return { available: Boolean(payload.available), reason: payload.reason };
  } catch {
    return { available: false };
  }
}

async function saveWithServerNativeDialog(outputUrl: string, fileName: string): Promise<'saved' | 'cancelled'> {
  const outputBlob = await fetch(outputUrl).then((response) => response.blob());

  const formData = new FormData();
  formData.append('file', new File([outputBlob], fileName, { type: outputBlob.type || 'application/octet-stream' }));
  formData.append('fileName', fileName);

  const response = await fetch('/api/native-save', {
    method: 'POST',
    body: formData,
  });

  const payload = (await response.json()) as NativeSaveResponse;
  if (payload.saved) return 'saved';
  if (payload.cancelled) return 'cancelled';

  throw new Error(payload.error || 'Native save failed through local desktop server.');
}

export default function SaveDestinationDialog({
  open,
  onClose,
  outputUrl,
  outputFileName,
  outputFormat,
  outputSizeBytes,
  conversionDurationMs,
  ffmpegMode,
  performanceNote,
}: SaveDestinationDialogProps) {
  const [targetFileName, setTargetFileName] = useState(outputFileName ?? 'converted');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [browserPickerAvailable, setBrowserPickerAvailable] = useState(false);
  const [nativeServerAvailable, setNativeServerAvailable] = useState(false);
  const [pickerAvailable, setPickerAvailable] = useState(false);
  const [pickerReason, setPickerReason] = useState<string | null>(null);
  const tauriRuntime = isTauriRuntime();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setTargetFileName(outputFileName ?? 'converted');
    setSaveError(null);
    setBrowserPickerAvailable(false);
    setNativeServerAvailable(false);

    if (tauriRuntime) {
      setPickerAvailable(true);
      setPickerReason(null);
      return;
    }

    const maybeWindow = window as Window & { showSaveFilePicker?: SavePicker };
    const hasApi = typeof maybeWindow.showSaveFilePicker === 'function';
    const secure = window.isSecureContext;
    const topLevel = window.top === window;

    const supported = hasApi && secure && topLevel;
    setBrowserPickerAvailable(supported);
    setPickerAvailable(supported);

    if (supported) {
      setPickerReason(null);
      return;
    }

    let fallbackReason = 'Destination picker is unavailable in the current runtime. Use Browser Download instead.';

    if (!hasApi) {
      fallbackReason = 'This browser does not support the File System Access API. Use Chrome/Edge desktop, or use Browser Download.';
    } else if (!secure) {
      fallbackReason = 'Destination picker requires a secure context (https or localhost).';
    } else if (!topLevel) {
      fallbackReason = 'Destination picker is blocked in embedded contexts (some webviews/iframes). Open in a regular browser tab.';
    }

    setPickerReason(fallbackReason);

    void (async () => {
      const serverCapability = await getNativeServerCapability();
      if (cancelled) return;

      if (serverCapability.available) {
        setNativeServerAvailable(true);
        setPickerAvailable(true);
        setPickerReason(null);
        return;
      }

      if (serverCapability.reason) {
        setPickerReason(`${fallbackReason} ${serverCapability.reason}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, outputFileName, tauriRuntime]);

  const canChooseDestination = Boolean(outputUrl) && !isSaving && pickerAvailable;

  const suggestedFileName = ensureFileExtension(targetFileName || 'converted', outputFormat);

  const triggerBrowserDownload = () => {
    if (!outputUrl) return;

    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download = suggestedFileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleSaveToDestination = async () => {
    if (!outputUrl) return;

    if (tauriRuntime) {
      setIsSaving(true);
      setSaveError(null);

      try {
        const result = await saveWithDesktopNativeDialog(outputUrl, suggestedFileName);
        if (result === 'saved') {
          onClose();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Desktop native save failed.';
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    if (!browserPickerAvailable && nativeServerAvailable) {
      setIsSaving(true);
      setSaveError(null);

      try {
        const result = await saveWithServerNativeDialog(outputUrl, suggestedFileName);
        if (result === 'saved') {
          onClose();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Desktop native save through local server failed.';
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }

      return;
    }

    const maybeWindow = window as Window & { showSaveFilePicker?: SavePicker };
    if (typeof maybeWindow.showSaveFilePicker !== 'function') {
      setSaveError('Destination picker is unavailable in this browser/webview. Use Browser Download instead.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const formatInfo = getFormatInfo(outputFormat);
      // Keep picker invocation as the first async operation in this click handler.
      // Some user agents require transient activation for the picker/write flow.
      const handle = await maybeWindow.showSaveFilePicker({
        suggestedName: suggestedFileName,
        types: [
          {
            description: `${formatInfo.label} file`,
            accept: {
              [formatInfo.mimeType]: [`.${formatInfo.extension}`],
            },
          },
        ],
      });

      const granted = await ensureReadWritePermission(handle);
      if (!granted) {
        throw new DOMException('Write permission was denied for the selected destination.', 'NotAllowedError');
      }

      const outputBlob = await fetch(outputUrl).then((res) => res.blob());

      const writable = await handle.createWritable({ keepExistingData: false });
      await writable.write(outputBlob);
      await writable.close();
      onClose();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      if (err instanceof DOMException && (err.name === 'SecurityError' || err.name === 'NotAllowedError')) {
        setSaveError(
          'The current browser/webview blocked writing to the selected destination. Try Browser Download, or run in a context that supports File System Access write permissions.'
        );
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to save to selected destination.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Save Converted File</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Choose file name and destination for the converted output.
          </Typography>

          <TextField
            label="Output File Name"
            value={targetFileName}
            onChange={(event) => setTargetFileName(event.target.value)}
            fullWidth
            size="small"
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`Duration: ${formatDuration(conversionDurationMs)}`} size="small" />
            <Chip label={`Size: ${formatFileSize(outputSizeBytes ?? 0)}`} size="small" />
            <Chip
              label={`FFmpeg: ${ffmpegMode === 'multithreaded' ? 'Multi-threaded' : ffmpegMode === 'single-threaded' ? 'Single-threaded' : 'Unknown'}`}
              size="small"
            />
          </Box>

          {performanceNote && <Alert severity="info">{performanceNote}</Alert>}

          {nativeServerAvailable && !browserPickerAvailable && !tauriRuntime && (
            <Alert severity="info">Desktop native save dialog is available through the local app server.</Alert>
          )}

          {!pickerAvailable && (
            <Alert severity="warning">
              {pickerReason || 'Destination picker is not supported here. Browser Download will use default download behavior.'}
            </Alert>
          )}

          {saveError && <Alert severity="error">{saveError}</Alert>}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={() => {
            triggerBrowserDownload();
            onClose();
          }}
          variant="outlined"
          disabled={!outputUrl || isSaving}
        >
          Browser Download
        </Button>
        <Button
          onClick={handleSaveToDestination}
          variant="contained"
          disabled={!canChooseDestination}
        >
          {isSaving ? 'Saving...' : 'Choose Destination'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
