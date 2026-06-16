import { pacmanMarkup } from './pie';

describe('pacmanMarkup — agency disc with availability wedge', () => {
  it('always draws a light background circle (clickable point) and an agency outline', () => {
    const svg = pacmanMarkup(0.5, { color: '#A6E22E' });
    expect(svg).toContain('fill="rgba(255,255,255,0.82)"'); // light background
    expect(svg).toContain('stroke="#A6E22E"'); // agency outline
  });

  it('fills the whole disc in the agency color when fully available', () => {
    const svg = pacmanMarkup(1, { color: '#A6E22E' });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('fill="#A6E22E"');
  });

  it('renders a pac-man wedge for partial availability', () => {
    const svg = pacmanMarkup(0.75, { color: '#FD971F' });
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#FD971F"');
  });

  it('fully booked → just the light disc + agency outline, no wedge', () => {
    const svg = pacmanMarkup(0, { color: '#66D9EF' });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('fill="rgba(255,255,255,0.82)"');
    expect(svg).toContain('stroke="#66D9EF"');
  });

  it('clamps out-of-range fractions', () => {
    expect(pacmanMarkup(5, { color: '#A6E22E' })).toContain('fill="#A6E22E"'); // >1 → full disc
    expect(pacmanMarkup(-1)).not.toContain('<path'); // <0 → no wedge
  });

  it('honors the radius (icon size)', () => {
    expect(pacmanMarkup(1, { radius: 8 })).toContain('width="18"'); // 8*2 + 2
  });
});
