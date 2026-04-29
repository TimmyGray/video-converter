import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CropPreviewPanel from '@/components/CropPreviewPanel';
import { CropSettings } from '@/types';

const defaultCrop: CropSettings = {
  mode: 'none',
  custom: {
    width: '',
    height: '',
    x: '0',
    y: '0',
  },
};

describe('CropPreviewPanel', () => {
  it('shows original frame label for none mode', () => {
    render(<CropPreviewPanel cropSettings={defaultCrop} hasFile={false} />);
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Original Frame');
  });

  it('shows ratio label for preset mode', () => {
    render(
      <CropPreviewPanel
        cropSettings={{ ...defaultCrop, mode: '9:16' }}
        hasFile
      />
    );
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Aspect 9:16');
  });

  it('shows custom dimensions when custom values are set', () => {
    render(
      <CropPreviewPanel
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '50', x: '10', y: '20' },
        }}
        hasFile
      />
    );
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Custom 50%×50%');
  });

  it('shows resize handles when preview editing is enabled', () => {
    render(
      <CropPreviewPanel
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '50', x: '10', y: '20' },
        }}
        hasFile
        onCropModeChange={jest.fn()}
        onCustomCropChange={jest.fn()}
      />
    );

    expect(screen.getByTestId('crop-preview-handle-se')).toBeInTheDocument();
    expect(screen.getByTestId('crop-preview-handle-nw')).toBeInTheDocument();
  });

  it('updates custom crop values when dragging a resize handle', () => {
    const onCustomCropChange = jest.fn();

    render(
      <CropPreviewPanel
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '50', x: '10', y: '20' },
        }}
        hasFile
        onCropModeChange={jest.fn()}
        onCustomCropChange={onCustomCropChange}
      />
    );

    const frame = screen.getByTestId('crop-preview-frame');
    Object.defineProperty(frame, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(screen.getByTestId('crop-preview-handle-se'), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });
    fireEvent.mouseUp(window);

    expect(onCustomCropChange).toHaveBeenCalled();
    expect(onCustomCropChange).toHaveBeenCalledWith('width', expect.any(String));
    expect(onCustomCropChange).toHaveBeenCalledWith('height', expect.any(String));
  });

  it('changes only x and y when dragging the crop area', () => {
    const onCustomCropChange = jest.fn();

    render(
      <CropPreviewPanel
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '50', x: '10', y: '20' },
        }}
        hasFile
        onCropModeChange={jest.fn()}
        onCustomCropChange={onCustomCropChange}
      />
    );

    const frame = screen.getByTestId('crop-preview-frame');
    Object.defineProperty(frame, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        right: 200,
        bottom: 100,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseDown(screen.getByTestId('crop-preview-rect'), {
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });
    fireEvent.mouseUp(window);

    const widthCalls = onCustomCropChange.mock.calls.filter(([field]) => field === 'width');
    const heightCalls = onCustomCropChange.mock.calls.filter(([field]) => field === 'height');
    const xCalls = onCustomCropChange.mock.calls.filter(([field]) => field === 'x');
    const yCalls = onCustomCropChange.mock.calls.filter(([field]) => field === 'y');

    expect(widthCalls[widthCalls.length - 1]?.[1]).toBe('50');
    expect(heightCalls[heightCalls.length - 1]?.[1]).toBe('50');
    expect(xCalls[xCalls.length - 1]?.[1]).not.toBe('10');
    expect(yCalls[yCalls.length - 1]?.[1]).not.toBe('20');
  });
});
