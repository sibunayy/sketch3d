// The test hook the app exposes in development (see src/main.tsx). One declaration, shared by every browser test.
export {};

declare global {
  interface Window {
    __sketch3d: {
      app: {
        doc: { value: { parts: { id: string; z: number; depthMm: number; round: number; color: string; cut: boolean; outline: number[][] }[]; grooves: unknown[]; dabs: unknown[] } };
        selection: { value: Set<string> };
        view: { value: string };
        tool: { value: string };
        canUndo: { value: boolean };
        select: (ids: string[]) => void;
      };
      screenOf: (p: [number, number, number]) => [number, number] | null;
      cameraDistance: () => number;
      latestMesh: { value: { mesh: { positions: Float32Array } } | null };
    };
  }
}
