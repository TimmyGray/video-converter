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
});
