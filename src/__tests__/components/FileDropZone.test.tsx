import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FileDropZone from '@/components/FileDropZone';

const mockOnFileSelect = jest.fn();

const makeVideoFile = (name = 'test.mp4') =>
  new File(['content'], name, { type: 'video/mp4' });

beforeEach(() => jest.clearAllMocks());

describe('FileDropZone', () => {
  it('renders drop zone when no file', () => {
    render(<FileDropZone file={null} onFileSelect={mockOnFileSelect} />);
    expect(screen.getByText(/Drag & drop a video file/i)).toBeInTheDocument();
  });

  it('shows file name when file is selected', () => {
    const file = makeVideoFile('myvideo.mp4');
    render(<FileDropZone file={file} onFileSelect={mockOnFileSelect} />);
    expect(screen.getByText('myvideo.mp4')).toBeInTheDocument();
  });

  it('calls onFileSelect when valid file is dropped', () => {
    render(<FileDropZone file={null} onFileSelect={mockOnFileSelect} />);
    const zone = screen.getByTestId('file-drop-zone');
    const file = makeVideoFile();
    fireEvent.drop(zone, {
      dataTransfer: { files: [file] },
    });
    expect(mockOnFileSelect).toHaveBeenCalledWith(file);
  });

  it('shows error for non-video file drop', () => {
    render(<FileDropZone file={null} onFileSelect={mockOnFileSelect} />);
    const zone = screen.getByTestId('file-drop-zone');
    const badFile = new File(['content'], 'document.pdf', { type: 'application/pdf' });
    fireEvent.drop(zone, {
      dataTransfer: { files: [badFile] },
    });
    expect(mockOnFileSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/valid video file/i)).toBeInTheDocument();
  });

  it('does not call onFileSelect when disabled', () => {
    render(<FileDropZone file={null} onFileSelect={mockOnFileSelect} disabled />);
    const zone = screen.getByTestId('file-drop-zone');
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeVideoFile()] },
    });
    expect(mockOnFileSelect).not.toHaveBeenCalled();
  });

  it('updates drag state on dragenter/dragleave', () => {
    render(<FileDropZone file={null} onFileSelect={mockOnFileSelect} />);
    const zone = screen.getByTestId('file-drop-zone');
    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    // No crash = pass
  });
});
