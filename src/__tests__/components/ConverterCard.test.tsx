import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ConverterCard from '@/components/ConverterCard';
import { ConversionJob } from '@/types';

const mockUseFileConverter = jest.fn();

const mockSelectFile = jest.fn();
const mockSelectFormat = jest.fn();
const mockSelectCropMode = jest.fn();
const mockUpdateCustomCrop = jest.fn();
const mockSelectConversionMode = jest.fn();
const mockSelectTranscriptionLanguage = jest.fn();
const mockSetTranscriptionTranslate = jest.fn();
const mockStartConversion = jest.fn();
const mockReset = jest.fn();

jest.mock('@/hooks/useFileConverter', () => ({
  useFileConverter: () => mockUseFileConverter(),
}));

jest.mock('@/components/FileDropZone', () =>
  function FileDropZoneMock() {
    return <div data-testid="file-drop-zone-mock" />;
  }
);

jest.mock('@/components/FormatSelector', () =>
  function FormatSelectorMock({ formats }: { formats?: string[] }) {
    return <div data-testid="format-selector-mock">{(formats ?? []).join(',')}</div>;
  }
);

jest.mock('@/components/CropSelector', () =>
  function CropSelectorMock() {
    return <div data-testid="crop-selector-mock" />;
  }
);

jest.mock('@/components/CropPreviewPanel', () =>
  function CropPreviewPanelMock() {
    return <div data-testid="crop-preview-panel-mock" />;
  }
);

jest.mock('@/components/ConversionProgress', () =>
  function ConversionProgressMock() {
    return <div data-testid="conversion-progress-mock" />;
  }
);

jest.mock('@/components/FileInfoCard', () =>
  function FileInfoCardMock() {
    return <div data-testid="file-info-card-mock" />;
  }
);

jest.mock('@/components/SaveDestinationDialog', () =>
  function SaveDestinationDialogMock() {
    return <div data-testid="save-destination-dialog-mock" />;
  }
);

function createJob(overrides: Partial<ConversionJob> = {}): ConversionJob {
  return {
    file: null,
    conversionMode: 'video',
    outputFormat: 'mp4',
    cropSettings: {
      mode: 'none',
      custom: {
        width: '',
        height: '',
        x: '0',
        y: '0',
      },
    },
    status: 'idle',
    progress: 0,
    outputUrl: null,
    outputFileName: null,
    outputSizeBytes: null,
    conversionDurationMs: null,
    ffmpegMode: null,
    performanceNote: null,
    errorMessage: null,
    transcriptionLanguage: null,
    transcriptionTranslate: false,
    transcriptText: null,
    transcriptChunks: null,
    hostedTranscriptionNotice: null,
    polishNotice: null,
    ...overrides,
  };
}

function mockConverterState(job: ConversionJob) {
  mockUseFileConverter.mockReturnValue({
    job,
    isFFmpegLoaded: true,
    isFFmpegLoading: false,
    ffmpegLoadError: null,
    selectFile: mockSelectFile,
    selectFormat: mockSelectFormat,
    selectCropMode: mockSelectCropMode,
    updateCustomCrop: mockUpdateCustomCrop,
    selectConversionMode: mockSelectConversionMode,
    selectTranscriptionLanguage: mockSelectTranscriptionLanguage,
    setTranscriptionTranslate: mockSetTranscriptionTranslate,
    startConversion: mockStartConversion,
    reset: mockReset,
  });
}

