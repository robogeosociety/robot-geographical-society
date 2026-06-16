import { pacmanMarkup } from './pie';

describe('pacmanMarkup — agency-colored availability disc', () => {
  it('renders a full disc in the agency color when fully available', () => {
    const svg = pacmanMarkup(1, { color: '#A6E22E' });
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<path');
    expect(svg).toContain('fill="#A6E22E"');
  });

  it('renders a pac-man wedge for partial availability', () => {
    const svg = pacmanMarkup(0.75, { color: '#FD971F' });
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#FD971F"');
  });

  it('renders a hollow grey ring when fully booked (fraction 0)', () => {
    const svg = pacmanMarkup(0);
    expect(svg).toContain('stroke="#6E7681"');
    expect(svg).toContain('fill="none"');
  });

  it('clamps out-of-range fractions', () => {
    expect(pacmanMarkup(5)).toContain('<circle'); // >1 → full disc
    expect(pacmanMarkup(-1)).toContain('fill="none"'); // <0 → hollow
  });

  it('honors the radius (icon size)', () => {
    expect(pacmanMarkup(1, { radius: 8 })).toContain('width="18"'); // 8*2 + 2
  });
});
