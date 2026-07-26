/**
 * AllocationBar tests — U1-NFR-U-05's one rule.
 *
 * An over-allocated member must not look like a fully-booked one. That is encoded three ways
 * (colour, shape, number), and these tests pin all three: colour alone fails for a colour-blind
 * reader, shape alone fails in a screen reader, and the number is what a user actually acts on.
 */

import { render, screen } from '@testing-library/react';
import { AllocationBar, formatPercentage } from './AllocationBar';

describe('formatPercentage', () => {
  it('omits a pointless decimal', () => {
    expect(formatPercentage(50)).toBe('50%');
    expect(formatPercentage(100)).toBe('100%');
  });

  it('keeps a meaningful one', () => {
    expect(formatPercentage(37.5)).toBe('37.5%');
    expect(formatPercentage(0.1)).toBe('0.1%');
  });

  it('renders a NEGATIVE remainder rather than clamping it', () => {
    // The whole point of BR-V-03: "-20%" and "0%" mean very different things.
    expect(formatPercentage(-20)).toBe('-20%');
  });
});

describe('AllocationBar states', () => {
  it('shows a partial booking with its remainder', () => {
    render(<AllocationBar totalPercentage={40} availablePercentage={60} testId="bar" />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60% left')).toBeInTheDocument();
  });

  it('describes exactly 100% as booked, not as over', () => {
    render(<AllocationBar totalPercentage={100} availablePercentage={0} />);
    expect(screen.getByText('0% left')).toBeInTheDocument();
    // BR-A-08: exactly capacity is NOT over-allocated.
    expect(screen.queryByText(/over-allocated/i)).not.toBeInTheDocument();
  });

  it('distinguishes OVER-allocation from full, in words as well as colour', () => {
    render(<AllocationBar totalPercentage={120} availablePercentage={-20} testId="bar" />);

    // The number is negative, not clamped.
    expect(screen.getByText('-20% left')).toBeInTheDocument();
    // And the state is stated for anyone who cannot see the colour or the shape.
    expect(screen.getByText(/over-allocated/i)).toBeInTheDocument();
    expect(screen.getByText(/exceeding capacity by 20%/i)).toBeInTheDocument();
  });

  it('uses a different fill colour for over than for full', () => {
    const full = render(<AllocationBar totalPercentage={100} />);
    const fullFill = full.container.querySelector('.bg-allocation-full');
    expect(fullFill).not.toBeNull();

    const over = render(<AllocationBar totalPercentage={130} />);
    // Not merely a different shade — a different named token, so the two cannot converge.
    expect(over.container.querySelector('.bg-allocation-over')).not.toBeNull();
    expect(over.container.querySelector('.bg-allocation-full')).toBeNull();
  });

  it('renders the overflow tail only when over capacity', () => {
    // The SHAPE cue: the bar breaks out past its track, which survives greyscale.
    const full = render(<AllocationBar totalPercentage={100} />);
    expect(full.container.querySelector('.left-full')).toBeNull();

    const over = render(<AllocationBar totalPercentage={140} />);
    expect(over.container.querySelector('.left-full')).not.toBeNull();
  });

  it('caps the fill inside the track at 100% so layout cannot break', () => {
    const { container } = render(<AllocationBar totalPercentage={300} />);
    const fill = container.querySelector('.bg-allocation-over') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('treats zero as free and available in full', () => {
    render(<AllocationBar totalPercentage={0} availablePercentage={100} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('100% left')).toBeInTheDocument();
  });
});