describe('ConverterCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders mode controls and dispatches audio mode changes', () => {
    mockConverterState(createJob());

    render(<ConverterCard />);

    const audioModeControl = screen.getByRole('button', {
      name: /audio extraction mode/i,
    });

    fireEvent.click(audioModeControl);

    expect(mockSelectConversionMode).toHaveBeenCalledWith('audio-extraction');
  });

  it('disables conversion mode controls while conversion is active', () => {
    mockConverterState(
      createJob({
        status: 'converting',
      })
    );

    render(<ConverterCard />);

    const audioModeControl = screen.getByRole('button', {
      name: /audio extraction mode/i,
    });

    expect(audioModeControl).toBeDisabled();

    fireEvent.click(audioModeControl);

    expect(mockSelectConversionMode).not.toHaveBeenCalled();
  });

  it('shows MP3-only format options and hides crop controls in audio mode', () => {
    mockConverterState(
      createJob({
        conversionMode: 'audio-extraction',
        outputFormat: 'mp3',
      })
    );

    render(<ConverterCard />);

    expect(screen.getByTestId('conversion-mode-chip')).toHaveTextContent('Audio Extraction Mode');
    expect(screen.getByTestId('format-selector-mock')).toHaveTextContent('mp3');
    expect(screen.queryByTestId('crop-selector-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('crop-preview-panel-mock')).not.toBeInTheDocument();
  });

  it('keeps convert disabled until a valid source video is selected', () => {
    const invalidSource = new File(['doc'], 'notes.pdf', { type: 'application/pdf' });

    mockConverterState(
      createJob({
        conversionMode: 'audio-extraction',
        outputFormat: 'mp3',
        file: invalidSource,
      })
    );

    render(<ConverterCard />);

    expect(screen.getByRole('button', { name: /^convert$/i })).toBeDisabled();
  });

  // Regression (Story 1.5): audio-mode constraints must not leak into video mode.
  describe('video mode regression safety', () => {
    it('offers all six non-audio formats and keeps crop controls in video mode', () => {
      mockConverterState(createJob({ conversionMode: 'video', outputFormat: 'mp4' }));

      render(<ConverterCard />);

      expect(screen.getByTestId('conversion-mode-chip')).toHaveTextContent('Video Conversion Mode');

      const formatSelector = screen.getByTestId('format-selector-mock');
      ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'].forEach((fmt) => {
        expect(formatSelector).toHaveTextContent(fmt);
      });
      expect(formatSelector).not.toHaveTextContent('mp3');

      // Crop is a video-only capability and must remain available in video mode.
      expect(screen.getByTestId('crop-selector-mock')).toBeInTheDocument();
      expect(screen.getByTestId('crop-preview-panel-mock')).toBeInTheDocument();
    });

    it('enables convert for a valid source video in video mode', () => {
      const validSource = new File(['data'], 'holiday.mp4', { type: 'video/mp4' });

      mockConverterState(
        createJob({ conversionMode: 'video', outputFormat: 'mp4', file: validSource })
      );

      render(<ConverterCard />);

      expect(screen.getByRole('button', { name: /^convert$/i })).toBeEnabled();
    });
  });

  describe('transcription mode', () => {
    it('dispatches a transcription mode change from the toggle', () => {
      mockConverterState(createJob());

      render(<ConverterCard />);

      fireEvent.click(screen.getByRole('button', { name: /^transcription$/i }));

      expect(mockSelectConversionMode).toHaveBeenCalledWith('transcription');
    });

    it('shows transcript format options + language/translate controls and hides crop', () => {
      mockConverterState(createJob({ conversionMode: 'transcription', outputFormat: 'txt' }));

      render(<ConverterCard />);

      expect(screen.getByTestId('conversion-mode-chip')).toHaveTextContent('Transcription Mode');

      const formatSelector = screen.getByTestId('format-selector-mock');
      ['txt', 'srt', 'vtt'].forEach((fmt) => expect(formatSelector).toHaveTextContent(fmt));

      expect(screen.getByTestId('transcription-options')).toBeInTheDocument();
      expect(screen.getByTestId('transcription-translate-checkbox')).toBeInTheDocument();
      expect(screen.queryByTestId('crop-selector-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('crop-preview-panel-mock')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^transcribe$/i })).toBeInTheDocument();
    });

    it('dispatches the translate flag when the checkbox is toggled', () => {
      mockConverterState(createJob({ conversionMode: 'transcription', outputFormat: 'txt' }));

      render(<ConverterCard />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(mockSetTranscriptionTranslate).toHaveBeenCalledWith(true);
    });

    it('renders the transcript text and copy control once a transcript exists', () => {
      mockConverterState(
        createJob({
          conversionMode: 'transcription',
          outputFormat: 'txt',
          status: 'done',
          transcriptText: 'Hello there, world.',
          outputUrl: 'blob:transcript',
          outputFileName: 'clip.txt',
        })
      );

      render(<ConverterCard />);

      expect(screen.getByTestId('transcript-panel')).toBeInTheDocument();
      expect(screen.getByTestId('transcript-text')).toHaveTextContent('Hello there, world.');
      expect(screen.getByTestId('copy-transcript-button')).toBeInTheDocument();
    });

    // AC4: the notice informs without interrupting — it renders alongside a still-running job
    // and never replaces the progress, transcript, or action controls.
    it('renders the hosted-transcription notice while transcription is still running', () => {
      mockConverterState(
        createJob({
          conversionMode: 'transcription',
          outputFormat: 'txt',
          status: 'converting',
          progress: 42,
          hostedTranscriptionNotice: 'Hugging Face rejected your token. Continuing on-device.',
        })
      );

      render(<ConverterCard />);

      const notice = screen.getByTestId('hosted-transcription-notice');
      expect(notice).toHaveTextContent(/rejected your token/i);
      expect(screen.getByTestId('conversion-progress-mock')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /transcribing/i })).toBeInTheDocument();
    });

    it('keeps the hosted-transcription notice visible after the job completes', () => {
      mockConverterState(
        createJob({
          conversionMode: 'transcription',
          outputFormat: 'txt',
          status: 'done',
          transcriptText: 'Hello there, world.',
          outputUrl: 'blob:transcript',
          outputFileName: 'clip.txt',
          hostedTranscriptionNotice: 'Could not reach Hugging Face. Transcribed on-device.',
        })
      );

      render(<ConverterCard />);

      expect(screen.getByTestId('hosted-transcription-notice')).toHaveTextContent(/on-device/i);
      expect(screen.getByTestId('transcript-text')).toHaveTextContent('Hello there, world.');
    });

    it('hides the notice when there is nothing to report', () => {
      mockConverterState(
        createJob({ conversionMode: 'transcription', outputFormat: 'txt', status: 'done' })
      );

      render(<ConverterCard />);

      expect(screen.queryByTestId('hosted-transcription-notice')).not.toBeInTheDocument();
    });

    // Polish notice mirrors the hosted notice: informational, never gating the transcript.
    it('renders the polish notice alongside the finished transcript', () => {
      mockConverterState(
        createJob({
          conversionMode: 'transcription',
          outputFormat: 'txt',
          status: 'done',
          transcriptText: 'raw transcript text',
          outputUrl: 'blob:transcript',
          outputFileName: 'clip.txt',
          polishNotice: 'Rate limit reached. The transcript was left unpolished.',
        })
      );

      render(<ConverterCard />);

      expect(screen.getByTestId('transcript-polish-notice')).toHaveTextContent(/unpolished/i);
      expect(screen.getByTestId('transcript-text')).toHaveTextContent('raw transcript text');
      expect(screen.getByRole('button', { name: /save clip\.txt/i })).toBeInTheDocument();
    });

    it('can show hosted and polish notices at the same time', () => {
      mockConverterState(
        createJob({
          conversionMode: 'transcription',
          outputFormat: 'txt',
          status: 'done',
          transcriptText: 'raw transcript text',
          hostedTranscriptionNotice: 'Hosted transcription failed. Transcribed on-device.',
          polishNotice: 'AI cleanup failed. The transcript was left unpolished.',
        })
      );

      render(<ConverterCard />);

      expect(screen.getByTestId('hosted-transcription-notice')).toBeInTheDocument();
      expect(screen.getByTestId('transcript-polish-notice')).toBeInTheDocument();
    });

    it('hides the polish notice when null', () => {
      mockConverterState(
        createJob({ conversionMode: 'transcription', outputFormat: 'txt', status: 'done' })
      );

      render(<ConverterCard />);

      expect(screen.queryByTestId('transcript-polish-notice')).not.toBeInTheDocument();
    });
  });
});
