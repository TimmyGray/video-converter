import React from 'react';
import { render, screen } from '@testing-library/react';
import FileInfoCard from '@/components/FileInfoCard';

const makeFile = (name: string, size: number) =>
  new File(['x'.repeat(size)], name, { type: 'video/mp4' });

describe('FileInfoCard', () => {
  it('renders nothing when no file', () => {
    const { container } = render(
      <FileInfoCard file={null} status="idle" errorMessage={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows file name and size', () => {
    const file = makeFile('myclip.mp4', 1024);
    render(<FileInfoCard file={file} status="idle" errorMessage={null} />);
    expect(screen.getByTestId('file-name')).toHaveTextContent('myclip.mp4');
    expect(screen.getByTestId('file-size')).toHaveTextContent('1 KB');
  });

  it('shows "Complete" status when done', () => {
    const file = makeFile('video.mp4', 512);
    render(<FileInfoCard file={file} status="done" errorMessage={null} />);
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Complete');
  });

  it('shows error status and message', () => {
    const file = makeFile('video.mp4', 512);
    render(
      <FileInfoCard file={file} status="error" errorMessage="Something went wrong" />
    );
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Error');
    expect(screen.getByTestId('error-message')).toHaveTextContent('Something went wrong');
  });

  it('shows converting status', () => {
    const file = makeFile('video.mp4', 512);
    render(<FileInfoCard file={file} status="converting" errorMessage={null} />);
    expect(screen.getByTestId('status-chip')).toHaveTextContent('Converting');
  });
});
