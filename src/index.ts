import { Hono } from "hono";

import {
  paymentMiddleware,
  x402ResourceServer,
} from "@x402/hono";

import { HTTPFacilitatorClient } from "@x402/core/server";

import { registerExactEvmScheme } from "@x402/evm/exact/server";


// ============================================================
// APP
// ============================================================

const app = new Hono();


// ============================================================
// CONFIGURATION
// ============================================================

// Your public receiving wallet
const PAY_TO = "0x8AfE91fBc483aB8a64F51ED81E15FFe151E19Bf9";

// Base Sepolia testnet
const NETWORK = "eip155:84532";

// x402 facilitator
const FACILITATOR_URL = "https://x402.org/facilitator";

// Your already-working Python backend
const BACKEND_URL =
  "https://dependency-risk-api.giraffehorse.workers.dev";


// ============================================================
// x402 FACILITATOR
// ============================================================

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});


// ============================================================
// x402 RESOURCE SERVER
// ============================================================

const resourceServer =
  new x402ResourceServer(facilitatorClient);


// Register EVM exact-payment support
registerExactEvmScheme(resourceServer);


// ============================================================
// FREE ROOT ENDPOINT
// ============================================================

app.get("/", (c) => {
  return c.json({
    name: "DependencyRisk x402 Gateway",
    version: "1.0.0",
    status: "online",
    service: "dependency-security-intelligence",
    payment: "x402",
    network: NETWORK,
  });
});


// ============================================================
// FREE HEALTH ENDPOINT
// ============================================================

app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    gateway: "online",
  });
});


// ============================================================
// x402 PAYMENT MIDDLEWARE
// ============================================================

app.use(
  paymentMiddleware(
    {
      "GET /check-package": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: NETWORK,
            payTo: PAY_TO,
          },
        ],

        description:
          "Check a package version for known security vulnerabilities.",

        mimeType: "application/json",
      },
    },

    resourceServer,
  ),
);


// ============================================================
// PAID CHECK-PACKAGE ENDPOINT
// ============================================================

app.get("/check-package", async (c) => {

  const packageName =
    c.req.query("package");

  const ecosystem =
    c.req.query("ecosystem");

  const version =
    c.req.query("version");


  // ----------------------------------------------------------
  // Validate request
  // ----------------------------------------------------------

  if (!packageName || !ecosystem || !version) {
    return c.json(
      {
        error: "Missing required parameters.",

        required: [
          "package",
          "ecosystem",
          "version",
        ],

        example:
          "/check-package?package=requests&ecosystem=PyPI&version=2.31.0",
      },
      400,
    );
  }


  // ----------------------------------------------------------
  // Build backend request
  // ----------------------------------------------------------

  const backendUrl =
    new URL(
      "/check-package",
      BACKEND_URL,
    );


  backendUrl.searchParams.set(
    "package",
    packageName,
  );

  backendUrl.searchParams.set(
    "ecosystem",
    ecosystem,
  );

  backendUrl.searchParams.set(
    "version",
    version,
  );


  // ----------------------------------------------------------
  // Call Python DependencyRisk API
  // ----------------------------------------------------------

  try {

    const response =
      await fetch(
        backendUrl.toString(),
        {
          method: "GET",

          headers: {
            "Accept": "application/json",
          },
        },
      );


    const body =
      await response.text();


    return new Response(
      body,
      {
        status: response.status,

        headers: {
          "Content-Type":
            response.headers.get(
              "Content-Type",
            ) ||
            "application/json",
        },
      },
    );

  } catch (error) {

    return c.json(
      {
        error:
          "DependencyRisk backend unavailable.",
      },
      502,
    );
  }
});


// ============================================================
// 404
// ============================================================

app.notFound((c) => {
  return c.json(
    {
      error: "Endpoint not found.",
    },
    404,
  );
});


// ============================================================
// CLOUDFLARE WORKER EXPORT
// ============================================================

export default app;
