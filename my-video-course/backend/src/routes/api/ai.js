const express = require('express');
const router = express.Router();
const aiController = require('../../controllers/aiController');

router.get('/status', aiController.checkAIStatus);
router.post('/generate', aiController.generateContent);
router.post('/chatbot', aiController.chatbot);

// Quiz generation
router.get('/quiz/generate/:courseName/:videoId', aiController.generateQuiz);

// Video summaries and todos
router.get('/video/summary/:videoName', aiController.getVideoSummary);
router.get('/video/todos/:courseName/:videoTitle', aiController.getVideoTodos);
router.post('/video/todos/generate', aiController.generateTodos);
router.post('/video/todos/update', aiController.updateTodo);
router.get('/video/todos/progress/:courseName/:videoTitle', aiController.getTodoProgress);

module.exports = router;