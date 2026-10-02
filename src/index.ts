import { Hono } from "hono";

import {
  paymentMiddleware,
} from "@x402/hono";

import {
  HTTPFacilitatorClient,
  x402ResourceServer,
} from "@x402/core/server";

import {
  ExactEvmScheme,
} from "@x402/evm/exact/server";


const app = new Hono();


// ============================================================
// CONFIGURATION
// ============================================================

const PAY_TO =
  "0x74d967874bc82f62321edFca05aE1662a65F31d8";

const NETWORK =
  "eip155:84532";

const FACILITATOR_URL =
  "https://x402.org/facilitator";

const BACKEND_URL =
  "https://dependency-risk-api.giraffehorse.workers.dev";


// ============================================================
// FACILITATOR
// ============================================================

const facilitator =
  new HTTPFacilitatorClient({
    url: FACILITATOR_URL,
  });


// ============================================================
// x402 SERVER
// ============================================================

const server =
  new x402ResourceServer(facilitator);

server.register(
  NETWORK,
  new ExactEvmScheme(),
);


// ============================================================
// FREE ROUTES
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

    server,
  ),
);


// ============================================================
// PAID ENDPOINT
// ============================================================

app.get(
  "/check-package",
  async (c) => {

    const packageName =
      c.req.query("package");

    const ecosystem =
      c.req.query("ecosystem");

    const version =
      c.req.query("version");


    if (
      !packageName ||
      !ecosystem ||
      !version
    ) {
      return c.json(
        {
          error:
            "Missing required parameters.",

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


    try {

      const response =
        await fetch(
          backendUrl.toString(),
          {
            method: "GET",

            headers: {
              "Accept":
                "application/json",
            },
          },
        );


      const body =
        await response.text();


      return new Response(
        body,
        {
          status:
            response.status,

          headers: {
            "Content-Type":
              response.headers.get(
                "Content-Type",
              ) ||
              "application/json",
          },
        },
      );

    } catch {

      return c.json(
        {
          error:
            "DependencyRisk backend unavailable.",
        },
        502,
      );
    }
  },
);


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
// CLOUDFLARE WORKER
// ============================================================

export default app;
