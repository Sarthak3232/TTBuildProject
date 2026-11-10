// Simulates a WebGL/provider failure, exercising the real RouteMap catch/fallback.
export class Map { constructor() { throw new Error("Map unavailable in isolated test harness"); } }
export class NavigationControl {}
export class Marker {}
