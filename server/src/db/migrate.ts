import { config } from "../config";
import { createServerPool, pool } from "./pool";
import { schemaStatements } from "./schema";

async function migrate() {
  const rootPool = createServerPool();
  await rootPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await rootPool.end();

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }

  await pool.query(
    `INSERT INTO event_geofences (name, geofence_type, center_latitude, center_longitude, radius_meters, metadata)
     SELECT 'Toyota Experience Fest', 'EVENT_PERIMETER', -0.0212638, -78.4483948, 550, JSON_OBJECT(
       'source', 'provided_polygon',
       'format', 'lat_lng_polygon',
       'polygon', JSON_ARRAY(
         JSON_OBJECT('lat', -0.020209702295415, 'lng', -78.451972885051),
         JSON_OBJECT('lat', -0.022763165097831, 'lng', -78.451844139019),
         JSON_OBJECT('lat', -0.022848995779510, 'lng', -78.446232957760),
         JSON_OBJECT('lat', -0.021121653301151, 'lng', -78.445321006694),
         JSON_OBJECT('lat', -0.020435007838491, 'lng', -78.447241468349),
         JSON_OBJECT('lat', -0.020198973460024, 'lng', -78.447756452480)
       )
     )
     WHERE NOT EXISTS (SELECT 1 FROM event_geofences WHERE geofence_type = 'EVENT_PERIMETER')`
  );

  await pool.query(
    `UPDATE event_geofences
     SET center_latitude = -0.0212638,
         center_longitude = -78.4483948,
         metadata = JSON_OBJECT(
           'source', 'provided_polygon',
           'format', 'lat_lng_polygon',
           'polygon', JSON_ARRAY(
             JSON_OBJECT('lat', -0.020209702295415, 'lng', -78.451972885051),
             JSON_OBJECT('lat', -0.022763165097831, 'lng', -78.451844139019),
             JSON_OBJECT('lat', -0.022848995779510, 'lng', -78.446232957760),
             JSON_OBJECT('lat', -0.021121653301151, 'lng', -78.445321006694),
             JSON_OBJECT('lat', -0.020435007838491, 'lng', -78.447241468349),
             JSON_OBJECT('lat', -0.020198973460024, 'lng', -78.447756452480)
           )
         )
     WHERE geofence_type = 'EVENT_PERIMETER'`
  );

  await pool.query(
    `INSERT INTO approach_corridors (name, bearing_min, bearing_max, radius_meters, metadata)
     SELECT name, bearing_min, bearing_max, 10000, JSON_OBJECT('source', 'initial_seed')
     FROM (
      SELECT 'APPROACH CORRIDOR NORTH' name, 315 bearing_min, 45 bearing_max
      UNION ALL SELECT 'APPROACH CORRIDOR EAST', 45, 135
      UNION ALL SELECT 'APPROACH CORRIDOR SOUTH', 135, 225
      UNION ALL SELECT 'APPROACH CORRIDOR WEST', 225, 315
     ) seed
     WHERE NOT EXISTS (SELECT 1 FROM approach_corridors)`
  );

  await pool.end();
  console.log(`Database ready: ${config.db.database}`);
}

migrate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
