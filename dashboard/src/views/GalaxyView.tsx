import { useCallback, useEffect, useRef, useState } from 'react';
import type { GalaxyNode } from '../../shared/api';
import { api, ApiError } from '../lib/api';
import { initialCamera, layoutGalaxy, zoomAtWheel, panBy, hitTestScreen, type Camera, type Viewport } from '../galaxy/camera';
import { DEFAULT_THEME, drawGalaxy, type GalaxyTheme } from '../galaxy/draw';
import './GalaxyView.css';

export function GalaxyView({ client = api }: { client?: Pick<typeof api, 'getGalaxy'> }) {
  const [nodes, setNodes] = useState<GalaxyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<Viewport>({ width: 0, height: 0 });
  const camera = useRef<Camera>(initialCamera(viewport.current));
  const redraw = useRef(() => {});
  const reset = useRef(() => {});
  const selection = useRef(selectedId);
  const frame = useRef<number | null>(null);
  selection.current = selectedId;
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError(null);
    try {
      const result = await client.getGalaxy();
      if (current !== request.current) return;
      setNodes(result.nodes);
      setSelectedId(id => result.nodes.some(node => node.id === id) ? id : null);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof ApiError ? `Could not load galaxy: ${cause.message}` : 'Could not load galaxy.');
    } finally { if (current === request.current) setLoading(false); }
  }, [client]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  useEffect(() => { redraw.current(); }, [selectedId]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let active = true;
    let time = 0;
    let dpr = 1;
    let sized = false;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const styles = getComputedStyle(document.documentElement);
    const properties: Record<keyof GalaxyTheme, string> = { teal: '--color-teal', amber: '--color-amber', text: '--color-text', muted: '--color-text-muted', border: '--color-border', background: '--color-bg' };
    const theme = { ...DEFAULT_THEME };
    for (const key of Object.keys(properties) as (keyof GalaxyTheme)[]) theme[key] = styles.getPropertyValue(properties[key]).trim() || DEFAULT_THEME[key];
    const draw = () => {
      if (!active) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGalaxy(ctx, { planets: layoutGalaxy(nodes, time), camera: camera.current, viewport: viewport.current, selectedId: selection.current, time, theme });
    };
    const cameraChanged = () => {
      canvas.dataset.zoom = camera.current.zoom.toFixed(3);
      canvas.dataset.cameraX = camera.current.x.toFixed(2);
      canvas.dataset.cameraY = camera.current.y.toFixed(2);
      draw();
    };
    reset.current = () => { camera.current = initialCamera(viewport.current); cameraChanged(); };
    redraw.current = draw;
    const resize = () => {
      viewport.current = { width: canvas.clientWidth, height: canvas.clientHeight };
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewport.current.width * dpr); canvas.height = Math.round(viewport.current.height * dpr);
      if (!sized && viewport.current.width > 0 && viewport.current.height > 0) { camera.current = initialCamera(viewport.current); sized = true; }
      cameraChanged();
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    if (!observer) window.addEventListener('resize', resize);
    const point = (event: { clientX: number; clientY: number }) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    const wheel = (event: WheelEvent) => { event.preventDefault(); camera.current = zoomAtWheel(camera.current, event.deltaY, point(event), viewport.current); cameraChanged(); };
    let drag: { id: number; x: number; y: number; startX: number; startY: number; distance: number } | null = null;
    const down = (event: PointerEvent) => {
      if (drag || event.button > 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, distance: 0 };
      canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('is-dragging');
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag.distance = Math.max(drag.distance, Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
      camera.current = panBy(camera.current, event.clientX - drag.x, event.clientY - drag.y);
      drag.x = event.clientX; drag.y = event.clientY; cameraChanged();
    };
    const end = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const distance = Math.max(drag.distance, Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
      if (event.type === 'pointerup' && distance <= 4) setSelectedId(hitTestScreen(layoutGalaxy(nodes, time), point(event), camera.current, viewport.current)?.id ?? null);
      drag = null; canvas.classList.remove('is-dragging'); canvas.releasePointerCapture?.(event.pointerId);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    const animate = (timestamp: number) => { if (!active) return; time = timestamp / 1000; draw(); frame.current = requestAnimationFrame(animate); };
    if (!reduced) frame.current = requestAnimationFrame(animate);
    return () => {
      active = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null; redraw.current = () => {}; reset.current = () => {};
      observer?.disconnect(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', end); canvas.removeEventListener('pointercancel', end);
    };
  }, [nodes, loading, error]);
  const selected = nodes.find(node => node.id === selectedId);
  return <section className="galaxy-view">
    <header className="galaxy-header"><div><h1 className="section-title">Galaxy</h1><p className="eyebrow">The repo as a system: agents, tasks, commits, tests</p></div><button type="button" onClick={() => reset.current()}>Reset view</button></header>
    <p className="galaxy-hint">Scroll to zoom · drag to pan · click a planet</p>
    {loading ? <p aria-busy="true">Loading galaxy…</p> : error ? <div><p role="alert">{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : !nodes.length ? <p>No galaxy data available.</p> : <>
      <div className="galaxy-stage"><div className="galaxy-canvas-container"><canvas ref={canvasRef} aria-hidden="true" /></div>
        {selected && <aside className="galaxy-details" aria-label={`Details: ${selected.label}`}><h2>{selected.label}</h2><p>{selected.kind === 'core' ? 'Core' : selected.kind === 'system' ? 'System' : selected.role === 'orchestrator' ? 'Agent · Orchestrator' : 'Agent · Worker'}</p>{selected.count !== null && <p>Count: {selected.count}</p>}<ul>{selected.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul><button type="button" onClick={() => setSelectedId(null)}>Close details</button></aside>}
      </div>
      <ul className="galaxy-legend" aria-label="Galaxy systems">{nodes.map(node => <li key={node.id}><button type="button" aria-pressed={node.id === selectedId} onClick={() => setSelectedId(node.id)}>{node.label}</button></li>)}</ul>
    </>}
  </section>;
}

