import { useCallback, useEffect, useRef } from 'react';
import { useConfigurator } from '../ConfiguratorContext';
import type { PriceQuote } from '@core/contracts';
import { fingerprint, exportConfig } from '@core/serialization';
import {
  allowedOrigins,
  acceptsOrigin,
  validateIncoming,
  type OutgoingType,
} from './protocol';
export function useEmbedBridge(quote: PriceQuote | null, status: string) {
  const { store, actions } = useConfigurator(),
    origin = useRef<string | null>(null),
    publishRef = useRef<() => void>(() => {}),
    latest = useRef({ quote, status });
  useEffect(() => {
    latest.current = { quote, status };
  }, [quote, status]);
  const send = useCallback((type: OutgoingType, payload: unknown) => {
    if (window.parent === window) return;
    const allowed = allowedOrigins(
        import.meta.env.VITE_ALLOWED_PARENT_ORIGINS,
        import.meta.env.DEV,
      ),
      targets = origin.current ? [origin.current] : allowed;
    for (const target of targets)
      window.parent.postMessage(
        { source: 'canopy-configurator', version: 1, type, payload },
        target,
      );
  }, []);
  useEffect(() => {
    if (window.parent === window) return;
    const allowed = allowedOrigins(
      import.meta.env.VITE_ALLOWED_PARENT_ORIGINS,
      import.meta.env.DEV,
    );
    try {
      const referrer = new URL(document.referrer).origin;
      if (acceptsOrigin(referrer, allowed)) origin.current = referrer;
    } catch {
      /* Referrer may be suppressed; target exact allowlisted origins instead. */
    }
    let timer: ReturnType<typeof setTimeout> | undefined,
      sequence = 0;
    const publish = () => {
      if (timer) clearTimeout(timer);
      const version = ++sequence;
      timer = setTimeout(() => {
        const config = exportConfig(store.getState().config);
        void fingerprint(config).then((hash) => {
          if (version === sequence)
            send('config-changed', {
              config,
              configHash: hash,
              total:
                latest.current.status === 'idle'
                  ? (latest.current.quote?.total ?? null)
                  : null,
            });
        });
      }, 300);
    };
    const receive = (event: MessageEvent) => {
      const message = validateIncoming(
        event.data,
        event.origin,
        allowed,
        event.source === window.parent,
      );
      if (!message) return;
      origin.current = event.origin;
      let result;
      switch (message.type) {
        case 'load-config':
          result = actions.loadConfig(message.payload.config);
          break;
        case 'set-variant':
          result = actions.setVariant(message.payload.variantId);
          break;
        case 'set-quantity':
          result = actions.setQuantity(message.payload.quantity);
          break;
        case 'request-config':
          publish();
          return;
        case 'set-theme':
          for (const [key, value] of Object.entries(message.payload.variables))
            document.documentElement.style.setProperty(key, value);
          return;
      }
      if (result && !result.ok)
        send('error', {
          code: 'INVALID_CONFIG',
          message: result.issues.map((i) => i.message).join(', '),
        });
    };
    publishRef.current = publish;
    window.addEventListener('message', receive);
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.config !== previous.config) publish();
    });
    let lastHeight = 0,
      frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const app = document.querySelector('.app');
        const height = Math.ceil(
          app?.getBoundingClientRect().height ?? document.body.scrollHeight,
        );
        if (height !== lastHeight) {
          lastHeight = height;
          send('resize', { height });
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.querySelector('.app') ?? document.body);
    send('ready', { productId: store.getState().config.productId });
    resize();
    publish();
    return () => {
      sequence++;
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('message', receive);
    };
  }, [store, actions, send]);
  useEffect(() => {
    publishRef.current();
  }, [quote, status]);
  return send;
}
