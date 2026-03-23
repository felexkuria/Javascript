const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const Enrollment = require('./src/models/Enrollment');
const Course = require('./src/models/Course');

async function checkEnrollments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'multitouchkenya@gmail.com';
    const enrollments = await Enrollment.find({ userId: email }).populate('courseId');
    console.log(`Enrollments for ${email}: ${enrollments.length}`);
    
    enrollments.forEach(e => {
      console.log(`- Course: ${e.courseId ? e.courseId.title : 'MISSING COURSE'} (ID: ${e.courseId ? e.courseId._id : 'N/A'})`);
    });

    const courses = await Course.find({ isPublished: true });
    console.log(`Published Courses: ${courses.length}`);
    courses.forEach(c => console.log(`- ${c.title} (ID: ${c._id})`));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkEnrollments();
