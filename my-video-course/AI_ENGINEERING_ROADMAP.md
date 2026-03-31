# AI Engineering Roadmap: Modernization Edition 🚀

This roadmap defines the transition of **Multitouch Academy** from a transcript-based video platform to an **Advanced AI Ecosystem**. We are focusing on implementing high-quality AI native features.

---

## 🏗️ Phase 1: Multi-modal Native RAG (The "Visual Memory" Phase)
**Objective**: Moving beyond "Reading transcripts" to "Watching videos."
> [!IMPORTANT]
> **Implementation Strategy**: We will implement native video indexing using Gemini 1.5 Pro's large context window.

### [NEW] [Multimodal Vector Search](file:///Users/felexirungu/Downloads/ProjectLevi/Javascript/my-video-course/backend/src/services/multimodalSearchService.js)
- **Visual Evidence Indexing**: Extract frames from videos where technical diagrams or code snippets are shown and index them alongside transcripts.
- **Context Caching**: Implement **Gemini Context Caching** for 10-hour courses to provide near-instant semantic search with 90% lower token costs for repetitive queries.
- **Direct Video Ingestion**: Allow the AI Tutor to "see" specific timestamps to answer questions like "Why did the instructor choose that specific VPC CIDR block at 12:45?"

---

## 🤖 Phase 2: Agentic Tool-Use (Mentors with Hands)
**Objective**: Granting the AI Tutor permission to "interact" with the platform metrics.

### [MODIFY] [Agentic AI Service](file:///Users/felexirungu/Downloads/ProjectLevi/Javascript/my-video-course/backend/src/services/aiService.js)
- **Function Calling**: Interface the LLM with `AuthService`, `CourseService`, and `DynamoDB`.
- **Active Remediation**: The AI Mentor can now check a student's technical watch-history and "push" relevant course material to their dashboard proactively.
- **Self-Correction Loop**: If a student's lab submission fails, the AI Mentor should automatically analyze the logs and suggest the exact CLI command to fix it.

---

## 📊 Phase 3: LLM-as-a-Judge (The "Quality Gate" Phase)
**Objective**: Eliminating technical hallucinations through automated evaluation.

### [NEW] [AI Evaluation Service](file:///Users/felexirungu/Downloads/ProjectLevi/Javascript/my-video-course/backend/src/services/evalService.js)
- **Auto-Benchmarking**: Every new prompt version is automatically graded by a "Teacher Model" (Gemini 1.5 Pro) against 100 "Golden Samples" before deployment.
- **Technical Fact-Checking**: Verify that AI-generated summaries and quizzes align 100% with the technical content of the video.
- **Bias & Persona Audit**: Ensure the "David Malan" persona stays encouraging and technically rigorous across all interactions.

---

## 🎨 Phase 4: Generative Lab Architect (Verified Hands-On)
**Objective**: Scalable creation of 100% verified hands-on labs.

### [NEW] [Verified Lab Generator](file:///Users/felexirungu/Downloads/ProjectLevi/Javascript/my-video-course/backend/src/services/labGeneratorService.js)
- **Scenario Generation**: AI generates complex AWS scenarios based on the video (e.g., "Implement a Failover strategy").
- **Real-Time Verification**: The AI uses AWS SDK to verify if the student successfully created the resources in their own sandbox account.
- **Dynamic Curriculum Adaptive**: Labs that change difficulty based on the student's historical "Time-to-Completion" metric.

---

## 🧪 Verification Plan

### Automated Benchmarks
- **Retrieval Precision**: Measure accuracy for video queries.
- **Latency SLAs**: Target < 1.0s for classification and < 3.0s for reasoning.

### Manual Verification
- **User Testing**: Can users successfully complete labs and find information?
- **Retention Impact**: Measure the improvement in course completion.
