import {
  AGENT_ORBIT,
  SYSTEM_ORBIT,
  worldToScreen,
  type Planet,
  type Camera,
  type Viewport,
} from './camera';

export interface GalaxyTheme {
  background: string;
  teal: string;
  amber: string;
  text: string;
  muted: string;
  border: string;
}
export const DEFAULT_THEME: GalaxyTheme = {
  background: '#05080a',
  teal: '#2dd4bf',
  amber: '#fbbf24',
  text: '#edf3f2',
  muted: '#9bafaf',
  border: '#1c2a30',
};
const stars = (() => {
  let seed = 7391;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: 90 }, () => ({
    x: next() * 1800 - 900,
    y: next() * 1800 - 900,
    radius: 0.5 + next(),
  }));
})();

export function drawGalaxy(
  ctx: CanvasRenderingContext2D,
  {
    planets,
    camera,
    viewport,
    selectedId,
    theme = DEFAULT_THEME,
  }: {
    planets: Planet[];
    camera: Camera;
    viewport: Viewport;
    selectedId: string | null;
    time: number;
    theme?: GalaxyTheme;
  },
): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  const circle = (x: number, y: number, radius: number) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  };
  ctx.fillStyle = theme.muted;
  ctx.globalAlpha = 0.3;
  for (const star of stars) {
    const p = worldToScreen(star, camera, viewport);
    circle(p.x, p.y, star.radius * camera.zoom);
    ctx.fill();
  }
  const origin = worldToScreen({ x: 0, y: 0 }, camera, viewport);
  ctx.strokeStyle = theme.muted;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.18;
  ctx.setLineDash([3, 7]);
  for (const orbit of [AGENT_ORBIT, SYSTEM_ORBIT]) {
    circle(origin.x, origin.y, orbit * camera.zoom);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  const fontSize = Math.max(11, Math.min(18, 14 * camera.zoom));
  for (const planet of planets) {
    const p = worldToScreen(planet, camera, viewport);
    const r = planet.radius * camera.zoom;
    const extent = planet.kind === 'core' ? r * 2 : r + 8;
    if (
      p.x + extent < 0 ||
      p.y + extent < 0 ||
      p.x - extent > viewport.width ||
      p.y - extent > viewport.height
    ) {
      continue;
    }
    if (planet.kind === 'core') {
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
      glow.addColorStop(0, theme.teal);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      circle(p.x, p.y, r * 2);
      ctx.fill();
      ctx.fillStyle = theme.text;
      circle(p.x, p.y, r * 0.2);
      ctx.fill();
    } else {
      ctx.fillStyle = planet.kind === 'system'
        ? theme.background
        : planet.role === 'orchestrator'
          ? theme.teal
          : theme.border;
      circle(p.x, p.y, r);
      ctx.fill();
      ctx.strokeStyle = theme.teal;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (planet.id === selectedId) {
      ctx.strokeStyle = theme.amber;
      ctx.lineWidth = 2;
      circle(p.x, p.y, r + 7);
      ctx.stroke();
    }
    const labelY = p.y + r + fontSize + 5;
    ctx.font = `${fontSize}px "Inter Variable", system-ui, sans-serif`;
    ctx.fillStyle = theme.text;
    ctx.fillText(planet.label, p.x, labelY);
    if (planet.count !== null) {
      ctx.fillStyle = theme.muted;
      ctx.fillText(String(planet.count), p.x, labelY + fontSize + 4);
    }
  }
  ctx.restore();
}

