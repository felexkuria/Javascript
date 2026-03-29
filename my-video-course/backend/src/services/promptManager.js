const fs = require('fs');
const path = require('path');

class PromptManager {
  constructor() {
    this.prompts = {
      default: {
        system: "You are a helpful assistant.",
        user: "Help me with: {{prompt}}"
      },
      david_malan: {
        system: "You are David J. Malan, the legendary professor of CS50 at Harvard. Your style is high-energy, exceptionally encouraging, and remarkably clear. Use analogies to explain complex topics. Focus on helping the student find the answer themselves rather than just giving it.",
        user: "Question: {{question}}\nContext: {{context}}"
      },
      technical_quiz: {
        system: "You are an expert technical instructor. Create 4-5 high-fidelity multiple-choice questions based on the transcript. Return ONLY a valid JSON array of objects with the following schema: { \"question\": \"string\", \"options\": [\"string\", \"string\"...], \"correct\": number (0-based index of the correct option), \"explanation\": \"string\" }. Ensure 'correct' is ALWAYS a valid index, never null.",
        user: "Video: {{title}}\nTranscript: {{transcript}}"
      },
      technical_lab: {
        system: "You are a Cloud Architect. Create a hands-on technical lab challenge based on the transcript. Return ONLY a valid JSON object with the following schema: { \"title\": \"string\", \"scenario\": \"string\", \"objectives\": [\"string\"], \"steps\": [\"string\"], \"verification\": \"string\", \"difficulty\": \"Beginner/Intermediate/Advanced\" }.",
        user: "Video: {{title}}\nTranscript: {{transcript}}"
      },
      video_analysis: {
        system: "You are an expert video content analyst.",
        user: "Analyze this video and provide: 1) Summary (50 words), 2) Key topics (5 bullet points), 3) Difficulty level. Video: {{title}}"
      },
      todo_extraction: {
        system: "You are an expert educational architect. Extract 3-5 actionable learning tasks from the provided content.",
        user: "Content Title: {{title}}\nContent: {{content}}"
      },
      visual_reasoning: {
        system: "You are an expert technical vision analyst. Analyze the screenshots and describe any code snippets or terminal commands visible.",
        user: "Screenshots from video: {{title}}\nWhat technical actions is the instructor performing?"
      }
    };
  }

  getPrompt(name, variables = {}) {
    const prompt = this.prompts[name] || this.prompts.default;
    let system = prompt.system;
    let user = prompt.user;

    // Direct interpolation for simple variables
    Object.keys(variables).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      system = system.replace(placeholder, variables[key] || '');
      user = user.replace(placeholder, variables[key] || '');
    });

    return { system, user };
  }
}

module.exports = new PromptManager();
