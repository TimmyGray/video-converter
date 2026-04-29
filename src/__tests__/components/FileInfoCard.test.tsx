import React from 'react';
import { render, screen } from '@testing-library/react';
import FileInfoCard from '@/components/FileInfoCard';
import { CropSettings } from '@/types';

const makeFile = (name: string, size: number) =>
  new File(['x'.repeat(size)], name, { type: 'video/mp4' });

const defaultCrop: CropSettings = {
  mode: 'none',
  custom: {
    width: '',
    height: '',
    x: '0',
    y: '0',
  },
};

describe('FileInfoCard', () => {
  it('renders placeholder state when no file is selected', () => {
    render(<FileInfoCard file={null} status="idle" errorMessage={null} cropSettings={defaultCrop} />);
    expect(screen.getByTestId('file-name')).toHaveTextContent('No file selected yet');
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Waiting');
  });

  it('shows file name and size', () => {
    const file = makeFile('myclip.mp4', 1024);
    render(<FileInfoCard file={file} status="idle" errorMessage={null} cropSettings={defaultCrop} />);
    expect(screen.getByTestId('file-name')).toHaveTextContent('myclip.mp4');
    expect(screen.getByTestId('file-size')).toHaveTextContent('1 KB');
  });

  it('shows "Complete" status when done', () => {
    const file = makeFile('video.mp4', 512);
    render(<FileInfoCard file={file} status="done" errorMessage={null} cropSettings={defaultCrop} />);
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Complete');
  });

  it('shows error status and message', () => {
    const file = makeFile('video.mp4', 512);
    render(
      <FileInfoCard
        file={file}
        status="error"
        errorMessage="Something went wrong"
        cropSettings={defaultCrop}
      />
    );
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Error');
    expect(screen.getByTestId('error-message')).toHaveTextContent('Something went wrong');
  });

  it('shows converting status', () => {
    const file = makeFile('video.mp4', 512);
    render(<FileInfoCard file={file} status="converting" errorMessage={null} cropSettings={defaultCrop} />);
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Converting');
  });

  it('shows result metadata when conversion is done', () => {
    const file = makeFile('video.mp4', 512);
    render(
      <FileInfoCard
        file={file}
        status="done"
        errorMessage={null}
        cropSettings={defaultCrop}
        outputSizeBytes={4096}
        conversionDurationMs={4200}
        ffmpegMode="multithreaded"
      />
    );

    expect(screen.getByTestId('result-metadata')).toHaveTextContent('Converted in 4.2s');
    expect(screen.getByTestId('result-metadata')).toHaveTextContent('Result size 4 KB');
    expect(screen.getByTestId('result-metadata')).toHaveTextContent('FFmpeg Multi-threaded');
  });

  it('shows crop preview chip with custom crop details', () => {
    const file = makeFile('video.mp4', 512);
    render(
      <FileInfoCard
        file={file}
        status="idle"
        errorMessage={null}
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '40', x: '10', y: '20' },
        }}
      />
    );
    expect(screen.getByTestId('crop-preview-chip')).toHaveTextContent('Crop: 50%×40% @ 10%,20%');
  });
});
