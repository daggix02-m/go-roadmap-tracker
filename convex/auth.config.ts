/**
 * Auth provider config for the Convex backend's JWT verifier.
 *
 * This is what lets the backend accept the RS256 JWTs issued by
 * `@convex-dev/auth` (convex/auth.ts): the library signs tokens with
 * `iss = CONVEX_SITE_URL` and `aud = "convex"`, so we declare our own site
 * as an OIDC provider and the backend verifies signatures against the
 * `/.well-known/jwks.json` served by convex/http.ts.
 *
 * Without this file the backend reports "No auth provider found matching
 * the given token (no providers configured)" and every authenticated
 * function fails with "Not authenticated".
 *
 * @see https://labs.convex.dev/auth/setup/manual
 */
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex"
    }
  ]
} satisfies AuthConfig;