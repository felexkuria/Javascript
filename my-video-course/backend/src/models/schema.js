const { z } = require('zod');

/**
 * @file schema.js
 * @description Strict data contracts for AI-generated content in the video ingestion pipeline.
 * Part of Pillar 1: AI Guardrails.
 */

// Schema for Quiz Questions
const QuizSchema = z.array(z.object({
  question: z.string().min(10, "Question must be at least 10 characters long."),
  options: z.array(z.string()).length(4, "Each quiz question must have exactly 4 options."),
  correct: z.number().min(0).max(3, "Correct index must be between 0 and 3."),
  explanation: z.string().min(5, "Explanation must provide meaningful context.").optional()
}));

// Schema for Learning Tasks (Todos)
const TodoSchema = z.array(z.object({
  text: z.string().min(5, "Task description is too short."),
  category: z.enum(['Setup', 'Practice', 'Theory']),
  priority: z.enum(['high', 'medium', 'low']),
  estimatedTime: z.string()
}));

// Schema for Global Video Metadata Enhancement
const VideoMetadataSchema = z.object({
  summary: z.string().max(500, "Summary exceeds the 500-character limit."),
  keyTopics: z.array(z.string()).min(1, "At least one key topic is required."),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  tags: z.array(z.string())
});

module.exports = { QuizSchema, TodoSchema, VideoMetadataSchema };
