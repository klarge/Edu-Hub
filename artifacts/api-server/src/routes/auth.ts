import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, authProvidersTable } from "@workspace/db/schema";
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from "../lib/jwt.js";
import { authenticate } from "../middlewares/auth.js";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// POST /auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.email, email.toLowerCase()), eq(usersTable.isActive, true)));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
});

// POST /auth/logout
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

// GET /auth/me
router.get("/auth/me", authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ─── SAML SSO ─────────────────────────────────────────────────────────────────

router.get("/auth/saml/metadata", async (req: Request, res: Response) => {
  const [provider] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, "saml"));

  if (!provider?.enabled) {
    res.status(404).json({ error: "SAML not configured" });
    return;
  }

  const config = provider.config as Record<string, string>;
  const spEntityId = config["spEntityId"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/metadata`;
  const acsUrl = config["callbackUrl"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/callback`;

  const metadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${spEntityId}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  res.set("Content-Type", "application/xml");
  res.send(metadata);
});

router.get("/auth/saml/login", async (req: Request, res: Response) => {
  const [provider] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, "saml"));

  if (!provider?.enabled) {
    res.status(404).json({ error: "SAML not configured or disabled" });
    return;
  }

  const config = provider.config as Record<string, string>;
  const entryPoint = config["entryPoint"];
  if (!entryPoint) {
    res.status(500).json({ error: "SAML entryPoint not configured" });
    return;
  }

  const spEntityId = config["spEntityId"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/metadata`;
  const acsUrl = config["callbackUrl"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/callback`;

  const id = `_${uuidv4().replace(/-/g, "")}`;
  const issueInstant = new Date().toISOString();
  const authnRequest = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="${issueInstant}" Destination="${entryPoint}" AssertionConsumerServiceURL="${acsUrl}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${spEntityId}</saml:Issuer></samlp:AuthnRequest>`;

  const encoded = Buffer.from(authnRequest).toString("base64");
  const url = new URL(entryPoint);
  url.searchParams.set("SAMLRequest", encoded);

  res.redirect(url.toString());
});

router.post("/auth/saml/callback", async (req: Request, res: Response) => {
  const [provider] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, "saml"));

  if (!provider?.enabled) {
    res.status(404).json({ error: "SAML not configured" });
    return;
  }

  const config = provider.config as Record<string, string>;
  const idpCert = config["cert"];
  const entryPoint = config["entryPoint"];

  // Fail closed — require cert before processing ANY SAML response
  if (!idpCert || !entryPoint) {
    res.status(500).json({
      error: "SAML IdP certificate and entryPoint must be configured before authentication can proceed",
    });
    return;
  }

  const samlResponse = (req.body as Record<string, string>)["SAMLResponse"];
  if (!samlResponse) {
    res.status(400).json({ error: "Missing SAMLResponse" });
    return;
  }

  try {
    // Dynamically import SAML library to avoid esbuild issues with optional deps
    const { SAML, ValidateInResponseTo } = await import("@node-saml/node-saml");

    const spEntityId =
      config["spEntityId"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/metadata`;
    const acsUrl =
      config["callbackUrl"] ?? `${req.protocol}://${req.hostname}/api/auth/saml/callback`;

    const saml = new SAML({
      idpCert,
      issuer: spEntityId,
      entryPoint,
      callbackUrl: acsUrl,
      validateInResponseTo: ValidateInResponseTo.never,
      wantAssertionsSigned: true,
    });

    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    if (!profile) {
      res.status(400).json({ error: "SAML profile is empty" });
      return;
    }

    const email = (profile.email ?? profile.nameID ?? "")
      .toString()
      .toLowerCase()
      .trim();

    if (!email) {
      res.status(400).json({ error: "SAML assertion did not include an email or NameID" });
      return;
    }

    const firstName =
      (profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] as string) ??
      (profile["firstName"] as string) ??
      "Unknown";
    const lastName =
      (profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"] as string) ??
      (profile["lastName"] as string) ??
      "User";

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user) {
      const [created] = await db
        .insert(usersTable)
        .values({
          email,
          firstName,
          lastName,
          role: "user",
          ssoProvider: "saml",
          ssoSubject: profile.nameID ?? email,
        })
        .returning();
      user = created!;
    } else if (!user.isActive) {
      res.status(403).json({ error: "Account is deactivated" });
      return;
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    const frontendUrl = process.env["FRONTEND_URL"] ?? "/";
    res.redirect(frontendUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SAML validation failed";
    res.status(400).json({ error: `SAML processing failed: ${message}` });
  }
});

