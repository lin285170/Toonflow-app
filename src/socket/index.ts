import { Server } from "socket.io";
import productionAgent from "./routes/productionAgent";
import scriptAgent from "./routes/scriptAgent";

export default (io: Server) => {
  const routes: Record<string, (nsp: ReturnType<Server["of"]>) => void> = {
    productionAgent,
    scriptAgent,
  };

  for (const [name, handler] of Object.entries(routes)) {
    // 同时注册带 /api 前缀和不带前缀的命名空间，兼容前端 baseUrl=/ 或 /api 两种配置
    for (const prefix of ["/api/socket", "/socket"]) {
      const nsp = io.of(`${prefix}/${name}`);
      handler(nsp);
      console.log(`[Socket] 注册命名空间: ${prefix}/${name}`);
    }
  }
};
