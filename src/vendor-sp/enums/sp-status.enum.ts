export enum SpStatus {
  INACTIVE = 0,
  ACTIVE = 1,
  COMPLETED = 2,
  CANCELLED = 3,
  EXTENDED = 4, // Adding EXTENDED as per previous context
}

export enum SpLevel {
  SP1 = 1,
  SP2 = 2,
  SP3 = 3,
}

export const SP_DURATION_DAYS = 90;

export const SP_THRESHOLDS = {
  SP1: { min: 1, max: 25 },
  SP2: { min: 26, max: 50 },
  SP3: { min: 51, max: Infinity },
};
