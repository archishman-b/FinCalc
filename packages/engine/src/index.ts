export * from './types';
export * from './rates';
export * from './amortization';
export * from './compounding';
export * from './xirr';
export * from './inflation';
export * from './tax';
export * from './positions';
export * from './comparator';

/** Bumped when the engine's numeric behaviour changes, so exported CSVs and shared URLs can say which engine produced them. */
export const ENGINE_VERSION = '0.0.1';
