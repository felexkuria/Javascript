// Missing video quiz functions
window.startVideoQuiz = async function() {
    try {
        const videoId = document.querySelector('[data-video-id]')?.dataset.videoId || 
                       window.location.pathname.split('/').pop();
        
        const response = await fetch(`/api/quizzes/${videoId}`);
        const data = await response.json();
        
        if (data.success && data.quiz && window.quizSystem) {
            window.quizSystem.startQuiz('video-specific', data.quiz);
        } else if (window.quizSystem) {
            // Fallback to default quiz
            window.quizSystem.startQuiz('terraform');
        } else {
            console.log('Quiz system not available');
        }
    } catch (error) {
        console.error('Error loading quiz:', error);
        if (window.quizSystem) {
            window.quizSystem.startQuiz('terraform');
        }
    }
};