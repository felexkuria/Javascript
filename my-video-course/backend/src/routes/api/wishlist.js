const express = require('express');
const router = express.Router();
const dynamodb = require('../../utils/dynamodb');
const dynamoVideoService = require('../../services/dynamoVideoService');

// Add a course to wishlist
router.post('/add', async (req, res) => {
  try {
    const { courseId } = req.body; // courseId is likely courseName
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    // Verify course exists in DynamoDB
    const course = await dynamoVideoService.getCourseByTitle(courseId, userEmail);

    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const user = await dynamodb.getUser(userEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const wishlist = user.wishlist || [];
    const courseName = course.name || course.title;

    if (wishlist.includes(courseName)) {
      return res.json({ success: true, message: 'Course already in wishlist' });
    }

    wishlist.push(courseName);
    user.wishlist = wishlist;
    await dynamodb.saveUser(user);

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    console.error('Wishlist add error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove from wishlist
router.post('/remove', async (req, res) => {
  try {
    const { courseId } = req.body;
    const userEmail = req.user?.email;

    const user = await dynamodb.getUser(userEmail);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.wishlist = (user.wishlist || []).filter(name => name !== courseId);
    await dynamodb.saveUser(user);

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get wishlist items
router.get('/', async (req, res) => {
  try {
    const userEmail = req.user?.email;
    const user = await dynamodb.getUser(userEmail);
    const wishlistNames = user?.wishlist || [];
    
    // Fetch full course details for each item in wishlist
    const allCourses = await dynamoVideoService.getAllCourses(userEmail);
    const wishlistItems = allCourses.filter(c => wishlistNames.includes(c.name));
    
    res.json({ success: true, wishlist: wishlistItems });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
