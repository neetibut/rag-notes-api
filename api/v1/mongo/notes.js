import express from "express";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { Note } from "../../../models/Note.js";
import {
  getAllNotes,
  createNote,
  addNote,
  editNote,
  togglePin,
  getUserNotes,
  deleteUserNote,
  searchUserNotes,
  getNoteById,
} from "./controllers/notesController.js";
import { authUser } from "../../../middleware/auth.js";
import { User } from "../../../models/User.js";
import mongoose from "mongoose";
import { generateEmbedding } from "../../../utils/generateEmbedding.js";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Add your OpenAI API key to the .env file
});

const router = express.Router();

// Use these routes without auth
// 📋 GET ALL NOTES (regardless of user)
router.get("/notes", getAllNotes);

router.post("/notes", createNote);

// Use these routes after implementing auth

// Add Note
// router.post("/add-note", authUser, addNote);
router.post("/add-note", authUser, createNote);

// Edit Note
router.put("/edit-note/:noteId", authUser, editNote);

// Get all Notes by user
router.get("/get-all-notes", authUser, getUserNotes);

// Delete Note
router.delete("/delete-note/:noteId", authUser, deleteUserNote);

// Search Notes
router.get("/search-notes", authUser, searchUserNotes);

// Get a note by ID (protected route)
router.get("/get-note/:noteId", authUser, getNoteById);

// Update note visibility (publish/unpublish)
router.put("/notes/:noteId/visibility", authUser, async (req, res) => {
  const { isPublic } = req.body;
  const { user } = req.user;

  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.noteId, userId: user._id }, // Ensure the note belongs to the user
      { isPublic },
      { new: true } // Return the updated note
    );

    if (!note) {
      return res
        .status(404)
        .json({ error: true, message: "Note not found or unauthorized" });
    }

    res.status(200).json({ error: false, note });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Server error" });
  }
});

// Routes for Public View

// Get public profile by user ID
router.get("/public-profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "fullName email"
    );
    if (!user) {
      return res.status(404).json({ error: true, message: "User not found" });
    }
    res.status(200).json({ error: false, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Server error" });
  }
});

// Get public notes for a user
router.get("/public-notes/:userId", async (req, res) => {
  const { userId } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limitRaw = parseInt(req.query.limit, 10) || 10;
  const limit = Math.min(Math.max(1, limitRaw), 100);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: true, message: "Invalid user ID" });
  }

  try {
    const filter = { userId, isPublic: true };
    const total = await Note.countDocuments(filter);
    const notes = await Note.find(filter)
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      error: false,
      notes,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: true, message: "Server error", details: err.message });
  }
});

// Search notes using vector embeddings
router.post("/search-notes", authUser, async (req, res) => {
  const { query } = req.body;
  const userId = req.user.user._id;

  if (!query) {
    return res.status(400).json({ error: true, message: "Query is required" });
  }

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Perform vector search in MongoDB
    const results = await Note.aggregate([
      {
        $vectorSearch: {
          index: "vector_index", // Ensure this matches your Lucene vector index name
          queryVector: queryEmbedding, // The embedding vector for the query
          path: "embedding", // Path to the embedding field in the schema
          k: 5, // Number of nearest neighbors to retrieve
          numCandidates: 100,
          limit: 5,
          filter: {
            userId: userId, // Filter notes by the logged-in user's ID
          },
        },
      },
    ]);

    if (!results || results.length === 0) {
      return res
        .status(404)
        .json({ error: true, message: "No matching notes found" });
    }

    res.status(200).json({ error: false, results });
  } catch (err) {
    console.error("Error performing vector search:", err);
    res.status(500).json({
      error: true,
      message: "Failed to perform search",
      details: err.message,
    });
  }
});

// Answer a question based on a user's notes
// router.post("/answer-question/:userId", async (req, res) => {
//   const { userId } = req.params;
//   const { question } = req.body;

//   if (
//     !question ||
//     typeof question !== "string" ||
//     question.trim().length === 0
//   ) {
//     return res.status(400).json({
//       error: true,
//       message: "Question is required and must be a non-empty string",
//     });
//   }

//   if (!mongoose.Types.ObjectId.isValid(userId)) {
//     return res.status(400).json({ error: true, message: "Invalid user ID" });
//   }

//   try {
//     // Retrieve the user's public notes
//     const notes = await Note.find({ userId, isPublic: true }).select(
//       "title content"
//     );

//     if (!notes || notes.length === 0) {
//       return res
//         .status(404)
//         .json({ error: true, message: "No public notes found for this user" });
//     }

//     // Combine the notes into a single context
//     const context = notes
//       .map((note) => `Title: ${note.title}\nContent: ${note.content}`)
//       .join("\n\n");

//     // Generate an AI response using OpenAI
//     const prompt = `
//       You are an AI assistant. Answer the following question based on the provided notes:
//       Notes:
//       ${context}
//       Question: ${question}
//       Answer:
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [
//         { role: "system", content: "You are an AI assistant." },
//         { role: "user", content: prompt },
//       ],
//       max_tokens: 300,
//       temperature: 0.7,
//     });

//     const answer = response.choices[0].message.content.trim();

//     res.status(200).json({ error: false, answer });
//   } catch (err) {
//     console.error("Error answering question:", err);
//     res.status(500).json({
//       error: true,
//       message: "Failed to answer question",
//       details: err.message,
//     });
//   }
// });

// Answer a question based on a user's notes, using vector search
router.post("/answer-question/:userId", async (req, res) => {
  const { userId } = req.params;
  const { question } = req.body;

  // … validation omitted for brevity …

  // 1️⃣ Generate an embedding for the question
  const questionEmbedding = await generateEmbedding(question);

  // 2️⃣ Run vector-search against your notes collection
  const topNotes = await Note.aggregate([
    {
      $vectorSearch: {
        index: "vector_index", // your vector index name
        queryVector: questionEmbedding,
        path: "embedding", // where embeddings are stored
        k: 5, // top 5 similar notes
        numCandidates: 100,
        limit: 5,
        filter: { userId, isPublic: true },
      },
    },
  ]);

  if (!topNotes.length) {
    return res
      .status(404)
      .json({ error: true, message: "No relevant notes found" });
  }

  // 3️⃣ Build context from only those top hits
  const context = topNotes
    .map((n) => `Title: ${n.title}\nContent: ${n.content}`)
    .join("\n\n");

  // 4️⃣ Ask OpenAI using just that filtered context
  const prompt = `
You are an AI assistant. Based on the notes below, answer the question.
Notes:
${context}

Question: ${question}
Answer:
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an AI assistant." },
      { role: "user", content: prompt },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  res.json({
    error: false,
    answer: response.choices[0].message.content.trim(),
  });
});

// ❌ Routes not used by Frontend
// Update isPinned
router.put("/update-note-pinned/:noteId", authUser, togglePin);

export default router;
