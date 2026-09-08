import dotenv from "dotenv";

dotenv.config();

export const config = {
  serverPort: Number(process.env.PORT ?? process.env.SERVER_PORT ?? 8087),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:5177",
  flespi: {
    token: process.env.FLESPI_TOKEN ?? "",
    baseUrl: process.env.FLESPI_BASE_URL ?? "https://flespi.io/gw",
    mqttHost: process.env.FLESPI_MQTT_HOST ?? "mqtt.flespi.io",
    mqttPort: Number(process.env.FLESPI_MQTT_PORT ?? 8883),
    mqttUsername: process.env.FLESPI_MQTT_USERNAME ?? "",
    mqttPassword: process.env.FLESPI_MQTT_PASSWORD ?? "",
  },
  traccar: {
    baseUrl: process.env.TRACCAR_BASE_URL ?? "",
    username: process.env.TRACCAR_USERNAME ?? "",
    password: process.env.TRACCAR_PASSWORD ?? "",
  },
  vaporDb: {
    host: process.env.VAPOR_DB_HOST ?? "",
    user: process.env.VAPOR_DB_USER ?? "",
    password: process.env.VAPOR_DB_PASSWORD ?? "",
    port: Number(process.env.VAPOR_DB_PORT ?? 3306),
    database: process.env.VAPOR_DB_NAME ?? "vapor",
    baseDatabase: process.env.VAPOR_BASE_DB_NAME ?? "BD_TITANIA",
    customerDatabase: process.env.VAPOR_CUSTOMER_DB_NAME ?? "s3s_facturacion",
  },
  db: {
    host: process.env.DB_HOST ?? "",
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? "toyotafest_monitoring",
  },
};
