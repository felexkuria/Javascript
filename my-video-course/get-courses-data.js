const fs = require('fs');
const path = require('path');

/**
 * Get courses data from videoCourseDB (localStorage.json)
 * This function reads the localStorage.json file and formats it for MongoDB migration
 */
function getCoursesFromVideoCourseDB() {
  try {
    // Path to localStorage.json (videoCourseDB)
    const localStoragePath = path.join(__dirname, 'data/localStorage.json');
    
    if (!fs.existsSync(localStoragePath)) {
      console.error('localStorage.json not found at:', localStoragePath);
      return [];
    }

    // Read and parse the JSON data
    const rawData = fs.readFileSync(localStoragePath, 'utf8');
    const videoCourseDB = JSON.parse(rawData);
    
    console.log(`Found ${Object.keys(videoCourseDB).length} courses in videoCourseDB`);
    
    // Transform data into course format suitable for MongoDB
    const courses = Object.keys(videoCourseDB).map(courseName => {
      const videos = videoCourseDB[courseName] || [];
      const watchedVideos = videos.filter(v => v && v.watched).length;
      
      return {
        name: courseName,
        title: courseName.replace(/[\\[\\]]/g, '').replace(/TutsNode\\.com - /g, ''),
        description: generateCourseDescription(courseName),
        category: getCourseCategory(courseName),
        level: 'intermediate',
        totalVideos: videos.length,
        watchedVideos: watchedVideos,
        completionPercentage: videos.length > 0 ? Math.round((watchedVideos / videos.length) * 100) : 0,
        videos: videos,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    
    return courses;
    
  } catch (error) {
    console.error('Error reading videoCourseDB:', error);
    return [];
  }
}

/**
 * Generate course description based on course name
 */
function generateCourseDescription(courseName) {
  const name = courseName.toLowerCase();
  
  if (name.includes('terraform')) {
    return 'Master HashiCorp Terraform with hands-on Infrastructure as Code practices.';
  } else if (name.includes('aws')) {
    return 'Comprehensive AWS cloud computing course covering core services and architecture.';
  } else if (name.includes('devops')) {
    return 'Complete DevOps bootcamp covering CI/CD, containerization, and automation.';
  } else if (name.includes('davinci') || name.includes('video editing')) {
    return 'Professional video editing course using DaVinci Resolve.';
  } else {
    return `Learn ${courseName} through comprehensive lessons and practical exercises.`;
  }
}

/**
 * Determine course category based on course name
 */
function getCourseCategory(courseName) {
  const name = courseName.toLowerCase();
  
  if (name.includes('aws') || name.includes('cloud')) {
    return 'Cloud Computing';
  } else if (name.includes('devops')) {
    return 'DevOps';
  } else if (name.includes('terraform')) {
    return 'Infrastructure';
  } else if (name.includes('davinci') || name.includes('video')) {
    return 'Video Editing';
  } else {
    return 'Programming';
  }
}

/**
 * Get specific course data by name
 */
function getCourseByName(courseName) {
  const courses = getCoursesFromVideoCourseDB();
  return courses.find(course => course.name === courseName);
}

/**
 * Get course statistics
 */
function getCourseStats() {
  const courses = getCoursesFromVideoCourseDB();
  
  const stats = {
    totalCourses: courses.length,
    totalVideos: courses.reduce((sum, course) => sum + course.totalVideos, 0),
    totalWatchedVideos: courses.reduce((sum, course) => sum + course.watchedVideos, 0),
    averageCompletion: courses.length > 0 ? 
      Math.round(courses.reduce((sum, course) => sum + course.completionPercentage, 0) / courses.length) : 0,
    categories: [...new Set(courses.map(c => c.category))]
  };
  
  return stats;
}

// Test the functions
if (require.main === module) {
  console.log('=== Testing videoCourseDB Data Access ===\\n');
  
  // Get all courses
  const courses = getCoursesFromVideoCourseDB();
  console.log(`Total courses: ${courses.length}\\n`);
  
  // Show first course as example
  if (courses.length > 0) {
    console.log('First course example:');
    console.log(JSON.stringify(courses[0], null, 2));
    console.log('\\n');
  }
  
  // Show statistics
  const stats = getCourseStats();
  console.log('Course Statistics:');
  console.log(JSON.stringify(stats, null, 2));
}

module.exports = {
  getCoursesFromVideoCourseDB,
  getCourseByName,
  getCourseStats,
  generateCourseDescription,
  getCourseCategory
};