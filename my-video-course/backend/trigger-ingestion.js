const videoUploadProcessor = require('./src/services/videoUploadProcessor');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

async function triggerIngestion() {
    const bucketName = 'video-course-app-video-bucket-prod-6m5k2til';
    const courseName = 'DEVOPS BootCamp  By Tech World With NANA';
    
    const videos = [
        {
            title: 'Install Terraform & Setup Terraform Project',
            key: 'videos/devops_bootcamp_by_tech_world_with_nana/1774808444323-install_terraform_setup_terraform_project.mp4'
        },
        {
            title: 'Providers in Terraform',
            key: 'videos/devops_bootcamp_by_tech_world_with_nana/1774808488525-providers_in_terraform.mp4'
        }
    ];

    console.log(`🚀 Triggering AI Ingestion for ${videos.length} videos...`);

    for (const video of videos) {
        console.log(`📡 Processing: ${video.title}`);
        try {
            const result = await videoUploadProcessor.processUploadedVideo(
                bucketName, 
                video.key, 
                video.title, 
                courseName
            );
            if (result.success) {
                console.log(`✅ Job Submitted: ${result.jobName}`);
            } else {
                console.error(`❌ Failed: ${result.error}`);
            }
        } catch (err) {
            console.error(`❌ Error triggering ${video.title}:`, err.message);
        }
    }
}

triggerIngestion();
