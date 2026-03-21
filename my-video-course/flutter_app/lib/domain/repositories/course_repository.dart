import '../../data/models/course_models.dart';

abstract class CourseRepository {
  Future<List<CourseModel>> getCourses();
  Future<CourseModel> getCourse(String name);
  Future<List<VideoModel>> getCourseVideos(String courseName);
}