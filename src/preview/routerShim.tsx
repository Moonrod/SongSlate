/**
 * Web-preview stand-in for the parts of `expo-router` the screens use.
 *
 * The browser preview runs inside a hosted frame where the page address can't
 * be used for routing, so metro.config.js swaps `expo-router` for this module
 * when SYNCSLATE_WEB_PREVIEW=1. Navigation is an in-memory stack; the native
 * app is unaffected and keeps using real expo-router.
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

export type RouteName = 'index' | 'cues' | 'cue' | 'section' | 'report' | 'settings';

export interface PreviewRoute {
  key: string;
  name: RouteName;
  params: Record<string, string>;
}

type Href = string | { pathname: string; params?: Record<string, string> };

let stack: PreviewRoute[] = [{ key: 'index', name: 'index', params: {} }];
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function toRoute(href: Href): PreviewRoute {
  const pathname = typeof href === 'string' ? href : href.pathname;
  const params = typeof href === 'string' ? {} : { ...(href.params ?? {}) };
  const clean = pathname.replace(/^\/+/, '');
  let name: RouteName = 'index';
  if (clean === '' || clean === 'index') name = 'index';
  else if (clean === 'cues') name = 'cues';
  else if (clean === 'report') name = 'report';
  else if (clean === 'settings') name = 'settings';
  else if (clean === 'section') name = 'section';
  else if (clean.startsWith('cue/')) {
    name = 'cue';
    const id = clean.slice(4);
    if (id && id !== '[id]') params.id = id;
  }
  counter += 1;
  return { key: `${name}-${counter}`, name, params };
}

export const router = {
  push(href: Href) {
    const route = toRoute(href);
    if (route.name === 'index') {
      stack = [stack[0]];
    } else {
      stack = [...stack, route];
    }
    emit();
  },
  replace(href: Href) {
    const route = toRoute(href);
    stack = route.name === 'index' ? [stack[0]] : [...stack.slice(0, -1), route];
    emit();
  },
  back() {
    if (stack.length > 1) {
      stack = stack.slice(0, -1);
      emit();
    }
  },
  dismissTo(href: Href) {
    const target = toRoute(href);
    const idx = stack.map((r) => r.name).lastIndexOf(target.name);
    stack = idx >= 0 ? stack.slice(0, idx + 1) : [stack[0]];
    emit();
  },
  canGoBack() {
    return stack.length > 1;
  },
  canDismiss() {
    return stack.length > 1;
  },
  dismissAll() {
    if (stack.length > 1) {
      stack = [stack[0]];
      emit();
    }
  },
};

export function usePreviewStack(): PreviewRoute[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stack,
  );
}

// ---- Per-screen context ----------------------------------------------------------

export interface ScreenOptions {
  title?: string;
  headerRight?: () => ReactNode;
}

interface ScreenContextValue {
  route: PreviewRoute;
  focused: boolean;
  setOptions: (o: ScreenOptions) => void;
}

export const ScreenContext = createContext<ScreenContextValue | null>(null);

function useScreen(): ScreenContextValue {
  const ctx = useContext(ScreenContext);
  if (!ctx) throw new Error('Preview router: screen rendered outside the preview navigator');
  return ctx;
}

export function useLocalSearchParams<T extends Record<string, string>>(): Partial<T> {
  return useScreen().route.params as Partial<T>;
}

/** Runs the callback while the screen is on top; its cleanup runs when it isn't. */
export function useFocusEffect(effect: () => void | (() => void)) {
  const { focused } = useScreen();
  useEffect(() => {
    if (!focused) return;
    return effect();
  }, [focused, effect]);
}

function StackScreen({ options }: { name?: string; options?: ScreenOptions }) {
  const { setOptions } = useScreen();
  useEffect(() => {
    if (options) setOptions(options);
  }, [options, setOptions]);
  return null;
}

/** Only `Stack.Screen` (per-screen header options) is used by screens. */
export const Stack = Object.assign(() => null, { Screen: StackScreen });

export function Link({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** The in-memory navigator is always ready. */
export function useRootNavigationState() {
  return { key: 'preview' };
}

export function useRouter() {
  return router;
}
