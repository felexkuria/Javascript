/**
 * Atlas Learning Platform - Video Quiz Functions
 * Handles interactive quiz triggers and state within the video lab.
 */

window.videoQuizSystem = {
    isInitialized: true,
    
    startQuiz: function(videoId, title) {
        console.log(`Starting quiz for video: ${title} (${videoId})`);
        if (window.quizSystem) {
            window.quizSystem.startQuiz('video-specific', { videoId, title });
        }
    },
    
    markWatched: function(videoId, courseName) {
        fetch('/api/mark-watched', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId, courseName })
        })
        .then(res => res.json())
        .then(data => {
            console.log('Video marked as watched');
            // Dispatch event for other components
            document.dispatchEvent(new CustomEvent('videoWatched', { detail: { videoId } }));
        });
    }
};

console.log('✅ Video Quiz Functions Initialized');
