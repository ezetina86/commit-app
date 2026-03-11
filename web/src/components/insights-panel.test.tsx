import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InsightsPanel } from './insights-panel';

describe('InsightsPanel Component', () => {
  it('renders nothing when no insights', () => {
    const { container } = render(<InsightsPanel insights={[]} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the terminal frame', () => {
    const insights = [
      { habit_id: '1', habit_name: 'Reading', count: 30, message: "Yo Enrique! You crushed 30 pages of 'Reading' recently!" }
    ];
    
    render(<InsightsPanel insights={insights} onClose={() => {}} />);
    expect(screen.getByText('system_insights.sh')).toBeInTheDocument();
  });

  it('calls onClose when [X] is clicked', () => {
    const insights = [{ habit_id: '1', habit_name: 'R', count: 1, message: "M" }];
    const onClose = vi.fn();
    render(<InsightsPanel insights={insights} onClose={onClose} />);
    
    const closeBtn = screen.getByTitle('Close terminal');
    closeBtn.click();
    
    expect(onClose).toHaveBeenCalled();
  });
});
