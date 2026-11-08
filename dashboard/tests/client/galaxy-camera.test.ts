// @vitest-environment node
import type { GalaxyNode } from '../../shared/api';
import {
  AGENT_ORBIT, MAX_PAN, MAX_ZOOM, MIN_ZOOM, SYSTEM_ORBIT,
  clampZoom, fitZoom, hitTest, hitTestScreen, initialCamera, layoutGalaxy,
  panBy, screenToWorld, wheelZoomFactor, worldToScreen, zoomAt, zoomAtWheel,
  type Camera, type Point,
} from '../../src/galaxy/camera';

const viewport = { width: 1000, height: 800 };
const cameras: Camera[] = [
  { x: 0, y: 0, zoom: 1 }, { x: 30, y: -40, zoom: 0.5 }, { x: -50, y: 60, zoom: 3 },
];
const points = [{ x: 0, y: 0 }, { x: -120, y: 90 }, { x: 230, y: -180 }];
function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}
function node(id: string, kind: GalaxyNode['kind'], count: number | null = null): GalaxyNode {
  return { id, label: id, kind, count, role: kind === 'agent' ? 'worker' : null, details: [] };
}
const nodes = [node('s1', 'system'), node('a1', 'agent'), node('core', 'core'),
  node('a2', 'agent', 3), node('s2', 'system', 15), node('s3', 'system', 10000)];

test('coordinate transforms round trip and map the viewport centre to the camera centre', () => {
  for (const camera of cameras) {
    expectPoint(screenToWorld({ x: 500, y: 400 }, camera, viewport), camera);
    expectPoint(worldToScreen(camera, camera, viewport), { x: 500, y: 400 });
    for (const point of points) {
      expectPoint(screenToWorld(worldToScreen(point, camera, viewport), camera, viewport), point);
      expectPoint(worldToScreen(screenToWorld(point, camera, viewport), camera, viewport), point);
    }
  }
});

test('zoom preserves the world point under the cursor and reverses with a reciprocal factor', () => {
  for (const camera of cameras) for (const cursor of [{ x: 500, y: 400 }, { x: 450, y: 350 }, { x: 550, y: 450 }]) {
    for (const factor of [0.8, 1.1, 1.25]) {
      const next = zoomAt(camera, factor, cursor, viewport);
      expectPoint(screenToWorld(cursor, next, viewport), screenToWorld(cursor, camera, viewport));
      const restored = zoomAt(next, 1 / factor, cursor, viewport);
      expectPoint(restored, camera);
      expect(restored.zoom).toBeCloseTo(camera.zoom);
    }
  }
});

test('zoom respects limits after repeated steps and clamps the centre', () => {
  let camera = cameras[0];
  for (let i = 0; i < 100; i++) camera = zoomAt(camera, 2, { x: 500, y: 400 }, viewport);
  expect(camera.zoom).toBe(MAX_ZOOM);
  for (let i = 0; i < 100; i++) camera = zoomAt(camera, 0.5, { x: 500, y: 400 }, viewport);
  expect(camera.zoom).toBe(MIN_ZOOM);
  const clamped = zoomAt(cameras[0], 0.3, { x: 2000, y: -2000 }, viewport);
  expect(clamped.x).toBe(-MAX_PAN);
  expect(clamped.y).toBe(MAX_PAN);
});

test.each([NaN, Infinity, -Infinity, 0, -1])('zoom ignores bad factor %s', factor => {
  expect(zoomAt(cameras[0], factor, points[0], viewport)).toBe(cameras[0]);
});

test('zoom clamping and wheel factors handle limits and invalid numbers', () => {
  expect(clampZoom(-10)).toBe(MIN_ZOOM);
  expect(clampZoom(20)).toBe(MAX_ZOOM);
  for (const value of [NaN, Infinity, -Infinity]) expect(clampZoom(value)).toBe(1);
  expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
  expect(wheelZoomFactor(100)).toBeLessThan(1);
  expect(wheelZoomFactor(100)).toBe(Math.exp(-100 * 0.0015));
  for (const value of [0, NaN, Infinity, -Infinity]) expect(wheelZoomFactor(value)).toBe(1);
  expect(zoomAtWheel(cameras[0], -100, points[1], viewport))
    .toEqual(zoomAt(cameras[0], wheelZoomFactor(-100), points[1], viewport));
});

test.each([0.5, 1, 3])('pan follows the dragged scene at zoom %s', zoom => {
  const camera = { x: 20, y: -30, zoom };
  const next = panBy(camera, 60, -45);
  expect(next).toEqual({ x: 20 - 60 / zoom, y: -30 + 45 / zoom, zoom });
  const cursor = { x: 400, y: 300 };
  expectPoint(screenToWorld({ x: cursor.x + 60, y: cursor.y - 45 }, next, viewport),
    screenToWorld(cursor, camera, viewport));
});

test('pan clamps each axis and treats non-finite deltas independently as zero', () => {
  expect(panBy(cameras[0], -10000, 10000)).toEqual({ x: MAX_PAN, y: -MAX_PAN, zoom: 1 });
  expect(panBy(cameras[0], 10000, -10000)).toEqual({ x: -MAX_PAN, y: MAX_PAN, zoom: 1 });
  expect(panBy(cameras[0], NaN, NaN)).toEqual(cameras[0]);
  expect(panBy(cameras[0], Infinity, 10)).toEqual({ x: 0, y: -10, zoom: 1 });
  expect(panBy(cameras[0], 10, -Infinity)).toEqual({ x: -10, y: 0, zoom: 1 });
});