// ─── OAuth (Google / Microsoft) ───────────────────────────────────────────────

type OAuthProvider = "google" | "microsoft";

// GET /auth/oauth/:provider/login — initiate OAuth flow
router.get("/auth/oauth/:provider/login", async (req: Request, res: Response) => {
  const provider = req.params["provider"] as OAuthProvider;
  if (!["google", "microsoft"].includes(provider)) {
    res.status(404).json({ error: "Unknown provider" });
    return;
  }

  const [providerRow] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, provider));

  if (!providerRow?.enabled) {
    res.status(404).json({ error: `${provider} OAuth not configured or disabled` });
    return;
  }

  const config = providerRow.config as Record<string, string>;
  const clientId = config["clientId"];
  const callbackUrl =
    config["callbackUrl"] ??
    `${req.protocol}://${req.hostname}/api/auth/oauth/${provider}/callback`;

  if (!clientId) {
    res.status(500).json({ error: "OAuth clientId not configured" });
    return;
  }

  const state = uuidv4();
  res.cookie(`oauth_state_${provider}`, state, {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    sameSite: "lax",
  });

  let authUrl: string;
  if (provider === "google") {
    authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: "openid email profile",
        state,
      }).toString();
  } else {
    const tenantId = config["tenantId"] ?? "common";
    authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: "openid email profile User.Read",
        state,
      }).toString();
  }

  res.redirect(authUrl);
});

// GET /auth/oauth/:provider/callback — handle OAuth callback
router.get("/auth/oauth/:provider/callback", async (req: Request, res: Response) => {
  const provider = req.params["provider"] as OAuthProvider;
  if (!["google", "microsoft"].includes(provider)) {
    res.status(404).json({ error: "Unknown provider" });
    return;
  }

  const { code, state } = req.query as Record<string, string>;
  const cookieState = req.cookies?.[`oauth_state_${provider}`] as string | undefined;

  if (!cookieState || cookieState !== state) {
    res.status(400).json({ error: "Invalid OAuth state — possible CSRF attempt" });
    return;
  }

  res.clearCookie(`oauth_state_${provider}`);

  const [providerRow] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, provider));

  if (!providerRow?.enabled) {
    res.status(404).json({ error: "Provider not configured" });
    return;
  }

  const config = providerRow.config as Record<string, string>;
  const clientId = config["clientId"]!;
  const clientSecret = config["clientSecret"]!;

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: "OAuth clientId and clientSecret must be configured" });
    return;
  }

  const callbackUrl =
    config["callbackUrl"] ??
    `${req.protocol}://${req.hostname}/api/auth/oauth/${provider}/callback`;

  try {
    let tokenUrl: string;
    let userInfoUrl: string;

    if (provider === "google") {
      tokenUrl = "https://oauth2.googleapis.com/token";
      userInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
    } else {
      const tenantId = config["tenantId"] ?? "common";
      tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      userInfoUrl = "https://graph.microsoft.com/v1.0/me";
    }

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenData["access_token"] as string | undefined;

    if (!accessToken) {
      const oauthError = (tokenData["error_description"] as string) ?? "Failed to get access token";
      res.status(400).json({ error: oauthError });
      return;
    }

    const userRes = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = (await userRes.json()) as Record<string, unknown>;

    const email = (
      provider === "google"
        ? (userInfo["email"] as string)
        : (userInfo["mail"] as string) || (userInfo["userPrincipalName"] as string)
    )?.toLowerCase();

    const firstName =
      provider === "google"
        ? ((userInfo["given_name"] as string) ?? "")
        : ((userInfo["givenName"] as string) ?? "");

    const lastName =
      provider === "google"
        ? ((userInfo["family_name"] as string) ?? "")
        : ((userInfo["surname"] as string) ?? "");

    const subject =
      provider === "google"
        ? (userInfo["sub"] as string)
        : (userInfo["id"] as string);

    if (!email) {
      res.status(400).json({ error: "Could not retrieve email from OAuth provider" });
      return;
    }

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (!user) {
      const [created] = await db
        .insert(usersTable)
        .values({
          email,
          firstName,
          lastName,
          role: "user",
          ssoProvider: provider,
          ssoSubject: subject,
        })
        .returning();
      user = created!;
    } else if (!user.isActive) {
      res.status(403).json({ error: "Account is deactivated" });
      return;
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    const frontendUrl = process.env["FRONTEND_URL"] ?? "/";
    res.redirect(frontendUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `OAuth processing failed: ${message}` });
  }
});

export default router;
