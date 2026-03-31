const AIService = require('../src/services/aiService');
const { QuizSchema } = require('../src/models/schema');
const assert = require('assert');

/**
 * 🧪 Test Scenario 1: AI Schema & Guardrails Validation
 * Objective: Verify that Zod catches malformed JSON and triggers a retry.
 */
async function testAIValidation() {
  console.log("🚀 Starting AI Schema Hardening Test...");

  // Mock Nova Client response
  let callCount = 0;
  const originalGenerate = AIService.generateWithNova.bind(AIService);

  AIService.generateWithNova = async (prompt, systemPrompt) => {
    callCount++;
    console.log(`📡 Mocking AI Response (Call #${callCount})...`);

    if (callCount === 1) {
      // 1. First call: Return malformed JSON + filler
      return "Here is your summary: { \"question\": \"What is SOTA?\", \"options\": [\"A\", \"B\", \"C\"], \"correct\": \"invalid_str\" }";
    }
    
    // 2. Second call (Retry): Return valid JSON
    return JSON.stringify([{
      question: "What is the primary benefit of Step Functions?",
      options: ["State Management", "Cost", "Latency", "Security"],
      correct: 0,
      explanation: "Step Functions provide native state management and coordination."
    }]);
  };

  try {
    const transcript = "Step Functions are great for state management.";
    const title = "Orchestration Deep Dive";
    
    console.log("🏃 Executing generateQuizQuestions...");
    const quiz = await AIService.generateQuizQuestions(transcript, title);

    // Assertions
    assert.strictEqual(callCount, 2, "Should have triggered exactly ONE retry.");
    assert.ok(Array.isArray(quiz), "Result should be an array.");
    assert.strictEqual(quiz[0].question, "What is the primary benefit of Step Functions?", "Should have recovered valid data.");
    
    console.log("✅ SCENARIO 1 PASSED: AI Schema retry and correction successful.");

  } catch (err) {
    console.error("❌ SCENARIO 1 FAILED:", err.message);
    process.exit(1);
  } finally {
    // Restore original method
    AIService.generateWithNova = originalGenerate;
  }
}

testAIValidation();
