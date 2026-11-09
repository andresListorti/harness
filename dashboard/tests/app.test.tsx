import { render, screen } from '@testing-library/react';
import App from '../src/App';
import viteConfig from '../vite.config';

vi.mock('../src/lib/api', () => ({ api: {
  getHealth: vi.fn(() => new Promise(() => {})),
  getPlan: vi.fn().mockResolvedValue({ source: 'dashboard', tasks: [] }),
  getRunLog: vi.fn().mockResolvedValue({ source: 'dashboard', entries: [] }),
  getChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  clearChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  sendChat: vi.fn(),
} }));

test('renders the Harness heading', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Harness' })).toBeInTheDocument();
});

test('binds Vite locally and proxies API requests', () => {
  expect(viteConfig.server).toMatchObject({
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  });
});
