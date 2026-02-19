import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

// Provide a fake VITE_MAPBOX_ACCESS_TOKEN so the map initializes without error
beforeEach(() => {
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN = 'pk.test_token';
});

describe('App smoke tests', () => {
  it('renders the app header', () => {
    render(<App />);
    expect(
      screen.getByText('Robot Geographical Society')
    ).toBeInTheDocument();
  });

  it('renders all four agency toggle buttons', () => {
    render(<App />);
    expect(screen.getByText(/WA State Parks/i)).toBeInTheDocument();
    expect(screen.getByText(/National Park Service/i)).toBeInTheDocument();
    expect(screen.getByText(/US Forest Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Bureau of Land Management/i)).toBeInTheDocument();
  });

  it('agency toggle buttons are pressed by default', () => {
    render(<App />);
    const buttons = screen.getAllByRole('button', { name: /State Parks|Park Service|Forest|Land Management/i });
    buttons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('toggling an agency button changes aria-pressed to false', async () => {
    const user = userEvent.setup();
    render(<App />);
    const waBtn = screen.getByText(/WA State Parks/i).closest('button');
    expect(waBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(waBtn);
    expect(waBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('detail panel is not shown initially', () => {
    render(<App />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the map container element', () => {
    render(<App />);
    // The map container div is rendered inside map-wrapper
    const wrapper = document.querySelector('.map-container');
    expect(wrapper).not.toBeNull();
  });
});
