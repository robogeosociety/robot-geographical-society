import { pacmanMarkup } from './pie';

describe('pacmanMarkup — agency disc that drains clockwise', () => {
  it('always draws a light background circle (clickable point) and an agency outline', () => {
    const svg = pacmanMarkup(0.5, { color: '#A6E22E' });
    expect(svg).toContain('fill="rgba(255,255,255,0.82)"'); // light background
    expect(svg).toContain('stroke="#A6E22E"'); // agency outline
  });

  it('draws a faint full disc (the drained/booked fill) at low opacity', () => {
    const svg = pacmanMarkup(0.5, { color: '#A6E22E' });
    expect(svg).toContain('fill="#A6E22E" fill-opacity="0.22"');
  });

  it('fills the whole disc in the agency color when fully available', () => {
    const svg = pacmanMarkup(1, { color: '#A6E22E' });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('fill="#A6E22E"');
  });

  it('renders a remaining-availability wedge for partial availability', () => {
    const svg = pacmanMarkup(0.75, { color: '#FD971F' });
    expect(svg).toContain('<path');
    expect(svg).toContain('fill="#FD971F"');
  });

  it('drains clockwise — the solid wedge is the tail of the sweep, ending at 360°', () => {
    // 75% available → 25% drained from the top, so the wedge spans [90°, 360°].
    // slicePath ends at the 12-o'clock point (polar of 360° === top), i.e. the disc top.
    const svg = pacmanMarkup(0.75, { color: '#FD971F' });
    const path = svg.match(/<path d="([^"]+)"/)[1];
    // End point of the arc is the top of the circle (cx, cy - radius) → y component is 0.
    expect(path).toMatch(/A8,8 0 \d 1 9\.00,1\.00 Z$/);
  });

  it('fully booked → just the light + faint disc and agency outline, no solid wedge', () => {
    const svg = pacmanMarkup(0, { color: '#66D9EF' });
    expect(svg).not.toContain('<path');
    expect(svg).toContain('fill="rgba(255,255,255,0.82)"');
    expect(svg).toContain('fill="#66D9EF" fill-opacity="0.22"'); // faint drained disc
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
