import type { GeoPoint, VehicleTelemetry } from "../types";

export class VehicleMotionEngine {
  private frames = new Map<string, { from: GeoPoint; to: GeoPoint; started: number; duration: number }>();

  receive(vehicle: VehicleTelemetry, next: GeoPoint, duration = 1200) {
    this.frames.set(vehicle.id, {
      from: { lat: vehicle.lat, lng: vehicle.lng },
      to: next,
      started: performance.now(),
      duration,
    });
  }

  interpolate(vehicle: VehicleTelemetry): GeoPoint {
    const frame = this.frames.get(vehicle.id);
    if (!frame) return vehicle;
    const progress = Math.min((performance.now() - frame.started) / frame.duration, 1);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    if (progress >= 1) this.frames.delete(vehicle.id);
    return {
      lat: frame.from.lat + (frame.to.lat - frame.from.lat) * eased,
      lng: frame.from.lng + (frame.to.lng - frame.from.lng) * eased,
    };
  }
}
