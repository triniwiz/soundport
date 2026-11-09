/** Minimal DevTools-protocol client for one page target. */
export class CdpPage {
  private nextId = 0;
  private readonly pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  private readonly listeners = new Map<string, Set<(params: any) => void>>();
  private closeListeners = new Set<() => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event: MessageEvent) => this.receive(String(event.data)));
    socket.addEventListener('close', () => {
      this.pending.forEach((p) => p.reject(new Error('The browser closed')));
      this.pending.clear();
      this.closeListeners.forEach((listener) => listener());
    });
  }

  /** Connects to the first page whose URL starts with `urlPrefix`, waiting for it to appear. */
  static async connect(port: number, urlPrefix: string, timeoutMs = 30000): Promise<CdpPage> {
    const started = Date.now();
    for (;;) {
      try {
        const targets: any[] = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const target = targets.find((t) => t.type === 'page' && String(t.url).startsWith(urlPrefix));
        if (target?.webSocketDebuggerUrl) {
          const socket = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise<void>((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true } as any);
            socket.addEventListener('error', () => reject(new Error('Could not connect to the browser')), {
              once: true,
            } as any);
          });
          return new CdpPage(socket);
        }
      } catch {
        // Not up yet.
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error('The browser did not open the player in time');
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, listener: (params: any) => void) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  onClose(listener: () => void) {
    this.closeListeners.add(listener);
  }

  close() {
    this.socket.close();
  }

  private receive(text: string) {
    let message: any;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        const { message: text = 'DevTools error', data } = message.error;
        pending.reject(new Error(data ? `${text}: ${data}` : text));
      } else {
        pending.resolve(message.result);
      }
    } else if (message.method) {
      this.listeners.get(message.method)?.forEach((listener) => listener(message.params));
    }
  }
}
