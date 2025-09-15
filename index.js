import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import apiRoutes from "./api/v1/routes.js";
import { connectMongo } from "./config/mongo.js";
import { connectTurso, db } from "./config/turso.js";
import limiter from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorHandler.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

// Global middlewares
app.use(helmet());

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "https://rag-notes.vercel.app",
  ], // frontend domain
  credentials: true, // ✅ allow cookies to be sent
};

app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json());
app.use(cookieParser());
// Centralized routes
app.use("/", apiRoutes(db));
app.get("/", (_req, res) => {
  res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Notes API</title>
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: #f7f9fc;
            color: #333;
            text-align: center;
            padding: 50px;
          }
          h1 {
            font-size: 2.5rem;
            color: #2c3e50;
          }
          p {
            font-size: 1.2rem;
            margin-top: 1rem;
          }
          code {
            background: #eee;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-size: 0.95rem;
          }
          .container {
            max-width: 600px;
            margin: auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📒 Welcome to the Notes API</h1>
          <p>This is a simple REST API built with <strong>Express</strong> and <strong>LibSQL</strong>.</p>
          <p>Try creating a note via <code>POST /notes</code> or explore routes like <code>/users</code> and <code>/notes-with-authors</code>.</p>
          <p>Use a REST client like <em>VSCode REST Client</em> or <em>Postman</em> to interact.</p>
          <p>✨ Happy coding!</p>
        </div>
      </body>
      </html>
    `);
});
// Centralized error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectMongo();
    await connectTurso();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on port ${PORT} ✅`);
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
})();

// Handle unhandled promise rejections globally
process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err.message);
  process.exit(1);
});
