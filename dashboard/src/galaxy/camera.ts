import type { GalaxyNode } from '../../shared/api';

export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 4;
export const MAX_PAN = 800;
export const AGENT_ORBIT = 170;
export const SYSTEM_ORBIT = 310;

export function worldToScreen(point: Point, camera: Camera, viewport: Viewport): Point {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(point: Point, camera: Camera, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : 1;
}

function clampPan(value: number): number {
  return Math.max(-MAX_PAN, Math.min(MAX_PAN, value));
}

export function zoomAt(camera: Camera, factor: number, screenPoint: Point, viewport: Viewport): Camera {
  if (!Number.isFinite(factor) || factor <= 0) return camera;
  const point = screenToWorld(screenPoint, camera, viewport);
  const zoom = clampZoom(camera.zoom * factor);
  return {
    x: clampPan(point.x - (screenPoint.x - viewport.width / 2) / zoom),
    y: clampPan(point.y - (screenPoint.y - viewport.height / 2) / zoom),
    zoom,
  };
}

export function wheelZoomFactor(deltaY: number): number {
  return Number.isFinite(deltaY) ? Math.exp(-deltaY * 0.0015) : 1;
}

export function zoomAtWheel(camera: Camera, deltaY: number, screenPoint: Point, viewport: Viewport): Camera {
  return zoomAt(camera, wheelZoomFactor(deltaY), screenPoint, viewport);
}

export function panBy(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    x: clampPan(camera.x - (Number.isFinite(dxScreen) ? dxScreen : 0) / camera.zoom),
    y: clampPan(camera.y - (Number.isFinite(dyScreen) ? dyScreen : 0) / camera.zoom),
    zoom: camera.zoom,
  };
}

export function fitZoom(viewport: Viewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return clampZoom(Math.min(viewport.width, viewport.height) / (2 * (SYSTEM_ORBIT + 60)));
}

export function initialCamera(viewport: Viewport): Camera {
  return { x: 0, y: 0, zoom: fitZoom(viewport) };
}

export type Planet = {
  id: string;
  label: string;
  kind: GalaxyNode['kind'];
  role: GalaxyNode['role'];
  count: number | null;
  x: number;
  y: number;
  radius: number;
  orbit: number;
};

export function layoutGalaxy(nodes: GalaxyNode[], timeSeconds: number): Planet[] {
  const sizes = { agent: 0, system: 0 };
  const indices = { agent: 0, system: 0 };
  for (const node of nodes) if (node.kind !== 'core') sizes[node.kind]++;
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  return nodes.map(({ id, label, kind, role, count }) => {
    const orbit = kind === 'core' ? 0 : kind === 'agent' ? AGENT_ORBIT : SYSTEM_ORBIT;
    const angle = kind === 'core' ? 0
      : -Math.PI / 2 + indices[kind]++ * 2 * Math.PI / sizes[kind]
        + time * (kind === 'agent' ? 0.15 : -0.07);
    return {
      id, label, kind, role, count,
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit,
      radius: kind === 'core' ? 46 : 14 + Math.min(16, 4 * Math.log2(1 + (count ?? 0))),
      orbit,
    };
  });
}

export function hitTest(planets: Planet[], worldPoint: Point, zoom = 1): Planet | null {
  let closest: Planet | null = null;
  let closestDistance = Infinity;
  const tolerance = 6 / clampZoom(zoom);
  for (const planet of planets) {
    const distance = Math.hypot(worldPoint.x - planet.x, worldPoint.y - planet.y);
    if (distance <= planet.radius + tolerance && distance < closestDistance) {
      closest = planet;
      closestDistance = distance;
    }
  }
  return closest;
}

export function hitTestScreen(planets: Planet[], screenPoint: Point, camera: Camera, viewport: Viewport): Planet | null {
  return hitTest(planets, screenToWorld(screenPoint, camera, viewport), camera.zoom);
}
