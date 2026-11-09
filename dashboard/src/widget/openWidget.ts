export type WidgetHandle = { window: Window; kind: 'picture-in-picture' | 'popup' };

type PictureInPicture = { requestWindow(options: { width: number; height: number }): Promise<Window> };
type Dependencies = { pictureInPicture?: PictureInPicture | undefined; open?: typeof window.open; source?: Document };
const blockedMessage = 'The widget window was blocked. Allow pop-ups for this page and try again.';

export async function openWidget(deps: Dependencies = {}): Promise<{ ok: true; handle: WidgetHandle } | { ok: false; message: string }> {
  try {
    const pip = 'pictureInPicture' in deps ? deps.pictureInPicture : (window as Window & { documentPictureInPicture?: PictureInPicture }).documentPictureInPicture;
    let target: Window | null = null;
    let kind: WidgetHandle['kind'] = 'popup';
    if (pip) {
      try {
        target = await pip.requestWindow({ width: 280, height: 340 });
        kind = 'picture-in-picture';
      } catch { /* Try a popup when Picture-in-Picture is denied. */ }
    }
    if (!target) target = (deps.open ?? window.open.bind(window))('', 'harness-widget', 'popup=yes,width=280,height=340');
    if (!target) return { ok: false, message: blockedMessage };
    const source = deps.source ?? document;
    const base = source.baseURI === 'about:blank' ? document.baseURI : source.baseURI;
    target.document.title = 'Harness';
    for (const node of source.head.querySelectorAll('link[rel~="stylesheet"], style')) {
      if (node.tagName === 'LINK' && new URL(node.getAttribute('href') ?? '', base).origin !== new URL(base).origin) continue;
      target.document.head.appendChild(node.cloneNode(true));
    }
    target.document.body.classList.add('widget-document');
    return { ok: true, handle: { window: target, kind } };
  } catch {
    return { ok: false, message: blockedMessage };
  }
}
