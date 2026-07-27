import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footnotes, Markdown } from './Markdown.jsx';
import { parseMarkdown } from './markdown.js';

const resolve = (t) => (t === 'Adams Fork' ? '/codex/adams-fork' : null);

function renderBody(src) {
  const doc = parseMarkdown(src, { resolve });
  return {
    doc,
    ...render(
      <MemoryRouter>
        <Markdown blocks={doc.blocks} />
        <Footnotes notes={doc.footnotes} />
      </MemoryRouter>,
    ),
  };
}

describe('Markdown renderer', () => {
  it('renders a resolved wikilink as an internal link', () => {
    renderBody('Near [[Adams Fork]].');
    const a = screen.getByRole('link', { name: 'Adams Fork' });
    expect(a).toHaveAttribute('href', '/codex/adams-fork');
  });

  it('renders an unresolved wikilink as plain text, not a link', () => {
    renderBody('See [[Weather & winter]] for the season.');
    expect(screen.queryByRole('link', { name: 'Weather & winter' })).not.toBeInTheDocument();
    expect(screen.getByText('Weather & winter')).toBeInTheDocument();
  });

  it('opens external links in a new tab with a safe rel', () => {
    renderBody('[recreation.gov](https://www.recreation.gov/x)');
    const a = screen.getByRole('link', { name: /recreation.gov/ });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('gives headings anchor ids so the ToC can reach them', () => {
    renderBody('## Hazards\n\ntext\n');
    expect(screen.getByRole('heading', { name: 'Hazards' })).toHaveAttribute('id', 'hazards');
  });

  it('renders a table with its header cells', () => {
    renderBody('| Hazard | Tier |\n| --- | --- |\n| lahar | distal |\n');
    expect(screen.getByRole('columnheader', { name: 'Hazard' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'distal' })).toBeInTheDocument();
  });

  it('renders a callout with its title', () => {
    const { container } = renderBody('> [!warning] No potable water\n> Bring what you need.\n');
    expect(screen.getByText('No potable water')).toBeInTheDocument();
    expect(container.querySelector('.codex-callout-warning')).not.toBeNull();
  });

  it('links footnote references to their definitions and back', () => {
    renderBody('Elevation[^usgs].\n\n[^usgs]: USGS 3DEP.\n');
    expect(screen.getByRole('link', { name: '[1]' })).toHaveAttribute('href', '#fn-usgs');
    expect(screen.getByText('USGS 3DEP.')).toBeInTheDocument();
  });

  describe('missing attachments', () => {
    it('names the missing asset instead of drawing a broken image', () => {
      const { container } = renderBody('![[heading-adams-fork.jpg]]\n*Photo: Lowe, Jet — Public domain*\n');
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('heading-adams-fork.jpg')).toBeInTheDocument();
      expect(screen.getByText('Photograph')).toBeInTheDocument();
      expect(screen.getByText(/not shipped in this artifact/)).toBeInTheDocument();
    });

    it('keeps the attribution line — it is the licence, not decoration', () => {
      renderBody('![[a.jpg]]\n*Photo: Sam Beebe — CC BY 2.0, via Wikimedia Commons*\n');
      expect(screen.getByText(/CC BY 2.0, via Wikimedia Commons/)).toBeInTheDocument();
    });

    it('labels a park map and a road diagram distinctly', () => {
      renderBody('![[map-ocean-city-state-park.pdf]]\n\n![[roads-adams-fork.svg]]\n');
      expect(screen.getByText('Park map (PDF)')).toBeInTheDocument();
      expect(screen.getByText('Road diagram (SVG)')).toBeInTheDocument();
    });
  });
});
