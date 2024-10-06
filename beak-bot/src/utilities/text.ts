export function segment<T>(arr: T[], segmentSize = 5, overlapSize = 2): T[][] {
  if (segmentSize <= 0 || overlapSize < 0) {
    throw new Error('segmentSize must be greater than 0 and overlapSize must be non-negative.');
  }

  if (segmentSize <= overlapSize) {
    throw new Error('segmentSize must be greater than overlapSize.');
  }

  const segments: T[][] = [];

  for (let i = 0; i < arr.length; i += segmentSize - overlapSize) {
    const start = i;
    const end = Math.min(i + segmentSize, arr.length);
    const block = arr.slice(start, end);
    segments.push(block);
  }

  return segments;
}
