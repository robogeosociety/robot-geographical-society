import { pieMarkup } from './pie';

describe('pieMarkup — seasonal availability pie', () => {
  it('renders one wedge path per season with remaining > 0', () => {
    const svg = pieMarkup({ Winter: 1, Spring: 1, Summer: 1, Fall: 1 });
    expect((svg.match(/<path /g) || []).length).toBe(4);
  });

  it('renders a full disc for a single-season campground', () => {
    const svg = pieMarkup({ Summer: 10 });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('<circle');
    expect(svg).toContain('#E6DB74'); // Summer color
  });

  it('renders a hollow grey ring when fully booked (sum 0)', () => {
    const svg = pieMarkup({ Winter: 0, Spring: 0, Summer: 0, Fall: 0 });
    expect(svg).toContain('stroke="#6E7681"');
    expect(svg).toContain('fill="none"');
  });

  it('dims non-highlighted slices', () => {
    const svg = pieMarkup({ Summer: 5, Fall: 5 }, { highlight: 'Summer' });
    expect(svg).toContain('fill-opacity="1"');    // Summer
    expect(svg).toContain('fill-opacity="0.18"'); // Fall dimmed
  });

  it('draws an agency ring when provided', () => {
    const svg = pieMarkup({ Summer: 5 }, { ring: '#FD971F' });
    expect(svg).toContain('stroke="#FD971F"');
  });
});
