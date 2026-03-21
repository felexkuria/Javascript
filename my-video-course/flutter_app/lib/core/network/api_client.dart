import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';
import 'package:json_annotation/json_annotation.dart';
import '../../data/models/auth_models.dart';
import '../../data/models/course_models.dart';

part 'api_client.g.dart';

@RestApi()
abstract class ApiClient {
  factory ApiClient(Dio dio, {String baseUrl}) = _ApiClient;

  // Auth endpoints
  @POST('/api/auth/signin')
  Future<AuthResponse> signIn(@Body() SignInRequest request);

  @POST('/api/auth/signup')
  Future<AuthResponse> signUp(@Body() SignUpRequest request);

  @GET('/api/auth/me')
  Future<UserModel> getCurrentUser();

  // Course endpoints
  @GET('/api/courses')
  Future<List<CourseModel>> getCourses();

  @GET('/api/courses/{name}')
  Future<CourseModel> getCourse(@Path('name') String name);

  @GET('/api/videos/course/{courseName}')
  Future<List<VideoModel>> getCourseVideos(@Path('courseName') String courseName);

  @GET('/api/videos/{courseName}/{videoId}')
  Future<VideoModel> getVideo(@Path('courseName') String courseName, @Path('videoId') String videoId);

  @POST('/api/videos/{courseName}/{videoId}/watch')
  Future<void> markVideoWatched(@Path('courseName') String courseName, @Path('videoId') String videoId);

  // Gamification endpoints
  @GET('/api/gamification/stats')
  Future<GamificationStats> getGamificationStats();

  @POST('/api/gamification/sync')
  Future<void> syncGamification(@Body() GamificationData data);

  // AI endpoints
  @POST('/api/ai/chat')
  Future<AiChatResponse> sendChatMessage(@Body() AiChatRequest request);

  @GET('/api/learning/todo/{courseName}/{videoId}')
  Future<TodoResponse> getVideoTodos(@Path('courseName') String courseName, @Path('videoId') String videoId);
}