import { z } from "zod";

const configSchema = z.object({
  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().positive().default(3000),
  publicOrigin: z.url(),
  sessionSecret: z.string().min(32),
  sessionTtlHours: z.coerce.number().int().positive().default(168),
  sqlitePath: z.string().min(1),
  oidcIssuer: z.url(),
  oidcClientId: z.string().min(1),
  oidcClientSecret: z.string().min(1).optional(),
  oidcScopes: z.string().min(1).default("openid profile email")
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    apiHost: env.API_HOST,
    apiPort: env.API_PORT,
    publicOrigin: env.PUBLIC_ORIGIN,
    sessionSecret: env.SESSION_SECRET,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    sqlitePath: env.SQLITE_PATH,
    oidcIssuer: env.OIDC_ISSUER,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: env.OIDC_CLIENT_SECRET,
    oidcScopes: env.OIDC_SCOPES
  });
}
