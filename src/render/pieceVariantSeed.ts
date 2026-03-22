export function pieceVariantSeed(nodeId: string, stackIndex: number): string {
  return `${nodeId}:${stackIndex}`;
}