// Minimal DOM harness for `bun test`: React DOM needs a browser-like global
// scope, which Bun does not provide. happy-dom supplies the document and the
// element APIs; the handful of globals React touches are forwarded explicitly.
import { Window } from "happy-dom"

const window = new Window({ url: "http://localhost/" })

const forwarded: Record<string, unknown> = {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  DocumentFragment: window.DocumentFragment,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
}

for (const [key, value] of Object.entries(forwarded)) {
  if (!(key in globalThis) || key === "document" || key === "window") {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
}

// Tells React that `act()` is driving the test renderer.
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
})
