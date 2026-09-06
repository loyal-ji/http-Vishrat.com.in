const express = require("express");
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();
const PORT = Number(process.env.PORT) || 10000;

// ===============================
// SERVER SECURITY
// ===============================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  next();
});

// ===============================
// CORS
// ===============================

const ALLOWED_ORIGINS = new Set([
  "https://kgsias01-source.github.io",
  "https://http-vishrat-com-in-1.onrender.com",
  "https://http-vishrat.com.in"
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ===============================
// RATE LIMITER
// ===============================

const rateMap = new Map();

const RATE_WINDOW = 60 * 1000;
const RATE_LIMIT = 120;
const MAX_IPS = 10000;

function rateLimit(req, res, next) {
  const now = Date.now();

  const ip = String(
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );

  const record = rateMap.get(ip);

  if (!record || now - record.start >= RATE_WINDOW) {

    if (rateMap.size >= MAX_IPS) {

      for (const [key, value] of rateMap) {

        if (
          now - value.start >= RATE_WINDOW
        ) {
          rateMap.delete(key);
        }

        if (rateMap.size < MAX_IPS) {
          break;
        }
      }
    }

    rateMap.set(ip, {
      start: now,
      count: 1
    });

    return next();
  }

  record.count++;

  if (record.count > RATE_LIMIT) {

    const retryAfter = Math.max(
      1,
      Math.ceil(
        (
          RATE_WINDOW -
          (now - record.start)
        ) / 1000
      )
    );

    res.setHeader(
      "Retry-After",
      String(retryAfter)
    );

    return res.status(429).json({
      error:
        "Too many requests. Please try again shortly."
    });
  }

  next();
}

app.use(rateLimit);

// ===============================
// REQUEST TIMEOUT
// ===============================

app.use((req, res, next) => {

  req.setTimeout(30000);
  res.setTimeout(30000);

  next();
});

// ===============================
// FIREBASE ADMIN
// ===============================

if (!admin.apps.length) {

  let serviceAccount;

  try {

    // Render Environment Variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {

      serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
      );

    } else {

      // Render Secret File
      const secretFile =
        "/etc/secrets/firebase-service-account.json";

      if (!fs.existsSync(secretFile)) {

        throw new Error(
          `Firebase secret file not found: ${secretFile}`
        );
      }

      serviceAccount = JSON.parse(
        fs.readFileSync(
          secretFile,
          "utf8"
        )
      );
    }

    admin.initializeApp({
      credential:
        admin.credential.cert(serviceAccount)
    });

    console.log(
      "Firebase Admin initialized successfully."
    );

  } catch (error) {

    console.error(
      "FIREBASE INIT ERROR:",
      error.message
    );

    throw error;
  }
}

const db = admin.firestore();

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {

  res.status(200).json({
    status: "ok",
    service: "vishrat-secure-backend"
  });

});

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {

  res.status(200).json({
    status: "ok",
    message:
      "Vishrat Secure Backend is running"
  });

});

// ===============================
// FIREBASE AUTH VERIFY
// ===============================

async function verifyUser(req, res, next) {

  try {

    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {

      return res.status(401).json({
        error: "Login required"
      });

    }

    const idToken =
      authHeader.slice(7).trim();

    if (
      !idToken ||
      idToken.length > 10000
    ) {

      return res.status(401).json({
        error: "Invalid login token"
      });

    }

    req.user =
      await admin
        .auth()
        .verifyIdToken(idToken);

    next();

  } catch (error) {

    console.error(
      "AUTH ERROR:",
      error.message
    );

    return res.status(401).json({
      error:
        "Invalid or expired login"
    });

  }
}

// ===============================
// BATCH ACCESS
// ===============================

app.get(
  "/api/access/:batch",
  verifyUser,
  async (req, res) => {

    try {

      const batch =
        String(
          req.params.batch || ""
        ).trim();

      if (
        !batch ||
        batch.length > 100
      ) {

        return res.status(400).json({
          error: "Invalid batch"
        });

      }

      // ===============================
      // 👑 LOYAL ACCOUNT
      // ===============================

      const userEmail =
        String(
          req.user.email || ""
        )
          .trim()
          .toLowerCase();

      const isLoyalEmail =
        userEmail ===
        "kgsias01@gmail.com";

      console.log(
        "LOYAL EMAIL CHECK:",
        isLoyalEmail,
        "EMAIL:",
        userEmail
      );

      if (isLoyalEmail) {

        const loyalDoc =
          await db
            .collection("users")
            .doc("Loyal")
            .get();

        const loyalData =
          loyalDoc.exists
            ? loyalDoc.data() || {}
            : {};

        console.log(
          "LOYAL FIRESTORE CHECK:",
          {
            documentExists:
              loyalDoc.exists,

            freeAccess:
              loyalData.freeAccess === true,

            freeAccessType:
              typeof loyalData.freeAccess
          }
        );

        if (
          loyalData.freeAccess === true
        ) {

          console.log(
            "LOYAL ACCESS GRANTED:",
            batch
          );

          return res.status(200).json({

            allowed: true,

            free: true,

            batch: batch

          });

        }
      }

      // ===============================
      // NORMAL USER
      // ===============================

      const uid =
        req.user.uid;

      const userDoc =
        await db
          .collection("users")
          .doc(uid)
          .get();

      if (!userDoc.exists) {

        return res.status(403).json({

          allowed: false,

          batch: batch

        });

      }

      const data =
        userDoc.data() || {};

      if (
        data.batches &&
        data.batches[batch] === true
      ) {

        return res.status(200).json({

          allowed: true,

          free: false,

          batch: batch

        });

      }

      return res.status(403).json({

        allowed: false,

        batch: batch

      });

    } catch (error) {

      console.error(
        "ACCESS ERROR:",
        error.message
      );

      return res.status(500).json({

        error:
          "Server temporarily unavailable"

      });

    }

  }
);

// ===============================
// UNKNOWN API ROUTE
// ===============================

app.use("/api", (req, res) => {

  res.status(404).json({
    error: "API route not found"
  });

});

// ===============================
// GLOBAL ERROR HANDLER
// ===============================

app.use(
  (err, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      err.message
    );

    if (res.headersSent) {
      return next(err);
    }

    if (
      err.type ===
      "entity.too.large"
    ) {

      return res.status(413).json({
        error: "Request too large"
      });

    }

    return res.status(500).json({
      error: "Server error"
    });

  }
);

// ===============================
// START SERVER
// ===============================

const server =
  app.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        `Vishrat backend running on port ${PORT}`
      );

    }
  );

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;

// ===============================
// GRACEFUL SHUTDOWN
// ===============================

function shutdown(signal) {

  console.log(
    `${signal} received. Shutting down safely...`
  );

  server.close(() => {

    console.log(
      "HTTP server closed."
    );

    process.exit(0);

  });

  setTimeout(() => {

    console.error(
      "Shutdown timeout."
    );

    process.exit(1);

  }, 10000).unref();

}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "UNHANDLED REJECTION:",
      reason
    );

  }
);
