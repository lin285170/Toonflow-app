import { AsyncLocalStorage } from "async_hooks";

// 请求级用户上下文：在鉴权中间件注入，AI 调用链等深层异步逻辑可读取当前用户
export const userContext = new AsyncLocalStorage<{ userId: number }>();

export function getUserId(): number {
  return userContext.getStore()?.userId ?? 1;
}
