/**
 * HTTP routes for Convex Auth.
 *
 * Serves the OIDC discovery + JWKS endpoints the backend uses to verify the
 * JWTs issued by `@convex-dev/auth` (convex/auth.ts):
 *
 *   - /.well-known/openid-configuration
 *   - /.well-known/jwks.json
 *
 * Without these routes the backend cannot fetch the public key, so every
 * session would be rejected ("No auth provider found matching the given
 * token"). Requires the `JWKS` env var to be set on the deployment.
 */
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;