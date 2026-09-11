import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../db/pool";
import type { VehicleTelemetry } from "../utils/telemetry";

export async function upsertVehicle(vehicle: VehicleTelemetry) {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO vehicles (device_id, plate, model, owner_name)
     VALUES (:deviceId, :plate, :model, :owner)
     ON DUPLICATE KEY UPDATE plate = VALUES(plate), model = VALUES(model), owner_name = VALUES(owner_name)`,
    {
      deviceId: vehicle.deviceId,
      plate: vehicle.plate ?? null,
      model: vehicle.model ?? null,
      owner: vehicle.owner ?? null,
    }
  );

  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM vehicles WHERE device_id = :deviceId", {
    deviceId: vehicle.deviceId,
  });
  return Number(rows[0].id);
}

export async function savePosition(vehicle: VehicleTelemetry) {
  const vehicleId = await upsertVehicle(vehicle);
  await pool.execute(
    `INSERT INTO vehicle_positions
      (vehicle_id, latitude, longitude, speed, heading, satellites, ignition, source, recorded_at)
     VALUES
      (:vehicleId, :lat, :lng, :speed, :heading, :satellites, :ignition, :source, FROM_UNIXTIME(:timestamp / 1000))`,
    {
      vehicleId,
      lat: vehicle.lat,
      lng: vehicle.lng,
      speed: vehicle.speed,
      heading: vehicle.heading ?? null,
      satellites: vehicle.satellites ?? null,
      ignition: vehicle.ignition == null ? null : vehicle.ignition ? 1 : 0,
      source: vehicle.source ?? "flespi",
      timestamp: vehicle.timestamp,
    }
  );
  return vehicleId;
}

export async function latestVehicles(limit = 300) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       v.device_id deviceId,
       v.plate,
       v.model,
       p.latitude lat,
       p.longitude lng,
       p.speed,
       p.heading,
       p.satellites,
       p.ignition,
       UNIX_TIMESTAMP(p.recorded_at) * 1000 timestamp
     FROM vehicles v
     JOIN vehicle_positions p ON p.id = (
       SELECT p2.id FROM vehicle_positions p2
       WHERE p2.vehicle_id = v.id
       ORDER BY p2.recorded_at DESC
       LIMIT 1
     )
     ORDER BY p.recorded_at DESC
     LIMIT :limit`,
    { limit }
  );
  return rows;
}

export async function savePositions(vehicles: any[]) {
  for (const vehicle of vehicles) {
    await savePosition(vehicle);
  }
}

export async function recordGeofenceEntries(vehicles: VehicleTelemetry[]) {
  for (const vehicle of vehicles) {
    const vehicleId = await upsertVehicle(vehicle);
    await pool.execute(
      `INSERT INTO vehicle_events
        (vehicle_id, event_type, latitude, longitude, distance_to_event, event_time, metadata)
       SELECT
        :vehicleId, 'GEOFENCE_ENTER', :lat, :lng, :distanceToEvent,
        FROM_UNIXTIME(:timestamp / 1000), JSON_OBJECT('source', :source)
       WHERE NOT EXISTS (
         SELECT 1
         FROM vehicle_events
         WHERE vehicle_id = :vehicleId
           AND event_type = 'GEOFENCE_ENTER'
           AND event_time >= DATE_SUB(FROM_UNIXTIME(:timestamp / 1000), INTERVAL 5 MINUTE)
       )`,
      {
        vehicleId,
        lat: vehicle.lat,
        lng: vehicle.lng,
        distanceToEvent: vehicle.distanceToEvent ?? null,
        timestamp: vehicle.timestamp,
        source: vehicle.source ?? "traccar",
      }
    );
  }
}

export async function geofenceEntriesByDate(date: string) {
  const [entries] = await pool.execute<RowDataPacket[]>(
    `SELECT
       e.id,
       v.device_id deviceId,
       v.plate,
       v.model,
       v.owner_name owner,
       e.latitude lat,
       e.longitude lng,
       UNIX_TIMESTAMP(e.event_time) * 1000 timestamp,
       DATE_FORMAT(e.event_time, '%H:%i:%s') time
     FROM vehicle_events e
     JOIN vehicles v ON v.id = e.vehicle_id
     WHERE e.event_type = 'GEOFENCE_ENTER'
       AND DATE(e.event_time) = :date
     ORDER BY e.event_time DESC
     LIMIT 500`,
    { date }
  );
  const [hourly] = await pool.execute<RowDataPacket[]>(
    `SELECT HOUR(event_time) hour, COUNT(*) total
     FROM vehicle_events
     WHERE event_type = 'GEOFENCE_ENTER'
       AND DATE(event_time) = :date
     GROUP BY HOUR(event_time)
     ORDER BY hour`,
    { date }
  );

  return { entries, hourly };
}

export async function todayRouteByDeviceId(deviceId: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       p.latitude lat,
       p.longitude lng,
       p.speed,
       p.heading,
       UNIX_TIMESTAMP(p.recorded_at) * 1000 timestamp,
       DATE_FORMAT(p.recorded_at, '%H:%i:%s') time
     FROM vehicles v
     JOIN vehicle_positions p ON p.vehicle_id = v.id
     WHERE v.device_id = :deviceId
       AND DATE(p.recorded_at) = CURRENT_DATE
     ORDER BY p.recorded_at ASC
     LIMIT 2000`,
    { deviceId }
  );

  return rows;
}
