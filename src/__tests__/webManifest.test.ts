import { describe, expect, it } from 'vitest';

const manifestModules = import.meta.glob('../../public/manifest.webmanifest', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const iconModules = import.meta.glob('../../public/icon.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexModules = import.meta.glob('../../index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const workflowModules = import.meta.glob('../../.github/workflows/pages.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const viteConfigModules = import.meta.glob('../../vite.config.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const swModules = import.meta.glob('../../public/{sw,service-worker}.js', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

type WebManifest = {
  name?: string;
  short_name?: string;
  lang?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  orientation?: string;
  theme_color?: string;
  background_color?: string;
  description?: string;
  icons?: Array<{ src?: string; type?: string; sizes?: string; purpose?: string }>;
};

describe('PWA install shell (manifest, no service worker)', () => {
  it('ships a valid installable web manifest under /pausa-mia/', () => {
    const raw = Object.values(manifestModules).join('');
    expect(raw.length).toBeGreaterThan(0);

    const manifest = JSON.parse(raw) as WebManifest;

    expect(manifest.name).toBe('Pausa Mía');
    expect(manifest.short_name).toBe('Pausa Mía');
    expect(manifest.lang).toBe('es');
    expect(manifest.start_url).toBe('/pausa-mia/');
    expect(manifest.scope).toBe('/pausa-mia/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('any');
    expect(manifest.theme_color).toBe('#2f5c4f');
    expect(manifest.background_color).toBe('#e7eeea');
    expect(manifest.description?.length).toBeGreaterThan(20);
    expect(manifest.icons?.length).toBeGreaterThan(0);
    expect(manifest.icons?.every((icon) => icon.src === '/pausa-mia/icon.svg')).toBe(
      true,
    );
    expect(manifest.icons?.every((icon) => icon.type === 'image/svg+xml')).toBe(true);
  });

  it('declares a local SVG icon without external URLs or personal data', () => {
    const svg = Object.values(iconModules).join('');
    expect(svg.length).toBeGreaterThan(0);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toMatch(/\b(?:href|src|xlink:href)=["']https?:\/\//i);
    expect(svg.toLowerCase()).not.toMatch(/foreignobject|<image\b/);
    expect(svg.toLowerCase()).not.toMatch(/leonardo|gmail|@|dni|telefono|whatsapp/);
  });

  it('wires theme-color, Apple web-app meta and manifest/icon links in index.html', () => {
    const html = Object.values(indexModules).join('');
    expect(html.length).toBeGreaterThan(0);

    expect(html).toContain('viewport-fit=cover');
    expect(html).toMatch(/name="theme-color"[^>]*content="#2f5c4f"/);
    expect(html).toMatch(/name="apple-mobile-web-app-capable"[^>]*content="yes"/);
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style"/);
    expect(html).toMatch(/rel="manifest"[^>]*href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/rel="icon"[^>]*href="\/icon\.svg"/);
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\/icon\.svg"/);
  });

  it('does not introduce a service worker that could cache diario, perfil, guion or audio', () => {
    const html = Object.values(indexModules).join('').toLowerCase();
    const workflow = Object.values(workflowModules).join('').toLowerCase();
    const viteConfig = Object.values(viteConfigModules).join('').toLowerCase();

    expect(html).not.toMatch(/serviceworker|service-worker|navigator\.serviceworker/);
    expect(workflow).not.toMatch(/service.?worker|workbox|sw\.js/);
    expect(viteConfig).not.toMatch(/vite-plugin-pwa|workbox|serviceworker/);
    expect(Object.keys(swModules)).toHaveLength(0);
  });
});
