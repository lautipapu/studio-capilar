import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ corsOrigin: config.corsOrigin });

app.listen(config.port, () => {
  console.log(`API escuchando en el puerto ${config.port}`);
});
