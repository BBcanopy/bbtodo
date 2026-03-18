import { z } from "zod";

const configSchema = z.object({
  clientUrl: z.url(),
  sessionSecret: z.string().min(32),
  oidcIssuer: z.url(),
  oidcClientId: z.string().min(1),
  oidcClientSecret: z.string().min(1).optional(),
  oidcScopes: z.string().min(1).default("openid profile email")
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    clientUrl: env.CLIENT_URL,
    sessionSecret: env.SESSION_SECRET,
    oidcIssuer: env.OIDC_ISSUER,
    oidcClientId: env.OIDC_CLIENT_ID,
    oidcClientSecret: env.OIDC_CLIENT_SECRET,
    oidcScopes: env.OIDC_SCOPES
  });
}
