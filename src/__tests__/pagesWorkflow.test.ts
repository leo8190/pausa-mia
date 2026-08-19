import { describe, expect, it } from 'vitest';

/** Endpoint público verificado. El workflow de Pages debe inyectarlo en el build. */
const PUBLISHED_ARGENTINE_TTS_ENDPOINT = 'https://pausa-mia-voz-ar.fly.dev';

const workflowModules = import.meta.glob('../../.github/workflows/pages.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('GitHub Pages workflow', () => {
  it('bakes the verified public Argentine TTS endpoint into the frontend build', () => {
    const workflow = Object.values(workflowModules).join('');
    expect(workflow.length).toBeGreaterThan(0);
    expect(workflow).toMatch(
      /^ {10}VITE_ARGENTINE_TTS_ENDPOINT: https:\/\/pausa-mia-voz-ar\.fly\.dev$/m,
    );
    expect(workflow).toContain(PUBLISHED_ARGENTINE_TTS_ENDPOINT);
  });
});
