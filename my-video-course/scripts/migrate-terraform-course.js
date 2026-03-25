const fs = require('fs');
const path = require('path');
const db = require('../backend/src/utils/dynamodb');

async function migrateCourse(courseName) {
    // db is already initialized as a singleton
    // Wait a bit for initialization if needed, but it's sync
    if (!db.isConnected) {
        console.error('DynamoDB not connected. Check .env and system clock.');
        return;
    }

    const localStoragePath = path.join(__dirname, '../backend/src/data/localStorage.json');
    if (!fs.existsSync(localStoragePath)) {
        console.error('localStorage.json not found at:', localStoragePath);
        return;
    }

    const videoCourseDB = JSON.parse(fs.readFileSync(localStoragePath, 'utf8'));
    const videos = videoCourseDB[courseName];

    if (!videos) {
        console.error(`Course "${courseName}" not found in localStorage.json`);
        return;
    }

    console.log(`Found ${videos.length} videos for course: ${courseName}`);

    const courseData = {
        name: courseName,
        title: courseName.replace(/[\\[\\]]/g, '').replace(/TutsNode\.com - /g, ''),
        description: 'Master HashiCorp Terraform with hands-on Infrastructure as Code practices.',
        category: 'Infrastructure',
        level: 'intermediate',
        totalVideos: videos.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: [] // We'll group them by folder structure if possible
    };

    // Group videos into sections based on folder path
    const sectionsMap = {};
    const formattedVideos = videos.map((v, index) => {
        const url = v.videoUrl || '';
        const parts = url.split('/');
        const sectionName = parts.length > 2 ? parts[parts.length - 2] : 'General';
        
        if (!sectionsMap[sectionName]) {
            sectionsMap[sectionName] = {
                id: `section-${Object.keys(sectionsMap).length + 1}`,
                title: sectionName,
                order: Object.keys(sectionsMap).length + 1,
                lectures: []
            };
        }

        const lecture = {
            id: `lecture-${index + 1}`,
            title: v.title || path.basename(url, '.mp4'),
            videoUrl: url,
            thumbnailUrl: v.thumbnailUrl,
            duration: v.duration || '0:00',
            order: sectionsMap[sectionName].lectures.length + 1,
            type: 'video'
        };

        sectionsMap[sectionName].lectures.push(lecture);
        
        return {
            ...v,
            courseName: courseName,
            videoId: lecture.id,
            sectionTitle: sectionName,
            order: lecture.order
        };
    });

    courseData.sections = Object.values(sectionsMap);

    // Migration function
    async function performMigration(env) {
        console.log(`\n--- Migrating to ${env.toUpperCase()} ---`);
        process.env.NODE_ENV = env;
        
        // Save course
        console.log(`Saving course metadata to video-course-app-courses-${env}...`);
        const courseSaved = await db.saveCourse(courseData);
        if (courseSaved) {
            console.log('✅ Course metadata saved.');
        } else {
            console.error('❌ Failed to save course metadata.');
        }

        // Save videos
        console.log(`Saving ${formattedVideos.length} videos to video-course-app-videos-${env}...`);
        let savedCount = 0;
        for (const video of formattedVideos) {
            const videoSaved = await db.saveVideo(video);
            if (videoSaved) savedCount++;
        }
        console.log(`✅ Saved ${savedCount}/${formattedVideos.length} videos.`);
    }

    // Run for both dev and prod
    await performMigration('dev');
    await performMigration('production'); // "production" maps to "prod" in dynamodb.js

    console.log('\nMigration complete!');
}

const targetCourse = "HashiCorp Certified Terraform Associate - Hands-On Labs";
migrateCourse(targetCourse).catch(console.error);
