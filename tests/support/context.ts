import { inject } from "vitest";
export type TestEnvironment = {
  appUrl: string;
  supabaseUrl: string;
  anonKey: string;
  aliceToken: string;
  bobToken: string;
  outsiderToken: string;
};
declare module "vitest" {
  export interface ProvidedContext {
    environment: TestEnvironment;
  }
}
export const environment = () => inject("environment");
export function request(path: string, options: RequestInit = {}) {
  return fetch(`${environment().appUrl}${path}`, options);
}
