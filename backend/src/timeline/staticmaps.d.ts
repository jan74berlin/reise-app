declare module 'staticmaps' {
  export default class StaticMaps {
    constructor(opts: any);
    image: { buffer(format?: string): Promise<Buffer>; save(file: string): Promise<void> };
    addLine(opts: any): void;
    addCircle(opts: any): void;
    addMarker(opts: any): void;
    render(): Promise<void>;
  }
}
