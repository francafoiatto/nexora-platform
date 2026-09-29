import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { session } from '../lib/session';

// jsdom does not implement <dialog> modality; emulate the parts the app relies on.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => undefined;

afterEach(() => {
  cleanup();
  session.clear();
  localStorage.clear();
});