test('fit and initial camera use the smaller viewport side and zoom limits', () => {
  expect(fitZoom(viewport)).toBe(800 / 740);
  expect(fitZoom({ width: 400, height: 600 })).toBeLessThan(fitZoom(viewport));
  expect(fitZoom({ width: 1, height: 1 })).toBe(MIN_ZOOM);
  expect(fitZoom({ width: 10000, height: 10000 })).toBe(MAX_ZOOM);
  for (const size of [{ width: 0, height: 100 }, { width: 100, height: 0 }, { width: -1, height: 100 }]) {
    expect(fitZoom(size)).toBe(1);
  }
  expect(initialCamera(viewport)).toEqual({ x: 0, y: 0, zoom: fitZoom(viewport) });
});

test('layout preserves input order and metadata, with core at the origin', () => {
  const planets = layoutGalaxy(nodes, 0);
  expect(planets).toHaveLength(nodes.length);
  planets.forEach((planet, i) => {
    const { details: _details, ...metadata } = nodes[i];
    expect(planet).toMatchObject(metadata);
  });
  expect(planets[2]).toMatchObject({ x: 0, y: 0, radius: 46, orbit: 0 });
  expect(layoutGalaxy([], 0)).toEqual([]);
  expect(layoutGalaxy(nodes, 4)).toEqual(layoutGalaxy(nodes, 4));
  expect(layoutGalaxy(nodes, 4)).not.toEqual(planets);
  for (const time of [NaN, Infinity, -Infinity]) expect(layoutGalaxy(nodes, time)).toEqual(planets);
});

test.each([0, 2, 30])('orbits have fixed distances and equal angular gaps at time %s', time => {
  const planets = layoutGalaxy(nodes, time);
  for (const kind of ['agent', 'system'] as const) {
    const group = planets.filter(planet => planet.kind === kind);
    const orbit = kind === 'agent' ? AGENT_ORBIT : SYSTEM_ORBIT;
    group.forEach((planet, i) => {
      expect(planet.orbit).toBe(orbit);
      expect(Math.hypot(planet.x, planet.y)).toBeCloseTo(orbit);
      const next = group[(i + 1) % group.length];
      const gap = (Math.atan2(next.y, next.x) - Math.atan2(planet.y, planet.x) + 2 * Math.PI) % (2 * Math.PI);
      expect(gap).toBeCloseTo(2 * Math.PI / group.length);
    });
  }
});

test('groups start at the top and rotate at their respective opposite speeds', () => {
  for (const kind of ['agent', 'system'] as const) {
    const first = layoutGalaxy(nodes, 0).find(planet => planet.kind === kind)!;
    expectPoint(first, { x: 0, y: -first.orbit });
    const later = layoutGalaxy(nodes, 1).find(planet => planet.kind === kind)!;
    expect(Math.atan2(later.y, later.x) + Math.PI / 2).toBeCloseTo(kind === 'agent' ? 0.15 : -0.07);
  }
});

test('radius grows with count, starts at 14 for null, and caps at 30', () => {
  const planets = layoutGalaxy([null, 0, 1, 3, 15, 10000].map((count, i) => node(String(i), 'system', count)), 0);
  expect(planets.map(planet => planet.radius)).toEqual([14, 14, 18, 22, 30, 30]);
});

test('hit testing includes the radius and tolerance, and misses empty space', () => {
  const planet = layoutGalaxy([node('core', 'core')], 0)[0];
  for (const x of [0, 40, 46, 52]) expect(hitTest([planet], { x, y: 0 })).toBe(planet);
  expect(hitTest([planet], { x: 53, y: 0 })).toBeNull();
  expect(hitTest([], points[0])).toBeNull();
  expect(hitTest([planet], { x: 55, y: 0 }, 0.3)).toBe(planet);
  expect(hitTest([planet], { x: 55, y: 0 }, 4)).toBeNull();
  expect(hitTest([planet], { x: 52, y: 0 }, NaN)).toBe(planet);
});

test('hit testing selects the closest overlapping planet and keeps earlier ties', () => {
  const first = layoutGalaxy([node('core', 'core')], 0)[0];
  const second = { ...first, id: 'second', x: 20 };
  expect(hitTest([first, second], { x: 18, y: 0 })).toBe(second);
  expect(hitTest([first, second], { x: 10, y: 0 })).toBe(first);
  expect(hitTest([second, first], { x: 10, y: 0 })).toBe(second);
});

test('screen hit testing uses the panned and zoomed camera', () => {
  const planets = layoutGalaxy(nodes, 3);
  const camera = { x: 200, y: -100, zoom: 2.5 };
  for (const planet of planets) {
    expect(hitTestScreen(planets, worldToScreen(planet, camera, viewport), camera, viewport)).toBe(planet);
  }
  expect(hitTestScreen(planets, worldToScreen({ x: 700, y: 700 }, camera, viewport), camera, viewport)).toBeNull();
});
