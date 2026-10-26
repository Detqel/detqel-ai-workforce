import { testEnvironment } from "./environment.js";
import { envSchema } from "../../src/config/env.js";

export const testConfig = envSchema.parse(testEnvironment);
