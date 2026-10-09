import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const appModules = import.meta.glob('../../src/App.tsx', {
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

describe('SEO social metadata and skip-to-content a11y', () => {
  const SITE_URL = 'https://leo8190.github.io/pausa-mia/';
  const IMAGE_URL = 'https://leo8190.github.io/pausa-mia/icon.svg';
  const EXPECTED_TITLE = 'Pausa Mía · Meditación a Medida';
  const EXPECTED_DESC_SNIPPET = 'meditación guiada en español';

  it('declares canonical, Open Graph and Twitter card tags in index.html', () => {
    const html = Object.values(indexModules).join('');
    expect(html.length).toBeGreaterThan(0);

    expect(html).toContain(`rel="canonical" href="${SITE_URL}"`);
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('property="og:locale" content="es_AR"');
    expect(html).toContain('property="og:site_name" content="Pausa Mía"');
    expect(html).toContain(`property="og:title" content="${EXPECTED_TITLE}"`);
    expect(html).toContain('property="og:description"');
    expect(html).toContain(EXPECTED_DESC_SNIPPET);
    expect(html).toContain(`property="og:url" content="${SITE_URL}"`);
    expect(html).toContain(`property="og:image"`);
    expect(html).toContain(IMAGE_URL);

    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).toContain(`name="twitter:title" content="${EXPECTED_TITLE}"`);
    expect(html).toContain('name="twitter:description"');
    expect(html).toContain('name="twitter:image"');

    // No invented competitor claims or fake stats in social copy
    expect(html.toLowerCase()).not.toMatch(
      /headspace|calm|insight timer|\d+\s*(millones|usuarios|downloads)/i,
    );
  });

  it('keeps a skip link targeting the main landmark in the app shell', () => {
    const app = Object.values(appModules).join('');
    expect(app.length).toBeGreaterThan(0);
    expect(app).toContain('className="skip-link"');
    expect(app).toContain('href="#main-content"');
    expect(app).toContain('Saltar al contenido principal');
    expect(app).toMatch(/<main[^>]*id="main-content"/);

    // Vite trata .css aparte: leemos app.css en crudo (mismo criterio que glob ?raw).
    const styles = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    expect(styles.length).toBeGreaterThan(0);
    expect(styles).toMatch(/\.skip-link\s*\{/);
    expect(styles).toMatch(/\.skip-link:focus-visible\s*\{/);
  });
});

describe('JSON-LD WebApplication and discovery files', () => {
  const SITE_URL = 'https://leo8190.github.io/pausa-mia/';

  it('embeds JSON-LD WebApplication with honest Spanish metadata', () => {
    const html = Object.values(indexModules).join('');
    expect(html).toMatch(/type="application\/ld\+json"/);

    const match = html.match(
      /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
    );
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]) as Record<string, unknown>;

    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
    expect(data.name).toBe('Pausa Mía');
    expect(data.url).toBe(SITE_URL);
    expect(data.inLanguage).toBe('es-AR');
    expect(data.applicationCategory).toMatch(/HealthApplication|LifestyleApplication/);
    expect(data.operatingSystem).toBe('Web Browser');
    expect(String(data.description)).toMatch(/meditación guiada/i);
    expect(String(data.description).toLowerCase()).not.toMatch(
      /headspace|calm|insight timer|terapia clínica|\d+\s*(millones|usuarios)/i,
    );

    const offers = data.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    expect(String(offers.price)).toBe('0');
  });

  it('ships robots.txt allowing crawl and pointing to the sitemap', () => {
    const robots = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8');
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Allow:\s*\//i);
    expect(robots).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);
  });

  it('ships sitemap.xml for the homepage with lastmod 2026-10-09', () => {
    const sitemap = readFileSync(resolve(process.cwd(), 'public/sitemap.xml'), 'utf8');
    expect(sitemap).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
    expect(sitemap).toContain(`<loc>${SITE_URL}</loc>`);
    expect(sitemap).toContain('<lastmod>2026-10-09</lastmod>');
  });
});
