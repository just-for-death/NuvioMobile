import EventEmitter from 'eventemitter3';

export const addonEmitter = new EventEmitter();

export const ADDON_EVENTS = {
  ORDER_CHANGED: 'order_changed',
  ADDON_ADDED: 'addon_added',
  ADDON_REMOVED: 'addon_removed',
} as const;
