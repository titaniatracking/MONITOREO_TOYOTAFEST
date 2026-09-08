export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS vehicles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL UNIQUE,
    plate VARCHAR(32) NULL,
    model VARCHAR(120) NULL,
    owner_name VARCHAR(160) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS vehicle_positions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    speed DECIMAL(8,2) NOT NULL DEFAULT 0,
    heading DECIMAL(8,2) NULL,
    satellites INT NULL,
    ignition TINYINT(1) NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'flespi',
    recorded_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehicle_positions_vehicle_time (vehicle_id, recorded_at),
    CONSTRAINT fk_vehicle_positions_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`,
  `CREATE TABLE IF NOT EXISTS vehicle_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    distance_to_event DECIMAL(8,3) NULL,
    eta_to_event INT NULL,
    event_time DATETIME(3) NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehicle_events_vehicle_time (vehicle_id, event_time),
    INDEX idx_vehicle_events_type_time (event_type, event_time),
    CONSTRAINT fk_vehicle_events_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`,
  `CREATE TABLE IF NOT EXISTS event_geofences (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    geofence_type VARCHAR(40) NOT NULL,
    center_latitude DECIMAL(10,7) NOT NULL,
    center_longitude DECIMAL(10,7) NOT NULL,
    radius_meters INT NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS approach_corridors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    bearing_min DECIMAL(6,2) NOT NULL,
    bearing_max DECIMAL(6,2) NOT NULL,
    radius_meters INT NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS vehicle_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(40) NOT NULL,
    previous_status VARCHAR(40) NULL,
    changed_at DATETIME(3) NOT NULL,
    metadata JSON NULL,
    INDEX idx_vehicle_status_history_vehicle_time (vehicle_id, changed_at),
    CONSTRAINT fk_vehicle_status_history_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_summary (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    summary_date DATE NOT NULL UNIQUE,
    arrivals INT NOT NULL DEFAULT 0,
    departures INT NOT NULL DEFAULT 0,
    active_tracks INT NOT NULL DEFAULT 0,
    max_online INT NOT NULL DEFAULT 0,
    metadata JSON NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];
