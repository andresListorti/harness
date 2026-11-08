import { drawGalaxy } from '../../src/galaxy/draw';
import { initialCamera, layoutGalaxy } from '../../src/galaxy/camera';
import { nodes, recordingContext } from './galaxy-fixture';
const viewport = { width: 800, height: 800 };
const scene = { planets: layoutGalaxy(nodes, 0), camera: initialCamera(viewport), viewport, selectedId: null, time: 0 };
test('draws empty, populated and zero-size scenes and every label', () => {
  const { context, methods } = recordingContext();
  expect(() => drawGalaxy(context, { ...scene, planets: [] })).not.toThrow();
  expect(() => drawGalaxy(context, scene)).not.toThrow();
  for (const node of nodes) expect(methods.fillText).toHaveBeenCalledWith(node.label, expect.any(Number), expect.any(Number));
  expect(() => drawGalaxy(context, { ...scene, viewport: { width: 0, height: 0 } })).not.toThrow();
});
test('culls distant planets and adds a selection ring', () => {
  const draw = (options = {}) => { const result = recordingContext(); drawGalaxy(result.context, { ...scene, ...options }); return result.methods; };
  const normal = draw();
  const distant = draw({ planets: scene.planets.map(planet => ({ ...planet, x: 10000 })) });
  expect(distant.arc!.mock.calls.length).toBeLessThan(normal.arc!.mock.calls.length);
  const selected = draw({ selectedId: 'core' });
  expect(selected.arc!.mock.calls.length).toBeGreaterThan(normal.arc!.mock.calls.length);
  expect(selected.stroke!.mock.calls.length).toBeGreaterThan(normal.stroke!.mock.calls.length);
});
test('uses deterministic stars without random calls', () => {
  const random = vi.spyOn(Math, 'random');
  try {
    const a = recordingContext(); const b = recordingContext();
    drawGalaxy(a.context, scene); drawGalaxy(b.context, scene);
    expect(a.methods.arc!.mock.calls).toEqual(b.methods.arc!.mock.calls);
    expect(random).not.toHaveBeenCalled();
  } finally { random.mockRestore(); }
});

