import { Note } from "../../../../models/Note.js";
import { generateEmbedding } from "../../../../utils/generateEmbedding.js";

// handler used for testing before implementing protected routes
export const getAllNotes = async (_req, res) => {
  try {
    const notes = await Note.find().sort({ createdAt: -1, isPinned: -1 });
    return res.json({
      error: false,
      notes,
      message: "All notes retrieved successfully",
    });
  } catch (err) {
    return res.status(500).json({
      error: true,
      message: "Failed to fetch all notes",
      details: err.message,
    });
  }
};

// handlers used in protected routes
export const addNote = async (req, res) => {
  const { title, content, tags = [], isPinned = false } = req.body;

  const userId = req.user.user._id; // Logged-in user's MongoDB _id

  if (!title) {
    return res.status(400).json({ error: true, message: "Title is required" });
  }

  if (!content) {
    return res
      .status(400)
      .json({ error: true, message: "Content is required" });
  }

  if (!userId) {
    return res
      .status(401)
      .json({ error: true, message: "Unauthorized - no user ID found" });
  }

  try {
    const note = await Note.create({
      title,
      content,
      tags,
      isPinned,
      userId, // 🔥 Save user as ObjectId reference
    });

    return res.status(201).json({
      error: false,
      note,
      message: "Note added successfully",
    });
  } catch (error) {
    console.error("Error creating note:", error);
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

export const getUserNotes = async (req, res) => {
  const { user } = req.user;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limitRaw = parseInt(req.query.limit, 10) || 10;
  const limit = Math.min(Math.max(1, limitRaw), 100);
  const q = (req.query.q || "").toString().trim();

  try {
    const filter = { userId: user._id };

    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [
        { title: { $regex: regex } },
        { content: { $regex: regex } },
        { tags: { $regex: regex } },
      ];
    }

    const total = await Note.countDocuments(filter);
    const notes = await Note.find(filter)
      .sort({ isPinned: -1, createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.json({
      error: false,
      notes,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      message: "Notes retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
      details: error.message,
    });
  }
};

export const editNote = async (req, res) => {
  const noteId = req.params.noteId;
  const { title, content, tags, isPinned } = req.body;
  const { user } = req.user;

  if (!title && !content && !tags) {
    return res
      .status(400)
      .json({ error: true, message: "No changes provided" });
  }

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (isPinned) note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

export const deleteUserNote = async (req, res) => {
  const noteId = req.params.noteId;
  const { user } = req.user;

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    await Note.deleteOne({ _id: noteId, userId: user._id });

    return res.json({
      error: false,
      message: "Note deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

export const togglePin = async (req, res) => {
  const noteId = req.params.noteId;
  const { isPinned } = req.body;
  const { user } = req.user;

  try {
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    note.isPinned = isPinned;

    await note.save();

    return res.json({
      error: false,
      note,
      message: "Note pinned status updated successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

// lexical search
export const searchUserNotes = async (req, res) => {
  const { user } = req.user;
  const { query } = req.query;

  if (!query) {
    return res
      .status(400)
      .json({ error: true, message: "Search query is required" });
  }

  try {
    const matchingNotes = await Note.find({
      userId: user._id,
      $or: [
        { title: { $regex: new RegExp(query, "i") } }, // Case-insensitive title match
        { content: { $regex: new RegExp(query, "i") } }, // Case-insensitive content match
        { tags: { $regex: new RegExp(query, "i") } },
      ],
    });

    return res.json({
      error: false,
      notes: matchingNotes,
      message: "Notes matching the search query retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

export const getNoteById = async (req, res) => {
  const noteId = req.params.noteId;
  const { user } = req.user;

  try {
    // Find the note by ID and ensure it belongs to the logged-in user
    const note = await Note.findOne({ _id: noteId, userId: user._id });

    if (!note) {
      return res.status(404).json({ error: true, message: "Note not found" });
    }

    return res.json({
      error: false,
      note,
      message: "Note retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching note:", error);
    return res.status(500).json({
      error: true,
      message: "Internal Server Error",
    });
  }
};

// this action has vector embedding
export const createNote = async (req, res) => {
  const {
    title,
    content,
    tags = [],
    isPinned = false,
    isPublic = false,
  } = req.body;

  const userId = req.user.user._id; // Logged-in user's MongoDB _id

  if (!title || !content || !userId) {
    return res.status(400).json({
      error: true,
      message: "Title, content, and userId are required",
    });
  }

  try {
    // Generate embedding for the note content
    const embedding = await generateEmbedding(content);

    const note = await Note.create({
      title,
      content,
      tags,
      isPinned,
      isPublic,
      userId,
      embedding, // Store the embedding
    });

    res
      .status(201)
      .json({ error: false, note, message: "Note created successfully" });
  } catch (err) {
    console.error("Error creating note:", err);
    res.status(500).json({ error: true, message: "Failed to create note" });
  }
};
