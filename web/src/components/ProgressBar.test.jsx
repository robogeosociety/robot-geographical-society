import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar', () => {
  it('determinate: fills to the clamped percentage and exposes aria-valuenow', () => {
    render(<ProgressBar value={0.42} label="Placing" />);
    const bar = screen.getByRole('progressbar', { name: 'Placing' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar.firstChild).toHaveStyle({ width: '42%' });
    expect(bar.firstChild).not.toHaveClass('progress-fill--indeterminate');
  });

  it('clamps out-of-range values', () => {
    const { rerender } = render(<ProgressBar value={2} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<ProgressBar value={-1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('indeterminate: no aria-valuenow, sliding-sweep modifier applied', () => {
    render(<ProgressBar indeterminate label="Loading" />);
    const bar = screen.getByRole('progressbar', { name: 'Loading' });
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar.firstChild).toHaveClass('progress-fill--indeterminate');
  });
});
